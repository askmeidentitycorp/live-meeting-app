"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import JoinMeetingForm from "./JoinMeetingForm";
import { ArrowLeft } from "lucide-react";

export default function HomeContent() {  
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const meetingIdParam = searchParams?.get("id");
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (session?.user && meetingIdParam) {
      const nameToUse = session?.user?.name || "User";
      window.location.href = `/meeting/${meetingIdParam}?name=${encodeURIComponent(nameToUse)}`;
    } else if (!session?.user && meetingIdParam) {
      setShowJoin(true);
    }
  }, [session, meetingIdParam]);

  return (
    <div className="flex items-center h-[70vh] justify-center p-4 sm:p-6 md:p-8 relative">
      {(showCreate || showJoin) && (
        <button
          type="button"
          className="absolute left-2 top-2  sm:left-8 sm:top-8 z-10 w-11 h-11 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 shadow transition-colors duration-150 cursor-pointer"
          onClick={() => {
            setShowCreate(false);
            setShowJoin(false);
          }}
          title="Back"
          aria-label="Back"
        >
          <ArrowLeft size={24} />
        </button>
      )}
      <div className="max-w-3xl w-full mx-auto bg-white rounded-2xl shadow-lg p-8">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800">Video Conferencing</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600">Create a new meeting or join an existing one.</p>
        </header>

        {/* Clean landing buttons */}
        {!showCreate && !showJoin && !meetingIdParam && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              className={`w-full sm:w-auto px-6 cursor-pointer py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 flex items-center justify-center gap-2 ${creating ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={async () => {
                if (!session?.user) {
                  window.location.assign('/auth/signin');
                  return;
                }
                setCreating(true);
                try {
                  const res = await fetch("/api/meeting", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      meetingTitle: "Meeting"
                    })
                  });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json?.error || "Failed to create meeting");
                  const meetingId = json?.Meeting?.MeetingId;
                  // Host info is now automatically handled by authentication
                  window.location.href = `/meeting/${meetingId}?name=${encodeURIComponent(json?.hostInfo?.name || "Host")}`;
                } catch (err) {
                  alert(err?.message || "Failed to create meeting");
                } finally {
                  setCreating(false);
                }
              }}
              disabled={creating}
            >
              {creating ? "Creating..." : "Create Meeting"}
            </button>

            <button
              className="w-full sm:w-auto px-6 cursor-pointer py-3 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
              onClick={() => setShowJoin(true)}
            >
              Join Meeting
            </button>
          </div>
        )}

        {/* If redirecting */}
        {session?.user && meetingIdParam && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-600">Joining meeting...</p>
          </div>
        )}

        {/* Show join form */}
        {showJoin && (
          <JoinMeetingForm meetingIdParam={meetingIdParam} />
        )}
      </div>
    </div>
  );
}
