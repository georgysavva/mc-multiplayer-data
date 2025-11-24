#!/bin/bash

BASE="$(pwd)"

python3 "$BASE/generate_compose.py" --instances 2 \
  --compose_dir "$BASE/compose_configs" \
  --base_port 25590 \
  --base_rcon_port 25600 \
  --receiver_port 8110 \
  --coord_port 8120 \
  --data_dir "$BASE/data" \
  --output_dir "$BASE/output" \
  --camera_output_alpha_base "$BASE/camera/output_alpha" \
  --camera_output_bravo_base "$BASE/camera/output_bravo" \
  --camera_data_alpha_base "$BASE/camera/data_alpha" \
  --camera_data_bravo_base "$BASE/camera/data_bravo" \
  --smoke_test 0 \
  --num_flatland_world 2 \
  --num_normal_world 0 \
  --num_episodes 1 \
  --iterations_num_per_episode 1 \
  --viewer_rendering_disabled 0

# Start/inspect/stop
python3 "$BASE/orchestrate.py" start --build
python3 "$BASE/orchestrate.py" status
python3 "$BASE/orchestrate.py" logs --tail 20
python3 "$BASE/orchestrate.py" recordings
python3 "$BASE/orchestrate.py" stop
python3 "$BASE/orchestrate.py" postprocess --workers 16 --output-dir "$BASE/output_batched/mc_multiplayer_eval"
