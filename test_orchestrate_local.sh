# get pwd for project root
PROJECT_ROOT=$(pwd)
python3 $PROJECT_ROOT/generate_compose.py --instances 2 \
 --compose_dir $PROJECT_ROOT/compose_configs \
 --base_port 25590 \
 --base_rcon_port 25600 \
 --receiver_port 8110 \
 --coord_port 8120 \
 --data_dir $PROJECT_ROOT/data \
 --output_dir $PROJECT_ROOT/output \
 --camera_output_alpha_base $PROJECT_ROOT/camera/output_alpha \
 --camera_output_bravo_base $PROJECT_ROOT/camera/output_bravo \
 --camera_data_alpha_base $PROJECT_ROOT/camera/data_alpha \
 --camera_data_bravo_base $PROJECT_ROOT/camera/data_bravo \
 --smoke_test 0 \
 --num_flatland_world 1 \
 --num_normal_world 2 \
 --num_episodes 2 \
 --iterations_num_per_episode 1 \
 --viewer_rendering_disabled 0

 
# Start instances - add --build to build images locally instead of pulling from Docker Hub
python3 $PROJECT_ROOT/orchestrate.py start --build
python3 $PROJECT_ROOT/orchestrate.py status
python3 $PROJECT_ROOT/orchestrate.py logs --tail 20
python3 $PROJECT_ROOT/orchestrate.py recordings
python3 $PROJECT_ROOT/orchestrate.py stop
python3 $PROJECT_ROOT/orchestrate.py postprocess --workers 16 --comparison-video --output-dir $PROJECT_ROOT/output_batched/mc_multiplayer_v1/batch1/aligned
