#!/bin/bash

# Watch Lambda logs in real-time
# Usage: ./watch-logs.sh

echo "🔍 Watching Lambda logs for: recording-processor"
echo "📍 Region: us-east-1"
echo "Press Ctrl+C to stop"
echo ""

aws logs tail /aws/lambda/recording-processor \
    --follow \
    --region us-east-1 \
    --format short \
    --filter-pattern "INFO ERROR WARN"
