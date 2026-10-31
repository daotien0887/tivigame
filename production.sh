#!/bin/bash
# Serve production builds and connect the existing Cloudflare tunnel.
# Usage: ./production.sh (or ./build.sh --connect to build first)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TUNNEL_CONFIG="${TUNNEL_CONFIG:-$HOME/.cloudflared/config.yml}"
PIDS=()

cleanup() {
    trap - EXIT INT TERM
    for pid in "${PIDS[@]:-}"; do
        [ -z "$pid" ] || kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for command in node curl cloudflared lsof; do
    command -v "$command" >/dev/null || { echo "Missing command: $command"; exit 1; }
done
for client in client-tv client-mobile; do
    [ -f "$ROOT_DIR/$client/dist/index.html" ] || { echo "Run ./build.sh first"; exit 1; }
done
[ -f "$TUNNEL_CONFIG" ] || { echo "Missing tunnel config: $TUNNEL_CONFIG"; exit 1; }
cloudflared tunnel --config "$TUNNEL_CONFIG" ingress validate

# Reuse only matching project services; never terminate unrelated listeners.
start_service() {
    local name="$1" port="$2" directory="$3" expected="$4"
    shift 4
    local pid cwd command_line
    pid="$(lsof -tiTCP:"$port" -sTCP:LISTEN || true)"
    if [ -n "$pid" ]; then
        cwd="$(lsof -a -p "$pid" -d cwd -Fn | sed -n 's/^n//p')"
        command_line="$(ps -p "$pid" -o command=)"
        if [ "$cwd" != "$directory" ] || [[ "$command_line" != *"$expected"* ]]; then
            echo "Port $port is occupied by another service. Stop it before starting production."
            exit 1
        fi
        echo "Reusing $name on port $port"
        return
    fi
    (cd "$directory" && exec "$@") &
    PIDS+=("$!")
}

start_service server 3001 "$ROOT_DIR/server" 'dotenv_config_path=.env.production' \
    env NODE_ENV=production node -r dotenv/config src/index.js dotenv_config_path=.env.production
start_service tv 5173 "$ROOT_DIR/client-tv" 'vite.js preview' \
    node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5173 --strictPort
start_service mobile 5174 "$ROOT_DIR/client-mobile" 'vite.js preview' \
    node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5174 --strictPort

for endpoint in '3001/health' '5173/' '5174/'; do
    ready=false
    for attempt in {1..30}; do
        if curl --fail --silent --max-time 2 "http://127.0.0.1:$endpoint" >/dev/null; then
            ready=true
            break
        fi
        sleep 1
    done
    if [ "$ready" != true ]; then
        echo "Service failed to start: $endpoint"
        exit 1
    fi
done

cloudflared tunnel --config "$TUNNEL_CONFIG" run &
PIDS+=("$!")
echo 'Production services started. Connecting Cloudflare tunnel…'
echo 'TV: https://tv.tivigame.com | Mobile: https://m.tivigame.com'
echo 'Press Ctrl+C to stop services started by this script.'

while true; do
    for pid in "${PIDS[@]}"; do
        if ! kill -0 "$pid" 2>/dev/null; then
            echo "A production service exited (PID $pid)."
            exit 1
        fi
    done
    sleep 2
done
