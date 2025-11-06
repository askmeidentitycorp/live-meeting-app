/**
 * Lambda Function: Recording Processor
 * 
 * This function handles the complete video processing workflow:
 * 1. Wait for S3 clips to stabilize
 * 2. Create batched MediaConvert jobs
 * 3. Update meeting status in MongoDB
 * 
 * Invoked asynchronously after recording stops.
 */

const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { MediaConvertClient, CreateJobCommand, GetJobCommand } = require("@aws-sdk/client-mediaconvert");
const { MongoClient } = require("mongodb");

// Environment variables
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB;
const AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION; // AWS_REGION is automatically provided by Lambda
const MEDIACONVERT_ENDPOINT = process.env.MEDIACONVERT_ENDPOINT;
const MEDIACONVERT_ROLE_ARN = process.env.MEDIACONVERT_ROLE_ARN;

// Clientsnpm install
let mongoClient = null;
let s3Client = null;
let mediaConvertClient = null;

// Initialize AWS clients
function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({ region: AWS_REGION });
  }
  return s3Client;
}

function getMediaConvertClient() {
  if (!mediaConvertClient) {
    mediaConvertClient = new MediaConvertClient({
      region: AWS_REGION,
      endpoint: MEDIACONVERT_ENDPOINT
    });
  }
  return mediaConvertClient;
}

// MongoDB connection
async function getMongoClient() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
  }
  return mongoClient;
}

async function getMeeting(meetingId) {
  const client = await getMongoClient();
  const db = client.db(MONGODB_DB);
  return await db.collection('meetings').findOne({ meetingId });
}

async function updateMeetingHost(meetingId, hostData) {
  const client = await getMongoClient();
  const db = client.db(MONGODB_DB);
  await db.collection('meetings').updateOne(
    { meetingId },
    { $set: { host: hostData } }
  );
}

// Wait for S3 clips to stabilize
async function waitForStableClips(bucket, prefix, maxWaitTime = 120000, checkInterval = 5000) {
  const startTime = Date.now();
  let previousCount = 0;
  let stableIterations = 0;
  const requiredStableIterations = 3;

  console.log(`[S3Stability] Waiting for clips to stabilize: s3://${bucket}/${prefix}`);

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const s3 = getS3Client();
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix
      });

      const response = await s3.send(command);
      const clips = (response.Contents || [])
        .filter(obj => obj.Key.endsWith('.mp4'))
        .sort((a, b) => a.Key.localeCompare(b.Key));

      const currentCount = clips.length;
      
      console.log(`[S3Stability] Found ${currentCount} clips (previous: ${previousCount})`);

      if (currentCount === 0) {
        console.log('[S3Stability] No clips yet, waiting...');
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        continue;
      }

      if (currentCount === previousCount) {
        stableIterations++;
        console.log(`[S3Stability] Clip count stable (${stableIterations}/${requiredStableIterations})`);
        
        if (stableIterations >= requiredStableIterations) {
          console.log(`[S3Stability] Clips stabilized: ${clips.length} clips found`);
          return clips;
        }
      } else {
        stableIterations = 0;
        console.log('[S3Stability] Clip count changed, resetting stability counter');
      }

      previousCount = currentCount;
      await new Promise(resolve => setTimeout(resolve, checkInterval));

    } catch (error) {
      console.error('[S3Stability] Error checking clips:', error);
      throw error;
    }
  }

  throw new Error(`Timeout waiting for clips to stabilize after ${maxWaitTime}ms`);
}

