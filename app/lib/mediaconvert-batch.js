import { 
  MediaConvertClient, 
  CreateJobCommand,
  GetJobCommand
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

// Constants
const MAX_INPUTS_PER_JOB = 149; // Leave 1 slot for safety margin
const BATCH_POLL_INTERVAL = 5000; // 5 seconds
const MAX_BATCH_WAIT_TIME = 600000; // 10 minutes max wait per batch

/**
 * Create batched MediaConvert jobs for unlimited-length recordings
 * @param {string} meetingId - Meeting ID
 * @param {string} invokingUserEmail - Email of user invoking the process
 * @returns {Promise<Object>} Job information
 */
export async function createBatchedMediaConvertJobs(meetingId, invokingUserEmail) {
  const config = getConfig();
  const startTime = Date.now();
  const correlationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    console.info(`[BatchMediaConvert] Starting batched job creation for meeting=${meetingId}, correlation=${correlationId}`);

    // Fetch meeting data and validate
    const meetingData = await getMeeting(meetingId);
    if (!meetingData) {
      throw new Error('Meeting not found');
    }

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
    const batchOutputPrefix = `${recording.s3Prefix}/batch-parts/`;
    const finalOutputPrefix = `${recording.s3Prefix}/final-video/`;

    console.info(`[BatchMediaConvert] S3 paths: bucket=${bucket}, inputPrefix=${inputPrefix}`);

    // Wait for S3 clips to stabilize
    const stabilityChecker = createStabilityChecker({ s3Client, config });
    let stabilityResult;
    
    try {
      stabilityResult = await stabilityChecker.waitForStability(bucket, inputPrefix);
      console.info(`[BatchMediaConvert] S3 clips stabilized: ${stabilityResult.clips.length} clips in ${stabilityResult.metrics.duration}ms`);
    } catch (error) {
      if (error instanceof S3StabilityError) {
        console.error(`[BatchMediaConvert] S3 stability check failed: ${error.message}`, error.details);
      }
      throw error;
    }

    const allClips = stabilityResult.clips;
    if (!allClips || allClips.length === 0) {
      throw new Error('No video clips found to process after stability check');
    }

    const totalClips = allClips.length;
    console.info(`[BatchMediaConvert] Total clips: ${totalClips}`);

    // Get MediaConvert endpoint
    const endpoint = await _getMediaConvertEndpoint(config);
    const mediaConvertClient = new MediaConvertClient({ 
      ...getAWSConfig(),
      endpoint 
    });

    // Check if we need batching
    if (totalClips <= MAX_INPUTS_PER_JOB) {
      console.info(`[BatchMediaConvert] Clips (${totalClips}) within single job limit. Using direct processing.`);
      return await _createSingleJob(
        mediaConvertClient,
        allClips,
        bucket,
        finalOutputPrefix,
        config,
        meetingId,
        meetingData,
        recording,
        correlationId
      );
    }

    // Split clips into batches
    const batches = _splitIntoBatches(allClips, MAX_INPUTS_PER_JOB);
    console.info(`[BatchMediaConvert] Split ${totalClips} clips into ${batches.length} batches`);

    // Update meeting with batch processing status
    await updateMeetingHost(meetingId, {
      ...meetingData.host,
      recording: {
        ...recording,
        processingStatus: 'BATCH_PROCESSING',
        totalBatches: batches.length,
        completedBatches: 0,
        processStartedAt: new Date().toISOString(),
        correlationId,
      }
    });

    // Process batches in parallel (Stage 1)
    const batchJobIds = await _processBatches(
      mediaConvertClient,
      batches,
      bucket,
      batchOutputPrefix,
      config,
      meetingId,
      correlationId
    );

    console.info(`[BatchMediaConvert] All ${batchJobIds.length} batch jobs submitted`);

    // Wait for all batch jobs to complete (Stage 2)
    const batchOutputs = await _waitForBatchCompletion(
      mediaConvertClient,
      batchJobIds,
      bucket,
      batchOutputPrefix,
      meetingId,
      meetingData
    );

    console.info(`[BatchMediaConvert] All batch jobs completed. ${batchOutputs.length} outputs ready for merge`);

    // Create final merge job (Stage 3)
    const finalJobResult = await _createMergeJob(
      mediaConvertClient,
      batchOutputs,
      bucket,
      finalOutputPrefix,
      config,
      meetingId,
      meetingData,
      recording,
      correlationId
    );

    const duration = Date.now() - startTime;
    console.info(`[BatchMediaConvert] Batch processing completed: finalJobId=${finalJobResult.jobId}, duration=${duration}ms, totalClips=${totalClips}, batches=${batches.length}`);

    return {
      jobId: finalJobResult.jobId,
      outputKey: finalJobResult.outputKey,
      clipsCount: totalClips,
      batchCount: batches.length,
      batchJobIds,
      correlationId,
      processingMode: 'BATCHED',
      rawJob: finalJobResult.rawJob
    };

  } catch (error) {
    console.error(`[BatchMediaConvert] Job creation failed for meeting=${meetingId}: ${error.message}`);
    
    // Update meeting with error status
    try {
      const meetingData = await getMeeting(meetingId);
      if (meetingData) {
        await updateMeetingHost(meetingId, {
          ...meetingData.host,
          recording: {
            ...meetingData.host.recording,
            processingStatus: 'ERROR',
            processingError: error.message,
            processCompletedAt: new Date().toISOString()
          }
        });
      }
    } catch (updateErr) {
      console.error(`[BatchMediaConvert] Failed to update error status: ${updateErr.message}`);
    }
    
    throw error;
  }
}

