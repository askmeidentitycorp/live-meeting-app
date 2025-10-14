"use client";

import { VideoOff } from "lucide-react";

export function VideoPreview({ previewVideoRef, isVideoEnabled }) {
  return (
    <div className="mb-6">
      <div className="relative aspect-video bg-gray-200 rounded-lg overflow-hidden border border-gray-300">
        <video
          ref={previewVideoRef}
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
        <div className="absolute top-2 left-2 bg-blue-500 text-white px-2 py-1 rounded text-xs font-medium">
          Live Preview
        </div>
      </div>
    </div>
  );
}