// Create MediaConvert job (with batching support for >150 clips)
async function createMediaConvertJob(meetingId, bucket, inputClips, outputPrefix) {
  const mediaConvert = getMediaConvertClient();
  const MAX_INPUTS_PER_JOB = 150; // MediaConvert limit

  // If clips exceed limit, batch them into multiple jobs
  if (inputClips.length > MAX_INPUTS_PER_JOB) {
    console.log(`[Lambda] Clips (${inputClips.length}) exceed limit. Creating ${Math.ceil(inputClips.length / MAX_INPUTS_PER_JOB)} batch jobs...`);
    
    const batchJobs = [];
    for (let i = 0; i < inputClips.length; i += MAX_INPUTS_PER_JOB) {
      const batchClips = inputClips.slice(i, i + MAX_INPUTS_PER_JOB);
      const batchNum = Math.floor(i / MAX_INPUTS_PER_JOB) + 1;
      
      console.log(`[Lambda] Creating batch ${batchNum} with ${batchClips.length} clips`);
      
      const inputs = batchClips.map(clip => ({
        FileInput: `s3://${bucket}/${clip.Key}`,
        AudioSelectors: {
          "Audio Selector 1": {
            DefaultSelection: "DEFAULT"
          }
        }
      }));

      const jobSettings = {
        Inputs: inputs,
        OutputGroups: [
          {
            Name: "File Group",
            OutputGroupSettings: {
              Type: "FILE_GROUP_SETTINGS",
              FileGroupSettings: {
                Destination: `s3://${bucket}/${outputPrefix}/batches/`
              }
            },
            Outputs: [
              {
                VideoDescription: {
                  CodecSettings: {
                    Codec: "H_264",
                    H264Settings: {
                      MaxBitrate: 5000000,
                      RateControlMode: "QVBR",
                      QualityTuningLevel: "SINGLE_PASS_HQ"
                    }
                  }
                },
                AudioDescriptions: [
                  {
                    AudioSourceName: "Audio Selector 1",
                    CodecSettings: {
                      Codec: "AAC",
                      AacSettings: {
                        Bitrate: 96000,
                        CodingMode: "CODING_MODE_2_0",
                        SampleRate: 48000
                      }
                    }
                  }
                ],
                ContainerSettings: {
                  Container: "MP4",
                  Mp4Settings: {}
                },
                NameModifier: `-${meetingId}-batch${batchNum}`
              }
            ]
          }
        ]
      };

      const command = new CreateJobCommand({
        Role: MEDIACONVERT_ROLE_ARN,
        Settings: jobSettings,
        UserMetadata: {
          meetingId: meetingId,
          batchNumber: batchNum.toString(),
          processedAt: new Date().toISOString()
        }
      });

      const response = await mediaConvert.send(command);
      batchJobs.push({
        jobId: response.Job.Id,
        batchNum: batchNum,
        clipCount: batchClips.length
      });
      
      console.log(`[Lambda] Batch ${batchNum} job created: ${response.Job.Id}`);
    }

    // Return first job ID (for tracking), but include all batch info
    return {
      jobId: batchJobs[0].jobId,
      outputKey: `${outputPrefix}/batches/${meetingId}-batch1.mp4`,
      clipsCount: inputClips.length,
      batchJobs: batchJobs,
      isBatched: true
    };
  }

  // Single job (< 150 clips)
  const inputs = inputClips.map(clip => ({
    FileInput: `s3://${bucket}/${clip.Key}`,
    AudioSelectors: {
      "Audio Selector 1": {
        DefaultSelection: "DEFAULT"
      }
    }
  }));

  const outputKey = `${outputPrefix}/${meetingId}-final.mp4`;

  const jobSettings = {
    Inputs: inputs,
    OutputGroups: [
      {
        Name: "File Group",
        OutputGroupSettings: {
          Type: "FILE_GROUP_SETTINGS",
          FileGroupSettings: {
            Destination: `s3://${bucket}/${outputPrefix}/`
          }
        },
        Outputs: [
          {
            VideoDescription: {
              CodecSettings: {
                Codec: "H_264",
                H264Settings: {
                  MaxBitrate: 5000000,
                  RateControlMode: "QVBR",
                  QualityTuningLevel: "SINGLE_PASS_HQ"
                }
              }
            },
            AudioDescriptions: [
              {
                AudioSourceName: "Audio Selector 1",
                CodecSettings: {
                  Codec: "AAC",
                  AacSettings: {
                    Bitrate: 96000,
                    CodingMode: "CODING_MODE_2_0",
                    SampleRate: 48000
                  }
                }
              }
            ],
            ContainerSettings: {
              Container: "MP4",
              Mp4Settings: {}
            },
            NameModifier: `-${meetingId}-final`
          }
        ]
      }
    ]
  };

  const command = new CreateJobCommand({
    Role: MEDIACONVERT_ROLE_ARN,
    Settings: jobSettings,
    UserMetadata: {
      meetingId: meetingId,
      processedAt: new Date().toISOString()
    }
  });

  const response = await mediaConvert.send(command);
  return {
    jobId: response.Job.Id,
    outputKey: outputKey,
    clipsCount: inputClips.length
  };
}

