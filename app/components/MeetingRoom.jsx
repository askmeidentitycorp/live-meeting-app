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
import DocumentPiP from "./DocumentPiP";
import { useNotifications } from "../contexts/NotificationContext";

export function MeetingRoom({ meetingData }) {
  const { Meeting, Attendee } = meetingData || {};
  const [showPiP, setShowPiP] = useState(false);
  const [pipWindow, setPipWindow] = useState(null);
  const [pipSupported, setPipSupported] = useState(false);

  const meetingSessionRef = useRef(null);
  const localVideoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const audioElementRef = useRef(null);
  const previewStreamRef = useRef(null);
  const contentShareVideoRef = useRef(null);
  const screenShareStateRef = useRef({ isSharing: false, isMyShare: false, tileId: null, attendeeId: null });

  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [screenShareState, setScreenShareState] = useState({
    isSharing: false,
    isMyShare: false,
    tileId: null,
    attendeeId: null
  });

  useEffect(() => {
    screenShareStateRef.current = screenShareState;
  }, [screenShareState]);
  const [connectionError, setConnectionError] = useState(null);
  const { addNotification } = useNotifications();
  const [isLeavingMeeting, setIsLeavingMeeting] = useState(false);

  let localUserName = 'You';
  let isHost = false;
  if (Attendee?.ExternalUserId) {
    if (Attendee.ExternalUserId.includes('|')) {
      localUserName = Attendee.ExternalUserId.split('|')[1]?.split('@')[0] || 'You';
      isHost = Attendee.ExternalUserId.startsWith('HOST|');
    } else {
      localUserName = Attendee.ExternalUserId.split('-')[1] || 'You';
      isHost = Attendee.ExternalUserId.startsWith('HOST-');
    }
  }
  if (meetingData?.host?.email && Attendee?.ExternalUserId) {
    const attendeeEmail = Attendee.ExternalUserId.includes('|')
      ? Attendee.ExternalUserId.split('|')[1]
      : null;
    if (attendeeEmail && attendeeEmail === meetingData.host.email) {
      isHost = true;
    }
  }

  // Extract meeting ID from Meeting object
  const meetingId = Meeting?.MeetingId || null;

  // Device and participant state
  const [devices, setDevices] = useState({ audioInputs: [], videoInputs: [] });
  const [selectedAudioInput, setSelectedAudioInput] = useState("");
  const [selectedVideoInput, setSelectedVideoInput] = useState("");
  const [participants, setParticipants] = useState([]);
  const [showParticipantsList, setShowParticipantsList] = useState(false);
  const [attendeeRoster, setAttendeeRoster] = useState(new Map());

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

        config.enableWebAudio = false; // Disable WebAudio for better compatibility
        config.keepLastFrameWhenPaused = true; // Keep video frames when connection is temporarily lost

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
            if (tileState?.localTile && !tileState?.isContent) {
              if (localVideoRef?.current) {
                session?.audioVideo?.bindVideoElement(tileState.tileId, localVideoRef.current);
              }
            } else if (tileState?.isContent) {
              const contentAttendeeId = tileState?.boundAttendeeId || '';
              const baseAttendeeId = contentAttendeeId.split('#')[0];
              const isMyShare = baseAttendeeId === Attendee?.AttendeeId;

              setScreenShareState(prev => ({
                ...prev,
                isSharing: true,
                isMyShare: isMyShare,
                tileId: tileState.tileId,
                attendeeId: tileState.boundAttendeeId
              }));

              setTimeout(() => {
                if (contentShareVideoRef?.current && meetingSessionRef?.current) {
                  try {
                    meetingSessionRef.current.audioVideo.bindVideoElement(tileState.tileId, contentShareVideoRef.current);
                  } catch (error) {
                  }
                }
              }, 100);
            } else {
              handleRemoteVideoTile(tileState);
            }
          },

          videoTileWasRemoved: (tileId) => {
            handleVideoTileRemoval(tileId);
          },

          audioVideoDidStart: () => {
            setIsConnected(true);
            setConnectionError(null);
          },

          audioVideoDidStop: async (sessionStatus) => {
            setIsConnected(false);

            // Extract the actual status code number
            let statusCode = null;
            let reason = null;

            if (sessionStatus) {
              if (typeof sessionStatus?.statusCode === 'function') {
                statusCode = sessionStatus.statusCode();
              } else if (typeof sessionStatus?.statusCode === 'number') {
                statusCode = sessionStatus.statusCode;
              } else if (typeof sessionStatus === 'number') {
                statusCode = sessionStatus;
              }

              // Extract reason
              reason = sessionStatus?.reason || sessionStatus?.toString();
            }

            // Don't show error messages if user is voluntarily leaving
            if (isLeavingMeeting) {
              return;
            }

            // Handle SignalingChannelClosedUnexpectedly specifically
            if (reason === "SignalingChannelClosedUnexpectedly" || statusCode === 7) {
              setConnectionError("Connection lost. This can happen due to network issues or server problems. Please try rejoining.");
            }
            // Handle other specific errors
            else if (statusCode === 12 ||
              statusCode === 11 ||
              sessionStatus?.reason === "AudioJoinedFromAnotherDevice") {

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
            if (reconnecting) {
              setConnectionError("Connection lost. Attempting to reconnect...");
            } else {
              // Clear error when starting fresh connection
              setConnectionError(null);
            }
          },

          connectionDidFail: (reason) => {
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
            // Optionally handle poor connection by stopping video
          },

          connectionHealthDidChange: (connectionHealthData) => {
            // Monitor connection quality and provide user feedback
            if (connectionHealthData?.connectionStartedTimestampMs > 0) {
              const connectionDuration = Date.now() - connectionHealthData.connectionStartedTimestampMs;

              // If connection has been poor for more than 10 seconds
              if (connectionHealthData?.consecutiveMissedPongs > 3) {
                setConnectionError("Poor network connection detected. Audio/video quality may be affected.");
              } else if (connectionHealthData?.consecutiveStatsWithNoPackets > 5) {
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
            // Don't update state here - let the toggle function handle it
            // This prevents race conditions between user action and observer
          },

          contentShareDidStop: () => {
            // Always clean up video element
            if (contentShareVideoRef?.current) {
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

        session?.audioVideo?.addObserver(meetingObserver);
        session?.audioVideo?.addContentShareObserver(contentShareObserver);

        session?.audioVideo?.realtimeSubscribeToAttendeeIdPresence((attendeeId, present, externalUserId) => {
          // Store the external user ID mapping
          if (present && externalUserId) {
            setAttendeeRoster(prev => {
              const newRoster = new Map(prev);
              newRoster.set(attendeeId, externalUserId);
              return newRoster;
            });
          } else if (!present) {
            setAttendeeRoster(prev => {
              const newRoster = new Map(prev);
              newRoster.delete(attendeeId);
              return newRoster;
            });
          }
          handleAttendeePresenceChange(attendeeId, present, externalUserId);
        });

        session?.audioVideo?.realtimeSubscribeToMuteAndUnmuteLocalAudio((muted) => {
          setIsMuted(muted);
          updateParticipantMuteStatus(Attendee?.AttendeeId, muted);
        });

        try {
          session?.audioVideo?.subscribeToActiveSpeakerDetector(
            new DefaultActiveSpeakerPolicy(),
            (activeSpeakers) => {
              updateActiveSpeakers(activeSpeakers);
            }
          );
        } catch (error) {
          // Silent error handling
        }

        await loadAvailableDevices();

        cleanupFunction = async () => {
          if (session) {
            session?.audioVideo?.removeObserver(meetingObserver);
            session?.audioVideo?.removeContentShareObserver(contentShareObserver);
            session?.audioVideo?.stop();
          }
          await cleanup();
        };

      } catch (error) {
        setConnectionError(`Failed to initialize meeting: ${error?.message}`);
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

  // Detect Document Picture-in-Picture support (hide PiP button if unsupported)
  useEffect(() => {
    try {
      const supported =
        typeof window !== 'undefined' &&
        'documentPictureInPicture' in window &&
        typeof window.documentPictureInPicture?.requestWindow === 'function';
      setPipSupported(!!supported);
    } catch {
      setPipSupported(false);
    }
  }, []);



  const handleRemoteVideoTile = (tileState) => {
    const { boundAttendeeId, tileId } = tileState || {};

    setTimeout(() => {
      const videoElement = document.getElementById(`video-${boundAttendeeId}`);
      if (videoElement && meetingSessionRef?.current) {
        try {
          meetingSessionRef.current.audioVideo.bindVideoElement(tileId, videoElement);
        } catch (error) {
          // Silent error handling
        }
      }
    }, 100);

    setParticipants(prev => {
      const updated = [...prev];
      const participantIndex = updated.findIndex(p => p?.attendeeId === boundAttendeeId);

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
    // Handle content share tile removal
    if (screenShareStateRef?.current?.tileId === tileId) {
      // Clean video element
      if (contentShareVideoRef?.current) {
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
        p?.tileId === tileId
          ? { ...p, videoEnabled: false, tileId: null }
          : p
      )
    );
  };



  const handleAttendeePresenceChange = async (attendeeId, present, externalUserId) => {
    // Don't add content share attendees (screen share) to participants list
    if (attendeeId && attendeeId.includes('#content')) {
      return;
    }

    if (present) {
      setParticipants(prev => {
        if (prev.find(p => p?.attendeeId === attendeeId)) {
          return prev;
        }

        const isLocal = attendeeId === Attendee?.AttendeeId;

        // Get the display name and host status from external user ID
        let displayName = "Unknown";
        let isParticipantHost = false;

        if (isLocal) {
          // For local user, always show "You" and use isHost from above
          displayName = localUserName;
          isParticipantHost = isHost;
        } else {
          // For remote users, use the externalUserId passed from the callback
          if (externalUserId) {
            // Check for new format: HOST|email|timestamp|random or USER|email|timestamp|random or GUEST|name|timestamp|random
            if (externalUserId.includes('|')) {
              const parts = externalUserId.split('|');
              const userType = parts[0]; // HOST, USER, or GUEST
              const identifier = parts[1]; // email or name

              isParticipantHost = userType === 'HOST';

              // Extract display name from identifier
              if (identifier?.includes('@')) {
                // If it's an email, extract the username part
                displayName = identifier.split('@')[0];
              } else {
                displayName = identifier || `User ${attendeeId?.slice(-4)}`;
              }
            } else {
              // Fallback for old format: HOST-name-timestamp-random
              isParticipantHost = externalUserId.startsWith('HOST-');
              const parts = externalUserId.split('-');
              const namePart = isParticipantHost ? parts[1] : parts[0];
              displayName = namePart || `User ${attendeeId?.slice(-4)}`;
            }
          } else {
            // Fallback: try to get from roster state
            const storedExternalId = attendeeRoster.get(attendeeId);
            if (storedExternalId) {
              if (storedExternalId.includes('|')) {
                const parts = storedExternalId.split('|');
                isParticipantHost = parts[0] === 'HOST';
                const identifier = parts[1];
                displayName = identifier?.includes('@') ? identifier.split('@')[0] : identifier;
              } else {
                isParticipantHost = storedExternalId.startsWith('HOST-');
                const parts = storedExternalId.split('-');
                const namePart = isParticipantHost ? parts[1] : parts[0];
                displayName = namePart || `User ${attendeeId?.slice(-4)}`;
              }
            } else {
              displayName = `User ${attendeeId?.slice(-4)}`;
            }
          }
        }

        // Subscribe to this attendee's volume indicator for mute status tracking
        if (meetingSessionRef?.current && !isLocal) {
          meetingSessionRef.current.audioVideo.realtimeSubscribeToVolumeIndicator(
            attendeeId,
            (id, volume, muted, signalStrength) => {
              // The muted parameter from the callback is the actual mute state
              // Update immediately when we receive it
              if (muted !== null && muted !== undefined) {
                updateParticipantMuteStatus(id, muted);
              }
            }
          );
        }

        return [...prev, {
          attendeeId,
          name: displayName,
          isLocal,
          isHost: isParticipantHost,
          email: isLocal && meetingData?.host?.email ? meetingData.host.email : undefined,
          videoEnabled: false,
          muted: null, // Don't assume - wait for actual status from volume indicator callback
          tileId: null,
          isActiveSpeaker: false
        }];
      });
    } else {
      // Unsubscribe when attendee leaves
      if (meetingSessionRef?.current) {
        meetingSessionRef.current.audioVideo.realtimeUnsubscribeFromVolumeIndicator(attendeeId);
      }
      setParticipants(prev => prev.filter(p => p?.attendeeId !== attendeeId));
    }
  };

  const updateParticipantMuteStatus = (attendeeId, muted) => {
    setParticipants(prev =>
      prev.map(p =>
        p?.attendeeId === attendeeId ? { ...p, muted } : p
      )
    );
  };

  const updateActiveSpeakers = (activeSpeakers) => {
    setParticipants(prev =>
      prev.map(p => {
        const isActive = activeSpeakers?.some(speaker => speaker?.attendeeId === p?.attendeeId);
        // If someone is an active speaker, they must be unmuted
        // But don't override null state unless they're actually speaking
        return {
          ...p,
          isActiveSpeaker: isActive,
          muted: isActive ? false : p?.muted // If speaking, definitely unmuted; otherwise keep current state
        };
      })
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
      const audioInputDevices = await meetingSessionRef?.current?.audioVideo?.listAudioInputDevices();
      const videoInputDevices = await meetingSessionRef?.current?.audioVideo?.listVideoInputDevices();

      setDevices({
        audioInputs: audioInputDevices || [],
        videoInputs: videoInputDevices || []
      });

      if (audioInputDevices?.length > 0 && !selectedAudioInput) {
        setSelectedAudioInput(audioInputDevices[0]?.deviceId);
      }
      if (videoInputDevices?.length > 0 && !selectedVideoInput) {
        setSelectedVideoInput(videoInputDevices[0]?.deviceId);
      }
    } catch (error) {
      // Silent error handling
    }
  };

  const cleanup = async () => {
    try {
      // Stop video input if enabled
      if (meetingSessionRef?.current && isVideoEnabled) {
        try {
          meetingSessionRef.current.audioVideo.stopLocalVideoTile();
          await meetingSessionRef.current.audioVideo.stopVideoInput();
        } catch (error) {
          // Silent error handling
        }
      }

      // Stop screen sharing if active
      if (meetingSessionRef?.current && screenShareState?.isSharing) {
        try {
          await meetingSessionRef.current.audioVideo.stopContentShare();
          if (contentShareVideoRef?.current) {
            contentShareVideoRef.current.pause();
            contentShareVideoRef.current.srcObject = null;
            contentShareVideoRef.current.src = '';
          }
        } catch (error) {
          // Silent error handling
        }
      }

      if (audioElementRef?.current) {
        try {
          meetingSessionRef?.current?.audioVideo?.unbindAudioElement();
        } catch (error) {
          // Silent error handling
        }

        try {
          audioElementRef.current.remove();
        } catch (error) {
          // Silent error handling
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
      // Silent error handling
    }
  };

  const startPreviewStream = async () => {
    try {
      if (selectedVideoInput && previewVideoRef?.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: selectedVideoInput },
          audio: false
        });

        previewStreamRef.current = stream;
        previewVideoRef.current.srcObject = stream;
        return true;
      }
    } catch (error) {
      setConnectionError(`Failed to access camera: ${error?.message}`);
      return false;
    }
  };

  const stopPreviewStream = () => {
    if (previewStreamRef?.current) {
      previewStreamRef.current.getTracks().forEach(track => {
        track?.stop();
      });
      previewStreamRef.current = null;
    }

    if (previewVideoRef?.current) {
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
        (error?.message?.includes("concurrent") ||
          error?.message?.includes("ConflictException") ||
          error?.message?.includes("TooManyRequestsException") ||
          error?.message?.includes("SignalingChannelClosedUnexpectedly"))) {

        setConnectionError(`Connection busy, retrying in ${retryDelay / 1000} seconds...`);

        setTimeout(() => {
          startMeetingWithRetry(retryCount + 1);
        }, retryDelay);
      } else if (error?.message?.includes("SignalingChannelClosedUnexpectedly")) {
        setConnectionError(`Connection interrupted, retrying in ${retryDelay / 1000} seconds...`);

        setTimeout(() => {
          startMeetingWithRetry(retryCount + 1);
        }, retryDelay);
      } else if (error?.message?.includes("AudioJoinedFromAnotherDevice")) {
        setConnectionError("Multiple sessions detected. Please ensure each participant has a unique name and refresh to try again.");
      } else {
        throw error;
      }
    }
  };

  const startMeeting = async () => {
    if (!meetingSessionRef?.current) {
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

      // Only mute if the user explicitly chose to be muted
      if (isMuted) {
        meetingSessionRef.current.audioVideo.realtimeMuteLocalAudio();
      } else {
        // Ensure we're unmuted
        meetingSessionRef.current.audioVideo.realtimeUnmuteLocalAudio();
      }

    } catch (error) {
      // Handle specific error cases
      if (error?.message?.includes("AudioJoinedFromAnotherDevice")) {
        setConnectionError("Multiple sessions detected. Each participant needs a unique name. Please refresh and try again.");
      } else if (error?.message?.includes("SignalingChannelClosedUnexpectedly")) {
        setConnectionError("Connection lost unexpectedly. This can happen due to network issues. Please check your internet connection and try again.");
      } else if (error?.message?.includes("concurrent") || error?.message?.includes("ConflictException")) {
        setConnectionError("Meeting is busy. Please wait a moment and try again.");
      } else if (error?.message?.includes("TooManyRequestsException")) {
        setConnectionError("Too many join requests. Please wait 10 seconds and try again.");
      } else {
        setConnectionError(`Failed to start meeting: ${error?.message || 'Unknown error'}`);
      }

      // Clean up on failure
      try {
        if (meetingSessionRef?.current) {
          meetingSessionRef.current.audioVideo.stop();
        }
      } catch (cleanupError) {
        // Silent error handling
      }
    }
  };

  const leaveMeeting = async () => {
    setIsLeavingMeeting(true);
    setIsConnected(false);

    if (meetingSessionRef?.current) {
      try {
        // Stop video first
        if (isVideoEnabled) {
          meetingSessionRef.current.audioVideo.stopLocalVideoTile();
          await meetingSessionRef.current.audioVideo.stopVideoInput();
        }

        // Stop screen sharing if active
        if (screenShareState?.isMyShare) {
          meetingSessionRef.current.audioVideo.stopContentShare();
        }

        // Stop the entire session
        meetingSessionRef.current.audioVideo.stop();

      } catch (error) {
        // Force stop if there's an error
        try {
          meetingSessionRef?.current?.audioVideo?.stop();
        } catch (forceStopError) {
          // Silent error handling
        }
      }
    }

    // Clear any error messages
    setConnectionError(null);
    setIsLeavingMeeting(false);
  };

  const toggleMute = () => {
    if (isConnected && meetingSessionRef?.current) {
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
    if (isConnected && meetingSessionRef?.current) {
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
        setConnectionError(`Failed to toggle video: ${error?.message}`);
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
        setConnectionError(`Failed to toggle camera: ${error?.message}`);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!meetingSessionRef?.current || !isConnected) {
      setConnectionError("Please join the meeting first");
      return;
    }

    // Simple check: if someone else is sharing, don't allow
    if (screenShareState?.isSharing && !screenShareState?.isMyShare) {
      setConnectionError("Someone else is currently sharing their screen");
      return;
    }

    try {
      setConnectionError(null);

      if (screenShareState?.isMyShare) {

        setScreenShareState({
          isSharing: false,
          isMyShare: false,
          tileId: null,
          attendeeId: null
        });

        // Clean video element
        if (contentShareVideoRef?.current) {
          contentShareVideoRef.current.srcObject = null;
          contentShareVideoRef.current.src = '';
        }

        // Try to stop, but don't worry about errors
        try {
          await meetingSessionRef.current.audioVideo.stopContentShare();
        } catch (error) {
          // Ignore the error - UI is already updated
        }

      } else {
        // Start sharing
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { mediaSource: 'screen' },
          audio: false
        });

        // Handle browser stop
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.addEventListener('ended', () => {
            setScreenShareState({
              isSharing: false,
              isMyShare: false,
              tileId: null,
              attendeeId: null
            });
            if (contentShareVideoRef?.current) {
              contentShareVideoRef.current.srcObject = null;
              contentShareVideoRef.current.src = '';
            }
            // Try to stop via SDK, but don't worry about errors
            if (meetingSessionRef?.current) {
              meetingSessionRef.current.audioVideo.stopContentShare().catch(() => { });
            }
          });
        }

        // Start content share
        await meetingSessionRef.current.audioVideo.startContentShare(stream);

        // Set state immediately
        setScreenShareState({
          isSharing: true,
          isMyShare: true,
          tileId: null, // Will be set by observer
          attendeeId: Attendee?.AttendeeId
        });
      }

    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        addNotification("Screen sharing permission denied", "error");
      } else if (error?.name === 'AbortError') {
        addNotification("Screen sharing was cancelled", "warning");
      } else {
        addNotification("Screen sharing failed. Please try again.", "error");
      }

      // Keep legacy connectionError cleared when using notifications
      setConnectionError(null);

      setScreenShareState({
        isSharing: false,
        isMyShare: false,
        tileId: null,
        attendeeId: null
      });
    }
  };

  const handleVideoInputChange = async (newDeviceId) => {
    setSelectedVideoInput(newDeviceId);
    if (isVideoEnabled && newDeviceId) {
      stopPreviewStream();
      setTimeout(async () => {
        await startPreviewStream();
      }, 100);
    }
  };

  const openPiP = async () => {
    try {
      if ('documentPictureInPicture' in window) {
        const win = await window.documentPictureInPicture.requestWindow({ width: 360, height: 520 });
        setPipWindow(win);
        setShowPiP(true);
      } else {
        setShowPiP(true);
      }
    } catch (e) {
      setShowPiP(true);
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
          meetingId={meetingId}
          onJoinMeeting={startMeetingWithRetry}
        />
      ) : (
        <div className="h-screen flex bg-white">
          <div className="flex-1 flex flex-col">
            <MeetingHeader
              connectionError={connectionError}
              onDismissError={() => setConnectionError(null)}
              participants={participants}
              showParticipantsList={showParticipantsList}
              onToggleParticipants={() => setShowParticipantsList(!showParticipantsList)}
              meetingId={meetingId}
              isHost={isHost}
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
                localUserName={localUserName}
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
              onOpenPiP={pipSupported ? openPiP : undefined}
            />
          </div>

          <ParticipantsSidebar
            showParticipantsList={showParticipantsList}
            onToggle={() => setShowParticipantsList(false)}
            participants={participants}
            isMuted={isMuted}
            isVideoEnabled={isVideoEnabled}
            localUserName={localUserName}
            isLocalUserHost={isHost}
          />
          {showPiP && (
            <DocumentPiP
              meetingSessionRef={meetingSessionRef}
              participants={participants}
              localUserName={localUserName}
              isMuted={isMuted}
              isVideoEnabled={isVideoEnabled}
              screenShareState={screenShareState}
              onToggleMute={toggleMute}
              onToggleVideo={toggleVideo}
              onToggleScreenShare={toggleScreenShare}
              onLeaveMeeting={leaveMeeting}
              onClose={() => { setShowPiP(false); setPipWindow(null); }}
              existingWindow={pipWindow}
            />
          )}
        </div>
      )}
    </div>
  );
};