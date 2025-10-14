"use client";

import { useRef, useEffect, useState } from "react";
import {
  ConsoleLogger,
  LogLevel,
  DefaultDeviceController,
  DefaultMeetingSession,
  MeetingSessionConfiguration,
  DefaultActiveSpeakerPolicy,
} from "amazon-chime-sdk-js";

export function useMeetingSession(Meeting, Attendee) {
  const meetingSessionRef = useRef(null);
  const audioElementRef = useRef(null);
  const contentShareVideoRef = useRef(null);
  
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [isLeavingMeeting, setIsLeavingMeeting] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [devices, setDevices] = useState({ audioInputs: [], videoInputs: [] });
  
  // Screen sharing states
  const [isLocalScreenSharing, setIsLocalScreenSharing] = useState(false);
  const [isRemoteScreenSharing, setIsRemoteScreenSharing] = useState(false);
  const [contentShareTileId, setContentShareTileId] = useState(null);
  const [contentShareAttendeeId, setContentShareAttendeeId] = useState(null);

  const handleMeetingEndReason = (statusCode) => {
    const errorMessages = {
      1: "Meeting ended normally.",
      2: "Meeting ended due to audio device failure.",
      3: "You were removed from the meeting.",
      4: "Meeting ended due to poor connection.",
      5: "Meeting ended due to server error.",
      6: "Meeting capacity exceeded.",
      10: "Meeting ended by host.",
      11: "Another session started from this device.",
      12: "Meeting ended due to concurrent session limit.",
    };
    
    setConnectionError(errorMessages[statusCode] || `Meeting ended unexpectedly (Code: ${statusCode}).`);
  };

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
    
    if (contentShareTileId === tileId) {
      console.log("Removing content share tile - switching back to normal layout");
      
      if (contentShareVideoRef.current) {
        try {
          if (meetingSessionRef.current) {
            meetingSessionRef.current.audioVideo.unbindVideoElement(tileId);
          }
          
          contentShareVideoRef.current.pause();
          contentShareVideoRef.current.srcObject = null;
          contentShareVideoRef.current.removeAttribute('srcObject');
          contentShareVideoRef.current.src = '';
          contentShareVideoRef.current.load();
          
          console.log("Content share video element cleaned up");
        } catch (error) {
          console.warn("Failed to clear content share video element:", error);
        }
      }
      
      setContentShareTileId(null);
      setContentShareAttendeeId(null);
      setIsLocalScreenSharing(false);
      setIsRemoteScreenSharing(false);
      
      console.log("All content share states cleared - returning to normal video layout");
      return;
    }

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
    const { boundAttendeeId, tileId } = tileState;
    
    setContentShareTileId(tileId);
    setContentShareAttendeeId(boundAttendeeId);
    
    const isLocalShare = boundAttendeeId === Attendee.AttendeeId;
    console.log("Content share from:", boundAttendeeId, "Is local:", isLocalShare);
    
    if (isLocalShare) {
      setIsLocalScreenSharing(true);
      setIsRemoteScreenSharing(false);
    } else {
      setIsLocalScreenSharing(false);
      setIsRemoteScreenSharing(true);
    }

    setTimeout(() => {
      if (contentShareVideoRef.current && meetingSessionRef.current) {
        try {
          meetingSessionRef.current.audioVideo.bindVideoElement(tileId, contentShareVideoRef.current);
          console.log("Bound content share tile to video element");
        } catch (error) {
          console.error("Failed to bind content share video element:", error);
        }
      }
    }, 100);
  };

  const handleAttendeePresenceChange = (attendeeId, present) => {
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
        const displayName = isLocal ? "You" : `User ${attendeeId.slice(-4)}`;

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

  const loadAvailableDevices = async () => {
    try {
      const audioInputDevices = await meetingSessionRef.current.audioVideo.listAudioInputDevices();
      const videoInputDevices = await meetingSessionRef.current.audioVideo.listVideoInputDevices();

      setDevices({
        audioInputs: audioInputDevices,
        videoInputs: videoInputDevices
      });
    } catch (error) {
      console.warn("Failed to load devices:", error);
    }
  };

  const initializeMeeting = async () => {
    if (!Meeting || !Attendee) {
      setConnectionError("Invalid meeting data provided.");
      return;
    }

    try {
      const logger = new ConsoleLogger("ChimeMeeting", LogLevel.INFO);
      const deviceController = new DefaultDeviceController(logger);
      const config = new MeetingSessionConfiguration(Meeting, Attendee);

      config.enableWebAudio = false;
      config.keepLastFrameWhenPaused = true;

      if (config.connectionHealthPolicyConfiguration) {
        config.connectionHealthPolicyConfiguration.cooldownTimeMs = 60000;
        config.connectionHealthPolicyConfiguration.pastSamplesToConsider = 15;
      }

      const session = new DefaultMeetingSession(config, logger, deviceController);
      meetingSessionRef.current = session;

      audioElementRef.current = document.createElement("audio");
      audioElementRef.current.autoplay = true;
      audioElementRef.current.controls = false;
      document.body.appendChild(audioElementRef.current);

      // Meeting observers setup would go here...
      // (Moving the observer setup to a separate function for clarity)

      await loadAvailableDevices();

    } catch (error) {
      console.error("Failed to initialize meeting:", error);
      setConnectionError(`Failed to initialize meeting: ${error.message}`);
    }
  };

  return {
    meetingSessionRef,
    audioElementRef,
    contentShareVideoRef,
    isConnected,
    setIsConnected,
    connectionError,
    setConnectionError,
    isLeavingMeeting,
    setIsLeavingMeeting,
    participants,
    setParticipants,
    devices,
    isLocalScreenSharing,
    setIsLocalScreenSharing,
    isRemoteScreenSharing,
    setIsRemoteScreenSharing,
    contentShareTileId,
    setContentShareTileId,
    contentShareAttendeeId,
    setContentShareAttendeeId,
    handleRemoteVideoTile,
    handleVideoTileRemoval,
    handleContentShareTile,
    handleAttendeePresenceChange,
    updateParticipantMuteStatus,
    updateActiveSpeakers,
    handleMeetingEndReason,
    initializeMeeting,
    loadAvailableDevices
  };
}