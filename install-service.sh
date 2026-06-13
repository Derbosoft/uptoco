#!/bin/bash
# UpToco — Installation d'un service systemd
# Redémarrage automatique en cas de crash + logs persistants (journalctl)
set -e
cd "$(dirname "$0")"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
info() { echo -e "${CYAN}  → $1${NC}"; }
fail() { echo -e "${RED}  ✗ $1${NC}"; exit 1; }

PROJECT_DIR="$(pwd)"
RUN_USER="${SUDO_USER:-$USER}"
SERVICE_FILE="/etc/systemd/system/uptoco.service"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   UpToco  —  Service systemd         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Vérifications ─────────────────────────────────────────────────────────────
[ -f "$PROJECT_DIR/.venv/bin/uvicorn" ] || fail "venv introuvable. Lancez d'abord : bash install.sh"
[ -d "$PROJECT_DIR/frontend/dist" ]     || fail "frontend non compilé. Lancez d'abord : bash install.sh"

info "Projet : $PROJECT_DIR"
info "User   : $RUN_USER"
echo ""

# ── Création du fichier service ───────────────────────────────────────────────
info "Écriture de $SERVICE_FILE (sudo requis)..."
sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=UpToco - Gestion de parc informatique
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$PROJECT_DIR/backend
ExecStart=$PROJECT_DIR/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=3
# Évite l'épuisement des descripteurs de fichiers
LimitNOFILE=8192

[Install]
WantedBy=multi-user.target
EOF
ok "Fichier service créé"

# ── Activation ────────────────────────────────────────────────────────────────
info "Activation et démarrage..."
sudo systemctl daemon-reload
sudo systemctl enable uptoco >/dev/null 2>&1
sudo systemctl restart uptoco
ok "Service actif"

# ── Résumé ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Service installé !                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  UpToco démarre désormais au boot et redémarre seul en cas de crash."
echo ""
echo -e "  Statut       : ${CYAN}sudo systemctl status uptoco${NC}"
echo -e "  Logs (live)  : ${CYAN}journalctl -u uptoco -f${NC}"
echo -e "  Redémarrer   : ${CYAN}sudo systemctl restart uptoco${NC}"
echo -e "  Arrêter      : ${CYAN}sudo systemctl stop uptoco${NC}"
echo ""
echo -e "  Accès : ${CYAN}http://$(hostname -I | awk '{print $1}'):8000${NC}"
echo ""
