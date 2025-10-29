"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MeetingControls } from "./MeetingControls";
import { MicOff, Monitor, VideoOff } from "lucide-react";

function syncStylesTo(targetDoc) {
    const head = targetDoc.head;
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
        try {
            if (node.tagName.toLowerCase() === 'link') {
                const link = targetDoc.createElement('link');
                Array.from(node.attributes).forEach(attr => link.setAttribute(attr.name, attr.value));
                head.appendChild(link);
            } else if (node.tagName.toLowerCase() === 'style') {
                const style = targetDoc.createElement('style');
                style.textContent = node.textContent;
                head.appendChild(style);
            }
        } catch { }
    });
}

function useBindChimeTiles(pipDoc, meetingSessionRef, participants, contentShareTileId) {
    useEffect(() => {
        if (!pipDoc || !meetingSessionRef?.current) return;
        const av = meetingSessionRef.current.audioVideo;
        participants.forEach((p) => {
            if (!p?.tileId) return;
            const el = pipDoc.getElementById(`pip-video-${p.attendeeId}`);
            if (el) {
                try { av.bindVideoElement(p.tileId, el); } catch { }
            }
        });
        if (contentShareTileId) {
            const el = pipDoc.getElementById('pip-content-share');
            if (el) {
                try { av.bindVideoElement(contentShareTileId, el); } catch { }
            }
        }
    }, [pipDoc, meetingSessionRef, participants, contentShareTileId]);
}

