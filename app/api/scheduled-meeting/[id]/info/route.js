import { NextResponse } from "next/server";
import { connectToDb } from "../../../../lib/meetingStorage";
import { ObjectId } from "mongodb";
import { ChimeSDKMeetingsClient, GetMeetingCommand } from "@aws-sdk/client-chime-sdk-meetings";

const chimeClient = new ChimeSDKMeetingsClient({ 
  region: process.env.CHIME_REGION 
});

export async function GET(req, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing meeting ID" },
        { status: 400 }
      );
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid meeting ID format" },
        { status: 400 }
      );
    }

    // Connect to MongoDB
    const db = await connectToDb();
    const collection = db.collection("scheduled_meetings");

    // Get scheduled meeting
    const meeting = await collection.findOne({ _id: new ObjectId(id) });

    if (!meeting) {
      return NextResponse.json(
        { error: "Scheduled meeting not found" },
        { status: 404 }
      );
    }

    // If meeting has a Chime meeting ID, verify it still exists
    let validChimeMeetingId = meeting.chimeMeetingId;
    if (meeting.chimeMeetingId) {
      try {
        const getMeetingCommand = new GetMeetingCommand({ 
          MeetingId: meeting.chimeMeetingId 
        });
        await chimeClient.send(getMeetingCommand);
        // Meeting exists, keep the ID
      } catch (error) {
        // Meeting not found or expired, clear the ID
        console.log(`[ScheduledMeeting] Chime meeting ${meeting.chimeMeetingId} not found or expired, clearing from scheduled meeting ${id}`);
        validChimeMeetingId = null;
        
        // Update the scheduled meeting to clear the expired Chime meeting ID
        await collection.updateOne(
          { _id: new ObjectId(id) },
          { 
            $set: { 
              status: "scheduled",
              updatedAt: new Date()
            },
            $unset: { 
              chimeMeetingId: "",
              chimeMeeting: "",
              startedAt: ""
            }
          }
        );
      }
    }

    // Return public meeting info (no sensitive data)
    return NextResponse.json({
      success: true,
      meeting: {
        _id: meeting._id.toString(),
        title: meeting.title,
        description: meeting.description,
        scheduledDateTime: meeting.scheduledDateTime,
        duration: meeting.duration,
        status: validChimeMeetingId ? meeting.status : "scheduled",
        hostName: meeting.hostName,
        hostEmail: meeting.hostEmail,
        chimeMeetingId: validChimeMeetingId
      }
    });
  } catch (error) {
    console.error("[ScheduledMeeting] Error retrieving scheduled meeting info:", error);
    return NextResponse.json(
      { error: "Failed to retrieve scheduled meeting information" },
      { status: 500 }
    );
  }
}
