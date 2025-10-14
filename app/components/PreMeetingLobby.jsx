"use client";

import { Video } from "lucide-react";
import { DeviceSelector } from "./DeviceSelector";
import { VideoPreview } from "./VideoPreview";
import { PreMeetingControls } from "./PreMeetingControls";
import { ErrorDisplay } from "./ErrorDisplay";

export function PreMeetingLobby({
  connectionError,
  onDismissError,
  devices,
  selectedAudioInput,
  selectedVideoInput,
  onAudioInputChange,
  onVideoInputChange,
  previewVideoRef,
  isVideoEnabled,
  isMuted,
  onToggleVideo,
  onToggleMute,
  onJoinMeeting
}) {
  return (
    <div className="flex-1 flex items-start justify-center overflow-y-auto">
      <div className="bg-gray-100 rounded-lg border border-gray-200 p-6 max-w-md w-full my-8">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Join Meeting</h1>
          <p className="text-gray-600 text-sm">Configure your devices and join the call</p>
        </div>

        <ErrorDisplay 
          connectionError={connectionError} 
          onDismiss={onDismissError} 
        />

        <DeviceSelector
          devices={devices}
          selectedAudioInput={selectedAudioInput}
          selectedVideoInput={selectedVideoInput}
          onAudioInputChange={onAudioInputChange}
          onVideoInputChange={onVideoInputChange}
        />

        <VideoPreview
          previewVideoRef={previewVideoRef}
          isVideoEnabled={isVideoEnabled}
        />

        <PreMeetingControls
          isVideoEnabled={isVideoEnabled}
          isMuted={isMuted}
          onToggleVideo={onToggleVideo}
          onToggleMute={onToggleMute}
        />

        {/* Join Button */}
        <button
          onClick={onJoinMeeting}
          className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          disabled={!selectedAudioInput}
        >
          <div className="flex items-center justify-center gap-2">
            <Video className="w-5 h-5" />
            Join Meeting
          </div>
        </button>
      </div>
    </div>
  );
}