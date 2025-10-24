import { 
  ChimeSDKMediaPipelinesClient, 
  DeleteMediaCapturePipelineCommand 
} from "@aws-sdk/client-chime-sdk-media-pipelines";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getMeeting, updateMeetingHost } from '../../../lib/meetingStorage.js';
import { createMediaConvertJobForMeeting } from '../../../lib/mediaconvert.js';

const mediaPipelinesClient = new ChimeSDKMediaPipelinesClient({ 
  region: process.env.AWS_REGION 
});

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

    // Verify user is the host
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

    let mediaConvertResult = null;
    try {
      mediaConvertResult = await createMediaConvertJobForMeeting(meetingId, session.user.email);
      console.info('MediaConvert job submitted:', mediaConvertResult.jobId);
    } catch (err) {
      console.error('Failed to create MediaConvert job:', err);
      mediaConvertResult = { error: err?.message || String(err) };
    }

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
      mediaConvert: mediaConvertResult && mediaConvertResult.jobId ? { jobId: mediaConvertResult.jobId, outputKey: mediaConvertResult.outputKey } : mediaConvertResult,
      message: mediaConvertResult && mediaConvertResult.jobId ? "Recording stopped. MediaConvert job submitted." : `Recording stopped. MediaConvert job not created: ${mediaConvertResult?.error || 'unknown error'}`
    });

  } catch (error) {
    console.error("Failed to stop recording:", error);
    return Response.json(
      { error: error?.message || "Failed to stop recording" }, 
      { status: 500 }
    );
  }
}
