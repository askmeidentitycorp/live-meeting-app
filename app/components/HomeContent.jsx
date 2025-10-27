"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import JoinMeetingForm from "./JoinMeetingForm";
import ScheduleMeetingModal from "./ScheduleMeetingModal";
import ScheduledMeetingCard from "./ScheduledMeetingCard";
import { ArrowLeft, Calendar, Video, Users, Plus, Clock } from "lucide-react";

export default function HomeContent() {  
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const meetingIdParam = searchParams?.get("id");
  const scheduledIdParam = searchParams?.get("scheduledId");
  const viewParam = searchParams?.get("view");
  const [showJoin, setShowJoin] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduledMeetings, setScheduledMeetings] = useState([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [scheduledMeetingInfo, setScheduledMeetingInfo] = useState(null);
  const [loadingScheduledInfo, setLoadingScheduledInfo] = useState(false);
  const [startingMeeting, setStartingMeeting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (session?.user && meetingIdParam) {
      const nameToUse = session?.user?.name || "User";
      window.location.href = `/meeting/${meetingIdParam}?name=${encodeURIComponent(nameToUse)}`;
    } else if (!session?.user && meetingIdParam) {
      setShowJoin(true);
    }
  }, [session, meetingIdParam]);

  useEffect(() => {
    if (scheduledIdParam) {
      loadScheduledMeetingInfo(scheduledIdParam);
    }
  }, [scheduledIdParam, session]);

  const loadScheduledMeetingInfo = async (scheduledId) => {
    setLoadingScheduledInfo(true);
    setError(null);
    try {
      const res = await fetch(`/api/scheduled-meeting/${scheduledId}/info`);
      const json = await res.json();
      if (res.ok && json.meeting) {
        setScheduledMeetingInfo(json.meeting);
        
        if (json.meeting.chimeMeetingId) {
          router.push(`/?id=${json.meeting.chimeMeetingId}`);
        }
      } else {
        setError(json.error || "Scheduled meeting not found");
      }
    } catch (error) {
      console.error("Error loading scheduled meeting info:", error);
      setError("Failed to load meeting information. Please try again.");
    } finally {
      setLoadingScheduledInfo(false);
    }
  };

  useEffect(() => {
    if (session?.user && (viewParam === 'scheduled' || !viewParam)) {
      loadScheduledMeetings();
    }
  }, [session, viewParam]);

  const loadScheduledMeetings = async () => {
    setLoadingScheduled(true);
    setError(null);
    try {
      const res = await fetch("/api/scheduled-meeting");
      const json = await res.json();
      if (res.ok && json.meetings) {
        setScheduledMeetings(json.meetings);
      } else {
        setError(json.error || "Failed to load scheduled meetings");
      }
    } catch (error) {
      console.error("Error loading scheduled meetings:", error);
      setError("Failed to load scheduled meetings. Please try again.");
    } finally {
      setLoadingScheduled(false);
    }
  };

  const handleScheduleMeeting = async ({ title, description, scheduledDateTime, duration }) => {
    setError(null);
    try {
      const res = await fetch("/api/scheduled-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, scheduledDateTime, duration })
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to schedule meeting");
      
      setShowScheduleModal(false);
      await loadScheduledMeetings();
    } catch (err) {
      setError(err?.message || "Failed to schedule meeting");
      throw err;
    }
  };

  const handleStartScheduledMeeting = async (meeting) => {
    setStartingMeeting(true);
    setError(null);
    try {
      const res = await fetch("/api/scheduled-meeting/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledMeetingId: meeting._id })
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to start meeting");
      
      const meetingId = json.meetingId;
      router.push(`/meeting/${meetingId}?name=${encodeURIComponent(session?.user?.name || "Host")}`);
    } catch (err) {
      setError(err?.message || "Failed to start meeting");
      setStartingMeeting(false);
    }
  };

  const handleDeleteScheduledMeeting = async (meetingId) => {
    if (!confirm("Are you sure you want to delete this scheduled meeting?")) {
      return;
    }
    
    setError(null);
    try {
      const res = await fetch(`/api/scheduled-meeting/${meetingId}`, {
        method: "DELETE"
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to delete meeting");
      
      await loadScheduledMeetings();
    } catch (err) {
      setError(err?.message || "Failed to delete meeting");
    }
  };

  const showBackButton = showJoin || scheduledIdParam || viewParam === 'scheduled';

  return (
    <div className="flex items-center min-h-[70vh] justify-center p-4 sm:p-6 md:p-8 relative">
      {showBackButton && (
        <button
          type="button"
          className="absolute left-2 top-2 sm:left-8 sm:top-8 z-10 w-11 h-11 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 shadow transition-colors duration-150 cursor-pointer"
          onClick={() => {
            setShowJoin(false);
            router.push('/');
          }}
          title="Back"
          aria-label="Back"
        >
          <ArrowLeft size={24} />
        </button>
      )}

      {/* SCREEN 1: Main Landing Page */}
      {!showJoin && !meetingIdParam && !scheduledIdParam && viewParam !== 'scheduled' && (
        <div className="max-w-4xl w-full mx-auto">
          <header className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Welcome to Video Conferencing</h1>
            <p className="text-base text-gray-600">Connect with anyone, anywhere, anytime</p>
          </header>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-start gap-3">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="font-medium">{error}</p>
              </div>
              <button 
                onClick={() => setError(null)}
                className="text-red-500 hover:text-red-700"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Create Meeting Card */}
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-5 text-white hover:shadow-xl transition-all duration-200 hover:scale-[1.02]">
              <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-lg mb-3">
                <Video size={24} />
              </div>
              <h3 className="text-lg font-bold mb-1">Instant Meeting</h3>
              <p className="text-blue-100 text-xs mb-4">Start an instant meeting now</p>
              <button
                className={`w-full px-4 py-2.5 rounded-lg bg-white text-blue-600 font-semibold hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-sm ${creating ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                onClick={async () => {
                  if (!session?.user) {
                    window.location.assign('/auth/signin');
                    return;
                  }
                  setCreating(true);
                  setError(null);
                  try {
                    const res = await fetch("/api/meeting", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ meetingTitle: "Meeting" })
                    });
                    const json = await res.json();
                    if (!res.ok) throw new Error(json?.error || "Failed to create meeting");
                    const meetingId = json?.Meeting?.MeetingId;
                    window.location.href = `/meeting/${meetingId}?name=${encodeURIComponent(json?.hostInfo?.name || "Host")}`;
                  } catch (err) {
                    setError(err?.message || "Failed to create meeting");
                    setCreating(false);
                  }
                }}
                disabled={creating}
              >
                {creating ? (
                  <>
                    <div className="w-[18px] h-[18px] border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Plus size={18} />
                    <span>New Meeting</span>
                  </>
                )}
              </button>
            </div>

            {/* Join Meeting Card */}
            <div className="bg-white rounded-xl shadow-lg p-5 border-2 border-gray-200 hover:shadow-xl transition-all duration-200 hover:scale-[1.02]">
              <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-lg mb-3">
                <Users size={24} className="text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Join Meeting</h3>
              <p className="text-gray-600 text-xs mb-4">Enter a meeting code to join</p>
              <button
                className="w-full px-4 py-2.5 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors cursor-pointer flex items-center justify-center gap-2 text-sm"
                onClick={() => setShowJoin(true)}
              >
                <Users size={18} />
                Join Now
              </button>
            </div>

            {/* Schedule Meeting Card */}
            <div className="bg-white rounded-xl shadow-lg p-5 border-2 border-gray-200 hover:shadow-xl transition-all duration-200 hover:scale-[1.02]">
              <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-lg mb-3">
                <Calendar size={24} className="text-purple-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Schedule Meeting</h3>
              <p className="text-gray-600 text-xs mb-4">Plan a meeting for later</p>
              <button
                className="w-full px-4 py-2.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors cursor-pointer flex items-center justify-center gap-2 text-sm"
                onClick={() => {
                  if (!session?.user) {
                    window.location.assign('/auth/signin');
                    return;
                  }
                  setShowScheduleModal(true);
                }}
              >
                <Calendar size={18} />
                Schedule
              </button>
            </div>
          </div>

          {/* Scheduled Meetings Section */}
          {session?.user && scheduledMeetings.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg p-5 border-2 border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-9 h-9 bg-blue-100 rounded-lg">
                    <Clock size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Your Scheduled Meetings</h3>
                    <p className="text-xs text-gray-600">{scheduledMeetings.length} upcoming {scheduledMeetings.length === 1 ? 'meeting' : 'meetings'}</p>
                  </div>
                </div>
                <button
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors cursor-pointer text-xs"
                  onClick={() => router.push('/?view=scheduled')}
                >
                  View All
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {scheduledMeetings.slice(0, 3).map((meeting) => {
                  const scheduledDate = new Date(meeting.scheduledDateTime);
                  const now = new Date();
                  const fiveMinutesBefore = new Date(scheduledDate.getTime() - 5 * 60000);
                  const meetingEndTime = new Date(scheduledDate.getTime() + meeting.duration * 60000);
                  const canStart = now >= fiveMinutesBefore && now < meetingEndTime;
                  const isPast = now >= meetingEndTime;
                  
                  return (
                    <div key={meeting._id} className="bg-gray-50 rounded-lg p-3 border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer">
                      <h4 className="font-semibold text-gray-900 mb-1 truncate text-sm">{meeting.title}</h4>
                      <p className="text-xs text-gray-600 mb-1.5">{scheduledDate.toLocaleDateString()} at {scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      {canStart && !isPast && (
                        <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">Ready to start</span>
                      )}
                      {isPast && (
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded">Ended</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SCREEN 2: Join Meeting Form */}
      {(showJoin || (!session?.user && meetingIdParam)) && !loadingScheduledInfo && (
        <div className="max-w-3xl w-full mx-auto bg-white rounded-2xl shadow-lg p-8">
          <JoinMeetingForm meetingIdParam={meetingIdParam} />
        </div>
      )}

      {/* SCREEN 3: Scheduled Meeting Info (when someone clicks a scheduled meeting link) */}
      {scheduledIdParam && !meetingIdParam && (
        <div className="max-w-3xl w-full mx-auto bg-white rounded-2xl shadow-lg p-8">
          <header className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-800">Scheduled Meeting</h1>
          </header>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-start gap-3">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="font-medium">{error}</p>
              </div>
              <button 
                onClick={() => setError(null)}
                className="text-red-500 hover:text-red-700"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}

          {loadingScheduledInfo ? (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-600">Loading meeting information...</p>
            </div>
          ) : scheduledMeetingInfo ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <Calendar className="text-blue-600" size={32} />
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-gray-800">{scheduledMeetingInfo.title}</h2>
                  {scheduledMeetingInfo.description && (
                    <p className="text-gray-600 mt-1">{scheduledMeetingInfo.description}</p>
                  )}
                </div>
              </div>
              
              <div className="space-y-2 text-sm text-gray-700 mb-4">
                <p><strong>Scheduled for:</strong> {new Date(scheduledMeetingInfo.scheduledDateTime).toLocaleString()}</p>
                <p><strong>Duration:</strong> {scheduledMeetingInfo.duration} minutes</p>
                <p><strong>Host:</strong> {scheduledMeetingInfo.hostName}</p>
              </div>

              {(() => {
                const scheduledDateTime = new Date(scheduledMeetingInfo.scheduledDateTime);
                const now = new Date();
                const fiveMinutesBefore = new Date(scheduledDateTime.getTime() - 5 * 60000);
                const meetingEndTime = new Date(scheduledDateTime.getTime() + scheduledMeetingInfo.duration * 60000);
                const canStart = now >= fiveMinutesBefore && now < meetingEndTime;
                const isPast = now >= meetingEndTime;
                const isTooEarly = now < fiveMinutesBefore;

                if (isPast) {
                  return (
                    <div className="bg-gray-50 border border-gray-200 rounded p-4 text-center">
                      <p className="text-gray-800 font-medium">This meeting has ended</p>
                      <p className="text-gray-600 text-sm mt-1">The meeting duration has passed</p>
                    </div>
                  );
                }

                if (isTooEarly) {
                  const minutesUntilStart = Math.ceil((fiveMinutesBefore - now) / 60000);
                  return (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-center">
                      <p className="text-yellow-800 font-medium">Meeting starts soon</p>
                      <p className="text-yellow-700 text-sm mt-1">
                        {session?.user?.email === scheduledMeetingInfo.hostEmail
                          ? `You can start the meeting in ${minutesUntilStart} minute${minutesUntilStart !== 1 ? 's' : ''} (5 minutes before scheduled time)`
                          : 'The host will start the meeting at the scheduled time'}
                      </p>
                      {session?.user?.email === scheduledMeetingInfo.hostEmail && (
                        <button
                          onClick={() => loadScheduledMeetingInfo(scheduledIdParam)}
                          className="mt-3 px-4 py-2 border border-yellow-600 text-yellow-700 rounded-lg hover:bg-yellow-100"
                        >
                          Refresh Status
                        </button>
                      )}
                    </div>
                  );
                }

                if (scheduledMeetingInfo.status === "scheduled") {
                  return (
                    <div className="bg-orange-50 border border-orange-200 rounded p-4 text-center">
                      {!session?.user ? (
                        <>
                          <p className="text-orange-800 font-medium">Waiting for host to start the meeting</p>
                          <p className="text-orange-700 text-sm mt-1">The meeting time has arrived. Please wait for the host to begin.</p>
                          <button
                            onClick={() => loadScheduledMeetingInfo(scheduledIdParam)}
                            className="mt-3 px-4 py-2 border border-orange-600 text-orange-700 rounded-lg hover:bg-orange-100"
                          >
                            Refresh Status
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-orange-800 font-medium">
                            {session?.user?.email === scheduledMeetingInfo.hostEmail 
                              ? "Ready to start your meeting" 
                              : "Waiting for host to start the meeting"}
                          </p>
                          <p className="text-orange-700 text-sm mt-1">
                            {session?.user?.email === scheduledMeetingInfo.hostEmail
                              ? "Click below to start the meeting and let participants join"
                              : "The meeting time has arrived. Please wait for the host to begin."}
                          </p>
                          <div className="flex gap-2 justify-center mt-3">
                            {session?.user?.email === scheduledMeetingInfo.hostEmail && (
                              <button
                                onClick={() => handleStartScheduledMeeting({ _id: scheduledMeetingInfo._id })}
                                disabled={startingMeeting}
                                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                              >
                                {startingMeeting && (
                                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                )}
                                {startingMeeting ? "Starting..." : "Start Meeting Now"}
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                }

                return null;
              })()}
            </div>
          ) : null}
        </div>
      )}

      {/* SCREEN 4: View All Scheduled Meetings */}
      {viewParam === 'scheduled' && session?.user && (
        <div className="max-w-6xl w-full mx-auto bg-white rounded-2xl shadow-lg p-8">
          <header className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-800">Your Scheduled Meetings</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600">Manage your upcoming meetings</p>
          </header>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-start gap-3">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="font-medium">{error}</p>
              </div>
              <button 
                onClick={() => setError(null)}
                className="text-red-500 hover:text-red-700"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}

          {loadingScheduled ? (
            <div className="flex items-center justify-center gap-2 text-gray-500 py-8">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
              <span>Loading scheduled meetings...</span>
            </div>
          ) : scheduledMeetings.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="mx-auto text-gray-300 mb-4" size={64} />
              <p className="text-gray-500 mb-4">No scheduled meetings</p>
              <button
                onClick={() => setShowScheduleModal(true)}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Schedule Your First Meeting
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {scheduledMeetings.map((meeting) => (
                <ScheduledMeetingCard
                  key={meeting._id}
                  meeting={meeting}
                  onStart={handleStartScheduledMeeting}
                  onDelete={handleDeleteScheduledMeeting}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* SCREEN 5: Redirecting to meeting */}
      {session?.user && meetingIdParam && (
        <div className="max-w-3xl w-full mx-auto bg-white rounded-2xl shadow-lg p-8">
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-600">Joining meeting...</p>
          </div>
        </div>
      )}

      {/* Schedule Meeting Modal */}
      <ScheduleMeetingModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onSchedule={handleScheduleMeeting}
      />
    </div>
  );
}
