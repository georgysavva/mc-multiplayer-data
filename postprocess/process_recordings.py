#!/usr/bin/env python3
"""Run camera alignment and generate side-by-side comparison videos."""
from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple

import cv2
import numpy as np
from align_camera_video import AlignmentInput, align_recording


@dataclass
class BotConfig:
    name: str
    actions_suffix: str
    camera_meta: Path
    output_dir: Path


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--actions-dir",
        type=Path,
        required=True,
        help="Directory containing Mineflayer action traces (*.json)",
    )
    parser.add_argument(
        "--camera-prefix",
        type=Path,
        required=True,
        help="Directory containing camera outputs (expects output_alpha/ and output_bravo/)",
    )
    parser.add_argument(
        "--bot",
        type=str,
        choices=["Alpha", "Bravo"],
        required=True,
        help="Which bot to process",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Optional base directory for outputs (default: ./aligned/<bot>)",
    )
    parser.add_argument(
        "--comparison-video",
        action="store_true",
        help="Generate side-by-side comparison video (slower, default: skip)",
    )
    parser.add_argument(
        "--episode-file",
        type=Path,
        default=None,
        help="Process single episode file (overrides directory processing)",
    )
    parser.add_argument(
        "--eval",
        action="store_true",
        help="Eval mode: crop video to start 5 frames after last sneak action",
    )
    return parser.parse_args(list(argv))


def build_bot_config(
    actions_dir: Path, camera_prefix: Path, bot: str, output_base: Optional[Path]
) -> Dict[str, BotConfig]:
    """Return BotConfig mapping for the selected bot.

    - Output directory defaults to ./aligned/<bot> unless overridden by --output-dir.
    - camera_prefix may already be an output_{alpha|bravo}/<instance> directory
      (as in orchestration); handle both prefixed and non-prefixed forms.
    """
    output_dir = (output_base or Path.cwd() / "aligned")
    if bot == "Alpha":
        # If camera_prefix already points into output_alpha, use it directly
        if "output_alpha" in str(camera_prefix):
            camera_meta = camera_prefix / "camera_alpha_meta.json"
        else:
            camera_meta = camera_prefix / "output_alpha" / "camera_alpha_meta.json"
        return {
            "Alpha": BotConfig(
                name="Alpha",
                actions_suffix="_Alpha_",
                camera_meta=camera_meta,
                output_dir=output_dir,
            )
        }
    else:
        # If camera_prefix already points into output_bravo, use it directly
        if "output_bravo" in str(camera_prefix):
            camera_meta = camera_prefix / "camera_bravo_meta.json"
        else:
            camera_meta = camera_prefix / "output_bravo" / "camera_bravo_meta.json"
        return {
            "Bravo": BotConfig(
                name="Bravo",
                actions_suffix="_Bravo_",
                camera_meta=camera_meta,
                output_dir=output_dir,
            )
        }


def bot_for_actions(path: Path, configs: Dict[str, BotConfig]) -> Optional[BotConfig]:
    for config in configs.values():
        if config.actions_suffix in path.name:
            return config
    return None


def resolve_actions_dir(explicit: Path) -> Path:
    actions_dir = explicit
    if not actions_dir.exists():
        raise FileNotFoundError(f"Actions directory not found: {actions_dir}")
    return actions_dir


def ensure_metadata(meta_path: Path) -> None:
    if not meta_path.exists():
        raise FileNotFoundError(f"Camera metadata missing: {meta_path}")


def expected_prismarine_video(actions_path: Path) -> Path:
    return actions_path.with_suffix(".mp4")


def find_last_sneak_action(actions_path: Path) -> Optional[int]:
    """Find the index of the last sneak action in the episode.
    
    Returns None if no sneak action is found.
    """
    with actions_path.open("r", encoding="utf-8") as fh:
        actions = json.load(fh)
    
    if not isinstance(actions, list):
        return None
    
    # Search backwards for the last sneak action
    for i in range(len(actions) - 1, -1, -1):
        action = actions[i]
        if isinstance(action, dict) and "action" in action:
            if action["action"].get("sneak", False):
                return i
    
    return None


def get_episode_pair_path(actions_path: Path) -> Optional[Path]:
    """Get the corresponding Alpha/Bravo file for the same episode.
    
    If actions_path is for Alpha, returns the Bravo path (and vice versa).
    Returns None if the pair file doesn't exist.
    """
    filename = actions_path.name
    
    if "_Alpha_" in filename:
        pair_filename = filename.replace("_Alpha_", "_Bravo_")
    elif "_Bravo_" in filename:
        pair_filename = filename.replace("_Bravo_", "_Alpha_")
    else:
        return None
    
    pair_path = actions_path.parent / pair_filename
    return pair_path if pair_path.exists() else None


