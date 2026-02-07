#!/usr/bin/env python3
"""Align real camera recordings with Mineflayer action traces.

The primary mode uses **per-frame wallclock timestamps** embedded in the MKV
container (recorded with ``-use_wallclock_as_timestamps 1 -copyts -vsync 0``).
We extract per-frame PTS via ``ffprobe`` and merge them with the action
timestamps using a linear two-pointer scan (both sequences are non-decreasing).

A legacy computed-index mode (``frame_idx = round((action_time - camera_start)
* fps)``) is retained but **disabled by default**.  Set the flag below to
``True`` only when processing old recordings that lack wallclock timestamps.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import cv2

# ---------------------------------------------------------------------------
# Manual override: set to True to allow the legacy computed-index alignment
# for recordings that do not contain per-frame wallclock timestamps.
# ---------------------------------------------------------------------------
ALLOW_LEGACY_ALIGNMENT = False

# Default delay to apply to video (shifts video earlier, making it appear delayed)
DEFAULT_DELAY_VIDEO_BY_SEC = 0.0

# Unconsumed frames within this many seconds of the recording start/end are
# considered normal (the camera typically starts before and ends after the
# episode actions).
_BOUNDARY_GRACE_SEC = 10.0


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


# ---------------------------------------------------------------------------
# Per-frame timestamp extraction (wallclock mode)
# ---------------------------------------------------------------------------

def _extract_frame_timestamps(recording_path: Path) -> Optional[List[float]]:
    """Extract per-frame PTS (in seconds) from an MKV using ffprobe.

    Returns a **sorted** list of floats (one per video frame) or *None* if
    extraction fails.  When the MKV was recorded with
    ``-use_wallclock_as_timestamps 1 -copyts``, these values will be absolute
    Unix-epoch seconds (e.g. 1738540000.123).

    Sorting is necessary because ``ffprobe -show_entries packet=pts_time``
    returns timestamps in *decode* order, which differs from presentation
    order when B-frames are used.  Sorting restores presentation order so
    that index *i* in the returned list corresponds to frame *i* as decoded
    by ``cv2.VideoCapture``.
    """
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-select_streams", "v:0",
        "-show_entries", "packet=pts_time",
        "-of", "csv=p=0",
        str(recording_path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except FileNotFoundError:
        print("[align] ffprobe not found; falling back to legacy alignment", file=sys.stderr)
        return None
    except subprocess.TimeoutExpired:
        print("[align] ffprobe timed out; falling back to legacy alignment", file=sys.stderr)
        return None

    if result.returncode != 0:
        print(f"[align] ffprobe failed (rc={result.returncode}); falling back to legacy alignment",
              file=sys.stderr)
        return None

    timestamps: List[float] = []
    for line in result.stdout.strip().splitlines():
        line = line.strip()
        if not line or line.lower() == "n/a":
            continue
        try:
            timestamps.append(float(line))
        except ValueError:
            continue

    if not timestamps:
        return None

    # Sort to convert from decode order to presentation order (handles
    # B-frame reordering).  New recordings use -bf 0 which makes this a
    # no-op, but older recordings may still have B-frames.
    timestamps.sort()

    return timestamps


def _has_wallclock_timestamps(
    frame_timestamps: List[float],
    camera_meta: Dict[str, Any],
) -> bool:
    """Heuristic: wallclock PTS values are large Unix-epoch numbers (> 1e9).

    Legacy recordings have PTS starting near zero.  We also cross-check against
    the ``wallclock_timestamps`` flag in the metadata if available.
    """
    if camera_meta.get("wallclock_timestamps"):
        return True
    # Heuristic: first PTS > 1 billion ≈ 2001-09-09 → definitely epoch time
    if frame_timestamps and frame_timestamps[0] > 1e9:
        return True
    return False


# ---------------------------------------------------------------------------
# Two-pointer action ↔ frame matching (wallclock mode)
# ---------------------------------------------------------------------------

def _match_actions_to_frames(
    actions: List[Dict[str, Any]],
    frame_timestamps: List[float],
    delay_video_by_sec: float = 0.0,
) -> Tuple[List[int], Dict[str, Any]]:
    """Match each action to the closest video frame using absolute timestamps.

    Both ``action_times`` (from ``epochTime``) and ``frame_timestamps`` are
    non-decreasing sequences.  For each action we find the frame whose
    timestamp is closest (could be slightly before or after the action time),
    advancing a frame pointer so that each frame is used at most once.

    Returns ``(frame_indices, diagnostics)`` where *frame_indices* has one
    entry per action (the index into the recording to extract) and
    *diagnostics* is a dict with alignment quality stats.
    """
    n_actions = len(actions)
    n_frames = len(frame_timestamps)
    action_times = [float(a["epochTime"]) for a in actions]

    frame_indices: List[int] = []
    frame_ptr = 0

    # Track diagnostics
    time_deltas: List[float] = []      # frame_time - effective_action_time
    unmatched_actions_end = 0          # actions after last available frame

    for action_idx, action_time in enumerate(action_times):
        effective_time = action_time - delay_video_by_sec

        # Advance frame_ptr to find the best matching frame.
        # "Best" = frame whose timestamp is closest to effective_time,
        # but we never go backwards (frame_ptr only increases).
        if frame_ptr >= n_frames:
            # No more frames -- remaining actions are unmatched at the end
            unmatched_actions_end = n_actions - action_idx
            break

        # Advance past frames that are too early: move forward while the
        # *next* frame is still closer to effective_time than the current one.
        while (frame_ptr + 1 < n_frames and
               abs(frame_timestamps[frame_ptr + 1] - effective_time) <=
               abs(frame_timestamps[frame_ptr] - effective_time)):
            frame_ptr += 1

        # Record the match
        matched_frame = frame_ptr
        delta = frame_timestamps[matched_frame] - effective_time
        time_deltas.append(delta)
        frame_indices.append(matched_frame)

        # Consume this frame so the next action gets the next (or later) frame.
        frame_ptr += 1

    # --- Compute boundary statistics ---
    skipped_frames_start = 0
    skipped_frames_end = 0
    if frame_indices:
        skipped_frames_start = frame_indices[0]
        skipped_frames_end = max(0, n_frames - 1 - frame_indices[-1])

    # Count actions whose effective time falls before the first frame
    unmatched_actions_start = 0
    if frame_timestamps and action_times:
        for t in action_times:
            if (t - delay_video_by_sec) < frame_timestamps[0]:
                unmatched_actions_start += 1
            else:
                break

    # --- Check for duplicate frame usage ---
    frame_usage = Counter(frame_indices)
    duplicate_frames = {idx: cnt for idx, cnt in frame_usage.items() if cnt > 1}

    # --- Check for interior unconsumed frames ---
    # Frames within _BOUNDARY_GRACE_SEC of recording start/end are OK.
    # Any other unconsumed frame is flagged.
    consumed_set = set(frame_indices)
    rec_start = frame_timestamps[0] if frame_timestamps else 0.0
    rec_end = frame_timestamps[-1] if frame_timestamps else 0.0
    interior_unconsumed: List[int] = []
    for i in range(n_frames):
        if i in consumed_set:
            continue
        t = frame_timestamps[i]
        if (t - rec_start) <= _BOUNDARY_GRACE_SEC:
            continue  # within start grace period
        if (rec_end - t) <= _BOUNDARY_GRACE_SEC:
            continue  # within end grace period
        interior_unconsumed.append(i)

    diagnostics = {
        "n_actions": n_actions,
        "n_frames": n_frames,
        "n_matched": len(frame_indices),
        "skipped_frames_start": skipped_frames_start,
        "skipped_frames_end": skipped_frames_end,
        "unmatched_actions_start": unmatched_actions_start,
        "unmatched_actions_end": unmatched_actions_end,
        "mean_delta_sec": (sum(time_deltas) / len(time_deltas)) if time_deltas else 0.0,
        "max_abs_delta_sec": max(abs(d) for d in time_deltas) if time_deltas else 0.0,
        "min_delta_sec": min(time_deltas) if time_deltas else 0.0,
        "max_delta_sec": max(time_deltas) if time_deltas else 0.0,
        "duplicate_frame_count": len(duplicate_frames),
        "interior_unconsumed_count": len(interior_unconsumed),
    }

    return frame_indices, diagnostics


# ---------------------------------------------------------------------------
# Legacy computed-index mode
# ---------------------------------------------------------------------------

def _compute_frame_indices(
    actions: Iterable[Dict[str, Any]],
    camera_start_time_sec: float,
    fps: float,
    delay_video_by_sec: float = 0.0,
) -> List[int]:
    """Compute camera frame indices from action timestamps (legacy mode).
    
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


