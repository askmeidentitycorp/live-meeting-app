import { 
  MediaConvertClient, 
  CreateJobCommand,
  GetJobCommand 
} from "@aws-sdk/client-mediaconvert";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getMeeting, updateMeetingHost } from '../../../lib/meetingStorage.js';
import { createBatchedMediaConvertJobs } from '../../../lib/mediaconvert-batch.js';
import { createStabilityChecker, S3StabilityError } from '../../../lib/recording/s3StabilityChecker.js';
import { getConfig } from '../../../lib/recording/config.js';

// Create AWS clients with credentials
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

const getS3Client = () => new S3Client(getAWSConfig());

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

    const bucket = recording.s3Bucket;
    const inputPrefix = `${recording.s3Prefix}/composited-video/`;
    const outputPrefix = `${recording.s3Prefix}/final-video/`;

    // Get S3 client with credentials
    const s3Client = getS3Client();

    // List all MP4 clips
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: inputPrefix
    });

    const listResponse = await s3Client.send(listCommand);
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      return Response.json(
        { error: "No video clips found to process" }, 
        { status: 404 }
      );
    }

    const clips = listResponse.Contents
      .filter(obj => obj.Key.endsWith('.mp4'))
      .sort((a, b) => a.Key.localeCompare(b.Key));
    
    if (clips.length === 0) {
      return Response.json(
        { error: "No MP4 clips found" }, 
        { status: 404 }
      );
    }

    const endpoint = process.env.MEDIACONVERT_ENDPOINT;
    
    // Get MediaConvert client with credentials
    const mediaConvertClient = getMediaConvertClient();

    const result = await createBatchedMediaConvertJobs(meetingId, session.user.email);

    return Response.json({
      success: true,
      jobId: result.jobId,
      status: "SUBMITTED",
      clipsCount: result.clipsCount,
      outputPath: result.outputKey,
      processingMode: result.processingMode,
      batchCount: result.batchCount,
      clips: result.clips || [],
      message: result.processingMode === 'BATCHED' 
        ? `Processing ${result.clipsCount} clips in ${result.batchCount} batches. This may take several minutes.`
        : "MediaConvert job submitted. Processing will complete in a few minutes."
    });

  } catch (error) {
    console.error("Failed to create MediaConvert job:", error);
    return Response.json(
      { error: error?.message || "Failed to create MediaConvert job" }, 
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

    if (!recording.mediaConvertJobId) {
      // No job has been created yet. Check if clips are ready and create job
      try {
        const s3Client = getS3Client();
        const config = getConfig();
        const bucket = recording.s3Bucket;
        const basePrefix = recording.s3Prefix.replace(/\/+$/g, '');
        const inputPrefix = basePrefix.endsWith('/composited-video')
          ? `${basePrefix}/`
          : `${basePrefix}/composited-video/`;
        
        console.info(`[ProcessAPI] Checking clips stability for meeting ${meetingId}, prefix: ${inputPrefix}`);
        
        // Use stability checker to ensure all clips are ready
        const stabilityChecker = createStabilityChecker({ s3Client, config });
        
        let stabilityResult;
        try {
          stabilityResult = await stabilityChecker.waitForStability(bucket, inputPrefix);
          console.info(`[ProcessAPI] Clips stabilized: ${stabilityResult.clips.length} clips in ${stabilityResult.metrics.duration}ms`);
        } catch (error) {
          if (error instanceof S3StabilityError) {
            // Clips not stable yet, return waiting status
            console.info(`[ProcessAPI] Clips not stable yet: ${error.message}`, error.details);
            return Response.json({
              success: true,
              status: "WAITING_FOR_CLIPS",
              progress: 0,
              message: "Waiting for video clips to be saved to S3...",
              clipsFound: error.details.clipCount || 0,
              details: {
                elapsed: error.details.elapsed,
                iterations: error.details.iterations
              }
            });
          }
          throw error;
        }
        
        const clips = stabilityResult.clips;
        
        if (clips.length === 0) {
          // No clips found yet
          return Response.json({
            success: true,
            status: "WAITING_FOR_CLIPS",
            progress: 0,
            message: "Waiting for video clips to be saved to S3...",
            clipsFound: 0
          });
        }
        
        // Clips are stable and ready, start processing
        console.info(`[ProcessAPI] Starting processing for meeting ${meetingId}: ${clips.length} clips found and stable`);
        const result = await createBatchedMediaConvertJobs(meetingId, session.user.email);
        
        return Response.json({
          success: true,
          jobId: result.jobId,
          status: "SUBMITTED",
          progress: 0,
          outputPath: result.outputKey,
          processingMode: result.processingMode,
          batchCount: result.batchCount,
          clipsCount: result.clipsCount,
          clips: result.clips || [],
          stabilityMetrics: stabilityResult.metrics,
          message: result.processingMode === 'BATCHED'
            ? `Processing ${result.clipsCount} clips in ${result.batchCount} batches.`
            : "MediaConvert job submitted. Processing will complete in a few minutes."
        });
      } catch (err) {
        console.error("[ProcessAPI] Failed to start processing:", err);
        return Response.json({
          success: false,
          status: "ERROR",
          error: err.message,
          message: "Failed to start processing. Please try again."
        }, { status: 500 });
      }
    }

    const jobId = recording.mediaConvertJobId;
    const endpoint = process.env.MEDIACONVERT_ENDPOINT;

    // Get MediaConvert client with credentials
    const mediaConvertClient = getMediaConvertClient();

    const getJobCommand = new GetJobCommand({ Id: jobId });
    const jobResponse = await mediaConvertClient.send(getJobCommand);

    const status = jobResponse.Job.Status;
    const progress = jobResponse.Job.JobPercentComplete || 0;

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
