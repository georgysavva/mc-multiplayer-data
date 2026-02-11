#!/usr/bin/env python3
"""
Prepare demo episodes for evaluation: copies/renames files and generates eval metadata.

Outputs:
  - episode_type_mapping.json: post-rename episode -> episode type
  - eval_ids.json: [(ep_idx, alpha_start, alpha_end, bravo_start, bravo_end), ...]
    Note: start/end use exclusive end semantics (e.g., [0, 257] means frames 0-256, 257 frames total)
  - segment_mapping.json: segment index -> episode details (1:1 correspondence with eval_ids)
  - demo_segments/: segmented Demo camera videos (using alpha start/end times from eval_ids)
"""

import argparse
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

from tqdm import tqdm

from prepare_episodes_for_eval import process_episodes_dir

FPS = 20  # Minecraft recording FPS


def build_eval_metadata(episodes_dir: str, ignore_first_episode: bool, segment_size: int = 257,
                        default_stride: int = 40, long_video_stride: int = 120, long_video_threshold: int = 1200):
    """Build eval metadata from an episodes directory.
    
    Args:
        episodes_dir: Path to the episodes directory
        ignore_first_episode: Whether to skip episode 000000
        segment_size: Length of each segment in frames (default: 257)
        default_stride: Stride between segment starts for short videos (default: 40)
        long_video_stride: Stride for videos longer than long_video_threshold (default: 120)
        long_video_threshold: Frame count threshold for using long_video_stride (default: 1200)
    """
    output_dir = Path(episodes_dir) / "output"
    aligned_dir = Path(episodes_dir) / "aligned"
    
    if not output_dir.exists() or not aligned_dir.exists():
        return {}, [], [], []
    
    # Build (episode_num, instance_id) -> episode_type from episode_info.json files
    type_mapping = {}
    for info_file in output_dir.glob('*_episode_info.json'):
        match = re.match(r'^\d+_\d+_(\d+)_\w+_instance_(\d+)_episode_info\.json$', info_file.name)
        if match:
            try:
                with open(info_file) as f:
                    type_mapping[(match.group(1), match.group(2))] = json.load(f).get('episode_type', 'unknown')
            except (json.JSONDecodeError, IOError):
                pass
    
    # Collect episode data from video files (Alpha, Bravo, and Demo)
    episodes_data = defaultdict(dict)
    demo_videos = {}  # (episode_num, instance_id) -> video_path
    episode_type_mapping = {}
    
    for video_fname in sorted(os.listdir(aligned_dir)):
        match = re.match(r'^(\d+_\d+)_(\d+)_(\w+)_instance_(\d+)_camera\.mp4$', video_fname)
        if not match:
            continue
        
        timestamp, episode_num, name, instance_id = match.groups()
        if ignore_first_episode and episode_num == "000000":
            continue
        
        key = (episode_num, instance_id)
        
        # Track Demo videos separately
        if name == "Demo":
            demo_videos[key] = aligned_dir / video_fname
            continue
        
        if name not in ['Alpha', 'Bravo']:
            continue
        
        json_path = output_dir / f"{timestamp}_{episode_num}_{name}_instance_{instance_id}.json"
        if not json_path.exists():
            continue
        
        try:
            with open(json_path) as f:
                frame_count = len(json.load(f))
        except (json.JSONDecodeError, IOError):
            continue
        
        post_rename = f"{episode_num}_{name}_instance_{instance_id}"
        episode_type_mapping[post_rename] = type_mapping.get(key, 'unknown')
        episodes_data[key][name] = {'frame_count': frame_count, 'post_rename': post_rename}
    
    # Verify all episodes have Alpha, Bravo, AND Demo perspectives
    valid_episodes = []
    for episode_num, instance_id in sorted(episodes_data.keys()):
        pair = episodes_data[(episode_num, instance_id)]
        key = (episode_num, instance_id)
        
        if 'Alpha' not in pair or 'Bravo' not in pair:
            continue
        
        if key not in demo_videos:
            raise RuntimeError(
                f"Episode {episode_num} instance {instance_id} is missing Demo camera perspective. "
                f"Found Alpha and Bravo but no Demo video in {aligned_dir}"
            )
        
        valid_episodes.append(key)
    
    # Generate eval_ids, segment_mapping, and episode_demo_videos (list indexed by ep_idx)
    eval_ids = []
    segment_mapping = []
    episode_demo_videos = []
    
    for ep_idx, (episode_num, instance_id) in enumerate(valid_episodes):
        pair = episodes_data[(episode_num, instance_id)]
        key = (episode_num, instance_id)
        
        min_frames = min(pair['Alpha']['frame_count'], pair['Bravo']['frame_count'])
        
        # Use longer stride for videos exceeding the threshold (e.g., 1 minute at 20 FPS)
        stride = long_video_stride if min_frames > long_video_threshold else default_stride
        
        # Store demo video path for this episode (indexed by ep_idx)
        episode_demo_videos.append(demo_videos.get(key))
        
        # Generate overlapping segments with the determined stride
        start = 0
        while start + segment_size <= min_frames:
            end = start + segment_size
            eval_ids.append((ep_idx, start, end, start, end))
            segment_mapping.append({
                'episode_name': f"{episode_num}_instance_{instance_id}",
                'episode_type': type_mapping.get(key, 'unknown'),
                'alpha_episode': pair['Alpha']['post_rename'],
                'bravo_episode': pair['Bravo']['post_rename'],
                'start_frame': start,
                'end_frame': end,
            })
            start += stride
    
    return episode_type_mapping, eval_ids, episode_demo_videos, segment_mapping


