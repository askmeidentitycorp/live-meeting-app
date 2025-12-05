#!/bin/bash

# Manual trigger script for the recording-processor Lambda.
# Fill in the variables below and run: ./trigger-lambda.sh

set -euo pipefail

########## EDIT THESE VALUES ##########
FUNCTION_NAME="recording-processor"   # Lambda function name
REGION="us-east-1"                    # AWS region

# Meeting context
MEETING_ID="97811759-9a85-4039-b6a5-bd8261de2713"
USER_EMAIL="support@askmeidentity.com"
S3_BUCKET="chime-recordings-live-meeting-app"
S3_PREFIX="scheduled-meeting-recordings/693191c04ceccfbe9c80a0e1/2025-12-05T12-11-56-475Z"   # e.g. scheduled-meeting-recordings/abcd/2025-01-01T00-00-00-000Z
STARTED_AT="2025-12-05T12-11-56-475Z"
STOPPED_AT="2025-12-05T13-41-56-475Z"
#######################################

# Build payload
PAYLOAD=$(cat <<EOF
{
  "meetingId": "${MEETING_ID}",
  "userEmail": "${USER_EMAIL}",
  "s3Bucket": "${S3_BUCKET}",
  "s3Prefix": "${S3_PREFIX}",
  "recordingInfo": {
    "startedAt": "${STARTED_AT}",
    "stoppedAt": "${STOPPED_AT}"
  }
}
EOF
)

echo "Invoking Lambda ${FUNCTION_NAME} in ${REGION}..."
aws lambda invoke \
  --function-name "${FUNCTION_NAME}" \
  --region "${REGION}" \
  --invocation-type RequestResponse \
  --payload "${PAYLOAD}" \
  --cli-binary-format raw-in-base64-out \
  /tmp/trigger-lambda-response.json

echo "Response:"
if command -v jq >/dev/null 2>&1; then
  jq '.' /tmp/trigger-lambda-response.json || cat /tmp/trigger-lambda-response.json
else
  cat /tmp/trigger-lambda-response.json
fi