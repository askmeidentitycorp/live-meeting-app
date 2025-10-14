"use client";

import { Mic, MicOff, Video, VideoOff } from "lucide-react";

export function PreMeetingControls({
  isVideoEnabled,
  isMuted,
  onToggleVideo,
  onToggleMute
}) {
  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      <button
        onClick={onToggleVideo}
        className={`p-3 rounded-lg flex flex-col items-center justify-center gap-2 text-sm font-medium ${
          isVideoEnabled
            ? 'bg-blue-500 text-white'
            : 'bg-gray-200 text-gray-700'
        } hover:bg-blue-600 hover:text-white transition-colors`}
      >
        {isVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
        <span>{isVideoEnabled ? 'Camera On' : 'Camera Off'}</span>
      </button>

      <button
        onClick={onToggleMute}
        className={`p-3 rounded-lg flex flex-col items-center justify-center gap-2 text-sm font-medium ${
          isMuted
            ? 'bg-red-500 text-white'
            : 'bg-green-500 text-white'
        } hover:bg-opacity-80 transition-colors`}
      >
        {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
        <span>{isMuted ? 'Muted' : 'Unmuted'}</span>
      </button>
    </div>
  );
}