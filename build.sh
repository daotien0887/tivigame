#!/bin/bash
# ================================================================
#  TiviGame — Build Script
#  Builds TV and Mobile clients for production
#  Usage: ./build.sh
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
BUILD_START=$(date +%s)

echo ""
echo -e "${BOLD}${CYAN}  🏗️  TiviGame — Production Build${RESET}"
echo -e "  ──────────────────────────────────────────"
echo ""

# Track exit codes
EXIT_TV=0
EXIT_MOBILE=0

# ── Helper: section header ────────────────────────────────────────
print_step() {
    echo -e "${BOLD}${CYAN}  ▶ $1${RESET}"
}

print_ok() {
    echo -e "  ${GREEN}✔${RESET}  $1"
}

print_fail() {
    echo -e "  ${RED}✘${RESET}  $1"
}

# ── 1. Install dependencies ───────────────────────────────────────
print_step "Installing dependencies..."

(cd "$ROOT_DIR/server" && npm install --silent) && print_ok "server" || { print_fail "server"; exit 1; }
(cd "$ROOT_DIR/client-tv" && npm install --silent) && print_ok "client-tv" || { print_fail "client-tv"; exit 1; }
(cd "$ROOT_DIR/client-mobile" && npm install --silent) && print_ok "client-mobile" || { print_fail "client-mobile"; exit 1; }

echo ""

# ── 2. Build TV Client ────────────────────────────────────────────
print_step "Building TV client..."
(
    cd "$ROOT_DIR/client-tv"
    npm run build 2>&1
)
EXIT_TV=$?
if [ $EXIT_TV -eq 0 ]; then
    print_ok "TV client built → client-tv/dist/"
else
    print_fail "TV client build FAILED (exit code $EXIT_TV)"
fi

echo ""

# ── 3. Build Mobile Client ────────────────────────────────────────
print_step "Building Mobile client..."
(
    cd "$ROOT_DIR/client-mobile"
    npm run build 2>&1
)
EXIT_MOBILE=$?
if [ $EXIT_MOBILE -eq 0 ]; then
    print_ok "Mobile client built → client-mobile/dist/"
else
    print_fail "Mobile client build FAILED (exit code $EXIT_MOBILE)"
fi

echo ""

# ── 4. Summary ────────────────────────────────────────────────────
BUILD_END=$(date +%s)
ELAPSED=$((BUILD_END - BUILD_START))

echo -e "  ──────────────────────────────────────────"

if [ $EXIT_TV -eq 0 ] && [ $EXIT_MOBILE -eq 0 ]; then
    echo -e "  ${BOLD}${GREEN}✔  Build successful in ${ELAPSED}s${RESET}"
    echo ""
    echo -e "  ${BOLD}Output directories:${RESET}"
    echo -e "    TV     →  ${YELLOW}client-tv/dist/${RESET}"
    echo -e "    Mobile →  ${BLUE}client-mobile/dist/${RESET}"
    echo ""
    echo -e "  ${BOLD}To run the server in production:${RESET}"
    echo -e "    ${CYAN}cd server && npm start${RESET}"
    echo ""
    exit 0
else
    echo -e "  ${BOLD}${RED}✘  Build failed after ${ELAPSED}s${RESET}"
    [ $EXIT_TV -ne 0 ]     && echo -e "     ${RED}→ TV client failed${RESET}"
    [ $EXIT_MOBILE -ne 0 ] && echo -e "     ${RED}→ Mobile client failed${RESET}"
    echo ""
    exit 1
fi
