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
# exec python3 run.py --name Bot --target village --output_path /output
exec node senders.js 

