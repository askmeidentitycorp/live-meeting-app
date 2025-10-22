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
  isHost
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
          {/* Recording Controls - Only visible to host */}
          {isHost && meetingId && (
            <RecordingControls meetingId={meetingId} isHost={isHost} />
          )}
          
          <div className="bg-gray-200 px-3 py-1 rounded text-sm text-gray-700">
            {participants.filter(p => !p.isLocal).length + 1} participant{participants.filter(p => !p.isLocal).length !== 0 ? 's' : ''}
          </div>
          <button
            onClick={onToggleParticipants}
            className={`p-2 rounded transition-colors cursor-pointer ${
              showParticipantsList
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
            title="Participants"
          >
            <Users size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}