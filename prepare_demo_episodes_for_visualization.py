#!/usr/bin/env python3
"""
Prepare demo episodes by organizing videos into folders by episode type.

This script reads the output folder from a data collection run, parses the
episode_info.json files to determine episode types, and copies the MP4 videos
from the aligned folder into subfolders organized by episode type.

Usage:
    python prepare_demo_episodes.py /mnt/data/dl3957/mc_multiplayer_demo/pve
"""

import argparse
import json
import re
import shutil
from collections import defaultdict
from pathlib import Path


def parse_video_filename(filename: str) -> dict | None:
    """
    Parse a video filename to extract episode number, bot/camera name, and instance.
    
    Example filename: 20260125_063635_000000_Alpha_instance_000_camera.mp4
    Returns: {'episode_num': '000000', 'name': 'Alpha', 'instance_id': '000'}
    """
    pattern = r'^\d+_\d+_(\d+)_(\w+)_instance_(\d+)_camera\.mp4$'
    match = re.match(pattern, filename)
    if match:
        return {
            'episode_num': match.group(1),
            'name': match.group(2),
            'instance_id': match.group(3),
        }
    return None


def make_output_filename(episode_num: str, instance_id: str, name: str) -> str:
    """
    Create simplified output filename.
    
    Example: 000000_instance_000_Alpha.mp4
    """
    return f"{episode_num}_instance_{instance_id}_{name}.mp4"


def build_episode_type_mapping(output_dir: Path) -> dict:
    """
    Build a mapping from (episode_num, instance_id) to episode_type
    by reading all episode_info.json files.
    
    Returns: {('000000', '000'): 'buildHouse', ...}
    """
    mapping = {}
    pattern = r'^\d+_\d+_(\d+)_(\w+)_instance_(\d+)_episode_info\.json$'
    
    for info_file in output_dir.glob('*_episode_info.json'):
        match = re.match(pattern, info_file.name)
        if not match:
            continue
        
        episode_num = match.group(1)
        instance_id = match.group(3)
        
        try:
            with open(info_file, 'r') as f:
                info = json.load(f)
            episode_type = info.get('episode_type', 'unknown')
            mapping[(episode_num, instance_id)] = episode_type
        except (json.JSONDecodeError, IOError) as e:
            print(f"Warning: Could not read {info_file.name}: {e}")
    
    return mapping


