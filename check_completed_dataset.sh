#!/bin/bash

################################################################################
# check_completed_dataset.sh
#
# A script to validate completed Minecraft multiplayer datasets.
# Runs on a root directory and checks all subdirectories sequentially.
#
# CHECKS PERFORMED:
#   1. Video Files: Verifies all expected video files exist in the aligned/
#      folder for each episode (000000-000099), type (Alpha/Bravo), and
#      instance (000-003). Files should match pattern:
#      *_{episode_id}_{type}_instance_{instance_id}_camera.mp4
#
#   2. Episode Started: Checks that "Episode started!" appears in all
#      episode_starter_instance*.log files within the logs/ directory,
#      indicating episodes were properly initialized.
#
# USAGE:
#   ./check_completed_dataset.sh <root_directory> [num_episodes] [num_instances]
#
# ARGUMENTS:
#   root_directory  - Required. Path to directory containing dataset subdirs
#   num_episodes    - Optional. Number of episodes per batch (default: 100)
#   num_instances   - Optional. Number of instances per batch (default: 4)
#
# EXAMPLE:
#   ./check_completed_dataset.sh /mnt/data/dl3957/mc_multiplayer_v2_gpu
#   ./check_completed_dataset.sh /mnt/data/dataset 50 4
#
# OUTPUT:
#   Summarized results per subdirectory, with overall statistics at the end.
################################################################################

set -e

# Parse arguments
ROOT_DIR="${1:-}"
NUM_EPISODES="${2:-100}"
NUM_INSTANCES="${3:-4}"

# Validate root directory
if [ -z "$ROOT_DIR" ]; then
    echo "Usage: $0 <root_directory> [num_episodes] [num_instances]"
    echo "  root_directory  - Path to directory containing dataset subdirs"
    echo "  num_episodes    - Number of episodes per batch (default: 100)"
    echo "  num_instances   - Number of instances per batch (default: 4)"
    exit 1
fi

if [ ! -d "$ROOT_DIR" ]; then
    echo "Error: Directory '$ROOT_DIR' not found."
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Global counters
total_subdirs=0
passed_subdirs=0
failed_subdirs=0

# Function to check video files in aligned/ folder
check_video_files() {
    local search_dir="$1/aligned"
    local missing_count=0
    local expected_count=0
    
    if [ ! -d "$search_dir" ]; then
        echo "    [VIDEO] ⚠ No aligned/ directory found"
        return 1
    fi
    
    # Loop through Episode IDs
    for episode_num in $(seq 0 $((NUM_EPISODES - 1))); do
        episode_id=$(printf "%06d" "$episode_num")
        
        # Loop through Types
        for type in "Alpha" "Bravo"; do
            # Loop through Instance IDs
            for instance_num in $(seq 0 $((NUM_INSTANCES - 1))); do
                instance_id=$(printf "%03d" "$instance_num")
                expected_count=$((expected_count + 1))
                
                pattern="*_${episode_id}_${type}_instance_${instance_id}_camera.mp4"
                
                if ! compgen -G "$search_dir/$pattern" > /dev/null; then
                    ((missing_count++))
                fi
            done
        done
    done
    
    local found_count=$((expected_count - missing_count))
    
    if [ "$missing_count" -eq 0 ]; then
        echo -e "    [VIDEO] ${GREEN}✓${NC} All $expected_count video files present"
        return 0
    else
        echo -e "    [VIDEO] ${RED}✗${NC} Missing $missing_count/$expected_count video files"
        return 1
    fi
}

# Function to check episode started in logs
check_episode_started() {
    local logs_dir="$1/logs"
    
    if [ ! -d "$logs_dir" ]; then
        echo "    [LOGS]  ⚠ No logs/ directory found"
        return 1
    fi
    
    # Find all episode_starter_instance*.log files recursively
    local files
    files=$(find "$logs_dir" -name "episode_starter_instance*.log" 2>/dev/null)
    
    if [ -z "$files" ]; then
        echo "    [LOGS]  ⚠ No episode_starter_instance*.log files found"
        return 1
    fi
    
    local total=0
    local found=0
    local missing_files=()
    
    while IFS= read -r file; do
        total=$((total + 1))
        if grep -q "Episode started!" "$file" 2>/dev/null; then
            found=$((found + 1))
        else
            missing_files+=("$(basename "$(dirname "$file")")/$(basename "$file")")
        fi
    done <<< "$files"
    
    if [ "$found" -eq "$total" ]; then
        echo -e "    [LOGS]  ${GREEN}✓${NC} All $total logs have 'Episode started!'"
        return 0
    else
        echo -e "    [LOGS]  ${RED}✗${NC} Only $found/$total logs have 'Episode started!'"
        return 1
    fi
}

# Main execution
echo "============================================================"
echo "Checking completed dataset in: $ROOT_DIR"
echo "Parameters: $NUM_EPISODES episodes, $NUM_INSTANCES instances"
echo "============================================================"
echo ""

# Get all subdirectories and sort them
subdirs=$(find "$ROOT_DIR" -mindepth 1 -maxdepth 1 -type d | sort)

if [ -z "$subdirs" ]; then
    echo "No subdirectories found in $ROOT_DIR"
    exit 1
fi

# Process each subdirectory
while IFS= read -r subdir; do
    total_subdirs=$((total_subdirs + 1))
    subdir_name=$(basename "$subdir")
    
    echo "[$subdir_name]"
    
    video_ok=0
    logs_ok=0
    
    check_video_files "$subdir" && video_ok=1
    check_episode_started "$subdir" && logs_ok=1
    
    if [ "$video_ok" -eq 1 ] && [ "$logs_ok" -eq 1 ]; then
        passed_subdirs=$((passed_subdirs + 1))
        echo -e "    ${GREEN}→ PASSED${NC}"
    else
        failed_subdirs=$((failed_subdirs + 1))
        echo -e "    ${RED}→ FAILED${NC}"
    fi
    echo ""
done <<< "$subdirs"

# Final summary
echo "============================================================"
echo "SUMMARY"
echo "============================================================"
echo "Total subdirectories checked: $total_subdirs"
echo -e "Passed: ${GREEN}$passed_subdirs${NC}"
echo -e "Failed: ${RED}$failed_subdirs${NC}"

if [ "$failed_subdirs" -gt 0 ]; then
    exit 1
else
    echo ""
    echo -e "${GREEN}All datasets validated successfully!${NC}"
    exit 0
fi
