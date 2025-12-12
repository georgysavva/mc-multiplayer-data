# Script to run `run_tpu.sh` sequentially for splits
for i in {0..19}; do
  BATCH_NAME="batch2_split_$i" bash ./run_gpu_local.sh
done