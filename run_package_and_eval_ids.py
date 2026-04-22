#!/usr/bin/env python3

"""
End-to-end pipeline: package eval outputs + compute eval-id ranges.

Expected input layout:
    <BASE_DIR>/<BATCH_NAME>/{output,aligned,...}

Produces:
    <DEST_DIR>/<BATCH_NAME>/test/*               (packaged episodes)
    <DEST_DIR>/<BATCH_NAME>/eval_ids.json        (per-batch eval id ranges)

Must run in the `oasis` conda env (for jax_oasis imports):
    conda activate oasis
    python run_package_and_eval_ids.py <BASE_DIR>
"""

import argparse
import json
import logging
import os
import shutil
import sys
from pathlib import Path

import numpy as np

from prepare_episodes_for_eval import process_episodes_dir

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def load_jax_oasis(jax_oasis_dir: str):
    sys.path.insert(0, jax_oasis_dir)
    sys.path.insert(0, os.path.join(jax_oasis_dir, "dataset"))
    from src.data.dataset import DatasetMultiplayer
    from prepare_eval_sample_ids_mp_final_eval import DatasetProcessor
    return DatasetMultiplayer, DatasetProcessor


def compute_eval_ids(
    test_dir: Path,
    out_path: Path,
    num_frames: int,
    DatasetMultiplayer,
    DatasetProcessor,
    bot1_name: str = "Alpha",
    bot2_name: str = "Bravo",
) -> int:
    eval_dataset = DatasetMultiplayer(
        data_dir=test_dir,
        dataset_name=test_dir.parent.name,
        bot1_name=bot1_name,
        bot2_name=bot2_name,
        converters=[],
        shuffle_bots=False,
    )
    processor = DatasetProcessor(eval_dataset, num_frames)

    ids = []
    episode_paths_map = {}
    unsuccessful = 0
    for i in range(eval_dataset.num_episodes):
        info = processor.get_episode_info(i)
        if info is None:
            logging.warning(f"  Episode {i} invalid, skipping")
            unsuccessful += 1
            continue
        episode_paths_map[i] = eval_dataset.get_episode_paths(i)
        ids.append((
            int(i),
            info["bot1_start_idx"], info["bot1_end_idx"],
            info["bot2_start_idx"], info["bot2_end_idx"],
        ))
    logging.info(f"  Unsuccessful episodes: {unsuccessful}")

    if ids:
        all_starts = [e[1] for e in ids] + [e[3] for e in ids]
        mean_s, std_s = np.mean(all_starts), np.std(all_starts)
        logging.info(f"  Start idx — mean={mean_s:.2f}, std={std_s:.2f}")
        for eid, b1s, _, b2s, _ in ids:
            z1 = abs(b1s - mean_s) / std_s if std_s > 0 else 0
            z2 = abs(b2s - mean_s) / std_s if std_s > 0 else 0
            if z1 > 4 or z2 > 4:
                logging.warning(
                    f"  Outlier episode {eid}: b1={b1s} (z={z1:.2f}), "
                    f"b2={b2s} (z={z2:.2f}) paths={episode_paths_map[eid]}"
                )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(ids, f, indent=2)
    return len(ids)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "base_dir",
        help="Parent directory containing <BATCH_NAME>/{output,aligned,...} subdirs, "
             "OR a parent containing <BATCH_NAME>/test/ subdirs (packaging will be skipped).",
    )
    parser.add_argument(
        "--dest-dir",
        default=None,
        help="Destination for packaged data + eval_ids (default: <base_dir>_packaged). "
             "If the source is already packaged (test/ subdirs), defaults to <base_dir>.",
    )
    parser.add_argument("--num-frames", type=int, default=257)
    parser.add_argument("--ignore-first-episode", action="store_true")
    parser.add_argument(
        "--skip-packaging",
        action="store_true",
        help="Skip step 1; treat <base_dir>/<BATCH>/test/ as already-packaged input.",
    )
    parser.add_argument(
        "--jax-oasis-dir",
        default=os.path.expanduser("~/GitHub/jax_oasis"),
    )
    args = parser.parse_args()

    base_dir = Path(args.base_dir).expanduser().resolve()
    if not base_dir.is_dir():
        print(f"Error: base_dir not found: {base_dir}", file=sys.stderr)
        sys.exit(1)

    # Auto-detect already-packaged input (subdirs have test/ but no output/+aligned/)
    subdirs = sorted(p for p in base_dir.iterdir() if p.is_dir())
    if not args.skip_packaging:
        has_output = any((p / "output").is_dir() and (p / "aligned").is_dir() for p in subdirs)
        has_test_only = any((p / "test").is_dir() for p in subdirs) and not has_output
        if has_test_only:
            logging.info(
                f"Source appears already packaged (test/ subdirs present, no output+aligned). "
                f"Skipping packaging."
            )
            args.skip_packaging = True

    if args.dest_dir:
        dest_dir = Path(args.dest_dir).expanduser().resolve()
    elif args.skip_packaging:
        dest_dir = base_dir
    else:
        dest_dir = base_dir.parent / (base_dir.name + "_packaged")

    # --- Step 1: packaging ---
    if not args.skip_packaging:
        logging.info("=" * 50)
        logging.info(f"Step 1: Packaging {base_dir} -> {dest_dir}")
        logging.info("=" * 50)
        total_copied = 0
        dirs_processed = 0
        for subdir in subdirs:
            out_subdir = dest_dir / subdir.name / "test"
            result = process_episodes_dir(str(subdir), str(out_subdir), args.ignore_first_episode)
            if result is None:
                continue  # not a valid episodes dir
            copied, _, _ = result
            total_copied += copied
            dirs_processed += 1
            logging.info(f"  {subdir.name}: {copied} file pairs copied")
        if dirs_processed == 0:
            print(
                "Error: no subdirs with output/ and aligned/ found under "
                f"{base_dir}. Use --skip-packaging if inputs are already packaged.",
                file=sys.stderr,
            )
            sys.exit(1)
        logging.info(f"Packaged {dirs_processed} batches, {total_copied} file pairs total.")

    # --- Step 2: eval ids ---
    # Read from the dir that has test/ subdirs (base_dir if we skipped packaging,
    # else dest_dir where we just wrote them). Write eval_ids.json under dest_dir.
    read_dir = base_dir if args.skip_packaging else dest_dir
    logging.info("=" * 50)
    logging.info(f"Step 2: Computing eval ids (read from {read_dir}, write to {dest_dir})")
    logging.info("=" * 50)
    DatasetMultiplayer, DatasetProcessor = load_jax_oasis(args.jax_oasis_dir)

    mirror_test = args.skip_packaging and read_dir != dest_dir

    batches_processed = 0
    for subdir in sorted(p for p in read_dir.iterdir() if p.is_dir()):
        test_dir = subdir / "test"
        if not test_dir.is_dir():
            continue
        logging.info(f"--- {subdir.name} ---")

        if mirror_test:
            dest_test = dest_dir / subdir.name / "test"
            dest_test.parent.mkdir(parents=True, exist_ok=True)
            if dest_test.is_symlink():
                dest_test.unlink()
            elif dest_test.exists():
                shutil.rmtree(dest_test)
            shutil.copytree(test_dir, dest_test)
            logging.info(f"  Copied test/ from {test_dir} -> {dest_test}")

        out_path = dest_dir / subdir.name / "eval_ids.json"
        n = compute_eval_ids(
            test_dir, out_path, args.num_frames,
            DatasetMultiplayer, DatasetProcessor,
        )
        logging.info(f"  Wrote {n} eval ids to {out_path}")
        batches_processed += 1

    logging.info("=" * 50)
    logging.info(f"Done. {batches_processed} batches in {dest_dir}")
    logging.info("=" * 50)


if __name__ == "__main__":
    main()
