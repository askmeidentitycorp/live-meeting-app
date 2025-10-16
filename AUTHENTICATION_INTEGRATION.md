# AWS Chime Authentication Integration

## Overview
This document explains how authentication is integrated with AWS Chime SDK to ensure only authenticated users can create meetings and maintain proper host information throughout the meeting lifecycle.

## Key Features

### 1. **Authenticated Meeting Creation**
- Only authenticated users (via Auth0/NextAuth) can create meetings
- API endpoint `/api/meeting` enforces authentication using `getServerSession`
- Returns 401 Unauthorized if user is not authenticated

### 2. **Host Information Management**
When a meeting is created, the following host information is stored:
```javascript
{
  attendeeId: "chime-attendee-id",
  externalUserId: "HOST|user@email.com|timestamp|random",
  name: "User Name",
  email: "user@email.com",
  userId: "user@email.com",
  provider: "auth0"
}
```

### 3. **ExternalUserId Format**
The system uses a structured format for `ExternalUserId` to identify user types:

- **Host (creator)**: `HOST|{email}|{timestamp}|{random}`
- **Authenticated user**: `USER|{email}|{timestamp}|{random}`
- **Guest**: `GUEST|{name}|{timestamp}|{random}`

This format allows:
- Easy identification of user roles
- Prevention of duplicate connections
- Tracking of authentication status

## API Endpoints

### POST `/api/meeting`
**Purpose**: Create a new meeting (authenticated users only)

**Authentication**: Required (401 if not authenticated)

**Request Body**:
```json
{
  "meetingTitle": "Meeting Name"
}
```

**Response**:
```json
{
  "Meeting": { /* AWS Chime Meeting object */ },
  "Attendee": { /* AWS Chime Attendee object */ },
  "isHost": true,
  "hostInfo": {
    "name": "Host Name",
    "email": "host@email.com",
    "userId": "host@email.com"
  }
}
```

### POST `/api/join-meeting`
**Purpose**: Join an existing meeting

**Authentication**: Optional (guests can join)

**Request Body**:
```json
{
  "meetingId": "meeting-id",
  "attendeeName": "Display Name"
}
```

**Response**:
```json
{
  "Meeting": { /* AWS Chime Meeting object */ },
  "Attendee": { /* AWS Chime Attendee object */ },
  "isHost": false,
  "hostInfo": {
    "name": "Host Name",
    "email": "host@email.com",
    "userId": "host@email.com"
  },
  "userType": "guest|authenticated|host"
}
```

**Logic**:
- Checks if joining user's email matches the host's email
- If yes, marks as host rejoining (`isHost: true`)
- If authenticated but not host, marks as authenticated user
- If not authenticated, marks as guest

### GET `/api/meetings`
**Purpose**: Get all active meetings with host information

**Query Parameters**:
- `meetingId`: Get specific meeting details
- `filterByUser=true`: Filter to show only meetings created by current user

**Response**:
```json
{
  "meetings": [
    {
      "meetingId": "meeting-id",
      "title": "Meeting Title",
      "createdAt": "ISO-8601 timestamp",
      "mediaRegion": "us-east-1",
      "host": {
        "attendeeId": "attendee-id",
        "externalUserId": "HOST|email|timestamp|random",
        "name": "Host Name",
        "email": "host@email.com",
        "userId": "host@email.com",
        "provider": "auth0"
      },
      "isHost": true
    }
  ],
  "count": 1,
  "userEmail": "current-user@email.com"
}
```

## Meeting Storage Helper Functions

The `meetingStorage.js` library provides helper functions:

```javascript
// Add a meeting with host info
addMeeting(meetingId, meetingData);

// Get a specific meeting
getMeeting(meetingId);

// Get all meetings
getAllMeetings();

// Check if a user is the host
isUserHost(meetingId, userEmail);

// Get all meetings created by a specific host
getMeetingsByHost(hostEmail);

// Update host information
updateMeetingHost(meetingId, hostData);

// Remove a meeting
removeMeeting(meetingId);
```

## Frontend Integration

### Creating a Meeting (app/page.js)
```javascript
// Only authenticated users can click "Create Meeting"
if (!session?.user) {
  window.location.assign('/auth/signin');
  return;
}

// Create meeting - authentication handled by API
const res = await fetch("/api/meeting", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    meetingTitle: "Meeting"
  })
});

// Host info is automatically included in response
const json = await res.json();
window.location.href = `/meeting/${json.Meeting.MeetingId}?name=${json.hostInfo.name}`;
```

### Joining a Meeting
```javascript
// Anyone can join (guests or authenticated users)
const res = await fetch("/api/join-meeting", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ 
    meetingId: id, 
    attendeeName: name || "Guest" 
  })
});

const json = await res.json();
// json.isHost indicates if this user is the meeting creator
// json.hostInfo contains information about the meeting host
// json.userType indicates: "host", "authenticated", or "guest"
```

## Benefits

1. **Security**: Only authenticated users can create meetings
2. **Accountability**: Every meeting has a tracked creator with email
3. **Host Privileges**: Easy to implement host-only features (mute all, end meeting, etc.)
4. **User Tracking**: Different user types are identifiable via ExternalUserId
5. **Persistent Identity**: Host can leave and rejoin while maintaining host status
6. **Multi-session Support**: Users can join from multiple devices (unique IDs prevent conflicts)

## Environment Variables

Required for authentication integration:

```env
# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key
AUTH0_SECRET=your-auth0-secret

# Auth0
NEXT_PUBLIC_AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_ISSUER=https://your-domain.auth0.com

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

## Future Enhancements

1. **Database Persistence**: Replace in-memory storage with database (DynamoDB, PostgreSQL, etc.)
2. **Host Transfer**: Allow transferring host privileges to another participant
3. **Co-hosts**: Support multiple hosts with elevated privileges
4. **Meeting Recordings**: Link recordings to authenticated host account
5. **Analytics**: Track meeting creation and participation by authenticated users
6. **Scheduled Meetings**: Allow hosts to schedule meetings in advance
7. **Meeting History**: Show users their past meetings and participants

## Migration Notes

If you have existing meetings, you may need to:
1. Add host information to existing meeting records
2. Update ExternalUserId format for consistency
3. Implement backward compatibility for old meeting IDs

## Troubleshooting

**Issue**: "Unauthorized" error when creating meeting
- **Solution**: Ensure user is logged in via Auth0/NextAuth
- Check that `getServerSession` is properly configured
- Verify environment variables are set

**Issue**: Host status not recognized when rejoining
- **Solution**: Ensure email matching is working correctly
- Check that meeting is still in storage
- Verify ExternalUserId format is correct

**Issue**: Multiple host connections conflict
- **Solution**: The timestamp+random suffix in ExternalUserId prevents this
- Each connection gets a unique ID while maintaining HOST prefix