# ---------------------------------------------------------------------------
# Frame extraction (shared by both modes)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Metadata / mapping builders
# ---------------------------------------------------------------------------

def _build_action_mapping_wallclock(
    actions: List[Dict[str, Any]],
    frame_indices: List[int],
    frame_timestamps: List[float],
    delay_video_by_sec: float,
) -> List[Dict[str, Any]]:
    """Build frame-to-action mapping for wallclock-timestamp alignment."""
    mapping: List[Dict[str, Any]] = []
    for action_idx, (entry, frame_idx) in enumerate(zip(actions, frame_indices)):
        action_time_sec = float(entry.get("epochTime", 0.0))
        frame_time_sec = frame_timestamps[frame_idx] if frame_idx < len(frame_timestamps) else 0.0
        mapping.append(
            {
                "action_index": action_idx,
                "renderTime_ms": float(entry.get("renderTime", 0.0)),
                "action_time_sec": action_time_sec,
                "relative_time_ms": float(entry.get("relativeTimeMs", 0.0)),
                "frame_index": frame_idx,
                "frame_time_sec": frame_time_sec,
                "delta_sec": frame_time_sec - (action_time_sec - delay_video_by_sec),
            }
        )
    return mapping


def _build_action_mapping(
    actions: List[Dict[str, Any]],
    camera_start_time_sec: float,
    trim_start_sec: float,
    fps: float,
) -> List[Dict[str, Any]]:
    """Build frame-to-action mapping for aligned output metadata (legacy)."""
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


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def _print_wallclock_warnings(diagnostics: Dict[str, Any]) -> None:
    """Print warnings for duplicate frame usage and interior unconsumed frames."""
    dup = diagnostics.get("duplicate_frame_count", 0)
    if dup > 0:
        print(f"[align] WARNING: {dup} frame(s) consumed more than once "
              f"(multiple actions mapped to the same video frame)",
              file=sys.stderr)

    interior = diagnostics.get("interior_unconsumed_count", 0)
    if interior > 0:
        print(f"[align] WARNING: {interior} interior frame(s) unconsumed "
              f"(outside the {_BOUNDARY_GRACE_SEC:.0f}s start/end grace period)",
              file=sys.stderr)


