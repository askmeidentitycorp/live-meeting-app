import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getMeeting } from '../../../lib/meetingStorage.js';

const s3Client = new S3Client({ region: process.env.AWS_REGION });

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return Response.json(
        { error: "Unauthorized. Please sign in." }, 
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

    // Verify user is the host
    if (meetingData.host?.email !== session.user.email) {
      return Response.json(
        { error: "Only the meeting host can access recordings" }, 
        { status: 403 }
      );
    }

    const recording = meetingData.host?.recording;
    if (!recording || !recording.finalVideoKey) {
      return Response.json(
        { error: "No processed recording available" }, 
        { status: 404 }
      );
    }

    // Check if processing is complete
    if (recording.mediaConvertStatus !== "COMPLETE") {
      return Response.json(
        { error: "Recording is still being processed", status: recording.mediaConvertStatus }, 
        { status: 400 }
      );
    }

    const bucket = recording.s3Bucket;
    const masterPlaylistKey = recording.finalVideoKey; // This is the master.m3u8 path

    // Verify the file exists
    try {
      await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: masterPlaylistKey }));
    } catch (error) {
      console.error("File not found in S3:", error);
      return Response.json(
        { error: "Recording file not found in storage" }, 
        { status: 404 }
      );
    }

    // Generate presigned URL for master playlist (valid for 24 hours)
    const presignedUrl = await getSignedUrl(
      s3Client, 
      new HeadObjectCommand({ Bucket: bucket, Key: masterPlaylistKey }), 
      { expiresIn: 86400 }
    );

    // Get base URL for the HLS folder
    const hlsBaseUrl = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${recording.hlsOutputPath}`;

    return Response.json({
      success: true,
      hlsUrl: presignedUrl.replace('HeadObject', 'GetObject'), // Convert to GET URL
      masterPlaylist: masterPlaylistKey,
      hlsBaseUrl: hlsBaseUrl,
      qualities: recording.qualities || ["1080p", "720p", "480p", "360p"],
      expiresIn: 86400,
      instructions: {
        vlc: "Copy the hlsUrl and open it in VLC Media Player",
        browser: "Use the hlsUrl with an HLS player library (hls.js or video.js)",
        download: "Download all files from the S3 bucket hls folder to play locally"
      }
    });

  } catch (error) {
    console.error("Failed to generate HLS URL:", error);
    return Response.json(
      { error: error?.message || "Failed to generate HLS URL" }, 
      { status: 500 }
    );
  }
}
