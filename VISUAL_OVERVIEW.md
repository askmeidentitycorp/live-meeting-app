# Authentication Integration - Visual Overview

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐              ┌──────────────┐                │
│  │   Signed In   │              │ Not Signed In │                │
│  │     User      │              │    (Guest)    │                │
│  └───────┬───────┘              └───────┬───────┘                │
│          │                              │                        │
│          ├─ Can Create Meeting          ├─ Cannot Create        │
│          ├─ Can Join as Host            ├─ Can Join as Guest    │
│          └─ Host Controls Enabled       └─ Limited Controls     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NextAuth/Auth0 Layer                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  • Validates user session                                        │
│  • Provides user information (name, email)                       │
│  • Returns 401 if not authenticated                              │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       API Endpoints                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  POST /api/meeting        ← Creates meeting (AUTH REQUIRED)      │
│  ├─ Check session         ← getServerSession()                   │
│  ├─ Extract host info     ← {name, email, userId, provider}      │
│  ├─ Create Chime meeting  ← AWS SDK                              │
│  └─ Store host data       ← meetingStorage                       │
│                                                                   │
│  POST /api/join-meeting   ← Joins meeting (ANYONE)               │
│  ├─ Check session         ← Optional authentication              │
│  ├─ Get stored meeting    ← meetingStorage                       │
│  ├─ Determine user type   ← HOST | USER | GUEST                 │
│  └─ Create attendee       ← AWS SDK with proper ExternalUserId  │
│                                                                   │
│  GET /api/meetings        ← List meetings with host info         │
│  ├─ Check session         ← Optional authentication              │
│  ├─ Filter by user        ← Query parameter                      │
│  └─ Include isHost flag   ← For each meeting                    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Meeting Storage                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  meetings = {                                                     │
│    "meeting-id": {                                               │
│      meetingId: "meeting-id",                                    │
│      title: "Meeting Title",                                     │
│      createdAt: "2025-10-16T...",                                │
│      mediaRegion: "us-east-1",                                   │
│      host: {                                                     │
│        attendeeId: "att-123",                                    │
│        externalUserId: "HOST|user@email.com|timestamp|random",  │
│        name: "John Doe",                                         │
│        email: "user@email.com",                                  │
│        userId: "user@email.com",                                 │
│        provider: "auth0"                                         │
│      }                                                           │
│    }                                                             │
│  }                                                               │
│                                                                   │
│  Helper Functions:                                               │
│  • isUserHost(meetingId, email)                                  │
│  • getMeetingsByHost(email)                                      │
│  • updateMeetingHost(meetingId, data)                            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AWS Chime SDK                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Meeting Object                      Attendee Object             │
│  ├─ MeetingId                        ├─ AttendeeId               │
│  ├─ MediaRegion                      ├─ ExternalUserId           │
│  └─ MediaPlacement                   │   └─ Format:              │
│                                      │      HOST|email|ts|rand   │
│                                      │      USER|email|ts|rand   │
│                                      │      GUEST|name|ts|rand   │
│                                      └─ Capabilities             │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## ExternalUserId Format

```
┌────────────────────────────────────────────────────────────────┐
│  HOST | user@email.com | 1697472000000 | a8f3b2c9d             │
│   │           │              │                │                 │
│   │           │              │                └─ Random ID      │
│   │           │              └─────────────────── Timestamp     │
│   │           └────────────────────────────────── User ID       │
│   └────────────────────────────────────────────── User Type    │
└────────────────────────────────────────────────────────────────┘

User Types:
• HOST  - Meeting creator (authenticated)
• USER  - Authenticated participant (not host)
• GUEST - Unauthenticated participant
```

## Authentication Flow

### Creating a Meeting

