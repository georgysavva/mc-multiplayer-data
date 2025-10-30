#!/usr/bin/env bash
set -uo pipefail  # Removed -e so script doesn't exit on first error

PROJECT_DIR=$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.yml"
LOG_DIR="${PROJECT_DIR}/logs"
PID_FILE="${LOG_DIR}/.log_pids"

# Services whose logs we want to capture for later analysis
LOG_SERVICES=(
  mc
  sender_alpha
  sender_bravo
  receiver_alpha
  receiver_bravo
  camera_alpha
  episode_starter
  camera_bravo
)

COMPOSE_BIN=()

ensure_requirements() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "[run] docker is required but not found in PATH" >&2
    exit 1
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_BIN=(docker-compose)
  elif docker compose version >/dev/null 2>&1; then
    COMPOSE_BIN=(docker compose)
  else
    echo "[run] docker compose plugin (or docker-compose) is required" >&2
    exit 1
  fi
}

compose_cmd() {
  "${COMPOSE_BIN[@]}" -f "${COMPOSE_FILE}" "$@"
}

ensure_directories() {
  mkdir -p \
    "${PROJECT_DIR}/output" \
    "${PROJECT_DIR}/camera/data_alpha" \
    "${PROJECT_DIR}/camera/data_bravo" \
    "${PROJECT_DIR}/camera/output_alpha" \
    "${PROJECT_DIR}/camera/output_bravo" \
    "${LOG_DIR}"
}

stop_log_capture() {
  if [[ -f "${PID_FILE}" ]]; then
    while IFS=: read -r pid service; do
      if [[ -n "${pid}" && $(ps -p "${pid}" -o pid= 2>/dev/null | tr -d ' ') == "${pid}" ]]; then
        kill "${pid}" >/dev/null 2>&1 || true
      fi
    done < "${PID_FILE}"
    rm -f "${PID_FILE}"
  fi
}

start_log_capture() {
  mkdir -p "${LOG_DIR}"
  stop_log_capture
  : > "${PID_FILE}"
  for service in "${LOG_SERVICES[@]}"; do
    local logfile="${LOG_DIR}/${service}.log"
    echo "[run] capturing logs for ${service} -> ${logfile}"
    nohup "${COMPOSE_BIN[@]}" -f "${COMPOSE_FILE}" logs --no-color --timestamps --follow "${service}" >"${logfile}" 2>&1 &
    local pid=$!
    echo "${pid}:${service}" >> "${PID_FILE}"
    # small delay to avoid overwhelming docker compose with concurrent log followers
    sleep 0.2
  done
}

cmd_up() {
  local generate_comparison=${1:-}
  ensure_directories
  local running_ids
  running_ids=$(compose_cmd ps -q 2>/dev/null || true)
  if [[ -n "${running_ids}" ]]; then
    echo "[run] existing stack detected; stopping it before restart"
    stop_log_capture
    compose_cmd down
  fi
  echo "[run] pulling images and starting stack"
  compose_cmd pull
  compose_cmd up -d
  start_log_capture
  echo "[run] stack started; log files under ${LOG_DIR}"
  echo "[run] VNC/noVNC alpha: http://localhost:6901 (pwd: ${VNC_PASSWORD:-research})"
  echo "[run] VNC/noVNC bravo: http://localhost:6902 (pwd: ${VNC_PASSWORD:-research})"
  echo "[run] waiting for sender services to finish"
  if "${COMPOSE_BIN[@]}" -f "${COMPOSE_FILE}" wait sender_alpha sender_bravo; then
    echo "[run] senders completed; shutting down stack"
  else
    echo "[run] sender wait failed; shutting down stack" >&2
  fi
  stop_log_capture
  compose_cmd down
  echo "[run] aligning camera recordings"
  
  local comparison_flag=""
  if [[ "${generate_comparison}" == "true" ]]; then
    comparison_flag="--comparison-video"
    echo "[run] comparison videos will be generated (slower)"
  fi
  
  if python3 "${PROJECT_DIR}/postprocess/process_recordings.py" \
    --bot Alpha \
    --actions-dir "${PROJECT_DIR}/output" \
    --camera-prefix "${PROJECT_DIR}/camera" \
    ${comparison_flag}; then
    echo "[run] Alpha processing completed successfully"
  else
    echo "[run] WARNING: Alpha processing failed (exit code $?)" >&2
  fi
  
  if python3 "${PROJECT_DIR}/postprocess/process_recordings.py" \
    --bot Bravo \
    --actions-dir "${PROJECT_DIR}/output" \
    --camera-prefix "${PROJECT_DIR}/camera" \
    ${comparison_flag}; then
    echo "[run] Bravo processing completed successfully"
  else
    echo "[run] WARNING: Bravo processing failed (exit code $?)" >&2
  fi
  
  echo "[run] post-processing complete (check output above for any warnings)"
}

cmd_down() {
  echo "[run] stopping log capture"
  stop_log_capture
  echo "[run] stopping stack"
  compose_cmd down
}

cmd_status() {
  compose_cmd ps
}

cmd_logs() {
  local service=${1:-}
  if [[ -z "${service}" ]]; then
    echo "[run] available log files:"
    ls -1 "${LOG_DIR}" 2>/dev/null || echo "  (none captured yet)"
    echo "[run] use '${0##*/} logs <service>' to tail a specific log file"
    return
  fi
  local logfile="${LOG_DIR}/${service}.log"
  if [[ ! -f "${logfile}" ]]; then
    echo "[run] log file not found for service '${service}'" >&2
    exit 1
  fi
  tail -n 50 -f "${logfile}"
}

cmd_recordings() {
  echo "[run] camera recordings:"
  find "${PROJECT_DIR}/camera" -maxdepth 2 -type f -name 'camera_*.mp4' -print 2>/dev/null || echo "  (no recordings yet)"
}

usage() {
  cat <<USAGE
Usage: ${0##*/} <command> [options]

Commands:
  up [--compare]    Start the docker stack and begin capturing logs
                    --compare: Generate side-by-side comparison videos (slower)
  down              Stop log capture and docker stack
  status            Show container status from docker compose
  logs [service]    Tail saved logs for a service (default: list available logs)
  recordings        List current camera recordings
USAGE
}

main() {
  ensure_requirements

  local cmd=${1:-up}
  shift || true

  case "${cmd}" in
    up)
      local generate_comparison="false"
      if [[ "${1:-}" == "--compare" ]]; then
        generate_comparison="true"
        shift
      fi
      cmd_up "${generate_comparison}" "$@"
      ;;
    down)
      cmd_down "$@"
      ;;
    status)
      cmd_status "$@"
      ;;
    logs)
      cmd_logs "$@"
      ;;
    recordings)
      cmd_recordings "$@"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
