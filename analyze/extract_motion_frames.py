#!/usr/bin/env python3
"""
Extract and annotate frames showing bot movements at the start of each episode.
Used for evaluating the "Agent Motion Consistency - Translation" scenario.
"""

import json
import os
import cv2
import numpy as np
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import argparse


def load_json(filepath: str) -> dict:
    """Load and parse a JSON file."""
    with open(filepath, 'r') as f:
        return json.load(f)


def find_first_movement_time(actions: List[dict]) -> Optional[Tuple[float, dict]]:
    """
    Find the render time when bot first starts moving (WASD movement) and the action.
    
    Args:
        actions: List of action dictionaries
    
    Returns:
        Tuple of (render time in ms, action dict) of first movement, or None if no movement found
    """
    was_moving = False
    
    for i, action in enumerate(actions):
        act = action.get('action', {})
        # Check if bot is performing WASD movement
        is_moving = any([
            act.get('forward', False),
            act.get('back', False),
            act.get('left', False),
            act.get('right', False)
        ])
        
        # Detect transition from not moving to moving
        if is_moving and not was_moving:
            return (action.get('renderTime', 0), action)
        
        was_moving = is_moving
    
    return None


def get_frames_around_time(actions: List[dict], start_time: float, num_frames_after: int, num_frames_before: int = 0, frame_interval: int = 1) -> List[Tuple[int, dict]]:
    """
    Get frames around a given time (before and after) at specified intervals.
    
    Args:
        actions: List of action dictionaries
        start_time: Render time to center around
        num_frames_after: Number of frames to extract after (and including) start_time
        num_frames_before: Number of frames to extract before start_time
        frame_interval: Extract every Nth frame (default 1 = all frames)
    
    Returns:
        List of (frame_index, action_dict) tuples
    """
    frames = []
    
    # Find the index closest to start_time
    start_idx = 0
    min_diff = float('inf')
    for i, action in enumerate(actions):
        diff = abs(action.get('renderTime', 0) - start_time)
        if diff < min_diff:
            min_diff = diff
            start_idx = i
    
    # Extract frames at specified intervals
    # First, add frames before the start point (if any)
    if num_frames_before > 0:
        # Go backwards from start_idx in intervals
        for offset in range(num_frames_before, 0, -frame_interval):
            idx = start_idx - offset
            if idx >= 0:
                frames.append((idx, actions[idx]))
    
    # Add frames from start point onwards
    for offset in range(0, num_frames_after, frame_interval):
        idx = start_idx + offset
        if idx < len(actions):
            frames.append((idx, actions[idx]))
    
    return frames


def get_action_string(action: dict) -> str:
    """Convert action dict to human-readable string."""
    act = action.get('action', {})
    keys = []
    
    if act.get('forward', False):
        keys.append('W')
    if act.get('back', False):
        keys.append('S')
    if act.get('left', False):
        keys.append('A')
    if act.get('right', False):
        keys.append('D')
    if act.get('jump', False):
        keys.append('SPACE')
    if act.get('sprint', False):
        keys.append('SPRINT')
    if act.get('sneak', False):
        keys.append('SHIFT')
    
    camera = act.get('camera', [0, 0])
    if camera[0] != 0 or camera[1] != 0:
        keys.append(f'CAM({camera[0]:.1f},{camera[1]:.1f})')
    
    if not keys:
        return 'IDLE'
    return ' + '.join(keys)


def map_render_time_to_frame(render_time_ms: float, meta: dict) -> int:
    """
    Map a render time (epoch milliseconds) to a video frame number using metadata.
    
    Args:
        render_time_ms: Render time in epoch milliseconds
        meta: Camera metadata dict containing frame_mapping list
    
    Returns:
        Frame number in the video
    """
    # Get the frame_mapping list from the metadata dict
    frame_mapping = meta.get('frame_mapping', [])
    
    # Find the closest match
    min_diff = float('inf')
    best_frame = 0
    
    for entry in frame_mapping:
        diff = abs(entry['renderTime_ms'] - render_time_ms)
        if diff < min_diff:
            min_diff = diff
            best_frame = entry['frame_index']
    
    return best_frame


