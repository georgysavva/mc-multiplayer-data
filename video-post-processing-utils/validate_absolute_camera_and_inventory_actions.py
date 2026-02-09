#!/usr/bin/env python3
"""Validate action JSON files from Minecraft bot recordings.

Runs two independent checks on action JSON files:

1. CAMERA CHECK: Verifies that the relative camera deltas in action.camera
   are consistent with the absolute yaw/pitch values.

   Semantics: camera[t] records the change that *produced* tick t's state,
   i.e. camera[t] == yaw[t] - yaw[t-1] (and same for pitch).
   This is because getLastCameraAction() returns the delta since its last
   call, captured at the same time as the absolute yaw/pitch.

   Errors below 1e-5 are ignored (expected fp32 rounding — yaw/pitch and
   camera deltas are stored as float32 via np.float32 conversion in receiver.py).
   Errors >= 1e-5 are flagged as significant mismatches (e.g. bot.entity.yaw
   vs lastSentYaw divergence, or a teleport command mid-episode).

2. INVENTORY CHECK: For episodes with place_block events, verifies that
   block placement and inventory changes are properly paired.

   Check A: Every place_block event has a corresponding decrease in the
            held hotbar item. The inventory update may appear at the same
            tick as place_block or up to 2 ticks later (due to recording
            vs server tick desync).

   Check B: Every hotbar item decrease has a corresponding place_block
            event at the same tick or up to 2 ticks earlier.

   Also verifies mainInventory is empty (items should only be in hotbar
   for these evaluation episodes).

Usage:
    python validate_absolute_camera_and_inventory_actions.py <data_dir> [--glob-pattern PATTERN]

    <data_dir>       Root directory containing action JSON files.
    --glob-pattern   Glob pattern relative to data_dir for finding action JSONs.
                     Default: "*/output/*.json"

Examples:
    python validate_absolute_camera_and_inventory_actions.py /path/to/eval_data
    python validate_absolute_camera_and_inventory_actions.py /path/to/eval_data --glob-pattern "*/test/*.json"
"""

import argparse
import json
import glob
import os
import sys
from collections import defaultdict


def find_action_jsons(base_dir, pattern="*/output/*.json"):
    """Find action JSON files, excluding meta/episode_info files."""
    files = sorted(glob.glob(os.path.join(base_dir, pattern)))
    return [f for f in files
            if not f.endswith("_meta.json") and not f.endswith("_episode_info.json")]


def get_hotbar_counts(inv):
    """Return dict of {slot: (name, count)} for all hotbar items."""
    result = {}
    for item in inv.get("hotbar", []):
        result[item["slot"]] = (item["name"], item["count"])
    return result


def get_rel_path(path, base_dir):
    """Get path relative to base_dir for display."""
    return os.path.relpath(path, base_dir)


# ── Camera check ─────────────────────────────────────────────────────────────

def check_camera(json_files, base_dir, atol=1e-5):
    """Check that camera[t] == yaw[t] - yaw[t-1] for all ticks t >= 1.

    Also computes cumulative end-of-episode deviation: the difference between
    reconstructed yaw/pitch (initial + sum of camera deltas) and the actual
    final yaw/pitch. This shows how much drift accumulates over an episode.

    Args:
        atol: Absolute tolerance. Errors below this are ignored (expected fp32
              rounding). Errors at or above this are flagged as significant
              mismatches (bugs or teleport commands).
    """
    total_ticks = 0
    total_mismatches = 0
    per_dir = defaultdict(lambda: {"files": 0, "ticks": 0, "mismatches": 0})

    # Track cumulative end-of-episode deviations
    cumulative_devs = []  # (rel_path, n_ticks, yaw_dev, pitch_dev)

    for path in json_files:
        with open(path) as f:
            frames = json.load(f)

        rel = get_rel_path(path, base_dir)
        dir_name = rel.split(os.sep)[0]
        per_dir[dir_name]["files"] += 1

        cum_yaw_err = 0.0
        cum_pitch_err = 0.0

        for t in range(1, len(frames)):
            total_ticks += 1
            per_dir[dir_name]["ticks"] += 1
            cur = frames[t]
            prev = frames[t - 1]
            yaw_err = cur["action"]["camera"][0] - (cur["yaw"] - prev["yaw"])
            pitch_err = cur["action"]["camera"][1] - (cur["pitch"] - prev["pitch"])
            cum_yaw_err += yaw_err
            cum_pitch_err += pitch_err
            max_err = max(abs(yaw_err), abs(pitch_err))
            if max_err >= atol:
                total_mismatches += 1
                per_dir[dir_name]["mismatches"] += 1

        if len(frames) > 1:
            cumulative_devs.append((rel, len(frames) - 1, cum_yaw_err, cum_pitch_err))

    # Find worst cumulative deviation
    worst_cum = max(cumulative_devs, key=lambda x: max(abs(x[2]), abs(x[3])),
                    default=None)

    print("=" * 70)
    print("CAMERA CHECK: camera[t] == yaw[t] - yaw[t-1]")
    print(f"  (tolerance: {atol}, errors below this are ignored as fp32 rounding)")
    print("=" * 70)
    print(f"Total ticks: {total_ticks}")
    print(f"Significant mismatches (>= {atol}): {total_mismatches}")
    print()
    for d in sorted(per_dir):
        s = per_dir[d]
        print(f"  {d:40s}: {s['files']:4d} files, {s['ticks']:6d} ticks, "
              f"{s['mismatches']:4d} mismatches")
    print()

    print("Cumulative end-of-episode deviation (sum of camera deltas vs actual):")
    if worst_cum:
        rel, n, yaw_d, pitch_d = worst_cum
        print(f"  Worst: {rel} ({n} ticks)")
        print(f"    yaw drift:   {yaw_d:+.10f}")
        print(f"    pitch drift: {pitch_d:+.10f}")
        # Also show stats across all files
        all_max = [max(abs(y), abs(p)) for _, _, y, p in cumulative_devs]
        all_max.sort()
        print(f"  Across {len(cumulative_devs)} files:")
        print(f"    max:    {all_max[-1]:.10f}")
        print(f"    median: {all_max[len(all_max)//2]:.10f}")
        print(f"    mean:   {sum(all_max)/len(all_max):.10f}")
    else:
        print("  No files with camera data.")
    print()
    return total_mismatches == 0


