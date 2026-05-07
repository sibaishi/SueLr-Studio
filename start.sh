#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js not found. Please install Node.js >= 22.12.0 first."
  exit 1
fi

# npm run dev remains available for manual split-terminal development.
npm start
