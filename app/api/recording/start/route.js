import {
  ChimeSDKMediaPipelinesClient,
  CreateMediaCapturePipelineCommand
} from "@aws-sdk/client-chime-sdk-media-pipelines";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { connectToDb, getMeeting, updateMeetingHost } from '../../../lib/meetingStorage.js';

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

export async function POST(req) {
  try {
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
    if (!process.env.CHIME_RECORDING_BUCKET) {
      return Response.json(
        { error: "S3 bucket not configured for recordings" },
        { status: 500 }
      );
    }

    const db = await connectToDb();
    const scheduledCollection = db.collection("scheduled_meetings");
    const scheduledMeeting = await scheduledCollection.findOne({
      chimeMeetingId: meetingId,
    });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let s3Prefix;
    if (scheduledMeeting?._id) {
      s3Prefix = `scheduled-meeting-recordings/${scheduledMeeting._id}/${timestamp}`;
    } else {
      s3Prefix = `instant-meeting-recordings/${meetingId}/${timestamp}`;
    }

    const mediaPipelinesClient = getMediaPipelinesClient();

    const command = new CreateMediaCapturePipelineCommand({
      SourceType: "ChimeSdkMeeting",
      SourceArn: `arn:aws:chime::${process.env.CHIME_ACCOUNT_ID}:meeting/${meetingId}`,
      SinkType: "S3Bucket",
      SinkArn: `arn:aws:s3:::${process.env.CHIME_RECORDING_BUCKET}/${s3Prefix}`,
      ChimeSdkMeetingConfiguration: {
        ArtifactsConfiguration: {
          Audio: {
            MuxType: "AudioOnly"
          },
          Video: {
            State: "Disabled"
          },
          Content: {
            State: "Disabled"
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

    const recordingInfo = {
      isRecording: true,
      pipelineId: response.MediaCapturePipeline?.MediaPipelineId,
      pipelineArn: response.MediaCapturePipeline?.MediaPipelineArn,
      startedAt: new Date().toISOString(),
      startedBy: session.user.email,
      s3Bucket: process.env.CHIME_RECORDING_BUCKET,
      s3Prefix: s3Prefix,
      status: response.MediaCapturePipeline?.Status
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
