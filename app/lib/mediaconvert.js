import { 
  MediaConvertClient, 
  CreateJobCommand,
  GetJobCommand,
  DescribeEndpointsCommand
} from "@aws-sdk/client-mediaconvert";
import { S3Client } from "@aws-sdk/client-s3";
import { getMeeting, updateMeetingHost } from './meetingStorage.js';
import { getConfig } from './recording/config.js';
import { createStabilityChecker, S3StabilityError } from './recording/s3StabilityChecker.js';

// Create AWS clients with credentials
const getAWSConfig = () => {
  const config = {
    region: process.env.CHIME_REGION || 'us-east-1'
  };

  const accessKeyId = process.env.CHIME_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CHIME_SECRET_ACCESS_KEY;
  
  if (accessKeyId && secretAccessKey) {
    config.credentials = {
      accessKeyId,
      secretAccessKey
    };
  }

  return config;
};

const s3Client = new S3Client(getAWSConfig());

// Generate simple correlation ID
function generateCorrelationId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export async function createMediaConvertJobForMeeting(meetingId, invokingUserEmail) {
  const correlationId = generateCorrelationId();
  const config = getConfig();
  const startTime = Date.now();

  try {
    // Validate inputs
    if (!meetingId) {
      throw new Error('meetingId is required');
    }

    console.info(`[MediaConvert] Starting job creation for meeting=${meetingId}, correlation=${correlationId}`);

    // Fetch meeting data
    const meetingData = await getMeeting(meetingId);
    if (!meetingData) {
      throw new Error('Meeting not found');
    }

    // Verify authorization
    if (meetingData.host?.email !== invokingUserEmail) {
      throw new Error('Only the meeting host can process recordings');
    }

    const recording = meetingData.host?.recording;
    if (!recording) {
      throw new Error('No recording found for this meeting');
    }

    // Prepare S3 paths
    const bucket = recording.s3Bucket;
    const basePrefix = recording.s3Prefix.replace(/\/+$/g, '');
    const inputPrefix = basePrefix.endsWith('/composited-video')
      ? `${basePrefix}/`
      : `${basePrefix}/composited-video/`;
    const outputPrefix = `${recording.s3Prefix}/final-video/`;

    console.info(`[MediaConvert] S3 paths: bucket=${bucket}, inputPrefix=${inputPrefix}`);

    // Wait for S3 clips to stabilize
    const stabilityChecker = createStabilityChecker({ s3Client, config });

    let stabilityResult;
    try {
      stabilityResult = await stabilityChecker.waitForStability(bucket, inputPrefix);
      console.info(`[MediaConvert] S3 clips stabilized: ${stabilityResult.clips.length} clips in ${stabilityResult.metrics.duration}ms`);
    } catch (error) {
      if (error instanceof S3StabilityError) {
        console.error(`[MediaConvert] S3 stability check failed: ${error.message}`, error.details);
      }
      throw error;
    }

    const clips = stabilityResult.clips;

    if (!clips || clips.length === 0) {
      throw new Error('No video clips found to process after stability check');
    }

    // Get or discover MediaConvert endpoint
    let endpoint = await _getMediaConvertEndpoint(config);

    // Create MediaConvert client with credentials
    const mediaConvertClient = new MediaConvertClient({ 
      ...getAWSConfig(),
      endpoint 
    });

    // Build job parameters
    const jobParams = _buildMediaConvertJobParams(clips, bucket, outputPrefix, config);

    const clipKeys = clips.map(c => c.Key);
    console.info(`[MediaConvert] Submitting job: ${clips.length} clips, first=${clipKeys[0]?.split('/').pop()}, last=${clipKeys[clipKeys.length - 1]?.split('/').pop()}`);

    // Submit job
    const createJobCommand = new CreateJobCommand(jobParams);
    let jobResponse;
    
    try {
      jobResponse = await mediaConvertClient.send(createJobCommand);
    } catch (err) {
      console.error(`[MediaConvert] Job submission failed for meeting=${meetingId}: ${err.message}`);
      throw new Error(`MediaConvert createJob error: ${err.message}`);
    }

    const jobId = jobResponse.Job?.Id;
    const outputKey = `${outputPrefix}index.m3u8`;

    // Update meeting storage
    await updateMeetingHost(meetingId, {
      ...meetingData.host,
      recording: {
        ...recording,
        mediaConvertJobId: jobId,
        mediaConvertStatus: "SUBMITTED",
        finalVideoKey: outputKey,
        processStartedAt: new Date().toISOString(),
        clipsCount: clips.length,
        correlationId,
      }
    });

    const duration = Date.now() - startTime;
    console.info(`[MediaConvert] Job created successfully: jobId=${jobId}, duration=${duration}ms, clips=${clips.length}`);

    return {
      jobId,
      outputKey,
      clipsCount: clips.length,
      clips: clipKeys,
      correlationId,
      metrics: stabilityResult.metrics,
      rawJob: {
        id: jobResponse.Job?.Id,
        arn: jobResponse.Job?.Arn,
        status: jobResponse.Job?.Status,
      }
    };

  } catch (error) {
    console.error(`[MediaConvert] Job creation failed for meeting=${meetingId}: ${error.message}`);
    throw error;
  }
}

