"use client";

import Link from "next/link";
import { useState } from "react";

export default function Home() {
  const [title, setTitle] = useState("");
  const [hostName, setHostName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [meetingIdToJoin, setMeetingIdToJoin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function createMeeting(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingTitle: title || "Meeting", attendeeName: hostName || "Host" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create meeting");
      const meetingId = json.Meeting.MeetingId;
      window.location.href = `/meeting/${meetingId}?name=${encodeURIComponent(hostName || "Host")}`;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function joinById(e) {
    e.preventDefault();
    setError(null);
    const nameToUse = joinName || "Guest";
    if (!meetingIdToJoin) {
      setError("Please enter a valid meeting ID");
      return;
    }
    window.location.href = `/meeting/${meetingIdToJoin}?name=${encodeURIComponent(nameToUse)}`;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl w-full mx-auto bg-white rounded-2xl shadow-lg p-6 sm:p-8">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800">Video Conferencing</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600">
            Create a new meeting or join an existing one with seamless audio and video.
          </p>
        </header>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Forms */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Meeting Form */}
          <form onSubmit={createMeeting} className="p-6 bg-gray-50 rounded-xl shadow-sm transition-all duration-300 hover:shadow-md">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Create a New Meeting</h2>
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Meeting Title</span>
                <input
                  type="text"
                  className="mt-1 w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-black"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Team Sync"
                  disabled={loading}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Your Name</span>
                <input
                  type="text"
                  className="mt-1 w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-black"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="Alice"
                  disabled={loading}
                />
              </label>
              <button
                type="submit"
                className={`w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium transition-all duration-200 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  loading ? "opacity-50 cursor-not-allowed" : ""
                }`}
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Creating...
                  </span>
                ) : (
                  "Create & Join"
                )}
              </button>
            </div>
          </form>

          {/* Join Meeting Form */}
          <form onSubmit={joinById} className="p-6 bg-gray-50 rounded-xl shadow-sm transition-all duration-300 hover:shadow-md">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Join by Meeting ID</h2>
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Meeting ID</span>
                <input
                  type="text"
                  className="mt-1 w-full p-3 border text-black border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  value={meetingIdToJoin}
                  onChange={(e) => setMeetingIdToJoin(e.target.value)}
                  placeholder="Enter Meeting ID"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Your Name</span>
                <input
                  type="text"
                  className="mt-1 w-full p-3 border text-black border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Bob"
                />
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 bg-green-600 text-white rounded-lg font-medium transition-all duration-200 hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  Join Meeting
                </button>
                
              </div>
            </div>
          </form>
        </div>      
      </div>
    </div>
  );
}