/**
 * Create a single MediaConvert job (for recordings <= 149 clips)
 * @private
 */
async function _createSingleJob(mediaConvertClient, clips, bucket, outputPrefix, config, meetingId, meetingData, recording, correlationId) {
  const jobParams = _buildMediaConvertJobParams(clips, bucket, outputPrefix, config);
  
  const createJobCommand = new CreateJobCommand(jobParams);
  const jobResponse = await mediaConvertClient.send(createJobCommand);
  
  const jobId = jobResponse.Job?.Id;
  const outputKey = `${outputPrefix}index.m3u8`;

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
      processingMode: 'SINGLE'
    }
  });

  return {
    jobId,
    outputKey,
    clipsCount: clips.length,
    correlationId,
    processingMode: 'SINGLE',
    rawJob: {
      id: jobResponse.Job?.Id,
      arn: jobResponse.Job?.Arn,
      status: jobResponse.Job?.Status,
    }
  };
}

/**
 * Split clips into batches
 * @private
 */
function _splitIntoBatches(clips, batchSize) {
  const batches = [];
  for (let i = 0; i < clips.length; i += batchSize) {
    batches.push(clips.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Process all batches in parallel
 * @private
 */
async function _processBatches(mediaConvertClient, batches, bucket, outputPrefix, config, meetingId, correlationId) {
  const batchJobIds = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchNum = i + 1;
    const batchOutputKey = `${outputPrefix}part-${String(batchNum).padStart(3, '0')}.mp4`;
    
    console.info(`[BatchMediaConvert] Submitting batch ${batchNum}/${batches.length}: ${batch.length} clips`);

    const jobParams = _buildBatchJobParams(batch, bucket, batchOutputKey, config, batchNum);
    const createJobCommand = new CreateJobCommand(jobParams);
    
    try {
      const jobResponse = await mediaConvertClient.send(createJobCommand);
      const jobId = jobResponse.Job?.Id;
      
      batchJobIds.push({
        jobId,
        batchNum,
        outputKey: batchOutputKey,
        clipsCount: batch.length
      });
      
      console.info(`[BatchMediaConvert] Batch ${batchNum} submitted: jobId=${jobId}`);
    } catch (err) {
      console.error(`[BatchMediaConvert] Failed to submit batch ${batchNum}: ${err.message}`);
      throw new Error(`Batch ${batchNum} submission failed: ${err.message}`);
    }
  }

  return batchJobIds;
}

/**
 * Wait for all batch jobs to complete
 * @private
 */
async function _waitForBatchCompletion(mediaConvertClient, batchJobIds, bucket, outputPrefix, meetingId, meetingData) {
  const startTime = Date.now();
  const completedBatches = [];
  const pendingJobs = [...batchJobIds];

  console.info(`[BatchMediaConvert] Waiting for ${pendingJobs.length} batch jobs to complete...`);

  while (pendingJobs.length > 0) {
    if (Date.now() - startTime > MAX_BATCH_WAIT_TIME) {
      throw new Error(`Batch processing timeout after ${MAX_BATCH_WAIT_TIME}ms`);
    }

    // Check status of all pending jobs
    const statusChecks = pendingJobs.map(async (job) => {
      try {
        const getJobCommand = new GetJobCommand({ Id: job.jobId });
        const jobResponse = await mediaConvertClient.send(getJobCommand);
        const status = jobResponse.Job?.Status;
        const progress = jobResponse.Job?.JobPercentComplete || 0;

        console.info(`[BatchMediaConvert] Batch ${job.batchNum}: ${status} (${progress}%)`);

        return { ...job, status, progress, response: jobResponse };
      } catch (err) {
        console.error(`[BatchMediaConvert] Failed to check batch ${job.batchNum}: ${err.message}`);
        return { ...job, status: 'ERROR', error: err.message };
      }
    });

    const results = await Promise.all(statusChecks);

    // Update meeting progress
    const completed = results.filter(r => r.status === 'COMPLETE').length;
    await updateMeetingHost(meetingId, {
      ...meetingData.host,
      recording: {
        ...meetingData.host.recording,
        completedBatches: completed,
        processingStatus: 'BATCH_PROCESSING'
      }
    });

    // Process completed and failed jobs
    for (let i = pendingJobs.length - 1; i >= 0; i--) {
      const result = results.find(r => r.jobId === pendingJobs[i].jobId);
      
      if (result.status === 'COMPLETE') {
        completedBatches.push({
          batchNum: result.batchNum,
          outputKey: result.outputKey,
          jobId: result.jobId
        });
        pendingJobs.splice(i, 1);
        console.info(`[BatchMediaConvert] Batch ${result.batchNum} completed`);
      } else if (result.status === 'ERROR' || result.status === 'CANCELED') {
        throw new Error(`Batch ${result.batchNum} failed with status: ${result.status}`);
      }
    }

    if (pendingJobs.length > 0) {
      console.info(`[BatchMediaConvert] ${pendingJobs.length} batches still processing...`);
      await new Promise(resolve => setTimeout(resolve, BATCH_POLL_INTERVAL));
    }
  }

  // Sort by batch number
  completedBatches.sort((a, b) => a.batchNum - b.batchNum);

  console.info(`[BatchMediaConvert] All batches completed in ${Date.now() - startTime}ms`);
  return completedBatches;
}

/**
 * Create final merge job
 * @private
 */
async function _createMergeJob(mediaConvertClient, batchOutputs, bucket, outputPrefix, config, meetingId, meetingData, recording, correlationId) {
  console.info(`[BatchMediaConvert] Creating final merge job with ${batchOutputs.length} parts`);

  // Build inputs from batch outputs
  const inputs = batchOutputs.map(batch => ({
    FileInput: `s3://${bucket}/${batch.outputKey}`,
    AudioSelectors: {
      "Audio Selector 1": { DefaultSelection: "DEFAULT" }
    },
    VideoSelector: {},
    TimecodeSource: "ZEROBASED"
  }));

  const jobParams = _buildMergeJobParams(inputs, bucket, outputPrefix, config);
  
  const createJobCommand = new CreateJobCommand(jobParams);
  const jobResponse = await mediaConvertClient.send(createJobCommand);
  
  const jobId = jobResponse.Job?.Id;
  const outputKey = `${outputPrefix}index.m3u8`;

  await updateMeetingHost(meetingId, {
    ...meetingData.host,
    recording: {
      ...recording,
      mediaConvertJobId: jobId,
      mediaConvertStatus: "SUBMITTED",
      finalVideoKey: outputKey,
      processingStatus: 'FINAL_MERGE',
      correlationId
    }
  });

  console.info(`[BatchMediaConvert] Final merge job submitted: ${jobId}`);

  return {
    jobId,
    outputKey,
    rawJob: {
      id: jobResponse.Job?.Id,
      arn: jobResponse.Job?.Arn,
      status: jobResponse.Job?.Status,
    }
  };
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
        console.info(`[BatchMediaConvert] Discovered endpoint: ${endpoint}`);
      }
    } catch (epErr) {
      console.debug(`[BatchMediaConvert] Could not discover endpoint: ${epErr.message}`);
    }
  }

  return endpoint || `https://mediaconvert.${config.aws.region}.amazonaws.com`;
}

