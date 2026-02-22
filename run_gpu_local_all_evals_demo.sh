#!/bin/bash

# Base data directory configuration
BASE_DATA_DIR=${BASE_DATA_DIR:-"/mnt/data/dl3957/mc_multiplayer_v2_demo_evals"}

# ENABLE_DEMO_MODE=0 -> Camera position calculated algorithmically from bot positions
# ENABLE_DEMO_CAMERA=1 -> Enables CameraDemo spectator with algorithmic positioning
ENABLE_DEMO_MODE=0
ENABLE_DEMO_CAMERA=1

# List of eval episode types to run
EVAL_TYPES=("rotationEval" "translationEval" "structureEval" "turnToLookEval" "turnToLookOppositeEval" "bothLookAwayEval" "oneLooksAwayEval")

for BATCH_NAME in "${EVAL_TYPES[@]}"; do
    echo "=========================================="
    echo "Running eval: $BATCH_NAME"
    echo "=========================================="

    # Default: flat world
    NUM_FLATLAND_WORLD=1
    NUM_NORMAL_WORLD=0
    FLATLAND_WORLD_DISABLE_STRUCTURES=0

    # turnToLookEval and turnToLookOppositeEval use normal world
    if [ "$BATCH_NAME" == "turnToLookEval" ] || [ "$BATCH_NAME" == "turnToLookOppositeEval" ]; then
        NUM_FLATLAND_WORLD=0
        NUM_NORMAL_WORLD=1
    fi

    # Disable background structures for structureEval and structureNoPlaceEval
    if [ "$BATCH_NAME" == "structureEval" ] || [ "$BATCH_NAME" == "structureNoPlaceEval" ]; then
        FLATLAND_WORLD_DISABLE_STRUCTURES=1
    fi

    rm -r compose_configs

    python3 generate_compose.py \
        --compose_dir ./compose_configs \
        --base_port 25590 \
        --base_rcon_port 25600 \
        --receiver_port 8110 \
        --coord_port 8120 \
        --data_dir $BASE_DATA_DIR/$BATCH_NAME/data \
        --output_dir $BASE_DATA_DIR/$BATCH_NAME/output \
        --camera_output_alpha_base $BASE_DATA_DIR/$BATCH_NAME/camera/output_alpha \
        --camera_output_bravo_base $BASE_DATA_DIR/$BATCH_NAME/camera/output_bravo \
        --camera_data_alpha_base $BASE_DATA_DIR/$BATCH_NAME/camera/data_alpha \
        --camera_data_bravo_base $BASE_DATA_DIR/$BATCH_NAME/camera/data_bravo \
        --smoke_test 0 \
        --num_flatland_world $NUM_FLATLAND_WORLD \
        --num_normal_world $NUM_NORMAL_WORLD \
        --num_episodes 16 \
        --num_episodes_normal 16 \
        --num_episodes_flat 16 \
        --episode_types_flat "$BATCH_NAME" \
        --episode_types_normal "$BATCH_NAME" \
        --iterations_num_per_episode 1 \
        --eval_time_set_day 1 \
        --viewer_rendering_disabled 1 \
        --enable_gpu 1 \
        --gpu_count 1 \
        --gpu_mode egl \
        --enable_demo_mode $ENABLE_DEMO_MODE \
        --enable_demo_camera $ENABLE_DEMO_CAMERA \
        --camera_output_demo_base $BASE_DATA_DIR/$BATCH_NAME/camera/output_demo \
        --camera_data_demo_base $BASE_DATA_DIR/$BATCH_NAME/camera/data_demo \
        --flatland_world_disable_structures $FLATLAND_WORLD_DISABLE_STRUCTURES

    python3 orchestrate.py start --build --logs-dir "$BASE_DATA_DIR/$BATCH_NAME/logs"
    python3 orchestrate.py status --logs-dir "$BASE_DATA_DIR/$BATCH_NAME/logs"
    python3 orchestrate.py logs --tail 20 --logs-dir "$BASE_DATA_DIR/$BATCH_NAME/logs"
    python3 orchestrate.py recordings
    python3 orchestrate.py stop
    python3 orchestrate.py postprocess --workers 32 --output-dir "$BASE_DATA_DIR/$BATCH_NAME/aligned"

    echo ""
    echo "Completed eval: $BATCH_NAME"
    echo ""
done

echo "=========================================="
echo "All demo eval episodes completed!"
echo "=========================================="
