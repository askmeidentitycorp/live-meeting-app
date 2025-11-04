"use client";

import { Users } from "lucide-react";
import { RecordingControls } from "./RecordingControls";

export function MeetingHeader({
  connectionError,
  onDismissError,
  participants,
  showParticipantsList,
  onToggleParticipants,
  meetingId,
  isHost,
  meetingSessionRef
}) {
  return (
    <div className="flex-shrink-0 bg-gray-100 border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          </div>
          <span className="font-medium text-gray-900">Live Meeting</span>
          {connectionError && (
            <div className="bg-red-100 border border-red-300 text-red-700 px-3 py-1 rounded text-sm">
              {connectionError}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isHost && meetingId && (
            <RecordingControls 
            meetingId={meetingId} 
            isHost={isHost}
            meetingSessionRef={meetingSessionRef}
          />
          )}
          
          <button
            onClick={onToggleParticipants}
            className={`flex items-center gap-2 px-3 py-1 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
              showParticipantsList
                ? 'bg-blue-500 text-white focus:ring-blue-300'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-300'
            }`}
            title="Participants"
            aria-pressed={showParticipantsList}
          >
            <Users size={16} />
            <span className="hidden sm:inline text-sm font-medium">Participants</span>
            <span className={`ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full text-sm font-semibold ${
              showParticipantsList ? 'bg-white text-blue-600' : 'bg-white text-gray-700'
            }`}>
              {participants.filter(p => !p.isLocal).length + 1}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}