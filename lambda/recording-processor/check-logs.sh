#!/bin/bash

# Lambda Log Checker Script
# Usage: ./check-logs.sh [option]
# Options:
#   live     - Watch logs in real-time (tail -f style)
#   recent   - Show last 50 log entries
#   errors   - Show only error logs
#   test     - Test invoke the Lambda function

FUNCTION_NAME="recording-processor"
REGION="us-east-1"
LOG_GROUP="/aws/lambda/$FUNCTION_NAME"

case "${1:-recent}" in
  live|watch|tail)
    echo "📡 Watching Lambda logs in real-time..."
    echo "Press Ctrl+C to stop"
    echo ""
    aws logs tail $LOG_GROUP --follow --region $REGION --format short
    ;;
    
  recent|last)
    echo "📋 Recent Lambda logs (last 50 entries):"
    echo ""
    aws logs tail $LOG_GROUP --since 1h --region $REGION --format short | tail -50
    ;;
    
  errors|error)
    echo "❌ Error logs from last hour:"
    echo ""
    aws logs tail $LOG_GROUP --since 1h --region $REGION --format short --filter-pattern "ERROR"
    ;;
    
  test)
    echo "🧪 Test invoking Lambda function..."
    echo ""
    
    PAYLOAD='{
      "meetingId": "test-'$(date +%s)'",
      "userEmail": "test@example.com",
      "s3Bucket": "chime-recordings-live-meeting-app",
      "s3Prefix": "test-meeting/",
      "recordingInfo": {
        "startedAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
        "stoppedAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
      }
    }'
    
    echo "Payload:"
    echo "$PAYLOAD" | jq '.'
    echo ""
    
    aws lambda invoke \
      --function-name $FUNCTION_NAME \
      --region $REGION \
      --invocation-type RequestResponse \
      --payload "$PAYLOAD" \
      --cli-binary-format raw-in-base64-out \
      /tmp/lambda-response.json
    
    echo ""
    echo "Response:"
    cat /tmp/lambda-response.json | jq '.' || cat /tmp/lambda-response.json
    echo ""
    ;;
    
  help|--help|-h)
    echo "Lambda Log Checker"
    echo ""
    echo "Usage: ./check-logs.sh [option]"
    echo ""
    echo "Options:"
    echo "  live, watch, tail  - Watch logs in real-time"
    echo "  recent, last       - Show last 50 log entries (default)"
    echo "  errors, error      - Show only error logs"
    echo "  test               - Test invoke the Lambda function"
    echo "  help               - Show this help message"
    echo ""
    ;;
    
  *)
    echo "Unknown option: $1"
    echo "Run './check-logs.sh help' for usage information"
    exit 1
    ;;
esac