```
User Action: Click "Create Meeting"
     │
     ▼
┌────────────────────┐
│ Check if signed in │  ──── NO ──→ Redirect to /auth/signin
└────────┬───────────┘
         │ YES
         ▼
┌──────────────────────────────┐
│ POST /api/meeting            │
│ body: { meetingTitle: "..." }│
└──────────┬───────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ getServerSession(authOptions)   │
└──────────┬──────────────────────┘
           │
           ▼
      Authenticated?
           │
    ┌──────┴──────┐
    NO            YES
    │              │
    ▼              ▼
┌────────┐   ┌──────────────────────────┐
│ 401    │   │ Extract host from session│
│ Error  │   │ • name                   │
└────────┘   │ • email                  │
             │ • userId                 │
             │ • provider               │
             └──────────┬───────────────┘
                        │
                        ▼
             ┌──────────────────────────┐
             │ Create Chime Meeting     │
             └──────────┬───────────────┘
                        │
                        ▼
             ┌──────────────────────────┐
             │ Create Host Attendee     │
             │ ExternalUserId:          │
             │ HOST|email|ts|rand       │
             └──────────┬───────────────┘
                        │
                        ▼
             ┌──────────────────────────┐
             │ Store in meetingStorage  │
             │ with full host info      │
             └──────────┬───────────────┘
                        │
                        ▼
             ┌──────────────────────────┐
             │ Return:                  │
             │ • Meeting                │
             │ • Attendee               │
             │ • isHost: true           │
             │ • hostInfo               │
             └──────────────────────────┘
```

### Joining a Meeting

```
User Action: Enter meeting ID and join
     │
     ▼
┌──────────────────────────────────┐
│ POST /api/join-meeting           │
│ body: {                          │
│   meetingId: "...",              │
│   attendeeName: "..."            │
│ }                                │
└──────────┬───────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ getServerSession(authOptions)   │  ← Optional (doesn't block)
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ getMeeting(meetingId)           │  ← Retrieve stored meeting data
└──────────┬──────────────────────┘
           │
           ▼
      Check user type
           │
    ┌──────┴──────────────────┐
    │                          │
    ▼                          ▼
Is host                   Not host
(email matches)           │
    │                     │
    ▼                     ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ HOST type   │     │ USER type    │     │ GUEST type  │
│ isHost=true │     │ (auth user)  │     │ (no auth)   │
└──────┬──────┘     └──────┬───────┘     └──────┬──────┘
       │                   │                     │
       └───────────────────┴─────────────────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ Create Chime Attendee│
                │ with proper          │
                │ ExternalUserId       │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ Return:              │
                │ • Meeting            │
                │ • Attendee           │
                │ • isHost             │
                │ • hostInfo           │
                │ • userType           │
                └──────────────────────┘
```

## User Type Comparison

```
┌─────────────────┬─────────────┬─────────────┬─────────────┐
│    Feature      │    HOST     │    USER     │   GUEST     │
├─────────────────┼─────────────┼─────────────┼─────────────┤
│ Authenticated   │     ✓       │     ✓       │     ✗       │
├─────────────────┼─────────────┼─────────────┼─────────────┤
│ Create Meeting  │     ✓       │     ✓       │     ✗       │
├─────────────────┼─────────────┼─────────────┼─────────────┤
│ Join Meeting    │     ✓       │     ✓       │     ✓       │
├─────────────────┼─────────────┼─────────────┼─────────────┤
│ Mute All        │     ✓       │     ✗       │     ✗       │
├─────────────────┼─────────────┼─────────────┼─────────────┤
│ End Meeting     │     ✓       │     ✗       │     ✗       │
├─────────────────┼─────────────┼─────────────┼─────────────┤
│ Remove User     │     ✓       │     ✗       │     ✗       │
├─────────────────┼─────────────┼─────────────┼─────────────┤
│ Badge Icon      │     👑      │     ✓       │     👤      │
├─────────────────┼─────────────┼─────────────┼─────────────┤
│ Badge Label     │   "Host"    │  "Member"   │   "Guest"   │
├─────────────────┼─────────────┼─────────────┼─────────────┤
│ Badge Color     │    Blue     │   Green     │    Gray     │
└─────────────────┴─────────────┴─────────────┴─────────────┘
```

