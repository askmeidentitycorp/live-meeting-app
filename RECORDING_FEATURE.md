# Meeting Recording Feature Documentation

## Overview

The meeting recording feature allows the host to record meetings using AWS Chime SDK's Media Capture Pipeline. Recordings are automatically stored in Amazon S3 with separate audio, video, and content share streams.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Host Controls                            │
│              (Recording button in MeetingHeader)                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Endpoints                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  POST /api/recording/start                                       │
│  ├─ Verify user is authenticated                                 │
│  ├─ Verify user is the meeting host                              │
│  ├─ Create Media Capture Pipeline                                │
│  └─ Store recording info in meeting data                         │
│                                                                   │
│  POST /api/recording/stop                                        │
│  ├─ Verify user is authenticated                                 │
│  ├─ Verify user is the meeting host                              │
│  ├─ Delete Media Capture Pipeline                                │
│  └─ Update recording info with stop time                         │
│                                                                   │
│  GET /api/recording/status                                       │
│  ├─ Check authentication                                         │
│  ├─ Return current recording status                              │
│  └─ Return host information                                      │
│                                                                   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              AWS Chime Media Capture Pipeline                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Captures:                                                       │
│  • Audio (separate stream)                                       │
│  • Video (separate stream per participant)                       │
│  • Content/Screen Share (separate stream)                        │
│  • Composited Video (grid view of all participants)              │
│                                                                   │
│  Configuration:                                                  │
│  • Layout: GridView                                              │
│  • Resolution: HD (1280x720)                                     │
│  • Content Layout: PresenterOnly                                 │
│  • Presenter Position: TopRight                                  │
│                                                                   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Amazon S3 Storage                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  S3 Structure:                                                   │
│  recordings/                                                     │
│    └── {meetingId}/                                              │
│        └── {timestamp}/                                          │
│            ├── audio/                                            │
│            │   └── *.wav                                         │
│            ├── video/                                            │
│            │   └── {attendeeId}.mp4                              │
│            ├── content/                                          │
│            │   └── content-share.mp4                             │
│            └── composited/                                       │
│                └── composited-video.mp4                          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### 1. Host-Only Access
- Only the authenticated user who created the meeting can start/stop recording
- Recording button only visible to the host
- API endpoints enforce host verification

### 2. Visual Indicators
- Recording status indicator (REC badge with pulsing red dot)
- Live elapsed time counter
- Start/Stop button with loading states

### 3. Recording Configuration
- **Audio**: Separate audio-only stream (WAV format)
- **Video**: Individual video streams per participant (MP4)
- **Content Share**: Screen sharing content (MP4)
- **Composited Video**: Combined grid view of all participants (MP4)
- **Resolution**: HD (1280x720)
- **Layout**: Grid view with presenter in top-right when screen sharing

### 4. S3 Storage
- Organized by meeting ID and timestamp
- Separate folders for different media types
- Easy retrieval and playback

## API Endpoints

### POST `/api/recording/start`

**Purpose**: Start recording the meeting

**Authentication**: Required (must be meeting host)

**Request Body**:
```json
{
  "meetingId": "meeting-id-here"
}
```

**Response** (Success):
```json
{
  "success": true,
  "recording": {
    "pipelineId": "pipeline-id",
    "startedAt": "2025-10-16T10:30:00.000Z",
    "status": "Initializing"
  }
}
```

**Response** (Error):
```json
{
  "error": "Only the meeting host can start recording"
}
```

**Status Codes**:
- `200`: Recording started successfully
- `400`: Invalid request (missing meetingId, recording already in progress)
- `401`: Not authenticated
- `403`: Not the meeting host
- `404`: Meeting not found
- `500`: Server error

---

### POST `/api/recording/stop`

**Purpose**: Stop the current recording

**Authentication**: Required (must be meeting host)

**Request Body**:
```json
{
  "meetingId": "meeting-id-here"
}
```

**Response** (Success):
```json
{
  "success": true,
  "recording": {
    "pipelineId": "pipeline-id",
    "startedAt": "2025-10-16T10:30:00.000Z",
    "stoppedAt": "2025-10-16T11:00:00.000Z",
    "s3Bucket": "your-recording-bucket",
    "s3Prefix": "recordings/meeting-id/2025-10-16T10-30-00",
    "status": "Stopped"
  }
}
```

**Status Codes**:
- `200`: Recording stopped successfully
- `400`: No recording in progress
- `401`: Not authenticated
- `403`: Not the meeting host
- `404`: Meeting not found
- `500`: Server error

