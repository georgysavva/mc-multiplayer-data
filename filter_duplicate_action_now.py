#!/usr/bin/env python3
"""
Deduplicate entities in JSON files by the `actionNow` field.

Keeps the first occurrence of each actionNow (input is assumed to be non-decreasing
by actionNow). Writes a new file next to the original with a `.dedup` suffix
before the extension (e.g., file.json -> file.dedup.json).

Usage:
  python filter_duplicate_action_now.py /path/to/file.json [more.json ...]

Exit codes:
  0 on success for all files, 1 if any file failed.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Iterable, List, Tuple


def _find_entity_list(container: Any) -> Tuple[List[dict], Any, str | None]:
    """Attempt to locate the list of entities within the JSON structure.

    Returns a tuple of (entity_list, root_container, key_used).
    If the root is a list, returns (list, None, None).
    If the root is a dict and contains a list of dicts likely holding `actionNow`,
    returns that list and the key used.
    Raises ValueError if no suitable list is found.
    """
    if isinstance(container, list):
        return container, None, None

    if isinstance(container, dict):
        # Prefer lists whose first element is a dict with actionNow.
        candidates = []
        for k, v in container.items():
            if isinstance(v, list) and v:
                first = v[0]
                if isinstance(first, dict) and ("actionNow" in first):
                    candidates.append((k, v))

        if not candidates:
            # Fallback: any list value
            for k, v in container.items():
                if isinstance(v, list):
                    candidates.append((k, v))

        if candidates:
            key, lst = candidates[0]
            return lst, container, key

    raise ValueError("Could not locate a list of entities in the JSON structure.")


def dedup_by_action_now(items: Iterable[Any]) -> Tuple[List[Any], int, int, int]:
    """Return a new list with duplicates by actionNow removed.

    Keeps the first occurrence of each actionNow; items without actionNow are kept.

    Returns: (result, total, kept, removed)
    """
    seen = set()
    result: List[Any] = []
    total = 0
    removed = 0

    for obj in items:
        total += 1
        if not isinstance(obj, dict):
            result.append(obj)
            continue

        if "actionNow" not in obj:
            result.append(obj)
            continue

        key = obj["actionNow"]
        if key in seen:
            removed += 1
            continue
        seen.add(key)
        result.append(obj)

    kept = total - removed
    return result, total, kept, removed


def process_file(path: Path, inplace: bool = False) -> Tuple[bool, str]:
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)

        entity_list, container, key = _find_entity_list(data)
        new_list, total, kept, removed = dedup_by_action_now(entity_list)

        if container is None:
            new_data = new_list
        else:
            assert key is not None
            container[key] = new_list
            new_data = container

        if inplace:
            out_path = path
        else:
            out_path = Path(f"{path.stem}_dedup.json")

        with out_path.open("w", encoding="utf-8") as f:
            json.dump(new_data, f, ensure_ascii=False, indent=2)
            f.write("\n")

        msg = f"{path} -> {out_path} | total={total}, kept={kept}, removed={removed}"
        return True, msg
    except Exception as e:
        return False, f"{path}: ERROR: {e}"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", help="JSON files to process")
    parser.add_argument(
        "--inplace",
        action="store_true",
        help="Overwrite the original file instead of writing *.dedup.json",
    )
    args = parser.parse_args(argv)

    any_failed = False
    for p in args.paths:
        ok, msg = process_file(Path(p), inplace=args.inplace)
        print(msg)
        if not ok:
            any_failed = True
    return 1 if any_failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
