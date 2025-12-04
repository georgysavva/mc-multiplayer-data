# Script to run `run_tpu.sh` sequentially for splits
for i in {5..9}; do
  BATCH_NAME="batch1_split_$i" bash ./run_tpu.sh
done