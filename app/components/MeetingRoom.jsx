"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ConsoleLogger,
  LogLevel,
  DefaultDeviceController,
  DefaultMeetingSession,
  MeetingSessionConfiguration,
  DefaultActiveSpeakerPolicy,
} from "amazon-chime-sdk-js";
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Users } from "lucide-react";

export function MeetingRoom({ meetingData }) {
  const { Meeting, Attendee } = meetingData || {};

  const meetingSessionRef = useRef(null);
  const videoTilesRef = useRef(new Map());
  const containerRef = useRef(null);
  const localVideoEl = useRef(null);
  const audioElementRef = useRef(null);

  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState(null);
  const [devices, setDevices] = useState({ audioIn: [], videoIn: [], audioOut: [] });
  const [selectedAudioIn, setSelectedAudioIn] = useState("");
  const [selectedVideoIn, setSelectedVideoIn] = useState("");
  const [participants, setParticipants] = useState([]);
  const [showParticipants, setShowParticipants] = useState(false);

  useEffect(() => {
    async function initSession() {
      if (!Meeting || !Attendee) {
        setError("Invalid meeting or attendee data. Please check the meeting configuration.");
        return;
      }

      try {
        const config = new MeetingSessionConfiguration(Meeting, Attendee);
        const logger = new ConsoleLogger("SDK", LogLevel.INFO);
        const deviceController = new DefaultDeviceController(logger);
        const meetingSession = new DefaultMeetingSession(config, logger, deviceController);
        meetingSessionRef.current = meetingSession;

        const observer = {
          videoTileDidUpdate: (tileState) => {
            if (!tileState.boundAttendeeId || !tileState.tileId) return;

            const participantName =
              tileState.boundExternalUserId?.split("#")[1] || `Participant ${tileState.tileId}`;

            if (tileState.localTile) {
              // Local video tile
              if (localVideoEl.current) {
                try {
                  meetingSession.audioVideo.bindVideoElement(tileState.tileId, localVideoEl.current);
                  setCameraOn(true);
                } catch (bindError) {
                  console.error("Failed to bind local video:", bindError);
                  setError("Failed to display your video. Check camera permissions.");
                }
              }
            } else {
              // Remote video tile - create and bind immediately
              if (videoTilesRef.current.has(tileState.tileId)) {
                return;
              }

              // Store the tile mapping for later use
              videoTilesRef.current.set(tileState.tileId, { 
                attendeeId: tileState.boundAttendeeId,
                tileId: tileState.tileId 
              });

              // Create video element and bind it immediately
              const videoElement = document.createElement("video");
              videoElement.autoPlay = true;
              videoElement.playsInline = true;
              videoElement.className = "w-full h-full object-cover bg-gray-700";
              videoElement.id = `remote-video-${tileState.tileId}`;

              try {
                // Bind the video element to this tile
                meetingSession.audioVideo.bindVideoElement(tileState.tileId, videoElement);

                // Create wrapper and add to container
                const wrapper = document.createElement("div");
                wrapper.className = "relative aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-300";
                wrapper.id = `wrapper-${tileState.tileId}`;
                
                const label = document.createElement("div");
                label.className = "absolute bottom-2 left-2 bg-gray-800 bg-opacity-70 text-white px-3 py-1 rounded-lg text-sm";
                label.textContent = participantName;

                wrapper.appendChild(videoElement);
                wrapper.appendChild(label);

                if (containerRef.current) {
                  containerRef.current.appendChild(wrapper);
                }

              } catch (bindError) {
                console.error("Failed to bind remote video:", bindError);
                setError(`Failed to display video for ${participantName}`);
                videoTilesRef.current.delete(tileState.tileId);
                return;
              }

              // Update participants state - ONLY update video status for existing participants
              setParticipants((prev) => {
                const existing = prev.find((p) => p.attendeeId === tileState.boundAttendeeId);
                if (existing) {
                  return prev.map((p) =>
                    p.attendeeId === tileState.boundAttendeeId 
                      ? { ...p, videoOn: true, tileId: tileState.tileId } 
                      : p
                  );
                } else {
                  // Add participant with video on (fallback)
                  return [
                    ...prev,
                    {
                      attendeeId: tileState.boundAttendeeId,
                      name: participantName,
                      videoOn: true,
                      muted: true,
                      tileId: tileState.tileId,
                      isLocal: false,
                    },
                  ];
                }
              });
            }
          },

          videoTileWasRemoved: (tileId) => {
            // Remove from DOM
            const wrapper = document.getElementById(`wrapper-${tileId}`);
            if (wrapper) {
              wrapper.remove();
            }

            // Update participants state - just turn off video and clear tile ID, don't remove participant
            const tileInfo = videoTilesRef.current.get(tileId);
            if (tileInfo) {
              setParticipants((prev) =>
                prev.map((p) =>
                  p.attendeeId === tileInfo.attendeeId 
                    ? { ...p, videoOn: false, tileId: null } 
                    : p
                )
              );
            }

            // Clean up tile mapping
            videoTilesRef.current.delete(tileId);
          },

          audioVideoDidStart: () => {
            setJoined(true);
            setError(null);
          },

          audioVideoDidStop: () => {
            setJoined(false);
            setMuted(false);
            setCameraOn(false);
            setSharing(false);
            setParticipants([]);
          },

          audioVideoDidFailOnConnect: (error) => {
            console.error("Failed to connect audio/video:", error);
            setError(`Failed to connect to meeting: ${error.message || "Unknown error"}`);
            setJoined(false);
          },
        };

        meetingSession.audioVideo.addObserver(observer);

        meetingSession.audioVideo.realtimeSubscribeToAttendeeIdPresence((attendeeId, present) => {
          setParticipants((prev) => {
            if (present) {
              const existing = prev.find((p) => p.attendeeId === attendeeId);
              if (existing) {
                return prev; // Don't add duplicates, keep existing state
              }
              const participantName = attendeeId === Attendee.AttendeeId 
                ? (Attendee.ExternalUserId?.split("#")[1] || "You")
                : `Participant ${attendeeId.slice(-4)}`;
              
              return [
                ...prev,
                {
                  attendeeId,
                  name: participantName,
                  videoOn: false, // Start with video off, will be updated by video tile observer
                  muted: true,
                  isLocal: attendeeId === Attendee.AttendeeId,
                  tileId: null,
                },
              ];
            } else {
              // Only remove participant if they actually left the meeting (not just turned off camera)
              return prev.filter((p) => p.attendeeId !== attendeeId);
            }
          });
        });

        meetingSession.audioVideo.realtimeSubscribeToMuteAndUnmuteLocalAudio((isMuted) => {
          setMuted(isMuted);
          setParticipants((prev) =>
            prev.map((p) =>
              p.attendeeId === Attendee.AttendeeId ? { ...p, muted: isMuted } : p
            )
          );
        });

        // Active speaker detection
        try {
          meetingSession.audioVideo.subscribeToActiveSpeakerDetector(
            new DefaultActiveSpeakerPolicy(),
            (activeSpeakers) => {
              setParticipants((prev) =>
                prev.map((p) => ({
                  ...p,
                  isActiveSpeaker: activeSpeakers.includes(p.attendeeId),
                }))
              );
            }
          );
        } catch (activeSpeakerError) {
          console.warn("Active speaker detection not available:", activeSpeakerError);
        }

        // Initialize devices
        const updateDevices = async () => {
          const audioInputs = await meetingSession.audioVideo.listAudioInputDevices();
          const videoInputs = await meetingSession.audioVideo.listVideoInputDevices();
          const audioOutputs = await meetingSession.audioVideo.listAudioOutputDevices();
          setDevices({ audioIn: audioInputs, videoIn: videoInputs, audioOut: audioOutputs });
          if (audioInputs.length && !selectedAudioIn) setSelectedAudioIn(audioInputs[0].deviceId);
          if (videoInputs.length && !selectedVideoIn) setSelectedVideoIn(videoInputs[0].deviceId);
        };
        await updateDevices();

        // Listen for device changes
        navigator.mediaDevices.addEventListener("devicechange", updateDevices);

        // Create audio element
        audioElementRef.current = document.createElement("audio");
        audioElementRef.current.id = "meeting-audio";
        audioElementRef.current.autoplay = true;
        document.body.appendChild(audioElementRef.current);

        return () => {
          navigator.mediaDevices.removeEventListener("devicechange", updateDevices);
          if (meetingSessionRef.current) {
            meetingSession.audioVideo.removeObserver(observer);
            meetingSession.audioVideo.stop();
            meetingSession.audioVideo.stopLocalVideoTile();
            meetingSession.audioVideo.stopContentShare();
            if (audioElementRef.current) {
              meetingSession.audioVideo.unbindAudioElement();
              audioElementRef.current.remove();
              audioElementRef.current = null;
            }
          }
          videoTilesRef.current.clear();
          setParticipants([]);
        };
      } catch (e) {
        console.error("Init error:", e);
        setError("Failed to initialize meeting session. Please check your connection or permissions.");
      }
    }

    initSession();
  }, [Meeting, Attendee]);

  async function joinMeeting() {
    const ms = meetingSessionRef.current;
    if (!ms) {
      setError("Meeting session not initialized");
      return;
    }

    try {
      if (selectedAudioIn) {
        const audioDevice = devices.audioIn.find((d) => d.deviceId === selectedAudioIn);
        if (audioDevice) {
          await ms.audioVideo.startAudioInput(audioDevice);
        }
      } else if (devices.audioIn.length > 0) {
        await ms.audioVideo.startAudioInput(devices.audioIn[0]);
      } else {
        setError("No audio input devices available");
      }

      if (selectedVideoIn) {
        const videoDevice = devices.videoIn.find((d) => d.deviceId === selectedVideoIn);
        if (videoDevice) {
          await ms.audioVideo.startVideoInput(videoDevice);
        }
      } else if (devices.videoIn.length > 0) {
        await ms.audioVideo.startVideoInput(devices.videoIn[0]);
      } else {
        console.warn("No video input devices available");
      }

      if (audioElementRef.current) {
        await ms.audioVideo.bindAudioElement(audioElementRef.current);
      }

      await ms.audioVideo.start();
      ms.audioVideo.startLocalVideoTile();
    } catch (error) {
      console.error("Error joining meeting:", error);
      setError(`Failed to join meeting: ${error.message || "Unknown error"}`);
    }
  }

  async function toggleMic() {
    const ms = meetingSessionRef.current;
    if (!ms) {
      setError("Meeting session not initialized");
      return;
    }
    try {
      if (muted) {
        ms.audioVideo.realtimeUnmuteLocalAudio();
      } else {
        ms.audioVideo.realtimeMuteLocalAudio();
      }
    } catch (error) {
      console.error("Error toggling mic:", error);
      setError(`Error toggling microphone: ${error.message || "Unknown error"}`);
    }
  }

  async function toggleCamera() {
    const ms = meetingSessionRef.current;
    if (!ms) {
      setError("Meeting session not initialized");
      return;
    }
    try {
      if (cameraOn) {
        ms.audioVideo.stopLocalVideoTile();
        setCameraOn(false);
      } else {
        if (selectedVideoIn && devices.videoIn.length > 0) {
          const videoDevice = devices.videoIn.find((d) => d.deviceId === selectedVideoIn) || devices.videoIn[0];
          await ms.audioVideo.startVideoInput(videoDevice);
          ms.audioVideo.startLocalVideoTile();
          setCameraOn(true);
        } else {
          setError("No video input devices available");
        }
      }
      setParticipants((prev) =>
        prev.map((p) =>
          p.attendeeId === Attendee.AttendeeId ? { ...p, videoOn: !cameraOn } : p
        )
      );
    } catch (error) {
      console.error("Error toggling camera:", error);
      setError(`Error toggling camera: ${error.message || "Unknown error"}`);
    }
  }

  async function toggleScreenShare() {
    const ms = meetingSessionRef.current;
    if (!ms) {
      setError("Meeting session not initialized");
      return;
    }
    try {
      if (sharing) {
        await ms.audioVideo.stopContentShare();
        setSharing(false);
      } else {
        await ms.audioVideo.startContentShareFromScreenCapture();
        setSharing(true);
      }
    } catch (error) {
      console.error("Error toggling screen share:", error);
      setError(
        error.name === "NotAllowedError"
          ? "Screen sharing permission denied. Please allow screen sharing in your browser."
          : `Error toggling screen share: ${error.message || "Unknown error"}`
      );
    }
  }

  function leaveMeeting() {
    const ms = meetingSessionRef.current;
    if (!ms) {
      setError("Meeting session not initialized");
      return;
    }
    try {
      ms.audioVideo.stop();
      ms.audioVideo.stopLocalVideoTile();
      ms.audioVideo.stopContentShare();
      
      // Clean up all remote video elements
      videoTilesRef.current.forEach((tileInfo, tileId) => {
        const wrapper = document.getElementById(`wrapper-${tileId}`);
        if (wrapper) {
          wrapper.remove();
        }
      });
      
      if (audioElementRef.current) {
        ms.audioVideo.unbindAudioElement();
        audioElementRef.current.remove();
        audioElementRef.current = null;
      }
      
      videoTilesRef.current.clear();
      setParticipants([]);
      setError(null);
    } catch (error) {
      console.error("Error leaving meeting:", error);
      setError(`Error leaving meeting: ${error.message || "Unknown error"}`);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex flex-col p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white rounded-2xl shadow-sm p-4 mb-6 flex justify-between items-center">
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-800">Video Conference</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Meeting ID: {Meeting?.MeetingId || "N/A"}</span>
            <button
              onClick={() => setShowParticipants(!showParticipants)}
              className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              title="Toggle participants list"
              aria-label="Toggle participants list"
            >
              <Users size={20} className="text-gray-600" />
            </button>
          </div>
        </header>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Video Grid */}
          <div className="flex-1 p-4 bg-white rounded-2xl shadow-sm">
            <h2 className="text-lg font-medium text-gray-800 mb-4">Participants</h2>
            <div ref={containerRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Local Video */}
              <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-300">
                <video
                  ref={localVideoEl}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 bg-gray-800 bg-opacity-70 text-white px-3 py-1 rounded-lg text-sm">
                  You {muted && <MicOff size={16} className="inline ml-1" />}
                  {!cameraOn && <VideoOff size={16} className="inline ml-1" />}
                </div>
                {!cameraOn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-200 text-gray-600">
                    Camera Off
                  </div>
                )}
              </div>

              {/* Remote Videos will be added here dynamically by the observer */}
              
              {/* Show message when no remote participants */}
              {videoTilesRef.current.size === 0 && joined && (
                <div className="col-span-full flex items-center justify-center h-64 text-gray-600">
                  No other participants in the meeting
                </div>
              )}
              {!joined && (
                <div className="col-span-full flex items-center justify-center h-64 text-gray-600">
                  Join the meeting to see participants
                </div>
              )}
            </div>
          </div>

          {/* Participants Sidebar */}
          {showParticipants && (
            <div className="w-64 bg-white rounded-2xl shadow-sm p-4 ml-4">
              <h2 className="text-lg font-medium text-gray-800 mb-4">
                Participants ({participants.length})
              </h2>
              <ul className="space-y-2">
                {participants.map((participant) => (
                  <li
                    key={participant.attendeeId}
                    className={`p-2 rounded-lg ${
                      participant.isActiveSpeaker ? "bg-blue-100" : "bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm text-gray-800">
                      <span>{participant.name}</span>
                      {participant.muted && <MicOff size={16} />}
                      {!participant.videoOn && <VideoOff size={16} />}
                      {participant.isLocal && <span className="text-xs text-gray-500">(You)</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Control Bar */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mt-6 flex justify-center items-center gap-4">
          {!joined ? (
            <div className="flex gap-4 flex-wrap items-center">
              <select
                value={selectedAudioIn}
                onChange={(e) => setSelectedAudioIn(e.target.value)}
                className="p-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-blue-500"
                aria-label="Select audio input device"
              >
                <option value="">Select Audio Input</option>
                {devices.audioIn.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || "Unknown Audio Device"}
                  </option>
                ))}
              </select>
              <select
                value={selectedVideoIn}
                onChange={(e) => setSelectedVideoIn(e.target.value)}
                className="p-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-blue-500"
                aria-label="Select video input device"
              >
                <option value="">Select Video Input</option>
                {devices.videoIn.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || "Unknown Video Device"}
                  </option>
                ))}
              </select>
              <button
                onClick={joinMeeting}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                disabled={!meetingSessionRef.current}
                aria-label="Join meeting"
              >
                Join Meeting
              </button>
              <div className="text-xs text-gray-600">
                Devices: {devices.videoIn.length} cameras, {devices.audioIn.length} mics
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={toggleMic}
                className={`p-3 rounded-lg ${
                  muted ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
                } text-white transition-colors`}
                title={muted ? "Unmute microphone" : "Mute microphone"}
                aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              >
                {muted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
              <button
                onClick={toggleCamera}
                className={`p-3 rounded-lg ${
                  cameraOn ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                } text-white transition-colors`}
                title={cameraOn ? "Turn off camera" : "Turn on camera"}
                aria-label={cameraOn ? "Turn off camera" : "Turn on camera"}
              >
                {cameraOn ? <Video size={24} /> : <VideoOff size={24} />}
              </button>
              <button
                onClick={toggleScreenShare}
                className={`p-3 rounded-lg ${
                  sharing ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-600 hover:bg-gray-700"
                } text-white transition-colors`}
                title={sharing ? "Stop screen sharing" : "Start screen sharing"}
                aria-label={sharing ? "Stop screen sharing" : "Start screen sharing"}
              >
                <MonitorUp size={24} />
              </button>
              <button
                onClick={leaveMeeting}
                className="p-3 rounded-lg bg-red-700 hover:bg-red-800 text-white transition-colors"
                title="Leave meeting"
                aria-label="Leave meeting"
              >
                <PhoneOff size={24} />
              </button>
            </>
          )}
        </div>

        {joined && (
          <div className="mt-4 text-center text-sm text-gray-600">
            <span className="inline-flex items-center gap-2">
              Microphone: {muted ? "Muted" : "Unmuted"} | Camera: {cameraOn ? "On" : "Off"} | Screen: {sharing ? "Sharing" : "Not Sharing"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}