---

### GET `/api/recording/status?meetingId={id}`

**Purpose**: Check recording status for a meeting

**Authentication**: Required

**Query Parameters**:
- `meetingId` (required): The meeting ID

**Response**:
```json
{
  "isRecording": true,
  "isHost": true,
  "recording": {
    "pipelineId": "pipeline-id",
    "startedAt": "2025-10-16T10:30:00.000Z",
    "status": "InProgress",
    "s3Bucket": "your-recording-bucket",
    "s3Prefix": "recordings/meeting-id/2025-10-16T10-30-00"
  }
}
```

## Components

### RecordingControls Component

**Location**: `/app/components/RecordingControls.jsx`

**Props**:
- `meetingId` (string): The current meeting ID
- `isHost` (boolean): Whether the current user is the host

**Features**:
- Start/Stop recording button
- Recording indicator (REC badge)
- Elapsed time counter
- Loading states
- Error handling with auto-dismiss

**Usage**:
```jsx
import { RecordingControls } from './RecordingControls';

<RecordingControls 
  meetingId={meetingId} 
  isHost={isHost} 
/>
```

## Environment Variables

### Required Configuration

Add these to your `.env.local` file:

```bash
# AWS Chime and S3
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# S3 Bucket for Recordings
AWS_S3_RECORDING_BUCKET=your-recording-bucket-name

# NextAuth (already configured)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret
AUTH0_SECRET=your-auth0-secret

# Auth0 (already configured)
NEXT_PUBLIC_AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_AUTH0_DOMAIN=your-domain.auth0.com
```

## AWS Setup

### 1. Create S3 Bucket

```bash
aws s3 mb s3://your-recording-bucket-name --region us-east-1
```

### 2. Configure Bucket Policy

The bucket needs to allow AWS Chime to write recordings:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ChimeMediaPipelineWrite",
      "Effect": "Allow",
      "Principal": {
        "Service": "mediapipelines.chime.amazonaws.com"
      },
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl"
      ],
      "Resource": "arn:aws:s3:::your-recording-bucket-name/*",
      "Condition": {
        "StringEquals": {
          "aws:SourceAccount": "YOUR_AWS_ACCOUNT_ID"
        }
      }
    }
  ]
}
```

### 3. IAM Permissions

Your AWS credentials need these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "chime:CreateMediaCapturePipeline",
        "chime:DeleteMediaCapturePipeline",
        "chime:GetMediaCapturePipeline",
        "chime:ListMediaCapturePipelines"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-recording-bucket-name",
        "arn:aws:s3:::your-recording-bucket-name/*"
      ]
    }
  ]
}
```

