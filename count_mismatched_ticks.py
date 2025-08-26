#!/usr/bin/env python3
"""
Count elements in a JSON array file where actionTick != renderTick.

Usage:
  python count_mismatched_ticks.py /path/to/file.json

Prints the count to stdout and exits with code 0. Uses only the Python stdlib.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any


def count_mismatches(objs: list[dict[str, Any]]) -> int:
    return sum(1 for obj in objs if obj.get("actionTick") != obj.get("renderTick"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Count JSON records where actionTick != renderTick"
    )
    parser.add_argument(
        "json_path",
        help="Path to the JSON file containing an array of objects",
    )
    args = parser.parse_args(argv)

    try:
        with open(args.json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: File not found: {args.json_path}", file=sys.stderr)
        return 2
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in {args.json_path}: {e}", file=sys.stderr)
        return 3

    if not isinstance(data, list):
        print("Error: Expected top-level JSON array.", file=sys.stderr)
        return 4

    count = count_mismatches(data)  # type: ignore[arg-type]
    print(count)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
