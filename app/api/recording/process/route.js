import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getMeeting, updateMeetingHost } from '../../../lib/meetingStorage.js';
import { createMediaConvertJobForMeeting, getMediaConvertJobStatus } from '../../../lib/mediaconvert.js';
import { MediaConvertClient, GetJobCommand } from "@aws-sdk/client-mediaconvert";

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

    // Use the centralized helper to create the job
    const result = await createMediaConvertJobForMeeting(meetingId, session.user.email);

    return Response.json({
      success: true,
      jobId: result.jobId,
      status: "SUBMITTED",
      clipsCount: result.clipsCount,
      outputPath: result.outputKey,
      message: "MediaConvert job submitted. HLS adaptive streaming will be available soon."
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