// Wait for batch jobs to complete and create final merge job
async function waitForBatchesAndMerge(meetingId, bucket, batchJobs, outputPrefix) {
  const mediaConvert = getMediaConvertClient();
  console.log(`[Lambda] Waiting for ${batchJobs.length} batch jobs to complete...`);

  const MAX_WAIT_TIME = 240000; // 4 minutes (Lambda has 5 min timeout)
  const CHECK_INTERVAL = 10000; // 10 seconds
  const startTime = Date.now();

  // Poll batch jobs until all complete
  while (Date.now() - startTime < MAX_WAIT_TIME) {
    const jobStatuses = await Promise.all(
      batchJobs.map(async (batch) => {
        try {
          const command = new GetJobCommand({ Id: batch.jobId });
          const response = await mediaConvert.send(command);
          return {
            jobId: batch.jobId,
            batchNum: batch.batchNum,
            status: response.Job.Status,
            progress: response.Job.JobPercentComplete || 0
          };
        } catch (error) {
          console.error(`[Lambda] Error checking batch ${batch.batchNum}:`, error.message);
          return { jobId: batch.jobId, batchNum: batch.batchNum, status: 'ERROR', progress: 0 };
        }
      })
    );

    // Log progress
    jobStatuses.forEach(status => {
      console.log(`[Lambda] Batch ${status.batchNum}: ${status.status} (${status.progress}%)`);
    });

    // Check if all complete
    const allComplete = jobStatuses.every(s => 
      s.status === 'COMPLETE' || s.status === 'ERROR' || s.status === 'CANCELED'
    );

    if (allComplete) {
      const hasErrors = jobStatuses.some(s => s.status === 'ERROR' || s.status === 'CANCELED');
      if (hasErrors) {
        throw new Error('One or more batch jobs failed');
      }

      console.log(`[Lambda] All batch jobs completed successfully!`);
      
      // List actual batch files from S3 (MediaConvert adds timestamps to filenames)
      console.log(`[Lambda] Listing batch files from S3...`);
      const batchesPrefix = `${outputPrefix}/batches/`;
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: batchesPrefix
      });
      const listResponse = await s3Client.send(listCommand);
      
      const batchFiles = (listResponse.Contents || [])
        .filter(obj => obj.Key.endsWith('.mp4'))
        .sort((a, b) => {
          // Sort by batch number in filename
          const getBatchNum = (key) => {
            const match = key.match(/-batch(\d+)\.mp4$/);
            return match ? parseInt(match[1]) : 0;
          };
          return getBatchNum(a.Key) - getBatchNum(b.Key);
        })
        .map(obj => obj.Key);
      
      console.log(`[Lambda] Found ${batchFiles.length} batch files:`, batchFiles);
      
      if (batchFiles.length !== batchJobs.length) {
        throw new Error(`Expected ${batchJobs.length} batch files, found ${batchFiles.length}`);
      }
      
      // Create final merge job
      console.log(`[Lambda] Creating final merge job...`);

      const mergeInputs = batchFiles.map(file => ({
        FileInput: `s3://${bucket}/${file}`,
        AudioSelectors: {
          "Audio Selector 1": {
            DefaultSelection: "DEFAULT"
          }
        }
      }));

      const jobSettings = {
        Inputs: mergeInputs,
        OutputGroups: [
          {
            Name: "File Group",
            OutputGroupSettings: {
              Type: "FILE_GROUP_SETTINGS",
              FileGroupSettings: {
                Destination: `s3://${bucket}/${outputPrefix}/`
              }
            },
            Outputs: [
              {
                VideoDescription: {
                  CodecSettings: {
                    Codec: "H_264",
                    H264Settings: {
                      MaxBitrate: 5000000,
                      RateControlMode: "QVBR",
                      QualityTuningLevel: "SINGLE_PASS_HQ"
                    }
                  }
                },
                AudioDescriptions: [
                  {
                    AudioSourceName: "Audio Selector 1",
                    CodecSettings: {
                      Codec: "AAC",
                      AacSettings: {
                        Bitrate: 96000,
                        CodingMode: "CODING_MODE_2_0",
                        SampleRate: 48000
                      }
                    }
                  }
                ],
                ContainerSettings: {
                  Container: "MP4",
                  Mp4Settings: {}
                },
                NameModifier: `-${meetingId}-final-merged`
              }
            ]
          }
        ]
      };

      const command = new CreateJobCommand({
        Role: MEDIACONVERT_ROLE_ARN,
        Settings: jobSettings,
        UserMetadata: {
          meetingId: meetingId,
          mergeJob: 'true',
          processedAt: new Date().toISOString()
        }
      });

      const response = await mediaConvert.send(command);
      console.log(`[Lambda] Final merge job created: ${response.Job.Id}`);
      
      return {
        mergeJobId: response.Job.Id,
        outputKey: `${outputPrefix}/${meetingId}-final-merged.mp4`,
        batchFiles: batchFiles
      };
    }

    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
  }

  throw new Error('Timeout waiting for batch jobs to complete');
}

