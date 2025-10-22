import { 
  ChimeSDKMediaPipelinesClient, 
  GetMediaCapturePipelineCommand 
} from "@aws-sdk/client-chime-sdk-media-pipelines";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getMeeting } from '../../../lib/meetingStorage.js';

const mediaPipelinesClient = new ChimeSDKMediaPipelinesClient({ 
  region: process.env.AWS_REGION 
});

export async function GET(req) {
  try {
    // Enforce authentication
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

    // Get meeting data
    const meetingData = await getMeeting(meetingId);
    
    if (!meetingData) {
      return Response.json(
        { error: "Meeting not found" }, 
        { status: 404 }
      );
    }

    // Check if user is the host
    const isHost = meetingData.host?.email === session.user.email;

    // Return recording status from stored data
    const recordingInfo = meetingData.host?.recording;

    if (!recordingInfo) {
      return Response.json({
        isRecording: false,
        isHost: isHost
      });
    }

    // If recording is in progress, fetch live status from AWS
    if (recordingInfo.isRecording && recordingInfo.pipelineId) {
      try {
        const command = new GetMediaCapturePipelineCommand({
          MediaPipelineId: recordingInfo.pipelineId
        });

        const response = await mediaPipelinesClient.send(command);

        return Response.json({
          isRecording: true,
          isHost: isHost,
          recording: {
            pipelineId: recordingInfo.pipelineId,
            startedAt: recordingInfo.startedAt,
            status: response.MediaCapturePipeline?.Status || recordingInfo.status,
            s3Bucket: recordingInfo.s3Bucket,
            s3Prefix: recordingInfo.s3Prefix
          }
        });
      } catch (error) {
        // If pipeline not found, it might have ended
        console.error("Error fetching pipeline status:", error);
        return Response.json({
          isRecording: false,
          isHost: isHost,
          recording: recordingInfo
        });
      }
    }

    return Response.json({
      isRecording: recordingInfo.isRecording,
      isHost: isHost,
      recording: recordingInfo
    });

  } catch (error) {
    console.error("Failed to get recording status:", error);
    return Response.json(
      { error: error?.message || "Failed to get recording status" }, 
      { status: 500 }
    );
  }
}
