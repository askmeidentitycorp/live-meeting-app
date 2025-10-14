"use client";

import { Mic, Video } from "lucide-react";

export function DeviceSelector({
  devices,
  selectedAudioInput,
  selectedVideoInput,
  onAudioInputChange,
  onVideoInputChange
}) {
  return (
    <div className="space-y-4 mb-6">
      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
          <Mic className="w-5 h-5 text-blue-500" />
          Microphone
        </label>
        <select
          value={selectedAudioInput}
          onChange={(e) => onAudioInputChange(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="" className="text-gray-500">Select microphone...</option>
          {devices.audioInputs.map((device) => (
            <option key={device.deviceId} value={device.deviceId} className="text-gray-900">
              {device.label || "Unknown Microphone"}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
          <Video className="w-5 h-5 text-blue-500" />
          Camera
        </label>
        <select
          value={selectedVideoInput}
          onChange={(e) => onVideoInputChange(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="" className="text-gray-500">Select camera...</option>
          {devices.videoInputs.map((device) => (
            <option key={device.deviceId} value={device.deviceId} className="text-gray-900">
              {device.label || "Unknown Camera"}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}