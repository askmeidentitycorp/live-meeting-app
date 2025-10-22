"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function JoinMeetingForm() {
  const { data: session } = useSession();
  const isAuthed = !!session?.user;
  const searchParams = useSearchParams();
  const prefilledMeetingId = useMemo(() => searchParams?.get("id") || "", [searchParams]);
  const [meetingIdToJoin, setMeetingIdToJoin] = useState("");
  const [joinName, setJoinName] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (prefilledMeetingId) setMeetingIdToJoin(prefilledMeetingId);
  }, [prefilledMeetingId]);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    const nameToUse = isAuthed ? (session?.user?.name || "User") : (joinName || "Guest");
    if (!meetingIdToJoin) {
      setError("Please enter a valid meeting ID");
      return;
    }
    window.location.href = `/meeting/${meetingIdToJoin}?name=${encodeURIComponent(nameToUse)}`;
  }

  return (
    <form onSubmit={onSubmit} className="p-6 bg-gray-50 rounded-xl shadow-sm transition-all duration-300 hover:shadow-md">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Join Meeting</h2>
      <div className="space-y-4">
        {error && (
          <div className="p-3 rounded-md bg-red-100 text-red-700 text-sm">{error}</div>
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
              placeholder="Bob"
            />
          </label>
        )}
        {isAuthed ? (
          <button
            type="submit"
            className="w-full py-3 px-4 bg-green-600 text-white rounded-lg font-medium transition-all duration-200 hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 cursor-pointer"
          >
            Join
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="flex-1 py-3 px-4 bg-green-600 text-white rounded-lg font-medium transition-all duration-200 hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 cursor-pointer"
            >
              Join as Guest
            </button>
            <button
              type="button"
              onClick={() => signIn()}
              className="flex-1 py-3 px-4 bg-gray-800 text-white rounded-lg font-medium transition-all duration-200 hover:bg-black cursor-pointer"
            >
              Sign in
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
