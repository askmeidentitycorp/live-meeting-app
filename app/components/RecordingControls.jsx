"use client";

import { useState, useEffect } from "react";
import { Radio, Square, Loader2 } from "lucide-react";

export function RecordingControls({ meetingId, isHost }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Fetch recording status on mount
  useEffect(() => {
    if (isHost) {
      checkRecordingStatus();
    }
  }, [meetingId, isHost]);

  // Update elapsed time
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
      const data = await res.json();
      
      if (res.ok) {
        setIsRecording(data.isRecording);
        if (data.recording?.startedAt) {
          setRecordingStartTime(data.recording.startedAt);
        }
      }
    } catch (err) {
      console.error("Failed to check recording status:", err);
    }
  };

  const handleStartRecording = async () => {
    setIsLoading(true);
    setError(null);

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
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopRecording = async () => {
    setIsLoading(true);
    setError(null);

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
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(null), 5000);
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
      {error && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          {error}
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
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
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
