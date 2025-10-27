import { 
  MediaConvertClient, 
  CreateJobCommand,
  GetJobCommand 
} from "@aws-sdk/client-mediaconvert";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getMeeting, updateMeetingHost } from '../../../lib/meetingStorage.js';
import { createMediaConvertJobForMeeting } from '../../../lib/mediaconvert.js';

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

const getS3Client = () => new S3Client(getAWSConfig());

const getMediaConvertClient = () => {
  const config = getAWSConfig();
  const endpoint = process.env.MEDIACONVERT_ENDPOINT;
  
  return new MediaConvertClient({
    ...config,
    endpoint: endpoint
  });
};

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return Response.json(
        { error: "Unauthorized. Please sign in." }, 
        { status: 401 }
      );
    }

    const { meetingId } = await req.json();

    if (!meetingId) {
      return Response.json(
        { error: "Meeting ID is required" }, 
        { status: 400 }
      );
    }

    const meetingData = await getMeeting(meetingId);
    
    if (!meetingData) {
      return Response.json(
        { error: "Meeting not found" }, 
        { status: 404 }
      );
    }

    if (meetingData.host?.email !== session.user.email) {
      return Response.json(
        { error: "Only the meeting host can process recordings" }, 
        { status: 403 }
      );
    }

    const recording = meetingData.host?.recording;
    if (!recording) {
      return Response.json(
        { error: "No recording found for this meeting" }, 
        { status: 404 }
      );
    }

    const bucket = recording.s3Bucket;
    const inputPrefix = `${recording.s3Prefix}/composited-video/`;
    const outputPrefix = `${recording.s3Prefix}/final-video/`;

    // Get S3 client with credentials
    const s3Client = getS3Client();

    // List all MP4 clips
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: inputPrefix
    });

    const listResponse = await s3Client.send(listCommand);
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      return Response.json(
        { error: "No video clips found to process" }, 
        { status: 404 }
      );
    }

    const clips = listResponse.Contents
      .filter(obj => obj.Key.endsWith('.mp4'))
      .sort((a, b) => a.Key.localeCompare(b.Key));
    
    if (clips.length === 0) {
      return Response.json(
        { error: "No MP4 clips found" }, 
        { status: 404 }
      );
    }

    const endpoint = process.env.MEDIACONVERT_ENDPOINT;
    
    // Get MediaConvert client with credentials
    const mediaConvertClient = getMediaConvertClient();

    const result = await createMediaConvertJobForMeeting(meetingId, session.user.email);

    return Response.json({
      success: true,
      jobId: result.jobId,
      status: "SUBMITTED",
      clipsCount: result.clipsCount,
      outputPath: result.outputKey,
      clips: result.clips || [],
      job: result.rawJob || null,
      message: "MediaConvert job submitted. Processing will complete in a few minutes."
    });

  } catch (error) {
    console.error("Failed to create MediaConvert job:", error);
    return Response.json(
      { error: error?.message || "Failed to create MediaConvert job" }, 
      { status: 500 }
    );
  }
}

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return Response.json(
        { error: "Unauthorized" }, 
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const meetingId = searchParams.get('meetingId');

    if (!meetingId) {
      return Response.json(
        { error: "Meeting ID is required" }, 
        { status: 400 }
      );
    }

    const meetingData = await getMeeting(meetingId);
    
    if (!meetingData) {
      return Response.json(
        { error: "Meeting not found" }, 
        { status: 404 }
      );
    }

    const recording = meetingData.host?.recording;
    
    if (!recording) {
      return Response.json(
        { error: "No recording found for this meeting" }, 
        { status: 404 }
      );
    }

    if (!recording.mediaConvertJobId) {
      // No job has been created yet. Attempt to create it automatically
      // (helps when the stop route failed to start MediaConvert).
      try {
        const result = await createMediaConvertJobForMeeting(meetingId, session.user.email);
        return Response.json({
          success: true,
          jobId: result.jobId,
          status: "SUBMITTED",
          progress: 0,
          outputPath: result.outputKey,
          clips: result.clips || [],
          job: result.rawJob || null,
          message: "MediaConvert job submitted. Processing will complete in a few minutes."
        });
      } catch (err) {
        console.error("Auto-create MediaConvert job failed:", err);
        // Fall back to telling the client processing is pending and include S3 listing for diagnostics
        try {
          const s3Client = getS3Client();
          const bucket = recording.s3Bucket;
          const inputPrefix = `${recording.s3Prefix}/composited-video/`;
          const listCmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: inputPrefix });
          const listResp = await s3Client.send(listCmd);
          const s3Keys = (listResp.Contents || []).map(o => o.Key).slice(0, 200);

          return Response.json({
            success: true,
            status: "PENDING",
            progress: 0,
            message: "Recording stopped. Processing will begin shortly.",
            s3Clips: s3Keys,
            s3Bucket: bucket,
            s3Prefix: inputPrefix
          });
        } catch (s3err) {
          console.error('Failed to list S3 objects for diagnostics:', s3err);
          return Response.json({
            success: true,
            status: "PENDING",
            progress: 0,
            message: "Recording stopped. Processing will begin shortly."
          });
        }
      }
    }

    const jobId = recording.mediaConvertJobId;
    const endpoint = process.env.MEDIACONVERT_ENDPOINT;

    // Get MediaConvert client with credentials
    const mediaConvertClient = getMediaConvertClient();

    const getJobCommand = new GetJobCommand({ Id: jobId });
    const jobResponse = await mediaConvertClient.send(getJobCommand);

    const status = jobResponse.Job.Status;
    const progress = jobResponse.Job.JobPercentComplete || 0;

    if (status === "COMPLETE" || status === "ERROR" || status === "CANCELED") {
      await updateMeetingHost(meetingId, {
        ...meetingData.host,
        recording: {
          ...meetingData.host.recording,
          mediaConvertStatus: status,
          processCompletedAt: new Date().toISOString()
        }
      });
    }

    return Response.json({
      success: true,
      jobId: jobId,
      status: status,
      progress: progress,
      finalVideoKey: meetingData.host.recording.finalVideoKey
    });

  } catch (error) {
    console.error("Failed to get MediaConvert job status:", error);
    return Response.json(
      { error: error?.message || "Failed to get job status" }, 
      { status: 500 }
    );
  }
}
