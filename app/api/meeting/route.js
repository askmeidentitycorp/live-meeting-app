import { 
  ChimeSDKMeetingsClient, 
  CreateMeetingCommand, 
  CreateAttendeeCommand 
} from "@aws-sdk/client-chime-sdk-meetings";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { addMeeting } from '../../lib/meetingStorage.js';

const getChimeClient = () => {
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

  return new ChimeSDKMeetingsClient(config);
};

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return Response.json(
        { error: "Unauthorized. Please sign in to create a meeting." }, 
        { status: 401 }
      );
    }
    
    const { meetingTitle } = await req?.json();
    
    // Extract host information from authenticated session
    const hostInfo = {
      name: session.user.name || session.user.email || "Host",
      email: session.user.email,
      userId: session.user.email,
      provider: session.provider
    };
    
    const region = process.env.CHIME_REGION || 'us-east-1';
    
    if (!region) {
      throw new Error('CHIME_REGION environment variable not set');
    }
    
    const client = getChimeClient();
    
    const command = new CreateMeetingCommand({
      ExternalMeetingId: `${meetingTitle}-${Date.now()}`,
      MediaRegion: region,
      MeetingFeatures: {
        Audio: {
          EchoReduction: "AVAILABLE"
        }
      }
    });
    
    const meeting = await client.send(command);
    
    // Create unique external user ID for the host with authentication info
    // Format: HOST|email|timestamp|random to ensure uniqueness and identify host
    const uniqueUserId = `HOST|${hostInfo.userId}|${Date.now()}|${Math.random().toString(36).substr(2, 9)}`;
    
    const attendeeCommand = new CreateAttendeeCommand({
      MeetingId: meeting?.Meeting?.MeetingId,
      ExternalUserId: uniqueUserId,
      Capabilities: {
        Audio: "SendReceive",
        Video: "SendReceive",
        Content: "SendReceive"
      }
    });
    
    const attendee = await client.send(attendeeCommand);
    
    // Track the meeting with full host authentication details
    addMeeting(meeting?.Meeting?.MeetingId, {
      meetingId: meeting?.Meeting?.MeetingId,
      title: meetingTitle,
      createdAt: new Date().toISOString(),
      mediaRegion: meeting?.Meeting?.MediaRegion,
      host: {
        attendeeId: attendee?.Attendee?.AttendeeId,
        externalUserId: uniqueUserId,
        name: hostInfo.name,
        email: hostInfo.email,
        userId: hostInfo.userId,
        provider: hostInfo.provider
      }
    });
    
    const response = {
      Meeting: meeting?.Meeting,
      Attendee: attendee?.Attendee,
      isHost: true,
      hostInfo: {
        name: hostInfo.name,
        email: hostInfo.email,
        userId: hostInfo.userId
      }
    };
    
    return Response.json(response);
  } catch (err) {
    return Response.json({ error: err?.message }, { status: 500 });
  }
}