### 4. Enable CORS on S3 (Optional, for playback)

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["http://localhost:3000", "https://your-domain.com"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## Installation

### 1. Install Dependencies

```bash
npm install @aws-sdk/client-chime-sdk-media-pipelines
```

Or if you prefer yarn:

```bash
yarn add @aws-sdk/client-chime-sdk-media-pipelines
```

### 2. Set Environment Variables

Copy the required environment variables to your `.env.local` file.

### 3. Test the Feature

1. Sign in as an authenticated user
2. Create a meeting (you become the host)
3. Look for the "Record" button in the meeting header
4. Click to start recording
5. The REC indicator should appear with elapsed time
6. Click "Stop" to end recording
7. Check your S3 bucket for the recorded files

## Recording Structure

When a recording is created, files are organized as:

```
s3://your-bucket/recordings/
  └── {meeting-id}/
      └── {timestamp}/
          ├── audio/
          │   └── {attendee-id}.wav
          ├── video/
          │   ├── {attendee-id-1}.mp4
          │   ├── {attendee-id-2}.mp4
          │   └── {attendee-id-3}.mp4
          ├── content/
          │   └── content-share.mp4 (if screen was shared)
          └── composited/
              └── composited-video.mp4 (grid view)
```

### File Types

- **Audio Files**: Individual WAV files for each participant
- **Video Files**: Individual MP4 files for each participant's video stream
- **Content Share**: MP4 file containing screen share content
- **Composited Video**: Single MP4 file with all participants in grid view

## Usage Flow

### Starting a Recording

1. Host clicks "Record" button
2. System verifies:
   - User is authenticated
   - User is the meeting host
   - No recording is currently in progress
   - S3 bucket is configured
3. Creates Media Capture Pipeline
4. Updates meeting data with recording info
5. Shows "REC" indicator to all participants
6. Starts elapsed time counter

### Stopping a Recording

1. Host clicks "Stop" button
2. System verifies user is the host
3. Deletes (stops) the Media Capture Pipeline
4. Updates meeting data with stop time
5. Removes "REC" indicator
6. Recording files are finalized in S3

## Accessing Recordings

### Via AWS Console

1. Go to S3 Console
2. Navigate to your recording bucket
3. Browse to `recordings/{meetingId}/{timestamp}/`
4. Download files as needed

### Programmatically

You can create an API endpoint to list/retrieve recordings:

```javascript
// Example: GET /api/recordings?meetingId={id}
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const s3Client = new S3Client({ region: process.env.AWS_REGION });

const command = new ListObjectsV2Command({
  Bucket: process.env.AWS_S3_RECORDING_BUCKET,
  Prefix: `recordings/${meetingId}/`
});

const response = await s3Client.send(command);
// response.Contents contains all recording files
```

## Troubleshooting

### Issue: "S3 bucket not configured for recordings"

**Solution**: 
- Set `AWS_S3_RECORDING_BUCKET` in `.env.local`
- Restart your development server

### Issue: "Only the meeting host can start recording"

**Solution**:
- Ensure you're the user who created the meeting
- Check that authentication is working
- Verify `meetingData.host.email` matches your session email

### Issue: Recording button not visible

**Solution**:
- Check that `isHost` prop is true
- Verify you created the meeting (not just joined)
- Check browser console for errors

### Issue: Recording files not appearing in S3

**Solution**:
- Verify S3 bucket policy allows Chime to write
- Check AWS account ID in environment variables
- Ensure IAM permissions are correct
- Wait a few minutes - processing takes time

### Issue: "Failed to start recording" error

**Solution**:
- Check AWS credentials are valid
- Verify Chime Media Pipelines is enabled in your region
- Check CloudWatch logs for detailed error messages
- Ensure meeting is still active

## Cost Considerations

### AWS Chime Media Pipelines

- **Per minute charge**: ~$0.015 per minute per stream
- **Multiple streams**: Audio, video (per participant), content, composited
- **Example**: 30-minute meeting with 3 participants ≈ $2.70

### S3 Storage

- **Standard storage**: ~$0.023 per GB per month
- **Data transfer**: First 100 GB free per month
- **Example**: 1 GB recording ≈ $0.023/month

### Tips to Reduce Costs

1. Stop recording when not needed
2. Set S3 lifecycle policies to archive old recordings
3. Use S3 Intelligent-Tiering for automatic cost optimization
4. Delete recordings after a retention period

## Security Best Practices

1. **Host Verification**: Only hosts can start/stop recording (enforced)
2. **Authentication**: All recording actions require authentication
3. **S3 Bucket Security**: 
   - Enable encryption at rest
   - Use bucket policies to restrict access
   - Enable versioning for recovery
4. **Access Logs**: Enable S3 access logging for audit trail
5. **Presigned URLs**: Use presigned URLs for secure download access

## Future Enhancements

1. **Recording Consent**: Notify participants when recording starts
2. **Recording List UI**: Browse past recordings in-app
3. **Playback Feature**: Play recordings directly in the app
4. **Download Links**: Generate presigned URLs for downloads
5. **Transcription**: Integrate AWS Transcribe for captions
6. **Recording Permissions**: Allow co-hosts to record
7. **Recording Templates**: Different recording layouts/configurations
8. **Email Notifications**: Send recording links when processing complete

## API Testing

### Start Recording
```bash
curl -X POST http://localhost:3000/api/recording/start \
  -H "Content-Type: application/json" \
  -d '{"meetingId": "your-meeting-id"}'
```

### Stop Recording
```bash
curl -X POST http://localhost:3000/api/recording/stop \
  -H "Content-Type: application/json" \
  -d '{"meetingId": "your-meeting-id"}'
```

### Check Status
```bash
curl http://localhost:3000/api/recording/status?meetingId=your-meeting-id
```

## Summary

✅ **Host-only recording controls**  
✅ **AWS Chime Media Capture Pipeline integration**  
✅ **S3 storage with organized structure**  
✅ **Multiple stream types** (audio, video, content, composited)  
✅ **Authentication and authorization enforced**  
✅ **Real-time recording indicators**  
✅ **Elapsed time tracking**  
✅ **Error handling and user feedback**  

The recording feature is now fully integrated and ready for use!
