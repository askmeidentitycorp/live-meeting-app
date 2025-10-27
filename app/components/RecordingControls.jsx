"use client";

import { useState, useEffect } from "react";
import { Radio, Square, Loader2, CheckCircle } from "lucide-react";
import { useNotifications } from "../contexts/NotificationContext";

export function RecordingControls({ meetingId, isHost }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [processingJobId, setProcessingJobId] = useState(null);
  
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
        if (data.recording?.mediaConvertJobId) {
          setProcessingJobId(data.recording.mediaConvertJobId);
        }
      }
    } catch (err) {
      // Silently handle errors during status check
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
      setProcessingJobId(null);
      addNotification("Recording started", "success");
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
      
      if (data.mediaConvert?.jobId) {
        setProcessingJobId(data.mediaConvert.jobId);
        addNotification(
          `Recording stopped. Processing started (Job ID: ${data.mediaConvert.jobId.substring(0, 12)}...). Your video will be ready in a few minutes.`, 
          "success"
        );
      } else {
        addNotification("Recording stopped. Processing will begin shortly.", "info");
      }
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
    <div className="flex items-center gap-2">
      {processingJobId && !isRecording && (
        <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
          <CheckCircle className="w-4 h-4" />
          <span>Processing in background</span>
        </div>
      )}

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
  );
}
