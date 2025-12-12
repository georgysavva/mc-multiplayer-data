#!/usr/bin/env python3

"""
Copies and renames episode files (.json and .mp4) to a new destination directory,
removing the timestamp prefix from the filenames.
"""

import os
import sys
import shutil
import argparse

def main():
    """
    Main function to parse arguments and process files.
    """
    parser = argparse.ArgumentParser(
        description="Prepare episode files for evaluation by copying and renaming them."
    )
    parser.add_argument(
        "--episodes-dir",
        type=str,
        required=True,
        help="Path to the episodes root directory (containing 'output/' and 'aligned/' subdirectories)."
    )
    parser.add_argument(
        "--destination_dir",
        type=str,
        required=True,
        help="Path to the new destination directory for renamed files."
    )
    parser.add_argument(
        "--ignore_first_episode",
        action="store_true",
        help="If set, ignore the first episode (e.g., ..._instance_000) for each instance."
    )

    args = parser.parse_args()

    # Derive output and aligned directories from episodes-dir
    output_dir = os.path.join(args.episodes_dir, "output")
    output_aligned_dir = os.path.join(args.episodes_dir, "aligned")

    # --- 1. Validate inputs ---
    if not os.path.isdir(args.episodes_dir):
        print(f"Error: Episodes directory not found: {args.episodes_dir}", file=sys.stderr)
        sys.exit(1)

    if not os.path.isdir(output_dir):
        print(f"Error: Output directory not found: {output_dir}", file=sys.stderr)
        sys.exit(1)
        
    if not os.path.isdir(output_aligned_dir):
        print(f"Error: Aligned directory not found: {output_aligned_dir}", file=sys.stderr)
        sys.exit(1)

    # --- 2. Create destination directory ---
    destination_dir = os.path.join(args.destination_dir, "test")
    try:
        os.makedirs(destination_dir, exist_ok=True)
        print(f"Ensured destination directory exists: {destination_dir}")
    except OSError as e:
        print(f"Error: Could not create destination directory {destination_dir}: {e}", file=sys.stderr)
        sys.exit(1)

    # --- 3. Process files ---
    copied_count = 0
    skipped_count = 0
    not_found_count = 0

    print(f"\nProcessing files from: {output_aligned_dir}")

    for video_fname in os.listdir(output_aligned_dir):
        if not video_fname.endswith("_camera.mp4"):
            continue

        # Get the base name (with timestamp) from the video file
        # e.g., "20251111_071151_000031_Alpha_instance_000"
        base_with_timestamp = video_fname.replace("_camera.mp4", "")

        # --- Determine parts for checking and renaming ---
        parts = base_with_timestamp.split('_')
        if len(parts) <= 2:
            print(f"Warning: Filename format unexpected for {base_with_timestamp}, skipping.")
            skipped_count += 1
            continue
            
        # The episode ID is the 3rd part (index 2)
        # e.g., "000031" from "20251111_071151_000031_Alpha_instance_000"
        episode_id = parts[2]

        # --- Check for episode 0 ignore rule ---
        if args.ignore_first_episode and episode_id == "000000":
            print(f"Skipping ignored episode 0 (ID 000000): {base_with_timestamp}")
            skipped_count += 1
            continue

        # --- Find corresponding JSON file ---
        json_fname = base_with_timestamp + ".json"
        src_json_path = os.path.join(output_dir, json_fname)
        src_video_path = os.path.join(output_aligned_dir, video_fname)

        if not os.path.exists(src_json_path):
            print(f"Warning: JSON file not found for {video_fname}, skipping.")
            print(f"  (Expected at: {src_json_path})")
            not_found_count += 1
            continue
            
        # --- Determine new filenames ---
        # We already split 'parts' above
            
        # Re-join parts, skipping the first two (date and time)
        # e.g., "000031_Alpha_instance_000"
        new_base_name = "_".join(parts[2:])

        new_video_fname = new_base_name + "_camera.mp4"
        new_json_fname = new_base_name + ".json"

        dest_json_path = os.path.join(destination_dir, new_json_fname)
        dest_video_path = os.path.join(destination_dir, new_video_fname)

        # --- Copy files ---
        try:
            # print(f"Copying {src_json_path} -> {dest_json_path}")
            shutil.copy2(src_json_path, dest_json_path)
            
            # print(f"Copying {src_video_path} -> {dest_video_path}")
            shutil.copy2(src_video_path, dest_video_path)
            
            copied_count += 1
        except (IOError, os.error) as e:
            print(f"Error copying {base_with_timestamp}: {e}", file=sys.stderr)
            skipped_count += 1

    # --- 4. Print summary ---
    print("\n--- Processing Complete ---")
    print(f"Successfully copied file pairs: {copied_count}")
    print(f"Skipped files (rule or format): {skipped_count}")
    print(f"Missing JSON counterparts:     {not_found_count}")
    print("-----------------------------\n")

if __name__ == "__main__":
    main()