def align_recording(config: AlignmentInput) -> Dict[str, Any]:
    """Align camera recording to action trace.

    Uses per-frame wallclock timestamps extracted from the MKV via ffprobe.
    Falls back to legacy computed-index mode **only** if
    ``ALLOW_LEGACY_ALIGNMENT`` is ``True``.
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

    # ------------------------------------------------------------------
    # Extract per-frame timestamps and decide alignment mode
    # ------------------------------------------------------------------
    frame_timestamps = _extract_frame_timestamps(recording_path)
    use_wallclock = (
        frame_timestamps is not None
        and _has_wallclock_timestamps(frame_timestamps, camera_meta)
    )

    if not use_wallclock:
        if not ALLOW_LEGACY_ALIGNMENT:
            reason = (
                "Frame timestamps not found or not wallclock"
                if frame_timestamps is None
                else "Frame timestamps present but not wallclock (PTS too small)"
            )
            raise RuntimeError(
                f"[align] {reason}. "
                f"Wallclock-timestamp alignment is required. "
                f"Set ALLOW_LEGACY_ALIGNMENT = True in {__file__} to permit "
                f"legacy computed-index alignment for old recordings."
            )
        return _align_legacy(
            config, actions, camera_meta, recording_path, fps, camera_start_time_sec,
        )

    # ------------------------------------------------------------------
    # Wallclock-timestamp alignment (primary path)
    # ------------------------------------------------------------------
    assert frame_timestamps is not None  # for type checker
    print(f"[align] Using wallclock timestamps ({len(frame_timestamps)} frames extracted)")

    frame_indices, diagnostics = _match_actions_to_frames(
        actions, frame_timestamps, config.delay_video_by_sec,
    )

    if not frame_indices:
        raise RuntimeError("No actions could be matched to video frames")

    # Trim actions to only those that were matched
    matched_actions = actions[: len(frame_indices)]

    _write_frames_by_index(recording_path, frame_indices, fps, config.output_video_path)

    action_times_sec = [float(a["epochTime"]) for a in matched_actions]
    mapping = _build_action_mapping_wallclock(
        matched_actions, frame_indices, frame_timestamps, config.delay_video_by_sec,
    )

    output_metadata = {
        "actions_path": str(config.actions_path),
        "camera_meta_path": str(config.camera_meta_path),
        "recording_path": str(recording_path),
        "aligned_video_path": str(config.output_video_path),
        "alignment_mode": "wallclock",
        "fps": fps,
        "camera_start_time_sec": camera_start_time_sec,
        "first_frame_time_sec": frame_timestamps[0] if frame_timestamps else None,
        "last_frame_time_sec": frame_timestamps[-1] if frame_timestamps else None,
        "total_video_frames": len(frame_timestamps),
        "first_action_time_sec": min(action_times_sec) if action_times_sec else None,
        "last_action_time_sec": max(action_times_sec) if action_times_sec else None,
        "delay_video_by_sec": config.delay_video_by_sec,
        "diagnostics": diagnostics,
        "frame_mapping": mapping,
    }

    config.output_metadata_path.parent.mkdir(parents=True, exist_ok=True)
    with config.output_metadata_path.open("w", encoding="utf-8") as fh:
        json.dump(output_metadata, fh)

    # Print diagnostics summary
    d = diagnostics
    print(f"[align] Matched {d['n_matched']}/{d['n_actions']} actions to "
          f"{d['n_frames']} video frames")
    print(f"[align] Mean delta: {d['mean_delta_sec']*1000:.1f}ms, "
          f"max |delta|: {d['max_abs_delta_sec']*1000:.1f}ms")
    if d['skipped_frames_start'] > 0 or d['skipped_frames_end'] > 0:
        print(f"[align] Skipped frames: {d['skipped_frames_start']} at start, "
              f"{d['skipped_frames_end']} at end")
    if d['unmatched_actions_start'] > 0 or d['unmatched_actions_end'] > 0:
        print(f"[align] Unmatched actions: {d['unmatched_actions_start']} at start, "
              f"{d['unmatched_actions_end']} at end")

    # Warnings for data-quality issues
    _print_wallclock_warnings(diagnostics)

    return output_metadata


def _align_legacy(
    config: AlignmentInput,
    actions: List[Dict[str, Any]],
    camera_meta: Dict[str, Any],
    recording_path: Path,
    fps: float,
    camera_start_time_sec: float,
) -> Dict[str, Any]:
    """Legacy computed-index alignment (only used when ALLOW_LEGACY_ALIGNMENT is True)."""
    print("[align] WARNING: using legacy computed-index alignment "
          "(ALLOW_LEGACY_ALIGNMENT=True)", file=sys.stderr)

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
        "alignment_mode": "legacy",
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