def segment_demo_videos(eval_ids: list, episode_demo_videos: list, output_dir: Path):
    """Segment Demo camera videos based on eval_ids using alpha start/end times.
    
    Args:
        eval_ids: List of (ep_idx, alpha_start, alpha_end, bravo_start, bravo_end)
        episode_demo_videos: List where index is ep_idx and value is demo video path
        output_dir: Directory to save segmented videos
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    
    segments_created = 0
    for segment_idx, (ep_idx, alpha_start, alpha_end, _, _) in enumerate(tqdm(eval_ids, desc="Segmenting demo videos", unit="segment")):
        if ep_idx >= len(episode_demo_videos) or episode_demo_videos[ep_idx] is None:
            continue
        
        src_video = episode_demo_videos[ep_idx]
        
        # Calculate time range from alpha start/end
        start_time = alpha_start / FPS
        duration = (alpha_end - alpha_start) / FPS
        
        # Output filename: segment_000000.mp4
        out_fname = f"segment_{segment_idx:06d}.mp4"
        out_path = output_dir / out_fname
        
        if out_path.exists():
            segments_created += 1
            continue
        
        # Use ffmpeg to extract segment
        cmd = [
            'ffmpeg', '-y', '-ss', str(start_time), '-i', str(src_video),
            '-t', str(duration), '-c:v', 'libx264', '-preset', 'fast',
            '-crf', '18', '-an', str(out_path)
        ]
        
        try:
            subprocess.run(cmd, capture_output=True, check=True)
            segments_created += 1
        except subprocess.CalledProcessError as e:
            print(f"Warning: Failed to create segment {segment_idx} from {src_video.name}: {e.stderr.decode()[:200]}")
    
    return segments_created


def main():
    parser = argparse.ArgumentParser(description="Prepare demo episodes for evaluation.")
    parser.add_argument("--episodes-dir", required=True, help="Episodes directory or parent of multiple")
    parser.add_argument("--destination-dir", required=True, help="Output directory")
    parser.add_argument("--ignore-first-episode", action="store_true")
    parser.add_argument("--segment-size", type=int, default=257, help="Length of each segment in frames")
    parser.add_argument("--default-stride", type=int, default=40, help="Stride between segment starts for short videos")
    parser.add_argument("--long-video-stride", type=int, default=120, help="Stride for videos longer than threshold")
    parser.add_argument("--long-video-threshold", type=int, default=1200, help="Frame count threshold for long video stride (1200 = 1 minute at 20 FPS)")
    parser.add_argument("--skip-demo-segments", action="store_true", help="Skip segmenting Demo camera videos")
    args = parser.parse_args()

    if not os.path.isdir(args.episodes_dir):
        sys.exit(f"Error: Directory not found: {args.episodes_dir}")

    is_single = os.path.isdir(os.path.join(args.episodes_dir, "output"))
    all_type_mapping, all_eval_ids, all_segment_mapping = {}, [], []
    all_episode_demo_videos = []  # List indexed by global ep_idx
    total_copied = 0

    if is_single:
        dirs = [(args.episodes_dir, os.path.join(args.destination_dir, "test"), None)]
    else:
        dirs = [(os.path.join(args.episodes_dir, d), os.path.join(args.destination_dir, d, "test"), d)
                for d in sorted(os.listdir(args.episodes_dir))
                if os.path.isdir(os.path.join(args.episodes_dir, d, "output"))]

    for src, dst, prefix in dirs:
        result = process_episodes_dir(src, dst, args.ignore_first_episode)
        if result:
            total_copied += result[0]
            print(f"Processed: {prefix or 'episodes'} -> {result[0]} file pairs")
        
        type_map, eval_ids, episode_demo_videos, segment_mapping = build_eval_metadata(
            src, args.ignore_first_episode, args.segment_size,
            args.default_stride, args.long_video_stride, args.long_video_threshold
        )
        
        ep_offset = len(all_episode_demo_videos)
        
        for k, v in type_map.items():
            all_type_mapping[f"{prefix}/{k}" if prefix else k] = v
        for e in eval_ids:
            all_eval_ids.append((e[0] + ep_offset, e[1], e[2], e[3], e[4]))
        for s in segment_mapping:
            s_new = {**s, 'segment_idx': len(all_segment_mapping)}
            if prefix:
                s_new.update({k: f"{prefix}/{s[k]}" for k in ['episode_name', 'alpha_episode', 'bravo_episode']})
            all_segment_mapping.append(s_new)
        
        # Append demo video paths (indexed by ep_idx)
        all_episode_demo_videos.extend(episode_demo_videos)

    # Pad eval_ids to be a multiple of 32 by repeating the last segment
    if all_eval_ids:
        remainder = len(all_eval_ids) % 32
        if remainder != 0:
            padding_needed = 32 - remainder
            last_eval_id = all_eval_ids[-1]
            all_eval_ids.extend([last_eval_id] * padding_needed)
            last_segment = all_segment_mapping[-1]
            for _ in range(padding_needed):
                all_segment_mapping.append({**last_segment, 'segment_idx': len(all_segment_mapping)})
            print(f"Padded eval_ids with {padding_needed} repeats of last segment to reach {len(all_eval_ids)} (multiple of 32)")

    # Save outputs
    os.makedirs(args.destination_dir, exist_ok=True)
    
    for name, data in [('episode_type_mapping.json', all_type_mapping),
                       ('eval_ids.json', all_eval_ids),
                       ('segment_mapping.json', all_segment_mapping)]:
        with open(os.path.join(args.destination_dir, name), 'w') as f:
            json.dump(data, f, indent=2)
        print(f"Saved {name}: {len(data)} entries")

    # Segment Demo camera videos
    if not args.skip_demo_segments and all_episode_demo_videos:
        demo_segments_dir = Path(args.destination_dir) / "demo_segments"
        segments_created = segment_demo_videos(
            all_eval_ids, all_episode_demo_videos, demo_segments_dir
        )
        print(f"Created {segments_created} demo segments in {demo_segments_dir}")

    print(f"\nEpisode types: {dict(Counter(all_type_mapping.values()))}")


if __name__ == "__main__":
    main()