def find_last_sneak_in_episode(actions_path: Path) -> Optional[int]:
    """Find the last sneak action across both Alpha and Bravo for the same episode.
    
    Returns the action index of the last sneak found in either bot's file.
    Returns None if no sneak action is found in either file.
    """
    # Check current file
    last_sneak = find_last_sneak_action(actions_path)
    
    # Check paired file
    pair_path = get_episode_pair_path(actions_path)
    if pair_path:
        pair_sneak = find_last_sneak_action(pair_path)
        # If both have sneaks, we still want the last one from either
        if last_sneak is None:
            last_sneak = pair_sneak
        elif pair_sneak is not None:
            # Both have sneaks - this is unusual, but take the max
            last_sneak = max(last_sneak, pair_sneak)
    
    return last_sneak


def compute_skip_actions_for_eval(actions_path: Path, min_frames: int = 256) -> int:
    """Compute how many actions to skip for eval mode.
    
    Finds the last sneak action across both Alpha/Bravo for the same episode
    and returns (last_sneak_index + 6) to start 5 frames after the sneak.
    Raises ValueError if:
    - No sneak action is found in either Alpha or Bravo
    - Remaining frames would be less than min_frames
    """
    last_sneak_idx = find_last_sneak_in_episode(actions_path)
    
    if last_sneak_idx is None:
        pair_path = get_episode_pair_path(actions_path)
        pair_name = pair_path.name if pair_path else "paired file"
        raise ValueError(
            f"No sneak action found in {actions_path.name} or {pair_name}"
        )
    
    # Load actions to get total count
    with actions_path.open("r", encoding="utf-8") as fh:
        actions = json.load(fh)
    
    total_actions = len(actions)
    skip_actions = last_sneak_idx + 6  # 5 frames after the sneak (0-indexed, so +6)
    remaining_frames = total_actions - skip_actions
    
    if remaining_frames < min_frames:
        raise ValueError(
            f"Episode {actions_path.name}: After cropping at frame {skip_actions}, "
            f"only {remaining_frames} frames remain (minimum {min_frames} required)"
        )
    
    return skip_actions


def _resize_to_height(frame: np.ndarray, target_height: int) -> np.ndarray:
    if frame.shape[0] == target_height:
        return frame
    if target_height <= 0:
        return frame
    scale = target_height / frame.shape[0]
    new_width = max(1, int(round(frame.shape[1] * scale)))
    return cv2.resize(frame, (new_width, target_height), interpolation=cv2.INTER_AREA)


