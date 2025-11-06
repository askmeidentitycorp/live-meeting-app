import { 
  ChimeSDKMediaPipelinesClient, 
  DeleteMediaCapturePipelineCommand 
} from "@aws-sdk/client-chime-sdk-media-pipelines";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getMeeting, updateMeetingHost } from '../../../lib/meetingStorage.js';

const getMediaPipelinesClient = () => {
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

  return new ChimeSDKMediaPipelinesClient(config);
};

export async function POST(req) {
  try {
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

  const meetingData = await getMeeting(meetingId);
    
    if (!meetingData) {
      return Response.json(
        { error: "Meeting not found" }, 
        { status: 404 }
      );
    }

    if (meetingData.host?.email !== session.user.email) {
      return Response.json(
        { error: "Only the meeting host can stop recording" }, 
        { status: 403 }
      );
    }

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

    const mediaPipelinesClient = getMediaPipelinesClient();

    const command = new DeleteMediaCapturePipelineCommand({
      MediaPipelineId: pipelineId
    });

    await mediaPipelinesClient.send(command);

    const recordingInfo = {
      ...meetingData.host.recording,
      isRecording: false,
      stoppedAt: new Date().toISOString(),
      stoppedBy: session.user.email,
      status: "Stopped"
    };

    await updateMeetingHost(meetingId, {
      ...meetingData.host,
      recording: recordingInfo
    });

    console.info('Recording stopped successfully:', {
      meetingId,
      pipelineId,
      s3Bucket: recordingInfo.s3Bucket,
      s3Prefix: recordingInfo.s3Prefix
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
      },
      message: "Recording stopped successfully."
    });

  } catch (error) {
    console.error("Failed to stop recording:", error);
    return Response.json(
      { error: error?.message || "Failed to stop recording" }, 
      { status: 500 }
    );
  }
}
