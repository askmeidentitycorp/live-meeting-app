import { 
  MediaConvertClient, 
  CreateJobCommand,
  GetJobCommand 
} from "@aws-sdk/client-mediaconvert";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getMeeting, updateMeetingHost } from '../../../lib/meetingStorage.js';

const s3Client = new S3Client({ region: process.env.AWS_REGION });
import { createMediaConvertJobForMeeting } from '../../../lib/mediaconvert.js';

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

    // Verify user is the host
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

    // MediaConvert endpoint
    const endpoint = process.env.AWS_MEDIACONVERT_ENDPOINT || 'https://mediaconvert.us-east-1.amazonaws.com';
    
    const mediaConvertClient = new MediaConvertClient({ 
      region: process.env.AWS_REGION,
      endpoint: endpoint
    });

    // Use the centralized helper to create the job
    const result = await createMediaConvertJobForMeeting(meetingId, session.user.email);

    return Response.json({
      success: true,
      jobId: result.jobId,
      status: "SUBMITTED",
      clipsCount: result.clipsCount,
      outputPath: result.outputKey,
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

// GET endpoint to check job status
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

    // If no MediaConvert job yet, return pending status
    if (!recording.mediaConvertJobId) {
      return Response.json({
        success: true,
        status: "PENDING",
        progress: 0,
        message: "Recording stopped. Processing will begin shortly."
      });
    }

    const jobId = recording.mediaConvertJobId;
    const endpoint = process.env.AWS_MEDIACONVERT_ENDPOINT || 'https://mediaconvert.us-east-1.amazonaws.com';

    const mediaConvertClient = new MediaConvertClient({ 
      region: process.env.AWS_REGION,
      endpoint: endpoint
    });

    const getJobCommand = new GetJobCommand({ Id: jobId });
    const jobResponse = await mediaConvertClient.send(getJobCommand);

    const status = jobResponse.Job.Status;
    const progress = jobResponse.Job.JobPercentComplete || 0;

    // Update meeting data with current status
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
