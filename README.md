# Live Meeting App

A production-ready video conferencing application built with Next.js, AWS Chime SDK, and Auth0 authentication.

## Features

- 🎥 **Real-time Video Conferencing** - Powered by AWS Chime SDK
- 📅 **Scheduled Meetings** - Schedule meetings with time-based access control
- 🎬 **Recording Support** - Record meetings with automatic MediaConvert processing
- 🔐 **Secure Authentication** - Auth0 integration with multiple providers
- 💾 **MongoDB Storage** - Persistent meeting data and user management
- 🎨 **Modern UI** - Responsive design with Tailwind CSS
- ⚡ **Production Ready** - Error handling, loaders, and state management

## Tech Stack

- **Frontend**: Next.js 15, React, Tailwind CSS
- **Backend**: Next.js API Routes
- **Video**: AWS Chime SDK Meetings
- **Authentication**: NextAuth.js + Auth0
- **Database**: MongoDB Atlas
- **Storage**: AWS S3
- **Processing**: AWS MediaConvert
- **Deployment**: AWS Amplify (recommended)

## Prerequisites

- Node.js 18+ 
- AWS Account with Chime, S3, and MediaConvert access
- MongoDB Atlas database
- Auth0 account

## Getting Started

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd live-meeting-app
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

**Important for AWS Amplify:** Use `CHIME_*` and `MEDIACONVERT_*` prefixes instead of `AWS_*` as Amplify reserves those variables.

Required variables:
- `CHIME_REGION` - AWS region (e.g., us-east-1)
- `CHIME_ACCESS_KEY_ID` - AWS access key
- `CHIME_SECRET_ACCESS_KEY` - AWS secret key
- `CHIME_ACCOUNT_ID` - AWS account ID
- `AUTH0_SECRET` - Random 32-character string
- `NEXT_PUBLIC_AUTH0_DOMAIN` - Your Auth0 domain
- `NEXT_PUBLIC_AUTH0_CLIENT_ID` - Auth0 client ID
- `AUTH0_CLIENT_SECRET` - Auth0 client secret
- `MONGODB_URI` - MongoDB connection string
- `CHIME_RECORDING_BUCKET` - S3 bucket for recordings
- `MEDIACONVERT_ENDPOINT` - MediaConvert endpoint URL
- `MEDIACONVERT_ROLE` - IAM role ARN for MediaConvert

See `.env.example` for all available options.

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Deployment

### Deploy to AWS Amplify (Recommended)

AWS Amplify provides seamless Next.js deployment with CI/CD.

**📖 Complete guide:** See [`AMPLIFY_DEPLOYMENT.md`](./AMPLIFY_DEPLOYMENT.md)

Quick steps:
1. Push code to GitHub
2. Connect repository in Amplify Console
3. Configure environment variables (use `CHIME_*` prefix!)
4. Deploy automatically

### Environment Variables for Production

⚠️ **Critical:** AWS Amplify reserves `AWS_*` prefix for internal use.

Use these prefixes instead:
- `CHIME_*` for AWS configuration
- `MEDIACONVERT_*` for MediaConvert settings

The app supports both old and new prefixes for backward compatibility.

**Migration guide:** See [`ENV_MIGRATION_SUMMARY.md`](./ENV_MIGRATION_SUMMARY.md)

## Project Structure

```
live-meeting-app/
├── app/
│   ├── api/              # API routes
│   │   ├── auth/         # NextAuth endpoints
│   │   ├── meeting/      # Meeting management
│   │   ├── recording/    # Recording controls
│   │   └── scheduled-meeting/  # Scheduled meetings
│   ├── components/       # React components
│   ├── contexts/         # React contexts
│   ├── hooks/            # Custom hooks
│   ├── lib/              # Utilities and configs
│   │   ├── awsConfig.js  # AWS SDK configuration
│   │   └── recording/    # Recording logic
│   └── meeting/[id]/     # Meeting room pages
├── public/               # Static assets
├── .env                  # Environment variables (not in git)
├── .env.example          # Environment template
└── AMPLIFY_DEPLOYMENT.md # Deployment guide
```

## Key Components

### Meeting Features
- **Instant Meetings** - Create and join meetings immediately
- **Scheduled Meetings** - Plan meetings with date/time
- **Join via Link** - Share meeting links with participants
- **Host Controls** - Recording, participant management
- **Time Windows** - 5-minute early start, automatic end time

### Recording Features
- **Start/Stop Recording** - Host controls for meeting recording
- **S3 Storage** - Automatic upload of recording segments
- **MediaConvert Processing** - Converts recordings to MP4
- **Stability Checking** - Ensures all segments are uploaded

### Authentication
- **Auth0 Integration** - Social login providers
- **Guest Access** - Join meetings without signup
- **Session Management** - Secure user sessions

## Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
```

### Environment Variables

The app uses a dual-prefix system:
- **Development**: Uses either `CHIME_*` or `AWS_*` (fallback)
- **Production (Amplify)**: Uses only `CHIME_*` and `MEDIACONVERT_*`

All code includes fallback logic for backward compatibility.

## Documentation

- [`AMPLIFY_DEPLOYMENT.md`](./AMPLIFY_DEPLOYMENT.md) - Complete deployment guide
- [`ENV_MIGRATION_SUMMARY.md`](./ENV_MIGRATION_SUMMARY.md) - Environment variable changes
- [`.env.example`](./.env.example) - Environment variable template

## Troubleshooting

### "AWS_* environment variable not found"
**Solution:** Use `CHIME_*` prefix instead when deploying to Amplify.

### Build fails on Amplify
**Check:**
1. All environment variables are set
2. Variables use correct prefixes (`CHIME_*`, not `AWS_*`)
3. MongoDB connection string is correct
4. Auth0 callback URLs include Amplify domain

### Recording not working
**Check:**
1. S3 bucket permissions
2. MediaConvert IAM role
3. AWS credentials have proper permissions

See [`AMPLIFY_DEPLOYMENT.md`](./AMPLIFY_DEPLOYMENT.md) for detailed troubleshooting.

## Learn More

### Next.js
- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)

### AWS Chime SDK
- [Chime SDK Documentation](https://docs.aws.amazon.com/chime-sdk/)
- [Chime SDK Meetings](https://docs.aws.amazon.com/chime-sdk/latest/dg/meetings-sdk.html)

### AWS Amplify
- [Amplify Hosting](https://docs.aws.amazon.com/amplify/latest/userguide/welcome.html)
- [Environment Variables](https://docs.aws.amazon.com/amplify/latest/userguide/environment-variables.html)

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
1. Check documentation files in the project
2. Review [AWS Amplify docs](https://docs.aws.amazon.com/amplify/)
3. Check [Chime SDK docs](https://docs.aws.amazon.com/chime-sdk/)

---

**Note:** This app is designed for AWS Amplify deployment. Environment variable naming follows Amplify requirements.
