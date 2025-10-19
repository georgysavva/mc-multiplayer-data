#!/bin/sh
set -eu

WIDTH=${WIDTH:-1280}
HEIGHT=${HEIGHT:-720}
FPS=${FPS:-20}
DISPLAY=${DISPLAY:-:99}
VNC_PASSWORD=${VNC_PASSWORD:-research}
VNC_PORT=${VNC_PORT:-5901}
NOVNC_PORT=${NOVNC_PORT:-6901}
ENABLE_RECORDING=${ENABLE_RECORDING:-1}
RECORDING_PATH=${RECORDING_PATH:-/output/camera_alpha.mp4}
JAVA_BIN=${JAVA_BIN:-/usr/lib/jvm/java-17-openjdk-amd64/bin/java}

if [ ! -x "$JAVA_BIN" ]; then
  echo "[client] java runtime not found at $JAVA_BIN" >&2
  exit 1
fi

export JAVA_BIN

mkdir -p "$(dirname "$RECORDING_PATH")"
rm -f "/tmp/.X${DISPLAY#*:}-lock" 2>/dev/null || true
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/tmp}

echo "[client] DISPLAY=$DISPLAY resolution=${WIDTH}x${HEIGHT}"
echo "[client] noVNC: http://localhost:${NOVNC_PORT} (password $VNC_PASSWORD)"

for dep in Xvfb fluxbox x11vnc websockify ffmpeg; do
  if ! command -v "$dep" >/dev/null 2>&1; then
    echo "[client] missing required binary: $dep" >&2
    exit 1
  fi
done

cleanup() {
  for pid in $PIDS; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup INT TERM EXIT

PIDS=""

Xvfb "$DISPLAY" -screen 0 "${WIDTH}x${HEIGHT}x24" +extension RANDR +extension GLX -ac &
PIDS="$PIDS $!"
sleep 2

export DISPLAY
FLUXBOX_DIR="${HOME:-/root}/.fluxbox"
INIT_FILE="${FLUXBOX_DIR}/init"
mkdir -p "$FLUXBOX_DIR"
if [ -f "$INIT_FILE" ]; then
  if grep -q '^session.screen0.toolbar.visible:' "$INIT_FILE"; then
    sed -i 's/^session\.screen0\.toolbar\.visible:.*/session.screen0.toolbar.visible:        false/' "$INIT_FILE"
  else
    printf '\nsession.screen0.toolbar.visible:        false\n' >>"$INIT_FILE"
  fi
else
  cat >"$INIT_FILE" <<'EOF'
session.screen0.toolbar.visible:        false
EOF
fi

fluxbox &
PIDS="$PIDS $!"

toolbar_hidden=0
for i in $(seq 1 20); do
  if fluxbox-remote "settoolbar hidden" >/dev/null 2>&1; then
    echo "[client] fluxbox toolbar hidden"
    toolbar_hidden=1
    break
  fi
  sleep 0.5
done

if [ "$toolbar_hidden" -eq 0 ]; then
  echo "[client] warning: unable to hide fluxbox toolbar" >&2
fi

x11vnc -display "$DISPLAY" -forever -noshm -shared -rfbport "$VNC_PORT" -passwd "$VNC_PASSWORD" -o /tmp/x11vnc.log &
PIDS="$PIDS $!"

websockify --web=/usr/share/novnc/ "$NOVNC_PORT" localhost:"$VNC_PORT" &
PIDS="$PIDS $!"

python3 /app/launch_minecraft.py &
GAME_PID=$!
PIDS="$PIDS $GAME_PID"

if [ "$ENABLE_RECORDING" = "1" ]; then
  RECORDING_META_PATH=${RECORDING_META_PATH:-${RECORDING_PATH%.*}_meta.json}
  RECORDING_START_TS=$(date +%s.%N)
  RECORDING_START_ISO=$(date -u +"%Y-%m-%dT%H:%M:%S.%NZ")
  cat >"${RECORDING_META_PATH}" <<EOF
{
  "recording_path": "${RECORDING_PATH}",
  "start_epoch_seconds": ${RECORDING_START_TS},
  "start_time_utc": "${RECORDING_START_ISO}",
  "fps": ${FPS},
  "width": ${WIDTH},
  "height": ${HEIGHT},
  "display": "${DISPLAY}",
  "camera_name": "${CAMERA_NAME:-}",
  "note": "Frame index ~= round((wall_time_seconds - start_epoch_seconds) * fps)"
}
EOF
  echo "[client] recording metadata saved to ${RECORDING_META_PATH}"
  ffmpeg -hide_banner -loglevel info -y \
    -video_size "${WIDTH}x${HEIGHT}" -framerate "$FPS" \
    -f x11grab -i "${DISPLAY}.0" \
    -codec:v libx264 -preset veryfast -pix_fmt yuv420p "$RECORDING_PATH" &
  FFMPEG_PID=$!
  PIDS="$PIDS $FFMPEG_PID"
else
  FFMPEG_PID=""
fi

wait "$GAME_PID"

if [ -n "$FFMPEG_PID" ]; then
  kill "$FFMPEG_PID" 2>/dev/null || true
  wait "$FFMPEG_PID" 2>/dev/null || true
fi

cleanup
trap - INT TERM EXIT
