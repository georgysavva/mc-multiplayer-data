#!/usr/bin/env python3

import argparse
import json
from collections import Counter
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np


def analyze_json_data(json_file_path):
    """Analyze JSON data and generate statistics and plots."""

    # Load JSON data
    with open(json_file_path, "r") as f:
        data = json.load(f)

    print(f"Loaded {len(data)} records from {json_file_path}")

    # Extract relevant fields
    action_now_values = []
    action_ptime_values = []
    render_ptime_on_event_values = []
    render_ptime_values = []

    for record in data:
        if "actionNow" in record:
            action_now_values.append(record["actionNow"])
        if "actionPTime" in record:
            action_ptime_values.append(record["actionPTime"])
        if "renderPTimeOnEvent" in record:
            render_ptime_on_event_values.append(record["renderPTimeOnEvent"])
        if "renderPTime" in record:
            render_ptime_values.append(record["renderPTime"])

    # Count duplicate actionNow values
    action_now_counter = Counter(action_now_values)
    duplicate_action_now = sum(1 for count in action_now_counter.values() if count > 1)

    print(f"Number of unique actionNow values with duplicates: {duplicate_action_now}")

    # Calculate differences between consecutive actionPTime values
    action_ptime_diffs = []
    if len(action_ptime_values) > 1:
        action_ptime_diffs = [
            action_ptime_values[i + 1] - action_ptime_values[i]
            for i in range(len(action_ptime_values) - 1)
        ]

    # Calculate differences between consecutive renderPTime values
    render_ptime_diffs = []
    if len(render_ptime_values) > 1:
        render_ptime_diffs = [
            render_ptime_values[i + 1] - render_ptime_values[i]
            for i in range(len(render_ptime_values) - 1)
        ]

    # Calculate differences between renderPTimeOnEvent and actionPTime
    render_action_diffs = []
    for record in data:
        if "renderPTimeOnEvent" in record and "actionPTime" in record:
            diff = record["renderPTimeOnEvent"] - record["actionPTime"]
            render_action_diffs.append(diff)

    # Create plots
    fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(12, 15))

    # Plot 1: Differences between consecutive actionPTime values
    if action_ptime_diffs:
        ax1.plot(range(len(action_ptime_diffs)), action_ptime_diffs, "b-", alpha=0.7)
        ax1.set_title("Differences between Consecutive actionPTime Values")
        ax1.set_xlabel("Index")
        ax1.set_ylabel("Time Difference (ms)")
        ax1.grid(True, alpha=0.3)
        ax1.set_xlim(0, len(action_ptime_diffs))

        # Add statistics text
        mean_diff = np.mean(action_ptime_diffs)
        std_diff = np.std(action_ptime_diffs)
        ax1.text(
            0.02,
            0.98,
            f"Mean: {mean_diff:.2f}ms\nStd: {std_diff:.2f}ms",
            transform=ax1.transAxes,
            verticalalignment="top",
            bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.8),
        )

    # Plot 2: Differences between consecutive renderPTime values
    if render_ptime_diffs:
        ax2.plot(range(len(render_ptime_diffs)), render_ptime_diffs, "g-", alpha=0.7)
        ax2.set_title("Differences between Consecutive renderPTime Values")
        ax2.set_xlabel("Index")
        ax2.set_ylabel("Time Difference (ms)")
        ax2.grid(True, alpha=0.3)
        ax2.set_xlim(0, len(render_ptime_diffs))

        # Add statistics text
        mean_diff = np.mean(render_ptime_diffs)
        std_diff = np.std(render_ptime_diffs)
        ax2.text(
            0.02,
            0.98,
            f"Mean: {mean_diff:.2f}ms\nStd: {std_diff:.2f}ms",
            transform=ax2.transAxes,
            verticalalignment="top",
            bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.8),
        )

    # Plot 3: Differences between renderPTimeOnEvent and actionPTime
    if render_action_diffs:
        ax3.plot(range(len(render_action_diffs)), render_action_diffs, "r-", alpha=0.7)
        ax3.set_title("Differences between renderPTimeOnEvent and actionPTime")
        ax3.set_xlabel("Record Index")
        ax3.set_ylabel("Time Difference (ms)")
        ax3.grid(True, alpha=0.3)
        ax3.set_xlim(0, len(render_action_diffs))

        # Add statistics text
        mean_diff = np.mean(render_action_diffs)
        std_diff = np.std(render_action_diffs)
        ax3.text(
            0.02,
            0.98,
            f"Mean: {mean_diff:.2f}ms\nStd: {std_diff:.2f}ms",
            transform=ax3.transAxes,
            verticalalignment="top",
            bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.8),
        )

    plt.tight_layout()

    # Save plot next to the JSON file
    json_path = Path(json_file_path)
    plot_path = json_path.parent / f"{json_path.stem}_analysis.png"
    plt.savefig(plot_path, dpi=300, bbox_inches="tight")
    print(f"Plot saved to: {plot_path}")

    # Print summary statistics
    print(f"\nSummary Statistics:")
    print(f"Total records: {len(data)}")
    print(f"Records with actionPTime: {len(action_ptime_values)}")
    print(f"Records with renderPTimeOnEvent: {len(render_ptime_on_event_values)}")
    print(f"Records with renderPTime: {len(render_ptime_values)}")
    print(
        f"Records with both renderPTimeOnEvent and actionPTime: {len(render_action_diffs)}"
    )

    if action_ptime_diffs:
        print(
            f"ActionPTime consecutive differences - Mean: {np.mean(action_ptime_diffs):.2f}ms, Std: {np.std(action_ptime_diffs):.2f}ms"
        )

    if render_ptime_diffs:
        print(
            f"RenderPTime consecutive differences - Mean: {np.mean(render_ptime_diffs):.2f}ms, Std: {np.std(render_ptime_diffs):.2f}ms"
        )

    if render_action_diffs:
        print(
            f"RenderPTimeOnEvent - ActionPTime differences - Mean: {np.mean(render_action_diffs):.2f}ms, Std: {np.std(render_action_diffs):.2f}ms"
        )


def main():
    parser = argparse.ArgumentParser(
        description="Analyze JSON data for timing statistics and duplicates"
    )
    parser.add_argument("json_file", help="Path to JSON file containing the data")

    args = parser.parse_args()

    if not Path(args.json_file).exists():
        print(f"Error: File {args.json_file} does not exist")
        return 1

    try:
        analyze_json_data(args.json_file)
        return 0
    except Exception as e:
        print(f"Error analyzing file: {e}")
        return 1


if __name__ == "__main__":
    exit(main())
