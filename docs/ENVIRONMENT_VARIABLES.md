# Environment Variables Reference

## Standardized Variable Names

All environment variables have been standardized across the application. Use these exact names:

### Required Variables

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012

# S3 Recording Bucket
CHIME_RECORDING_BUCKET=your-chime-recordings-bucket

# MediaConvert Configuration
AWS_MEDIACONVERT_ROLE=arn:aws:iam::123456789012:role/MediaConvertRole
```

### Optional Variables

```bash
# AWS Credentials (if not using IAM roles)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# MediaConvert Endpoint (auto-discovered if not set)
AWS_MEDIACONVERT_ENDPOINT=https://abcd1234.mediaconvert.us-east-1.amazonaws.com

# S3 Stability Configuration
AWS_MC_STABILITY_THRESHOLD_MS=10000
AWS_MC_LISTING_WAIT_MS=60000
AWS_MC_POLL_INTERVAL_MS=3000
AWS_MC_REQUIRED_STABLE_ITERATIONS=2
AWS_MC_STABILITY_STRATEGY=dual

# MediaConvert Quality Settings
AWS_MC_VIDEO_WIDTH=1280
AWS_MC_VIDEO_HEIGHT=720
AWS_MC_MAX_BITRATE=5000000
AWS_MC_AUDIO_BITRATE=128000
AWS_MC_AUDIO_SAMPLE_RATE=48000
AWS_MC_HLS_SEGMENT_LENGTH=10
AWS_MC_ACCELERATION_MODE=DISABLED
```

## Usage in Code

These variables are used consistently across:

- `app/api/recording/start/route.js` - Recording pipeline creation
- `app/api/recording/stop/route.js` - Recording pipeline deletion
- `app/api/recording/process/route.js` - MediaConvert job creation
- `app/lib/mediaconvert.js` - MediaConvert operations
- `app/lib/awsConfig.js` - AWS configuration helpers
- `app/lib/recording/config.js` - Configuration management

## Migration from Old Names

If you were using different variable names, update them:

| Old Name | New Standard Name |
|----------|------------------|
| `CLOUD_REGION` | `AWS_REGION` |
| `CLOUD_ACCOUNT_ID` | `AWS_ACCOUNT_ID` |
| `RECORDING_BUCKET` | `CHIME_RECORDING_BUCKET` |
| `AWS_S3_RECORDING_BUCKET` | `CHIME_RECORDING_BUCKET` |
| `VIDEO_CONVERT_ENDPOINT` | `AWS_MEDIACONVERT_ENDPOINT` |
| `VIDEO_CONVERT_ROLE` | `AWS_MEDIACONVERT_ROLE` |

## Quick Setup

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` and set your values:
   ```bash
   AWS_REGION=us-east-1
   AWS_ACCOUNT_ID=368289336576
   CHIME_RECORDING_BUCKET=chime-recordings-live-meeting-app-20251017
   AWS_MEDIACONVERT_ROLE=arn:aws:iam::368289336576:role/MediaConvertChimeRecordingsRole
   ```

3. Restart your application:
   ```bash
   npm run dev
   ```

## Validation

The configuration module validates all required variables on startup. If any are missing, you'll see a clear error message:

```
Error: Required environment variable AWS_REGION is not set
```
