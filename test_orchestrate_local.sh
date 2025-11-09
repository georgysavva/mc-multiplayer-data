# get pwd for project root
PROJECT_ROOT=$(pwd)
python3 $PROJECT_ROOT/generate_compose.py --instances 2 \
 --compose_dir $PROJECT_ROOT/compose_configs \
 --base_port 26590 \
 --base_rcon_port 26600 \
 --receiver_port 8210 \
 --coord_port 8220 \
 --data_dir $PROJECT_ROOT/data \
 --output_dir $PROJECT_ROOT/output \
 --camera_output_alpha_base $PROJECT_ROOT/camera/output_alpha \
 --camera_output_bravo_base $PROJECT_ROOT/camera/output_bravo \
 --camera_data_alpha_base $PROJECT_ROOT/camera/data_alpha \
 --camera_data_bravo_base $PROJECT_ROOT/camera/data_bravo \
 --smoke_test 0 \
 --num_flatland_world 2 \
 --num_normal_world 0 \
 --num_episodes 10 \
 --episode_types lookAwayEval \
 --iterations_num_per_episode 1 \
 --viewer_rendering_disabled 1

 
# Start instances - add --build to build images locally instead of pulling from Docker Hub
python3 $PROJECT_ROOT/orchestrate.py start --build
python3 $PROJECT_ROOT/orchestrate.py status
python3 $PROJECT_ROOT/orchestrate.py logs --tail 20
python3 $PROJECT_ROOT/orchestrate.py recordings
python3 $PROJECT_ROOT/orchestrate.py stop
python3 $PROJECT_ROOT/orchestrate.py postprocess --workers 16 --output-dir $PROJECT_ROOT/output_batched/mc_multiplayer_eval
sudo chown -R $USER:$USER $PROJECT_ROOT/output $PROJECT_ROOT/camera/output_alpha $PROJECT_ROOT/camera/output_bravo $PROJECT_ROOT/camera/data_alpha $PROJECT_ROOT/camera/data_bravo