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
          Name: "File Group",
          OutputGroupSettings: {
            Type: "FILE_GROUP_SETTINGS",
            FileGroupSettings: { Destination: `s3://${bucket}/${outputPrefix}` }
          },
          Outputs: [
            {
              ContainerSettings: { Container: "MP4", Mp4Settings: { CslgAtom: "INCLUDE", FreeSpaceBox: "EXCLUDE", MoovPlacement: "PROGRESSIVE_DOWNLOAD" } },
              VideoDescription: {
                CodecSettings: { Codec: "H_264", H264Settings: { MaxBitrate: 5000000, RateControlMode: "QVBR", SceneChangeDetect: "TRANSITION_DETECTION", QualityTuningLevel: "SINGLE_PASS_HQ" } },
                Width: 1280,
                Height: 720
              },
              AudioDescriptions: [ { CodecSettings: { Codec: "AAC", AacSettings: { Bitrate: 128000, CodingMode: "CODING_MODE_2_0", SampleRate: 48000 } } } ],
              NameModifier: "recording"
            }
          ]
        }
      ]
    },
    AccelerationSettings: { Mode: "DISABLED" }
  };

  const createJobCommand = new CreateJobCommand(jobParams);
  const jobResponse = await mediaConvertClient.send(createJobCommand);

  const jobId = jobResponse.Job?.Id;
  const outputKey = `${outputPrefix}recording.mp4`;

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

  return { jobId, outputKey, clipsCount: clips.length };
}

export async function getMediaConvertJobStatus(jobId) {
  if (!jobId) throw new Error('jobId required');
  const endpoint = process.env.AWS_MEDIACONVERT_ENDPOINT || 'https://mediaconvert.us-east-1.amazonaws.com';
  const mediaConvertClient = new MediaConvertClient({ region: process.env.AWS_REGION, endpoint });
  const getJobCommand = new GetJobCommand({ Id: jobId });
  const jobResponse = await mediaConvertClient.send(getJobCommand);
  return jobResponse;
}
