"use client";

import { Mic, MicOff, Video, VideoOff, Monitor, PhoneOff } from "lucide-react";

export function MeetingControls({
  isMuted,
  isVideoEnabled,
  isLocalScreenSharing,
  isRemoteScreenSharing,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onLeaveMeeting
}) {
  return (
    <div className="flex-shrink-0 bg-gray-100 border-t border-gray-200 px-4 py-4">
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onToggleMute}
          className={`p-3 rounded-lg text-white ${
            isMuted
              ? 'bg-red-500 hover:bg-red-600'
              : 'bg-green-500 hover:bg-green-600'
          } transition-colors`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>

        <button
          onClick={onToggleVideo}
          className={`p-3 rounded-lg text-white ${
            !isVideoEnabled
              ? 'bg-red-500 hover:bg-red-600'
              : 'bg-blue-500 hover:bg-blue-600'
          } transition-colors`}
          title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {isVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
        </button>

        <button
          onClick={onToggleScreenShare}
          disabled={isRemoteScreenSharing && !isLocalScreenSharing}
          className={`p-3 rounded-lg ${
            isLocalScreenSharing
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : isRemoteScreenSharing && !isLocalScreenSharing
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          } transition-colors`}
          title={
            isLocalScreenSharing 
              ? 'Stop sharing' 
              : isRemoteScreenSharing && !isLocalScreenSharing 
                ? 'Someone else is sharing' 
                : 'Share screen'
          }
        >
          <Monitor size={18} />
        </button>

        <button
          onClick={onLeaveMeeting}
          className="px-4 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors flex items-center gap-2"
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
}