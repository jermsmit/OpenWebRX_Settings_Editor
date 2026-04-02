#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  OpenWebRX Settings Editor — Installer
#  Supports: Debian/Ubuntu, Raspberry Pi OS, Fedora/RHEL/CentOS
# ─────────────────────────────────────────────────────────────────────────────

set -e

APP_NAME="owrx-editor"
INSTALL_DIR="/opt/owrx-editor"
SERVICE_NAME="owrx-editor"
REPO_URL="https://github.com/jermsmit/owrx-editor"   # update when published
PORT=5000
PYTHON_MIN="3.8"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Banner ───────────────────────────────────────────────────────────────────
echo -e "${RED}"
cat << 'EOF'
  ___  _    _ _____  __  __   ___    _ _ _
 / _ \| |  | |  __ \|  \/  | / _ \  | (_) |
| | | | |  | | |__) | \  / || | | | | |_| |_ ___  _ __
| | | | |  | |  _  /| |\/| || | | | | | | __/ _ \| '__|
| |_| | |__| | | \ \| |  | || |_| | | | | || (_) | |
 \___/ \____/|_|  \_\_|  |_| \___/  |_|_|\__\___/|_|

  Settings Editor  —  Flask Web App Installer
EOF
echo -e "${NC}"

# ── Root check ───────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Please run as root:  sudo bash install.sh"

# ── OS detection ─────────────────────────────────────────────────────────────
if   [[ -f /etc/debian_version ]]; then PKG_MGR="apt"; FAMILY="debian"
elif [[ -f /etc/fedora-release ]]; then PKG_MGR="dnf"; FAMILY="fedora"
elif [[ -f /etc/redhat-release ]]; then PKG_MGR="yum"; FAMILY="rhel"
else warn "Unrecognised distro — proceeding anyway"; PKG_MGR="apt"; FAMILY="debian"; fi

info "Detected OS family: ${BOLD}${FAMILY}${NC}"

# ── Dependency install ───────────────────────────────────────────────────────
info "Installing system dependencies..."
case $FAMILY in
  debian)
    apt-get update -qq
    apt-get install -y -qq python3 python3-pip python3-venv git curl
    ;;
  fedora|rhel)
    $PKG_MGR install -y python3 python3-pip python3-virtualenv git curl
    ;;
esac
success "System dependencies installed"

# ── Python version check ─────────────────────────────────────────────────────
PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
info "Python version: ${BOLD}${PY_VER}${NC}"
python3 -c "import sys; sys.exit(0 if sys.version_info >= (3,8) else 1)" || \
  error "Python >= ${PYTHON_MIN} required (found ${PY_VER})"

# ── Create install directory ─────────────────────────────────────────────────
info "Installing to ${BOLD}${INSTALL_DIR}${NC}..."
if [[ -d "$INSTALL_DIR" ]]; then
  warn "Directory already exists — updating in place"
else
  mkdir -p "$INSTALL_DIR"
fi

# ── Copy application files ───────────────────────────────────────────────────
# If running from a cloned repo, copy from current dir
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/app.py" ]]; then
  info "Copying files from ${SCRIPT_DIR}..."
  cp -r "${SCRIPT_DIR}/." "${INSTALL_DIR}/"
else
  # Attempt git clone if available
  if command -v git &>/dev/null && [[ "$REPO_URL" != *"jermsmit/owrx-editor"* || 1 -eq 1 ]]; then
    warn "app.py not found beside installer — copying anyway"
    cp -r "${SCRIPT_DIR}/." "${INSTALL_DIR}/" 2>/dev/null || true
  fi
fi
success "Application files in place"

# ── Python virtual environment ───────────────────────────────────────────────
info "Creating Python virtual environment..."
python3 -m venv "${INSTALL_DIR}/venv"
"${INSTALL_DIR}/venv/bin/pip" install --upgrade pip -q
"${INSTALL_DIR}/venv/bin/pip" install -r "${INSTALL_DIR}/requirements.txt" -q
success "Python dependencies installed"

# ── Environment file ─────────────────────────────────────────────────────────
ENV_FILE="${INSTALL_DIR}/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  cat > "$ENV_FILE" << EOF
OWRX_HOST=0.0.0.0
OWRX_PORT=${PORT}
OWRX_DEBUG=false
SECRET_KEY=${SECRET}
EOF
  chmod 600 "$ENV_FILE"
  success "Environment file created at ${ENV_FILE}"
else
  info "Environment file already exists — skipping"
fi

# ── Systemd service ───────────────────────────────────────────────────────────
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
info "Creating systemd service..."
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=OpenWebRX Settings Editor
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=${INSTALL_DIR}/venv/bin/python ${INSTALL_DIR}/app.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Ensure www-data exists; fallback to nobody
if ! id www-data &>/dev/null; then
  warn "www-data not found — using nobody instead"
  sed -i 's/User=www-data/User=nobody/' "$SERVICE_FILE"
fi

chown -R www-data:www-data "${INSTALL_DIR}" 2>/dev/null || \
  chown -R nobody:nobody "${INSTALL_DIR}" 2>/dev/null || true

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" --quiet
systemctl restart "${SERVICE_NAME}"
success "Systemd service enabled and started"

# ── Firewall hint ────────────────────────────────────────────────────────────
if command -v ufw &>/dev/null && ufw status | grep -q "active"; then
  info "UFW detected — opening port ${PORT}..."
  ufw allow "${PORT}/tcp" --quiet && success "Port ${PORT} opened in UFW"
elif command -v firewall-cmd &>/dev/null; then
  info "firewalld detected — opening port ${PORT}..."
  firewall-cmd --permanent --add-port="${PORT}/tcp" --quiet && \
    firewall-cmd --reload --quiet && success "Port ${PORT} opened in firewalld"
fi

# ── Detect IP ────────────────────────────────────────────────────────────────
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  Installation complete!${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Web UI:${NC}       ${CYAN}http://${HOST_IP}:${PORT}${NC}"
echo -e "  ${BOLD}Install dir:${NC}  ${INSTALL_DIR}"
echo -e "  ${BOLD}Service:${NC}      systemctl {start|stop|restart|status} ${SERVICE_NAME}"
echo -e "  ${BOLD}Logs:${NC}         journalctl -u ${SERVICE_NAME} -f"
echo -e "  ${BOLD}Config:${NC}       ${ENV_FILE}"
echo ""
echo -e "  ${YELLOW}Ctrl+S${NC} exports  ·  ${YELLOW}Ctrl+O${NC} imports  (keyboard shortcuts)"
echo ""
