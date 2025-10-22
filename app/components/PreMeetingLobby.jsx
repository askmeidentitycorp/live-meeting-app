"use client";

import { Video } from "lucide-react";
import { DeviceSelector } from "./DeviceSelector";
import { VideoPreview } from "./VideoPreview";
import { PreMeetingControls } from "./PreMeetingControls";
import { ErrorDisplay } from "./ErrorDisplay";

import { useState } from "react";

function AnimatedCopyButton({ meetingId }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`px-2 py-1 bg-blue-500 text-white rounded text-xs font-medium cursor-pointer transition-all duration-300 ${copied ? 'scale-110 bg-green-500' : ''}`}
      onClick={() => {
        navigator.clipboard.writeText(`${window.location.origin}?id=${meetingId}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1000);
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

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
  onJoinMeeting,
  meetingId
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
        {meetingId && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Meeting URL</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}?id=${meetingId}`}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50 text-gray-700 cursor-pointer"
                onClick={e => e.target.select()}
              />
              <AnimatedCopyButton meetingId={meetingId} />
            </div>
          </div>
        )}
        <button
          onClick={onJoinMeeting}
          className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed cursor-pointer"
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