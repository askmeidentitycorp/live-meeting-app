"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function JoinMeetingForm({ meetingIdParam }) {
  const { data: session } = useSession();
  const isAuthed = !!session?.user;
  const searchParams = useSearchParams();
  const prefilledMeetingId = useMemo(() => meetingIdParam || searchParams?.get("id") || "", [meetingIdParam, searchParams]);
  const [meetingIdToJoin, setMeetingIdToJoin] = useState("");
  const [joinName, setJoinName] = useState("");
  const [error, setError] = useState(null);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    if (prefilledMeetingId) setMeetingIdToJoin(prefilledMeetingId);
  }, [prefilledMeetingId]);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    
    if (!meetingIdToJoin.trim()) {
      setError("Please enter a valid meeting ID");
      return;
    }
    
    if (!isAuthed && !joinName.trim()) {
      setError("Please enter your name");
      return;
    }
    
    setIsJoining(true);
    const nameToUse = isAuthed ? (session?.user?.name || "User") : (joinName || "Guest");
    
    // Small delay to show loading state
    await new Promise(resolve => setTimeout(resolve, 300));
    window.location.href = `/meeting/${meetingIdToJoin}?name=${encodeURIComponent(nameToUse)}`;
  }

  return (
    <form onSubmit={onSubmit} className="p-6 bg-gray-50 rounded-xl shadow-sm">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Join Meeting</h2>
      <div className="space-y-4">
        {error && (
          <div className="p-3 rounded-md bg-red-100 text-red-700 text-sm border border-red-200">
            {error}
          </div>
        )}
        {!prefilledMeetingId && (
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Meeting ID</span>
            <input
              type="text"
              className="mt-1 w-full p-3 border text-black border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
              value={meetingIdToJoin}
              onChange={(e) => setMeetingIdToJoin(e.target.value)}
              placeholder="Enter Meeting ID"
              disabled={isJoining}
              required
            />
          </label>
        )}
        {!isAuthed && (
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Your Name</span>
            <input
              type="text"
              className="mt-1 w-full p-3 border text-black border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="Enter your name"
              disabled={isJoining}
              required
            />
          </label>
        )}
        {isAuthed ? (
          <button
            type="submit"
            disabled={isJoining}
            className="w-full py-3 px-4 bg-green-600 text-white rounded-lg font-medium transition-all duration-200 hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isJoining && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            )}
            {isJoining ? "Joining..." : "Join Meeting"}
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isJoining}
              className="flex-1 py-3 px-4 bg-green-600 text-white rounded-lg font-medium transition-all duration-200 hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isJoining && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              )}
              {isJoining ? "Joining..." : "Join as Guest"}
            </button>
            <button
              type="button"
              onClick={() => signIn()}
              disabled={isJoining}
              className="flex-1 py-3 px-4 bg-gray-800 text-white rounded-lg font-medium transition-all duration-200 hover:bg-black cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Sign in
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
