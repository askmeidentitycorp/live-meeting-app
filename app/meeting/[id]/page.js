"use client";
import { use, useEffect, useState } from "react";
import { MeetingRoom } from "@/app/components/MeetingRoom";

export default function MeetingPage({ params, searchParams }) {
  const { id } = use(params);        
  const { name } = use(searchParams); 

  const [meetingData, setMeetingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchMeeting() {
      try {
        const res = await fetch("/api/join-meeting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingId: id, attendeeName: name || "Guest" }),
        });
        const json = await res?.json();
        if (!res?.ok) throw new Error(json?.error || "Failed to join meeting. Please check the meeting ID or try again later.");
        setMeetingData(json);
      } catch (err) {
        setError(err?.message || "Failed to join meeting. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    fetchMeeting();
  }, [id, name]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <span className="relative flex h-12 w-12 mb-4">
        <span className="absolute inline-flex h-full w-full rounded-full border-4 border-t-blue-200 border-b-blue-600 border-l-transparent border-r-transparent animate-spin"></span>
      </span>
      <span className="text-lg text-gray-700 font-medium">Joining meeting...</span>
      <style jsx global>{`
        @keyframes spin-reverse {
          100% { transform: rotate(-360deg); }
        }
        .animate-spin-reverse {
          animation: spin-reverse 1s linear infinite;
        }
      `}</style>
    </div>
  );
  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <span className="text-lg text-red-600 text-center max-w-md">{error}</span>
    </div>
  );
  if (!meetingData) return null;

  return <MeetingRoom meetingData={meetingData} />;
}
