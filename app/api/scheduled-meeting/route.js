import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { connectToDb } from "../../lib/meetingStorage";

// POST - Create a scheduled meeting
export async function POST(req) {
  try {
    console.log("[ScheduledMeeting] POST request received");
    
    const session = await getServerSession(authOptions);
    console.log("[ScheduledMeeting] Session:", session?.user?.email);
    
    if (!session?.user?.email) {
      console.log("[ScheduledMeeting] No session found");
      return NextResponse.json(
        { error: "Unauthorized - session required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    console.log("[ScheduledMeeting] Request body:", JSON.stringify(body));
    
    const { title, description, scheduledDateTime, duration } = body;

    // Validation
    if (!title || !scheduledDateTime || !duration) {
      console.log("[ScheduledMeeting] Missing required fields");
      return NextResponse.json(
        { error: "Missing required fields: title, scheduledDateTime, duration" },
        { status: 400 }
      );
    }

    const scheduledDate = new Date(scheduledDateTime);
    const now = new Date();
    console.log("[ScheduledMeeting] Scheduled date:", scheduledDate, "Now:", now);
    
    if (scheduledDate <= now) {
      console.log("[ScheduledMeeting] Scheduled time is in the past");
      return NextResponse.json(
        { error: "Scheduled time must be in the future" },
        { status: 400 }
      );
    }

    // Connect to MongoDB
    console.log("[ScheduledMeeting] Connecting to MongoDB...");
    const db = await connectToDb();
    const collection = db.collection("scheduled_meetings");
    console.log("[ScheduledMeeting] MongoDB connected");

    // Create scheduled meeting document
    const scheduledMeeting = {
      title,
      description: description || "",
      scheduledDateTime: scheduledDate,
      duration: parseInt(duration),
      status: "scheduled",
      hostEmail: session.user.email,
      hostName: session.user.name || session.user.email,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log("[ScheduledMeeting] Inserting document...");
    const result = await collection.insertOne(scheduledMeeting);
    console.log("[ScheduledMeeting] Insert result:", result.insertedId);

    // Add small delay for write propagation in serverless
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log(`[ScheduledMeeting] Created scheduled meeting: ${result.insertedId} by ${session.user.email}`);

    return NextResponse.json({
      success: true,
      meetingId: result.insertedId,
      meeting: { ...scheduledMeeting, _id: result.insertedId }
    });
  } catch (error) {
    console.error("[ScheduledMeeting] Error creating scheduled meeting:", error);
    console.error("[ScheduledMeeting] Error stack:", error.stack);
    return NextResponse.json(
      { error: `Failed to create scheduled meeting: ${error.message}` },
      { status: 500 }
    );
  }
}

// GET - List scheduled meetings for the current user
export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized - session required" },
        { status: 401 }
      );
    }

    // Connect to MongoDB
    const db = await connectToDb();
    const collection = db.collection("scheduled_meetings");

    // Get all scheduled meetings for this user
    const meetings = await collection
      .find({ 
        hostEmail: session.user.email,
        status: { $in: ["scheduled", "started"] }
      })
      .sort({ scheduledDateTime: 1 })
      .toArray();

    console.log(`[ScheduledMeeting] Retrieved ${meetings.length} scheduled meetings for ${session.user.email}`);

    return NextResponse.json({
      success: true,
      meetings: meetings.map(m => ({
        ...m,
        _id: m._id.toString()
      }))
    });
  } catch (error) {
    console.error("[ScheduledMeeting] Error retrieving scheduled meetings:", error);
    return NextResponse.json(
      { error: "Failed to retrieve scheduled meetings" },
      { status: 500 }
    );
  }
}
