#!/usr/bin/env python3
"""
Enhanced batch processing script that processes episodes one by one,
moving raw files to done/ and creating final products in aligned-annotated/.

Workflow:
1. Find all Alpha-Bravo episode pairs in output directory
2. For each episode:
   a. Annotate Alpha and Bravo videos (outputs to done/)
   b. Move raw Alpha/Bravo videos and JSONs to done/
   c. Align the annotated videos (output to aligned-annotated/)
3. Keep output/ directory clean with only unprocessed episodes
"""

import argparse
import glob
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Tuple


def move_raw_files_to_done(episode_files: Dict[str, str], output_dir: str) -> bool:
    """
    Move raw episode files (videos, JSONs, and meta JSONs) to the done/ directory.
    
    Args:
        episode_files: Dictionary containing paths to episode files
        output_dir: Base output directory
        
    Returns:
        True if successful, False otherwise
    """
    done_dir = os.path.join(output_dir, "done")
    os.makedirs(done_dir, exist_ok=True)
    
    files_to_move = [
        episode_files['alpha_video'],
        episode_files['alpha_json'],
        episode_files['bravo_video'],
        episode_files['bravo_json']
    ]
    
    # Also add meta files if they exist
    if 'alpha_meta' in episode_files:
        files_to_move.append(episode_files['alpha_meta'])
    if 'bravo_meta' in episode_files:
        files_to_move.append(episode_files['bravo_meta'])
    
    try:
        for file_path in files_to_move:
            if os.path.exists(file_path):
                filename = os.path.basename(file_path)
                dest_path = os.path.join(done_dir, filename)
                
                # Only move if not already there
                if not os.path.exists(dest_path):
                    shutil.move(file_path, dest_path)
                    print(f"    Moved: {filename} -> done/")
                else:
                    print(f"    Already in done/: {filename}")
        
        return True
    except Exception as e:
        print(f"  ERROR: Failed to move raw files: {e}")
        return False


def move_annotated_videos_to_done(episode_files: Dict[str, str], output_dir: str) -> bool:
    """
    Move annotated videos from main output directory to done/ subdirectory.
    This handles cases where annotate_video.py outputs to the wrong location.
    
    Args:
        episode_files: Dictionary containing paths to episode files
        output_dir: Base output directory
        
    Returns:
        True if successful, False otherwise
    """
    done_dir = os.path.join(output_dir, "done")
    os.makedirs(done_dir, exist_ok=True)
    
    # Get expected annotated video filenames
    alpha_video_path = Path(episode_files['alpha_video'])
    bravo_video_path = Path(episode_files['bravo_video'])
    
    alpha_annotated_name = f"{alpha_video_path.stem}_annotated{alpha_video_path.suffix}"
    bravo_annotated_name = f"{bravo_video_path.stem}_annotated{bravo_video_path.suffix}"
    
    # Check if annotated videos are in main output dir (wrong location)
    alpha_annotated_wrong = os.path.join(output_dir, alpha_annotated_name)
    bravo_annotated_wrong = os.path.join(output_dir, bravo_annotated_name)
    
    try:
        # Move Alpha annotated video if it's in the wrong place
        if os.path.exists(alpha_annotated_wrong):
            dest_path = os.path.join(done_dir, alpha_annotated_name)
            if not os.path.exists(dest_path):
                shutil.move(alpha_annotated_wrong, dest_path)
                print(f"    Moved annotated: {alpha_annotated_name} -> done/")
        
        # Move Bravo annotated video if it's in the wrong place
        if os.path.exists(bravo_annotated_wrong):
            dest_path = os.path.join(done_dir, bravo_annotated_name)
            if not os.path.exists(dest_path):
                shutil.move(bravo_annotated_wrong, dest_path)
                print(f"    Moved annotated: {bravo_annotated_name} -> done/")
        
        return True
    except Exception as e:
        print(f"  ERROR: Failed to move annotated videos: {e}")
        return False


