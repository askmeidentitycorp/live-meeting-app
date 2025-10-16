# Quick Start Guide - Authentication Integration

## What Changed?

Your AWS Chime video conferencing app now requires authentication to create meetings and maintains proper host information throughout the meeting lifecycle.

## Key Changes at a Glance

### ✅ Meeting Creation
- **Before:** Any user could create a meeting by passing `attendeeName`
- **After:** Only authenticated users can create meetings; host info automatically extracted from session

### ✅ Host Identification
- **Before:** Basic host tracking with `hostAttendeeId`
- **After:** Full host information (name, email, provider) stored and verified

### ✅ User Types
- **Before:** All users treated the same
- **After:** Three distinct user types:
  - 👑 **HOST**: Authenticated user who created the meeting
  - ✓ **USER**: Authenticated user joining the meeting
  - 👤 **GUEST**: Unauthenticated user joining the meeting

## How to Use

### 1. Creating a Meeting (Authenticated Users Only)

```javascript
// User must be signed in via Auth0/NextAuth
const { data: session } = useSession();

if (!session?.user) {
  // Redirect to signin
  window.location.href = '/auth/signin';
  return;
}

// Create meeting - host info handled automatically
const res = await fetch("/api/meeting", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    meetingTitle: "My Meeting"
  })
});

const data = await res.json();
// data.isHost === true
// data.hostInfo contains: { name, email, userId }
```

### 2. Joining a Meeting (Anyone Can Join)

```javascript
// Works for both authenticated users and guests
const res = await fetch("/api/join-meeting", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    meetingId: "meeting-id",
    attendeeName: "Display Name"
  })
});

const data = await res.json();
// data.isHost - true if this user created the meeting
// data.hostInfo - information about the meeting creator
// data.userType - "host" | "authenticated" | "guest"
```

### 3. Checking Host Status

```javascript
// Option 1: Using API
const res = await fetch(`/api/meetings?meetingId=${meetingId}`);
const data = await res.json();

if (data.isHost) {
  // Show host controls
}

// Option 2: Using utility function
import { isUserMeetingHost } from '@/app/lib/chimeAuthUtils';

const isHost = isUserMeetingHost(session, meetingData);
```

### 4. Implementing Host-Only Features

```javascript
import { canPerformHostActions } from '@/app/lib/chimeAuthUtils';

// Check if user can perform host actions
const canPerform = canPerformHostActions(
  session,
  meetingData,
  attendeeExternalUserId
);

if (canPerform) {
  // Show "Mute All", "End Meeting", etc.
}
```

### 5. Working with User Badges

```javascript
import { getUserBadge, parseExternalUserId } from '@/app/lib/chimeAuthUtils';

// Get user information
const userInfo = parseExternalUserId(attendee.ExternalUserId);
// userInfo.isHost, userInfo.isAuthenticated, userInfo.isGuest

// Get badge for display
const badge = getUserBadge(attendee.ExternalUserId);
// badge.label: "Host" | "Member" | "Guest"
// badge.icon: "👑" | "✓" | "👤"
// badge.color: "blue" | "green" | "gray"
```

## Common Use Cases

### Show Host Controls Only to Host

```javascript
"use client";
import { useSession } from "next-auth/react";
import { useMeetingAuth } from "./components/MeetingAuthExample";

export default function MeetingPage({ meetingId }) {
  const { isHost } = useMeetingAuth(meetingId);

  return (
    <div>
      {/* Always visible */}
      <MeetingVideo />
      
      {/* Host only */}
      {isHost && (
        <div className="host-controls">
          <button onClick={muteAll}>Mute All</button>
          <button onClick={endMeeting}>End Meeting</button>
        </div>
      )}
    </div>
  );
}
```

### Display User Type Badges

```javascript
import { getUserBadge } from '@/app/lib/chimeAuthUtils';

function ParticipantItem({ attendee }) {
  const badge = getUserBadge(attendee.ExternalUserId);
  
  return (
    <div className="flex items-center gap-2">
      <span>{badge.icon}</span>
      <span>{attendee.name}</span>
      <span className={`badge badge-${badge.color}`}>
        {badge.label}
      </span>
    </div>
  );
}
```

### Filter Meetings by Current User