def extract_and_annotate_frame(
    video_path: str,
    frame_num: int,
    alpha_action: dict,
    bravo_action: dict,
    output_path: str,
    episode_id: int,
    annotate: bool = True
) -> bool:
    """
    Extract a frame from video and optionally annotate it with action information.
    
    Args:
        video_path: Path to the video file
        frame_num: Frame number to extract
        alpha_action: Alpha bot's action dict
        bravo_action: Bravo bot's action dict
        output_path: Path to save annotated frame
        episode_id: Episode ID for annotation
        annotate: Whether to add visual annotations (default True)
    
    Returns:
        True if successful, False otherwise
    """
    cap = cv2.VideoCapture(video_path)
    
    # Seek to frame
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
    ret, frame = cap.read()
    cap.release()
    
    if not ret:
        print(f"Failed to extract frame {frame_num} from {video_path}")
        return False
    
    if annotate:
        # Get frame dimensions
        height, width = frame.shape[:2]
        
        # Add text annotations
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.7
        thickness = 2
        
        # Background for text (semi-transparent black)
        overlay = frame.copy()
        
        # Alpha bot info (top-left)
        alpha_text = f"Alpha: {get_action_string(alpha_action)}"
        alpha_pos = get_action_string(alpha_action).replace('IDLE', 'STATIC')
        text_size = cv2.getTextSize(alpha_text, font, font_scale, thickness)[0]
        cv2.rectangle(overlay, (10, 10), (20 + text_size[0], 40 + text_size[1]), (0, 0, 0), -1)
        cv2.putText(frame, alpha_text, (15, 35), font, font_scale, (0, 255, 0), thickness)
        
        # Bravo bot info (top-left, below Alpha)
        bravo_text = f"Bravo: {get_action_string(bravo_action)}"
        text_size = cv2.getTextSize(bravo_text, font, font_scale, thickness)[0]
        cv2.rectangle(overlay, (10, 50), (20 + text_size[0], 80 + text_size[1]), (0, 0, 0), -1)
        cv2.putText(frame, bravo_text, (15, 75), font, font_scale, (0, 255, 255), thickness)
        
        # Episode and frame info (bottom-left)
        info_text = f"Episode {episode_id} | Frame {frame_num} | Time: {alpha_action.get('relativeTimeMs', 0)/1000.0:.2f}s"
        text_size = cv2.getTextSize(info_text, font, font_scale * 0.8, thickness)[0]
        cv2.rectangle(overlay, (10, height - 40), (20 + text_size[0], height - 10), (0, 0, 0), -1)
        cv2.putText(frame, info_text, (15, height - 18), font, font_scale * 0.8, (255, 255, 255), thickness)
        
        # Blend overlay with original frame
        cv2.addWeighted(overlay, 0.3, frame, 0.7, 0, frame)
    
    # Save frame
    cv2.imwrite(output_path, frame)
    if not annotate:
        print(f"Saved raw frame: {output_path}")
    else:
        print(f"Saved annotated frame: {output_path}")
    return True


