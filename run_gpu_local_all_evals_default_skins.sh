#!/bin/bash
# Full eval suite using Minecraft's two vanilla default skins (Steve on Alpha,
# Alex on Bravo) instead of the custom technoblade/test skins, and the longer
# look-away hold for the two look-away eval types.
#
# NOTE: this deliberately does not reuse ./compose_configs or the default ports.
# orchestrate.py derives the docker compose project name from the compose file
# stem, and another user's data-collection stack is already running on this
# machine as "docker-compose-000". Generating into a private directory with a
# "docker-compose-dskin-NNN" stem keeps both the project name and the host ports
# clear of it, while still matching orchestrate.py's docker-compose-*.yml glob
# and its instance-index parsing (stem.split("-")[-1]).
set -euo pipefail

PROJECT_ROOT=$(pwd)
BASE_DATA_DIR=${BASE_DATA_DIR:-"/home/fred/mc_multiplayer_eval_default_skins"}
COMPOSE_DIR=${COMPOSE_DIR:-"$PROJECT_ROOT/compose_configs_default_skins"}
# Compose-file stem -> docker compose project name. Must not collide with any
# other stack on this host, or with a concurrent run of this script.
COMPOSE_STEM=${COMPOSE_STEM:-"dskin"}
# GPU 0 is busy with another user's job; pick an idle one.
GPU_DEVICE=${GPU_DEVICE:-2}
# Set time to "day" at the beginning of all eval episodes
EVAL_TIME_SET_DAY=${EVAL_TIME_SET_DAY:-1}
# Vanilla default skins: Steve (classic) for Alpha, Alex (slim) for Bravo.
PLAYER_SKINS=${PLAYER_SKINS:-"steve.png,alex.png"}
# "Long" look-away hold: 80 ticks = 4.0s, vs the standard 60 ticks = 3.0s.
LOOK_AWAY_FREEZE_TICKS=${LOOK_AWAY_FREEZE_TICKS:-80}

# The camera containers install ~1GB of Minecraft per camera. Sharing one data
# dir across eval types downloads it once instead of per type — on a disk this
# full that is the difference between finishing and running out of space.
SHARED_CAMERA_DATA=${SHARED_CAMERA_DATA:-"$BASE_DATA_DIR/_camera_data"}

EVAL_TYPES=("rotationEval" "translationEval" "structureEval" "structureNoPlaceEval" "turnToLookEval" "turnToLookOppositeEval" "bothLookAwayEval" "oneLooksAwayEval" "coMovementEval" "coMovementWithDividerEval")