def build_side_by_side(
    prismarine: Path, aligned: Path, output_path: Path
) -> Tuple[int, float, float]:
    left = cv2.VideoCapture(str(prismarine))
    if not left.isOpened():
        raise RuntimeError(f"Failed to open prismarine video {prismarine}")

    right = cv2.VideoCapture(str(aligned))
    if not right.isOpened():
        raise RuntimeError(f"Failed to open aligned video {aligned}")

    left_fps = float(left.get(cv2.CAP_PROP_FPS)) or 0.0
    right_fps = float(right.get(cv2.CAP_PROP_FPS)) or 0.0
    fps = right_fps if right_fps > 0 else left_fps if left_fps > 0 else 30.0

    left_height = int(left.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 0
    right_height = int(right.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 0
    target_height = right_height if right_height > 0 else left_height
    if target_height <= 0:
        raise RuntimeError("Unable to determine frame dimensions for comparison video")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    writer: Optional[cv2.VideoWriter] = None
    frames_written = 0

    mismatched_length = False

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

    if writer is not None:
        writer.release()
    left.release()
    right.release()

    if frames_written == 0:
        output_path.unlink(missing_ok=True)
        raise RuntimeError("No overlapping frames to build comparison video")

    return (
        frames_written,
        left_fps,
        right_fps if not mismatched_length else -abs(right_fps),
    )


def process_actions(
    actions_dir: Path, configs: Dict[str, BotConfig], generate_comparison: bool = False,
    eval_mode: bool = False
) -> int:
    actions_processed = 0
    for actions_path in sorted(actions_dir.glob("*.json")):
        if actions_path.name.endswith("_meta.json"):
            continue
        config = bot_for_actions(actions_path, configs)
        if config is None:
            continue

        ensure_metadata(config.camera_meta)
        config.output_dir.mkdir(parents=True, exist_ok=True)

        output_video = config.output_dir / f"{actions_path.stem}_camera.mp4"
        output_meta = config.output_dir / f"{actions_path.stem}_camera_meta.json"

        # Compute skip_actions for eval mode
        skip_actions = 0
        if eval_mode:
            try:
                skip_actions = compute_skip_actions_for_eval(actions_path)
                print(f"[eval] {actions_path.name}: skipping first {skip_actions} actions")
            except ValueError as e:
                print(f"[eval] skipping {actions_path.name}: {e}", file=sys.stderr)
                continue

        alignment_input = AlignmentInput(
            actions_path=actions_path,
            camera_meta_path=config.camera_meta,
            output_video_path=output_video,
            output_metadata_path=output_meta,
            ffmpeg_path="ffmpeg",
            margin_start=0.0,
            margin_end=0.0,
            skip_actions=skip_actions,
        )

        align_start = time.time()
        try:
            metadata = align_recording(alignment_input)
        except Exception as exc:  # noqa: BLE001 - surface alignment failure to caller
            print(f"[align] failed for {actions_path}: {exc}", file=sys.stderr)
            continue
        align_time = time.time() - align_start

        metadata["comparison_video_path"] = None

        if generate_comparison and expected_prismarine_video(actions_path).exists():
            comparison_path = config.output_dir / f"{actions_path.stem}_comparison.mp4"
            compare_start = time.time()
            try:
                frames_written, left_fps, right_fps = build_side_by_side(
                    expected_prismarine_video(actions_path),
                    Path(metadata["aligned_video_path"]),
                    comparison_path,
                )
                compare_time = time.time() - compare_start
                metadata["comparison_video_path"] = str(comparison_path)
                print(
                    f"[compare] wrote {comparison_path} ({frames_written} frames, "
                    f"prismarine_fps={left_fps:.2f}, aligned_fps={right_fps:.2f}, time={compare_time:.1f}s)",
                )
            except Exception as exc:
                print(f"[compare] failed: {exc}", file=sys.stderr)
                comparison_path.unlink(missing_ok=True)

        with output_meta.open("w", encoding="utf-8") as fh:
            json.dump(metadata, fh)

        print(
            f"[align] wrote {metadata['aligned_video_path']} (total: {align_time:.1f}s)"
        )
        actions_processed += 1

    return actions_processed


def process_single_episode(episode_path: Path, configs: Dict[str, BotConfig], 
                          generate_comparison: bool = False, eval_mode: bool = False) -> bool:
    """Process a single episode file. Returns True if successful."""
    if episode_path.name.endswith("_meta.json"):
        return False
    
    config = bot_for_actions(episode_path, configs)
    if config is None:
        return False

    try:
        ensure_metadata(config.camera_meta)
        config.output_dir.mkdir(parents=True, exist_ok=True)

        output_video = config.output_dir / f"{episode_path.stem}_camera.mp4"
        output_meta = config.output_dir / f"{episode_path.stem}_camera_meta.json"

        # Compute skip_actions for eval mode
        skip_actions = 0
        if eval_mode:
            skip_actions = compute_skip_actions_for_eval(episode_path)
            print(f"[eval] {episode_path.name}: skipping first {skip_actions} actions")

        alignment_input = AlignmentInput(
            actions_path=episode_path,
            camera_meta_path=config.camera_meta,
            output_video_path=output_video,
            output_metadata_path=output_meta,
            ffmpeg_path="ffmpeg",
            margin_start=0.0,
            margin_end=0.0,
            skip_actions=skip_actions,
        )

        align_start = time.time()
        metadata = align_recording(alignment_input)
        align_time = time.time() - align_start

        metadata["comparison_video_path"] = None
        
        if generate_comparison and expected_prismarine_video(episode_path).exists():
            comparison_path = config.output_dir / f"{episode_path.stem}_comparison.mp4"
            compare_start = time.time()
            frames_written, left_fps, right_fps = build_side_by_side(
                expected_prismarine_video(episode_path),
                Path(metadata["aligned_video_path"]),
                comparison_path,
            )
            compare_time = time.time() - compare_start
            metadata["comparison_video_path"] = str(comparison_path)
            print(
                f"[compare] wrote {comparison_path} ({frames_written} frames, "
                f"prismarine_fps={left_fps:.2f}, aligned_fps={right_fps:.2f}, time={compare_time:.1f}s)",
            )

        with output_meta.open("w", encoding="utf-8") as fh:
            json.dump(metadata, fh)

        print(f"[align] wrote {metadata['aligned_video_path']} (total: {align_time:.1f}s)")
        return True
        
    except Exception as exc:
        print(f"[align] failed for {episode_path}: {exc}", file=sys.stderr)
        return False


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    actions_dir = resolve_actions_dir(args.actions_dir.resolve())
    configs = build_bot_config(
        actions_dir=actions_dir,
        camera_prefix=args.camera_prefix.resolve(),
        bot=args.bot,
        output_base=args.output_dir.resolve() if args.output_dir else None,
    )

    # Single-episode fast path if provided by orchestrator
    if args.episode_file:
        episode_path = args.episode_file.resolve()
        if not episode_path.exists():
            print(f"[align] episode file not found: {episode_path}", file=sys.stderr)
            return 1
        processed = process_single_episode(
            episode_path, configs, args.comparison_video, args.eval
        )
        return 0 if processed else 1

    # Otherwise process all episodes under --actions-dir
    processed = process_actions(
        actions_dir, configs, generate_comparison=args.comparison_video,
        eval_mode=args.eval
    )
    if processed == 0:
        print("[align] no action traces found; nothing to do")
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main(sys.argv[1:]))
