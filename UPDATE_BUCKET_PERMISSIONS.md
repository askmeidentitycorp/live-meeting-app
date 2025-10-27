# Update S3 Bucket Permissions for New Bucket

## Problem
MediaConvert jobs are starting but the final recordings are not being saved to S3. This is because:
1. The bucket policy allows Chime to write raw recordings ✅ (already updated)
2. The MediaConvert IAM role still has permissions for the OLD bucket ❌ (needs update)

## Solution

### Step 1: Update MediaConvert IAM Role Permissions

Go to AWS Console → IAM → Roles → `MediaConvertChimeRecordingsRole`

**Option A: Via AWS Console (Recommended)**

1. Click on the role `MediaConvertChimeRecordingsRole`
2. Under "Permissions policies", find the inline policy (likely named `MediaConvertS3Access` or similar)
3. Click "Edit"
4. Replace the JSON with the content from `mediaconvert-s3-permissions.json`:

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
        "arn:aws:s3:::chime-recordings-live-meeting-app",
        "arn:aws:s3:::chime-recordings-live-meeting-app/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::chime-recordings-live-meeting-app/*"
      ]
    }
  ]
}
```

5. Click "Save changes"

**Option B: Via AWS CLI**

```bash
aws iam put-role-policy \
  --role-name MediaConvertChimeRecordingsRole \
  --policy-name MediaConvertS3Access \
  --policy-document file://mediaconvert-s3-permissions.json
```

### Step 2: Verify Permissions

Test that MediaConvert can now write to the bucket:

```bash
# Check the role policy
aws iam get-role-policy \
  --role-name MediaConvertChimeRecordingsRole \
  --policy-name MediaConvertS3Access
```

### Step 3: Test Recording Flow

1. Start a meeting
2. Start recording
3. Stop recording
4. Check the notification for the MediaConvert job ID
5. Wait 2-5 minutes for processing
6. Check S3 bucket for the final video:

```bash
aws s3 ls s3://chime-recordings-live-meeting-app/ --recursive
```

Look for files in the `final-video/` folder like:
- `recordings/{meetingId}/{timestamp}/final-video/index.m3u8`
- `recordings/{meetingId}/{timestamp}/final-video/index_720p_00001.ts`
- etc.

## What Was Changed

### Files Updated:
1. ✅ `bucket-policy.json` - Updated to new bucket name
2. ✅ `mediaconvert-s3-permissions.json` - Updated to new bucket name
3. ✅ `.env` - CHIME_RECORDING_BUCKET updated to new bucket name

### AWS Resources Updated:
1. ✅ S3 bucket `chime-recordings-live-meeting-app` - Created
2. ✅ S3 bucket policy - Applied (allows Chime to write raw recordings)
3. ⏳ IAM role policy - Needs manual update in AWS Console

## Why This is Needed

**Chime writes raw recordings:**
- Chime service needs `s3:PutObject` on the bucket
- This is granted via the **bucket policy** ✅ Already done

**MediaConvert processes recordings:**
- MediaConvert needs `s3:GetObject` to read raw clips
- MediaConvert needs `s3:PutObject` to write final video
- This is granted via the **IAM role policy** ⏳ You need to do this

Without the IAM role update, MediaConvert can start jobs but cannot save the output!

## Troubleshooting

### If final videos still don't appear:

1. **Check MediaConvert job status in AWS Console:**
   - Go to MediaConvert → Jobs
   - Find your job by the Job ID shown in the notification
   - Check if it shows "ERROR" status
   - Click on the job to see error details

2. **Check CloudWatch logs:**
   - Go to CloudWatch → Log groups
   - Look for MediaConvert job logs
   - Check for permission errors

3. **Verify bucket name consistency:**
   - Ensure `.env` has: `CHIME_RECORDING_BUCKET=chime-recordings-live-meeting-app`
   - Ensure Amplify environment has the same value
   - Ensure all policy files reference the same bucket

## Summary

**Old bucket:** `chime-recordings-live-meeting-app-20251017`
**New bucket:** `chime-recordings-live-meeting-app`

All configuration files have been updated. **You just need to update the IAM role policy via AWS Console** (Step 1 above).
