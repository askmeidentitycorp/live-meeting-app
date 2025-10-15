"use client";
import { use, useEffect, useState } from "react";
import { MeetingRoom } from "@/app/components/MeetingRoom";

export default function MeetingPage({ params, searchParams }) {
  const { id } = use(params);          // 👈 unwrap params
  const { name } = use(searchParams);  // 👈 unwrap searchParams

  const [meetingData, setMeetingData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMeeting() {
      try {
        const res = await fetch("/api/join-meeting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingId: id, attendeeName: name || "Guest" }),
        });
        const json = await res?.json();
        if (!res?.ok) throw new Error(json?.error || "Join failed");
        setMeetingData(json);
      } catch (err) {
        alert(err?.message);
      } finally {
        setLoading(false);
      }
    }
    fetchMeeting();
  }, [id, name]);

  if (loading) return <p className="p-6">Joining meeting...</p>;
  if (!meetingData) return <p className="p-6 text-red-600">Failed to join meeting.</p>;

  return <MeetingRoom meetingData={meetingData} />;
}
