# Base data directory and batch configuration
BASE_DATA_DIR=${BASE_DATA_DIR:-"/mnt/data/dl3957/mc_multiplayer_v2_demo_evals"}
BATCH_NAME="turnToLookEval_new_mirror"

# ENABLE_DEMO_MODE=0 -> Camera position calculated algorithmically from bot positions
# ENABLE_DEMO_CAMERA=1 -> Enables CameraDemo spectator with algorithmic positioning
ENABLE_DEMO_MODE=0
ENABLE_DEMO_CAMERA=1

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
 --num_flatland_world 0 \
 --num_normal_world 1 \
 --num_episodes 8 \
 --num_episodes_normal 8 \
 --num_episodes_flat 8 \
 --episode_types_flat "" \
 --episode_types_normal "turnToLookEval" \
 --iterations_num_per_episode 1 \
 --eval_time_set_day 1 \
 --viewer_rendering_disabled 1 \
 --enable_gpu 1 \
 --gpu_count 1 \
 --gpu_mode egl \
 --enable_demo_mode $ENABLE_DEMO_MODE \
 --enable_demo_camera $ENABLE_DEMO_CAMERA \
 --camera_output_demo_base $BASE_DATA_DIR/$BATCH_NAME/camera/output_demo \
 --camera_data_demo_base $BASE_DATA_DIR/$BATCH_NAME/camera/data_demo

python3 orchestrate.py start --build --logs-dir "$BASE_DATA_DIR/$BATCH_NAME/logs"
python3 orchestrate.py status --logs-dir "$BASE_DATA_DIR/$BATCH_NAME/logs"
python3 orchestrate.py logs --tail 20 --logs-dir "$BASE_DATA_DIR/$BATCH_NAME/logs"
python3 orchestrate.py recordings
python3 orchestrate.py stop
python3 orchestrate.py postprocess --workers 32 --output-dir "$BASE_DATA_DIR/$BATCH_NAME/aligned"