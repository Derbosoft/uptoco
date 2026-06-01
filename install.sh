#!/bin/bash
# UpToco — script d'installation
set -e
cd "$(dirname "$0")"

# ── Couleurs ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
info() { echo -e "${CYAN}  → $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
fail() { echo -e "${RED}  ✗ $1${NC}"; exit 1; }

echo ""
echo -e "${CYAN}╔════════════════════════════════╗${NC}"
echo -e "${CYAN}║     UpToco  —  Installation    ║${NC}"
echo -e "${CYAN}╚════════════════════════════════╝${NC}"
echo ""

# ── 1. Python 3.10+ ───────────────────────────────────────────────────────────
echo "[ 1/5 ] Python"
if ! command -v python3 &>/dev/null; then
    fail "Python 3 introuvable. Installez-le : sudo apt install python3"
fi

PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)

if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]; }; then
    fail "Python $PY_VER détecté. Python 3.10+ requis."
fi
ok "Python $PY_VER"

# ── 2. Environnement virtuel Python ───────────────────────────────────────────
echo ""
echo "[ 2/5 ] Environnement virtuel Python"
if [ ! -d ".venv" ]; then
    info "Création du venv..."
    python3 -m venv .venv || fail "Échec de la création du venv. Installez : sudo apt install python3-venv"
fi
ok "Venv prêt (.venv/)"

# Bootstrap pip si absent (cas fréquent sur Debian/Ubuntu)
if ! .venv/bin/python -m pip --version &>/dev/null 2>&1; then
    info "pip absent du venv, bootstrap en cours..."
    # Tentative 1 : ensurepip
    if .venv/bin/python -m ensurepip --upgrade &>/dev/null 2>&1; then
        ok "pip installé via ensurepip"
    # Tentative 2 : get-pip.py (fonctionne même sur Debian/Ubuntu)
    elif command -v curl &>/dev/null || command -v wget &>/dev/null; then
        info "Téléchargement de get-pip.py..."
        if command -v curl &>/dev/null; then
            curl -sS https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
        else
            wget -q https://bootstrap.pypa.io/get-pip.py -O /tmp/get-pip.py
        fi
        .venv/bin/python /tmp/get-pip.py -q
        rm -f /tmp/get-pip.py
        ok "pip installé via get-pip.py"
    else
        fail "Impossible d'installer pip. Lancez : sudo apt install python3-pip python3-venv"
    fi
fi

info "Installation des dépendances Python..."
.venv/bin/python -m pip install --upgrade pip -q
.venv/bin/python -m pip install -r backend/requirements.txt -q
ok "Dépendances Python installées"

# ── 3. Node.js 18+ ────────────────────────────────────────────────────────────
echo ""
echo "[ 3/5 ] Node.js"
if ! command -v node &>/dev/null; then
    fail "Node.js introuvable. Installez-le : https://nodejs.org  (ou : sudo apt install nodejs npm)"
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
    fail "Node.js v$(node -v) détecté. Node 18+ requis."
fi
ok "Node.js $(node -v)"

# ── 4. Frontend ───────────────────────────────────────────────────────────────
echo ""
echo "[ 4/5 ] Frontend"
info "Installation des packages npm..."
cd frontend
npm install --silent
info "Build du frontend..."
npm run build
cd ..
ok "Frontend compilé (frontend/dist/)"

# ── 5. Dossiers et fichiers ───────────────────────────────────────────────────
echo ""
echo "[ 5/5 ] Structure"
mkdir -p backend/uploads
ok "Dossier uploads/ créé"

# sshpass (optionnel)
if command -v sshpass &>/dev/null; then
    ok "sshpass disponible (auth SSH par mot de passe OK)"
else
    warn "sshpass absent — l'auth SSH par mot de passe ne fonctionnera pas"
    warn "  → sudo apt install sshpass"
fi

# ── Mise à jour de start.sh pour utiliser le venv ────────────────────────────
cat > start.sh << 'EOF'
#!/bin/bash
set -e
cd "$(dirname "$0")"

# Build frontend si besoin
echo "Build du frontend..."
cd frontend
npm run build
cd ..

# Démarrage du backend avec le venv
echo ""
echo "Démarrage d'UpToco sur http://localhost:8000"
cd backend
../.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
EOF
chmod +x start.sh
ok "start.sh mis à jour pour utiliser le venv"

# ── Résumé ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Installation terminée avec succès !     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Pour lancer UpToco :"
echo -e "  ${CYAN}./start.sh${NC}"
echo ""
echo -e "  L'application sera disponible sur :"
echo -e "  ${CYAN}http://localhost:8000${NC}"
echo ""
