#!/usr/bin/env bash
set -euo pipefail

DISPLAY=${DISPLAY:-:99}
export DISPLAY
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/tmp}

rm -f "/tmp/.X${DISPLAY##*:}-lock" 2>/dev/null || true

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
  --receiver_host "${RECEIVER_HOST:-127.0.0.1}" \
  --receiver_port "${RECEIVER_PORT:-8091}" \
  --coord_port "${COORD_PORT:-8093}" \
  --other_coord_host "${OTHER_COORD_HOST:-127.0.0.1}" \
  --other_coord_port "${OTHER_COORD_PORT:-8094}" \
  --bot_rng_seed "${BOT_RNG_SEED:-}" \
  --episodes_num "${EPISODES_NUM:-1}" \
  --start_episode_id "${EPISODE_START_ID:-0}" \
  --episode_category "${EPISODE_CATEGORY:-look}" \
  --host "${MC_HOST:-127.0.0.1}" \
  --port "${MC_PORT:-25565}" \
  --rcon_host "${RCON_HOST:-127.0.0.1}" \
  --rcon_port "${RCON_PORT:-25575}" \
  --color "${COLOR:-red}" \
  --bootstrap_wait_time "${BOOTSTRAP_WAIT_TIME:-0}" \
  --min_run_actions "${MIN_RUN_ACTIONS:-3}" \
  --max_run_actions "${MAX_RUN_ACTIONS:-5}" \
  --iterations_num_per_episode "${ITERATIONS_NUM_PER_EPISODE:-3}" \
  --mc_version "${MC_VERSION:-1.20.4}"
