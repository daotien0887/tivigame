#!/bin/bash
# ================================================================
#  TiviGame — Dev Script
#  Starts all 3 services in parallel with colored output
#  Usage: ./dev.sh
# ================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo -e "${BOLD}${CYAN}  ████████╗██╗██╗   ██╗██╗ ██████╗  █████╗ ███╗   ███╗███████╗${RESET}"
echo -e "${BOLD}${CYAN}     ██╔══╝██║██║   ██║██║██╔════╝ ██╔══██╗████╗ ████║██╔════╝${RESET}"
echo -e "${BOLD}${CYAN}     ██║   ██║██║   ██║██║██║  ███╗███████║██╔████╔██║█████╗  ${RESET}"
echo -e "${BOLD}${CYAN}     ██║   ██║╚██╗ ██╔╝██║██║   ██║██╔══██║██║╚██╔╝██║██╔══╝  ${RESET}"
echo -e "${BOLD}${CYAN}     ██║   ██║ ╚████╔╝ ██║╚██████╔╝██║  ██║██║ ╚═╝ ██║███████╗${RESET}"
echo -e "${BOLD}${CYAN}     ╚═╝   ╚═╝  ╚═══╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝${RESET}"
echo ""
echo -e "${BOLD}  🎮  DEV MODE${RESET}"
echo -e "  Server  →  ${GREEN}http://localhost:3001${RESET}"
echo -e "  TV      →  ${YELLOW}http://localhost:5173${RESET}"
echo -e "  Mobile  →  ${BLUE}http://localhost:5174${RESET}"
echo ""
echo -e "  Press ${RED}Ctrl+C${RESET} to stop all services"
echo -e "  ──────────────────────────────────────────"
echo ""

# Cleanup: kill all child processes when script exits
cleanup() {
    echo ""
    echo -e "${RED}  Stopping all services...${RESET}"
    kill 0
    exit 0
}
trap cleanup INT TERM

# Prefix helper — prepends a colored label to each line of output
prefix_output() {
    local label="$1"
    local color="$2"
    while IFS= read -r line; do
        echo -e "${color}${label}${RESET}  ${line}"
    done
}

# ── Server ───────────────────────────────────────────────────────
(
    cd "$ROOT_DIR/server"
    if [ ! -d "node_modules" ]; then
        echo -e "${GREEN}[server]${RESET}  Installing dependencies..."
        npm install
    fi
    npm run dev 2>&1 | prefix_output "[server]" "${GREEN}"
) &
SERVER_PID=$!

# Wait a moment so server is up before clients start
sleep 1

# ── TV Client ────────────────────────────────────────────────────
(
    cd "$ROOT_DIR/client-tv"
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}[tv    ]${RESET}  Installing dependencies..."
        npm install
    fi
    npm run dev 2>&1 | prefix_output "[tv    ]" "${YELLOW}"
) &
TV_PID=$!

# ── Mobile Client ────────────────────────────────────────────────
(
    cd "$ROOT_DIR/client-mobile"
    if [ ! -d "node_modules" ]; then
        echo -e "${BLUE}[mobile]${RESET}  Installing dependencies..."
        npm install
    fi
    npm run dev 2>&1 | prefix_output "[mobile]" "${BLUE}"
) &
MOBILE_PID=$!

# Wait for all background jobs
wait $SERVER_PID $TV_PID $MOBILE_PID
