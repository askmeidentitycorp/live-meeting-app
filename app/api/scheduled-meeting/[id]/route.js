import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { connectToDb } from "../../../lib/meetingStorage";
import { ObjectId } from "mongodb";

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized - session required" },
        { status: 401 }
      );
    }

    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing meeting ID" },
        { status: 400 }
      );
    }

    // Connect to MongoDB
    const db = await connectToDb();
    const collection = db.collection("scheduled_meetings");

    // Find the meeting first to ensure it belongs to the user
    const meeting = await collection.findOne({ 
      _id: new ObjectId(id),
      hostEmail: session.user.email
    });

    if (!meeting) {
      return NextResponse.json(
        { error: "Scheduled meeting not found or unauthorized" },
        { status: 404 }
      );
    }

    // Don't allow deletion of started meetings
    if (meeting.status === "started") {
      return NextResponse.json(
        { error: "Cannot delete a meeting that has already started" },
        { status: 400 }
      );
    }

    // Delete the scheduled meeting
    await collection.deleteOne({ _id: new ObjectId(id) });

    console.log(`[ScheduledMeeting] Deleted scheduled meeting ${id} by ${session.user.email}`);

    return NextResponse.json({
      success: true,
      message: "Scheduled meeting deleted successfully"
    });
  } catch (error) {
    console.error("[ScheduledMeeting] Error deleting scheduled meeting:", error);
    return NextResponse.json(
      { error: "Failed to delete scheduled meeting" },
      { status: 500 }
    );
  }
}
