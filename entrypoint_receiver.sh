#!/usr/bin/env bash
set -euo pipefail
# exec python3 receiver.py
exec python3 receiver.py --port $PORT --name $NAME --output_path /output --instance_id $INSTANCE_ID --start_id $EPISODE_START_ID