#!/bin/bash

# Script to check for missing video files in a directory given expected instance IDs and episode IDs

# Default to current directory if no argument is provided
SEARCH_DIR="${1:-.}"

# Verify directory exists
if [ ! -d "$SEARCH_DIR" ]; then
    echo "Error: Directory '$SEARCH_DIR' not found."
    exit 1
fi

echo "Checking for missing files in: $SEARCH_DIR"
echo "---------------------------------------------------"

missing_count=0

# Loop through Episode IDs 000000 to 000099
for episode_num in {0..99}; do
    # Format episode_id with leading zeros (6 digits)
    episode_id=$(printf "%06d" "$episode_num")

    # Loop through Types
    for type in "Alpha" "Bravo"; do

        # Loop through Instance IDs 000 to 007
        for instance_num in {0..3}; do
            # Format instance_id with leading zeros (3 digits)
            instance_id=$(printf "%03d" "$instance_num")

            # Construct the pattern to look for. 
            # We use * for the date/time prefix (YYYYMMDD_HHMMSS)
            # Pattern: *_{episode_id}_{type}_instance_{instance_id}_camera.mp4
            pattern="*_${episode_id}_${type}_instance_${instance_id}_camera.mp4"

            # Check if a file matching the pattern exists in the directory
            # We use `compgen -G` which is a bash builtin to expand globs
            if ! compgen -G "$SEARCH_DIR/$pattern" > /dev/null; then
                echo "MISSING: Episode $episode_id | Type $type | Instance $instance_id"
                ((missing_count++))
            fi
        done
    done
done

echo "---------------------------------------------------"
if [ "$missing_count" -eq 0 ]; then
    echo "All files are present!"
else
    echo "Total missing files: $missing_count"
fi

