#!/usr/bin/env python3
"""
Video Alignment Script

Aligns two MP4 videos based on timestamp data from corresponding JSON files
and creates a single video with frames concatenated vertically with a separator.

Usage:
    python align_videos.py video1.mp4 video1.json video2.mp4 video2.json ./output/
    python align_videos.py --threshold 30 video1.mp4 video1.json video2.mp4 video2.json ./output/
    python align_videos.py --help

Requirements:
    - numpy
    - opencv-python
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np


def load_timestamps(json_file: str) -> List[float]:
    """
    Load renderTime timestamps from JSON file.

    Args:
        json_file: Path to JSON file containing frame data

    Returns:
        List of renderTime timestamps in milliseconds
    """
    with open(json_file, "r") as f:
        data = json.load(f)

    timestamps = []
    for frame_data in data:
        if "renderTime" in frame_data:
            timestamps.append(float(frame_data["renderTime"]))

    return timestamps


def find_aligned_frames(
    timestamps1: List[float], timestamps2: List[float], threshold_ms: float = 50.0
) -> List[Tuple[int, int]]:
    """
    Find pairs of frame indices where timestamps differ by less than threshold.
    Uses efficient two-pointer algorithm since timestamps are monotonically increasing.

    Args:
        timestamps1: Timestamps from first video (monotonically increasing)
        timestamps2: Timestamps from second video (monotonically increasing)
        threshold_ms: Maximum timestamp difference in milliseconds

    Returns:
        List of tuples (index1, index2) for aligned frames
    """
    aligned_pairs = []

    i, j = 0, 0

    while i < len(timestamps1) and j < len(timestamps2):
        ts1, ts2 = timestamps1[i], timestamps2[j]
        diff = abs(ts1 - ts2)

        if diff <= threshold_ms:
            # Found a match within threshold
            aligned_pairs.append((i, j))
            i += 1
            j += 1
        elif ts1 < ts2:
            # timestamp1 is behind, advance it
            i += 1
        else:
            # timestamp2 is behind, advance it
            j += 1

    return aligned_pairs


def get_video_info(video_path: str) -> Tuple[int, int, float, int]:
    """
    Get video information.

    Args:
        video_path: Path to video file

    Returns:
        Tuple of (width, height, fps, total_frames)
    """
    cap = cv2.VideoCapture(video_path)

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    cap.release()

    return width, height, fps, total_frames


def read_frame_at_index(
    cap: cv2.VideoCapture, frame_index: int
) -> Optional[np.ndarray]:
    """
    Read a specific frame from video by index using existing capture object.

    Args:
        cap: OpenCV VideoCapture object
        frame_index: Frame index to read

    Returns:
        Frame as numpy array or None if failed
    """
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
    ret, frame = cap.read()
    return frame if ret else None


def align_videos(
    video1_path: str,
    json1_path: str,
    video2_path: str,
    json2_path: str,
    output_dir: str,
    threshold_ms: float = 50.0,
):
    """
    Align two videos based on timestamp data and create vertically concatenated output.

    Args:
        video1_path: Path to first video
        json1_path: Path to first video's JSON file
        video2_path: Path to second video
        json2_path: Path to second video's JSON file
        output_dir: Directory for output video
        threshold_ms: Maximum timestamp difference for alignment
    """
    print("Loading timestamps...")
    timestamps1 = load_timestamps(json1_path)
    timestamps2 = load_timestamps(json2_path)

    print(f"Video 1: {len(timestamps1)} frames")
    print(f"Video 2: {len(timestamps2)} frames")

    print("Finding aligned frames...")
    aligned_pairs = find_aligned_frames(timestamps1, timestamps2, threshold_ms)

    print(f"Found {len(aligned_pairs)} aligned frame pairs")

    if not aligned_pairs:
        print("No aligned frames found. Exiting.")
        return

    # Generate output filename from input video names
    video1_name = Path(video1_path).stem
    video2_name = Path(video2_path).stem
    output_filename = f"{video1_name}_{video2_name}_aligned.mp4"
    output_path = os.path.join(output_dir, output_filename)

    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)

    # Get video information
    width1, height1, _, _ = get_video_info(video1_path)
    width2, height2, _, _ = get_video_info(video2_path)

    print(f"Video 1: {width1}x{height1}")
    print(f"Video 2: {width2}x{height2}")

    # Assume videos have same dimensions as specified
    if width1 != width2:
        print(f"Warning: Video widths differ ({width1} vs {width2})")

    # Compute FPS from aligned frame timestamps
    first_idx1, first_idx2 = aligned_pairs[0]
    last_idx1, last_idx2 = aligned_pairs[-1]

    # Use average time difference between first and last aligned frames
    time_span_1 = timestamps1[last_idx1] - timestamps1[first_idx1]  # in ms
    time_span_2 = timestamps2[last_idx2] - timestamps2[first_idx2]  # in ms
    avg_time_span = (time_span_1 + time_span_2) / 2.0  # in ms

    frame_count = len(aligned_pairs)  # total number of frames
    if frame_count > 1 and avg_time_span > 0:
        output_fps = (frame_count * 1000.0) / avg_time_span  # frames per second
    else:
        output_fps = 20.0  # fallback to 30 FPS

    print(f"Computed FPS from timestamps: {output_fps:.2f}")

    output_width = max(width1, width2)
    output_height = height1 + height2 + 10  # Add 10 pixels for separator

    # Initialize video writer
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(
        output_path, fourcc, output_fps, (output_width, output_height)
    )

    print(
        f"Creating output video: {output_width}x{output_height} @ {output_fps:.2f} FPS"
    )
    print(f"Output file: {output_path}")
    print("Processing frames...")

    # Open video capture objects once
    cap1 = cv2.VideoCapture(video1_path)
    cap2 = cv2.VideoCapture(video2_path)

    try:
        # Process aligned frames
        for i, (idx1, idx2) in enumerate(aligned_pairs):
            if i % 100 == 0:
                print(f"Processing frame {i+1}/{len(aligned_pairs)}")

            # Read frames using existing capture objects
            frame1 = read_frame_at_index(cap1, idx1)
            frame2 = read_frame_at_index(cap2, idx2)

            if frame1 is None or frame2 is None:
                print(f"Warning: Failed to read frames at indices {idx1}, {idx2}")
                continue

            # Ensure frames have the same width for vertical concatenation
            if frame1.shape[1] != frame2.shape[1]:
                target_width = min(frame1.shape[1], frame2.shape[1])
                frame1 = frame1[:, :target_width, :]
                frame2 = frame2[:, :target_width, :]

            # Create 10-pixel black separator strip
            separator_height = 10
            separator_width = max(frame1.shape[1], frame2.shape[1])
            separator = np.zeros((separator_height, separator_width, 3), dtype=np.uint8)

            # Vertically concatenate frames with separator
            combined_frame = np.vstack((frame1, separator, frame2))

            # Write frame to output video
            out.write(combined_frame)

    finally:
        # Clean up
        cap1.release()
        cap2.release()
        out.release()

    print(f"Output video saved to: {output_path}")
    print(f"Total frames written: {len(aligned_pairs)}")


def main():
    """Main function to handle command line arguments."""
    parser = argparse.ArgumentParser(
        description="Align two MP4 videos based on timestamp data and create vertically concatenated output.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python align_videos.py video1.mp4 video1.json video2.mp4 video2.json ./output/
  python align_videos.py --threshold 30 video1.mp4 video1.json video2.mp4 video2.json ./output/
        """,
    )

    parser.add_argument("video1", help="Path to first video file")
    parser.add_argument("json1", help="Path to first video's JSON timestamp file")
    parser.add_argument("video2", help="Path to second video file")
    parser.add_argument("json2", help="Path to second video's JSON timestamp file")
    parser.add_argument(
        "output_dir", default="output/", help="Directory for output video file"
    )

    parser.add_argument(
        "--threshold",
        type=float,
        default=50.0,
        help="Maximum timestamp difference in milliseconds for frame alignment (default: 50.0)",
    )

    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable verbose output"
    )

    args = parser.parse_args()

    try:
        align_videos(
            args.video1,
            args.json1,
            args.video2,
            args.json2,
            args.output_dir,
            args.threshold,
        )
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
