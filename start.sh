#!/bin/bash
set -e
cd "$(dirname "$0")"

# Build frontend
echo "Build du frontend..."
cd frontend
[ ! -d node_modules ] && npm install
npm run build
cd ..

# Start backend (serves API + frontend)
echo ""
echo "Démarrage du backend..."
cd backend
~/.local/bin/uvicorn main:app --host 0.0.0.0 --port 8000
