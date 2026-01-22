#!/bin/bash
set -eu

WIDTH=${WIDTH:-1280}
HEIGHT=${HEIGHT:-720}
FPS=${FPS:-20}
DISPLAY=${DISPLAY:-:99}
VNC_PASSWORD=${VNC_PASSWORD:-research}
VNC_PORT=${VNC_PORT:-5901}
NOVNC_PORT=${NOVNC_PORT:-6901}
ENABLE_RECORDING=${ENABLE_RECORDING:-1}
RECORDING_PATH=${RECORDING_PATH:-/output/camera_alpha.mkv}
JAVA_BIN=${JAVA_BIN:-/usr/lib/jvm/temurin-21-jre-amd64/bin/java}

# GPU rendering mode: "egl" (headless), "x11" (requires host X), or "auto"
GPU_MODE=${GPU_MODE:-egl}

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
echo "[client] GPU rendering mode: $GPU_MODE"

# Verify GPU is accessible
if command -v nvidia-smi >/dev/null 2>&1; then
  echo "[client] GPU status:"
  nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader || true
else
  echo "[client] warning: nvidia-smi not found, GPU may not be available"
fi

for dep in Xvfb fluxbox x11vnc websockify ffmpeg vglrun; do
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

# Start Xvfb with GLX extension
# Note: GLX is handled by VirtualGL which redirects to the GPU
Xvfb "$DISPLAY" -screen 0 "${WIDTH}x${HEIGHT}x24" +extension RANDR +extension GLX -ac &
PIDS="$PIDS $!"
sleep 2

export DISPLAY

# Configure VirtualGL display based on mode
case "$GPU_MODE" in
  egl)
    # Use EGL for headless GPU rendering (no X server needed on host)
    export VGL_DISPLAY=egl
    echo "[client] Using EGL headless GPU rendering"
    ;;
  x11)
    # Use host X server (requires X11 socket mounted and DISPLAY set correctly)
    export VGL_DISPLAY=${VGL_DISPLAY:-:0}
    echo "[client] Using X11 GPU rendering via VGL_DISPLAY=$VGL_DISPLAY"
    ;;
  auto)
    # Try EGL first, fall back to X11
    if [ -e "/dev/dri/renderD128" ]; then
      export VGL_DISPLAY=egl
      echo "[client] Auto-detected EGL support, using headless GPU"
    else
      export VGL_DISPLAY=${VGL_DISPLAY:-:0}
      echo "[client] Falling back to X11 GPU rendering"
    fi
    ;;
esac

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

# Launch Minecraft with VirtualGL for GPU-accelerated OpenGL
echo "[client] Launching Minecraft with VirtualGL (GPU acceleration)"
vglrun -d "$VGL_DISPLAY" python3 /app/launch_minecraft.py &
GAME_PID=$!
PIDS="$PIDS $GAME_PID"

if [ "$ENABLE_RECORDING" = "1" ]; then
  # Small delay so the Minecraft window stabilizes before capturing.
  sleep "${RECORDING_DELAY:-5}"
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
  "gpu_mode": "${GPU_MODE}",
  "note": "Frame index ~= round((wall_time_seconds - start_epoch_seconds) * fps)"
}
EOF
  echo "[client] recording metadata saved to ${RECORDING_META_PATH}"
  
  # Use GPU-accelerated encoding if available (NVENC)
  # NVENC_PRESET: p1-p7 (p1=fastest, p7=highest quality), default p4
  # NVENC_TUNE: hq for high quality, ll for low latency, ull for ultra low latency
  NVENC_PRESET="${NVENC_PRESET:-p4}"
  NVENC_TUNE="${NVENC_TUNE:-}"
  if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q h264_nvenc; then
    TUNE_OPTS=""
    if [ -n "$NVENC_TUNE" ]; then
      TUNE_OPTS="-tune $NVENC_TUNE"
    fi
    echo "[client] Using NVENC hardware encoding (MKV) - preset=$NVENC_PRESET tune=$NVENC_TUNE"
    ffmpeg -hide_banner -loglevel info -y \
      -video_size "${WIDTH}x${HEIGHT}" -framerate "$FPS" \
      -f x11grab -i "${DISPLAY}.0" \
      -c:v h264_nvenc -preset "$NVENC_PRESET" $TUNE_OPTS -pix_fmt yuv420p "$RECORDING_PATH" &
  else
    echo "[client] Using CPU encoding (libx264, MKV)"
    ffmpeg -hide_banner -loglevel info -y \
      -video_size "${WIDTH}x${HEIGHT}" -framerate "$FPS" \
      -f x11grab -i "${DISPLAY}.0" \
      -codec:v libx264 -preset veryfast -pix_fmt yuv420p "$RECORDING_PATH" &
  fi
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
