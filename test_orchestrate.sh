python3 /home/oscar/mc-multiplayer-data/generate_compose.py --instances 2 \
 --compose_dir /home/oscar/mc-multiplayer-data/compose_configs \
 --base_port 25590 \
 --base_rcon_port 25600 \
 --receiver_port 8110 \
 --coord_port 8120 \
 --data_dir /home/oscar/mc-multiplayer-data/data \
 --output_dir /home/oscar/mc-multiplayer-data/output \
 --camera_output_alpha_base /home/oscar/mc-multiplayer-data/camera/output_alpha \
 --camera_output_bravo_base /home/oscar/mc-multiplayer-data/camera/output_bravo \
 --camera_data_alpha_base /home/oscar/mc-multiplayer-data/camera/data_alpha \
 --camera_data_bravo_base /home/oscar/mc-multiplayer-data/camera/data_bravo \
 --smoke_test 0 \
 --num_flatland_world 0 \
 --num_normal_world 4 \
 --num_episodes 2 \
 --iterations_num_per_episode 1 \
 --viewer_rendering_disabled 0

 
# Start instances - add --build to build images locally instead of pulling from Docker Hub
python3 /home/oscar/mc-multiplayer-data/orchestrate.py start --build
python3 /home/oscar/mc-multiplayer-data/orchestrate.py status
python3 /home/oscar/mc-multiplayer-data/orchestrate.py logs --tail 20
python3 /home/oscar/mc-multiplayer-data/orchestrate.py recordings
python3 /home/oscar/mc-multiplayer-data/orchestrate.py stop
python3 /home/oscar/mc-multiplayer-data/orchestrate.py postprocess --workers 16 --comparison-video