// Main handler
exports.handler = async (event) => {
  console.log('Lambda invoked with event:', JSON.stringify(event, null, 2));

  const { meetingId, userEmail, s3Bucket, s3Prefix, recordingInfo } = event;

  try {
    // Step 1: Get meeting data
    console.log(`[Lambda] Processing recording for meeting: ${meetingId}`);
    const meetingData = await getMeeting(meetingId);

    if (!meetingData) {
      throw new Error(`Meeting not found: ${meetingId}`);
    }

    // Step 2: Wait for clips to stabilize
    const inputPrefix = `${s3Prefix}/composited-video/`;
    console.log(`[Lambda] Waiting for clips to stabilize in: s3://${s3Bucket}/${inputPrefix}`);
    
    const clips = await waitForStableClips(s3Bucket, inputPrefix);
    console.log(`[Lambda] Found ${clips.length} stable clips`);

    // Step 3: Create MediaConvert job
    const outputPrefix = `${s3Prefix}/final-video`;
    console.log(`[Lambda] Creating MediaConvert job for ${clips.length} clips`);
    
    const result = await createMediaConvertJob(meetingId, s3Bucket, clips, outputPrefix);
    
    if (result.isBatched) {
      console.log(`[Lambda] Created ${result.batchJobs.length} batched MediaConvert jobs`);
      console.log(`[Lambda] First job ID: ${result.jobId}`);
      
      // Wait for batches and create final merge
      const mergeResult = await waitForBatchesAndMerge(meetingId, s3Bucket, result.batchJobs, outputPrefix);
      
      // Step 4: Update meeting record with merge job
      await updateMeetingHost(meetingId, {
        ...meetingData.host,
        recording: {
          ...meetingData.host.recording,
          mediaConvertJobId: mergeResult.mergeJobId,
          processingStatus: "PROCESSING",
          clipsCount: result.clipsCount,
          finalVideoKey: mergeResult.outputKey,
          isBatched: true,
          batchJobs: result.batchJobs,
          batchFiles: mergeResult.batchFiles,
          processStartedAt: new Date().toISOString()
        }
      });
      
      console.log(`[Lambda] Successfully initiated batched processing with final merge for meeting ${meetingId}`);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          meetingId,
          jobId: mergeResult.mergeJobId,
          clipsCount: result.clipsCount,
          isBatched: true,
          batchCount: result.batchJobs.length
        })
      };
    } else {
      console.log(`[Lambda] MediaConvert job created: ${result.jobId}`);
      
      // Step 4: Update meeting record
      await updateMeetingHost(meetingId, {
        ...meetingData.host,
        recording: {
          ...meetingData.host.recording,
          mediaConvertJobId: result.jobId,
          processingStatus: "PROCESSING",
          clipsCount: result.clipsCount,
          finalVideoKey: result.outputKey,
          isBatched: false,
          processStartedAt: new Date().toISOString()
        }
      });
      
      console.log(`[Lambda] Successfully initiated processing for meeting ${meetingId}`);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          meetingId,
          jobId: result.jobId,
          clipsCount: result.clipsCount,
          isBatched: false
        })
      };
    }

  } catch (error) {
    console.error(`[Lambda] Error processing meeting ${meetingId}:`, error);

    // Update meeting with error status
    try {
      const meetingData = await getMeeting(meetingId);
      if (meetingData) {
        await updateMeetingHost(meetingId, {
          ...meetingData.host,
          recording: {
            ...meetingData.host.recording,
            processingStatus: "ERROR",
            processingError: error.message,
            processingFailedAt: new Date().toISOString()
          }
        });
      }
    } catch (updateError) {
      console.error('[Lambda] Failed to update error status:', updateError);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
