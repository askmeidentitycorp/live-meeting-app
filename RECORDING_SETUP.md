# Quick Setup Guide - Meeting Recording

## Prerequisites
- AWS account with Chime SDK access
- S3 bucket for storing recordings
- Meeting app with authentication already set up

## Step-by-Step Setup

### 1. Install Required Package

```bash
npm install @aws-sdk/client-chime-sdk-media-pipelines
```

### 2. Configure Environment Variables

Add to your `.env.local`:

```bash
# AWS Account and Region
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012  # Your AWS account ID
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key

# S3 Bucket for Recordings
AWS_S3_RECORDING_BUCKET=your-recording-bucket-name
```

**To find your AWS Account ID:**
```bash
aws sts get-caller-identity --query Account --output text
```

### 3. Create S3 Bucket

```bash
# Create bucket
aws s3 mb s3://your-recording-bucket-name --region us-east-1

# Enable versioning (recommended)
aws s3api put-bucket-versioning \
  --bucket your-recording-bucket-name \
  --versioning-configuration Status=Enabled

# Enable encryption (recommended)
aws s3api put-bucket-encryption \
  --bucket your-recording-bucket-name \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'
```

### 4. Set S3 Bucket Policy

Create a file `bucket-policy.json`:

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

Apply the policy:

```bash
aws s3api put-bucket-policy \
  --bucket your-recording-bucket-name \
  --policy file://bucket-policy.json
```

### 5. Configure IAM Permissions

Your AWS credentials need these permissions. Create `recording-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ChimeMediaPipelines",
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
      "Sid": "S3Access",
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

Attach to your IAM user or role:

```bash
# Create policy
aws iam create-policy \
  --policy-name ChimeRecordingPolicy \
  --policy-document file://recording-policy.json

# Attach to user (replace YOUR_USERNAME)
aws iam attach-user-policy \
  --user-name YOUR_USERNAME \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/ChimeRecordingPolicy
```

### 6. Restart Development Server

```bash
npm run dev
```

### 7. Test the Feature

1. Sign in to your app
2. Create a new meeting (you become the host)
3. Look for the "Record" button in the top-right of the meeting header
4. Click "Record" to start
5. You should see:
   - Button changes to "Stop" with red background
   - "REC" indicator appears with pulsing red dot
   - Elapsed time counter starts
6. Click "Stop" to end recording
7. Check your S3 bucket for files at:
   ```
   s3://your-bucket/recordings/{meeting-id}/{timestamp}/
   ```

## Verification Checklist

- [ ] Package installed: `@aws-sdk/client-chime-sdk-media-pipelines`
- [ ] Environment variables set in `.env.local`
- [ ] S3 bucket created
- [ ] S3 bucket policy configured
- [ ] IAM permissions attached
- [ ] Development server restarted
- [ ] Can sign in and create meeting
- [ ] "Record" button visible to host
- [ ] Recording starts successfully
- [ ] Recording stops successfully
- [ ] Files appear in S3 bucket

## Quick Test Commands

### Check Environment Variables
```bash
# In your project directory
grep -E "AWS_.*|RECORDING" .env.local
```

### Verify S3 Bucket Exists
```bash
aws s3 ls s3://your-recording-bucket-name/
```

### List Recordings
```bash
aws s3 ls s3://your-recording-bucket-name/recordings/ --recursive
```

### Download Recording
```bash
aws s3 cp s3://your-recording-bucket-name/recordings/{meeting-id}/{timestamp}/ ./recordings/ --recursive
```

## Troubleshooting

### Recording Button Not Showing
- Verify you're signed in
- Ensure you created the meeting (not just joined)
- Check browser console for errors

### "S3 bucket not configured" Error
```bash
# Check if variable is set
echo $AWS_S3_RECORDING_BUCKET

# If not, add to .env.local and restart server
```

### "Failed to start recording" Error
1. Check AWS credentials:
   ```bash
   aws sts get-caller-identity
   ```
2. Verify IAM permissions
3. Check CloudWatch Logs for detailed errors

### No Files in S3 After Recording
- Recordings take a few minutes to process
- Wait 2-5 minutes after stopping
- Check bucket policy allows Chime to write
- Verify correct AWS Account ID in bucket policy

## AWS Costs Estimate

For a typical meeting:
- **30-minute meeting** with **3 participants**
- Media Pipelines: ~$2.70
- S3 Storage (1GB): ~$0.023/month
- **Total**: ~$2.72 per recording

**Monthly estimate** (10 meetings):
- Recordings: ~$27.00
- S3 Storage (10GB): ~$0.23
- **Total**: ~$27.23/month

## Next Steps

After basic setup:

1. **Set up CORS** for in-app playback (optional)
2. **Configure S3 lifecycle rules** to archive old recordings
3. **Set up CloudWatch alerts** for failed recordings
4. **Create recording list UI** to browse past recordings
5. **Add email notifications** when recordings are ready

## Files Created

- ✅ `/app/api/recording/start/route.js` - Start recording endpoint
- ✅ `/app/api/recording/stop/route.js` - Stop recording endpoint
- ✅ `/app/api/recording/status/route.js` - Status check endpoint
- ✅ `/app/components/RecordingControls.jsx` - UI component
- ✅ `/app/components/MeetingHeader.jsx` - Updated with recording controls
- ✅ `/app/components/MeetingRoom.jsx` - Updated to pass props
- ✅ `/app/lib/meetingStorage.js` - Updated with recording support

## Support

For issues:
1. Check `/RECORDING_FEATURE.md` for detailed documentation
2. Review AWS CloudWatch logs
3. Verify all environment variables
4. Check IAM permissions
5. Test AWS credentials: `aws sts get-caller-identity`

---

**Status**: ✅ Setup Complete  
**Ready to Record**: After following all steps above
