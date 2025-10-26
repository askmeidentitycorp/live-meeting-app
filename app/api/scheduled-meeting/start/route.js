import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { connectToDb } from "../../../lib/meetingStorage";
import { ObjectId } from "mongodb";
import { ChimeSDKMeetingsClient, CreateMeetingCommand, CreateAttendeeCommand, GetMeetingCommand } from "@aws-sdk/client-chime-sdk-meetings";

const chimeClient = new ChimeSDKMeetingsClient({ 
  region: process.env.AWS_REGION || "us-east-1" 
});

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized - session required" },
        { status: 401 }
      );
    }

    const { scheduledMeetingId } = await req.json();

    if (!scheduledMeetingId) {
      return NextResponse.json(
        { error: "Missing scheduledMeetingId" },
        { status: 400 }
      );
    }

    // Connect to MongoDB
    const db = await connectToDb();
    const scheduledCollection = db.collection("scheduled_meetings");
    const meetingsCollection = db.collection("meetings");

    // Get scheduled meeting
    const scheduledMeeting = await scheduledCollection.findOne({ 
      _id: new ObjectId(scheduledMeetingId),
      hostEmail: session.user.email
    });

    if (!scheduledMeeting) {
      return NextResponse.json(
        { error: "Scheduled meeting not found or unauthorized" },
        { status: 404 }
      );
    }

    if (scheduledMeeting.status === "started" && scheduledMeeting.chimeMeetingId) {
      // Check if the Chime meeting still exists
      try {
        const getMeetingCommand = new GetMeetingCommand({
          MeetingId: scheduledMeeting.chimeMeetingId
        });
        await chimeClient.send(getMeetingCommand);
        
        // Meeting exists, create attendee for the host
        console.log(`[StartScheduledMeeting] Meeting already started: ${scheduledMeeting.chimeMeetingId}`);
        
        const externalUserId = `HOST|${session.user.email}|${Date.now()}|${Math.random().toString(36).substring(2, 9)}`;
        
        const createAttendeeCommand = new CreateAttendeeCommand({
          MeetingId: scheduledMeeting.chimeMeetingId,
          ExternalUserId: externalUserId,
        });

        const attendeeResponse = await chimeClient.send(createAttendeeCommand);

        // Get full meeting details from meetings collection
        const meeting = await meetingsCollection.findOne({ 
          meetingId: scheduledMeeting.chimeMeetingId 
        });

        return NextResponse.json({
          success: true,
          meeting: meeting?.meeting || scheduledMeeting.chimeMeeting,
          attendee: attendeeResponse.Attendee,
          isHost: true,
          meetingId: scheduledMeeting.chimeMeetingId
        });
      } catch (error) {
        // Chime meeting expired or not found, clear old credentials and create new meeting
        console.log(`[StartScheduledMeeting] Chime meeting ${scheduledMeeting.chimeMeetingId} expired, creating new meeting`);
        
        // Clear expired meeting data
        await scheduledCollection.updateOne(
          { _id: new ObjectId(scheduledMeetingId) },
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
        
        // Continue to create new meeting below
      }
    }

    // Create Chime meeting
    const createMeetingCommand = new CreateMeetingCommand({
      ClientRequestToken: `scheduled-${scheduledMeetingId}-${Date.now()}`,
      MediaRegion: process.env.AWS_REGION || "us-east-1",
      ExternalMeetingId: `scheduled-${scheduledMeetingId}`,
    });

    const meetingResponse = await chimeClient.send(createMeetingCommand);
    const chimeMeetingId = meetingResponse.Meeting.MeetingId;

    console.log(`[StartScheduledMeeting] Created Chime meeting ${chimeMeetingId} for scheduled meeting ${scheduledMeetingId}`);

    // Create attendee for the host
    const externalUserId = `HOST|${session.user.email}|${Date.now()}|${Math.random().toString(36).substring(2, 9)}`;
    
    const createAttendeeCommand = new CreateAttendeeCommand({
      MeetingId: chimeMeetingId,
      ExternalUserId: externalUserId,
    });

    const attendeeResponse = await chimeClient.send(createAttendeeCommand);

    // Store meeting in meetings collection
    const meetingDoc = {
      meetingId: chimeMeetingId,
      externalMeetingId: `scheduled-${scheduledMeetingId}`,
      title: scheduledMeeting.title,
      description: scheduledMeeting.description,
      meeting: meetingResponse.Meeting,
      createdAt: new Date(),
      hostEmail: session.user.email,
      hostExternalUserId: externalUserId,
      scheduledMeetingId: scheduledMeetingId,
      scheduledDateTime: scheduledMeeting.scheduledDateTime,
      duration: scheduledMeeting.duration,
      mediaRegion: meetingResponse.Meeting.MediaRegion,
      host: {
        attendeeId: attendeeResponse.Attendee.AttendeeId,
        externalUserId: externalUserId,
        name: session.user.name || session.user.email || "Host",
        email: session.user.email,
        userId: session.user.email,
        provider: session.provider || "auth0"
      }
    };

    await meetingsCollection.insertOne(meetingDoc);

    // Update scheduled meeting status
    await scheduledCollection.updateOne(
      { _id: new ObjectId(scheduledMeetingId) },
      { 
        $set: { 
          status: "started",
          chimeMeetingId: chimeMeetingId,
          chimeMeeting: meetingResponse.Meeting,
          startedAt: new Date(),
          updatedAt: new Date()
        } 
      }
    );

    // Add small delay for write propagation
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log(`[StartScheduledMeeting] Successfully started scheduled meeting ${scheduledMeetingId} as ${chimeMeetingId}`);

    return NextResponse.json({
      success: true,
      meeting: meetingResponse.Meeting,
      attendee: attendeeResponse.Attendee,
      isHost: true,
      meetingId: chimeMeetingId
    });
  } catch (error) {
    console.error("[StartScheduledMeeting] Error starting scheduled meeting:", error);
    return NextResponse.json(
      { error: "Failed to start scheduled meeting" },
      { status: 500 }
    );
  }
}
