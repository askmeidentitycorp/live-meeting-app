"use client";

import { useState } from "react";
import { VideoOff, MicOff, Monitor, ChevronLeft, ChevronRight } from "lucide-react";

// Reusable Participant Card Component
function ParticipantCard({ participant, size = "default" }) {
  const isSmall = size === "small";
  
  return (
    <div className={`relative bg-gray-200 rounded-lg overflow-hidden border border-gray-300 ${isSmall ? 'aspect-video' : ''}`}>
      {participant.isLocal ? (
        <>
          <video
            ref={participant.videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${participant.videoEnabled ? 'block' : 'hidden'}`}
          />
          {!participant.videoEnabled && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <VideoOff className={`${isSmall ? 'w-6 h-6' : 'w-12 h-12'} text-gray-500`} />
              {!isSmall && <p className="text-gray-600 text-sm mt-2">Camera is off</p>}
            </div>
          )}
          <div className={`absolute ${isSmall ? 'bottom-1 left-1' : 'bottom-2 left-2'} bg-blue-500 text-white ${isSmall ? 'px-1 py-0.5' : 'px-2 py-1'} rounded text-xs font-medium`}>
            {participant.name}
          </div>
          <div className={`absolute ${isSmall ? 'top-1 right-1' : 'top-2 right-2'} flex ${isSmall ? 'gap-1' : 'gap-2'}`}>
            {participant.muted && (
              <div className={`bg-red-500 text-white ${isSmall ? 'p-0.5' : 'p-1'} rounded`}>
                <MicOff className={`${isSmall ? 'w-3 h-3' : 'w-4 h-4'}`} />
              </div>
            )}
          </div>
        </>
      ) : (
        <>
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
              <VideoOff className={`${isSmall ? 'w-6 h-6' : 'w-12 h-12'} text-gray-500`} />
              {!isSmall && <p className="text-gray-600 text-sm mt-2">{participant?.name}</p>}
            </div>
          )}
          <div className={`absolute ${isSmall ? 'bottom-1 left-1' : 'bottom-2 left-2'} ${isSmall ? 'px-1 py-0.5' : 'px-2 py-1'} rounded text-xs font-medium text-white ${
            participant?.isActiveSpeaker ? 'bg-green-500' : 'bg-blue-500'
          }`}>
            {participant?.name}
          </div>
          {participant?.muted && (
            <div className={`absolute ${isSmall ? 'top-1 right-1' : 'top-2 right-2'} bg-red-500 text-white ${isSmall ? 'p-0.5' : 'p-1'} rounded`}>
              <MicOff className={`${isSmall ? 'w-3 h-3' : 'w-4 h-4'}`} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Reusable Pagination Controls Component
function PaginationControls({ currentPage, totalPages, onNext, onPrev, totalCount, compact = false }) {
  if (totalPages <= 1) return null;

  if (compact) {
    return (
      <div className="flex items-center justify-between px-1">
        <button
          onClick={onPrev}
          disabled={currentPage === 0}
          className={`p-0.5 rounded transition-colors ${
            currentPage === 0
              ? 'text-gray-400 cursor-not-allowed'
              : 'text-gray-700 hover:bg-gray-200'
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        
        <div className="text-xs text-gray-600">
          {currentPage + 1}/{totalPages}
        </div>
        
        <button
          onClick={onNext}
          disabled={currentPage >= totalPages - 1}
          className={`p-0.5 rounded transition-colors ${
            currentPage >= totalPages - 1
              ? 'text-gray-400 cursor-not-allowed'
              : 'text-gray-700 hover:bg-gray-200'
          }`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between mb-2 px-2">
      <button
        onClick={onPrev}
        disabled={currentPage === 0}
        className={`p-1 rounded-lg transition-colors ${
          currentPage === 0
            ? 'text-gray-400 cursor-not-allowed'
            : 'text-gray-700 hover:bg-gray-200'
        }`}
        title="Previous Page"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      
      <div className="text-sm text-gray-600 font-medium">
        Page {currentPage + 1} of {totalPages} ({totalCount} participants)
      </div>
      
      <button
        onClick={onNext}
        disabled={currentPage >= totalPages - 1}
        className={`p-1 rounded-lg transition-colors ${
          currentPage >= totalPages - 1
            ? 'text-gray-400 cursor-not-allowed'
            : 'text-gray-700 hover:bg-gray-200'
        }`}
        title="Next Page"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}

function getGridLayout(count) {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  
  return {
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`
  };
}

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
  const [currentPage, setCurrentPage] = useState(0);
  const [sidebarPage, setSidebarPage] = useState(0);
  const PARTICIPANTS_PER_PAGE = 9;
  const SIDEBAR_PARTICIPANTS_PER_PAGE = 4;

  // Combine local and remote participants for pagination
  const allParticipants = [
    {
      isLocal: true,
      attendeeId: 'local',
      name: 'You',
      videoEnabled: isVideoEnabled,
      muted: isMuted,
      videoRef: localVideoRef
    },
    ...(participants?.filter(p => !p?.isLocal) || [])
  ];

  const totalPages = Math.ceil(allParticipants.length / PARTICIPANTS_PER_PAGE);
  const currentParticipants = allParticipants.slice(
    currentPage * PARTICIPANTS_PER_PAGE,
    (currentPage + 1) * PARTICIPANTS_PER_PAGE
  );

  const sidebarTotalPages = Math.ceil(allParticipants.length / SIDEBAR_PARTICIPANTS_PER_PAGE);
  const sidebarParticipants = allParticipants.slice(
    sidebarPage * SIDEBAR_PARTICIPANTS_PER_PAGE,
    (sidebarPage + 1) * SIDEBAR_PARTICIPANTS_PER_PAGE
  );

  // Reset pages if they become invalid
  if (currentPage >= totalPages && totalPages > 0) {
    setCurrentPage(0);
  }
  if (sidebarPage >= sidebarTotalPages && sidebarTotalPages > 0) {
    setSidebarPage(0);
  }

  // Screen Share Layout
  if (contentShareTileId && (isLocalScreenSharing || isRemoteScreenSharing)) {
    return (
      <div className="h-full flex gap-3">
        {/* Main Content Share Area */}
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

        {/* Participant Videos Sidebar */}
        <div className="w-60 flex flex-col gap-2">
          <PaginationControls
            currentPage={sidebarPage}
            totalPages={sidebarTotalPages}
            onNext={() => setSidebarPage(prev => Math.min(prev + 1, sidebarTotalPages - 1))}
            onPrev={() => setSidebarPage(prev => Math.max(prev - 1, 0))}
            totalCount={allParticipants.length}
            compact
          />
          
          {sidebarParticipants.map((participant) => (
            <ParticipantCard 
              key={participant?.attendeeId} 
              participant={participant} 
              size="small" 
            />
          ))}
        </div>
      </div>
    );
  }

  // Normal Video Grid Layout
  return (
    <div className="h-full flex flex-col">
      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onNext={() => setCurrentPage(prev => Math.min(prev + 1, totalPages - 1))}
        onPrev={() => setCurrentPage(prev => Math.max(prev - 1, 0))}
        totalCount={allParticipants.length}
      />

      {/* Video Grid */}
      <div className="flex-1 grid gap-2" style={getGridLayout(currentParticipants.length)}>
        {currentParticipants.map((participant) => (
          <ParticipantCard 
            key={participant?.attendeeId} 
            participant={participant} 
          />
        ))}
      </div>

      {/* Page Indicators (Dots) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {Array.from({ length: totalPages }).map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentPage(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentPage
                  ? 'bg-blue-500 w-4'
                  : 'bg-gray-300 hover:bg-gray-400'
              }`}
              title={`Go to page ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}