"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import NavBar from "./components/NavBar";
import JoinMeetingForm from "./components/JoinMeetingForm";
import { ArrowLeft } from "lucide-react";

export default function Home() {
  const { data: session } = useSession();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [creating, setCreating] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100">
      <NavBar />
      <div className="flex items-center h-[70vh] justify-center p-4 sm:p-6 md:p-8 relative">
        {(showCreate || showJoin) && (
          <button
            type="button"
            className="absolute left-2 top-2 sm:left-8 sm:top-8 z-10 w-11 h-11 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 shadow transition-colors duration-150 cursor-pointer"
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
          {!showCreate && !showJoin && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                className={`w-full sm:w-auto px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 flex items-center justify-center gap-2 ${creating ? 'opacity-60 cursor-not-allowed' : ''}`}
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
                {creating ? (
                  <span className="flex items-center gap-2">
                    {/* Unique dual ring spinner */}
                    <span className="relative flex h-5 w-5">
                      <span className="absolute inline-flex h-full w-full rounded-full border-2 border-t-blue-200 border-b-blue-600 border-l-transparent border-r-transparent animate-spin"></span>
                      <span className="absolute inline-flex h-3 w-3 top-1 left-1 rounded-full border-2 border-t-blue-600 border-b-blue-200 border-l-transparent border-r-transparent animate-spin-reverse"></span>
                    </span>
                    Creating...
                  </span>
                ) : (
                  'Create a Meeting'
                )}
              <style jsx global>{`
                @keyframes spin-reverse {
                  100% { transform: rotate(-360deg); }
                }
                .animate-spin-reverse {
                  animation: spin-reverse 1s linear infinite;
                }
              `}</style>
              </button>
              <button
                className="w-full sm:w-auto px-6 py-3 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700"
                onClick={() => setShowJoin(true)}
              >
                Join a Meeting
              </button>
            </div>
          )}
          {showJoin && (
            <div className="mt-6">
              <JoinMeetingForm />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}