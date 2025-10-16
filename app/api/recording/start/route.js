import { 
  ChimeSDKMediaPipelinesClient, 
  CreateMediaCapturePipelineCommand 
} from "@aws-sdk/client-chime-sdk-media-pipelines";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getMeeting, updateMeetingHost } from '../../../lib/meetingStorage.js';

const mediaPipelinesClient = new ChimeSDKMediaPipelinesClient({ 
  region: process.env.AWS_REGION 
});

export async function POST(req) {
  try {
    // Enforce authentication - only authenticated users can start recording
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return Response.json(
        { error: "Unauthorized. Please sign in to start recording." }, 
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
        { error: "Only the meeting host can start recording" }, 
        { status: 403 }
      );
    }

    // Check if recording is already in progress
    if (meetingData.recording?.isRecording) {
      return Response.json(
        { error: "Recording is already in progress" }, 
        { status: 400 }
      );
    }

    // Validate required environment variables
    if (!process.env.AWS_S3_RECORDING_BUCKET) {
      return Response.json(
        { error: "S3 bucket not configured for recordings" }, 
        { status: 500 }
      );
    }

    // Create S3 path for recording
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const s3Prefix = `recordings/${meetingId}/${timestamp}`;

    // Create media capture pipeline
    const command = new CreateMediaCapturePipelineCommand({
      SourceType: "ChimeSdkMeeting",
      SourceArn: `arn:aws:chime::${process.env.AWS_ACCOUNT_ID}:meeting/${meetingId}`,
      SinkType: "S3Bucket",
      SinkArn: `arn:aws:s3:::${process.env.AWS_S3_RECORDING_BUCKET}/${s3Prefix}`,
      ChimeSdkMeetingConfiguration: {
        ArtifactsConfiguration: {
          Audio: {
            MuxType: "AudioOnly"
          },
          Video: {
            State: "Enabled",
            MuxType: "VideoOnly"
          },
          Content: {
            State: "Enabled",
            MuxType: "ContentOnly"
          },
          CompositedVideo: {
            State: "Enabled",
            Layout: "GridView",
            Resolution: "HD",
            GridViewConfiguration: {
              ContentShareLayout: "PresenterOnly",
              PresenterOnlyConfiguration: {
                PresenterPosition: "TopRight"
              }
            }
          }
        }
      }
    });

    const response = await mediaPipelinesClient.send(command);

    // Store recording information in meeting data
    const recordingInfo = {
      isRecording: true,
      pipelineId: response.MediaCapturePipeline?.MediaPipelineId,
      pipelineArn: response.MediaCapturePipeline?.MediaPipelineArn,
      startedAt: new Date().toISOString(),
      startedBy: session.user.email,
      s3Bucket: process.env.AWS_S3_RECORDING_BUCKET,
      s3Prefix: s3Prefix,
      status: response.MediaCapturePipeline?.Status
    };

    // Update meeting data with recording info
    updateMeetingHost(meetingId, {
      ...meetingData.host,
      recording: recordingInfo
    });

    return Response.json({
      success: true,
      recording: {
        pipelineId: recordingInfo.pipelineId,
        startedAt: recordingInfo.startedAt,
        status: recordingInfo.status
      }
    });

  } catch (error) {
    console.error("Failed to start recording:", error);
    return Response.json(
      { error: error?.message || "Failed to start recording" }, 
      { status: 500 }
    );
  }
}