def process_episode(
    episode_id: str,
    output_dir: Path,
    video_dir: Path,
    action_dir: Path,
    num_frames: int = 40,
    frames_before: int = 5
) -> None:
    """
    Process a single episode to extract motion frames.
    
    Args:
        episode_id: Episode identifier (e.g., "20251107_050025_000000")
        output_dir: Directory to save extracted frames
        video_dir: Directory containing videos
        action_dir: Directory containing action JSON files
        num_frames: Number of frames to extract after movement starts
        frames_before: Number of frames to extract before movement starts
    """
    print(f"\n{'='*60}")
    print(f"Processing episode: {episode_id}")
    print(f"{'='*60}")
    
    # Find all files for this episode
    alpha_video = None
    bravo_video = None
    alpha_meta = None
    bravo_meta = None
    alpha_actions = None
    bravo_actions = None
    
    # Check which instance (0 or 1) this episode belongs to
    for instance in ['000', '001']:
        for bot in ['Alpha', 'Bravo']:
            video_pattern = f"{episode_id}_{bot}_instance_{instance}_camera.mp4"
            meta_pattern = f"{episode_id}_{bot}_instance_{instance}_camera_meta.json"
            action_pattern = f"{episode_id}_{bot}_instance_{instance}.json"
            
            video_path = video_dir / video_pattern
            meta_path = video_dir / meta_pattern
            action_path = action_dir / action_pattern
            
            if video_path.exists() and meta_path.exists() and action_path.exists():
                if bot == 'Alpha':
                    alpha_video = str(video_path)
                    alpha_meta = load_json(str(meta_path))
                    alpha_actions = load_json(str(action_path))
                else:
                    bravo_video = str(video_path)
                    bravo_meta = load_json(str(meta_path))
                    bravo_actions = load_json(str(action_path))
    
    if not all([alpha_video, bravo_video, alpha_meta, bravo_meta, alpha_actions, bravo_actions]):
        print(f"Missing files for episode {episode_id}, skipping...")
        return
    
    print(f"Found Alpha video: {alpha_video}")
    print(f"Found Bravo video: {bravo_video}")
    print(f"Alpha actions: {len(alpha_actions)} frames")
    print(f"Bravo actions: {len(bravo_actions)} frames")
    
    # Find first movement time for each bot
    alpha_movement_result = find_first_movement_time(alpha_actions)
    bravo_movement_result = find_first_movement_time(bravo_actions)
    
    print(f"Alpha first movement: {alpha_movement_result[0] if alpha_movement_result else None}")
    print(f"Bravo first movement: {bravo_movement_result[0] if bravo_movement_result else None}")
    
    if alpha_movement_result is None and bravo_movement_result is None:
        print(f"No movement detected in episode {episode_id}, skipping...")
        return
    
    # Use the earliest movement time (the first time either bot starts moving)
    movement_results = [r for r in [alpha_movement_result, bravo_movement_result] if r is not None]
    first_movement_time, first_movement_action = min(movement_results, key=lambda x: x[0])
    
    which_bot_moved = "Alpha" if alpha_movement_result and first_movement_time == alpha_movement_result[0] else "Bravo"
    first_action_str = get_action_string(first_movement_action)
    
    print(f"First movement at time {first_movement_time} by {which_bot_moved}")
    print(f"First action: {first_action_str}")
    print(f"Extracting frames at 5-frame intervals: {frames_before} frames before and up to {num_frames} frames after this point...")
    
    # Get frames to extract for both bots (every 5th frame)
    frame_interval = 5
    alpha_frames = get_frames_around_time(alpha_actions, first_movement_time, num_frames, frames_before, frame_interval)
    bravo_frames = get_frames_around_time(bravo_actions, first_movement_time, num_frames, frames_before, frame_interval)
    
    print(f"Alpha frames to extract: {len(alpha_frames)}")
    print(f"Bravo frames to extract: {len(bravo_frames)}")
    
    # Create output directory for this episode with action suffix
    episode_folder_name = f"{episode_id}_action_{first_action_str.replace(' + ', '_').replace(' ', '_')}"
    episode_output_dir = output_dir / episode_folder_name
    episode_output_dir.mkdir(parents=True, exist_ok=True)
    
    # Create subdirectories for annotated and raw frames
    annotated_dir = episode_output_dir / "annotated"
    raw_dir = episode_output_dir / "raw"
    annotated_dir.mkdir(exist_ok=True)
    raw_dir.mkdir(exist_ok=True)
    
    # Get episode number from the episode_id string
    episode_num = int(episode_id.split('_')[2])
    
    # Prepare metadata
    metadata = {
        "episode_id": episode_id,
        "episode_number": episode_num,
        "first_movement_time_ms": first_movement_time,
        "first_movement_bot": which_bot_moved,
        "first_action": first_action_str,
        "frame_interval": frame_interval,
        "frames_before_movement": frames_before,
        "frames_after_movement": num_frames,
        "total_alpha_frames": len(alpha_frames),
        "total_bravo_frames": len(bravo_frames),
        "alpha_video": alpha_video,
        "bravo_video": bravo_video,
        "extracted_frames": {
            "alpha": [],
            "bravo": []
        }
    }
    
    # Extract frames from Alpha's perspective
    print(f"\nExtracting frames from Alpha's perspective...")
    for frame_num, (action_idx, action) in enumerate(alpha_frames):
        # Map action to video frame
        render_time = action.get('renderTime', 0)
        video_frame = map_render_time_to_frame(render_time, alpha_meta)
        
        # Find corresponding bravo action by matching renderTime
        bravo_action = min(
            bravo_actions,
            key=lambda a: abs(a.get('renderTime', 0) - render_time)
        )
        
        # Save annotated frame
        output_path_annotated = str(annotated_dir / f"alpha_frame_{frame_num:04d}_action_{action_idx:04d}_video_{video_frame:04d}.png")
        extract_and_annotate_frame(
            alpha_video,
            video_frame,
            action,
            bravo_action,
            output_path_annotated,
            episode_num,
            annotate=True
        )
        
        # Save raw frame
        output_path_raw = str(raw_dir / f"alpha_frame_{frame_num:04d}_action_{action_idx:04d}_video_{video_frame:04d}.png")
        extract_and_annotate_frame(
            alpha_video,
            video_frame,
            action,
            bravo_action,
            output_path_raw,
            episode_num,
            annotate=False
        )
        
        # Add to metadata
        metadata["extracted_frames"]["alpha"].append({
            "frame_number": frame_num,
            "action_index": action_idx,
            "video_frame": video_frame,
            "render_time_ms": render_time,
            "relative_time_ms": action.get('relativeTimeMs', 0),
            "action": get_action_string(action)
        })
    
    # Extract frames from Bravo's perspective
    print(f"\nExtracting frames from Bravo's perspective...")
    for frame_num, (action_idx, action) in enumerate(bravo_frames):
        # Map action to video frame
        render_time = action.get('renderTime', 0)
        video_frame = map_render_time_to_frame(render_time, bravo_meta)
        
        # Find corresponding alpha action by matching renderTime
        alpha_action = min(
            alpha_actions,
            key=lambda a: abs(a.get('renderTime', 0) - render_time)
        )
        
        # Save annotated frame
        output_path_annotated = str(annotated_dir / f"bravo_frame_{frame_num:04d}_action_{action_idx:04d}_video_{video_frame:04d}.png")
        extract_and_annotate_frame(
            bravo_video,
            video_frame,
            alpha_action,
            action,
            output_path_annotated,
            episode_num,
            annotate=True
        )
        
        # Save raw frame
        output_path_raw = str(raw_dir / f"bravo_frame_{frame_num:04d}_action_{action_idx:04d}_video_{video_frame:04d}.png")
        extract_and_annotate_frame(
            bravo_video,
            video_frame,
            alpha_action,
            action,
            output_path_raw,
            episode_num,
            annotate=False
        )
        
        # Add to metadata
        metadata["extracted_frames"]["bravo"].append({
            "frame_number": frame_num,
            "action_index": action_idx,
            "video_frame": video_frame,
            "render_time_ms": render_time,
            "relative_time_ms": action.get('relativeTimeMs', 0),
            "action": get_action_string(action)
        })
    
    # Save metadata to JSON file
    metadata_path = episode_output_dir / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"\nSaved metadata to: {metadata_path}")
    
    print(f"\nFinished processing episode {episode_id}")


