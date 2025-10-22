#!/usr/bin/env python3
"""
Video annotation script that overlays Minecraft action data onto video frames.
Takes a video file and corresponding JSON file with frame-by-frame action data.
"""

import argparse
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np


def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Annotate video with Minecraft action data from JSON file"
    )
    parser.add_argument("video_file", type=str, help="Path to the input video file")
    parser.add_argument(
        "json_file", type=str, help="Path to the JSON file containing action data"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="output/",
        help="Output directory for annotated video (default: output/)",
    )

    return parser.parse_args()


def load_action_data(json_file):
    """Load action data from JSON file."""
    try:
        with open(json_file, "r") as f:
            data = json.load(f)
        print(f"Loaded {len(data)} frames of action data")
        return data
    except FileNotFoundError:
        print(f"Error: JSON file '{json_file}' not found")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON format in '{json_file}': {e}")
        sys.exit(1)


def format_action_text(frame_data):
    """Format action data into displayable text lines."""
    action = frame_data.get("action", {})
    text_lines = []

    # Movement actions
    movement_actions = ["forward", "back", "left", "right", "jump", "sprint", "sneak"]
    active_actions = [
        action_name
        for action_name in movement_actions
        if action.get(action_name, False)
    ]

    if active_actions:
        text_lines.extend(active_actions)

    # Camera movement
    camera = action.get("camera", [0, 0])
    if camera[0] != 0 or camera[1] != 0:
        text_lines.append(f"CameraYaw: {camera[0]:.3f}")
        text_lines.append(f"CameraPitch: {camera[1]:.3f}")

    return text_lines


def draw_text_lines(
    frame, text_lines, position, font_scale=0.6, color=(255, 255, 255), thickness=1
):
    """Draw multiple lines of text on the frame."""
    if not text_lines:
        return frame

    font = cv2.FONT_HERSHEY_SIMPLEX
    line_height = int(25 * font_scale)

    # Calculate total text height
    total_height = len(text_lines) * line_height

    # Start from bottom and work up
    x, y_bottom = position
    current_y = y_bottom - total_height

    for line in text_lines:
        current_y += line_height
        # Add black outline for better visibility
        cv2.putText(
            frame, line, (x, current_y), font, font_scale, (0, 0, 0), thickness + 1
        )
        cv2.putText(frame, line, (x, current_y), font, font_scale, color, thickness)

    return frame


def annotate_video(video_file, action_data, output_file):
    """Annotate video with action data."""
    # Open input video
    cap = cv2.VideoCapture(video_file)
    if not cap.isOpened():
        print(f"Error: Cannot open video file '{video_file}'")
        sys.exit(1)

    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"Video properties: {width}x{height}, {fps:.2f} FPS, {total_frames} frames")

    # Verify that the number of action frames matches video frames
    assert len(action_data) == total_frames, (
        f"Mismatch between JSON frames ({len(action_data)}) and video frames ({total_frames}). "
        f"The JSON file must contain exactly one action object per video frame."
    )
    print(f"* Verified: JSON contains {len(action_data)} frames matching video")

    # Define codec and create VideoWriter
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_file, fourcc, fps, (width, height))

    if not out.isOpened():
        print(f"Error: Cannot create output video file '{output_file}'")
        cap.release()
        sys.exit(1)

    # Process frames
    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Get action data for current frame
        if frame_idx < len(action_data):
            frame_data = action_data[frame_idx]
            text_lines = format_action_text(frame_data)

            # Position text in bottom right corner
            text_position = (width - 200, height - 20)
            frame = draw_text_lines(frame, text_lines, text_position)

        # Write the frame
        out.write(frame)

        frame_idx += 1
        if frame_idx % 100 == 0:
            print(f"Processed {frame_idx}/{total_frames} frames...")

    # Release everything
    cap.release()
    out.release()

    print(f"Annotation complete! Output saved to: {output_file}")


def main():
    """Main function."""
    args = parse_arguments()

    # Validate input files
    if not os.path.exists(args.video_file):
        print(f"Error: Video file '{args.video_file}' not found")
        sys.exit(1)

    if not os.path.exists(args.json_file):
        print(f"Error: JSON file '{args.json_file}' not found")
        sys.exit(1)

    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Generate output filename
    video_path = Path(args.video_file)
    output_filename = f"{video_path.stem}_annotated{video_path.suffix}"
    output_file = output_dir / output_filename

    print(f"Input video: {args.video_file}")
    print(f"Input JSON: {args.json_file}")
    print(f"Output: {output_file}")

    # Load action data and annotate video
    action_data = load_action_data(args.json_file)
    annotate_video(args.video_file, action_data, str(output_file))


if __name__ == "__main__":
    main()
