#!/usr/bin/env python3
"""
Video annotation script that overlays Minecraft action data onto video frames.
Takes a video file and corresponding JSON file with frame-by-frame action data.

This is an updated version with enhanced overlay display showing:
- Keyboard actions (WASD, jump, sneak, sprint)
- Mouse actions (camera yaw/pitch in degrees per second)
- Attack/Use actions
- Other actions (mine, place_block, mount, etc.)
- Hotbar selection
- Visual camera movement indicator
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


def radians_per_tick_to_degrees_per_second(value):
    """
    Convert from radians per 0.05s to degrees per second.
    """
    return np.degrees(value) * 20  # 20 ticks per second


def create_action_overlay(frame, action, frame_idx, total_frames):
    """
    Create an overlay on the frame showing the current actions.
    """
    height, width = frame.shape[:2]

    # Create a semi-transparent overlay area
    overlay = frame.copy()

    # Define overlay region (top-left corner)
    overlay_x = 10
    overlay_y = 10
    overlay_width = 350
    overlay_height = 250

    # Draw semi-transparent background
    cv2.rectangle(overlay, (overlay_x, overlay_y),
                  (overlay_x + overlay_width, overlay_y + overlay_height),
                  (0, 0, 0), -1)
    frame = cv2.addWeighted(overlay, 0.6, frame, 0.4, 0)

    # Font settings
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.6
    thickness = 2
    line_height = 25

    # Starting position for text
    text_x = overlay_x + 10
    text_y = overlay_y + 25

    # Frame counter
    cv2.putText(frame, f"Frame: {frame_idx}/{total_frames}",
                (text_x, text_y), font, font_scale, (255, 255, 255), thickness)
    text_y += line_height

    if action is None:
        cv2.putText(frame, "No action data",
                    (text_x, text_y), font, font_scale, (128, 128, 128), thickness)
        return frame

    act = action.get('action', {})

    # Keyboard actions - WASD
    wasd_text = ""
    if act.get('forward', False):
        wasd_text += "W "
    if act.get('left', False):
        wasd_text += "A "
    if act.get('back', False):
        wasd_text += "S "
    if act.get('right', False):
        wasd_text += "D "

    if not wasd_text:
        wasd_text = "---"

    cv2.putText(frame, f"Movement: {wasd_text.strip()}",
                (text_x, text_y), font, font_scale, (0, 255, 0), thickness)
    text_y += line_height

    # Jump and Sneak
    jump_sneak = []
    if act.get('jump', False):
        jump_sneak.append("JUMP")
    if act.get('sneak', False):
        jump_sneak.append("SNEAK")
    if act.get('sprint', False):
        jump_sneak.append("SPRINT")

    js_text = " ".join(jump_sneak) if jump_sneak else "---"
    cv2.putText(frame, f"Actions: {js_text}",
                (text_x, text_y), font, font_scale, (0, 255, 255), thickness)
    text_y += line_height

    # Attack/Use
    attack_use = []
    if act.get('attack', False):
        attack_use.append("ATTACK")
    if act.get('use', False):
        attack_use.append("USE")

    au_text = " ".join(attack_use) if attack_use else "---"
    cv2.putText(frame, f"Attack/Use: {au_text}",
                (text_x, text_y), font, font_scale, (255, 100, 100), thickness)
    text_y += line_height

    # Other actions (mine, place_block, place_entity, mount, dismount)
    other_actions = []
    if act.get('mine', False):
        other_actions.append("MINE")
    if act.get('place_block', False):
        other_actions.append("PLACE_BLOCK")
    if act.get('place_entity', False):
        other_actions.append("PLACE_ENTITY")
    if act.get('mount', False):
        other_actions.append("MOUNT")
    if act.get('dismount', False):
        other_actions.append("DISMOUNT")

    other_text = " ".join(other_actions) if other_actions else "---"
    cv2.putText(frame, f"Other: {other_text}",
                (text_x, text_y), font, font_scale, (200, 150, 255), thickness)
    text_y += line_height

    # Hotbar selection
    hotbar_keys = []
    for i in range(1, 10):
        if act.get(f'hotbar.{i}', False):
            hotbar_keys.append(str(i))

    hotbar_text = " ".join(hotbar_keys) if hotbar_keys else "---"
    cv2.putText(frame, f"Hotbar: {hotbar_text}",
                (text_x, text_y), font, font_scale, (150, 255, 150), thickness)
    text_y += line_height

    # Camera actions (mouse)
    camera = act.get('camera', [0, 0])
    yaw_raw = camera[0] if len(camera) > 0 else 0
    pitch_raw = camera[1] if len(camera) > 1 else 0

    # Convert to degrees per second
    yaw_dps = radians_per_tick_to_degrees_per_second(yaw_raw)
    pitch_dps = radians_per_tick_to_degrees_per_second(pitch_raw)

    cv2.putText(frame, f"Yaw:   {yaw_dps:+7.1f} deg/s",
                (text_x, text_y), font, font_scale, (255, 200, 0), thickness)
    text_y += line_height

    cv2.putText(frame, f"Pitch: {pitch_dps:+7.1f} deg/s",
                (text_x, text_y), font, font_scale, (255, 200, 0), thickness)
    text_y += line_height

    # Visual indicator for camera movement (arrow)
    # Draw an arrow showing camera direction
    arrow_center_x = overlay_x + overlay_width - 60
    arrow_center_y = overlay_y + overlay_height - 50
    arrow_scale = 0.5  # Scale factor for arrow length

    # Clamp the arrow length
    max_arrow_len = 40
    arrow_dx = int(-np.clip(yaw_dps * arrow_scale, -max_arrow_len, max_arrow_len))
    arrow_dy = int(-np.clip(pitch_dps * arrow_scale, -max_arrow_len, max_arrow_len))

    # Draw crosshair
    cv2.line(frame, (arrow_center_x - 20, arrow_center_y),
             (arrow_center_x + 20, arrow_center_y), (100, 100, 100), 1)
    cv2.line(frame, (arrow_center_x, arrow_center_y - 20),
             (arrow_center_x, arrow_center_y + 20), (100, 100, 100), 1)

    # Draw arrow if there's movement
    if abs(arrow_dx) > 1 or abs(arrow_dy) > 1:
        cv2.arrowedLine(frame, (arrow_center_x, arrow_center_y),
                        (arrow_center_x + arrow_dx, arrow_center_y + arrow_dy),
                        (0, 255, 255), 2, tipLength=0.3)
    else:
        cv2.circle(frame, (arrow_center_x, arrow_center_y), 3, (0, 255, 255), -1)

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
    if len(action_data) != total_frames:
        print(f"Warning: Mismatch between JSON frames ({len(action_data)}) and video frames ({total_frames}).")
        print(f"Will use available action data and pad with None if needed.")
    else:
        print(f"[OK] Verified: JSON contains {len(action_data)} frames matching video")

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
        action = action_data[frame_idx] if frame_idx < len(action_data) else None

        # Add overlay to frame
        processed_frame = create_action_overlay(frame, action, frame_idx, total_frames)

        # Write the frame
        out.write(processed_frame)

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
