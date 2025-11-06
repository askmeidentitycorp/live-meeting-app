"use client";

import { useState, useEffect } from "react";
import { Radio, Square, Loader2 } from "lucide-react";
import { useNotifications } from "../contexts/NotificationContext";

export function RecordingControls({ meetingId, isHost, meetingSessionRef }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (isHost) {
      checkRecordingStatus();
    }
  }, [meetingId, isHost]);

  useEffect(() => {
    let interval;
    if (isRecording && recordingStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - new Date(recordingStartTime).getTime()) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, recordingStartTime]);

  const checkRecordingStatus = async () => {
    try {
      const res = await fetch(`/api/recording/status?meetingId=${meetingId}`);
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        return;
      }
      
      const data = await res.json();
      
      if (res.ok) {
        setIsRecording(data.isRecording || false);
        if (data.recording?.startedAt) {
          setRecordingStartTime(data.recording.startedAt);
        }
      }
    } catch (err) {
      console.debug("Recording status check skipped:", err.message);
    }
  };

  const handleStartRecording = async () => {
    setIsLoading(true);

    try {
      const res = await fetch("/api/recording/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start recording");
      }

      setIsRecording(true);
      setRecordingStartTime(data.recording.startedAt);
      setElapsedTime(0);
      
      // Broadcast recording started message to all participants
      if (meetingSessionRef?.current) {
        try {
          meetingSessionRef.current.audioVideo.realtimeSendDataMessage(
            'RECORDING_EVENT',
            JSON.stringify({ type: 'RECORDING_STARTED' }),
            1000 // lifetime in ms
          );
        } catch (e) {
          console.error('Failed to send recording notification:', e);
        }
      }
      
      addNotification("🔴 Recording started - This meeting is being recorded", "info");
    } catch (err) {
      addNotification(err.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopRecording = async () => {
    setIsLoading(true);

    try {
      const res = await fetch("/api/recording/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to stop recording");
      }

      setIsRecording(false);
      setRecordingStartTime(null);
      setElapsedTime(0);
      
      if (meetingSessionRef?.current) {
        try {
          meetingSessionRef.current.audioVideo.realtimeSendDataMessage(
            'RECORDING_EVENT',
            JSON.stringify({ type: 'RECORDING_STOPPED' }),
            1000 
          );
        } catch (e) {
          console.error('Failed to send recording stop notification:', e);
        }
      }
      
      // Trigger processing in background (fire and forget)
      fetch("/api/recording/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId })
      }).catch(err => console.error('Failed to trigger processing:', err));
      
      addNotification("Recording stopped successfully. Video will be ready in sometime.", "success");
      
    } catch (err) {
      addNotification(err.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isHost) {
    return null;
  }

  return (
    <>
      {/* Desktop / tablet: full controls */}
      <div className="hidden sm:flex items-center gap-2">
        {isRecording && (
          <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-lg">
            <div className="flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-red-500 animate-pulse" />
              <span className="text-sm font-medium text-red-600">REC</span>
            </div>
            <span className="text-sm font-mono text-gray-700">
              {formatTime(elapsedTime)}
            </span>
          </div>
        )}

        <button
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={isLoading}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-gray-700 hover:bg-gray-800 text-white'
          } ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
          title={isRecording ? 'Stop Recording' : 'Start Recording'}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isRecording ? (
            <>
              <Square className="w-4 h-4" />
              <span>Stop</span>
            </>
          ) : (
            <>
              <Radio className="w-4 h-4" />
              <span>Record</span>
            </>
          )}
        </button>
      </div>

      {/* Mobile: compact controls to avoid header overflow */}
      <div className="flex sm:hidden items-center gap-2">
        {/* REC icon */}
        {isRecording && (
          <div className="w-8 h-8 bg-red-50 rounded-full flex items-center justify-center">
            <Radio className="w-4 h-4 text-red-500 animate-pulse" />
          </div>
        )}

        {/* Timer (mobile) */}
        {isRecording && (
          <div className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-xs font-mono">
            {formatTime(elapsedTime)}
          </div>
        )}

        {/* Waiting for clips indicator (mobile) - removed */}

        <button
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={isLoading}
          className={`p-2 rounded-md transition-colors ${isRecording ? 'bg-red-500 text-white' : 'bg-gray-700 text-white'} ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
          title={isRecording ? 'Stop Recording' : 'Start Recording'}
          aria-pressed={isRecording}
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isRecording ? (
            <Square className="w-4 h-4" />
          ) : (
            <Radio className="w-4 h-4" />
          )}
        </button>
      </div>
    </>
  );
}
