#!/bin/sh

param="$1"

cd /mnt/data/tmeehan/mc_multiplayer_demo/$param

rsync -avz --progress ./aligned/ twm70@ilab1.cs.rutgers.edu:~/Downloads/$param