/**
 * Build job parameters for a batch
 * @private
 */
function _buildBatchJobParams(clips, bucket, outputKey, config, batchNum) {
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
          Name: `Batch ${batchNum} MP4`,
          OutputGroupSettings: {
            Type: "FILE_GROUP_SETTINGS",
            FileGroupSettings: {
              Destination: `s3://${bucket}/${outputKey.replace('.mp4', '')}`
            }
          },
          Outputs: [
            {
              ContainerSettings: {
                Container: "MP4",
                Mp4Settings: {
                  CslgAtom: "INCLUDE",
                  FreeSpaceBox: "EXCLUDE",
                  MoovPlacement: "PROGRESSIVE_DOWNLOAD"
                }
              },
              VideoDescription: {
                CodecSettings: {
                  Codec: "H_264",
                  H264Settings: {
                    MaxBitrate: 5000000,
                    RateControlMode: "QVBR",
                    CodecProfile: "HIGH",
                    CodecLevel: "AUTO"
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
                      SampleRate: 48000
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
}

/**
 * Build job parameters for final merge
 * @private
 */
function _buildMergeJobParams(inputs, bucket, outputPrefix, config) {
  const { mediaConvert } = config;

  return {
    Role: config.aws.mediaConvert.role,
    Settings: {
      Inputs: inputs,
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
              OutputSelection: "MANIFESTS_AND_SEGMENTS",
            }
          },
          Outputs: [
            {
              NameModifier: "_720p",
              ContainerSettings: {
                Container: "M3U8"
              },
              VideoDescription: {
                CodecSettings: {
                  Codec: "H_264",
                  H264Settings: {
                    MaxBitrate: mediaConvert.maxBitrate,
                    RateControlMode: "QVBR",
                    CodecProfile: "HIGH",
                    CodecLevel: "LEVEL_4_1"
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
                      SampleRate: mediaConvert.audioSampleRate
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

/**
 * Build standard job parameters (for compatibility)
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
              OutputSelection: "MANIFESTS_AND_SEGMENTS",
            }
          },
          Outputs: [
            {
              NameModifier: "_720p",
              ContainerSettings: {
                Container: "M3U8"
              },
              VideoDescription: {
                CodecSettings: {
                  Codec: "H_264",
                  H264Settings: {
                    MaxBitrate: mediaConvert.maxBitrate,
                    RateControlMode: "QVBR",
                    CodecProfile: "HIGH",
                    CodecLevel: "LEVEL_4_1"
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
                      SampleRate: mediaConvert.audioSampleRate
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
