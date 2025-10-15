"use client";

import { Mic, MicOff, Video, VideoOff, Users, X, Crown } from "lucide-react";

export function ParticipantsSidebar({
  showParticipantsList,
  onToggle,
  participants,
  isMuted,
  isVideoEnabled,
  localUserName,
  isLocalUserHost
}) {
  return (
    <div className={`${showParticipantsList ? 'w-72' : 'w-0'} transition-all duration-300 bg-white border-l border-gray-200 overflow-hidden flex flex-col shadow-lg`}>
      {showParticipantsList && (
        <>
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">
                  Participants ({(participants?.filter(p => !p?.isLocal)?.length || 0) + 1})
                </h3>
              </div>
              <button
                onClick={onToggle}
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* Local user */}
            <div className="px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center text-white font-medium text-sm relative">
                    Y
                    {isLocalUserHost && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
                        <Crown className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 text-sm">You</span>
                      {isLocalUserHost && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                          Host
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {isMuted ? (
                    <div className="w-7 h-7 bg-red-50 rounded-full flex items-center justify-center">
                      <MicOff className="w-3.5 h-3.5 text-red-500" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 bg-green-50 rounded-full flex items-center justify-center">
                      <Mic className="w-3.5 h-3.5 text-green-500" />
                    </div>
                  )}
                  {isVideoEnabled ? (
                    <div className="w-7 h-7 bg-blue-50 rounded-full flex items-center justify-center">
                      <Video className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center">
                      <VideoOff className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Remote participants */}
            {participants
              ?.filter(p => !p?.isLocal)
              .map((participant) => (
                <div key={participant?.attendeeId} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-medium text-sm relative ${
                        participant?.isActiveSpeaker ? 'bg-green-500 ring-2 ring-green-300' : 'bg-gray-400'
                      }`}>
                        {participant?.name?.charAt(0)?.toUpperCase()}
                        {participant?.isHost && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
                            <Crown className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 text-sm truncate">{participant?.name}</span>
                          {participant?.isHost && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                              Host
                            </span>
                          )}
                        </div>
                        {participant?.isActiveSpeaker && (
                          <div className="text-xs text-green-600 font-medium">
                            Speaking...
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {participant?.muted === null ? (
                        <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center">
                          <Mic className="w-3.5 h-3.5 text-gray-400" />
                        </div>
                      ) : participant?.muted ? (
                        <div className="w-7 h-7 bg-red-50 rounded-full flex items-center justify-center">
                          <MicOff className="w-3.5 h-3.5 text-red-500" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 bg-green-50 rounded-full flex items-center justify-center">
                          <Mic className="w-3.5 h-3.5 text-green-500" />
                        </div>
                      )}
                      {participant?.videoEnabled ? (
                        <div className="w-7 h-7 bg-blue-50 rounded-full flex items-center justify-center">
                          <Video className="w-3.5 h-3.5 text-blue-500" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center">
                          <VideoOff className="w-3.5 h-3.5 text-gray-400" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}