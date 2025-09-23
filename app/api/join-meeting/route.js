import { 
  ChimeSDKMeetingsClient, 
  CreateAttendeeCommand,
  GetMeetingCommand 
} from "@aws-sdk/client-chime-sdk-meetings";

const client = new ChimeSDKMeetingsClient({ region: process.env.AWS_REGION });

export async function POST(req) {
  try {
    const { meetingId, attendeeName } = await req.json();
    
    const getMeetingCommand = new GetMeetingCommand({ MeetingId: meetingId });
    const meetingData = await client.send(getMeetingCommand);
    
    const attendeeCommand = new CreateAttendeeCommand({
      MeetingId: meetingId,
      ExternalUserId: attendeeName || "Attendee"
    });
    
    const attendee = await client.send(attendeeCommand);
    
    return Response.json({
      Meeting: meetingData.Meeting,
      Attendee: attendee.Attendee
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}