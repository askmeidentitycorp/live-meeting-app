import { 
  ChimeSDKMeetingsClient, 
  CreateAttendeeCommand,
  GetMeetingCommand 
} from "@aws-sdk/client-chime-sdk-meetings";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { getMeeting } from '../../lib/meetingStorage.js';

const client = new ChimeSDKMeetingsClient({ region: process.env.AWS_REGION });

export async function POST(req) {
  try {
    const { meetingId, attendeeName } = await req?.json();
    
    // Check if user is authenticated
    const session = await getServerSession(authOptions);
    
    const getMeetingCommand = new GetMeetingCommand({ MeetingId: meetingId });
    const meetingData = await client.send(getMeetingCommand);
    
    // Get stored meeting info to check if this is the host
    const storedMeeting = await getMeeting(meetingId);
    
    let uniqueUserId;
    let isHost = false;
    
    // If authenticated and matches the host email, use the original host ExternalUserId
    if (session?.user?.email && storedMeeting?.host?.email === session.user.email) {
      uniqueUserId = storedMeeting.host.externalUserId || `HOST|${session.user.email}|${Date.now()}|${Math.random().toString(36).substr(2, 9)}`;
      isHost = true;
    } else if (session?.user) {
      // Authenticated user joining (but not host)
      uniqueUserId = `USER|${session.user.email}|${Date.now()}|${Math.random().toString(36).substr(2, 9)}`;
    } else {
      // Guest joining
      uniqueUserId = `GUEST|${attendeeName || "Guest"}|${Date.now()}|${Math.random().toString(36).substr(2, 9)}`;
    }
    
    const attendeeCommand = new CreateAttendeeCommand({
      MeetingId: meetingId,
      ExternalUserId: uniqueUserId,
      Capabilities: {
        Audio: "SendReceive",
        Video: "SendReceive",
        Content: "SendReceive"
      }
    });
    
    const attendee = await client.send(attendeeCommand);
    
    return Response.json({
      Meeting: meetingData?.Meeting,
      Attendee: attendee?.Attendee,
      isHost: isHost,
      hostInfo: storedMeeting?.host, // Include host information in response
      userType: session?.user ? (isHost ? 'host' : 'authenticated') : 'guest'
    });
  } catch (err) {
    return Response.json({ error: err?.message }, { status: 500 });
  }
}