export default function DocumentPiP({
    meetingSessionRef,
    participants = [],
    localUserName = "You",
    isMuted,
    isVideoEnabled,
    screenShareState,
    onToggleMute,
    onToggleVideo,
    onToggleScreenShare,
    onLeaveMeeting,
    onClose,
    existingWindow,
}) {
    const pipWinRef = useRef(null);
    const [pipDoc, setPipDoc] = useState(null);
    const [currentPage, setCurrentPage] = useState(0);
    const containerRef = useRef(null);
    const initWindow = (win) => {
        if (!win) return;
        pipWinRef.current = win;
        setPipDoc(win.document);
        syncStylesTo(win.document);
        const root = win.document.createElement('div');
        root.id = 'pip-root';
        // Ensure no default margins cause clipping/overlap
        win.document.body.style.margin = '0';
        win.document.body.style.backgroundColor = 'white';
        win.document.body.appendChild(root);
        containerRef.current = root;
        let closed = false;
        const handleClose = () => {
            if (closed) return;
            closed = true;
            onClose?.();
        };
        win.addEventListener('pagehide', handleClose);
        win.addEventListener('unload', handleClose);
    };

    useEffect(() => {
        if (existingWindow) {
            initWindow(existingWindow);
            return;
        }
        (async () => {
            if (!('documentPictureInPicture' in window)) {
                console.warn('Document Picture-in-Picture not supported in this browser.');
                return;
            }
            try {
                const win = await window.documentPictureInPicture.requestWindow({ width: 360, height: 520 });
                initWindow(win);
            } catch (e) {
                console.error('Failed to open Document PiP:', e);
            }
        })();
        return () => {
            try { pipWinRef.current?.close(); } catch { }
        };
    }, [existingWindow]);

    // binding is handled after paging is computed so we bind only visible tiles

    const allForPiP = useMemo(() => {
        const syntheticLocal = {
            attendeeId: 'local',
            name: localUserName,
            isLocal: true,
            videoEnabled: isVideoEnabled,
            muted: isMuted,
            tileId: null,
        };
        return [syntheticLocal, ...(participants || []).filter(p => !p.isLocal)];
    }, [participants, localUserName, isVideoEnabled, isMuted]);

    // Pagination and layout values (computed every render)
    const showContentShare = !!(screenShareState?.tileId && (screenShareState?.isSharing));
    const PER_PAGE = 4;
    const totalPages = Math.max(1, Math.ceil(allForPiP.length / PER_PAGE));
    const start = currentPage * PER_PAGE;
    const end = start + PER_PAGE;
    const tiles = allForPiP.slice(start, end);
    const onlyOne = tiles.length === 1;

    // Clamp current page when total pages shrink
    useEffect(() => {
        if (currentPage >= totalPages) {
            setCurrentPage(Math.max(0, totalPages - 1));
        }
    }, [currentPage, totalPages]);

    // Fixed 2x2 grid for consistency (up to 4 tiles per page)

    const Tile = ({ p, full }) => (
        <div className={`relative bg-gray-200 rounded-lg overflow-hidden border border-gray-300 ${full ? 'w-full h-full' : 'aspect-video'}`}>
            {p.tileId && p.videoEnabled && !p.isLocal ? (
                <video id={`pip-video-${p.attendeeId}`} autoPlay playsInline className="w-full h-full object-contain" />
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <VideoOff className="w-6 h-6 text-gray-500" />
                </div>
            )}
            <div className={`pointer-events-none absolute ${full ? 'bottom-3 left-3' : 'bottom-2 left-2'} bg-blue-500 text-white ${full ? 'px-2.5 py-1' : 'px-2 py-1'} rounded text-xs font-medium`}>
                {p.name}
            </div>
            {p.muted && (
                <div className={`pointer-events-none absolute ${full ? 'top-3 right-3' : 'top-2 right-2'} bg-red-500 text-white p-1 rounded`}>
                    <MicOff className="w-4 h-4" />
                </div>
            )}
        </div>
    );

    useBindChimeTiles(pipDoc, meetingSessionRef, tiles.filter(p => !p.isLocal), screenShareState?.tileId);

    if (!pipDoc || !containerRef.current) return null;

    return createPortal(
        <div className="w-full h-screen flex flex-col bg-white text-gray-900">
            <div className="flex-1 p-2 min-h-0 flex flex-col">
                {showContentShare ? (
                    <div className="w-full h-full bg-black rounded-lg overflow-hidden border border-gray-300 relative">
                        <video id="pip-content-share" autoPlay playsInline muted className="w-full h-full object-contain" />
                        <div className="absolute top-2 left-2 bg-blue-500 text-white px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                            <Monitor className="w-3 h-3" />
                            Screen Share
                        </div>
                    </div>
                ) : (
                    <>
                        <div className={onlyOne ? "flex-1 min-h-0" : "flex-1 grid grid-cols-2 grid-rows-2 gap-2 min-h-0"}>
                            {onlyOne ? (
                                <Tile p={tiles[0]} full />
                            ) : (
                                tiles.map((p) => (
                                    <Tile key={p.attendeeId} p={p} />
                                ))
                            )}
                        </div>
                        {totalPages > 1 && (
                            <nav aria-label="PiP pagination" className="flex items-center bg-white z-10 justify-center py-2 gap-1 flex-shrink-0">
                                {Array.from({ length: totalPages }).map((_, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setCurrentPage(index)}
                                        className={`h-2 cursor-pointer w-2 flex items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400/60`}
                                        aria-current={index === currentPage ? 'page' : undefined}
                                        title={`Go to page ${index + 1}`}
                                    >
                                        <span className={`block rounded-full transition-all ${index === currentPage ? 'bg-blue-500 w-2 h-2' : 'bg-gray-300 hover:bg-gray-400 w-2 h-2'}`} />
                                    </button>
                                ))}
                            </nav>
                        )}
                    </>
                )}
            </div>
            <div className="z-10">
                <MeetingControls
                    isMuted={isMuted}
                    isVideoEnabled={isVideoEnabled}
                    isLocalScreenSharing={!!screenShareState?.isMyShare}
                    isRemoteScreenSharing={!!(screenShareState?.isSharing && !screenShareState?.isMyShare)}
                    onToggleMute={onToggleMute}
                    onToggleVideo={onToggleVideo}
                    onToggleScreenShare={onToggleScreenShare}
                    onLeaveMeeting={onLeaveMeeting}
                />
            </div>

        </div>,
        containerRef.current
    );
}
