#!/bin/bash

# Recording Processor Lambda Deployment Script
# This script packages and deploys the Lambda function

set -e

# Load environment variables from .env file if it exists (current directory first, then parent)
if [ -f .env ]; then
    echo "📄 Loading environment variables from lambda/.env file..."
    export $(cat .env | grep -v '^#' | xargs)
elif [ -f ../../.env.local ]; then
    echo "📄 Loading environment variables from project root .env.local file..."
    export $(cat ../../.env.local | grep -v '^#' | xargs)
elif [ -f ../../.env ]; then
    echo "📄 Loading environment variables from project root .env file..."
    export $(cat ../../.env | grep -v '^#' | xargs)
else
    echo "ℹ️  No .env file found. Using environment variables or command-line arguments."
fi

FUNCTION_NAME="${FUNCTION_NAME:-recording-processor}"
REGION="${AWS_REGION:-${CHIME_REGION:-us-east-1}}"
LAMBDA_ROLE_ARN="${LAMBDA_ROLE_ARN}"
# Use MEDIACONVERT_ROLE_ARN or fall back to MEDIACONVERT_ROLE
MEDIACONVERT_ROLE_ARN="${MEDIACONVERT_ROLE_ARN:-${MEDIACONVERT_ROLE}}"

echo "========================================="
echo "Recording Processor Lambda Deployment"
echo "========================================="
echo ""
echo "Function: $FUNCTION_NAME"
echo "Region: $REGION"
echo ""

# Check required environment variables
if [ -z "$LAMBDA_ROLE_ARN" ]; then
    echo "❌ Error: LAMBDA_ROLE_ARN environment variable not set"
    echo "Please set the Lambda execution role ARN:"
    echo "export LAMBDA_ROLE_ARN=arn:aws:iam::YOUR_ACCOUNT:role/YOUR_LAMBDA_ROLE"
    exit 1
fi

if [ -z "$MONGODB_URI" ]; then
    echo "❌ Error: MONGODB_URI environment variable not set"
    exit 1
fi

if [ -z "$MEDIACONVERT_ENDPOINT" ]; then
    echo "❌ Error: MEDIACONVERT_ENDPOINT environment variable not set"
    exit 1
fi

if [ -z "$MEDIACONVERT_ROLE_ARN" ]; then
    echo "❌ Error: MEDIACONVERT_ROLE_ARN environment variable not set"
    exit 1
fi

echo "📦 Installing dependencies..."
npm install --production

echo "📝 Creating deployment package..."
rm -f function.zip
zip -r function.zip index.js node_modules/ package.json

echo "☁️  Checking if function exists..."
if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION > /dev/null 2>&1; then
    echo "♻️  Updating existing Lambda function..."
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://function.zip \
        --region $REGION

    echo "⚙️  Updating function configuration..."
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --timeout 300 \
        --memory-size 512 \
        --environment "Variables={
            MONGODB_URI=$MONGODB_URI,
            MONGODB_DB=${MONGODB_DB:-live-meeting-app},
            MEDIACONVERT_ENDPOINT=$MEDIACONVERT_ENDPOINT,
            MEDIACONVERT_ROLE_ARN=$MEDIACONVERT_ROLE_ARN
        }" \
        --region $REGION

else
    echo "🆕 Creating new Lambda function..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --runtime nodejs18.x \
        --role $LAMBDA_ROLE_ARN \
        --handler index.handler \
        --timeout 300 \
        --memory-size 512 \
        --zip-file fileb://function.zip \
        --environment "Variables={
            MONGODB_URI=$MONGODB_URI,
            MONGODB_DB=${MONGODB_DB:-live-meeting-app},
            MEDIACONVERT_ENDPOINT=$MEDIACONVERT_ENDPOINT,
            MEDIACONVERT_ROLE_ARN=$MEDIACONVERT_ROLE_ARN
        }" \
        --region $REGION
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Function Name: $FUNCTION_NAME"
echo "Region: $REGION"
echo ""
echo "🔧 Next steps:"
echo "1. Add RECORDING_PROCESSOR_LAMBDA_NAME=$FUNCTION_NAME to your .env.local"
echo "2. Test the function with a sample recording"
echo ""
