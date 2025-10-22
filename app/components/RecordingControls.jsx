"use client";

import { useState, useEffect } from "react";
import { Radio, Square, Loader2 } from "lucide-react";
import { useNotifications } from "../contexts/NotificationContext";

export function RecordingControls({ meetingId, isHost }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [processingStatus, setProcessingStatus] = useState(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  
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

  // Poll for processing status
  useEffect(() => {
    if (!isHost || !processingStatus || processingStatus === "COMPLETE" || processingStatus === "ERROR") {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/recording/process?meetingId=${meetingId}`);
        
        // Check if response is JSON
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          console.error("Expected JSON response but got:", contentType);
          return;
        }
        
        const data = await response.json();

        if (response.ok) {
          setProcessingStatus(data.status);
          setProcessingProgress(data.progress || 0);

          if (data.status === "COMPLETE") {
            clearInterval(pollInterval);
            addNotification("Recording saved to S3", "success");
          } else if (data.status === "ERROR" || data.status === "CANCELED") {
            addNotification(`Processing ${data.status.toLowerCase()}`, "error");
            clearInterval(pollInterval);
          }
          // Keep polling if PENDING or SUBMITTED or PROGRESSING
        }
      } catch (err) {
        console.error("Failed to check processing status:", err);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [isHost, meetingId, processingStatus]);

  const checkRecordingStatus = async () => {
    try {
      const res = await fetch(`/api/recording/status?meetingId=${meetingId}`);
      
      // Check if response is JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error("Expected JSON response but got:", contentType);
        return;
      }
      
      const data = await res.json();
      
      if (res.ok) {
        setIsRecording(data.isRecording);
        if (data.recording?.startedAt) {
          setRecordingStartTime(data.recording.startedAt);
        }
        if (data.recording?.mediaConvertStatus) {
          setProcessingStatus(data.recording.mediaConvertStatus);
        }
      }
    } catch (err) {
      console.error("Failed to check recording status:", err);
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
      setProcessingStatus(null);
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
      setProcessingStatus("SUBMITTED");
      setProcessingProgress(0);
      addNotification("Recording stopped. Processing started...", "info");
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
      {processingStatus && processingStatus !== "COMPLETE" && (
        <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>
            {processingStatus === "PENDING" 
              ? "Initializing..." 
              : processingProgress > 0 
                ? `${processingProgress}%` 
                : "Processing..."
            }
          </span>
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
        disabled={isLoading || (processingStatus && processingStatus !== "COMPLETE")}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
          isRecording
            ? 'bg-red-500 hover:bg-red-600 text-white'
            : 'bg-gray-700 hover:bg-gray-800 text-white'
        } ${(isLoading || (processingStatus && processingStatus !== "COMPLETE")) ? 'opacity-60 cursor-not-allowed' : ''}`}
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
