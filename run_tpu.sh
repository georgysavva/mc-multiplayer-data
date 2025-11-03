# Default output directory for processed videos
BATCH_NAME="batch3"
BASE_DIR="/mnt/disks/storage/data/mc_multiplayer_v1/${BATCH_NAME}"
PROCESSED_OUTPUT_DIR="${BASE_DIR}/aligned"
echo $PROCESSED_OUTPUT_DIR

python3 generate_compose.py \
 --compose_dir /home/ojm2030/mc-multiplayer-data/compose_configs \
 --base_port 25590 \
 --base_rcon_port 25600 \
 --receiver_port 8110 \
 --coord_port 8120 \
 --data_dir ${BASE_DIR}/data \
 --output_dir ${BASE_DIR}/output \
 --camera_output_alpha_base ${BASE_DIR}/camera/output_alpha \
 --camera_output_bravo_base ${BASE_DIR}/camera/output_bravo \
 --camera_data_alpha_base ${BASE_DIR}/camera/data_alpha \
 --camera_data_bravo_base ${BASE_DIR}/camera/data_bravo \
 --smoke_test 0 \
 --num_flatland_world 5 \
 --num_normal_world 5 \
 --num_episodes 100 \
 --iterations_num_per_episode 1 \
 --viewer_rendering_disabled 1

sudo python3 orchestrate.py start --build --logs-dir ${BASE_DIR}/logs
# python3 orchestrate.py status
# python3 orchestrate.py logs --tail 20
# python3 orchestrate.py recordings
# python3 orchestrate.py stop
python3 orchestrate.py postprocess --workers 16 --comparison-video --output-dir ${BASE_DIR}/aligned"