#!/bin/bash
# Smoke test for the coMovement* episode types.
#
# Pass the episode type as $1 (default coMovementEval); any of
# coMovementEval, coMovementWithDividerEval,
# coMovementAlwaysRelativeMotionEval,
# coMovementWithDividerAlwaysRelativeMotionEval works.
#
# NOTE: this script deliberately does NOT use orchestrate.py start/stop.
# orchestrate.py derives the docker compose project name from the compose file
# stem ("docker-compose-000"), and another user's data-collection stack is
# already running on this machine under that exact project name. We drive
# docker compose directly with a unique -p to stay isolated from it.
set -euo pipefail

PROJECT_ROOT=$(pwd)
EPISODE_TYPE=${1:-coMovementEval}
SMOKE_DIR=${SMOKE_DIR:-$PROJECT_ROOT/smoke_co_movement}
NUM_EPISODES=${NUM_EPISODES:-4}
COMPOSE_PROJECT=co-movement-smoke
COMPOSE_FILE=$PROJECT_ROOT/compose_configs/docker-compose-000.yml
# GPU 0 is busy with another job; use an idle GPU for the camera containers.
GPU_DEVICE=${GPU_DEVICE:-2}

mkdir -p "$SMOKE_DIR"
rm -rf "$PROJECT_ROOT/compose_configs"

python3 "$PROJECT_ROOT/generate_compose.py" \
 --compose_dir "$PROJECT_ROOT/compose_configs" \
 --base_port 27590 \
 --base_rcon_port 27600 \
 --receiver_port 9310 \
 --coord_port 9320 \
 --camera_alpha_vnc_base 5401 \
 --camera_alpha_novnc_base 6401 \
 --camera_bravo_vnc_base 5402 \
 --camera_bravo_novnc_base 6402 \
 --display_base 90 \
 --data_dir "$SMOKE_DIR/data" \
 --output_dir "$SMOKE_DIR/output" \
 --camera_output_alpha_base "$SMOKE_DIR/camera/output_alpha" \
 --camera_output_bravo_base "$SMOKE_DIR/camera/output_bravo" \
 --camera_data_alpha_base "$SMOKE_DIR/camera/data_alpha" \
 --camera_data_bravo_base "$SMOKE_DIR/camera/data_bravo" \
 --smoke_test 0 \
 --num_flatland_world 1 \
 --num_normal_world 0 \
 --num_episodes $NUM_EPISODES \
 --episode_types "$EPISODE_TYPE" \
 --iterations_num_per_episode 1 \
 --viewer_rendering_disabled 1 \
 --enable_gpu 1 \
 --gpu_count 1 \
 --gpu_mode egl \
 --disable_nvenc 1 \
 --eval_time_set_day 1

# generate_compose always assigns instance 0 to GPU 0; repoint to an idle GPU
sed -i "s/NVIDIA_VISIBLE_DEVICES: .*/NVIDIA_VISIBLE_DEVICES: \"$GPU_DEVICE\"/" "$COMPOSE_FILE"

docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d --build

echo "Started. Follow senders with:"
echo "  docker compose -p $COMPOSE_PROJECT -f $COMPOSE_FILE logs -f sender_alpha_instance_0 sender_bravo_instance_0"
echo "Tear down with:"
echo "  docker compose -p $COMPOSE_PROJECT -f $COMPOSE_FILE down -v"
