#!/usr/bin/env python3
"""
Auto-alignment wrapper script that waits for bots to complete episodes and aligns fresh videos.
"""

import os
import glob
import time
import subprocess
import sys
from pathlib import Path

def clean_old_files(output_dir="/output"):
    """Clean up old video and JSON files to avoid confusion."""
    print("Cleaning up old files...")
    
    old_videos = glob.glob(f"{output_dir}/*.mp4")
    old_jsons = glob.glob(f"{output_dir}/*.json")
    
    for file_path in old_videos + old_jsons:
        try:
            os.remove(file_path)
            print(f"  Removed: {file_path}")
        except Exception as e:
            print(f"  Warning: Could not remove {file_path}: {e}")
    
    print(f"Cleanup complete. Removed {len(old_videos)} videos and {len(old_jsons)} JSON files.")

def wait_for_fresh_files(output_dir="/output", timeout=600):
    """
    Wait for fresh bot video files to be generated after cleanup.
    Uses file modification time to ensure files are newly created.
    """
    print("Waiting for fresh bot videos to be generated...")
    
    start_time = time.time()
    cleanup_time = start_time  # Time when we started waiting
    
    while time.time() - start_time < timeout:
        # Look for Alpha and Bravo video files
        alpha_videos = glob.glob(f"{output_dir}/*Alpha*.mp4")
        bravo_videos = glob.glob(f"{output_dir}/*Bravo*.mp4")
        alpha_jsons = glob.glob(f"{output_dir}/*Alpha*.json")
        bravo_jsons = glob.glob(f"{output_dir}/*Bravo*.json")
        
        # Check if we have all required files
        if alpha_videos and bravo_videos and alpha_jsons and bravo_jsons:
            # Verify files are fresh (created after cleanup)
            all_files = alpha_videos + bravo_videos + alpha_jsons + bravo_jsons
            fresh_files = []
            
            for file_path in all_files:
                try:
                    file_mtime = os.path.getmtime(file_path)
                    if file_mtime > cleanup_time:
                        fresh_files.append(file_path)
                except Exception as e:
                    print(f"Warning: Could not check {file_path}: {e}")
            
            # We need all 4 files to be fresh
            if len(fresh_files) >= 4:
                print(f"Found fresh files:")
                print(f"  Alpha video: {alpha_videos[0]}")
                print(f"  Alpha JSON: {alpha_jsons[0]}")
                print(f"  Bravo video: {bravo_videos[0]}")
                print(f"  Bravo JSON: {bravo_jsons[0]}")
                return alpha_videos[0], alpha_jsons[0], bravo_videos[0], bravo_jsons[0]
            else:
                print(f"Found files but they appear to be old (fresh: {len(fresh_files)}/4)")
        
        elapsed = time.time() - start_time
        print(f"Waiting... ({elapsed:.0f}s elapsed, Alpha: {len(alpha_videos)}, Bravo: {len(bravo_videos)})")
        time.sleep(15)  # Check every 15 seconds
    
    print(f"Timeout after {timeout} seconds. Fresh files not found.")
    return None, None, None, None

def wait_for_episode_completion(output_dir="/output", timeout=600):
    """
    Wait for both bots to complete their episodes by monitoring file stability.
    Files are considered complete when they stop growing in size.
    """
    print("Monitoring for episode completion...")
    
    start_time = time.time()
    stable_duration = 30  # Files must be stable for 30 seconds
    
    while time.time() - start_time < timeout:
        alpha_videos = glob.glob(f"{output_dir}/*Alpha*.mp4")
        bravo_videos = glob.glob(f"{output_dir}/*Bravo*.mp4")
        alpha_jsons = glob.glob(f"{output_dir}/*Alpha*.json")
        bravo_jsons = glob.glob(f"{output_dir}/*Bravo*.json")
        
        if not (alpha_videos and bravo_videos and alpha_jsons and bravo_jsons):
            time.sleep(10)
            continue
        
        # Check file stability (size not changing)
        all_files = alpha_videos + bravo_videos + alpha_jsons + bravo_jsons
        
        # Get current file sizes
        current_sizes = {}
        for file_path in all_files:
            try:
                current_sizes[file_path] = os.path.getsize(file_path)
            except:
                current_sizes[file_path] = 0
        
        # Wait and check again
        time.sleep(stable_duration)
        
        # Check if sizes are stable
        stable = True
        for file_path in all_files:
            try:
                new_size = os.path.getsize(file_path)
                if new_size != current_sizes.get(file_path, 0):
                    stable = False
                    print(f"File still growing: {file_path} ({current_sizes.get(file_path, 0)} -> {new_size})")
                    break
            except:
                stable = False
                break
        
        if stable:
            print("All files appear stable. Episodes likely complete!")
            return alpha_videos[0], alpha_jsons[0], bravo_videos[0], bravo_jsons[0]
        else:
            print("Files still changing, waiting for completion...")
    
    print(f"Timeout waiting for episode completion.")
    return None, None, None, None

def main():
    """Main function."""
    output_dir = "/output"
    
    # Step 1: Clean up old files
    clean_old_files(output_dir)
    
    # Step 2: Wait for episodes to complete (files stable)
    alpha_video, alpha_json, bravo_video, bravo_json = wait_for_episode_completion(output_dir)
    
    if not all([alpha_video, alpha_json, bravo_video, bravo_json]):
        print("ERROR: Episodes did not complete successfully. Exiting.")
        sys.exit(1)
    
    # Step 3: Run align_videos.py with found files
    print("Starting video alignment...")
    cmd = [
        "python", os.path.join(os.path.dirname(__file__), "align_videos.py"),
        alpha_video, alpha_json,
        bravo_video, bravo_json,
        output_dir
    ]
    
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd)
    
    if result.returncode == 0:
        print("Video alignment completed successfully!")
        
        # List final output files
        aligned_videos = glob.glob(f"{output_dir}/*_aligned.mp4")
        if aligned_videos:
            print(f"Aligned video created: {aligned_videos[0]}")
        else:
            print("Warning: No aligned video found in output directory")
    else:
        print(f"Video alignment failed with return code: {result.returncode}")
        sys.exit(result.returncode)

if __name__ == "__main__":
    main()
