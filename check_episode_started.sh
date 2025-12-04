#!/bin/bash

# Check that "Episode started!" can be found in episode starter logs
# Usage: ./check_episode_started.sh [directory]
# Default directory: ./logs

DIR="${1:-./logs}"

if [ ! -d "$DIR" ]; then
    echo "Error: Directory '$DIR' does not exist"
    exit 1
fi

# Find all matching log files
FILES=$(find "$DIR" -name "episode_starter_instance*.log" 2>/dev/null)

if [ -z "$FILES" ]; then
    echo "No episode_starter_instance*.log files found in $DIR"
    exit 1
fi

TOTAL=0
FOUND=0
MISSING=()

while IFS= read -r file; do
    TOTAL=$((TOTAL + 1))
    if grep -q "Episode started!" "$file"; then
        FOUND=$((FOUND + 1))
        echo "✓ $file"
    else
        MISSING+=("$file")
        echo "✗ $file"
    fi
done <<< "$FILES"

echo ""
echo "Summary: $FOUND/$TOTAL files contain 'Episode started!'"

if [ ${#MISSING[@]} -gt 0 ]; then
    echo ""
    echo "Files missing 'Episode started!':"
    for f in "${MISSING[@]}"; do
        echo "  - $f"
    done
    exit 1
fi

exit 0

