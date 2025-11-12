#!/usr/bin/env python3
"""
Parse episode logs to extract frame count data.
Reads logs and extracts frame count information from lines like:
📊 Target: 300 frames | Actual: 321 | Difference: 21 frames
"""

import re
import sys
from collections import defaultdict

def parse_log_file(log_path='episode_run_frames.txt'):
    """Parse log file and extract frame count data."""
    
    # Pattern to match the frame count line
    # Example: 2025-11-11 22:34:34.944 | [Bravo] 📊 Target: 300 frames | Actual: 321 | Difference: 21 frames
    pattern = r'\[(\w+)\] 📊 Target: (\d+) frames \| Actual: (\d+) \| Difference: ([+-]?\d+) frames'
    
    # Also extract episode number from previous lines
    # Example: [Bravo] ✅ STRUCTURE EVAL phase complete!
    # We need to track which episode we're in
    episode_pattern = r'\[(\w+)\] Starting episode (\d+)'
    duration_pattern = r'\[(\w+)\] ⏱️\s+ML Training Segment Duration: ([\d.]+)s'
    
    episodes = []
    current_episodes = {}  # Track current episode number per bot
    
    try:
        with open(log_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(f"❌ Error: File '{log_path}' not found")
        return []
    
    # First pass: find episode numbers
    for i, line in enumerate(lines):
        ep_match = re.search(episode_pattern, line)
        if ep_match:
            bot_name = ep_match.group(1)
            episode_num = int(ep_match.group(2))
            current_episodes[bot_name] = episode_num
    
    # Second pass: extract frame data with context
    for i, line in enumerate(lines):
        # Update current episode number if we see a new episode starting
        ep_match = re.search(episode_pattern, line)
        if ep_match:
            bot_name = ep_match.group(1)
            episode_num = int(ep_match.group(2))
            current_episodes[bot_name] = episode_num
        
        # Look for frame count line
        match = re.search(pattern, line)
        if match:
            bot_name = match.group(1)
            target_frames = int(match.group(2))
            actual_frames = int(match.group(3))
            difference = int(match.group(4))
            
            # Get episode number
            episode_num = current_episodes.get(bot_name, -1)
            
            # Look backwards for duration
            duration = None
            for j in range(max(0, i-5), i):
                dur_match = re.search(duration_pattern, lines[j])
                if dur_match and dur_match.group(1) == bot_name:
                    duration = float(dur_match.group(2))
                    break
            
            episodes.append({
                'episode': episode_num,
                'bot': bot_name,
                'target': target_frames,
                'actual': actual_frames,
                'difference': difference,
                'duration': duration
            })
    
    return episodes

def print_summary_table(episodes):
    """Print a summary table of all episodes."""
    if not episodes:
        print("No episode data found!")
        return
    
    print("\n" + "="*84)
    print("FRAME COUNT EXTRACTION RESULTS")
    print("="*84)
    print(f"Total episodes found: {len(episodes)}")
    print()
    
    # Header
    print(f"{'Episode':<10} {'Bot':<10} {'Duration':<12} {'Frames':<10} {'Target':<10} {'Diff':<10}")
    print("-"*84)
    
    # Sort by episode number
    sorted_episodes = sorted(episodes, key=lambda x: x['episode'])
    
    for ep in sorted_episodes:
        duration_str = f"{ep['duration']:.2f}" if ep['duration'] else "N/A"
        diff_str = f"{ep['difference']:+d}" if ep['difference'] >= 0 else str(ep['difference'])
        
        print(f"{ep['episode']:<10} "
              f"{ep['bot']:<10} "
              f"{duration_str:<12} "
              f"{ep['actual']:<10} "
              f"{ep['target']:<10} "
              f"{diff_str:<10}")
    
    print("-"*84)
    
    # Statistics
    if episodes:
        avg_duration = sum(e['duration'] for e in episodes if e['duration']) / len([e for e in episodes if e['duration']])
        avg_frames = sum(e['actual'] for e in episodes) / len(episodes)
        avg_diff = sum(abs(e['difference']) for e in episodes) / len(episodes)
        min_frames = min(e['actual'] for e in episodes)
        max_frames = max(e['actual'] for e in episodes)
        
        print()
        print("STATISTICS:")
        print(f"  Average Duration: {avg_duration:.2f}s")
        print(f"  Average Frames: {avg_frames:.1f}")
        print(f"  Average Difference from Target: {avg_diff:.1f} frames")
        print(f"  Min Frames: {min_frames}")
        print(f"  Max Frames: {max_frames}")
        print()

def main():
    """Main function."""
    log_file = 'episode_run_frames.txt'
    
    # Allow custom log file as argument
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    print(f"📖 Parsing log file: {log_file}")
    
    episodes = parse_log_file(log_file)
    
    if episodes:
        print_summary_table(episodes)
        print(f"✅ Successfully extracted data from {len(episodes)} episodes")
    else:
        print("❌ No episode data found in log file")
        print("   Make sure the log file contains lines with:")
        print("   📊 Target: 300 frames | Actual: XXX | Difference: ±XX frames")

if __name__ == "__main__":
    main()
