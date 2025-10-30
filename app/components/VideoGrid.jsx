"use client";

import { useState, useRef, useEffect } from "react";
import { VideoOff, MicOff, Monitor, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Maximize, Minimize } from "lucide-react";

function ParticipantCard({ participant, size = "default" }) {
  const isSmall = size === "small";

  return (
    <div className={`relative bg-gray-200 rounded-lg overflow-hidden border border-gray-300 ${isSmall ? 'aspect-square lg:aspect-video' : 'w-full h-full'}`}>
      {participant.isLocal ? (
        <>
          <video
            ref={participant.videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-contain ${participant.videoEnabled ? 'block' : 'hidden'}`}
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
              className="w-full h-full object-contain"
            />
          )}
          {!participant?.videoEnabled && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <VideoOff className={`${isSmall ? 'w-6 h-6' : 'w-12 h-12'} text-gray-500`} />
              {!isSmall && <p className="text-gray-600 text-sm mt-2">{participant?.name}</p>}
            </div>
          )}
          <div className={`absolute ${isSmall ? 'bottom-1 left-1' : 'bottom-2 left-2'} ${isSmall ? 'px-1 py-0.5' : 'px-2 py-1'} rounded text-xs font-medium text-white ${participant?.isActiveSpeaker ? 'bg-green-500' : 'bg-blue-500'
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const sidebarScrollRef = useRef(null);
  const screenShareRef = useRef(null);
  const PARTICIPANTS_PER_PAGE = 9;

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

  if (currentPage >= totalPages && totalPages > 0) {
    setCurrentPage(0);
  }

  const scrollSidebar = (direction) => {
    const el = sidebarScrollRef.current;
    if (!el) return;

    const scrollAmount = 150;
    const isHorizontal = el.scrollWidth > el.clientWidth;

    if (isHorizontal) {
      const current = el.scrollLeft;
      if (direction === 'left' || direction === 'up') {
        el.scrollTo({ left: current - scrollAmount, behavior: 'smooth' });
      } else {
        el.scrollTo({ left: current + scrollAmount, behavior: 'smooth' });
      }
    } else {
      const current = el.scrollTop;
      if (direction === 'up') {
        el.scrollTo({ top: current - scrollAmount, behavior: 'smooth' });
      } else {
        el.scrollTo({ top: current + scrollAmount, behavior: 'smooth' });
      }
    }
  };

  const toggleFullscreen = async () => {
    if (!screenShareRef.current) return;

    try {
      if (!isFullscreen) {
        if (screenShareRef.current.requestFullscreen) {
          await screenShareRef.current.requestFullscreen();
        } else if (screenShareRef.current.webkitRequestFullscreen) {
          await screenShareRef.current.webkitRequestFullscreen();
        } else if (screenShareRef.current.msRequestFullscreen) {
          await screenShareRef.current.msRequestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error);
    }
  };

  useEffect(() => {
    const handleFullScreenChange = () => {
      const fsActive = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      );
      setIsFullscreen(fsActive);
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
    document.addEventListener('msfullscreenchange', handleFullScreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullScreenChange);
      document.removeEventListener('msfullscreenchange', handleFullScreenChange);
    };
  }, []);

  if (contentShareTileId && (isLocalScreenSharing || isRemoteScreenSharing)) {
    return (
      <div className="h-full flex lg:flex-row flex-col md:flex-col gap-3">
        <div ref={screenShareRef} className="flex-1 bg-black rounded-lg overflow-hidden border border-gray-300 relative">
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
          <button
            onClick={toggleFullscreen}
            className="absolute top-2 right-2 bg-gray-800 bg-opacity-70 hover:bg-opacity-90 text-white p-2 rounded-lg transition-all"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>

        <div className="lg:w-60 w-[93vw] overflow-scroll flex flex-row lg:flex-col gap-2">
          <button
            onClick={() => scrollSidebar('up')}
            className="p-2 rounded-lg transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700 hidden lg:flex lg:items-center lg:justify-center"
            title="Scroll Up"
          >
            <ChevronUp className="w-5 h-5" />
          </button>

          <div
            ref={sidebarScrollRef}
            className="participant-scroll flex-1 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto scroll-smooth"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            <style jsx>{`
              .participant-scroll::-webkit-scrollbar {
                display: none;
              }
            `}</style>

            {allParticipants.map((participant) => (
              <div
                key={participant?.attendeeId}
                className="lg:h-[135px] lg:min-h-[135px] lg:max-h-[135px] lg:flex-shrink-0 lg:w-full w-[110px] flex-shrink-0"
              >
                <ParticipantCard
                  participant={participant}
                  size="small"
                />
              </div>
            ))}
          </div>

          <button
            onClick={() => scrollSidebar('down')}
            className="p-2 rounded-lg transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700 hidden lg:flex lg:items-center lg:justify-center"
            title="Scroll Down"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col  overflow-hidden">
      <div className="flex-1 grid gap-2 min-h-0" style={getGridLayout(currentParticipants.length)}>
        {currentParticipants.map((participant) => (
          <ParticipantCard
            key={participant?.attendeeId}
            participant={participant}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2 flex-shrink-0">
          {Array.from({ length: totalPages }).map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentPage(index)}
              className={`w-2 h-2 rounded-full transition-all ${index === currentPage
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