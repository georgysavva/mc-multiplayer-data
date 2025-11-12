#!/usr/bin/env python3
"""
Extract frame count data from episode logs.
Reads the log file and extracts frame count information for each episode.
"""

import re
import sys

def extract_frame_counts(log_file_path):
    """
    Extract frame count data from log file.
    
    Args:
        log_file_path: Path to the log file
        
    Returns:
        List of dictionaries containing frame count data
    """
    frame_data = []
    
    with open(log_file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Pattern to match the frame counting block
    # Looking for lines with "Estimated Frames" followed by "Target: 300 frames"
    pattern = r'\[(\w+)\] ⏱️\s+ML Training Segment Duration: ([\d.]+)s\n.*?\[(\w+)\] 🎞️\s+Estimated Frames \(at 20 FPS\): (\d+) frames\n.*?\[(\w+)\] 📊 Target: (\d+) frames \| Actual: (\d+) \| Difference: ([+-]?\d+) frames'
    
    matches = re.findall(pattern, content)
    
    for match in matches:
        bot_name = match[0]
        duration = float(match[1])
        frames = int(match[3])
        target = int(match[5])
        actual = int(match[6])
        difference = int(match[7])
        
        frame_data.append({
            'bot': bot_name,
            'duration_seconds': duration,
            'estimated_frames': frames,
            'target_frames': target,
            'actual_frames': actual,
            'difference': difference
        })
    
    return frame_data

def print_summary(frame_data):
    """Print a summary table of the frame count data."""
    print("=" * 80)
    print("FRAME COUNT EXTRACTION RESULTS")
    print("=" * 80)
    print(f"Total episodes found: {len(frame_data)}")
    print()
    
    print(f"{'Episode':<10} {'Bot':<10} {'Duration':<12} {'Frames':<10} {'Target':<10} {'Diff':<10}")
    print("-" * 80)
    
    for i, data in enumerate(frame_data, 1):
        print(f"{i:<10} {data['bot']:<10} {data['duration_seconds']:<12.2f} "
              f"{data['actual_frames']:<10} {data['target_frames']:<10} {data['difference']:<10}")
    
    print("-" * 80)
    
    # Calculate statistics
    if frame_data:
        avg_frames = sum(d['actual_frames'] for d in frame_data) / len(frame_data)
        avg_duration = sum(d['duration_seconds'] for d in frame_data) / len(frame_data)
        avg_diff = sum(d['difference'] for d in frame_data) / len(frame_data)
        
        print(f"\nSTATISTICS:")
        print(f"  Average Duration: {avg_duration:.2f}s")
        print(f"  Average Frames: {avg_frames:.1f}")
        print(f"  Average Difference from Target: {avg_diff:.1f} frames")
        print(f"  Min Frames: {min(d['actual_frames'] for d in frame_data)}")
        print(f"  Max Frames: {max(d['actual_frames'] for d in frame_data)}")
    
    print("=" * 80)

def main():
    """Main function."""
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    else:
        log_file = "15_run episodes.txt"
    
    try:
        print(f"Reading log file: {log_file}")
        frame_data = extract_frame_counts(log_file)
        print_summary(frame_data)
        
        # Optionally save to CSV
        save_csv = input("\nSave to CSV? (y/n): ").strip().lower()
        if save_csv == 'y':
            import csv
            csv_file = "frame_counts_extracted.csv"
            with open(csv_file, 'w', newline='') as f:
                if frame_data:
                    writer = csv.DictWriter(f, fieldnames=frame_data[0].keys())
                    writer.writeheader()
                    writer.writerows(frame_data)
            print(f"Saved to {csv_file}")
        
    except FileNotFoundError:
        print(f"Error: File '{log_file}' not found!")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
