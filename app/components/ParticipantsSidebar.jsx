"use client";

import { Mic, MicOff, Video, VideoOff } from "lucide-react";

export function ParticipantsSidebar({
  showParticipantsList,
  onToggle,
  participants,
  isMuted,
  isVideoEnabled
}) {
  return (
    <div className={`${showParticipantsList ? 'w-80' : 'w-0'} transition-all duration-300 bg-gray-50 border-r border-gray-200 overflow-hidden flex flex-col`}>
      {showParticipantsList && (
        <>
          <div className="p-4 border-b border-gray-200 bg-white">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">
                Participants ({participants.filter(p => !p.isLocal).length + 1})
              </h3>
              <button
                onClick={onToggle}
                className="text-gray-500 hover:text-gray-700 p-1"
              >
                ×
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* Local user */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-medium">
                  Y
                </div>
                <div>
                  <div className="font-medium text-gray-900">You</div>
                  <div className="text-xs text-gray-500">Host</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isMuted ? (
                  <MicOff className="w-4 h-4 text-red-500" />
                ) : (
                  <Mic className="w-4 h-4 text-green-500" />
                )}
                {isVideoEnabled ? (
                  <Video className="w-4 h-4 text-blue-500" />
                ) : (
                  <VideoOff className="w-4 h-4 text-gray-400" />
                )}
              </div>
            </div>

            {/* Remote participants */}
            {participants
              .filter(p => !p.isLocal)
              .map((participant) => (
                <div key={participant.attendeeId} className="flex items-center justify-between p-4 border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${
                      participant.isActiveSpeaker ? 'bg-green-500' : 'bg-gray-500'
                    }`}>
                      {participant.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{participant.name}</div>
                      <div className="text-xs text-gray-500">
                        {participant.isActiveSpeaker ? 'Speaking' : 'Participant'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {participant.muted ? (
                      <MicOff className="w-4 h-4 text-red-500" />
                    ) : (
                      <Mic className="w-4 h-4 text-green-500" />
                    )}
                    {participant.videoEnabled ? (
                      <Video className="w-4 h-4 text-blue-500" />
                    ) : (
                      <VideoOff className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}