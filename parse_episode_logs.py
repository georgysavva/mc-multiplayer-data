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
    
    # Pattern to match the frame count line with actions duration
    # Example: [Bravo] 📊 Target: 256 frames | Actual: 229 | Difference: -27 frames | Actions Duration: 11.43s
    pattern = r'\[(\w+)\] 📊 Target: (\d+) frames \| Actual: (\d+) \| Difference: ([+-]?\d+) frames \| Actions Duration: ([\d.]+)s'
    
    # Pattern to match the final duration line
    # Example: [Bravo] 📊 Final Duration: 14.96s | Final Frames: 299 | Actions Duration: 11.43s | Idle Duration: 3.57s
    final_pattern = r'\[(\w+)\] 📊 Final Duration: ([\d.]+)s \| Final Frames: (\d+) \| Actions Duration: ([\d.]+)s \| Idle Duration: ([\d.]+)s'
    
    # Also extract episode number from previous lines
    episode_pattern = r'\[(\w+)\] Starting episode (\d+)'
    
    episodes = []
    current_episodes = {}  # Track current episode number per bot
    pending_episodes = {}  # Track episodes waiting for final duration line
    
    try:
        with open(log_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(f"❌ Error: File '{log_path}' not found")
        return []
    
    # Process lines sequentially
    for i, line in enumerate(lines):
        # Update current episode number if we see a new episode starting
        ep_match = re.search(episode_pattern, line)
        if ep_match:
            bot_name = ep_match.group(1)
            episode_num = int(ep_match.group(2))
            current_episodes[bot_name] = episode_num
        
        # Look for frame count line with actions duration
        match = re.search(pattern, line)
        if match:
            bot_name = match.group(1)
            target_frames = int(match.group(2))
            actual_frames = int(match.group(3))
            difference = int(match.group(4))
            actions_duration = float(match.group(5))
            
            # Get episode number
            episode_num = current_episodes.get(bot_name, -1)
            
            # Store pending episode data (waiting for final duration line)
            pending_episodes[bot_name] = {
                'episode': episode_num,
                'bot': bot_name,
                'target': target_frames,
                'actual': actual_frames,
                'difference': difference,
                'actions_duration': actions_duration,
                'idle_duration': None,
                'final_frames': None,
                'final_duration': None,
                'actions_frames': None,
                'idle_frames': None
            }
        
        # Look for final duration line
        final_match = re.search(final_pattern, line)
        if final_match:
            bot_name = final_match.group(1)
            final_duration = float(final_match.group(2))
            final_frames = int(final_match.group(3))
            actions_duration = float(final_match.group(4))
            idle_duration = float(final_match.group(5))
            
            # Update pending episode with final data
            if bot_name in pending_episodes:
                pending_episodes[bot_name]['final_duration'] = final_duration
                pending_episodes[bot_name]['final_frames'] = final_frames
                pending_episodes[bot_name]['idle_duration'] = idle_duration
                
                # Calculate frames from durations (20 FPS)
                pending_episodes[bot_name]['actions_frames'] = round(actions_duration * 20)
                pending_episodes[bot_name]['idle_frames'] = round(idle_duration * 20)
                
                # Add completed episode to list
                episodes.append(pending_episodes[bot_name])
                del pending_episodes[bot_name]
    
    return episodes

def print_summary_table(episodes):
    """Print a summary table of all episodes."""
    if not episodes:
        print("No episode data found!")
        return
    
    print("\n" + "="*140)
    print("FRAME COUNT EXTRACTION RESULTS")
    print("="*140)
    print(f"Total episodes found: {len(episodes)}")
    print()
    
    # Header
    print(f"{'Episode':<10} {'Bot':<10} {'Actions':<15} {'Idle':<15} {'Total':<12} {'Target':<10} {'Diff':<10}")
    print(f"{'':10} {'':10} {'(dur/frames)':<15} {'(dur/frames)':<15} {'(dur/frames)':<12} {'':10} {'':10}")
    print("-"*140)
    
    # Sort by episode number
    sorted_episodes = sorted(episodes, key=lambda x: x['episode'])
    
    for ep in sorted_episodes:
        actions_str = f"{ep['actions_duration']:.2f}s/{ep.get('actions_frames', 0)}f" if ep['actions_duration'] else "N/A"
        idle_str = f"{ep['idle_duration']:.2f}s/{ep.get('idle_frames', 0)}f" if ep['idle_duration'] else "N/A"
        total_str = f"{ep['final_duration']:.2f}s/{ep.get('final_frames', 0)}f" if ep['final_duration'] else "N/A"
        diff_str = f"{ep['difference']:+d}" if ep['difference'] >= 0 else str(ep['difference'])
        
        print(f"{ep['episode']:<10} "
              f"{ep['bot']:<10} "
              f"{actions_str:<15} "
              f"{idle_str:<15} "
              f"{total_str:<12} "
              f"{ep['target']:<10} "
              f"{diff_str:<10}")
    
    print("-"*140)
    
    # Statistics
    if episodes:
        avg_actions = sum(e['actions_duration'] for e in episodes if e['actions_duration']) / len([e for e in episodes if e['actions_duration']])
        avg_idle = sum(e['idle_duration'] for e in episodes if e['idle_duration']) / len([e for e in episodes if e['idle_duration']])
        avg_total = sum(e['final_duration'] for e in episodes if e['final_duration']) / len([e for e in episodes if e['final_duration']])
        avg_actions_frames = sum(e.get('actions_frames', 0) for e in episodes) / len(episodes)
        avg_idle_frames = sum(e.get('idle_frames', 0) for e in episodes) / len(episodes)
        avg_final_frames = sum(e.get('final_frames', 0) for e in episodes) / len(episodes)
        avg_diff = sum(abs(e['difference']) for e in episodes) / len(episodes)
        min_frames = min(e['actual'] for e in episodes)
        max_frames = max(e['actual'] for e in episodes)
        
        print()
        print("STATISTICS:")
        print(f"  Average Actions Duration: {avg_actions:.2f}s ({avg_actions_frames:.1f} frames)")
        print(f"  Average Idle Duration: {avg_idle:.2f}s ({avg_idle_frames:.1f} frames)")
        print(f"  Average Total Duration: {avg_total:.2f}s ({avg_final_frames:.1f} frames)")
        print(f"  Average Action Frames: {avg_actions_frames:.1f} (Target: 256)")
        print(f"  Average Difference from Target: {avg_diff:.1f} frames")
        print(f"  Min Action Frames: {min_frames}")
        print(f"  Max Action Frames: {max_frames}")
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
