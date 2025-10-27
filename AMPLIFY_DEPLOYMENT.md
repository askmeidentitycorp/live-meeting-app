# AWS Amplify Deployment Guide

This guide will help you deploy your live meeting app to AWS Amplify.

## Prerequisites

- AWS Account with Amplify access
- GitHub repository with your code
- MongoDB Atlas database
- Auth0 account configured

## Environment Variables Configuration

AWS Amplify **reserves** all environment variables starting with `AWS_` for its own use. This app uses `CHIME_` and `MEDIACONVERT_` prefixes instead.

### Required Environment Variables

Add these in Amplify Console → App Settings → Environment Variables:

#### AWS Configuration
```
CHIME_REGION=us-east-1
CHIME_ACCESS_KEY_ID=<your-aws-access-key>
CHIME_SECRET_ACCESS_KEY=<your-aws-secret-key>
CHIME_ACCOUNT_ID=<your-aws-account-id>
```

#### Auth0 Configuration
```
AUTH0_SECRET=<generate-32-char-random-string>
NEXT_PUBLIC_APP_BASE_URL=https://your-app.amplifyapp.com
NEXT_PUBLIC_AUTH0_DOMAIN=your-domain.auth0.com
NEXT_PUBLIC_AUTH0_CLIENT_ID=<your-auth0-client-id>
AUTH0_CLIENT_SECRET=<your-auth0-client-secret>
```

#### Recording Configuration
```
CHIME_RECORDING_BUCKET=<your-s3-bucket-name>
MEDIACONVERT_ENDPOINT=https://mediaconvert.us-east-1.amazonaws.com
MEDIACONVERT_ROLE=arn:aws:iam::<account-id>:role/<role-name>
```

#### MediaConvert Processing (Optional - uses defaults if not set)
```
MEDIACONVERT_STABILITY_THRESHOLD_MS=5000
MEDIACONVERT_LISTING_WAIT_MS=30000
MEDIACONVERT_POLL_INTERVAL_MS=2000
```

#### Database
```
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/
MONGODB_DB=live-meeting
```

## Deployment Steps

### 1. Connect Your Repository

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. Click "New app" → "Host web app"
3. Select "GitHub" and authorize access
4. Choose your repository and branch (e.g., `main`)

### 2. Configure Build Settings

Amplify should auto-detect Next.js. Verify the build settings:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
```

### 3. Add Environment Variables

1. Go to "App settings" → "Environment variables"
2. Click "Manage variables"
3. Add all variables from the list above
4. **Important**: Mark sensitive variables (passwords, secrets, keys) as "Secret"

### 4. Configure Auth0 Callback URLs

Update your Auth0 application settings:

1. **Allowed Callback URLs**: 
   ```
   https://your-app.amplifyapp.com/api/auth/callback/auth0
   ```

2. **Allowed Logout URLs**:
   ```
   https://your-app.amplifyapp.com
   ```

3. **Allowed Web Origins**:
   ```
   https://your-app.amplifyapp.com
   ```

### 5. Configure IAM Permissions

Ensure your AWS credentials have these permissions:

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
        "chime:StartMeetingTranscription",
        "chime:StopMeetingTranscription"
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
        "arn:aws:s3:::your-recording-bucket/*",
        "arn:aws:s3:::your-recording-bucket"
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

### 6. Deploy

1. Click "Save and deploy"
2. Monitor the build logs in real-time
3. Once complete, your app will be available at: `https://<branch-name>.<app-id>.amplifyapp.com`

## Post-Deployment

### Custom Domain (Optional)

1. Go to "App settings" → "Domain management"
2. Click "Add domain"
3. Follow the wizard to add your custom domain
4. Update DNS records as instructed
5. Update `NEXT_PUBLIC_APP_BASE_URL` environment variable
6. Update Auth0 callback URLs with new domain

### Enable Auto-Deploy

Amplify automatically deploys on every push to your connected branch.

To disable:
1. Go to "App settings" → "Build settings"
2. Toggle "Automatically build pull requests"

### Monitoring

- **Build History**: View all deployments and build logs
- **Monitoring**: View app metrics and errors
- **Logs**: Access CloudWatch logs for debugging

## Troubleshooting

### Build Failures

1. Check build logs in Amplify Console
2. Verify all environment variables are set correctly
3. Ensure `package.json` has all dependencies

### Runtime Errors

1. Check CloudWatch logs via Amplify Console
2. Verify MongoDB connection string
3. Check Auth0 configuration
4. Verify AWS credentials have proper permissions

### Environment Variable Issues

- AWS Amplify does **NOT** support `AWS_` prefix for custom variables
- Use `CHIME_` prefix as implemented in this app
- Restart the app after changing environment variables

## Variable Migration from Old Prefix

If you're migrating from old variable names:

| Old (AWS_ prefix) | New (Amplify-compatible) |
|------------------|--------------------------|
| AWS_REGION | CHIME_REGION |
| AWS_ACCESS_KEY_ID | CHIME_ACCESS_KEY_ID |
| AWS_SECRET_ACCESS_KEY | CHIME_SECRET_ACCESS_KEY |
| AWS_ACCOUNT_ID | CHIME_ACCOUNT_ID |
| AWS_MEDIACONVERT_ENDPOINT | MEDIACONVERT_ENDPOINT |
| AWS_MEDIACONVERT_ROLE | MEDIACONVERT_ROLE |
| AWS_MC_STABILITY_THRESHOLD_MS | MEDIACONVERT_STABILITY_THRESHOLD_MS |
| AWS_MC_LISTING_WAIT_MS | MEDIACONVERT_LISTING_WAIT_MS |
| AWS_MC_POLL_INTERVAL_MS | MEDIACONVERT_POLL_INTERVAL_MS |

The app code supports **both** old and new prefixes for backward compatibility.

## Support

For issues related to:
- **Amplify**: [AWS Amplify Documentation](https://docs.aws.amazon.com/amplify/)
- **Next.js**: [Next.js Documentation](https://nextjs.org/docs)
- **Auth0**: [Auth0 Documentation](https://auth0.com/docs)
- **MongoDB**: [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
