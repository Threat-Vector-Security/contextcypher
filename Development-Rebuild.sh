#!/usr/bin/env bash
# Development-Rebuild.sh
# Hot reload development environment for ContextCypher (Linux/macOS)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DEV_SECRET="contextcypher-local-dev-secret"

echo "ContextCypher - Development Rebuild (Hot Reload)"
echo "================================================="

# Step 1: Kill existing Node.js processes on our ports
echo ""
echo "Step 1: Stopping existing servers..."
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:3002 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1
echo "Done."

# Step 2: Start backend with nodemon (hot reload)
echo ""
echo "Step 2: Starting backend server with hot reload..."
cd "$SCRIPT_DIR/server"
NODE_ENV=development \
REQUIRE_APP_SECRET=false \
FORCE_PRODUCTION=false \
DEBUG_CORS=true \
PORT=3002 \
APP_SECRET="$LOCAL_DEV_SECRET" \
npm run dev &
BACKEND_PID=$!
echo "Backend starting on port 3002 (PID: $BACKEND_PID)"

sleep 3

# Step 3: Start frontend with React hot reload
echo ""
echo "Step 3: Starting frontend server with hot reload..."
cd "$SCRIPT_DIR"
REACT_APP_LOCAL_DEV_SECRET="$LOCAL_DEV_SECRET" \
REACT_APP_SECRET="$LOCAL_DEV_SECRET" \
BROWSER=none \
npm start &
FRONTEND_PID=$!
echo "Frontend starting on port 3000 (PID: $FRONTEND_PID)"

echo ""
echo "================================================="
echo "Development environment starting!"
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
