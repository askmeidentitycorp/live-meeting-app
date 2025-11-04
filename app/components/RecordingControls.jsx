"use client";

import { useState, useEffect } from "react";
import { Radio, Square, Loader2, CheckCircle, Clock } from "lucide-react";
import { useNotifications } from "../contexts/NotificationContext";

export function RecordingControls({ meetingId, isHost, meetingSessionRef }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [processingJobId, setProcessingJobId] = useState(null);
  const [isWaitingForClips, setIsWaitingForClips] = useState(false);
  const [recordingInfo, setRecordingInfo] = useState(null);
  const [clipsFound, setClipsFound] = useState(0);
  
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
      setRecordingInfo(data.recording);
      
      // Broadcast recording stopped message to all participants
      if (meetingSessionRef?.current) {
        try {
          meetingSessionRef.current.audioVideo.realtimeSendDataMessage(
            'RECORDING_EVENT',
            JSON.stringify({ type: 'RECORDING_STOPPED' }),
            1000 // lifetime in ms
          );
        } catch (e) {
          console.error('Failed to send recording stop notification:', e);
        }
      }
      
      // Show notification that recording is stopped
      addNotification("Recording stopped. Waiting for clips to be saved...", "info");
      
      // Start polling for clips and trigger processing
      setIsWaitingForClips(true);
      pollForClipsAndStartProcessing(data.recording);
      
    } catch (err) {
      addNotification(err.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const pollForClipsAndStartProcessing = async (recording) => {
    const maxAttempts = 30; // 30 attempts with 2-second intervals = 60 seconds max
    let attempts = 0;
    
    const checkClips = async () => {
      attempts++;
      
      try {
        // Check if clips exist in S3 by calling the process API's GET endpoint
        const res = await fetch(`/api/recording/process?meetingId=${meetingId}`);
        const data = await res.json();
        
        // Update clips found count for UI feedback
        if (data.clipsFound !== undefined) {
          setClipsFound(data.clipsFound);
        }
        
        // If we get a job ID back or clips are stable, processing has started
        if (res.ok && (data.jobId || data.status === "SUBMITTED")) {
          setIsWaitingForClips(false);
          setProcessingJobId(data.jobId);
          setClipsFound(0);
          
          const message = data.processingMode === 'BATCHED'
            ? `Processing ${data.clipsCount} clips in ${data.batchCount} batches. Video will be ready in a few minutes.`
            : `Processing started (Job ID: ${data.jobId?.substring(0, 12)}...). Video will be ready in a few minutes.`;
          
          addNotification(message, "success");
          return; // Stop polling
        }
        
        // If processing is being initialized, keep showing waiting status but don't retry immediately
        if (data.status === "INITIALIZING") {
          console.info("Processing is being initialized...");
          if (attempts < maxAttempts) {
            setTimeout(checkClips, 3000); // Check every 3 seconds when initializing
          } else {
            setIsWaitingForClips(false);
            setClipsFound(0);
            addNotification("Processing is being initialized. Please wait...", "info");
          }
          return;
        }
        
        // If clips not ready yet (WAITING_FOR_CLIPS status)
        if (data.status === "WAITING_FOR_CLIPS") {
          if (attempts < maxAttempts) {
            setTimeout(checkClips, 2000); // Check every 2 seconds
          } else {
            setIsWaitingForClips(false);
            setClipsFound(0);
            addNotification("Recording saved. Processing will begin automatically.", "info");
          }
          return;
        }
        
        // If error occurred, stop polling
        if (data.status === "ERROR") {
          setIsWaitingForClips(false);
          setClipsFound(0);
          addNotification(data.message || "Error starting processing. Please try again.", "error");
          return;
        }
        
        // For any other status, retry if not exceeded max attempts
        if (attempts < maxAttempts) {
          setTimeout(checkClips, 2000);
        } else {
          setIsWaitingForClips(false);
          setClipsFound(0);
          addNotification("Recording saved. Processing will begin automatically.", "info");
        }
        
      } catch (err) {
        console.error("Error checking clips:", err);
        if (attempts < maxAttempts) {
          setTimeout(checkClips, 2000);
        } else {
          setIsWaitingForClips(false);
          setClipsFound(0);
          addNotification("Recording saved. Processing will begin automatically.", "info");
        }
      }
    };
    
    // Start checking after 5 seconds (give Chime time to write initial clips)
    setTimeout(checkClips, 5000);
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

        {isWaitingForClips && (
          <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg">
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
            <span className="text-sm font-medium text-blue-600">
              {clipsFound > 0 
                ? `Waiting for clips (${clipsFound} found)...`
                : 'Waiting for clips...'}
            </span>
          </div>
        )}

        <button
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={isLoading || isWaitingForClips}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-gray-700 hover:bg-gray-800 text-white'
          } ${(isLoading || isWaitingForClips) ? 'opacity-60 cursor-not-allowed' : ''}`}
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

        {/* Waiting for clips indicator (mobile) */}
        {isWaitingForClips && (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="truncate">{clipsFound > 0 ? `Waiting (${clipsFound})` : 'Waiting'}</span>
          </div>
        )}

        <button
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={isLoading || isWaitingForClips}
          className={`p-2 rounded-md transition-colors ${isRecording ? 'bg-red-500 text-white' : 'bg-gray-700 text-white'} ${(isLoading || isWaitingForClips) ? 'opacity-60 cursor-not-allowed' : ''}`}
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