```javascript
// Get only meetings created by current user
const res = await fetch('/api/meetings?filterByUser=true');
const data = await res.json();

// data.meetings contains only user's meetings
data.meetings.forEach(meeting => {
  console.log(`Meeting: ${meeting.title}`);
  console.log(`Created: ${meeting.createdAt}`);
  console.log(`Host: ${meeting.host.name}`);
});
```

### Show Meeting Host Information

```javascript
function MeetingHeader({ meetingId }) {
  const [meeting, setMeeting] = useState(null);

  useEffect(() => {
    fetch(`/api/meetings?meetingId=${meetingId}`)
      .then(res => res.json())
      .then(data => setMeeting(data.meeting));
  }, [meetingId]);

  if (!meeting) return null;

  return (
    <div className="meeting-header">
      <h2>{meeting.title}</h2>
      <p>Hosted by: {meeting.host.name}</p>
      <p>Email: {meeting.host.email}</p>
    </div>
  );
}
```

## Testing Your Integration

### Test 1: Unauthenticated User
1. Sign out
2. Try to create a meeting
3. Should redirect to `/auth/signin`

### Test 2: Authenticated User Creates Meeting
1. Sign in with Auth0
2. Click "Create Meeting"
3. Should create meeting successfully
4. Check response includes `isHost: true`

### Test 3: Host Rejoins Meeting
1. Create a meeting
2. Leave the meeting
3. Rejoin using the meeting link
4. Should still be marked as host (`isHost: true`)

### Test 4: Guest Joins Meeting
1. Get meeting link from host
2. Open in incognito/private window (not signed in)
3. Join as guest
4. Should see `userType: "guest"`

### Test 5: Authenticated User Joins
1. Sign in with different account
2. Join meeting created by someone else
3. Should see `userType: "authenticated"` and `isHost: false`

## API Response Examples

### Create Meeting Response
```json
{
  "Meeting": {
    "MeetingId": "abc123",
    "MediaRegion": "us-east-1"
  },
  "Attendee": {
    "AttendeeId": "att-123",
    "ExternalUserId": "HOST|user@email.com|1234567890|xyz"
  },
  "isHost": true,
  "hostInfo": {
    "name": "John Doe",
    "email": "user@email.com",
    "userId": "user@email.com"
  }
}
```

### Join Meeting Response
```json
{
  "Meeting": { /* ... */ },
  "Attendee": {
    "AttendeeId": "att-456",
    "ExternalUserId": "GUEST|Jane|1234567890|abc"
  },
  "isHost": false,
  "hostInfo": {
    "name": "John Doe",
    "email": "user@email.com",
    "userId": "user@email.com"
  },
  "userType": "guest"
}
```

## Troubleshooting

### "Unauthorized" Error When Creating Meeting
**Problem:** API returns 401 Unauthorized

**Solutions:**
- Ensure user is signed in: Check `useSession()` returns valid session
- Verify Auth0 configuration in `.env` file
- Check `NEXTAUTH_SECRET` is set
- Look for authentication errors in server logs

### Host Status Not Recognized
**Problem:** Host not identified when rejoining

**Solutions:**
- Verify email in session matches email stored in meeting
- Check that meeting still exists in storage
- Look for `ExternalUserId` format: should start with `HOST|`

### Cannot Perform Host Actions
**Problem:** Host controls not showing up

**Solutions:**
- Use `canPerformHostActions()` function to verify permissions
- Check that `meetingData` includes host information
- Verify `session.user.email` matches `meetingData.host.email`

## Files to Review

- **Main Documentation**: `/AUTHENTICATION_INTEGRATION.md`
- **Changes Summary**: `/CHANGES_SUMMARY.md`
- **Utility Functions**: `/app/lib/chimeAuthUtils.js`
- **Example Component**: `/app/components/MeetingAuthExample.jsx`

## Need Help?

1. Check the detailed documentation in `/AUTHENTICATION_INTEGRATION.md`
2. Review utility functions in `/app/lib/chimeAuthUtils.js`
3. See example implementation in `/app/components/MeetingAuthExample.jsx`
4. Verify environment variables are correctly set

## Next Steps

1. ✅ Test authentication flow end-to-end
2. 🎨 Update UI to show host badges/indicators
3. 🔐 Implement host-only features (mute all, end meeting)
4. 📊 Add meeting analytics and history
5. 💾 Consider database persistence for production

---

**Summary**: Only authenticated users can now create meetings, and the system properly tracks and maintains host information throughout the meeting lifecycle. Use the utility functions in `chimeAuthUtils.js` to work with user types and permissions.
