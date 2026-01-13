#!/bin/bash

# Music Matters - Quick Local Test Script
# Run this to start both backend and frontend

set -e

echo "🎧 Music Matters - Starting Local Development Environment"
echo ""

# Check if we're in the right directory
if [ ! -f "LOCAL_SETUP.md" ]; then
    echo "❌ Error: Run this script from the music-matters root directory"
    exit 1
fi

# Check dependencies
echo "📋 Checking dependencies..."

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Install it first."
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install it first."
    exit 1
fi

if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  ffmpeg not found. Install with: brew install ffmpeg"
fi

echo "✅ Dependencies OK"
echo ""

# Backend setup
echo "🔧 Setting up backend..."
cd backend

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

echo "Installing Python dependencies..."
pip install -q -r requirements.txt
pip install -q BeatNet soundfile

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
MUSICBRAINZ_USER_AGENT=MusicMatters/1.0
OUTPUT_DIR=~/Sound_Bank
CACHE_DIR=~/.music_matters_cache
PYTORCH_ENABLE_MPS_FALLBACK=1
EOF
fi

# Create output directory
mkdir -p ~/Sound_Bank

echo "✅ Backend ready"
echo ""

# Frontend setup
echo "🔧 Setting up frontend..."
cd ../frontend

if [ ! -d "node_modules" ]; then
    echo "Installing Node dependencies..."
    npm install
fi

echo "✅ Frontend ready"
echo ""

# Start services
echo "🚀 Starting services..."
echo ""
echo "Backend will start on: http://localhost:8000"
echo "Frontend will start on: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both services"
echo ""

# Start backend in background
cd ../backend
source venv/bin/activate
python -m app.main &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Start frontend
cd ../frontend
npm run dev &
FRONTEND_PID=$!

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
