#!/bin/bash
# UpToco — Téléchargement
# Usage : curl -sSL https://raw.githubusercontent.com/Derbosoft/uptoco/main/get.sh | bash

set -e

REPO="https://github.com/Derbosoft/uptoco"
DIR="uptoco"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
info() { echo -e "${CYAN}  → $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
fail() { echo -e "${RED}  ✗ $1${NC}"; exit 1; }

echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         UpToco  —  Download          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Téléchargement ────────────────────────────────────────────────────────────
if [ -d "$DIR/.git" ]; then
    info "Repo already present — updating..."
    git -C "$DIR" pull --ff-only
    ok "Updated"
elif [ -d "$DIR" ]; then
    warn "Folder '$DIR' exists but is not a git repo."
    warn "Remove it manually:  rm -rf $DIR"
    exit 1
elif command -v git &>/dev/null; then
    info "Cloning via git..."
    git clone "$REPO" "$DIR"
    ok "Cloned into ./$DIR"
elif command -v curl &>/dev/null; then
    info "Downloading archive (curl)..."
    curl -sSL "$REPO/archive/refs/heads/main.tar.gz" | tar xz
    mv uptoco-main "$DIR"
    ok "Downloaded into ./$DIR"
elif command -v wget &>/dev/null; then
    info "Downloading archive (wget)..."
    wget -qO- "$REPO/archive/refs/heads/main.tar.gz" | tar xz
    mv uptoco-main "$DIR"
    ok "Downloaded into ./$DIR"
else
    fail "git, curl or wget is required."
fi

# ── Création des scripts wrappers locaux ──────────────────────────────────────
cat > install.sh << EOF
#!/bin/bash
bash "$DIR/install.sh"
EOF
chmod +x install.sh

cat > start.sh << EOF
#!/bin/bash
bash "$DIR/start.sh"
EOF
chmod +x start.sh

ok "install.sh and start.sh created"

# ── Résumé ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Download complete!                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Next steps:"
echo ""
echo -e "  ${CYAN}bash install.sh${NC}"
echo -e "  ${CYAN}bash start.sh${NC}"
echo ""