if [[ $# -gt 0 ]]; then
  EVAL_TYPES=("$@")
fi

echo "Output dir:  $BASE_DATA_DIR"
echo "GPU:         $GPU_DEVICE"
echo "Skins:       $PLAYER_SKINS"
echo "Freeze:      $LOOK_AWAY_FREEZE_TICKS ticks"
echo "Eval types:  ${EVAL_TYPES[*]}"
AVAIL_GB=$(df -BG --output=avail "$(dirname "$BASE_DATA_DIR")" | tail -1 | tr -dc '0-9')
echo "Disk free:   ${AVAIL_GB}G"
if [ "$AVAIL_GB" -lt 8 ]; then
  echo "ERROR: under 8G free; the run will fail partway. Free space first." >&2
  exit 1
fi

for BATCH_NAME in "${EVAL_TYPES[@]}"; do
    echo "=========================================="
    echo "Running eval: $BATCH_NAME"
    echo "=========================================="

    # Re-check per type: the disk on this box is nearly full, and a mid-run
    # ENOSPC corrupts the batch instead of failing cleanly.
    AVAIL_GB=$(df -BG --output=avail "$(dirname "$BASE_DATA_DIR")" | tail -1 | tr -dc '0-9')
    if [ "$AVAIL_GB" -lt 4 ]; then
      echo "ERROR: only ${AVAIL_GB}G free before $BATCH_NAME; stopping to avoid a corrupt batch." >&2
      exit 1
    fi

    NUM_FLATLAND_WORLD=2
    NUM_NORMAL_WORLD=0
    NUM_EPISODES=16
    FLATLAND_WORLD_DISABLE_STRUCTURES=0

    # turnToLook{,Opposite}Eval: 1 normal-world instance with the fixed seed
    if [ "$BATCH_NAME" == "turnToLookEval" ] || [ "$BATCH_NAME" == "turnToLookOppositeEval" ]; then
        NUM_FLATLAND_WORLD=0
        NUM_NORMAL_WORLD=1
        NUM_EPISODES=32
    fi

    # Structure and co-movement evals: drop background structures so they don't
    # confuse the scene
    if [ "$BATCH_NAME" == "structureEval" ] || [ "$BATCH_NAME" == "structureNoPlaceEval" ] || [[ "$BATCH_NAME" == coMovement* ]]; then
        FLATLAND_WORLD_DISABLE_STRUCTURES=1
    fi

    # Co-movement evals: 16 episodes x 2 instances = 64 videos per type, the same
    # per-type size as the existing eval set. The 8-case types enumerate all
    # 8 movement cases x 4 line-up orientations exactly once (the handler offsets
    # orientation by instance id); the 4-case "AlwaysRelativeMotion" types cover
    # their 4 x 4 = 16 combinations once per instance, i.e. twice overall.
    if [[ "$BATCH_NAME" == coMovement* ]]; then
        NUM_EPISODES=16
    fi

    BATCH_DIR="$BASE_DATA_DIR/$BATCH_NAME"
    rm -rf "$COMPOSE_DIR"

    python3 generate_compose.py \
        --compose_dir "$COMPOSE_DIR" \
        --base_port 26590 \
        --base_rcon_port 26600 \
        --receiver_port 9510 \
        --coord_port 9520 \
        --camera_alpha_vnc_base 5601 \
        --camera_alpha_novnc_base 6601 \
        --camera_bravo_vnc_base 5602 \
        --camera_bravo_novnc_base 6602 \
        --display_base 80 \
        --data_dir "$BATCH_DIR/data" \
        --output_dir "$BATCH_DIR/output" \
        --camera_output_alpha_base "$BATCH_DIR/camera/output_alpha" \
        --camera_output_bravo_base "$BATCH_DIR/camera/output_bravo" \
        --camera_data_alpha_base "$SHARED_CAMERA_DATA/data_alpha" \
        --camera_data_bravo_base "$SHARED_CAMERA_DATA/data_bravo" \
        --smoke_test 0 \
        --num_flatland_world $NUM_FLATLAND_WORLD \
        --num_normal_world $NUM_NORMAL_WORLD \
        --num_episodes $NUM_EPISODES \
        --episode_types "$BATCH_NAME" \
        --iterations_num_per_episode 1 \
        --viewer_rendering_disabled 1 \
        --enable_gpu 1 \
        --gpu_count 1 \
        --gpu_device_id "$GPU_DEVICE" \
        --gpu_mode egl \
        --disable_nvenc 1 \
        --player_skins "$PLAYER_SKINS" \
        --eval_look_away_freeze_ticks "$LOOK_AWAY_FREEZE_TICKS" \
        --eval_time_set_day $EVAL_TIME_SET_DAY \
        --flatland_world_disable_structures $FLATLAND_WORLD_DISABLE_STRUCTURES

    # Give the compose files a private stem so the project name cannot collide
    # with the "docker-compose-000" stack another user is running.
    for f in "$COMPOSE_DIR"/docker-compose-*.yml; do
        mv "$f" "$COMPOSE_DIR/docker-compose-$COMPOSE_STEM-$(basename "$f" .yml | sed 's/.*-//').yml"
    done

    python3 orchestrate.py start --build --compose-dir "$COMPOSE_DIR" --logs-dir "$BATCH_DIR/logs"
    python3 orchestrate.py status --compose-dir "$COMPOSE_DIR" --logs-dir "$BATCH_DIR/logs"
    python3 orchestrate.py logs --compose-dir "$COMPOSE_DIR" --tail 20 --logs-dir "$BATCH_DIR/logs"
    python3 orchestrate.py stop --compose-dir "$COMPOSE_DIR"
    # Docker writes as root; hand ownership back so postprocessing and re-runs work
    docker run --rm -v "$BATCH_DIR:/workspace" alpine chown -R "$(id -u):$(id -g)" /workspace
    python3 orchestrate.py postprocess --compose-dir "$COMPOSE_DIR" --workers 32 --output-dir "$BATCH_DIR/aligned"

    # Keep only the NAS copy. This box has well under 10G free on /, so holding
    # every batch locally does not fit; mirror each batch as soon as it is done,
    # verify byte-for-byte, then drop the local copy. Package from the NAS path.
    if [ -n "${NAS_DEST:-}" ]; then
        echo "Mirroring $BATCH_NAME to $NAS_DEST/$BATCH_NAME"
        mkdir -p "$NAS_DEST/$BATCH_NAME"
        # -rlptD, not -a: the NAS export squashes group/owner changes, so the -g
        # and -o that -a implies make every chgrp fail and rsync exit 23 even
        # though all file data transferred. The byte comparison below is what
        # actually gates the local delete, so tolerate a non-zero exit here.
        rsync -rlptD "$BATCH_DIR/" "$NAS_DEST/$BATCH_NAME/" || \
            echo "WARNING: rsync exited $?; falling back to the byte check"
        LOCAL_BYTES=$(find "$BATCH_DIR" -type f -printf '%s\n' | paste -sd+ | bc)
        NAS_BYTES=$(find "$NAS_DEST/$BATCH_NAME" -type f -printf '%s\n' | paste -sd+ | bc)
        if [ "$LOCAL_BYTES" == "$NAS_BYTES" ]; then
            echo "NAS copy verified ($LOCAL_BYTES bytes); removing local $BATCH_DIR"
            rm -rf "$BATCH_DIR"
        else
            echo "ERROR: NAS copy of $BATCH_NAME is $NAS_BYTES bytes, local is $LOCAL_BYTES; keeping local copy." >&2
            exit 1
        fi
    fi

    echo ""
    echo "Completed eval: $BATCH_NAME"
    echo ""
done

echo "=========================================="
echo "All eval episodes completed!"
echo "=========================================="
