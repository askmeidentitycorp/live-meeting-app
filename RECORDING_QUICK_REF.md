# Recording Feature - Quick Reference Card

## 🎯 One-Line Summary
Host-only meeting recording with AWS Chime SDK → stored in S3 with composited video.

## 🚀 Quick Start (3 Steps)

```bash
# 1. Install
npm install @aws-sdk/client-chime-sdk-media-pipelines

# 2. Configure .env.local
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012
AWS_S3_RECORDING_BUCKET=your-bucket-name

# 3. Restart
npm run dev
```

## 📡 API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/recording/start` | POST | Host Only | Start recording |
| `/api/recording/stop` | POST | Host Only | Stop recording |
| `/api/recording/status` | GET | Required | Check status |

## 🎨 UI Components

```
MeetingHeader
  └─ RecordingControls (if isHost)
       ├─ Record Button
       ├─ REC Indicator
       └─ Timer
```

## 💾 S3 Structure

```
recordings/{meetingId}/{timestamp}/
  ├─ audio/{attendeeId}.wav
  ├─ video/{attendeeId}.mp4
  ├─ content/content-share.mp4
  └─ composited/composited-video.mp4
```

## 🔐 Security Checklist

- [x] Only host can record
- [x] Authentication required
- [x] Host email verified
- [x] S3 bucket policy set
- [x] IAM permissions configured

## 💰 Costs

| Item | Price |
|------|-------|
| Recording (per min) | $0.015 per stream |
| S3 Storage | $0.023 per GB/month |
| **30-min meeting** | **~$2.70** |

## 🐛 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Button not showing | Verify you're the host |
| S3 error | Set `AWS_S3_RECORDING_BUCKET` |
| 403 error | Only host can record |
| No files in S3 | Wait 2-5 minutes |

## 📋 AWS Setup Commands

```bash
# Create bucket
aws s3 mb s3://your-bucket --region us-east-1

# Set bucket policy
aws s3api put-bucket-policy --bucket your-bucket --policy file://policy.json

# Attach IAM policy
aws iam attach-user-policy --user-name USER --policy-arn arn:aws:iam::ACCOUNT:policy/ChimeRecording

# Test credentials
aws sts get-caller-identity
```

## 📄 Environment Variables

```bash
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012
AWS_ACCESS_KEY_ID=***
AWS_SECRET_ACCESS_KEY=***
AWS_S3_RECORDING_BUCKET=your-bucket
```

## 🧪 Test Flow

1. ✅ Sign in as authenticated user
2. ✅ Create meeting (become host)
3. ✅ Click "Record" button
4. ✅ Verify REC indicator + timer
5. ✅ Click "Stop"
6. ✅ Check S3 bucket (wait 2-5 min)

## 📚 Documentation

- `RECORDING_FEATURE.md` - Complete docs
- `RECORDING_SETUP.md` - Setup guide
- `RECORDING_SUMMARY.md` - Implementation details

## 🎬 Recording States

```
┌──────────────────────────────┐
│ State: Not Recording         │
│ Button: [📻 Record]          │
│ Indicator: None              │
└──────────────────────────────┘
            ↓ Click Record
┌──────────────────────────────┐
│ State: Recording             │
│ Button: [⬛ Stop]            │
│ Indicator: 🔴 REC 0:45       │
└──────────────────────────────┘
            ↓ Click Stop
┌──────────────────────────────┐
│ State: Processing            │
│ Files saved to S3 in 2-5 min │
└──────────────────────────────┘
```

## ⚡ Quick Commands

```bash
# List recordings
aws s3 ls s3://BUCKET/recordings/ --recursive

# Download recording
aws s3 cp s3://BUCKET/recordings/{id}/{ts}/ ./local/ --recursive

# Check pipeline status
aws chime get-media-capture-pipeline --media-pipeline-id ID

# Delete old recordings (30 days)
aws s3 rm s3://BUCKET/recordings/ --recursive \
  --exclude "*" \
  --include "*/2024-*/*" \
  --older-than 30d
```

## 🔑 Key Files

```
app/
├── api/
│   └── recording/
│       ├── start/route.js    ✅ Start endpoint
│       ├── stop/route.js     ✅ Stop endpoint
│       └── status/route.js   ✅ Status endpoint
├── components/
│   ├── RecordingControls.jsx ✅ UI component
│   ├── MeetingHeader.jsx     ✅ Updated
│   └── MeetingRoom.jsx       ✅ Updated
└── lib/
    └── meetingStorage.js     ✅ Updated
```

## 📊 Recording Contents

| Stream Type | Format | Description |
|-------------|--------|-------------|
| Audio | WAV | Per participant |
| Video | MP4 | Per participant |
| Content | MP4 | Screen share |
| Composited | MP4 | Grid view (HD) |

## 🎛️ Recording Configuration

```javascript
{
  Layout: "GridView",
  Resolution: "HD" (1280x720),
  ContentLayout: "PresenterOnly",
  PresenterPosition: "TopRight"
}
```

## 📞 Support

- Issues? Check `RECORDING_FEATURE.md` troubleshooting section
- AWS errors? Check CloudWatch logs
- Permissions? Verify IAM policy
- S3 access? Check bucket policy

---

**Quick Tip**: The recording button only appears for the meeting host (creator). Guests and regular participants won't see it.

**Remember**: Recordings take 2-5 minutes to process after stopping. Check S3 bucket after waiting.
