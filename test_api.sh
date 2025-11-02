#!/bin/bash
# Quick API testing script for Music Matters

BASE_URL="http://localhost:8010"
API_URL="$BASE_URL/api/v1"

echo "🎵 Music Matters API Test Suite"
echo "================================"
echo ""

# Test 1: Health check
echo "1️⃣  Health Check"
curl -s "$BASE_URL/health" | python -m json.tool
echo ""

# Test 2: List tracks
echo "2️⃣  List Tracks"
curl -s "$API_URL/library/tracks" | python -m json.tool
echo ""

# Test 3: Ingest a test file (if provided)
if [ -n "$1" ]; then
    echo "3️⃣  Ingesting: $1"
    RESPONSE=$(curl -s -X POST "$API_URL/jobs/ingest" \
      -H "Content-Type: application/json" \
      -d "{\"source\": \"$1\", \"tags\": [\"test\"], \"collection\": \"cli-test\"}")
    
    echo "$RESPONSE" | python -m json.tool
    
    JOB_ID=$(echo "$RESPONSE" | python -c "import sys, json; print(json.load(sys.stdin)['job_id'])")
    TRACK_ID=$(echo "$RESPONSE" | python -c "import sys, json; print(json.load(sys.stdin)['track_id'])")
    
    echo ""
    echo "⏳ Waiting for job to complete..."
    sleep 3
    
    echo ""
    echo "4️⃣  Job Status"
    curl -s "$API_URL/jobs/$JOB_ID" | python -m json.tool
    
    echo ""
    echo "5️⃣  Track Details"
    curl -s "$API_URL/library/tracks/$TRACK_ID" | python -m json.tool
    
    echo ""
    echo "6️⃣  Track Loops"
    curl -s "$API_URL/library/tracks/$TRACK_ID/loops" | python -m json.tool
    
    echo ""
    echo "✅ Test complete! Track ID: $TRACK_ID"
else
    echo "💡 Usage: $0 /path/to/audio.wav"
    echo "   Or just run without args to check health + list tracks"
fi
