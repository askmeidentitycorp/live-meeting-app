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

// Import modular components
import { PreMeetingLobby } from "./PreMeetingLobby";
import { ParticipantsSidebar } from "./ParticipantsSidebar";
import { MeetingHeader } from "./MeetingHeader";
import { VideoGrid } from "./VideoGrid";
import { MeetingControls } from "./MeetingControls";

export function MeetingRoom({ meetingData }) {
  const { Meeting, Attendee } = meetingData || {};

  // Refs for meeting session and DOM elements
  const meetingSessionRef = useRef(null);
  const videoTilesRef = useRef(new Map());
  const containerRef = useRef(null);
  const localVideoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const audioElementRef = useRef(null);
  const previewStreamRef = useRef(null);
  const contentShareVideoRef = useRef(null);
  const screenShareStateRef = useRef({ isSharing: false, isMyShare: false, tileId: null, attendeeId: null });

  // Meeting state
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [screenShareState, setScreenShareState] = useState({
    isSharing: false,
    isMyShare: false,
    tileId: null,
    attendeeId: null
  });

  // Update ref whenever state changes
  useEffect(() => {
    screenShareStateRef.current = screenShareState;
  }, [screenShareState]);
  const [connectionError, setConnectionError] = useState(null);
  const [isLeavingMeeting, setIsLeavingMeeting] = useState(false);

  // Device and participant state
  const [devices, setDevices] = useState({ audioInputs: [], videoInputs: [] });
  const [selectedAudioInput, setSelectedAudioInput] = useState("");
  const [selectedVideoInput, setSelectedVideoInput] = useState("");
  const [participants, setParticipants] = useState([]);
  const [showParticipantsList, setShowParticipantsList] = useState(false);

  // Initialize meeting session
  useEffect(() => {
    let cleanupFunction = null;

    async function initializeMeeting() {
      if (!Meeting || !Attendee) {
        setConnectionError("Invalid meeting data provided.");
        return;
      }

      try {
        const logger = new ConsoleLogger("ChimeMeeting", LogLevel.INFO);
        const deviceController = new DefaultDeviceController(logger);
        const config = new MeetingSessionConfiguration(Meeting, Attendee);

        // Configure meeting session for better stability and connection resilience
        config.enableWebAudio = false; // Disable WebAudio for better compatibility
        config.keepLastFrameWhenPaused = true; // Keep video frames when connection is temporarily lost

        // Add connection retry configuration
        if (config.connectionHealthPolicyConfiguration) {
          config.connectionHealthPolicyConfiguration.cooldownTimeMs = 60000; // 1 minute cooldown
          config.connectionHealthPolicyConfiguration.pastSamplesToConsider = 15;
        }

        const session = new DefaultMeetingSession(config, logger, deviceController);

        meetingSessionRef.current = session;

        audioElementRef.current = document.createElement("audio");
        audioElementRef.current.autoplay = true;
        audioElementRef.current.controls = false;
        document.body.appendChild(audioElementRef.current);

        const meetingObserver = {
          videoTileDidUpdate: (tileState) => {
            console.log("Video tile updated:", tileState);

            if (tileState.localTile && !tileState.isContent) {
              // Handle local camera video
              if (localVideoRef.current) {
                session.audioVideo.bindVideoElement(tileState.tileId, localVideoRef.current);
              }
            } else if (tileState.isContent) {
              // Handle content share (screen share)
              console.log("Content share tile detected:", tileState.tileId);
              
              const contentAttendeeId = tileState.boundAttendeeId || '';
              const baseAttendeeId = contentAttendeeId.split('#')[0];
              const isMyShare = baseAttendeeId === Attendee.AttendeeId;
              
              // Update state with tile info
              setScreenShareState(prev => ({
                ...prev,
                isSharing: true,
                isMyShare: isMyShare,
                tileId: tileState.tileId,
                attendeeId: tileState.boundAttendeeId
              }));
              
              // Bind video element
              setTimeout(() => {
                if (contentShareVideoRef.current && meetingSessionRef.current) {
                  try {
                    meetingSessionRef.current.audioVideo.bindVideoElement(tileState.tileId, contentShareVideoRef.current);
                    console.log("Screen share video bound");
                  } catch (error) {
                    console.error("Failed to bind screen share video:", error);
                  }
                }
              }, 100);
            } else {
              // Handle remote participant video
              handleRemoteVideoTile(tileState);
            }
          },

          videoTileWasRemoved: (tileId) => {
            console.log("Video tile removed:", tileId);
            handleVideoTileRemoval(tileId);
          },

          audioVideoDidStart: () => {
            console.log("Meeting started successfully");
            setIsConnected(true);
            setConnectionError(null);
          },

          audioVideoDidStop: async (sessionStatus) => {
            console.log("Meeting stopped with status:", sessionStatus);
            setIsConnected(false);

            // Extract the actual status code number
            let statusCode = null;
            let reason = null;

            if (sessionStatus) {
              if (typeof sessionStatus.statusCode === 'function') {
                statusCode = sessionStatus.statusCode();
              } else if (typeof sessionStatus.statusCode === 'number') {
                statusCode = sessionStatus.statusCode;
              } else if (typeof sessionStatus === 'number') {
                statusCode = sessionStatus;
              }

              // Extract reason
              reason = sessionStatus?.reason || sessionStatus?.toString();
            }

            console.log("Session ended - Status Code:", statusCode, "Reason:", reason);

            // Don't show error messages if user is voluntarily leaving
            if (isLeavingMeeting) {
              console.log("Meeting ended by user action");
              return;
            }

            // Handle SignalingChannelClosedUnexpectedly specifically
            if (reason === "SignalingChannelClosedUnexpectedly" || statusCode === 7) {
              console.warn("Signaling channel closed unexpectedly - connection lost");
              setConnectionError("Connection lost. This can happen due to network issues or server problems. Please try rejoining.");
            }
            // Handle other specific errors
            else if (statusCode === 12 ||
              statusCode === 11 ||
              sessionStatus?.reason === "AudioJoinedFromAnotherDevice") {

              console.warn("Session disconnected due to concurrent session or duplicate user");
              setConnectionError("Connection interrupted. This may happen when multiple people join simultaneously. Please try rejoining.");
            } else if (statusCode && statusCode !== 1) {
              // Only show error for non-normal endings (status code 1 is normal)
              handleMeetingEndReason(statusCode);
            }

            // Delayed cleanup to prevent session conflicts
            setTimeout(async () => {
              await cleanup();
            }, 2000);
          },

          audioVideoDidStartConnecting: (reconnecting) => {
            console.log(reconnecting ? "Reconnecting to meeting..." : "Connecting to meeting...");
            if (reconnecting) {
              setConnectionError("Connection lost. Attempting to reconnect...");
            } else {
              // Clear error when starting fresh connection
              setConnectionError(null);
            }
          },

          connectionDidFail: (reason) => {
            console.error("Connection failed with reason:", reason);

            // Handle specific connection failure reasons
            if (reason?.includes("SignalingChannelClosedUnexpectedly")) {
              setConnectionError("Connection failed due to network issues. Please check your internet connection and try again.");
            } else if (reason?.includes("timeout") || reason?.includes("Timeout")) {
              setConnectionError("Connection timeout. Please check your network and try again.");
            } else if (reason?.includes("WebSocket")) {
              setConnectionError("WebSocket connection failed. Please refresh the page and try again.");
            } else {
              setConnectionError(`Connection failed: ${reason || 'Network error'}. Please try again.`);
            }

            setIsConnected(false);
          },

          connectionDidSuggestStopVideo: () => {
            console.warn("Connection suggests stopping video");
            // Optionally handle poor connection by stopping video
          },

          connectionHealthDidChange: (connectionHealthData) => {
            console.log("Connection health changed:", connectionHealthData);

            // Monitor connection quality and provide user feedback
            if (connectionHealthData.connectionStartedTimestampMs > 0) {
              const connectionDuration = Date.now() - connectionHealthData.connectionStartedTimestampMs;

              // If connection has been poor for more than 10 seconds
              if (connectionHealthData.consecutiveMissedPongs > 3) {
                console.warn("Poor connection detected - multiple missed pongs");
                setConnectionError("Poor network connection detected. Audio/video quality may be affected.");
              } else if (connectionHealthData.consecutiveStatsWithNoPackets > 5) {
                console.warn("No packets received - connection issues");
                setConnectionError("Connection issues detected. Trying to maintain connection...");
              } else {
                // Clear connection error if health improves
                if (connectionError?.includes("Poor network") || connectionError?.includes("Connection issues")) {
                  setConnectionError(null);
                }
              }
            }
          }
        };

        // Content share observer - simplified
        const contentShareObserver = {
          contentShareDidStart: () => {
            console.log("Content share started (observer)");
            // Don't update state here - let the toggle function handle it
            // This prevents race conditions between user action and observer
          },
          
          contentShareDidStop: () => {
            console.log("Content share stopped (observer)");
            
            // Always clean up video element
            if (contentShareVideoRef.current) {
              contentShareVideoRef.current.srcObject = null;
              contentShareVideoRef.current.src = '';
            }
            
            // Reset state
            setScreenShareState({
              isSharing: false,
              isMyShare: false,
              tileId: null,
              attendeeId: null
            });
          }
        };

        session.audioVideo.addObserver(meetingObserver);
        session.audioVideo.addContentShareObserver(contentShareObserver);

        session.audioVideo.realtimeSubscribeToAttendeeIdPresence((attendeeId, present) => {
          handleAttendeePresenceChange(attendeeId, present);
        });

        session.audioVideo.realtimeSubscribeToMuteAndUnmuteLocalAudio((muted) => {
          setIsMuted(muted);
          updateParticipantMuteStatus(Attendee.AttendeeId, muted);
        });

        try {
          session.audioVideo.subscribeToActiveSpeakerDetector(
            new DefaultActiveSpeakerPolicy(),
            (activeSpeakers) => {
              updateActiveSpeakers(activeSpeakers);
            }
          );
        } catch (error) {
          console.warn("Active speaker detection not available:", error);
        }

        await loadAvailableDevices();

        cleanupFunction = async () => {
          if (session) {
            session.audioVideo.removeObserver(meetingObserver);
            session.audioVideo.removeContentShareObserver(contentShareObserver);
            session.audioVideo.stop();
          }
          await cleanup();
        };

      } catch (error) {
        console.error("Failed to initialize meeting:", error);
        setConnectionError(`Failed to initialize meeting: ${error.message}`);
      }
    }

    initializeMeeting();

    return () => {
      if (cleanupFunction) {
        cleanupFunction();
      }
    };
  }, [Meeting, Attendee]);

  useEffect(() => {
    return () => {
      stopPreviewStream();
    };
  }, []);



  const handleRemoteVideoTile = (tileState) => {
    const { boundAttendeeId, tileId } = tileState;

    setTimeout(() => {
      const videoElement = document.getElementById(`video-${boundAttendeeId}`);
      if (videoElement && meetingSessionRef.current) {
        try {
          meetingSessionRef.current.audioVideo.bindVideoElement(tileId, videoElement);
          console.log(`Bound video tile ${tileId} to element for attendee ${boundAttendeeId}`);
        } catch (error) {
          console.error("Failed to bind remote video element:", error);
        }
      }
    }, 100);

    setParticipants(prev => {
      const updated = [...prev];
      const participantIndex = updated.findIndex(p => p.attendeeId === boundAttendeeId);

      if (participantIndex >= 0) {
        updated[participantIndex] = {
          ...updated[participantIndex],
          videoEnabled: true,
          tileId: tileId
        };
      }

      return updated;
    });
  };

  const handleVideoTileRemoval = (tileId) => {
    console.log("Video tile removed:", tileId);
    
    // Handle content share tile removal
    if (screenShareStateRef.current.tileId === tileId) {
      console.log("Content share tile removed");
      
      // Clean video element
      if (contentShareVideoRef.current) {
        contentShareVideoRef.current.srcObject = null;
        contentShareVideoRef.current.src = '';
      }
      
      // Clear state
      setScreenShareState({
        isSharing: false,
        isMyShare: false,
        tileId: null,
        attendeeId: null
      });
      return;
    }

    // Handle regular video tiles
    setParticipants(prev =>
      prev.map(p =>
        p.tileId === tileId
          ? { ...p, videoEnabled: false, tileId: null }
          : p
      )
    );
  };



  const handleAttendeePresenceChange = (attendeeId, present) => {
    // Don't add content share attendees (screen share) to participants list
    if (attendeeId && attendeeId.includes('#content')) {
      console.log("Ignoring content share attendee:", attendeeId);
      return;
    }

    if (present) {
      setParticipants(prev => {
        if (prev.find(p => p.attendeeId === attendeeId)) {
          return prev;
        }

        const isLocal = attendeeId === Attendee.AttendeeId;

        let displayName = "Unknown";
        if (isLocal) {
          displayName = "You";
        } else {
          displayName = `User ${attendeeId.slice(-4)}`;
        }

        return [...prev, {
          attendeeId,
          name: displayName,
          isLocal,
          videoEnabled: false,
          muted: true,
          tileId: null,
          isActiveSpeaker: false
        }];
      });
    } else {
      setParticipants(prev => prev.filter(p => p.attendeeId !== attendeeId));
    }
  };

  const updateParticipantMuteStatus = (attendeeId, muted) => {
    setParticipants(prev =>
      prev.map(p =>
        p.attendeeId === attendeeId ? { ...p, muted } : p
      )
    );
  };

  const updateActiveSpeakers = (activeSpeakers) => {
    setParticipants(prev =>
      prev.map(p => ({
        ...p,
        isActiveSpeaker: activeSpeakers.some(speaker => speaker.attendeeId === p.attendeeId)
      }))
    );
  };

  const handleMeetingEndReason = (statusCode) => {
    switch (statusCode) {
      case 1:
        setConnectionError("Meeting ended normally.");
        break;
      case 2:
        setConnectionError("Meeting ended due to audio device failure.");
        break;
      case 3:
        setConnectionError("You were removed from the meeting.");
        break;
      case 4:
        setConnectionError("Meeting ended due to poor connection.");
        break;
      case 5:
        setConnectionError("Meeting ended due to server error.");
        break;
      case 6:
        setConnectionError("Meeting capacity exceeded.");
        break;
      case 10:
        setConnectionError("Meeting ended by host.");
        break;
      case 11:
        setConnectionError("Another session started from this device.");
        break;
      case 12:
        setConnectionError("Meeting ended due to concurrent session limit.");
        break;
      default:
        setConnectionError(`Meeting ended unexpectedly (Code: ${statusCode}).`);
    }
  };

  const loadAvailableDevices = async () => {
    try {
      const audioInputDevices = await meetingSessionRef.current.audioVideo.listAudioInputDevices();
      const videoInputDevices = await meetingSessionRef.current.audioVideo.listVideoInputDevices();

      setDevices({
        audioInputs: audioInputDevices,
        videoInputs: videoInputDevices
      });

      if (audioInputDevices.length > 0 && !selectedAudioInput) {
        setSelectedAudioInput(audioInputDevices[0].deviceId);
      }
      if (videoInputDevices.length > 0 && !selectedVideoInput) {
        setSelectedVideoInput(videoInputDevices[0].deviceId);
      }
    } catch (error) {
      console.warn("Failed to load devices:", error);
    }
  };

  const cleanup = async () => {
    try {
      // Stop video input if enabled
      if (meetingSessionRef.current && isVideoEnabled) {
        try {
          meetingSessionRef.current.audioVideo.stopLocalVideoTile();
          await meetingSessionRef.current.audioVideo.stopVideoInput();
        } catch (error) {
          console.warn("Failed to stop video input:", error);
        }
      }

      // Stop screen sharing if active
      if (meetingSessionRef.current && screenShareState.isSharing) {
        try {
          await meetingSessionRef.current.audioVideo.stopContentShare();
          if (contentShareVideoRef.current) {
            contentShareVideoRef.current.pause();
            contentShareVideoRef.current.srcObject = null;
            contentShareVideoRef.current.src = '';
          }
        } catch (error) {
          console.warn("Failed to stop screen sharing:", error);
        }
      }

      if (audioElementRef.current) {
        try {
          meetingSessionRef.current?.audioVideo.unbindAudioElement();
        } catch (error) {
          console.warn("Failed to unbind audio element:", error);
        }

        try {
          audioElementRef.current.remove();
        } catch (error) {
          console.warn("Failed to remove audio element:", error);
        }

        audioElementRef.current = null;
      }
      
      stopPreviewStream();
      setParticipants([]);
      setIsMuted(true);
      setIsVideoEnabled(false);
      setScreenShareState({
        isSharing: false,
        isMyShare: false,
        tileId: null,
        attendeeId: null
      });

    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  };

  const startPreviewStream = async () => {
    try {
      if (selectedVideoInput && previewVideoRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: selectedVideoInput },
          audio: false
        });

        previewStreamRef.current = stream;
        previewVideoRef.current.srcObject = stream;
        return true;
      }
    } catch (error) {
      console.error("Failed to start camera preview:", error);
      setConnectionError(`Failed to access camera: ${error.message}`);
      return false;
    }
  };

  const stopPreviewStream = () => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      previewStreamRef.current = null;
    }

    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
  };

  const startMeetingWithRetry = async (retryCount = 0) => {
    const maxRetries = 3;
    const retryDelay = 1000 * (retryCount + 1); 

    try {
      await startMeeting();
    } catch (error) {
      if (retryCount < maxRetries &&
        (error.message?.includes("concurrent") ||
          error.message?.includes("ConflictException") ||
          error.message?.includes("TooManyRequestsException") ||
          error.message?.includes("SignalingChannelClosedUnexpectedly"))) {

        console.log(`Meeting start failed, retrying in ${retryDelay}ms... (${retryCount + 1}/${maxRetries})`);
        setConnectionError(`Connection busy, retrying in ${retryDelay / 1000} seconds...`);

        setTimeout(() => {
          startMeetingWithRetry(retryCount + 1);
        }, retryDelay);
      } else if (error.message?.includes("SignalingChannelClosedUnexpectedly")) {
        console.log(`Signaling channel error, retrying in ${retryDelay}ms... (${retryCount + 1}/${maxRetries})`);
        setConnectionError(`Connection interrupted, retrying in ${retryDelay / 1000} seconds...`);

        setTimeout(() => {
          startMeetingWithRetry(retryCount + 1);
        }, retryDelay);
      } else if (error.message?.includes("AudioJoinedFromAnotherDevice")) {
        setConnectionError("Multiple sessions detected. Please ensure each participant has a unique name and refresh to try again.");
      } else {
        throw error;
      }
    }
  };

  const startMeeting = async () => {
    if (!meetingSessionRef.current) {
      setConnectionError("Meeting session not initialized.");
      return;
    }

    try {
      // Clear any previous errors
      setConnectionError(null);

      stopPreviewStream();
      if (selectedAudioInput) {
        await meetingSessionRef.current.audioVideo.startAudioInput(selectedAudioInput);
      }
      meetingSessionRef.current.audioVideo.bindAudioElement(audioElementRef.current);

      if (isVideoEnabled && selectedVideoInput) {
        await meetingSessionRef.current.audioVideo.startVideoInput(selectedVideoInput);
        meetingSessionRef.current.audioVideo.startLocalVideoTile();
      }

      await meetingSessionRef.current.audioVideo.start();

      if (isMuted) {
        meetingSessionRef.current.audioVideo.realtimeMuteLocalAudio();
      }

      console.log("Meeting session started successfully");

    } catch (error) {
      console.error("Failed to start meeting:", error);

      // Handle specific error cases
      if (error.message?.includes("AudioJoinedFromAnotherDevice")) {
        setConnectionError("Multiple sessions detected. Each participant needs a unique name. Please refresh and try again.");
      } else if (error.message?.includes("SignalingChannelClosedUnexpectedly")) {
        setConnectionError("Connection lost unexpectedly. This can happen due to network issues. Please check your internet connection and try again.");
      } else if (error.message?.includes("concurrent") || error.message?.includes("ConflictException")) {
        setConnectionError("Meeting is busy. Please wait a moment and try again.");
      } else if (error.message?.includes("TooManyRequestsException")) {
        setConnectionError("Too many join requests. Please wait 10 seconds and try again.");
      } else {
        setConnectionError(`Failed to start meeting: ${error.message || 'Unknown error'}`);
      }

      // Clean up on failure
      try {
        if (meetingSessionRef.current) {
          meetingSessionRef.current.audioVideo.stop();
        }
      } catch (cleanupError) {
        console.warn("Error during cleanup:", cleanupError);
      }
    }
  };

  const leaveMeeting = async () => {
    console.log("Leaving meeting...");
    setIsLeavingMeeting(true);
    setIsConnected(false);

    if (meetingSessionRef.current) {
      try {
        // Stop video first
        if (isVideoEnabled) {
          meetingSessionRef.current.audioVideo.stopLocalVideoTile();
          await meetingSessionRef.current.audioVideo.stopVideoInput();
        }

        // Stop screen sharing if active
        if (screenShareState.isMyShare) {
          meetingSessionRef.current.audioVideo.stopContentShare();
        }

        // Stop the entire session
        meetingSessionRef.current.audioVideo.stop();

        console.log("Meeting session stopped successfully");

      } catch (error) {
        console.error("Error during meeting cleanup:", error);
        // Force stop if there's an error
        try {
          meetingSessionRef.current.audioVideo.stop();
        } catch (forceStopError) {
          console.error("Error force stopping session:", forceStopError);
        }
      }
    }

    // Clear any error messages
    setConnectionError(null);
    setIsLeavingMeeting(false);
  };

  const toggleMute = () => {
    if (isConnected && meetingSessionRef.current) {
      if (isMuted) {
        meetingSessionRef.current.audioVideo.realtimeUnmuteLocalAudio();
      } else {
        meetingSessionRef.current.audioVideo.realtimeMuteLocalAudio();
      }
    } else {
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = async () => {
    if (isConnected && meetingSessionRef.current) {
      try {
        if (isVideoEnabled) {
          meetingSessionRef.current.audioVideo.stopLocalVideoTile();
          await meetingSessionRef.current.audioVideo.stopVideoInput();
          setIsVideoEnabled(false);
        } else {
          if (selectedVideoInput) {
            await meetingSessionRef.current.audioVideo.startVideoInput(selectedVideoInput);
            meetingSessionRef.current.audioVideo.startLocalVideoTile();
            setIsVideoEnabled(true);
          } else {
            setConnectionError("Please select a camera first");
          }
        }
      } catch (error) {
        console.error("Failed to toggle video:", error);
        setConnectionError(`Failed to toggle video: ${error.message}`);
      }
    } else {
      try {
        if (isVideoEnabled) {
          stopPreviewStream();
          setIsVideoEnabled(false);
        } else {
          if (selectedVideoInput) {
            const success = await startPreviewStream();
            if (success) {
              setIsVideoEnabled(true);
            }
          } else {
            setConnectionError("Please select a camera first");
          }
        }
      } catch (error) {
        console.error("Failed to toggle camera preview:", error);
        setConnectionError(`Failed to toggle camera: ${error.message}`);
      }
    }
  };

  const toggleScreenShare = async () => {
    console.log("=== SIMPLE SCREEN SHARE TOGGLE ===");
    console.log("Current state:", screenShareState);

    if (!meetingSessionRef.current || !isConnected) {
      setConnectionError("Please join the meeting first");
      return;
    }

    // Simple check: if someone else is sharing, don't allow
    if (screenShareState.isSharing && !screenShareState.isMyShare) {
      setConnectionError("Someone else is currently sharing their screen");
      return;
    }

    try {
      setConnectionError(null);

      if (screenShareState.isMyShare) {
        // Stop sharing - simple approach
        console.log("Stopping screen share...");
        
        // Immediate UI cleanup
        setScreenShareState({
          isSharing: false,
          isMyShare: false,
          tileId: null,
          attendeeId: null
        });

        // Clean video element
        if (contentShareVideoRef.current) {
          contentShareVideoRef.current.srcObject = null;
          contentShareVideoRef.current.src = '';
        }

        // Try to stop, but don't worry about errors
        try {
          await meetingSessionRef.current.audioVideo.stopContentShare();
          console.log("Screen share stopped successfully");
        } catch (error) {
          console.log("Stop error (ignoring):", error);
          // Ignore the error - UI is already updated
        }

      } else {
        // Start sharing
        console.log("Starting screen share...");
        
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { mediaSource: 'screen' },
          audio: false
        });

        // Handle browser stop
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.addEventListener('ended', () => {
            console.log("Screen share ended by browser");
            setScreenShareState({
              isSharing: false,
              isMyShare: false,
              tileId: null,
              attendeeId: null
            });
            if (contentShareVideoRef.current) {
              contentShareVideoRef.current.srcObject = null;
              contentShareVideoRef.current.src = '';
            }
            // Try to stop via SDK, but don't worry about errors
            if (meetingSessionRef.current) {
              meetingSessionRef.current.audioVideo.stopContentShare().catch(() => {});
            }
          });
        }

        // Start content share
        await meetingSessionRef.current.audioVideo.startContentShare(stream);
        console.log("Screen share started");
        
        // Set state immediately
        setScreenShareState({
          isSharing: true,
          isMyShare: true,
          tileId: null, // Will be set by observer
          attendeeId: Attendee.AttendeeId
        });
      }

    } catch (error) {
      console.error("Screen share error:", error);
      
      if (error.name === 'NotAllowedError') {
        setConnectionError("Screen sharing permission denied");
      } else if (error.name === 'AbortError') {
        setConnectionError("Screen sharing was cancelled");
      } else {
        setConnectionError("Screen sharing failed. Please try again.");
      }
      
      // Reset on any error
      setScreenShareState({
        isSharing: false,
        isMyShare: false,
        tileId: null,
        attendeeId: null
      });
    }
  };

  // Handler for device changes
  const handleVideoInputChange = async (newDeviceId) => {
    setSelectedVideoInput(newDeviceId);
    if (isVideoEnabled && newDeviceId) {
      stopPreviewStream();
      setTimeout(async () => {
        await startPreviewStream();
      }, 100);
    }
  };

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {!isConnected ? (
        <PreMeetingLobby
          connectionError={connectionError}
          onDismissError={() => setConnectionError(null)}
          devices={devices}
          selectedAudioInput={selectedAudioInput}
          selectedVideoInput={selectedVideoInput}
          onAudioInputChange={setSelectedAudioInput}
          onVideoInputChange={handleVideoInputChange}
          previewVideoRef={previewVideoRef}
          isVideoEnabled={isVideoEnabled}
          isMuted={isMuted}
          onToggleVideo={toggleVideo}
          onToggleMute={toggleMute}
          onJoinMeeting={startMeetingWithRetry}
        />
      ) : (
        <div className="h-screen flex bg-white">
          <ParticipantsSidebar
            showParticipantsList={showParticipantsList}
            onToggle={() => setShowParticipantsList(false)}
            participants={participants}
            isMuted={isMuted}
            isVideoEnabled={isVideoEnabled}
          />

          <div className="flex-1 flex flex-col">
            <MeetingHeader
              connectionError={connectionError}
              onDismissError={() => setConnectionError(null)}
              participants={participants}
              showParticipantsList={showParticipantsList}
              onToggleParticipants={() => setShowParticipantsList(!showParticipantsList)}
            />

            <div className="flex-1 p-3 min-h-0">
              <VideoGrid
                contentShareTileId={screenShareState.tileId}
                isLocalScreenSharing={screenShareState.isMyShare}
                isRemoteScreenSharing={screenShareState.isSharing && !screenShareState.isMyShare}
                contentShareVideoRef={contentShareVideoRef}
                localVideoRef={localVideoRef}
                isVideoEnabled={isVideoEnabled}
                isMuted={isMuted}
                participants={participants}
              />
            </div>

            <MeetingControls
              isMuted={isMuted}
              isVideoEnabled={isVideoEnabled}
              isLocalScreenSharing={screenShareState.isMyShare}
              isRemoteScreenSharing={screenShareState.isSharing && !screenShareState.isMyShare}
              onToggleMute={toggleMute}
              onToggleVideo={toggleVideo}
              onToggleScreenShare={toggleScreenShare}
              onLeaveMeeting={leaveMeeting}
            />
          </div>
        </div>
      )}
    </div>
  );
};