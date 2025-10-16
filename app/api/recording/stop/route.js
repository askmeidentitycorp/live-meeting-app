import { 
  ChimeSDKMediaPipelinesClient, 
  DeleteMediaCapturePipelineCommand 
} from "@aws-sdk/client-chime-sdk-media-pipelines";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getMeeting, updateMeetingHost } from '../../../lib/meetingStorage.js';

const mediaPipelinesClient = new ChimeSDKMediaPipelinesClient({ 
  region: process.env.AWS_REGION 
});

export async function POST(req) {
  try {
    // Enforce authentication
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return Response.json(
        { error: "Unauthorized. Please sign in to stop recording." }, 
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

    // Check if user is the host of this meeting
    const meetingData = getMeeting(meetingId);
    
    if (!meetingData) {
      return Response.json(
        { error: "Meeting not found" }, 
        { status: 404 }
      );
    }

    // Verify user is the host
    if (meetingData.host?.email !== session.user.email) {
      return Response.json(
        { error: "Only the meeting host can stop recording" }, 
        { status: 403 }
      );
    }

    // Check if recording is in progress
    if (!meetingData.host?.recording?.isRecording) {
      return Response.json(
        { error: "No recording in progress" }, 
        { status: 400 }
      );
    }

    const pipelineId = meetingData.host.recording.pipelineId;

    if (!pipelineId) {
      return Response.json(
        { error: "Recording pipeline ID not found" }, 
        { status: 400 }
      );
    }

    // Delete (stop) the media capture pipeline
    const command = new DeleteMediaCapturePipelineCommand({
      MediaPipelineId: pipelineId
    });

    await mediaPipelinesClient.send(command);

    // Update meeting data
    const recordingInfo = {
      ...meetingData.host.recording,
      isRecording: false,
      stoppedAt: new Date().toISOString(),
      stoppedBy: session.user.email,
      status: "Stopped"
    };

    updateMeetingHost(meetingId, {
      ...meetingData.host,
      recording: recordingInfo
    });

    return Response.json({
      success: true,
      recording: {
        pipelineId: recordingInfo.pipelineId,
        startedAt: recordingInfo.startedAt,
        stoppedAt: recordingInfo.stoppedAt,
        s3Bucket: recordingInfo.s3Bucket,
        s3Prefix: recordingInfo.s3Prefix,
        status: recordingInfo.status
      }
    });

  } catch (error) {
    console.error("Failed to stop recording:", error);
    return Response.json(
      { error: error?.message || "Failed to stop recording" }, 
      { status: 500 }
    );
  }
}
