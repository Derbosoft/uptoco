#!/bin/bash
set -e
cd "$(dirname "$0")"

# Correction des permissions si dist a été créé par root
if [ -d "frontend/dist" ] && [ ! -w "frontend/dist" ]; then
  echo "Correction des permissions de frontend/dist (sudo requis)..."
  sudo chown -R "$USER:$USER" frontend/dist
fi

# Build frontend
echo "Build du frontend..."
cd frontend
npm run build
cd ..

echo ""
echo "Démarrage d'UpToco sur http://localhost:8000"
echo "Accès réseau : http://$(hostname -I | awk '{print $1}'):8000"
echo ""
cd backend
../.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