# ── Inventory check ──────────────────────────────────────────────────────────

def check_inventory(json_files, base_dir):
    """Check place_block <-> inventory decrease correspondence.

    Timing model: the recording captures place_block (a flag set by an event)
    and inventory state (polled from bot.inventory) in the same tick. Due to
    server processing delay, the inventory may update at the same tick as
    place_block or 1-2 ticks later. Specifically:

      - place_block=True at tick t means the bot issued a block placement.
      - The inventory decrease (held item count going down) appears in the
        transition ending at tick t (same-tick) or up to 2 ticks later
        (transition ending at t+1, t+2, or t+3).

    Check A looks at each place_block and verifies a decrease nearby.
    Check B looks at each decrease and verifies a place_block nearby.
    """
    check_a_violations = []
    check_b_violations = []
    nonempty_main = []

    files_checked = 0
    files_with_placement = 0
    total_placements = 0
    total_decreases = 0

    for path in json_files:
        with open(path) as f:
            frames = json.load(f)

        rel = get_rel_path(path, base_dir)

        if not frames or "inventory" not in frames[0]:
            continue
        files_checked += 1

        n = len(frames)

        # Pre-compute per-tick data
        place_ticks = set()
        hotbar_counts = []

        for t, fr in enumerate(frames):
            inv = fr.get("inventory", {})
            if fr["action"].get("place_block", False):
                place_ticks.add(t)
            hotbar_counts.append(get_hotbar_counts(inv))

            # Check mainInventory is empty
            main = inv.get("mainInventory", [])
            main_count = sum(item["count"] for item in main)
            if main_count > 0 and len(nonempty_main) < 10:
                items = [(item["name"], item["count"]) for item in main]
                nonempty_main.append((rel, t, main_count, items))

        if not place_ticks:
            continue

        files_with_placement += 1
        total_placements += len(place_ticks)

        # ── Check A: place_block at tick t => held item decreases nearby.
        #
        # We check transitions (t2, t2+1) for t2 in {t-1, t, t+1, t+2}:
        #   t2=t-1: decrease at tick t   (same tick as place_block)
        #   t2=t:   decrease at tick t+1 (1 tick after place_block)
        #   t2=t+1: decrease at tick t+2 (2 ticks after)
        #   t2=t+2: decrease at tick t+3 (3 ticks after)
        for t in sorted(place_ticks):
            slot_idx = frames[t]["inventory"]["quickBarSlot"] + 36
            found_decrease = False
            for dt in range(-1, 3):
                t2 = t + dt
                if t2 < 0 or t2 >= n - 1:
                    continue
                cur = hotbar_counts[t2].get(slot_idx, (None, 0))
                nxt = hotbar_counts[t2 + 1].get(slot_idx, (None, 0))
                if nxt[1] < cur[1] or (cur[0] is not None and nxt[0] is None):
                    found_decrease = True
                    break

            if not found_decrease:
                held_name, held_count = (None, 0)
                for item in frames[t]["inventory"].get("hotbar", []):
                    if item["slot"] == slot_idx:
                        held_name, held_count = item["name"], item["count"]
                if len(check_a_violations) < 15:
                    check_a_violations.append((
                        rel, t, held_name, held_count,
                        frames[t]["inventory"]["quickBarSlot"],
                    ))

        # ── Check B: hotbar item decrease at tick t => place_block nearby.
        #
        # A decrease "at tick t" means the transition from t-1 to t.
        # We look for place_block at {t-2, t-1, t, t+1}:
        #   t-2: place_block 2 ticks before the inventory updated
        #   t-1: place_block 1 tick before (or same-tick, since place_block
        #         at t-1 and inventory update in transition t-1 -> t)
        #   t:   place_block at the same tick the decrease is observed
        #   t+1: shouldn't normally happen, but included for symmetry
        #
        # Note: inventory can NEVER decrease before place_block fires.
        for t in range(1, n):
            prev_hb = hotbar_counts[t - 1]
            cur_hb = hotbar_counts[t]

            all_slots = set(prev_hb.keys()) | set(cur_hb.keys())
            for slot in all_slots:
                prev_name, prev_count = prev_hb.get(slot, (None, 0))
                cur_name, cur_count = cur_hb.get(slot, (None, 0))

                decreased = False
                if prev_name is not None and cur_name is None:
                    decreased = True
                elif prev_name == cur_name and cur_count < prev_count:
                    decreased = True

                if not decreased:
                    continue

                total_decreases += 1

                has_nearby_place = any(
                    (t + dt) in place_ticks
                    for dt in range(-2, 2)
                    if 0 <= (t + dt) < n
                )

                if not has_nearby_place:
                    if len(check_b_violations) < 15:
                        check_b_violations.append((
                            rel, t, slot, prev_name, prev_count,
                            cur_name, cur_count,
                        ))

    # ── Print results ──
    print("=" * 70)
    print("INVENTORY CHECK")
    print("=" * 70)
    print(f"Files with inventory data: {files_checked}")
    print(f"Files with place_block events: {files_with_placement}")
    print(f"Total place_block events: {total_placements}")
    print(f"Total hotbar item decrease events: {total_decreases}")
    print()

    all_pass = True

    print("--- Check A: place_block => held item decrease within [-1, +2] ticks ---")
    if check_a_violations:
        all_pass = False
        print(f"FAIL: {len(check_a_violations)} violations")
        for rel, t, name, count, qslot in check_a_violations:
            print(f"  {rel} tick {t}: held={name}(x{count}) quickBarSlot={qslot}")
    else:
        print("PASS")

    print()
    print("--- Check B: hotbar decrease => place_block within [-2, +1] ticks ---")
    if check_b_violations:
        all_pass = False
        print(f"FAIL: {len(check_b_violations)} violations")
        for rel, t, slot, pname, pcount, cname, ccount in check_b_violations:
            print(f"  {rel} tick {t}: slot {slot}: "
                  f"{pname}(x{pcount}) -> {cname}(x{ccount if cname else 0})")
    else:
        print("PASS")

    print()
    print("--- Check C: mainInventory is always empty ---")
    if nonempty_main:
        all_pass = False
        print(f"FAIL: {len(nonempty_main)} violations")
        for rel, t, count, items in nonempty_main:
            print(f"  {rel} tick {t}: mainInventory count={count}, items={items}")
    else:
        print("PASS")

    print()
    return all_pass


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Validate action JSON files from Minecraft bot recordings.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("Usage:")[0],
    )
    parser.add_argument("data_dir", help="Root directory containing action JSON files")
    parser.add_argument(
        "--glob-pattern", default="*/output/*.json",
        help='Glob pattern for finding action JSONs (default: "*/output/*.json")',
    )
    parser.add_argument(
        "--camera-only", action="store_true",
        help="Only run the camera correspondence check",
    )
    parser.add_argument(
        "--inventory-only", action="store_true",
        help="Only run the inventory check",
    )
    parser.add_argument(
        "--camera-tolerance", type=float, default=1e-5,
        help="Tolerance for camera check. Errors below this are ignored as "
             "fp32 rounding; errors >= this are flagged (default: 1e-5)",
    )
    args = parser.parse_args()

    json_files = find_action_jsons(args.data_dir, args.glob_pattern)
    print(f"Found {len(json_files)} action JSON files in {args.data_dir}\n")

    if not json_files:
        print("ERROR: No action JSON files found. Check --glob-pattern.")
        sys.exit(1)

    all_pass = True

    if not args.inventory_only:
        if not check_camera(json_files, args.data_dir, atol=args.camera_tolerance):
            all_pass = False

    if not args.camera_only:
        if not check_inventory(json_files, args.data_dir):
            all_pass = False

    if all_pass:
        print("ALL CHECKS PASSED")
    else:
        print("SOME CHECKS FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
