/**
 * Example component demonstrating how to use authentication integration
 * with AWS Chime in the meeting room
 */

"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { 
  parseExternalUserId, 
  getUserBadge, 
  canPerformHostActions,
  getAttendeeStats 
} from "@/app/lib/chimeAuthUtils";

export function MeetingWithAuthExample({ meetingId, currentAttendeeId }) {
  const { data: session } = useSession();
  const [meetingData, setMeetingData] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    // Fetch meeting details to check if current user is host
    async function fetchMeetingDetails() {
      try {
        const res = await fetch(`/api/meetings?meetingId=${meetingId}`);
        const data = await res.json();
        setMeetingData(data.meeting);
        setIsHost(data.isHost);
      } catch (error) {
        console.error("Failed to fetch meeting details:", error);
      }
    }

    fetchMeetingDetails();
  }, [meetingId]);

  // Check if current user can perform host actions
  const canPerformActions = canPerformHostActions(
    session,
    meetingData,
    currentAttendeeId
  );

  // Get attendee statistics
  const stats = getAttendeeStats(attendees);

  // Example: Render participant list with badges
  const renderParticipant = (attendee) => {
    const userInfo = parseExternalUserId(attendee.ExternalUserId);
    const badge = getUserBadge(attendee.ExternalUserId);

    return (
      <div key={attendee.AttendeeId} className="flex items-center gap-2 p-2">
        {/* User icon/avatar */}
        <span className="text-2xl">{badge.icon}</span>
        
        {/* User name */}
        <span className="flex-1">
          {userInfo.userId}
        </span>
        
        {/* Badge */}
        <span 
          className={`px-2 py-1 text-xs rounded ${
            badge.color === 'blue' ? 'bg-blue-100 text-blue-800' :
            badge.color === 'green' ? 'bg-green-100 text-green-800' :
            'bg-gray-100 text-gray-800'
          }`}
        >
          {badge.label}
        </span>
        
        {/* Host-only actions */}
        {canPerformActions && !userInfo.isHost && (
          <button
            onClick={() => handleMuteParticipant(attendee.AttendeeId)}
            className="text-sm text-red-600 hover:text-red-800"
          >
            Mute
          </button>
        )}
      </div>
    );
  };

  // Example: Host-only action to mute participant
  const handleMuteParticipant = async (attendeeId) => {
    if (!canPerformActions) {
      alert("Only the host can perform this action");
      return;
    }
    
    // Implement mute logic here
    console.log("Muting participant:", attendeeId);
  };

  // Example: Host-only action to end meeting
  const handleEndMeeting = async () => {
    if (!canPerformActions) {
      alert("Only the host can end the meeting");
      return;
    }

    if (confirm("Are you sure you want to end this meeting for everyone?")) {
      // Implement end meeting logic here
      console.log("Ending meeting for all participants");
    }
  };

  return (
    <div className="space-y-4">
      {/* Meeting Header with Host Info */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold">Meeting Information</h2>
        {meetingData?.host && (
          <div className="mt-2 text-sm text-gray-600">
            <p>Host: {meetingData.host.name}</p>
            <p>Email: {meetingData.host.email}</p>
            {isHost && (
              <span className="inline-block mt-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                You are the host
              </span>
            )}
          </div>
        )}
      </div>

      {/* Attendee Statistics */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-md font-semibold mb-2">Participants ({stats.total})</h3>
        <div className="grid grid-cols-3 gap-2 text-sm text-gray-600">
          <div>👑 Hosts: {stats.hosts}</div>
          <div>✓ Members: {stats.authenticated}</div>
          <div>👤 Guests: {stats.guests}</div>
        </div>
      </div>

      {/* Participant List */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-md font-semibold mb-2">Participants</h3>
        <div className="space-y-1">
          {attendees.map(renderParticipant)}
        </div>
      </div>

      {/* Host-only Controls */}
      {canPerformActions && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
          <h3 className="text-md font-semibold mb-2 text-yellow-800">
            Host Controls
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => {/* Implement mute all */}}
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
            >
              Mute All
            </button>
            <button
              onClick={handleEndMeeting}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              End Meeting
            </button>
            <button
              onClick={() => {/* Implement lock meeting */}}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Lock Meeting
            </button>
          </div>
        </div>
      )}

      {/* Information for non-hosts */}
      {!canPerformActions && (
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
          <p className="text-sm text-blue-800">
            {session?.user 
              ? "You are a participant in this meeting."
              : "You joined as a guest. Sign in for more features."}
          </p>
        </div>
      )}
    </div>
  );
}

// Example: Custom hook for meeting authentication
export function useMeetingAuth(meetingId) {
  const { data: session } = useSession();
  const [meetingData, setMeetingData] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/meetings?meetingId=${meetingId}`);
        const data = await res.json();
        setMeetingData(data.meeting);
        setIsHost(data.isHost);
      } catch (error) {
        console.error("Failed to fetch meeting auth:", error);
      } finally {
        setLoading(false);
      }
    }

    if (meetingId) {
      fetchData();
    }
  }, [meetingId]);

  return {
    session,
    meetingData,
    isHost,
    loading,
    isAuthenticated: !!session?.user,
    hostInfo: meetingData?.host
  };
}

// Example usage in a component:
// const { isHost, hostInfo, isAuthenticated } = useMeetingAuth(meetingId);
