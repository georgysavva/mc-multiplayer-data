# Base data directory and batch configuration
BASE_DATA_DIR=${BASE_DATA_DIR:-"output2"}
BASE_DATA_COLLECTION_DIR=$BASE_DATA_DIR/data_collection/train
for i in {0..1}; do
    BATCH_NAME="batch_$i"

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
    --num_flatland_world 1 \
    --num_normal_world 1 \
    --num_episodes 2 \
    --eval_time_set_day 0 \
    --viewer_rendering_disabled 1 \
    --gpu_mode egl

    python3 orchestrate.py start --build --logs-dir "$BASE_DATA_COLLECTION_DIR/$BATCH_NAME/logs"
    python3 orchestrate.py status --logs-dir "$BASE_DATA_COLLECTION_DIR/$BATCH_NAME/logs"
    python3 orchestrate.py logs --tail 20 --logs-dir "$BASE_DATA_COLLECTION_DIR/$BATCH_NAME/logs"
    python3 orchestrate.py stop
    python3 orchestrate.py postprocess --workers 32 --comparison-video --output-dir "$BASE_DATA_COLLECTION_DIR/$BATCH_NAME/aligned"
done
DATASET_NAME="duet"
echo "Preparing train dataset"
python3 postprocess/prepare_train_dataset.py --source-dir $BASE_DATA_COLLECTION_DIR --destination-dir $BASE_DATA_DIR/result_data/$DATASET_NAME

echo "Splitting train dataset"
python3 postprocess/split_train_test.py $BASE_DATA_DIR/result_data/$DATASET_NAME 

echo "Annotating some of the test split videos"

python3 postprocess/annotate_video_batch.py $BASE_DATA_DIR/result_data/duet 
