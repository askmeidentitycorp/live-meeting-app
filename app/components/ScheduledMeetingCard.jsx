"use client";

import { Calendar, Clock, Video, Trash2, Copy, Check } from "lucide-react";
import { useState } from "react";

export default function ScheduledMeetingCard({ meeting, onStart, onDelete }) {
  const [copied, setCopied] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const scheduledDate = new Date(meeting.scheduledDateTime);
  const now = new Date();
  const fiveMinutesBefore = new Date(scheduledDate.getTime() - 5 * 60000);
  const meetingEndTime = new Date(scheduledDate.getTime() + meeting.duration * 60000);
  const canStart = now >= fiveMinutesBefore && now < meetingEndTime;
  const isPast = now >= meetingEndTime;
  const isTooEarly = now < fiveMinutesBefore;

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getTimeUntil = () => {
    const diff = scheduledDate - now;
    if (diff < 0) return "Started";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `Starts in ${days}d ${hours}h`;
    if (hours > 0) return `Starts in ${hours}h ${minutes}m`;
    if (minutes > 0) return `Starts in ${minutes}m`;
    return "Starting soon";
  };

  const getStatusBadge = () => {
    if (isPast) {
      return (
        <div className="inline-block px-3 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
          Meeting Ended
        </div>
      );
    }
    
    if (canStart) {
      return (
        <div className="inline-block px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
          Ready to start
        </div>
      );
    }
    
    if (isTooEarly) {
      const timeUntilStart = fiveMinutesBefore - now;
      const minutesUntil = Math.ceil(timeUntilStart / 60000);
      return (
        <div className="inline-block px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
          Can start in {minutesUntil} min
        </div>
      );
    }
    
    return (
      <div className="inline-block px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
        {getTimeUntil()}
      </div>
    );
  };

  const copyMeetingLink = () => {
    // Use chimeMeetingId if meeting has started, otherwise use scheduled meeting ID
    const meetingParam = meeting.chimeMeetingId 
      ? `id=${meeting.chimeMeetingId}` 
      : `scheduledId=${meeting._id}`;
    const link = `${window.location.origin}?${meetingParam}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await onStart(meeting);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow border ${isPast ? 'border-gray-200 opacity-75' : 'border-gray-300'} p-4 hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-800 text-lg mb-1">
            {meeting.title}
          </h3>
          {meeting.description && (
            <p className="text-sm text-gray-600 mb-2">{meeting.description}</p>
          )}
        </div>
        {!isPast && (
          <button
            onClick={() => onDelete(meeting._id)}
            className="text-gray-400 hover:text-red-500 transition-colors ml-2"
            title="Delete meeting"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center text-sm text-gray-600">
          <Calendar size={16} className="mr-2 text-blue-500" />
          <span>{formatDate(scheduledDate)}</span>
        </div>
        <div className="flex items-center text-sm text-gray-600">
          <Clock size={16} className="mr-2 text-blue-500" />
          <span>{formatTime(scheduledDate)} ({meeting.duration} min)</span>
        </div>
        {getStatusBadge()}
      </div>

      <div className="flex gap-2">
        {canStart && !isPast && (
          <button
            onClick={handleStart}
            disabled={isStarting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Video size={18} />
            <span>{isStarting ? "Starting..." : "Start Meeting"}</span>
          </button>
        )}
        {isTooEarly && (
          <button
            disabled
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed"
            title="You can start the meeting 5 minutes before scheduled time"
          >
            <Video size={18} />
            <span>Too Early</span>
          </button>
        )}
        <button
          onClick={copyMeetingLink}
          className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          title="Copy meeting link"
        >
          {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
          <span className="hidden sm:inline">{copied ? "Copied!" : "Copy Link"}</span>
        </button>
      </div>
    </div>
  );
}