## Code Integration Points

### Frontend (React/Next.js)

```javascript
// Check authentication status
import { useSession } from "next-auth/react";
const { data: session } = useSession();

// Create meeting (authenticated only)
if (!session?.user) {
  redirect to signin
}

// Use custom hook for meeting auth
import { useMeetingAuth } from "./components/MeetingAuthExample";
const { isHost, hostInfo, isAuthenticated } = useMeetingAuth(meetingId);

// Show host controls conditionally
{isHost && (
  <HostControls />
)}

// Use utility functions
import { getUserBadge, canPerformHostActions } from "@/app/lib/chimeAuthUtils";

const badge = getUserBadge(attendee.ExternalUserId);
const canPerform = canPerformHostActions(session, meetingData, externalUserId);
```

### Backend (API Routes)

```javascript
// Enforce authentication
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";

const session = await getServerSession(authOptions);
if (!session?.user) {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// Extract host info
const hostInfo = {
  name: session.user.name || session.user.email,
  email: session.user.email,
  userId: session.user.email,
  provider: session.provider || "auth0"
};

// Create structured ExternalUserId
const uniqueUserId = `HOST|${hostInfo.userId}|${Date.now()}|${Math.random().toString(36).substr(2, 9)}`;

// Store meeting with host info
addMeeting(meetingId, {
  meetingId,
  title,
  createdAt: new Date().toISOString(),
  mediaRegion,
  host: {
    attendeeId,
    externalUserId: uniqueUserId,
    ...hostInfo
  }
});
```

## Benefits Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     Before Integration                       │
├─────────────────────────────────────────────────────────────┤
│ • Anyone could create meetings                              │
│ • Host info was just an attendee ID                         │
│ • No user type distinction                                  │
│ • Limited accountability                                    │
│ • Difficult to implement host-only features                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    After Integration
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      After Integration                       │
├─────────────────────────────────────────────────────────────┤
│ ✅ Only authenticated users can create meetings             │
│ ✅ Full host information tracked (name, email, provider)    │
│ ✅ Three distinct user types (HOST/USER/GUEST)              │
│ ✅ Complete accountability with email tracking              │
│ ✅ Easy to implement host-only features                     │
│ ✅ Host can leave and rejoin while maintaining status       │
│ ✅ Utility functions for working with users                 │
│ ✅ API responses include proper authentication data         │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
live-meeting-app/
│
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/
│   │   │   └── route.js                    (Auth configuration)
│   │   ├── meeting/
│   │   │   └── route.js                    ✨ MODIFIED
│   │   ├── join-meeting/
│   │   │   └── route.js                    ✨ MODIFIED
│   │   └── meetings/
│   │       └── route.js                    ✨ MODIFIED
│   │
│   ├── components/
│   │   └── MeetingAuthExample.jsx          ⭐ NEW - Example usage
│   │
│   ├── lib/
│   │   ├── meetingStorage.js               ✨ ENHANCED
│   │   └── chimeAuthUtils.js               ⭐ NEW - Utility functions
│   │
│   └── page.js                             ✨ MODIFIED
│
├── AUTHENTICATION_INTEGRATION.md           ⭐ NEW - Full docs
├── CHANGES_SUMMARY.md                      ⭐ NEW - Change log
├── QUICK_START.md                          ⭐ NEW - Getting started
├── IMPLEMENTATION_CHECKLIST.md             ⭐ NEW - Task checklist
└── VISUAL_OVERVIEW.md                      ⭐ NEW - This file

Legend:
✨ MODIFIED - File was updated
⭐ NEW - File was created
```

---

**Summary**: Your AWS Chime integration now properly enforces authentication for meeting creation and maintains comprehensive host information throughout the meeting lifecycle. All user types (HOST/USER/GUEST) are tracked and can be used to implement role-based features.
