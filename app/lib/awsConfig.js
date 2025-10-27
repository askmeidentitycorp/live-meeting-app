import { S3Client } from "@aws-sdk/client-s3";
import { ChimeSDKMeetingsClient } from "@aws-sdk/client-chime-sdk-meetings";
import { ChimeSDKMediaPipelinesClient } from "@aws-sdk/client-chime-sdk-media-pipelines";
import { MediaConvertClient } from "@aws-sdk/client-mediaconvert";


const getConfig = () => {
  const region = process.env.CHIME_REGION;
  const accessKeyId = process.env.CHIME_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CHIME_SECRET_ACCESS_KEY;

  const config = { region };

  if (accessKeyId && secretAccessKey) {
    config.credentials = {
      accessKeyId,
      secretAccessKey
    };
  }

  return config;
};

export const s3Client = new S3Client(getConfig());

export const chimeMeetingsClient = new ChimeSDKMeetingsClient(getConfig());

export const chimeMediaPipelinesClient = new ChimeSDKMediaPipelinesClient(getConfig());

export const getMediaConvertClient = () => {
  const endpoint = process.env.MEDIACONVERT_ENDPOINT;
  return new MediaConvertClient({
    ...getConfig(),
    endpoint
  });
};

export const getEnv = {
  region: () => process.env.CHIME_REGION,
  accountId: () => process.env.CHIME_ACCOUNT_ID,
  s3Bucket: () => process.env.CHIME_RECORDING_BUCKET,
  mediaConvertEndpoint: () => process.env.MEDIACONVERT_ENDPOINT,
  mediaConvertRole: () => process.env.MEDIACONVERT_ROLE
};
