import { 
  MediaConvertClient, 
  CreateJobCommand,
  GetJobCommand 
} from "@aws-sdk/client-mediaconvert";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getMeeting, updateMeetingHost } from './meetingStorage.js';

const s3Client = new S3Client({ region: process.env.AWS_REGION });

/**
 * Create a MediaConvert job for the given meetingId. Validates that the invoking user is the meeting host.
 * Returns the created jobId and output key.
 */
export async function createMediaConvertJobForMeeting(meetingId, invokingUserEmail) {
  if (!meetingId) throw new Error('meetingId is required');

  const meetingData = await getMeeting(meetingId);
  if (!meetingData) throw new Error('Meeting not found');

  // Verify user is the host
  if (meetingData.host?.email !== invokingUserEmail) {
    throw new Error('Only the meeting host can process recordings');
  }

  const recording = meetingData.host?.recording;
  if (!recording) throw new Error('No recording found for this meeting');

  const bucket = recording.s3Bucket;
  const inputPrefix = `${recording.s3Prefix}/composited-video/`;
  const outputPrefix = `${recording.s3Prefix}/final-video/`;

  // List MP4 clips
  const listCommand = new ListObjectsV2Command({ Bucket: bucket, Prefix: inputPrefix });
  const listResponse = await s3Client.send(listCommand);

  if (!listResponse.Contents || listResponse.Contents.length === 0) {
    throw new Error('No video clips found to process');
  }

  const clips = listResponse.Contents
    .filter(obj => obj.Key.endsWith('.mp4'))
    .sort((a, b) => a.Key.localeCompare(b.Key));

  if (clips.length === 0) {
    throw new Error('No MP4 clips found');
  }

  const endpoint = process.env.AWS_MEDIACONVERT_ENDPOINT || 'https://mediaconvert.us-east-1.amazonaws.com';
  const mediaConvertClient = new MediaConvertClient({ region: process.env.AWS_REGION, endpoint });

  const jobParams = {
    Role: process.env.AWS_MEDIACONVERT_ROLE,
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
              SegmentLength: 10,
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
                    MaxBitrate: 5000000,
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
                Width: 1280,
                Height: 720
              },
              AudioDescriptions: [
                {
                  CodecSettings: {
                    Codec: "AAC",
                    AacSettings: {
                      Bitrate: 128000,
                      CodingMode: "CODING_MODE_2_0",
                      SampleRate: 48000,
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
    AccelerationSettings: { Mode: "DISABLED" }
  };

  // Log the list of clips for debugging (helpful when only one clip ends up in final output)
  const clipKeys = clips.map(c => c.Key);
  console.info(`Creating MediaConvert job for meeting=${meetingId} with ${clips.length} clips`, clipKeys.slice(0, 50));

  const createJobCommand = new CreateJobCommand(jobParams);
  let jobResponse;
  try {
    jobResponse = await mediaConvertClient.send(createJobCommand);
  } catch (err) {
    console.error(`MediaConvert create job failed for meeting=${meetingId}; clips=${clips.length}`, err);
    // Throw a clearer error so callers can include it in responses/logs
    const message = err?.message || JSON.stringify(err);
    throw new Error(`MediaConvert createJob error: ${message}`);
  }

  const jobId = jobResponse.Job?.Id;
  const outputKey = `${outputPrefix}index.m3u8`;

  // Update meeting data with MediaConvert job info
  await updateMeetingHost(meetingId, {
    ...meetingData.host,
    recording: {
      ...recording,
      mediaConvertJobId: jobId,
      mediaConvertStatus: "SUBMITTED",
      finalVideoKey: outputKey,
      processStartedAt: new Date().toISOString(),
      clipsCount: clips.length
    }
  });

  // Return a small job summary and the clip keys for diagnostics
  return {
    jobId,
    outputKey,
    clipsCount: clips.length,
    clips: clipKeys,
    rawJob: {
      id: jobResponse.Job?.Id,
      arn: jobResponse.Job?.Arn,
      status: jobResponse.Job?.Status
    }
  };
}

export async function getMediaConvertJobStatus(jobId) {
  if (!jobId) throw new Error('jobId required');
  const endpoint = process.env.AWS_MEDIACONVERT_ENDPOINT || 'https://mediaconvert.us-east-1.amazonaws.com';
  const mediaConvertClient = new MediaConvertClient({ region: process.env.AWS_REGION, endpoint });
  const getJobCommand = new GetJobCommand({ Id: jobId });
  const jobResponse = await mediaConvertClient.send(getJobCommand);
  return jobResponse;
}
