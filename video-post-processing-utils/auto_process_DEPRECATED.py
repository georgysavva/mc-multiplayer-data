#!/usr/bin/env python3
"""
DEPRECATED: This script is no longer maintained.

Please use the new batch processing system instead:
    output-post-processing-utils/batch_process_all.py

The new script has the following advantages:
- Processes ALL episodes (not just the first one)
- Better error handling and recovery
- Organized output with done/ subdirectory
- Flexible processing options (annotation-only, alignment-only, etc.)
- Progress tracking and detailed reporting
- Handles Unicode encoding issues on Windows

Usage:
    cd output-post-processing-utils
    python batch_process_all.py --output-dir ../output

---

ORIGINAL DEPRECATED CODE BELOW:
This script only processes the FIRST episode pair found, which is why
you experienced the bug where only one video combination was processed.
"""

import os
import glob
import time
import subprocess
import sys
from pathlib import Path

def clean_old_files(output_dir="/output"):
    """Clean up old processed files."""
    print("🧹 Cleaning up old files...")
    
    old_files = glob.glob(f"{output_dir}/*.mp4") + glob.glob(f"{output_dir}/*.json")
    
    for file_path in old_files:
        try:
            os.remove(file_path)
            print(f"  Removed: {Path(file_path).name}")
        except Exception as e:
            print(f"  Warning: Could not remove {file_path}: {e}")
    
    print(f"✅ Cleanup complete.")

def wait_for_episode_completion(output_dir="/output", timeout=600):
    """Wait for episodes to complete using file stability detection."""
    print("⏳ Waiting for episodes to complete...")
    
    start_time = time.time()
    stable_duration = 10
    
    while time.time() - start_time < timeout:
        alpha_videos = glob.glob(f"{output_dir}/*Alpha*.mp4")
        bravo_videos = glob.glob(f"{output_dir}/*Bravo*.mp4")
        alpha_jsons = glob.glob(f"{output_dir}/*Alpha*.json")
        bravo_jsons = glob.glob(f"{output_dir}/*Bravo*.json")
        
        if not (alpha_videos and bravo_videos and alpha_jsons and bravo_jsons):
            time.sleep(10)
            continue
        
        # Check file stability
        all_files = alpha_videos + bravo_videos + alpha_jsons + bravo_jsons
        current_sizes = {f: os.path.getsize(f) for f in all_files}
        
        time.sleep(stable_duration)
        
        stable = all(os.path.getsize(f) == current_sizes[f] for f in all_files)
        
        if stable:
            print("✅ Episodes completed!")
            # BUG: Only returns the FIRST episode found, not all episodes!
            return alpha_videos[0], alpha_jsons[0], bravo_videos[0], bravo_jsons[0]
        else:
            print("📹 Files still changing, waiting...")
    
    return None, None, None, None

def create_aligned_video(alpha_video, alpha_json, bravo_video, bravo_json, output_dir):
    """Create aligned comparison video."""
    print("🔗 Creating aligned video...")
    
    cmd = [
        "python", "output-post-processing-utils/align_videos.py",
        alpha_video, alpha_json,
        bravo_video, bravo_json,
        output_dir
    ]
    
    result = subprocess.run(cmd)
    if result.returncode == 0:
        # Find the created aligned video
        aligned_videos = glob.glob(f"{output_dir}/*_aligned.mp4")
        return aligned_videos[0] if aligned_videos else None
    return None

def create_individual_annotations(alpha_video, alpha_json, bravo_video, bravo_json, output_dir):
    """Create annotated individual videos."""
    print("📝 Creating individual annotated videos...")
    
    success_count = 0
    annotated_files = []
    
    # Annotate Alpha video
    print(f"  📹 Annotating Alpha: {Path(alpha_video).name}")
    cmd = ["python", "output-post-processing-utils/annotate_video.py", alpha_video, alpha_json, "--output-dir", output_dir]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode == 0:
        success_count += 1
        # Construct the actual path that annotate_video.py creates
        alpha_annotated = str(Path(output_dir) / f"{Path(alpha_video).stem}_annotated.mp4")
        annotated_files.append(alpha_annotated)
        print(f"    ✅ Alpha annotated successfully")
    else:
        print(f"    ❌ Alpha annotation failed")
        if result.stderr:
            print(f"    Error: {result.stderr.decode()}")
    
    # Annotate Bravo video
    print(f"  📹 Annotating Bravo: {Path(bravo_video).name}")
    cmd = ["python", "output-post-processing-utils/annotate_video.py", bravo_video, bravo_json, "--output-dir", output_dir]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode == 0:
        success_count += 1
        # Construct the actual path that annotate_video.py creates
        bravo_annotated = str(Path(output_dir) / f"{Path(bravo_video).stem}_annotated.mp4")
        annotated_files.append(bravo_annotated)
        print(f"    ✅ Bravo annotated successfully")
    else:
        print(f"    ❌ Bravo annotation failed")
        if result.stderr:
            print(f"    Error: {result.stderr.decode()}")
    
    return success_count, annotated_files

def main():
    """Main processing function."""
    print("❌ DEPRECATED SCRIPT")
    print("This script is deprecated and has known bugs.")
    print("Please use the new batch processing system:")
    print("  cd output-post-processing-utils")
    print("  python batch_process_all.py --output-dir ../output")
    print()
    print("The new script processes ALL episodes, not just the first one.")
    sys.exit(1)

if __name__ == "__main__":
    main()