def main():
    parser = argparse.ArgumentParser(
        description='Extract and annotate frames showing bot movements for motion consistency evaluation'
    )
    parser.add_argument(
        '--video-dir',
        type=str,
        default='output_batched/mc_multiplayer_eval',
        help='Directory containing video files'
    )
    parser.add_argument(
        '--action-dir',
        type=str,
        default='output',
        help='Directory containing action JSON files'
    )
    parser.add_argument(
        '--output-dir',
        type=str,
        default='analyze/motion_frames',
        help='Directory to save extracted frames'
    )
    parser.add_argument(
        '--num-frames',
        type=int,
        default=40,
        help='Number of frames to extract after movement starts'
    )
    parser.add_argument(
        '--frames-before',
        type=int,
        default=5,
        help='Number of frames to extract before movement starts'
    )
    parser.add_argument(
        '--episode-id',
        type=str,
        default=None,
        help='Process only a specific episode ID (e.g., 20251107_050025_000000)'
    )
    
    args = parser.parse_args()
    
    # Convert to Path objects
    video_dir = Path(args.video_dir)
    action_dir = Path(args.action_dir)
    output_dir = Path(args.output_dir)
    
    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Find all unique episode IDs
    episode_ids = set()
    for video_file in video_dir.glob('*_camera.mp4'):
        # Extract episode ID (timestamp + episode number)
        # Format: 20251107_050025_000000_Alpha_instance_000_camera.mp4
        parts = video_file.stem.split('_')
        episode_id = '_'.join(parts[:3])  # timestamp + episode number
        episode_ids.add(episode_id)
    
    episode_ids = sorted(episode_ids)
    print(f"Found {len(episode_ids)} episodes to process")
    
    # Process episodes
    if args.episode_id:
        # Process only specified episode
        if args.episode_id in episode_ids:
            process_episode(args.episode_id, output_dir, video_dir, action_dir, args.num_frames, args.frames_before)
        else:
            print(f"Episode {args.episode_id} not found")
    else:
        # Process all episodes
        for episode_id in episode_ids:
            process_episode(episode_id, output_dir, video_dir, action_dir, args.num_frames, args.frames_before)
    
    print(f"\n{'='*60}")
    print(f"All episodes processed. Frames saved to: {output_dir}")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()

