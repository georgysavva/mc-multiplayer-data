#!/bin/bash

# Check that "Episode started!" can be found in episode starter logs
# and that sender logs are not stuck (last timestamp within 60 seconds)
# Usage: ./check_episode_started.sh [directory] [max_age_seconds]
# Default directory: ./logs
# Default max_age_seconds: 60

DIR="${1:-./logs}"
MAX_AGE="${2:-60}"

if [ ! -d "$DIR" ]; then
    echo "Error: Directory '$DIR' does not exist"
    exit 1
fi

# ============================================
# Check 1: Episode started! in starter logs
# ============================================
echo "=== Checking for 'Episode started!' in starter logs ==="
echo ""

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

# ============================================
# Check 2: Sender logs not stuck
# ============================================
echo ""
echo "=== Checking sender logs for staleness (max age: ${MAX_AGE}s) ==="
echo ""

SENDER_FILES=$(find "$DIR" \( -name "sender_alpha_instance*.log" -o -name "sender_bravo_instance*.log" \) 2>/dev/null)

if [ -z "$SENDER_FILES" ]; then
    echo "No sender logs found in $DIR"
    exit 1
fi

CURRENT_TIME=$(date -u +%s)
SENDER_TOTAL=0
SENDER_OK=0
STUCK=()

while IFS= read -r file; do
    SENDER_TOTAL=$((SENDER_TOTAL + 1))
    
    # Extract the last timestamp from the log file
    # Format: 2025-12-04T00:38:32.175705471Z
    LAST_LINE=$(grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}' "$file" | tail -1)
    
    if [ -z "$LAST_LINE" ]; then
        echo "✗ $file (no timestamp found)"
        STUCK+=("$file: no timestamp found")
        continue
    fi
    
    # Convert ISO timestamp to epoch seconds (timestamps are UTC)
    LOG_TIME=$(date -u -d "${LAST_LINE}" +%s 2>/dev/null)
    
    if [ -z "$LOG_TIME" ]; then
        echo "✗ $file (could not parse timestamp: $LAST_LINE)"
        STUCK+=("$file: could not parse timestamp")
        continue
    fi
    
    AGE=$((CURRENT_TIME - LOG_TIME))
    
    if [ "$AGE" -le "$MAX_AGE" ]; then
        SENDER_OK=$((SENDER_OK + 1))
        echo "✓ $file (age: ${AGE}s)"
    else
        echo "✗ $file (age: ${AGE}s - STUCK)"
        STUCK+=("$file: ${AGE}s behind")
    fi
done <<< "$SENDER_FILES"

echo ""
echo "Summary: $SENDER_OK/$SENDER_TOTAL sender logs are active (within ${MAX_AGE}s)"

if [ ${#STUCK[@]} -gt 0 ]; then
    echo ""
    echo "Stuck or problematic logs:"
    for f in "${STUCK[@]}"; do
        echo "  - $f"
    done
    exit 1
fi

echo ""
echo "All checks passed!"
exit 0
