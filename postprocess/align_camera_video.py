#!/usr/bin/env python3
"""Align real camera recordings with Mineflayer action traces.

This implementation rebuilds the aligned MP4 frame-by-frame so that its frame
count matches the action sequence exactly, mirroring the prismarine output.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List

import cv2

# Default delay to apply to video (shifts video earlier, making it appear delayed)
DEFAULT_DELAY_VIDEO_BY_SEC = 0.0


@dataclass
class AlignmentInput:
    actions_path: Path
    camera_meta_path: Path
    output_video_path: Path
    output_metadata_path: Path
    ffmpeg_path: str  # retained for CLI compatibility, unused internally
    margin_start: float  # unused but kept for backward compatibility
    margin_end: float    # unused but kept for backward compatibility
    delay_video_by_sec: float = DEFAULT_DELAY_VIDEO_BY_SEC  # shift video earlier by this amount


def _load_actions(path: Path) -> List[Dict[str, Any]]:
    with path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, list) or not data:
        raise ValueError(f"Action file {path} is empty or invalid")
    return data


def _ensure_camera_meta(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        meta = json.load(fh)
    for key in ("start_epoch_seconds", "fps", "recording_path"):
        if key not in meta:
            raise ValueError(f"Camera metadata {path} missing '{key}'")
    return meta



def _compute_frame_indices(
    actions: Iterable[Dict[str, Any]],
    camera_start_time_sec: float,
    fps: float,
    delay_video_by_sec: float = 0.0,
) -> List[int]:
    """Compute camera frame indices from action timestamps.
    
    Each action has epochTime (wall-clock time in seconds) which we subtract
    from the camera's start time and multiply by FPS to get the frame index.
    
    delay_video_by_sec shifts the video earlier (uses frames from earlier in the
    recording), making the video appear delayed relative to the actions.
    """
    indices: List[int] = []
    for entry in actions:
        action_time_sec = float(entry["epochTime"])
        # Subtract delay to get an earlier frame from the video
        effective_time_sec = action_time_sec - delay_video_by_sec
        frame_idx = int(round((effective_time_sec - camera_start_time_sec) * fps))
        indices.append(frame_idx)
    return indices


def _write_frames_by_index(
    recording_path: Path,
    frame_indices: List[int],
    fps: float,
    output_path: Path,
) -> None:
    """Extract frames from camera recording by seeking to each frame index.
    
    This handles duplicate frame indices (multiple actions per frame) correctly.
    """
    start_time = time.time()
    
    if not frame_indices:
        raise ValueError("No frames requested for alignment")

    cap = cv2.VideoCapture(str(recording_path))
    if not cap.isOpened():
        raise RuntimeError(f"Failed to open camera recording {recording_path}")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
    
    setup_time = time.time() - start_time
    read_start = time.time()

    # Read and write frames, caching the last frame to handle duplicates efficiently
    last_frame_idx = -1
    last_frame = None
    seeks_count = 0
    reads_count = 0
    cache_hits = 0
    
    for i, frame_idx in enumerate(frame_indices):
        if frame_idx < 0 or frame_idx >= total_frames:
            cap.release()
            writer.release()
            raise RuntimeError(
                f"Action {i} maps to frame {frame_idx}, but camera only has {total_frames} frames"
            )
        
        # Reuse cached frame if it's a duplicate
        if frame_idx == last_frame_idx and last_frame is not None:
            writer.write(last_frame)
            cache_hits += 1
        else:
            # Only seek if we need to go backwards or skip frames
            # For sequential reads, just continue reading
            if frame_idx != last_frame_idx + 1:
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                seeks_count += 1
            
            ret, frame = cap.read()
            reads_count += 1
            
            if not ret:
                cap.release()
                writer.release()
                raise RuntimeError(
                    f"Failed to read frame {frame_idx} from camera recording"
                )
            
            writer.write(frame)
            last_frame_idx = frame_idx
            last_frame = frame.copy()  # Cache for potential duplicates
    
    writer.release()
    cap.release()
    
    total_time = time.time() - start_time
    print(f"[align] Extracted {len(frame_indices)} frames in {total_time:.1f}s")


def _build_action_mapping(
    actions: List[Dict[str, Any]],
    camera_start_time_sec: float,
    trim_start_sec: float,
    fps: float,
) -> List[Dict[str, Any]]:
    """Build frame-to-action mapping for aligned output metadata."""
    mapping: List[Dict[str, Any]] = []
    for idx, entry in enumerate(actions):
        if "epochTime" not in entry:
            continue
        action_time_sec = float(entry["epochTime"])
        time_since_camera_start_sec = action_time_sec - camera_start_time_sec
        time_in_trimmed_video_sec = time_since_camera_start_sec - trim_start_sec
        frame_idx = int(round(time_in_trimmed_video_sec * fps))
        mapping.append(
            {
                "action_index": idx,
                "renderTime_ms": float(entry.get("renderTime", 0.0)),
                "action_time_sec": action_time_sec,
                "relative_time_ms": float(entry.get("relativeTimeMs", 0.0)),
                "time_since_camera_start_sec": time_since_camera_start_sec,
                "time_in_trimmed_video_sec": time_in_trimmed_video_sec,
                "frame_index": frame_idx,
            }
        )
    return mapping


def align_recording(config: AlignmentInput) -> Dict[str, Any]:
    """Align camera recording to action trace using wall-clock timestamps.
    
    The camera records with start_epoch_seconds (wall-clock time).
    Each action has epochTime (wall-clock time in seconds from renderTime).
    We compute: frame_index = (action_time - camera_start_time) * fps
    """
    actions = _load_actions(config.actions_path)
    camera_meta = _ensure_camera_meta(config.camera_meta_path)

    fps = float(camera_meta["fps"])
    camera_start_time_sec = float(camera_meta["start_epoch_seconds"])

    recording_path = Path(camera_meta["recording_path"])
    if not recording_path.is_absolute():
        recording_path = config.camera_meta_path.parent / recording_path
    if not recording_path.exists():
        alt = config.camera_meta_path.parent / recording_path.name
        if alt.exists():
            recording_path = alt
        else:
            raise FileNotFoundError(
                f"Camera recording not found at {recording_path} or {alt}"
            )
    
    action_times_sec = [x["epochTime"] for x in actions]
    frame_indices = _compute_frame_indices(
        actions, camera_start_time_sec, fps, config.delay_video_by_sec
    )

    _write_frames_by_index(recording_path, frame_indices, fps, config.output_video_path)

    first_action_time_sec = min(action_times_sec)
    last_action_time_sec = max(action_times_sec)
    trim_start_sec = frame_indices[0] / fps
    duration_sec = len(frame_indices) / fps

    mapping = _build_action_mapping(
        actions,
        camera_start_time_sec=camera_start_time_sec,
        trim_start_sec=trim_start_sec,
        fps=fps,
    )

    output_metadata = {
        "actions_path": str(config.actions_path),
        "camera_meta_path": str(config.camera_meta_path),
        "recording_path": str(recording_path),
        "aligned_video_path": str(config.output_video_path),
        "fps": fps,
        "camera_start_time_sec": camera_start_time_sec,
        "trim_start_sec": trim_start_sec,
        "trim_duration_sec": duration_sec,
        "first_action_time_sec": first_action_time_sec,
        "last_action_time_sec": last_action_time_sec,
        "delay_video_by_sec": config.delay_video_by_sec,
        "frame_mapping": mapping,
    }

    config.output_metadata_path.parent.mkdir(parents=True, exist_ok=True)
    with config.output_metadata_path.open("w", encoding="utf-8") as fh:
        json.dump(output_metadata, fh)

    return output_metadata


def parse_args(argv: List[str]) -> AlignmentInput:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--actions", required=True, type=Path)
    parser.add_argument("--camera-meta", required=True, type=Path)
    parser.add_argument("--output-video", required=True, type=Path)
    parser.add_argument("--output-metadata", type=Path)
    parser.add_argument("--margin-start", type=float, default=0.0)
    parser.add_argument("--margin-end", type=float, default=0.0)
    parser.add_argument("--ffmpeg", default="ffmpeg")  # kept for CLI compatibility
    parser.add_argument(
        "--delay-video-by",
        type=float,
        default=DEFAULT_DELAY_VIDEO_BY_SEC,
        help=f"Delay video by this many seconds (default: {DEFAULT_DELAY_VIDEO_BY_SEC})",
    )

    args = parser.parse_args(argv)

    output_metadata = args.output_metadata
    if output_metadata is None:
        output_metadata = args.output_video.with_name(args.output_video.stem + "_meta.json")

    return AlignmentInput(
        actions_path=args.actions,
        camera_meta_path=args.camera_meta,
        output_video_path=args.output_video,
        output_metadata_path=output_metadata,
        ffmpeg_path=args.ffmpeg,
        margin_start=max(0.0, args.margin_start),
        margin_end=max(0.0, args.margin_end),
        delay_video_by_sec=args.delay_video_by,
    )


def main(argv: List[str]) -> int:
    config = parse_args(argv)
    result = align_recording(config)
    print("Aligned video written to", result["aligned_video_path"])
    print("Metadata written to", config.output_metadata_path)
    print("Frames mapped:", len(result["frame_mapping"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
