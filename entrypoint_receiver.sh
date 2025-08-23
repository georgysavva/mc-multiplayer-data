#!/usr/bin/env bash
set -euo pipefail
# exec python3 receiver.py
exec python3 receiver.py --location plains --nvtype ABA --port $PORT --name $NAME --nvrange 15 --output_path /output