export async function getMediaConvertJobStatus(jobId) {
  const config = getConfig();

  if (!jobId) {
    throw new Error('jobId required');
  }

  try {
    const endpoint = await _getMediaConvertEndpoint(config);
    const mediaConvertClient = new MediaConvertClient({ 
      ...getAWSConfig(),
      endpoint 
    });
    
    const getJobCommand = new GetJobCommand({ Id: jobId });
    const jobResponse = await mediaConvertClient.send(getJobCommand);
    
    console.info(`[MediaConvert] Job status: jobId=${jobId}, status=${jobResponse.Job?.Status}, progress=${jobResponse.Job?.JobPercentComplete}%`);

    return jobResponse;
  } catch (error) {
    console.error(`[MediaConvert] Failed to get job status for jobId=${jobId}: ${error.message}`);
    throw error;
  }
}

/**
 * Get or discover MediaConvert endpoint
 * @private
 */
async function _getMediaConvertEndpoint(config) {
  let endpoint = config.aws.mediaConvert.endpoint;
  
  if (!endpoint) {
    try {
      const probeClient = new MediaConvertClient(getAWSConfig());
      const desc = await probeClient.send(new DescribeEndpointsCommand({}));
      endpoint = desc?.Endpoints?.[0]?.Url;
      
      if (endpoint) {
        console.info(`[MediaConvert] Discovered endpoint: ${endpoint}`);
      }
    } catch (epErr) {
      console.debug(`[MediaConvert] Could not discover endpoint: ${epErr.message}`);
    }
  }

  return endpoint || `https://mediaconvert.${config.aws.region}.amazonaws.com`;
}

/**
 * Build MediaConvert job parameters
 * @private
 */
function _buildMediaConvertJobParams(clips, bucket, outputPrefix, config) {
  const { mediaConvert } = config;

  return {
    Role: config.aws.mediaConvert.role,
    Settings: {
      Inputs: clips.map((clip) => ({
        AudioSelectors: {
          "Audio Selector 1": { DefaultSelection: "DEFAULT" }
        },
        VideoSelector: {},
        TimecodeSource: "ZEROBASED",
        FileInput: `s3://${bucket}/${clip.Key}`
      })),
      OutputGroups: [
        {
          Name: "HLS Group",
          OutputGroupSettings: {
            Type: "HLS_GROUP_SETTINGS",
            HlsGroupSettings: {
              Destination: `s3://${bucket}/${outputPrefix}`,
              SegmentLength: mediaConvert.hlsSegmentLength,
              MinSegmentLength: 0,
              ManifestDurationFormat: "INTEGER",
              SegmentControl: "SEGMENTED_FILES",
              ProgramDateTime: "EXCLUDE",
              TimedMetadataId3Period: 10,
              CodecSpecification: "RFC_4281",
              OutputSelection: "MANIFESTS_AND_SEGMENTS",
              ManifestCompression: "NONE",
              StreamInfResolution: "INCLUDE"
            }
          },
          Outputs: [
            {
              NameModifier: "_720p",
              ContainerSettings: {
                Container: "M3U8",
                M3u8Settings: {
                  AudioFramesPerPes: 4,
                  PcrControl: "PCR_EVERY_PES_PACKET",
                  PmtPid: 480,
                  PrivateMetadataPid: 503,
                  ProgramNumber: 1,
                  PatInterval: 0,
                  PmtInterval: 0,
                  Scte35Source: "NONE",
                  NielsenId3: "NONE",
                  TimedMetadata: "NONE",
                  VideoPid: 481,
                  AudioPids: [482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492]
                }
              },
              VideoDescription: {
                CodecSettings: {
                  Codec: "H_264",
                  H264Settings: {
                    MaxBitrate: mediaConvert.maxBitrate,
                    RateControlMode: "QVBR",
                    SceneChangeDetect: "TRANSITION_DETECTION",
                    QualityTuningLevel: "SINGLE_PASS_HQ",
                    CodecProfile: "HIGH",
                    CodecLevel: "LEVEL_4_1",
                    GopSize: 90,
                    GopSizeUnits: "FRAMES",
                    NumberBFramesBetweenReferenceFrames: 2,
                    Syntax: "DEFAULT"
                  }
                },
                Width: mediaConvert.videoWidth,
                Height: mediaConvert.videoHeight
              },
              AudioDescriptions: [
                {
                  CodecSettings: {
                    Codec: "AAC",
                    AacSettings: {
                      Bitrate: mediaConvert.audioBitrate,
                      CodingMode: "CODING_MODE_2_0",
                      SampleRate: mediaConvert.audioSampleRate,
                      CodecProfile: "LC",
                      RateControlMode: "CBR"
                    }
                  }
                }
              ]
            }
          ]
        }
      ]
    },
    AccelerationSettings: { Mode: mediaConvert.accelerationMode }
  };
}
