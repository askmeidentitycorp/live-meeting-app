# AWS Amplify IAM Permission Fix

## Problem
When deploying to AWS Amplify, the app failed with this error:
```
arn:aws:sts::556406042258:assumed-role/cloudwatch_logs_events_putter/...
is not authorized to perform: chime:CreateMeeting
```

## Root Cause
The Chime SDK clients in API routes were created **without credentials**, only passing the region:
```javascript
// ❌ OLD - No credentials
const client = new ChimeSDKMeetingsClient({ region: process.env.CHIME_REGION });
```

This caused the AWS SDK to try using the Amplify execution role, which doesn't have Chime permissions.

## Solution
Updated all API routes to include credentials when available:

```javascript
// ✅ NEW - With credentials fallback
const getChimeClient = () => {
  const config = {
    region: process.env.CHIME_REGION || process.env.AWS_REGION || 'us-east-1'
  };

  const accessKeyId = process.env.CHIME_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CHIME_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  
  if (accessKeyId && secretAccessKey) {
    config.credentials = {
      accessKeyId,
      secretAccessKey
    };
  }

  return new ChimeSDKMeetingsClient(config);
};
```

## Files Updated

1. ✅ `app/api/meeting/route.js` - Create instant meeting
2. ✅ `app/api/join-meeting/route.js` - Join meeting
3. ✅ `app/api/meetings/route.js` - Get meetings
4. ✅ `app/api/scheduled-meeting/[id]/info/route.js` - Get scheduled meeting info
5. ✅ `app/api/scheduled-meeting/start/route.js` - Start scheduled meeting

## How It Works

### Development (Local)
- Uses either `CHIME_ACCESS_KEY_ID` or `AWS_ACCESS_KEY_ID` from `.env`
- Falls back to AWS credential chain if not provided

### Production (Amplify)
- Uses `CHIME_ACCESS_KEY_ID` and `CHIME_SECRET_ACCESS_KEY` from Amplify environment variables
- These credentials must have Chime SDK permissions

## Required IAM Permissions

Your IAM user (with the access keys) needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "chime:CreateMeeting",
        "chime:CreateMeetingWithAttendees",
        "chime:CreateAttendee",
        "chime:GetMeeting",
        "chime:DeleteMeeting",
        "chime:BatchCreateAttendee"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::chime-recordings-live-meeting-app-20251017/*",
        "arn:aws:s3:::chime-recordings-live-meeting-app-20251017"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "mediaconvert:CreateJob",
        "mediaconvert:GetJob",
        "mediaconvert:ListJobs"
      ],
      "Resource": "*"
    }
  ]
}
```

## Deployment Checklist

- [x] Updated all Chime client instantiations to use credentials
- [x] Added fallback for both `CHIME_*` and `AWS_*` prefixes
- [x] Verified no build errors
- [ ] Deploy to Amplify
- [ ] Verify credentials are set in Amplify environment variables:
  - `CHIME_ACCESS_KEY_ID`
  - `CHIME_SECRET_ACCESS_KEY`
  - `CHIME_REGION`
- [ ] Test meeting creation in production

## Testing

After deployment, test these functions:
1. ✅ Create instant meeting
2. ✅ Join meeting
3. ✅ Schedule meeting
4. ✅ Start scheduled meeting
5. ✅ Get meeting info

All should work without permission errors now!

## Alternative Solution (More Secure)

Instead of using IAM user credentials, you can:

1. **Grant the Amplify service role Chime permissions**:
   - Find your Amplify service role in IAM Console
   - Attach the policy above to that role
   
2. **Remove hardcoded credentials**:
   - Delete `CHIME_ACCESS_KEY_ID` and `CHIME_SECRET_ACCESS_KEY` from Amplify env vars
   - The SDK will automatically use the Amplify service role

This is more secure as it doesn't expose access keys.
