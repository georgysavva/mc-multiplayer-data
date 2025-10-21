#!/usr/bin/env python3
"""Align Mineflayer actions with camera recordings using explicit file paths."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple

import cv2
import numpy as np

try:
    # When imported as package module
    from .align_camera_video import AlignmentInput, align_recording
except ImportError:  # pragma: no cover - direct script invocation fallback
    from align_camera_video import AlignmentInput, align_recording


def _resize_to_height(frame: np.ndarray, target_height: int) -> np.ndarray:
    if target_height <= 0 or frame.shape[0] == target_height:
        return frame
    scale = target_height / frame.shape[0]
    new_width = max(1, int(round(frame.shape[1] * scale)))
    return cv2.resize(frame, (new_width, target_height), interpolation=cv2.INTER_AREA)


def _build_side_by_side(prismarine: Path, aligned: Path, output_path: Path) -> Tuple[int, float, float]:
    left = cv2.VideoCapture(str(prismarine))
    if not left.isOpened():
        raise RuntimeError(f"Failed to open mineflayer video {prismarine}")

    right = cv2.VideoCapture(str(aligned))
    if not right.isOpened():
        left.release()
        raise RuntimeError(f"Failed to open aligned camera video {aligned}")

    left_fps = float(left.get(cv2.CAP_PROP_FPS)) or 0.0
    right_fps = float(right.get(cv2.CAP_PROP_FPS)) or 0.0
    fps = right_fps if right_fps > 0 else left_fps if left_fps > 0 else 30.0

    left_height = int(left.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 0
    right_height = int(right.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 0
    target_height = right_height if right_height > 0 else left_height
    if target_height <= 0:
        left.release()
        right.release()
        raise RuntimeError("Unable to determine frame dimensions for comparison video")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    writer: Optional[cv2.VideoWriter] = None
    frames_written = 0
    mismatched_length = False

    try:
        while True:
            left_ok, left_frame = left.read()
            right_ok, right_frame = right.read()
            if not left_ok or not right_ok:
                mismatched_length = left_ok != right_ok
                break

            left_frame = _resize_to_height(left_frame, target_height)
            right_frame = _resize_to_height(right_frame, target_height)
            combined = np.hstack((left_frame, right_frame))

            if writer is None:
                height, width = combined.shape[:2]
                fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                writer = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))

            writer.write(combined)
            frames_written += 1
    finally:
        if writer is not None:
            writer.release()
        left.release()
        right.release()

    if frames_written == 0:
        output_path.unlink(missing_ok=True)
        raise RuntimeError("No overlapping frames to build comparison video")

    return frames_written, left_fps, right_fps if not mismatched_length else -abs(right_fps)


def process_bot_recording(
    *,
    actions_path: Path,
    camera_meta_path: Path,
    mineflayer_video_path: Path,
    output_dir: Path,
    aligned_video_path: Optional[Path] = None,
    aligned_metadata_path: Optional[Path] = None,
    comparison_output_path: Optional[Path] = None,
    generate_comparison: bool = False,
) -> Dict[str, str]:
    """Align a single bot's camera recording and optionally build a comparison video."""
    actions_path = actions_path.resolve()
    camera_meta_path = camera_meta_path.resolve()
    mineflayer_video_path = mineflayer_video_path.resolve()
    output_dir = output_dir.resolve()

    if not actions_path.exists():
        raise FileNotFoundError(f"Actions file not found: {actions_path}")
    if not camera_meta_path.exists():
        raise FileNotFoundError(f"Camera metadata not found: {camera_meta_path}")
    if not mineflayer_video_path.exists():
        raise FileNotFoundError(f"Mineflayer video not found: {mineflayer_video_path}")

    output_dir.mkdir(parents=True, exist_ok=True)

    if aligned_video_path is None:
        aligned_video_path = output_dir / f"{actions_path.stem}_camera_aligned.mp4"
    else:
        aligned_video_path = aligned_video_path.resolve()

    if aligned_metadata_path is None:
        aligned_metadata_path = aligned_video_path.with_name(aligned_video_path.stem + "_meta.json")
    else:
        aligned_metadata_path = aligned_metadata_path.resolve()

    alignment_input = AlignmentInput(
        actions_path=actions_path,
        camera_meta_path=camera_meta_path,
        output_video_path=aligned_video_path,
        output_metadata_path=aligned_metadata_path,
        ffmpeg_path="ffmpeg",
        margin_start=0.0,
        margin_end=0.0,
    )

    metadata = align_recording(alignment_input)
    metadata["aligned_metadata_path"] = str(aligned_metadata_path)
    metadata["comparison_video_path"] = None

    if generate_comparison:
        if comparison_output_path is None:
            comparison_output_path = output_dir / f"{actions_path.stem}_comparison.mp4"
        else:
            comparison_output_path = comparison_output_path.resolve()

        frames_written, left_fps, right_fps = _build_side_by_side(
            mineflayer_video_path,
            aligned_video_path,
            comparison_output_path,
        )
        metadata["comparison_video_path"] = str(comparison_output_path)
        metadata["comparison_frames"] = frames_written
        metadata["comparison_prismarine_fps"] = left_fps
        metadata["comparison_camera_fps"] = right_fps

    with aligned_metadata_path.open("w", encoding="utf-8") as fh:
        json.dump(metadata, fh)

    return {
        "aligned_video_path": str(aligned_video_path),
        "aligned_metadata_path": str(aligned_metadata_path),
        "comparison_video_path": metadata["comparison_video_path"],
    }


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--actions", type=Path, required=True)
    parser.add_argument("--camera-meta", type=Path, required=True)
    parser.add_argument("--mineflayer-video", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--aligned-video", type=Path)
    parser.add_argument("--aligned-meta", type=Path)
    parser.add_argument("--comparison-output", type=Path)
    parser.add_argument("--comparison-video", action="store_true", help="Generate comparison video")
    return parser.parse_args(list(argv))


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    result = process_bot_recording(
        actions_path=args.actions,
        camera_meta_path=args.camera_meta,
        mineflayer_video_path=args.mineflayer_video,
        output_dir=args.output_dir,
        aligned_video_path=args.aligned_video,
        aligned_metadata_path=args.aligned_meta,
        comparison_output_path=args.comparison_output,
        generate_comparison=args.comparison_video,
    )
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main(sys.argv[1:]))
