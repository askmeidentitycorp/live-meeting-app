/**
 * AWS SDK Configuration Helper
 * Centralizes AWS client creation with environment variables
 * Uses custom variable names to avoid conflicts in production
 */

import { S3Client } from "@aws-sdk/client-s3";
import { ChimeSDKMeetingsClient } from "@aws-sdk/client-chime-sdk-meetings";
import { ChimeSDKMediaPipelinesClient } from "@aws-sdk/client-chime-sdk-media-pipelines";
import { MediaConvertClient } from "@aws-sdk/client-mediaconvert";

// Get AWS configuration from environment variables
// Supports both AWS_* (development) and CLOUD_* (production) prefixes
const getConfig = () => {
  const region = process.env.CLOUD_REGION || process.env.AWS_REGION || 'us-east-1';
  const accessKeyId = process.env.CLOUD_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUD_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  const config = { region };

  // Only add credentials if explicitly provided
  // Otherwise, AWS SDK will use default credential chain (IAM roles, etc.)
  if (accessKeyId && secretAccessKey) {
    config.credentials = {
      accessKeyId,
      secretAccessKey
    };
  }

  return config;
};

// Export configured clients
export const s3Client = new S3Client(getConfig());

export const chimeMeetingsClient = new ChimeSDKMeetingsClient(getConfig());

export const chimeMediaPipelinesClient = new ChimeSDKMediaPipelinesClient(getConfig());

export const getMediaConvertClient = () => {
  const endpoint = process.env.VIDEO_CONVERT_ENDPOINT || process.env.AWS_MEDIACONVERT_ENDPOINT;
  return new MediaConvertClient({
    ...getConfig(),
    endpoint
  });
};

// Export environment helper functions
export const getEnv = {
  region: () => process.env.CLOUD_REGION || process.env.AWS_REGION || 'us-east-1',
  accountId: () => process.env.CLOUD_ACCOUNT_ID || process.env.AWS_ACCOUNT_ID,
  s3Bucket: () => process.env.RECORDING_BUCKET || process.env.AWS_S3_RECORDING_BUCKET,
  mediaConvertEndpoint: () => process.env.VIDEO_CONVERT_ENDPOINT || process.env.AWS_MEDIACONVERT_ENDPOINT,
  mediaConvertRole: () => process.env.VIDEO_CONVERT_ROLE || process.env.AWS_MEDIACONVERT_ROLE
};
