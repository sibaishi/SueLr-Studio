#!/bin/bash
set -e

cd "$(dirname "$0")"

echo ""
echo "  SueLr Studio"
echo "  ============="
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  [ERROR] Node.js not found. Please install Node.js LTS first."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "  [INFO] Installing frontend dependencies..."
  npm install
fi

if [ ! -d "backend/node_modules" ]; then
  echo "  [INFO] Installing backend dependencies..."
  (cd backend && npm install)
fi

echo "  [INFO] Starting frontend and backend..."
npm run dev
