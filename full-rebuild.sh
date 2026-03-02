#!/usr/bin/env bash
# full-rebuild.sh
# Full rebuild script for ContextCypher (Linux/macOS)
# Cleans, reinstalls, builds, and starts both servers.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DEV_SECRET="contextcypher-local-dev-secret"

echo "ContextCypher - Full Rebuild"
echo "============================================================"

# Step 1: Kill existing processes on our ports
echo ""
echo "Step 1: Stopping existing servers..."
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:3002 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1
echo "Done."

# Step 2: Clean and reinstall dependencies
echo ""
echo "Step 2: Cleaning dependency folders..."
rm -rf "$SCRIPT_DIR/node_modules"
rm -rf "$SCRIPT_DIR/server/node_modules"
echo "Done."

echo ""
echo "Step 3: Installing dependencies..."
cd "$SCRIPT_DIR"
npm install
echo "Root dependencies installed."

cd "$SCRIPT_DIR/server"
npm install
echo "Server dependencies installed."

cd "$SCRIPT_DIR"

# Step 4: Build frontend and backend
echo ""
echo "Step 4: Building frontend and backend..."
npm run build:prod 2>/dev/null || npm run build
echo "Build completed."

# Step 5: Start backend server
echo ""
echo "Step 5: Starting backend server..."
cd "$SCRIPT_DIR/server"
NODE_ENV=development \
REQUIRE_APP_SECRET=false \
FORCE_PRODUCTION=false \
DEBUG_CORS=true \
PORT=3002 \
APP_SECRET="$LOCAL_DEV_SECRET" \
node index.js &
BACKEND_PID=$!
echo "Backend starting on port 3002 (PID: $BACKEND_PID)"

sleep 3

# Quick health check
if curl -sf -H "X-App-Secret: $LOCAL_DEV_SECRET" http://localhost:3002/api/health >/dev/null 2>&1; then
    echo "Backend server is healthy!"
else
    echo "Backend still starting up (this is normal)."
fi

# Step 6: Start frontend static server
echo ""
echo "Step 6: Starting frontend server..."
cd "$SCRIPT_DIR"
node scripts/dev-static-server.js &
FRONTEND_PID=$!
echo "Frontend starting on port 3000 (PID: $FRONTEND_PID)"

echo ""
echo "============================================================"
echo "Full rebuild complete!"
echo ""
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:3002"
echo ""
echo "Press Ctrl+C to stop both servers."

# Open browser after a short delay
sleep 3
if command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:3000" 2>/dev/null &
elif command -v open &>/dev/null; then
    open "http://localhost:3000" 2>/dev/null &
fi

# Wait for either process to exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
