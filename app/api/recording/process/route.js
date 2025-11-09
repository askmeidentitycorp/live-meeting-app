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

    const lambdaFunctionName = process.env.RECORDING_PROCESSOR_LAMBDA_NAME;
      console.log(`[ProcessAPI] Lambda function name: ${lambdaFunctionName}`);
    

    if (!lambdaFunctionName) {
      throw new Error('RECORDING_PROCESSOR_LAMBDA_NAME environment variable is not set');
    }

    console.info(`[ProcessAPI] Invoking Lambda function: ${lambdaFunctionName} for meeting ${meetingId}`);

    try {
      const lambdaClient = new LambdaClient(getAWSConfig());
      
      const command = new InvokeCommand({
        FunctionName: lambdaFunctionName,
        InvocationType: 'Event',
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
