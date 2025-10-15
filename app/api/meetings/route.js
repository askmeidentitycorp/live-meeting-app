import { 
  ChimeSDKMeetingsClient, 
  GetMeetingCommand 
} from "@aws-sdk/client-chime-sdk-meetings";
import { getAllMeetings, removeMeeting } from '../../lib/meetingStorage.js';

const client = new ChimeSDKMeetingsClient({ region: process.env.AWS_REGION });

export async function GET() {
  try {
    const meetings = getAllMeetings();
    const activeMeetings = [];
    
    for (const meetingId in meetings) {
      try {
        await client.send(new GetMeetingCommand({ MeetingId: meetingId }));
        activeMeetings.push(meetings[meetingId]);
      } catch (error) {
        removeMeeting(meetingId);
      }
    }
    
    return Response.json({ 
      meetings: activeMeetings,
      count: activeMeetings?.length || 0
    });
  } catch (err) {
    return Response.json({ error: err?.message }, { status: 500 });
  }
}