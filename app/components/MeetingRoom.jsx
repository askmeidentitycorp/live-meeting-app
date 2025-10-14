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
import { Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, Settings, Users } from "lucide-react";

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

  // Meeting state
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [contentShareTileId, setContentShareTileId] = useState(null);
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
            
            if (tileState.localTile) {
              // Handle local camera video
              if (localVideoRef.current && !tileState.isContent) {
                session.audioVideo.bindVideoElement(tileState.tileId, localVideoRef.current);
              }
            } else if (tileState.isContent) {
              // Handle content share (screen share)
              console.log("Content share tile detected:", tileState);
              handleContentShareTile(tileState);
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

        // Content share observer for screen sharing
        const contentShareObserver = {
          contentShareDidStart: () => {
            console.log("Content share started");
            setIsScreenSharing(true);
          },
          
          contentShareDidStop: () => {
            console.log("Content share stopped - cleaning up UI");
            
            // Clear states first to immediately switch layout
            setIsScreenSharing(false);
            const currentTileId = contentShareTileId;
            setContentShareTileId(null);
            
            // Clean up video element
            if (contentShareVideoRef.current) {
              try {
                // Clear the video source
                contentShareVideoRef.current.srcObject = null;
                contentShareVideoRef.current.removeAttribute('srcObject');
                contentShareVideoRef.current.load(); // Reset the video element
                
                // Unbind from Chime if we have a tile ID
                if (currentTileId && meetingSessionRef.current) {
                  meetingSessionRef.current.audioVideo.bindVideoElement(currentTileId, null);
                }
              } catch (error) {
                console.warn("Failed to clean up content share video element:", error);
              }
            }
          },
          
          contentShareDidPause: () => {
            console.log("Content share paused");
          },
          
          contentShareDidUnpause: () => {
            console.log("Content share unpaused");
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
    console.log("Handling video tile removal for tileId:", tileId);
    
    // Handle content share tile removal
    if (contentShareTileId === tileId) {
      console.log("Removing content share tile - switching back to normal layout");
      
      // Clear states to switch layout immediately
      setContentShareTileId(null);
      setIsScreenSharing(false);
      
      // Clean up video element thoroughly
      if (contentShareVideoRef.current) {
        try {
          contentShareVideoRef.current.pause();
          contentShareVideoRef.current.srcObject = null;
          contentShareVideoRef.current.removeAttribute('srcObject');
          contentShareVideoRef.current.src = '';
          contentShareVideoRef.current.load();
        } catch (error) {
          console.warn("Failed to clear content share video element:", error);
        }
      }
      return;
    }
    
    // Handle regular video tile removal
    setParticipants(prev => 
      prev.map(p => 
        p.tileId === tileId 
          ? { ...p, videoEnabled: false, tileId: null }
          : p
      )
    );
  };

  const handleContentShareTile = (tileState) => {
    console.log("Handling content share tile:", tileState);
    setContentShareTileId(tileState.tileId);
    
    // Bind the content share video element
    setTimeout(() => {
      if (contentShareVideoRef.current && meetingSessionRef.current) {
        try {
          meetingSessionRef.current.audioVideo.bindVideoElement(tileState.tileId, contentShareVideoRef.current);
          console.log("Bound content share tile to video element");
        } catch (error) {
          console.error("Failed to bind content share video element:", error);
        }
      }
    }, 100);
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
      if (meetingSessionRef.current && (isScreenSharing || contentShareTileId)) {
        try {
          await meetingSessionRef.current.audioVideo.stopContentShare();
          
          // Thoroughly clean up content share video element
          if (contentShareVideoRef.current) {
            contentShareVideoRef.current.pause();
            contentShareVideoRef.current.srcObject = null;
            contentShareVideoRef.current.removeAttribute('srcObject');
            contentShareVideoRef.current.src = '';
            contentShareVideoRef.current.load();
          }
        } catch (error) {
          console.warn("Failed to stop screen sharing:", error);
        }
      }

      // Unbind and remove audio element
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

      // Stop preview stream
      stopPreviewStream();
      
      // Reset state
      setParticipants([]);
      setIsMuted(true);
      setIsVideoEnabled(false);
      setIsScreenSharing(false);
      setContentShareTileId(null);
      
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

  // Retry mechanism for starting meeting
  const startMeetingWithRetry = async (retryCount = 0) => {
    const maxRetries = 3;
    const retryDelay = 1000 * (retryCount + 1); // 1s, 2s, 3s delays
    
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
        // Retry for signaling channel issues
        console.log(`Signaling channel error, retrying in ${retryDelay}ms... (${retryCount + 1}/${maxRetries})`);
        setConnectionError(`Connection interrupted, retrying in ${retryDelay / 1000} seconds...`);
        
        setTimeout(() => {
          startMeetingWithRetry(retryCount + 1);
        }, retryDelay);
      } else if (error.message?.includes("AudioJoinedFromAnotherDevice")) {
        // Don't retry for this error, it indicates a fundamental issue with duplicate users
        setConnectionError("Multiple sessions detected. Please ensure each participant has a unique name and refresh to try again.");
      } else {
        throw error; // Re-throw if max retries reached or non-retryable error
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
      
      // Stop preview stream
      stopPreviewStream();
      
      // Configure audio input
      if (selectedAudioInput) {
        await meetingSessionRef.current.audioVideo.startAudioInput(selectedAudioInput);
      }
      
      // Bind audio element for remote audio
      meetingSessionRef.current.audioVideo.bindAudioElement(audioElementRef.current);
      
      // Configure video if enabled
      if (isVideoEnabled && selectedVideoInput) {
        await meetingSessionRef.current.audioVideo.startVideoInput(selectedVideoInput);
        meetingSessionRef.current.audioVideo.startLocalVideoTile();
      }
      
      // Start the meeting session
      await meetingSessionRef.current.audioVideo.start();
      
      // Set initial mute state
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
        if (isScreenSharing) {
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
    console.log("Toggling screen share, current state:", isScreenSharing);
    
    if (!meetingSessionRef.current) {
      console.error("Meeting session not available");
      setConnectionError("Meeting session not available");
      return;
    }

    if (!isConnected) {
      console.error("Not connected to meeting");
      setConnectionError("Please join the meeting first");
      return;
    }

    try {
      if (isScreenSharing) {
        console.log("Stopping content share...");
        
        // Clean up video element immediately for responsive UI
        if (contentShareVideoRef.current) {
          contentShareVideoRef.current.pause();
          contentShareVideoRef.current.srcObject = null;
          contentShareVideoRef.current.removeAttribute('srcObject');
          contentShareVideoRef.current.src = '';
          contentShareVideoRef.current.load();
        }
        
        // Stop the content share
        await meetingSessionRef.current.audioVideo.stopContentShare();
        
        // Update states immediately (observer will also update them)
        setIsScreenSharing(false);
        setContentShareTileId(null);
      } else {
        console.log("Starting screen share...");
        
        // Request screen capture
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: {
            mediaSource: 'screen',
            width: { max: 1920 },
            height: { max: 1080 },
            frameRate: { max: 15 }
          },
          audio: false 
        });

        console.log("Got screen capture stream:", stream);
        
        // Handle stream end (user stops sharing via browser)
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.addEventListener('ended', async () => {
            console.log("Screen share ended by user via browser");
            
            // Clean up UI immediately
            if (contentShareVideoRef.current) {
              contentShareVideoRef.current.pause();
              contentShareVideoRef.current.srcObject = null;
              contentShareVideoRef.current.removeAttribute('srcObject');
              contentShareVideoRef.current.src = '';
              contentShareVideoRef.current.load();
            }
            
            // Update states immediately for responsive UI
            setIsScreenSharing(false);
            setContentShareTileId(null);
            
            // Stop content share in Chime
            if (meetingSessionRef.current) {
              try {
                await meetingSessionRef.current.audioVideo.stopContentShare();
              } catch (error) {
                console.warn("Error stopping content share:", error);
              }
            }
          });
        }
        
        // Start content share
        await meetingSessionRef.current.audioVideo.startContentShare(stream);
        console.log("Content share started successfully");
        // State will be updated by contentShareDidStart observer
      }
    } catch (error) {
      console.error("Failed to toggle screen share:", error);
      
      // Handle specific error cases
      if (error.name === 'NotAllowedError') {
        setConnectionError("Screen sharing permission denied. Please allow screen sharing and try again.");
      } else if (error.name === 'NotSupportedError') {
        setConnectionError("Screen sharing is not supported in this browser.");
      } else if (error.name === 'AbortError') {
        setConnectionError("Screen sharing was cancelled.");
      } else {
        setConnectionError(`Failed to toggle screen share: ${error.message}`);
      }
    }
  };

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {!isConnected ? (
        // Pre-meeting lobby
        <div className="flex-1 flex items-start justify-center overflow-y-auto">
          <div className="bg-gray-100 rounded-lg border border-gray-200 p-6 max-w-md w-full my-8">
            <div className="text-center mb-4">
              <h1 className="text-2xl font-semibold text-gray-900 mb-2">Join Meeting</h1>
              <p className="text-gray-600 text-sm">Configure your devices and join the call</p>
            </div>
            
            {connectionError && (
              <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg">
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-2">
                    <div className="w-4 h-4 bg-red-500 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">!</span>
                    </div>
                    <span className="text-sm">{connectionError}</span>
                  </div>
                  <button
                    onClick={() => setConnectionError(null)}
                    className="text-red-600 hover:text-red-800 font-bold"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {/* Device Selection */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <Mic className="w-5 h-5 text-blue-500" />
                  Microphone
                </label>
                <select
                  value={selectedAudioInput}
                  onChange={(e) => setSelectedAudioInput(e.target.value)}
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
                  onChange={async (e) => {
                    const newDeviceId = e.target.value;
                    setSelectedVideoInput(newDeviceId);
                    if (isVideoEnabled && newDeviceId) {
                      stopPreviewStream();
                      setTimeout(async () => {
                        await startPreviewStream();
                      }, 100);
                    }
                  }}
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

            {/* Video Preview */}
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

            {/* Pre-meeting Controls */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                onClick={toggleVideo}
                className={`p-3 rounded-lg flex flex-col items-center justify-center gap-2 text-sm font-medium ${
                  isVideoEnabled 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-200 text-gray-700'
                } hover:bg-blue-600 hover:text-white transition-colors`}
              >
                {isVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
                <span>{isVideoEnabled ? 'Camera On' : 'Camera Off'}</span>
              </button>

              <button
                onClick={toggleMute}
                className={`p-3 rounded-lg flex flex-col items-center justify-center gap-2 text-sm font-medium ${
                  isMuted 
                    ? 'bg-red-500 text-white' 
                    : 'bg-green-500 text-white'
                } hover:bg-opacity-80 transition-colors`}
              >
                {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                <span>{isMuted ? 'Muted' : 'Unmuted'}</span>
              </button>
            </div>

            {/* Join Button */}
            <button
              onClick={startMeetingWithRetry}
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
      ) : (
        <div className="h-screen flex bg-white">
          {/* Participants Sidebar */}
          <div className={`${showParticipantsList ? 'w-80' : 'w-0'} transition-all duration-300 bg-gray-50 border-r border-gray-200 overflow-hidden flex flex-col`}>
            {showParticipantsList && (
              <>
                <div className="p-4 border-b border-gray-200 bg-white">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">Participants ({participants.filter(p => !p.isLocal).length + 1})</h3>
                    <button
                      onClick={() => setShowParticipantsList(false)}
                      className="text-gray-500 hover:text-gray-700 p-1"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {/* Local user */}
                  <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-medium">
                        Y
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">You</div>
                        <div className="text-xs text-gray-500">Host</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isMuted ? (
                        <MicOff className="w-4 h-4 text-red-500" />
                      ) : (
                        <Mic className="w-4 h-4 text-green-500" />
                      )}
                      {isVideoEnabled ? (
                        <Video className="w-4 h-4 text-blue-500" />
                      ) : (
                        <VideoOff className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>
                  
                  {/* Remote participants */}
                  {participants
                    .filter(p => !p.isLocal)
                    .map((participant) => (
                      <div key={participant.attendeeId} className="flex items-center justify-between p-4 border-b border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${
                            participant.isActiveSpeaker ? 'bg-green-500' : 'bg-gray-500'
                          }`}>
                            {participant.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{participant.name}</div>
                            <div className="text-xs text-gray-500">
                              {participant.isActiveSpeaker ? 'Speaking' : 'Participant'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {participant.muted ? (
                            <MicOff className="w-4 h-4 text-red-500" />
                          ) : (
                            <Mic className="w-4 h-4 text-green-500" />
                          )}
                          {participant.videoEnabled ? (
                            <Video className="w-4 h-4 text-blue-500" />
                          ) : (
                            <VideoOff className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>

          {/* Main Meeting Area */}
          <div className="flex-1 flex flex-col">
            {/* Top Header Bar */}
            <div className="flex-shrink-0 bg-gray-100 border-b border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  </div>
                  <span className="font-medium text-gray-900">Live Meeting</span>
                  {connectionError && (
                    <div className="bg-red-100 border border-red-300 text-red-700 px-3 py-1 rounded text-sm">
                      {connectionError}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="bg-gray-200 px-3 py-1 rounded text-sm text-gray-700">
                    {participants.filter(p => !p.isLocal).length + 1} participant{participants.filter(p => !p.isLocal).length !== 0 ? 's' : ''}
                  </div>
                  <button 
                    onClick={() => setShowParticipantsList(!showParticipantsList)}
                    className={`p-2 rounded transition-colors ${showParticipantsList 
                      ? 'bg-blue-500 text-white' 
                      : 'text-gray-600 hover:bg-gray-200'
                    }`}
                    title="Participants"
                  >
                    <Users size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Video Grid */}
            <div className="flex-1 p-3 min-h-0">
              {contentShareTileId && isScreenSharing ? (
                /* Screen Share Layout */
                <div className="h-full flex gap-3">
                  {/* Main Content Share Area */}
                  {contentShareTileId && (
                    <div className="flex-1 bg-black rounded-lg overflow-hidden border border-gray-300 relative">
                      <video
                        ref={contentShareVideoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-2 left-2 bg-blue-500 text-white px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                        <Monitor className="w-3 h-3" />
                        Screen Share
                      </div>
                    </div>
                  )}
                  
                  {/* Participant Videos Sidebar */}
                  <div className="w-60 flex flex-col gap-2">
                    {/* Local Video (Mini) */}
                    <div className="relative bg-gray-200 rounded-lg overflow-hidden border border-gray-300 aspect-video">
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover ${isVideoEnabled ? 'block' : 'hidden'}`}
                      />
                      {!isVideoEnabled && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <VideoOff className="w-6 h-6 text-gray-500" />
                        </div>
                      )}
                      <div className="absolute bottom-1 left-1 bg-blue-500 text-white px-1 py-0.5 rounded text-xs font-medium">
                        You
                      </div>
                      <div className="absolute top-1 right-1 flex gap-1">
                        {isMuted && (
                          <div className="bg-red-500 text-white p-0.5 rounded">
                            <MicOff className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Remote Participants (Mini) */}
                    {participants
                      .filter(p => !p.isLocal)
                      .map((participant) => (
                        <div key={participant.attendeeId} className="relative bg-gray-200 rounded-lg overflow-hidden border border-gray-300 aspect-video">
                          {participant.videoEnabled && participant.tileId && (
                            <video
                              id={`video-${participant.attendeeId}`}
                              autoPlay
                              playsInline
                              className="w-full h-full object-cover"
                            />
                          )}
                          {!participant.videoEnabled && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <VideoOff className="w-6 h-6 text-gray-500" />
                            </div>
                          )}
                          <div className={`absolute bottom-1 left-1 px-1 py-0.5 rounded text-xs font-medium text-white ${
                            participant.isActiveSpeaker 
                              ? 'bg-green-500' 
                              : 'bg-blue-500'
                          }`}>
                            {participant.name}
                          </div>
                          {participant.muted && (
                            <div className="absolute top-1 right-1 bg-red-500 text-white p-0.5 rounded">
                              <MicOff className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                /* Normal Video Grid */
                <div className="h-full grid gap-2" style={{
                  gridTemplateColumns: participants.length <= 1 ? '1fr' : 
                                     participants.length <= 4 ? 'repeat(2, 1fr)' :
                                     'repeat(3, 1fr)',
                  gridTemplateRows: participants.length <= 2 ? '1fr' : 'repeat(2, 1fr)'
                }}>
                  {/* Local Video */}
                  <div className="relative bg-gray-200 rounded-lg overflow-hidden border border-gray-300">
                    <video
                      ref={localVideoRef}
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
                    <div className="absolute bottom-2 left-2 bg-blue-500 text-white px-2 py-1 rounded text-xs font-medium">
                      You
                    </div>
                    <div className="absolute top-2 right-2 flex gap-2">
                      {isMuted && (
                        <div className="bg-red-500 text-white p-1 rounded">
                          <MicOff className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Remote Participants */}
                  {participants
                    .filter(p => !p.isLocal)
                    .map((participant) => (
                      <div key={participant.attendeeId} className="relative bg-gray-200 rounded-lg overflow-hidden border border-gray-300">
                        {participant.videoEnabled && participant.tileId && (
                          <video
                            id={`video-${participant.attendeeId}`}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                          />
                        )}
                        {!participant.videoEnabled && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <VideoOff className="w-12 h-12 text-gray-500" />
                            <p className="text-gray-600 text-sm mt-2">{participant.name}</p>
                          </div>
                        )}
                        <div className={`absolute bottom-2 left-2 px-2 py-1 rounded text-xs font-medium text-white ${
                          participant.isActiveSpeaker 
                            ? 'bg-green-500' 
                            : 'bg-blue-500'
                        }`}>
                          {participant.name}
                        </div>
                        {participant.muted && (
                          <div className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded">
                            <MicOff className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Bottom Controls Bar */}
            <div className="flex-shrink-0 bg-gray-100 border-t border-gray-200 px-4 py-4">
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={toggleMute}
                  className={`p-3 rounded-lg text-white ${
                    isMuted 
                      ? 'bg-red-500 hover:bg-red-600' 
                      : 'bg-green-500 hover:bg-green-600'
                  } transition-colors`}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                </button>

                <button
                  onClick={toggleVideo}
                  className={`p-3 rounded-lg text-white ${
                    !isVideoEnabled 
                      ? 'bg-red-500 hover:bg-red-600' 
                      : 'bg-blue-500 hover:bg-blue-600'
                  } transition-colors`}
                  title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
                >
                  {isVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
                </button>

                <button
                  onClick={toggleScreenShare}
                  className={`p-3 rounded-lg ${
                    isScreenSharing 
                      ? 'bg-blue-500 text-white hover:bg-blue-600' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  } transition-colors`}
                  title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
                >
                  <Monitor size={18} />
                </button>

                <button
                  onClick={leaveMeeting}
                  className="px-4 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors flex items-center gap-2"
                >
                  <PhoneOff size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};