def annotate_video(video_path: str, json_path: str, output_dir: str, script_dir: str) -> bool:
    """
    Annotate a single video using the annotate_video.py script.
    Outputs annotated video directly to done/ directory.
    
    Args:
        video_path: Path to input video
        json_path: Path to corresponding JSON file  
        output_dir: Base output directory
        script_dir: Directory containing the annotation script
        
    Returns:
        True if successful, False otherwise
    """
    script_path = os.path.join(script_dir, "annotate_video.py")
    
    # Create done subdirectory for annotated videos
    done_dir = os.path.join(output_dir, "done")
    os.makedirs(done_dir, exist_ok=True)
    
    cmd = [
        sys.executable, script_path,
        video_path, json_path,
        "--output-dir", done_dir
    ]
    
    print(f"    Running: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"    ERROR: Annotation failed with return code {e.returncode}")
        if e.stdout:
            print(f"    STDOUT: {e.stdout}")
        if e.stderr:
            print(f"    STDERR: {e.stderr}")
        return False


def align_videos(alpha_annotated: str, alpha_json: str, bravo_annotated: str, bravo_json: str, 
                output_dir: str, script_dir: str) -> bool:
    """
    Align two annotated videos using the align_videos.py script.
    Outputs aligned video to aligned-annotated/ directory.
    
    Args:
        alpha_annotated: Path to Alpha annotated video (in done/)
        alpha_json: Path to Alpha JSON file (in done/)
        bravo_annotated: Path to Bravo annotated video (in done/)
        bravo_json: Path to Bravo JSON file (in done/)
        output_dir: Base output directory
        script_dir: Directory containing the alignment script
        
    Returns:
        True if successful, False otherwise
    """
    script_path = os.path.join(script_dir, "align_videos.py")
    
    # Create aligned-annotated subdirectory for final products
    aligned_dir = os.path.join(output_dir, "aligned-annotated")
    os.makedirs(aligned_dir, exist_ok=True)
    
    cmd = [
        sys.executable, script_path,
        alpha_annotated, alpha_json,
        bravo_annotated, bravo_json,
        aligned_dir
    ]
    
    print(f"    Running: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"    ERROR: Alignment failed with return code {e.returncode}")
        if e.stdout:
            print(f"    STDOUT: {e.stdout}")
        if e.stderr:
            print(f"    STDERR: {e.stderr}")
        return False


def find_episode_pairs(output_dir: str) -> List[Dict[str, str]]:
    """
    Find all complete Alpha-Bravo episode pairs in the output directory.
    Only looks for raw files (not in done/ or aligned-annotated/ subdirectories).
    
    Args:
        output_dir: Path to output directory
        
    Returns:
        List of dictionaries containing file paths for each episode
    """
    episodes = {}

    # Find all MP4 and JSON files in the main output directory (not subdirectories)
    video_files = glob.glob(os.path.join(output_dir, "*_camera.mp4"))
    json_files = glob.glob(os.path.join(output_dir, "*.json"))
    meta_files = glob.glob(os.path.join(output_dir, "*_meta.json"))

    # Parse video files
    for video_path in video_files:
        filename = os.path.basename(video_path)
        # Updated regex to handle timestamp prefix and optional _camera suffix:
        # YYYYMMDD_HHMMSS_episode_id_bot_name_instance_id[_camera].mp4
        match = re.match(
            r"(\d{8}_\d{6})_(\d{6})_(Alpha|Bravo)_instance_(\d{3})(?:_camera)?\.mp4$",
            filename,
        )
        if match:
            timestamp, episode_id, bot_name, instance_id = match.groups()

            if episode_id not in episodes:
                episodes[episode_id] = {}

            key = f"{bot_name.lower()}_video"
            episodes[episode_id][key] = video_path

    # Parse JSON files (excluding meta files)
    for json_path in json_files:
        filename = os.path.basename(json_path)
        # Skip meta files - they'll be handled separately
        if filename.endswith("_meta.json") or filename.endswith("_episode_info.json"):
            continue
        # Updated regex to handle timestamp prefix: YYYYMMDD_HHMMSS_episode_id_bot_name_instance_id.json
        match = re.match(r'(\d{8}_\d{6})_(\d{6})_(Alpha|Bravo)_instance_(\d{3})\.json$', filename)
        if match:
            timestamp, episode_id, bot_name, instance_id = match.groups()

            if episode_id not in episodes:
                episodes[episode_id] = {}

            key = f"{bot_name.lower()}_json"
            episodes[episode_id][key] = json_path

    # Parse meta JSON files
    for meta_path in meta_files:
        filename = os.path.basename(meta_path)
        # Updated regex to handle timestamp prefix: YYYYMMDD_HHMMSS_episode_id_bot_name_instance_id_meta.json
        match = re.match(r'(\d{8}_\d{6})_(\d{6})_(Alpha|Bravo)_instance_(\d{3})_meta\.json$', filename)
        if match:
            timestamp, episode_id, bot_name, instance_id = match.groups()

            if episode_id not in episodes:
                episodes[episode_id] = {}

            key = f"{bot_name.lower()}_meta"
            episodes[episode_id][key] = meta_path

    # Filter for complete episodes (must have all 6 files)
    complete_episodes = []
    required_keys = ['alpha_video', 'alpha_json', 'alpha_meta', 'bravo_video', 'bravo_json', 'bravo_meta']

    for episode_id, files in episodes.items():
        if all(key in files for key in required_keys):
            files['episode_id'] = episode_id
            complete_episodes.append(files)

    # Sort by episode ID
    complete_episodes.sort(key=lambda x: x['episode_id'])

    return complete_episodes


def get_annotated_path(original_video_path: str, done_dir: str) -> str:
    """
    Get the expected path for an annotated video in the done/ directory.
    
    Args:
        original_video_path: Path to original video
        done_dir: Path to done directory
        
    Returns:
        Expected path to annotated video
    """
    video_path = Path(original_video_path)
    annotated_filename = f"{video_path.stem}_annotated{video_path.suffix}"
    return os.path.join(done_dir, annotated_filename)


def main():
    parser = argparse.ArgumentParser(
        description="Enhanced batch processing with file organization",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
This script processes episodes one by one:
1. Finds Alpha-Bravo pairs in output directory
2. Annotates videos (outputs to done/)
3. Moves raw files to done/
4. Aligns annotated videos (outputs to aligned-annotated/)

Directory structure after processing:
  output/
  ├── (remaining unprocessed episodes)
  ├── done/
  │   ├── (raw videos and JSONs)
  │   └── (annotated videos)
  └── aligned-annotated/
      └── (final aligned videos)

Examples:
  python batch_process_all.py --output-dir ../output
  python batch_process_all.py --output-dir ../output --annotation-only
        """
    )

    parser.add_argument(
        "--output-dir",
        required=True,
        help="Directory containing episode files"
    )
    parser.add_argument(
        "--annotation-only",
        action="store_true",
        help="Only annotate videos, skip alignment"
    )
    parser.add_argument(
        "--alignment-only", 
        action="store_true",
        help="Only align already annotated videos, skip annotation"
    )
    parser.add_argument(
        "--force-reprocess",
        action="store_true", 
        help="Reprocess episodes even if already processed"
    )

    args = parser.parse_args()

    # Resolve paths
    output_dir = os.path.abspath(args.output_dir)
    script_dir = os.path.dirname(os.path.abspath(__file__))

    print(f"Processing episodes in: {output_dir}")
    print(f"Using scripts from: {script_dir}")

    # Create directories
    done_dir = os.path.join(output_dir, "done")
    aligned_dir = os.path.join(output_dir, "aligned-annotated")
    os.makedirs(done_dir, exist_ok=True)
    os.makedirs(aligned_dir, exist_ok=True)

    # Find episodes to process
    episodes = find_episode_pairs(output_dir)

    if not episodes:
        print("\nNo unprocessed episodes found in output directory.")
        print("All episodes may have already been moved to done/")
        return

    print(f"\nFound {len(episodes)} unprocessed episodes:")
    for episode in episodes:
        print(f"  Episode {episode['episode_id']}")

    # Process each episode
    annotation_success = 0
    alignment_success = 0

    for i, episode_files in enumerate(episodes, 1):
        episode_id = episode_files['episode_id']

        print(f"\n{'='*60}")
        print(f"Processing Episode {episode_id} ({i}/{len(episodes)})")
        print(f"  Episode files: {episode_files}")
        print(f"{'='*60}")

        # Step 1: Annotation (unless alignment-only mode)
        if not args.alignment_only:
            print("Step 1: Annotating videos...")

            # Annotate Alpha video
            print(f"  Annotating Alpha video for episode {episode_id}")
            alpha_success = annotate_video(
                episode_files['alpha_video'],
                episode_files['alpha_json'],
                output_dir,
                script_dir
            )

            # Annotate Bravo video
            print(f"  Annotating Bravo video for episode {episode_id}")
            bravo_success = annotate_video(
                episode_files['bravo_video'],
                episode_files['bravo_json'],
                output_dir,
                script_dir
            )

            if alpha_success and bravo_success:
                print(f"  * Annotation completed for episode {episode_id}")

                # Move annotated videos to done/ (in case they ended up in wrong location)
                print(f"  Moving annotated videos to done/...")
                move_annotated_videos_to_done(episode_files, output_dir)

                # Move raw files to done/
                print(f"  Moving raw files to done/...")
                move_success = move_raw_files_to_done(episode_files, output_dir)

                if move_success:
                    annotation_success += 1
                    print(f"  * Raw files moved to done/ for episode {episode_id}")
                else:
                    print(f"  X Failed to move raw files for episode {episode_id}")
                    continue
            else:
                print(f"  X Annotation failed for episode {episode_id}")
                continue

        # Step 2: Alignment (unless annotation-only mode)
        if not args.annotation_only:
            print("Step 2: Aligning annotated videos...")

            # Get paths to annotated videos in done/
            alpha_annotated = get_annotated_path(episode_files['alpha_video'], done_dir)
            bravo_annotated = get_annotated_path(episode_files['bravo_video'], done_dir)

            # Get paths to JSON files in done/
            alpha_json_done = os.path.join(done_dir, os.path.basename(episode_files['alpha_json']))
            bravo_json_done = os.path.join(done_dir, os.path.basename(episode_files['bravo_json']))

            # Check if annotated videos exist
            if os.path.exists(alpha_annotated) and os.path.exists(bravo_annotated):
                print(f"  Aligning episode {episode_id}")
                alignment_result = align_videos(
                    alpha_annotated, alpha_json_done,
                    bravo_annotated, bravo_json_done,
                    output_dir, script_dir
                )

                if alignment_result:
                    print(f"  * Alignment completed for episode {episode_id}")
                    alignment_success += 1
                else:
                    print(f"  X Alignment failed for episode {episode_id}")
            else:
                print(f"  X Annotated videos not found for episode {episode_id}")
                print(f"    Looking for: {os.path.basename(alpha_annotated)}, {os.path.basename(bravo_annotated)}")

    # Summary
    print(f"\n{'='*60}")
    print("BATCH PROCESSING SUMMARY")
    print(f"{'='*60}")
    print(f"Total episodes processed: {len(episodes)}")

    if not args.alignment_only:
        print(f"Annotation successes: {annotation_success}")

    if not args.annotation_only:
        print(f"Alignment successes: {alignment_success}")

    # List final output files
    print(f"\nFinal directory structure in {output_dir}:")

    # Count remaining unprocessed files
    remaining_videos = glob.glob(os.path.join(output_dir, "*.mp4"))
    remaining_jsons = glob.glob(os.path.join(output_dir, "*.json"))
    print(f"  Unprocessed files: {len(remaining_videos)} videos, {len(remaining_jsons)} JSONs")

    # Count files in done/
    done_files = glob.glob(os.path.join(done_dir, "*"))
    print(f"  done/: {len(done_files)} files")

    # Count files in aligned-annotated/
    aligned_files = glob.glob(os.path.join(aligned_dir, "*.mp4"))
    print(f"  aligned-annotated/: {len(aligned_files)} final videos")

    if aligned_files:
        print(f"\nFinal products in aligned-annotated/:")
        for f in sorted(aligned_files):
            print(f"    {os.path.basename(f)}")


if __name__ == "__main__":
    main()
