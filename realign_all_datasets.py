#!/usr/bin/env python3
"""
Batch re-align and re-annotate all datasets in a root directory.

For each dataset directory:
1. Move 'aligned' to 'aligned_pre_fix' (if exists)
2. Run orchestrate.py postprocess to regenerate aligned videos
3. Move 'annotated' to 'annotated_pre_fix' (if exists)
4. Run annotate_video_batch.py to regenerate annotated videos

Usage:
    python realign_all_datasets.py /mnt/data/dl3957/mc_multiplayer_v2_eval_gpu [--workers N] [--annotate-limit N]
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "root_dir",
        type=str,
        help="Root directory containing dataset subdirectories",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=8,
        help="Number of parallel workers for processing (default: 8)",
    )
    parser.add_argument(
        "--annotate-limit",
        type=int,
        default=16,
        help="Limit number of video pairs to annotate per dataset (default: 16)",
    )
    parser.add_argument(
        "--delay-video-by",
        type=float,
        default=0.15,
        help="Delay video by this many seconds (default: 0.15)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be done without actually doing it",
    )
    parser.add_argument(
        "--skip-align",
        action="store_true",
        help="Skip alignment step (only run annotation)",
    )
    parser.add_argument(
        "--skip-annotate",
        action="store_true",
        help="Skip annotation step (only run alignment)",
    )
    parser.add_argument(
        "--dataset",
        type=str,
        default=None,
        help="Process only this specific dataset (by name)",
    )
    return parser.parse_args()


def is_valid_dataset(dataset_dir: Path) -> bool:
    """Check if a directory is a valid dataset with expected structure."""
    # Must have camera and output directories
    return (dataset_dir / "camera").exists() and (dataset_dir / "output").exists()


def move_directory(src: Path, dst: Path, dry_run: bool = False) -> bool:
    """Move a directory, returning True if successful."""
    if not src.exists():
        return False

    if dst.exists():
        print(f"    Warning: {dst.name} already exists, removing it first")
        if not dry_run:
            shutil.rmtree(dst)

    print(f"    Moving {src.name} -> {dst.name}")
    if not dry_run:
        shutil.move(str(src), str(dst))
    return True


def run_alignment(dataset_dir: Path, workers: int, delay_video_by: float, dry_run: bool = False) -> bool:
    """Run orchestrate.py postprocess for a dataset."""
    aligned_dir = dataset_dir / "aligned"

    cmd = [
        sys.executable,
        "orchestrate.py",
        "postprocess",
        "--workers", str(workers),
        "--output-dir", str(aligned_dir),
        "--delay-video-by", str(delay_video_by),
    ]

    print(f"    Running: {' '.join(cmd)}")
    if dry_run:
        return True

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"    Error: {result.stderr}")
        return False
    return True


def run_annotation(dataset_dir: Path, workers: int, limit: int, dry_run: bool = False) -> bool:
    """Run annotate_video_batch.py for a dataset."""
    cmd = [
        sys.executable,
        "video-post-processing-utils/annotate_video_batch.py",
        str(dataset_dir),
        "--workers", str(workers),
        "--limit", str(limit),
    ]

    print(f"    Running: {' '.join(cmd)}")
    if dry_run:
        return True

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"    Error: {result.stderr}")
        return False
    return True


def process_dataset(
    dataset_dir: Path,
    workers: int,
    annotate_limit: int,
    delay_video_by: float,
    dry_run: bool = False,
    skip_align: bool = False,
    skip_annotate: bool = False,
) -> bool:
    """Process a single dataset."""
    print(f"\n{'='*60}")
    print(f"Processing: {dataset_dir.name}")
    print(f"{'='*60}")

    aligned_dir = dataset_dir / "aligned"
    aligned_backup = dataset_dir / "aligned_pre_fix"
    annotated_dir = dataset_dir / "annotated"
    annotated_backup = dataset_dir / "annotated_pre_fix"

    success = True

    # Step 1: Alignment
    if not skip_align:
        print("\n  [Step 1] Alignment")

        # Only backup if aligned_pre_fix doesn't exist yet
        if aligned_backup.exists():
            print(f"    Backup exists ({aligned_backup.name}), re-aligning in place")
            # Clear current aligned directory for fresh reprocess
            if aligned_dir.exists() and not dry_run:
                shutil.rmtree(aligned_dir)
        elif aligned_dir.exists():
            move_directory(aligned_dir, aligned_backup, dry_run)

        # Create aligned directory
        if not dry_run:
            aligned_dir.mkdir(parents=True, exist_ok=True)

        # Run alignment
        if not run_alignment(dataset_dir, workers, delay_video_by, dry_run):
            print(f"    Failed to align {dataset_dir.name}")
            success = False

    # Step 2: Annotation
    if not skip_annotate and success:
        print("\n  [Step 2] Annotation")

        # Only backup if annotated_pre_fix doesn't exist yet
        if annotated_backup.exists():
            print(f"    Backup exists ({annotated_backup.name}), re-annotating in place")
            # Clear current annotated directory for fresh reprocess
            if annotated_dir.exists() and not dry_run:
                shutil.rmtree(annotated_dir)
        elif annotated_dir.exists():
            move_directory(annotated_dir, annotated_backup, dry_run)

        # Run annotation
        if not run_annotation(dataset_dir, workers, annotate_limit, dry_run):
            print(f"    Failed to annotate {dataset_dir.name}")
            success = False

    return success


def main():
    args = parse_args()
    root_dir = Path(args.root_dir)

    if not root_dir.exists():
        print(f"Error: Root directory not found: {root_dir}")
        sys.exit(1)

    # Discover datasets
    if args.dataset:
        # Process specific dataset
        dataset_dir = root_dir / args.dataset
        if not dataset_dir.exists():
            print(f"Error: Dataset not found: {dataset_dir}")
            sys.exit(1)
        datasets = [dataset_dir]
    else:
        # Process all valid datasets
        datasets = sorted([
            d for d in root_dir.iterdir()
            if d.is_dir() and is_valid_dataset(d)
        ])

    print(f"Found {len(datasets)} dataset(s) to process in {root_dir}")
    if args.dry_run:
        print("(DRY RUN - no changes will be made)")

    for d in datasets:
        print(f"  - {d.name}")

    # Process each dataset
    successful = 0
    failed = 0

    for dataset_dir in datasets:
        if process_dataset(
            dataset_dir,
            args.workers,
            args.annotate_limit,
            args.delay_video_by,
            args.dry_run,
            args.skip_align,
            args.skip_annotate,
        ):
            successful += 1
        else:
            failed += 1

    # Summary
    print(f"\n{'='*60}")
    print(f"Re-aligning and re-annotating Complete")
    print(f"{'='*60}")
    print(f"Successful: {successful}/{len(datasets)}")
    print(f"Failed: {failed}/{len(datasets)}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
