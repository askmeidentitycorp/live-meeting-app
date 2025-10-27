import { 
  ChimeSDKMeetingsClient, 
  GetMeetingCommand 
} from "@aws-sdk/client-chime-sdk-meetings";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { getAllMeetings, removeMeeting, getMeeting } from '../../lib/meetingStorage.js';

const client = new ChimeSDKMeetingsClient({ region: process.env.CHIME_REGION});

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const meetingId = searchParams.get('meetingId');
    const filterByUser = searchParams.get('filterByUser') === 'true';
    
    // If requesting specific meeting details
    if (meetingId) {
      const meeting = await getMeeting(meetingId);
      
      if (!meeting) {
        return Response.json(
          { error: "Meeting not found" }, 
          { status: 404 }
        );
      }
      
      // Check if the current user is the host
      const isHost = session?.user?.email && meeting.host?.email === session.user.email;
      
      return Response.json({
        meeting,
        isHost,
        isAuthenticated: !!session?.user
      });
    }
    
    // Get all meetings
    const meetings = await getAllMeetings();
    const activeMeetings = [];
    
    for (const id in meetings) {
      try {
        await client.send(new GetMeetingCommand({ MeetingId: id }));
        
        // If filterByUser is true and user is authenticated, only show their meetings
        if (filterByUser && session?.user?.email) {
          if (meetings[id].host?.email === session.user.email) {
            activeMeetings.push({
              ...meetings[id],
              isHost: true
            });
          }
        } else {
          // Show all active meetings with host info
          activeMeetings.push({
            ...meetings[id],
            isHost: session?.user?.email && meetings[id].host?.email === session.user.email
          });
        }
      } catch (error) {
        // Meeting no longer exists in Chime, remove from storage
        await removeMeeting(id);
      }
    }
    
    return Response.json({ 
      meetings: activeMeetings,
      count: activeMeetings?.length || 0,
      userEmail: session?.user?.email || null
    });
  } catch (err) {
    return Response.json({ error: err?.message }, { status: 500 });
  }
}