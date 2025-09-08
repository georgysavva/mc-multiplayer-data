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
echo "[entrypoint] Bot config: ${BOT_NAME:-Alpha} <-> ${OTHER_BOT_NAME:-Bravo}, Ports: ${COORD_PORT:-8093}/${OTHER_COORD_PORT:-8094}"
# exec node senders_simple.js 
exec node senders.js \
  --bot_name "${BOT_NAME:-Alpha}" \
  --other_bot_name "${OTHER_BOT_NAME:-Bravo}" \
  --receiver_port "${RECEIVER_PORT:-8091}" \
  --coord_port "${COORD_PORT:-8093}" \
  --other_coord_port "${OTHER_COORD_PORT:-8094}" \
  --bot_rng_seed "${BOT_RNG_SEED:-}" \
  --episodes_num "${EPISODES_NUM:-1}" 

