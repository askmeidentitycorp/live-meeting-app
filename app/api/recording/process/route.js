import { 
  MediaConvertClient,
  GetJobCommand 
} from "@aws-sdk/client-mediaconvert";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getMeeting, updateMeetingHost } from '../../../lib/meetingStorage.js';

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

const getLambdaClient = () => new LambdaClient(getAWSConfig());

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

    // Check if already processing
    if (recording.processingStatus === "PROCESSING" || recording.processingStatus === "INITIALIZING") {
      return Response.json({
        success: true,
        status: "PROCESSING",
        message: "Processing already in progress."
      });
    }

    // Update status to processing
    await updateMeetingHost(meetingId, {
      ...meetingData.host,
      recording: {
        ...recording,
        processingStatus: "PROCESSING",
        processingStartedAt: new Date().toISOString()
      }
    });

    // Prepare Lambda payload
    const payload = {
      meetingId,
      userEmail: session.user.email,
      s3Bucket: recording.s3Bucket,
      s3Prefix: recording.s3Prefix,
      recordingInfo: {
        startedAt: recording.startedAt,
        stoppedAt: recording.stoppedAt
      }
    };

    const lambdaFunctionName = process.env.RECORDING_PROCESSOR_LAMBDA_NAME || 'recording-processor';

    console.info(`[ProcessAPI] Invoking Lambda function: ${lambdaFunctionName} for meeting ${meetingId}`);

    try {
      const lambdaClient = getLambdaClient();
      
      const command = new InvokeCommand({
        FunctionName: lambdaFunctionName,
        InvocationType: 'Event', // Async invocation (fire and forget)
        Payload: JSON.stringify(payload)
      });

      await lambdaClient.send(command);

      console.info(`[ProcessAPI] Lambda invoked successfully for meeting ${meetingId}`);

      return Response.json({
        success: true,
        status: "PROCESSING",
        message: "Processing started. Video will be ready in sometime."
      });

    } catch (lambdaError) {
      console.error(`[ProcessAPI] Failed to invoke Lambda for meeting ${meetingId}:`, lambdaError);
      
      // Revert processing status
      await updateMeetingHost(meetingId, {
        ...meetingData.host,
        recording: {
          ...recording,
          processingStatus: "ERROR",
          processingError: lambdaError.message
        }
      });

      return Response.json(
        { error: "Failed to start processing. Please try again." }, 
        { status: 500 }
      );
    }

  } catch (error) {
    console.error("Failed to trigger processing:", error);
    return Response.json(
      { error: error?.message || "Failed to trigger processing" }, 
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

    // If no job ID yet, return processing status
    if (!recording.mediaConvertJobId) {
      return Response.json({
        success: true,
        status: recording.processingStatus || "NOT_STARTED",
        progress: 0,
        message: recording.processingStatus === "PROCESSING" 
          ? "Processing in progress..."
          : recording.processingStatus === "ERROR"
          ? `Processing failed: ${recording.processingError || 'Unknown error'}`
          : "Processing not started",
        error: recording.processingError
      });
    }

    // Get MediaConvert job status
    const jobId = recording.mediaConvertJobId;
    const endpoint = process.env.MEDIACONVERT_ENDPOINT;

    const mediaConvertClient = new MediaConvertClient({
      ...getAWSConfig(),
      endpoint: endpoint
    });

    const getJobCommand = new GetJobCommand({ Id: jobId });
    const jobResponse = await mediaConvertClient.send(getJobCommand);

    const status = jobResponse.Job.Status;
    const progress = jobResponse.Job.JobPercentComplete || 0;

    // Update status if completed
    if (status === "COMPLETE" || status === "ERROR" || status === "CANCELED") {
      await updateMeetingHost(meetingId, {
        ...meetingData.host,
        recording: {
          ...meetingData.host.recording,
          mediaConvertStatus: status,
          processingStatus: status === "COMPLETE" ? "COMPLETED" : "ERROR",
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
    console.error("Failed to get processing status:", error);
    return Response.json(
      { error: error?.message || "Failed to get processing status" }, 
      { status: 500 }
    );
  }
}
