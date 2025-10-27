import { 
  ChimeSDKMediaPipelinesClient, 
  GetMediaCapturePipelineCommand 
} from "@aws-sdk/client-chime-sdk-media-pipelines";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getMeeting } from '../../../lib/meetingStorage.js';

// Create Chime Media Pipelines client with credentials
const getMediaPipelinesClient = () => {
  const config = {
    region: process.env.CHIME_REGION || 'us-east-1'
  };

  // Add credentials if provided (for Amplify deployment)
  const accessKeyId = process.env.CHIME_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CHIME_SECRET_ACCESS_KEY;
  
  if (accessKeyId && secretAccessKey) {
    config.credentials = {
      accessKeyId,
      secretAccessKey
    };
  }

  return new ChimeSDKMediaPipelinesClient(config);
};

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

    const isHost = meetingData.host?.email === session.user.email;

    const recordingInfo = meetingData.host?.recording;

    if (!recordingInfo) {
      return Response.json({
        isRecording: false,
        isHost: isHost
      });
    }

    if (recordingInfo.isRecording && recordingInfo.pipelineId) {
      try {
        // Get client with credentials
        const mediaPipelinesClient = getMediaPipelinesClient();
        
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
