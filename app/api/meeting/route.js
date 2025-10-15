import { 
  ChimeSDKMeetingsClient, 
  CreateMeetingCommand, 
  CreateAttendeeCommand 
} from "@aws-sdk/client-chime-sdk-meetings";
import { addMeeting } from '../../lib/meetingStorage.js';

const client = new ChimeSDKMeetingsClient({ region: process.env.AWS_REGION });

export async function POST(req) {
  try {
    const { meetingTitle, attendeeName } = await req?.json();
    
    if (!process.env.AWS_REGION) {
      throw new Error('AWS_REGION environment variable not set');
    }
    
    const command = new CreateMeetingCommand({
      ExternalMeetingId: `${meetingTitle}-${Date.now()}`,
      MediaRegion: process.env.AWS_REGION,
      MeetingFeatures: {
        Audio: {
          EchoReduction: "AVAILABLE"
        }
      }
    });
    
    const meeting = await client.send(command);
    
    // Create unique external user ID to prevent conflicts
    // Mark the creator as host by adding 'HOST' prefix
    const uniqueUserId = `HOST-${attendeeName || "Attendee"}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
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
    
    // Track the meeting
    addMeeting(meeting?.Meeting?.MeetingId, {
      meetingId: meeting?.Meeting?.MeetingId,
      title: meetingTitle,
      createdAt: new Date().toISOString(),
      mediaRegion: meeting?.Meeting?.MediaRegion,
      hostAttendeeId: attendee?.Attendee?.AttendeeId // Store host's attendee ID
    });
    
    const response = {
      Meeting: meeting?.Meeting,
      Attendee: attendee?.Attendee,
      isHost: true // Mark this attendee as host
    };
    
    return Response.json(response);
  } catch (err) {
    return Response.json({ error: err?.message }, { status: 500 });
  }
}