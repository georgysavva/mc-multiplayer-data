# Default output directory for processed videos
PROCESSED_OUTPUT_DIR=${PROCESSED_OUTPUT_DIR:-"/mnt/disks/storage/data/mc_multiplayer_v1/batch1/aligned"}
BATCH_NAME=${BATCH_NAME:-"batch1"}

python3 generate_compose.py \
 --compose_dir /home/ojm2030/mc-multiplayer-data/compose_configs \
 --base_port 25590 \
 --base_rcon_port 25600 \
 --receiver_port 8110 \
 --coord_port 8120 \
 --data_dir /mnt/disks/storage/data/mc_multiplayer_v1/$BATCH_NAME/data \
 --output_dir /mnt/disks/storage/data/mc_multiplayer_v1/$BATCH_NAME/output \
 --camera_output_alpha_base /mnt/disks/storage/data/mc_multiplayer_v1/$BATCH_NAME/camera/output_alpha \
 --camera_output_bravo_base /mnt/disks/storage/data/mc_multiplayer_v1/$BATCH_NAME/camera/output_bravo \
 --camera_data_alpha_base /mnt/disks/storage/data/mc_multiplayer_v1/$BATCH_NAME/camera/data_alpha \
 --camera_data_bravo_base /mnt/disks/storage/data/mc_multiplayer_v1/$BATCH_NAME/camera/data_bravo \
 --smoke_test 0 \
 --num_flatland_world 7 \
 --num_normal_world 7 \
 --num_episodes 100 \
 --iterations_num_per_episode 1 \
 --viewer_rendering_disabled 1

python3 orchestrate.py start --build
python3 orchestrate.py status
python3 orchestrate.py logs --tail 20
python3 orchestrate.py recordings
python3 orchestrate.py stop
python3 orchestrate.py postprocess --workers 16 --comparison-video --output-dir "/mnt/disks/storage/data/mc_multiplayer_v1/$BATCH_NAME/aligned"