def main():
    parser = argparse.ArgumentParser(
        description='Organize demo videos into folders by episode type.'
    )
    parser.add_argument(
        'input_folder',
        type=str,
        help='Top-level folder (e.g., /mnt/data/dl3957/mc_multiplayer_demo/pve)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Print what would be done without actually copying files'
    )
    parser.add_argument(
        '--output-folder',
        type=str,
        default=None,
        help='Custom output folder name (default: demo_videos)'
    )
    parser.add_argument(
        '--video-dir',
        type=str,
        default='aligned',
        help='Subfolder containing videos (default: aligned)'
    )
    parser.add_argument(
        '--perspectives',
        type=str,
        nargs='+',
        default=['Alpha', 'Bravo', 'Demo'],
        help='Which perspectives to include (default: Alpha Bravo Demo)'
    )
    
    args = parser.parse_args()
    
    input_folder = Path(args.input_folder)
    output_dir = input_folder / 'output'
    video_dir = input_folder / args.video_dir
    demo_videos_dir = input_folder / (args.output_folder or 'demo_videos')
    
    if not input_folder.exists():
        print(f"Error: Input folder does not exist: {input_folder}")
        return 1
    
    if not output_dir.exists():
        print(f"Error: Output folder does not exist: {output_dir}")
        return 1
    
    if not video_dir.exists():
        print(f"Error: Video folder does not exist: {video_dir}")
        return 1
    
    # Build episode type mapping from episode_info.json files
    print(f"Reading episode info from: {output_dir}")
    episode_type_mapping = build_episode_type_mapping(output_dir)
    
    if not episode_type_mapping:
        print("No episode info files found or could not parse any")
        return 1
    
    print(f"Found episode types for {len(episode_type_mapping)} episodes")
    
    # Find all video files and group by episode type
    print(f"Scanning videos from: {video_dir}")
    videos_by_type = defaultdict(list)
    skipped_perspectives = []
    unknown_episodes = []
    
    for video_file in video_dir.glob('*.mp4'):
        parsed = parse_video_filename(video_file.name)
        if not parsed:
            print(f"Warning: Could not parse video filename: {video_file.name}")
            continue
        
        # Filter by perspective
        if parsed['name'] not in args.perspectives:
            skipped_perspectives.append(video_file.name)
            continue
        
        # Look up episode type
        key = (parsed['episode_num'], parsed['instance_id'])
        episode_type = episode_type_mapping.get(key)
        
        if episode_type is None:
            unknown_episodes.append(video_file.name)
            episode_type = 'unknown'
        
        videos_by_type[episode_type].append({
            'video_file': video_file,
            'episode_num': parsed['episode_num'],
            'name': parsed['name'],
            'instance_id': parsed['instance_id'],
        })
    
    # Print summary
    print(f"\nEpisode types found:")
    total_videos = 0
    for episode_type, videos in sorted(videos_by_type.items()):
        print(f"  {episode_type}: {len(videos)} videos")
        total_videos += len(videos)
    
    if skipped_perspectives:
        print(f"\nSkipped {len(skipped_perspectives)} videos (perspective not in {args.perspectives})")
    
    if unknown_episodes:
        print(f"\nWarning: {len(unknown_episodes)} videos with unknown episode type:")
        for name in unknown_episodes[:5]:
            print(f"  {name}")
        if len(unknown_episodes) > 5:
            print(f"  ... and {len(unknown_episodes) - 5} more")
    
    if total_videos == 0:
        print("\nNo videos to copy!")
        return 0
    
    if args.dry_run:
        print(f"\n[DRY RUN] Would create folder: {demo_videos_dir}")
        for episode_type, videos in sorted(videos_by_type.items()):
            type_dir = demo_videos_dir / episode_type
            print(f"[DRY RUN] Would create folder: {type_dir}")
            for video_info in sorted(videos, key=lambda x: (x['episode_num'], x['name'])):
                src = video_info['video_file']
                dst_name = make_output_filename(
                    video_info['episode_num'],
                    video_info['instance_id'],
                    video_info['name']
                )
                print(f"  [DRY RUN] Would copy: {src.name} -> {dst_name}")
        print(f"\n[DRY RUN] Would copy {total_videos} videos total")
        return 0
    
    # Create folders and copy videos
    demo_videos_dir.mkdir(exist_ok=True)
    print(f"\nCreated output directory: {demo_videos_dir}")
    
    total_copied = 0
    total_skipped = 0
    for episode_type, videos in sorted(videos_by_type.items()):
        type_dir = demo_videos_dir / episode_type
        type_dir.mkdir(exist_ok=True)
        print(f"\nCopying {len(videos)} videos to {type_dir.name}/")
        
        for video_info in sorted(videos, key=lambda x: (x['episode_num'], x['name'])):
            src = video_info['video_file']
            dst_name = make_output_filename(
                video_info['episode_num'],
                video_info['instance_id'],
                video_info['name']
            )
            dst = type_dir / dst_name
            
            if dst.exists():
                print(f"  Skipping (already exists): {dst_name}")
                total_skipped += 1
                continue
            
            print(f"  Copying: {src.name} -> {dst_name}")
            shutil.copy2(src, dst)
            total_copied += 1
    
    print(f"\nDone! Copied {total_copied} videos to {demo_videos_dir}")
    if total_skipped:
        print(f"Skipped {total_skipped} videos (already existed)")
    return 0


if __name__ == '__main__':
    exit(main())
