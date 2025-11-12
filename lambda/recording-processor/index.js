const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { LambdaClient, UpdateFunctionConfigurationCommand } = require("@aws-sdk/client-lambda");
const { default: axios } = require("axios");
const { MongoClient } = require("mongodb");

// Environment variables
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB;
const AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
const FFMPEG_API_URL = process.env.FFMPEG_API_URL || 'https://hostedservices.arythmatic.cloud/api/videos/start-hls-process';
const FFMPEG_API_BASE_URL = 'https://hostedservices.arythmatic.cloud/auth';
const LAMBDA_FUNCTION_NAME = process.env.AWS_LAMBDA_FUNCTION_NAME;
let FFMPEG_API_KEY = process.env.FFMPEG_API_KEY;

// Clients
let mongoClient = null;
let s3Client = null;
let lambdaClient = null;

// Initialize AWS clients
function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({ region: AWS_REGION });
  }
  return s3Client;
}

function getLambdaClient() {
  if (!lambdaClient) {
    lambdaClient = new LambdaClient({ region: AWS_REGION });
  }
  return lambdaClient;
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

  console.log(`[S3Stability] Waiting for clips: s3://${bucket}/${prefix}`);

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

      if (currentCount === 0) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        continue;
      }

      if (currentCount === previousCount) {
        stableIterations++;
        
        if (stableIterations >= requiredStableIterations) {
          console.log(`[S3Stability] ${clips.length} clips stabilized`);
          return clips;
        }
      } else {
        stableIterations = 0;
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

// Generate new API key from FFmpeg service
async function generateNewApiKey() {
  console.log('[APIKey] Generating new API key...');
  
  try {
    const response = await axios.post(`${FFMPEG_API_BASE_URL}/generate-api-key`, {
      username: 'videoprocessor@arythmatic.cloud',
      password: '[}{E}li40^DL[F#H'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const { apiKey } = response.data;
    
    if (!apiKey) {
      throw new Error('API key not returned from generation endpoint');
    }

    console.log('[APIKey] New API key generated successfully');
    return apiKey;
    
  } catch (error) {
    console.error('[APIKey] Failed to generate new API key:', error.message);
    throw new Error(`API key generation failed: ${error.message}`);
  }
}

async function updateLambdaApiKey(newApiKey) {
  console.log('[APIKey] Updating Lambda environment variable...');
  
  try {
    const lambda = getLambdaClient();
    
    const command = new UpdateFunctionConfigurationCommand({
      FunctionName: LAMBDA_FUNCTION_NAME,
      Environment: {
        Variables: {
          ...process.env,
          FFMPEG_API_KEY: newApiKey
        }
      }
    });

    await lambda.send(command);
    
    // Update the in-memory variable
    FFMPEG_API_KEY = newApiKey;
    
    console.log('[APIKey] Lambda environment variable updated successfully');
    
  } catch (error) {
    console.error('[APIKey] Failed to update Lambda environment:', error.message);
    throw new Error(`Failed to update Lambda API key: ${error.message}`);
  }
}

// Regenerate API key and retry
async function regenerateApiKeyAndRetry() {
  console.log('[APIKey] API key missing or invalid, regenerating...');
  
  const newApiKey = await generateNewApiKey();
  await updateLambdaApiKey(newApiKey);
  
  return newApiKey;
}

// Call FFmpeg processing API
async function callProcessingAPI(bucketName, allKeys, outputKey, format = 'hls', retryCount = 0) {
  console.log(`[FFmpeg] Processing ${allKeys.length} clips to s3://${bucketName}/${outputKey}`);

  const payload = {
    bucket : bucketName,
    inputKeys: allKeys,
    outputKey,
    format
  };

  try {
    const response = await axios.post(FFMPEG_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FFMPEG_API_KEY}`
      },
    });

    if (!response.ok) {
      const errorText = await response.data();
      console.error('[FFmpeg] Error response:', errorText);
      throw new Error(`FFmpeg API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log('[FFmpeg] Job submitted successfully');
    
    return result;
  } catch (error) {
    console.error('[FFmpeg] API call failed:', error.message);
    
    // Check if it's a 401 error (missing/invalid API key) and we haven't retried yet
    if ((error.response?.status === 401 || error.message.includes('API key missing')) && retryCount === 0) {
      console.log('[FFmpeg] Attempting to regenerate API key and retry...');
      
      try {
        await regenerateApiKeyAndRetry();
        
        // Retry the API call with the new key
        console.log('[FFmpeg] Retrying with new API key...');
        return await callProcessingAPI(bucketName, allKeys, outputKey, format, retryCount + 1);
        
      } catch (regenerateError) {
        console.error('[FFmpeg] Failed to regenerate API key:', regenerateError.message);
        throw new Error(`API key regeneration failed: ${regenerateError.message}`);
      }
    }
    
    throw error;
  }
}

async function createProcessingJob( bucket, inputClips, outputPrefix) {
  // Prepare all clip keys
  const allKeys = inputClips.map(clip => clip.Key);
  
  // Output configuration
  const outputKey = outputPrefix;
  const format = 'hls'; 

  // Call FFmpeg API
  const result = await callProcessingAPI(bucket, allKeys, outputKey, format);

  return {
    jobId: result.jobId || result.requestId || `ffmpeg-${Date.now()}`,
    outputKey: `${outputKey}/index.m3u8`, // HLS manifest
    clipsCount: inputClips.length,
    ffmpegResult: result
  };
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
    const clips = await waitForStableClips(s3Bucket, inputPrefix);

    // Step 3: Create FFmpeg processing job
    const outputPrefix = `${s3Prefix}/final-video`;
    const result = await createProcessingJob(meetingId, s3Bucket, clips, outputPrefix);
    console.log(`[Lambda] Processing job created: ${result.jobId}`);
    
    // Step 4: Update meeting record
    await updateMeetingHost(meetingId, {
      ...meetingData.host,
      recording: {
        ...meetingData.host.recording,
        processingJobId: result.jobId,
        processingStatus: "PROCESSING",
        clipsCount: result.clipsCount,
        finalVideoKey: result.outputKey,
        processingEngine: "ffmpeg",
        processStartedAt: new Date().toISOString()
      }
    });
    
    console.log(`[Lambda] Successfully initiated FFmpeg processing for meeting ${meetingId}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        meetingId,
        jobId: result.jobId,
        clipsCount: result.clipsCount,
        outputKey: result.outputKey
      })
    };

  } catch (error) {
    console.error(`[Lambda] Error processing meeting ${meetingId}:`, error);

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