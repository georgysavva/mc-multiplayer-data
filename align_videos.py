import argparse
import json
import os
from typing import Any, Dict, List, Tuple

import cv2
import numpy as np


def _load_json(path: str) -> List[dict]:
    with open(path, "r") as f:
        return json.load(f)


def _action_tick_to_frame_index(entries: List[dict]) -> Dict[int, int]:
    """
    Build a mapping from actionTick -> frame_count.
    Skips entries missing either field. If duplicates exist, keep the first.
    """
    mapping: Dict[int, int] = {}
    for e in entries:
        if not isinstance(e, dict):
            continue
        at = e.get("actionTick")
        fi = e.get("frame_count")
        if isinstance(at, int) and isinstance(fi, int):
            # Keep the first occurrence
            mapping.setdefault(at, fi)
    return mapping


def _read_frame(cap: Any, index: int) -> np.ndarray:
    # Random access to a specific frame index
    POS_FRAMES = getattr(cv2, "CAP_PROP_POS_FRAMES", 1)
    cap.set(POS_FRAMES, index)
    ok, frame = cap.read()
    if not ok:
        raise RuntimeError(f"Failed to read frame {index}")
    return frame


def main(args):
    dir_path: str = args.dir
    name1: str = args.name1
    name2: str = args.name2
    out_name: str = args.out or f"{name1}__{name2}_aligned.mp4"

    avi1 = os.path.join(dir_path, f"{name1}.avi")
    avi2 = os.path.join(dir_path, f"{name2}.avi")
    js1 = os.path.join(dir_path, f"{name1}.json")
    js2 = os.path.join(dir_path, f"{name2}.json")
    out_path = os.path.join(dir_path, out_name)

    if not os.path.isfile(avi1) or not os.path.isfile(avi2):
        raise FileNotFoundError("One or both input .avi files were not found")
    if not os.path.isfile(js1) or not os.path.isfile(js2):
        raise FileNotFoundError("One or both input .json files were not found")

    meta1 = _load_json(js1)
    meta2 = _load_json(js2)

    map1 = _action_tick_to_frame_index(meta1)
    map2 = _action_tick_to_frame_index(meta2)

    # Compute intersection of actionTicks, sorted to preserve temporal order
    common_ticks = sorted(set(map1.keys()).intersection(map2.keys()))
    if not common_ticks:
        raise ValueError("No shared actionTick values between the two inputs")

    indices: List[Tuple[int, int]] = [(map1[t], map2[t]) for t in common_ticks]

    cap1 = cv2.VideoCapture(avi1)
    cap2 = cv2.VideoCapture(avi2)
    if not cap1.isOpened() or not cap2.isOpened():
        raise RuntimeError("Failed to open one or both videos")

    try:
        # Probe first aligned frames to determine dimensions
        f1_init = _read_frame(cap1, indices[0][0])
        f2_init = _read_frame(cap2, indices[0][1])
        assert f1_init.shape == f2_init.shape

        out_w = f1_init.shape[1] + f2_init.shape[1]
        out_h = f1_init.shape[0]

        CAP_PROP_FPS = getattr(cv2, "CAP_PROP_FPS", 5)
        fps = cap1.get(CAP_PROP_FPS)
        if not fps or fps <= 0:
            fps = 20.0
        print("fps:", fps)

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(out_path, fourcc, fps, (out_w, out_h))
        if not writer.isOpened():
            raise RuntimeError("Failed to open output VideoWriter")

        written = 0
        for idx1, idx2 in indices[0:]:
            try:
                frame1 = _read_frame(cap1, idx1)
                frame2 = _read_frame(cap2, idx2)
            except RuntimeError:
                # Skip frames we failed to read
                continue

            # Concatenate horizontally using numpy, as requested
            merged = np.hstack([frame1, frame2])
            writer.write(merged)
            written += 1
    finally:
        cap1.release()
        cap2.release()
        try:
            writer.release()  # type: ignore[name-defined]
        except Exception:
            pass

    print(f"Aligned frames written: {written}")
    print(f"Output saved to: {out_path}")


if __name__ == "__main__":
    argparser = argparse.ArgumentParser()
    argparser.add_argument(
        "--dir", required=True, help="Directory containing videos and JSON metadata"
    )
    argparser.add_argument(
        "--name1", required=True, help="First base name (without extension)"
    )
    argparser.add_argument(
        "--name2", required=True, help="Second base name (without extension)"
    )
    argparser.add_argument(
        "--out",
        help="Output MP4 filename (placed in --dir). Default: <name1>__<name2>_aligned.mp4",
    )
    args = argparser.parse_args()
    main(args)
