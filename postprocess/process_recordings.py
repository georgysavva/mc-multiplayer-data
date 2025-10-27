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
    return parser.parse_args(list(argv))


def build_bot_config(actions_dir: Path, camera_prefix: Path, bot: str, output_base: Optional[Path]) -> Dict[str, BotConfig]:
    if bot == "Alpha":
        output_dir = (output_base or Path.cwd() / "aligned") / "alpha"
        return {
            "Alpha": BotConfig(
                name="Alpha",
                actions_suffix="_Alpha_",
                camera_meta=camera_prefix / "output_alpha" / "camera_alpha_meta.json",
                output_dir=output_dir,
            )
        }
    else:
        output_dir = (output_base or Path.cwd() / "aligned") / "bravo"
        return {
            "Bravo": BotConfig(
                name="Bravo",
                actions_suffix="_Bravo_",
                camera_meta=camera_prefix / "output_bravo" / "camera_bravo_meta.json",
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


def _resize_to_height(frame: np.ndarray, target_height: int) -> np.ndarray:
    if frame.shape[0] == target_height:
        return frame
    if target_height <= 0:
        return frame
    scale = target_height / frame.shape[0]
    new_width = max(1, int(round(frame.shape[1] * scale)))
    return cv2.resize(frame, (new_width, target_height), interpolation=cv2.INTER_AREA)


def build_side_by_side(prismarine: Path, aligned: Path, output_path: Path) -> Tuple[int, float, float]:
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
            mismatched_length = (left_ok != right_ok)
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

    return frames_written, left_fps, right_fps if not mismatched_length else -abs(right_fps)


def process_actions(actions_dir: Path, configs: Dict[str, BotConfig], generate_comparison: bool = False) -> int:
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

        alignment_input = AlignmentInput(
            actions_path=actions_path,
            camera_meta_path=config.camera_meta,
            output_video_path=output_video,
            output_metadata_path=output_meta,
            ffmpeg_path="ffmpeg",
            margin_start=0.0,
            margin_end=0.0,
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

        print(f"[align] wrote {metadata['aligned_video_path']} (total: {align_time:.1f}s)")
        actions_processed += 1

    return actions_processed


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    actions_dir = resolve_actions_dir(args.actions_dir.resolve())
    configs = build_bot_config(
        actions_dir=actions_dir,
        camera_prefix=args.camera_prefix.resolve(),
        bot=args.bot,
        output_base=args.output_dir.resolve() if args.output_dir else None,
    )

    processed = process_actions(actions_dir, configs, generate_comparison=args.comparison_video)
    if processed == 0:
        print("[align] no action traces found; nothing to do")
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main(sys.argv[1:]))
