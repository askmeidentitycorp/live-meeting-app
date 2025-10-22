# AWS MediaConvert Setup Guide

## Overview
This guide explains how to set up AWS MediaConvert to automatically process and combine video recording clips from Amazon Chime meetings into a single downloadable MP4 file.

## Architecture
1. **Recording Start**: Chime SDK creates a media pipeline that records to S3 in 5-second segments
2. **Recording Stop**: When host stops recording, the app automatically triggers MediaConvert
3. **Processing**: MediaConvert concatenates all clips into a single MP4 file
4. **Download**: Host can download the final processed video via presigned S3 URL

## Prerequisites
- AWS Account with access to:
  - Amazon Chime SDK
  - AWS MediaConvert
  - Amazon S3
  - AWS IAM
- S3 bucket: `chime-recordings-live-meeting-app-20251017`
- MongoDB database for meeting metadata

## Step 1: Create MediaConvert IAM Role

The MediaConvert service needs an IAM role with permissions to read input clips from S3 and write the final video back to S3.

### Create Trust Policy
Create a file `mediaconvert-trust-policy.json`:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "mediaconvert.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

### Create S3 Permissions Policy
Create a file `mediaconvert-s3-permissions.json`:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::chime-recordings-live-meeting-app-20251017",
        "arn:aws:s3:::chime-recordings-live-meeting-app-20251017/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::chime-recordings-live-meeting-app-20251017/*"
      ]
    }
  ]
}
```

### Create the Role (Admin Command)
```bash
# Create the role
aws iam create-role \
  --role-name MediaConvertChimeRecordingsRole \
  --assume-role-policy-document file://mediaconvert-trust-policy.json

# Attach the S3 permissions
aws iam put-role-policy \
  --role-name MediaConvertChimeRecordingsRole \
  --policy-name MediaConvertS3Access \
  --policy-document file://mediaconvert-s3-permissions.json

# Get the role ARN (save this for .env)
aws iam get-role --role-name MediaConvertChimeRecordingsRole --query 'Role.Arn' --output text
```

The ARN will look like:
```
arn:aws:iam::368289336576:role/MediaConvertChimeRecordingsRole
```

## Step 2: Update Environment Variables

Add the MediaConvert role ARN to your `.env` file:
```env
AWS_MEDIACONVERT_ENDPOINT=https://mediaconvert.us-east-1.amazonaws.com
AWS_MEDIACONVERT_ROLE=arn:aws:iam::368289336576:role/MediaConvertChimeRecordingsRole
```

## Step 3: S3 Bucket Structure

### Input (Recording Clips)
```
recordings/{meetingId}/{timestamp}/composited-video/
  ├── 0000000000000.mp4
  ├── 0000000005000.mp4
  ├── 0000000010000.mp4
  └── ...
```

### Output (Final Video)
```
recordings/{meetingId}/{timestamp}/final-video/
  └── recording.mp4
```

## Step 4: Test the Flow

1. **Start a Meeting**: Join a meeting as the host
2. **Start Recording**: Click "Start Recording" button
3. **Generate Content**: Talk, share video, present screen (5+ seconds)
4. **Stop Recording**: Click "Stop Recording" button
5. **Monitor Processing**: Watch the UI for processing status updates
6. **Download**: Once complete, click "Download Recording" button

## API Endpoints

### Start Recording
```
POST /api/recording/start
Body: { "meetingId": "string" }
```

### Stop Recording (Auto-triggers MediaConvert)
```
POST /api/recording/stop
Body: { "meetingId": "string" }
```

### Check Processing Status
```
GET /api/recording/process?meetingId={meetingId}
Response: { "status": "SUBMITTED|PROGRESSING|COMPLETE|ERROR", "progress": 0-100 }
```

### Download Final Video
```
GET /api/recording/download?meetingId={meetingId}
Response: { "downloadUrl": "presigned-s3-url", "expiresIn": 3600 }
```

## MediaConvert Job Configuration

The job is configured to:
- **Input**: All MP4 clips from `composited-video/` folder (sorted alphabetically)
- **Output**: Single MP4 file at 1280x720, H.264 video, AAC audio
- **Video Settings**: 5 Mbps max bitrate, QVBR rate control, single-pass HQ quality
- **Audio Settings**: 128 kbps, stereo, 48 kHz
- **Container**: MP4 with progressive download support

## Monitoring & Troubleshooting

### Check MediaConvert Job Status
```bash
aws mediaconvert describe-job \
  --endpoint-url https://mediaconvert.us-east-1.amazonaws.com \
  --id {jobId}
```

### View Job History
```bash
aws mediaconvert list-jobs \
  --endpoint-url https://mediaconvert.us-east-1.amazonaws.com \
  --max-results 10 \
  --status COMPLETE
```

### Common Issues

**Issue**: "Role ARN is invalid"
- **Solution**: Verify the role exists and trust policy allows MediaConvert service

**Issue**: "Access Denied" when reading input files
- **Solution**: Check S3 permissions in the role policy include GetObject and ListBucket

**Issue**: "Access Denied" when writing output
- **Solution**: Check S3 permissions include PutObject on the output prefix

**Issue**: No clips found to process
- **Solution**: Wait at least 5 seconds after starting recording before stopping

**Issue**: Processing stuck at 0%
- **Solution**: Check CloudWatch logs for MediaConvert job errors

## Cost Estimation

MediaConvert pricing (us-east-1):
- **Professional Tier**: $0.0075 per minute (720p output)
- **Example**: 10-minute recording = ~$0.075

S3 storage costs:
- **Input clips**: Deleted after processing (temporary)
- **Final video**: Standard S3 pricing (~$0.023/GB/month)

## Security Considerations

1. **IAM Role**: Limited to specific S3 bucket only
2. **Presigned URLs**: 1-hour expiration for downloads
3. **Host-only Access**: Only meeting host can start/stop/download recordings
4. **Authentication**: All endpoints require NextAuth session

## Next Steps

1. ✅ MediaConvert endpoint configured
2. ⏳ Create MediaConvert IAM role (admin action)
3. ⏳ Update `.env` with role ARN
4. ⏳ Test complete recording flow
5. ⏳ Monitor first production recording
6. ⏳ Set up CloudWatch alarms for failed jobs
7. ⏳ Implement recording retention policy (auto-delete old recordings)

## Support

For issues or questions:
- Check CloudWatch Logs: `/aws/mediaconvert/jobs`
- Review MongoDB meeting documents for recording metadata
- Inspect S3 bucket for input/output files
- Test with short recordings (10-15 seconds) first
