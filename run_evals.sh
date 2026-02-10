#!/bin/bash

# Base data directory configuration
BASE_DATA_DIR=${BASE_DATA_DIR:-"output2"}
BASE_DATA_COLLECTION_DIR=$BASE_DATA_DIR/data_collection/eval
# Set time to "day" at beginning of all eval episodes
EVAL_TIME_SET_DAY=${EVAL_TIME_SET_DAY:-1}

# List of eval episode types to run
# structureNoPlaceEval is used for debugging, but not part of the eval dataset
EVAL_TYPES=("rotationEval" "translationEval" "structureEval" "turnToLookEval" "turnToLookOppositeEval" "bothLookAwayEval" "oneLooksAwayEval")

for BATCH_NAME in "${EVAL_TYPES[@]}"; do
    echo "=========================================="
    echo "Running eval: $BATCH_NAME"
    echo "=========================================="

    # Set default config values
    NUM_FLATLAND_WORLD=2
    NUM_NORMAL_WORLD=0
    NUM_EPISODES=16

    # Override config for turnToLookEval and turnToLookOppositeEval: use 1 normal worldinstance with fixed seed
    if [ "$BATCH_NAME" == "turnToLookEval" ] || [ "$BATCH_NAME" == "turnToLookOppositeEval" ]; then
        NUM_FLATLAND_WORLD=0
        NUM_NORMAL_WORLD=1
        NUM_EPISODES=32
    fi

    [ -d compose_configs ] && rm -r compose_configs

    python3 generate_compose.py \
        --compose_dir ./compose_configs \
        --base_port 25590 \
        --base_rcon_port 25600 \
        --act_recorder_port 8110 \
        --coord_port 8120 \
        --data_dir $BASE_DATA_COLLECTION_DIR/$BATCH_NAME/data \
        --output_dir $BASE_DATA_COLLECTION_DIR/$BATCH_NAME/output \
        --camera_output_alpha_base $BASE_DATA_COLLECTION_DIR/$BATCH_NAME/camera/output_alpha \
        --camera_output_bravo_base $BASE_DATA_COLLECTION_DIR/$BATCH_NAME/camera/output_bravo \
        --camera_data_alpha_base $BASE_DATA_COLLECTION_DIR/$BATCH_NAME/camera/data_alpha \
        --camera_data_bravo_base $BASE_DATA_COLLECTION_DIR/$BATCH_NAME/camera/data_bravo \
        --smoke_test 0 \
        --num_flatland_world $NUM_FLATLAND_WORLD \
        --num_normal_world $NUM_NORMAL_WORLD \
        --num_episodes $NUM_EPISODES \
        --episode_types $BATCH_NAME \
        --viewer_rendering_disabled 1 \
        --gpu_mode egl \
        --eval_time_set_day $EVAL_TIME_SET_DAY #\
        #--flatland_world_disable_structures 1  # This is manually enabled for only structureEval to avoid confusing background structures 

    python3 orchestrate.py start --build --logs-dir "$BASE_DATA_COLLECTION_DIR/$BATCH_NAME/logs"
    python3 orchestrate.py status --logs-dir "$BASE_DATA_COLLECTION_DIR/$BATCH_NAME/logs"
    python3 orchestrate.py logs --tail 20 --logs-dir "$BASE_DATA_COLLECTION_DIR/$BATCH_NAME/logs"
    python3 orchestrate.py stop
    python3 orchestrate.py postprocess --workers 32 --comparison-video --output-dir "$BASE_DATA_COLLECTION_DIR/$BATCH_NAME/aligned"

    echo ""
    echo "Completed eval: $BATCH_NAME"
    echo ""
done

echo "=========================================="
echo "All eval episodes completed!"
echo "=========================================="

python3 postprocess/prepare_eval_datasets.py --source-dir $BASE_DATA_COLLECTION_DIR --destination-dir $BASE_DATA_DIR/result_data/eval


echo "Annotating some of the videos"

python3 postprocess/annotate_video_batch.py $BASE_DATA_DIR/result_data/eval 