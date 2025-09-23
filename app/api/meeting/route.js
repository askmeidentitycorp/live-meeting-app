import { 
  ChimeSDKMeetingsClient, 
  CreateMeetingCommand, 
  CreateAttendeeCommand 
} from "@aws-sdk/client-chime-sdk-meetings";
import { addMeeting } from '../../lib/meetingStorage.js';

const client = new ChimeSDKMeetingsClient({ region: process.env.AWS_REGION });

export async function POST(req) {
  try {
    console.log('Meeting API called');
    const { meetingTitle, attendeeName } = await req.json();
    console.log('Request data:', { meetingTitle, attendeeName });
    
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
    
    console.log('Creating meeting with command:', command);
    const meeting = await client.send(command);
    console.log('Meeting created successfully:', meeting.Meeting.MeetingId);
    
    const attendeeCommand = new CreateAttendeeCommand({
      MeetingId: meeting.Meeting.MeetingId,
      ExternalUserId: attendeeName || "Attendee"
    });
    
    const attendee = await client.send(attendeeCommand);
    console.log('Attendee created successfully:', attendee.Attendee.AttendeeId);
    
    // Track the meeting
    addMeeting(meeting.Meeting.MeetingId, {
      meetingId: meeting.Meeting.MeetingId,
      title: meetingTitle,
      createdAt: new Date().toISOString(),
      mediaRegion: meeting.Meeting.MediaRegion
    });
    
    const response = {
      Meeting: meeting.Meeting,
      Attendee: attendee.Attendee
    };
    console.log('Sending response:', response);
    
    return Response.json(response);
  } catch (err) {
    console.error('Meeting API error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}