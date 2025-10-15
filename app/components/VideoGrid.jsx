"use client";

import { VideoOff, MicOff, Monitor } from "lucide-react";

export function VideoGrid({
  contentShareTileId,
  isLocalScreenSharing,
  isRemoteScreenSharing,
  contentShareVideoRef,
  localVideoRef,
  isVideoEnabled,
  isMuted,
  participants,
  localUserName
}) {

  if (contentShareTileId && (isLocalScreenSharing || isRemoteScreenSharing)) {
    return (
      /* Screen Share Layout */
      <div className="h-full flex gap-3">
        {/* Main Content Share Area */}
        {contentShareTileId && (
          <div className="flex-1 bg-black rounded-lg overflow-hidden border border-gray-300 relative">
            <video
              ref={contentShareVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
            <div className="absolute top-2 left-2 bg-blue-500 text-white px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
              <Monitor className="w-3 h-3" />
              Screen Share
            </div>
          </div>
        )}

        {/* Participant Videos Sidebar */}
        <div className="w-60 flex flex-col gap-2">
          {/* Local Video (Mini) */}
          <div className="relative bg-gray-200 rounded-lg overflow-hidden border border-gray-300 aspect-video">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${isVideoEnabled ? 'block' : 'hidden'}`}
            />
            {!isVideoEnabled && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <VideoOff className="w-6 h-6 text-gray-500" />
              </div>
            )}
            <div className="absolute bottom-1 left-1 bg-blue-500 text-white px-1 py-0.5 rounded text-xs font-medium">
              You
            </div>
            <div className="absolute top-1 right-1 flex gap-1">
              {isMuted && (
                <div className="bg-red-500 text-white p-0.5 rounded">
                  <MicOff className="w-3 h-3" />
                </div>
              )}
            </div>
          </div>

          {/* Remote Participants (Mini) */}
          {participants
            ?.filter(p => !p?.isLocal)
            .map((participant) => (
              <div key={participant?.attendeeId} className="relative bg-gray-200 rounded-lg overflow-hidden border border-gray-300 aspect-video">
                {participant?.videoEnabled && participant?.tileId && (
                  <video
                    id={`video-${participant?.attendeeId}`}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                )}
                {!participant?.videoEnabled && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <VideoOff className="w-6 h-6 text-gray-500" />
                  </div>
                )}
                <div className={`absolute bottom-1 left-1 px-1 py-0.5 rounded text-xs font-medium text-white ${
                  participant?.isActiveSpeaker ? 'bg-green-500' : 'bg-blue-500'
                }`}>
                  {participant?.name}
                </div>
                {participant?.muted && (
                  <div className="absolute top-1 right-1 bg-red-500 text-white p-0.5 rounded">
                    <MicOff className="w-3 h-3" />
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    );
  }

  return (
    /* Normal Video Grid */
    <div className="h-full grid gap-2" style={{
      gridTemplateColumns: participants?.length <= 1 ? '1fr' :
        participants?.length <= 4 ? 'repeat(2, 1fr)' :
          'repeat(3, 1fr)',
      gridTemplateRows: participants?.length <= 2 ? '1fr' : 'repeat(2, 1fr)'
    }}>
      {/* Local Video */}
      <div className="relative bg-gray-200 rounded-lg overflow-hidden border border-gray-300">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${isVideoEnabled ? 'block' : 'hidden'}`}
        />
        {!isVideoEnabled && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <VideoOff className="w-12 h-12 text-gray-500" />
            <p className="text-gray-600 text-sm mt-2">Camera is off</p>
          </div>
        )}
        <div className="absolute bottom-2 left-2 bg-blue-500 text-white px-2 py-1 rounded text-xs font-medium">
          You
        </div>
        <div className="absolute top-2 right-2 flex gap-2">
          {isMuted && (
            <div className="bg-red-500 text-white p-1 rounded">
              <MicOff className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>

      {/* Remote Participants */}
      {participants
        ?.filter(p => !p?.isLocal)
        .map((participant) => (
          <div key={participant?.attendeeId} className="relative bg-gray-200 rounded-lg overflow-hidden border border-gray-300">
            {participant?.videoEnabled && participant?.tileId && (
              <video
                id={`video-${participant?.attendeeId}`}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            )}
            {!participant?.videoEnabled && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <VideoOff className="w-12 h-12 text-gray-500" />
                <p className="text-gray-600 text-sm mt-2">{participant?.name}</p>
              </div>
            )}
            <div className={`absolute bottom-2 left-2 px-2 py-1 rounded text-xs font-medium text-white ${
              participant?.isActiveSpeaker ? 'bg-green-500' : 'bg-blue-500'
            }`}>
              {participant?.name}
            </div>
            {participant?.muted && (
              <div className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded">
                <MicOff className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
    </div>
  );
}