#!/usr/bin/env bash
set -euo pipefail

echo "[entrypoint] Starting Xvfb on ${DISPLAY} ..."
Xvfb "${DISPLAY}" -screen 0 1280x720x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!

cleanup() {
  echo "[entrypoint] Stopping Xvfb (${XVFB_PID})"
  kill "${XVFB_PID}" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for the display to come up
for i in {1..100}; do
  if xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1; then
    echo "[entrypoint] Xvfb is up"
    break
  fi
  sleep 0.1
done

echo "[entrypoint] GLX sanity check:"
glxinfo -B || true  # don't hard-fail; just print if available

echo "[entrypoint] Launching app..."
echo "[entrypoint] Bot config: ${BOT_NAME:-Alpha} (${BOT_ID:-A}), Coordinator: ${IS_COORDINATOR:-true}"
# exec python3 run.py --name Bot --target village --output_path /output
# exec env DEBUG="minecraft-protocol" node senders.js 
exec node senders.js \
  --bot_name "${BOT_NAME:-Alpha}" \
  --bot_id "${BOT_ID:-A}" \
  --receiver_port "${RECEIVER_PORT:-8091}" \
  --is_coordinator "${IS_COORDINATOR:-true}" \
  --coord_port "${COORD_PORT:-9000}" 

