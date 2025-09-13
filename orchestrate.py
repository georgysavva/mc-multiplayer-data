#!/usr/bin/env python3
"""
Orchestration script to manage multiple Docker Compose instances for parallel data collection.
"""

import argparse
import os
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


class InstanceManager:
    def __init__(self, compose_dir="compose_configs"):
        self.compose_dir = Path(compose_dir)
        self.running_instances = {}

    def get_compose_files(self):
        """Get all Docker Compose files in the config directory."""
        return sorted(list(self.compose_dir.glob("docker-compose-*.yml")))

    def start_instance(self, compose_file):
        """Start a single Docker Compose instance."""
        instance_name = compose_file.stem
        print(f"Starting instance: {instance_name}")

        try:
            cmd = [
                "docker",
                "compose",
                "-p",
                instance_name,
                "-f",
                str(compose_file),
                "up",
                "-d",
            ]
            result = subprocess.run(
                cmd, capture_output=True, text=True, cwd=self.compose_dir.parent
            )

            if result.returncode == 0:
                print(f"✅ Started: {instance_name}")
                return True, instance_name
            else:
                print(f"❌ Failed to start {instance_name}: {result.stderr}")
                return False, instance_name

        except Exception as e:
            print(f"❌ Error starting {instance_name}: {e}")
            return False, instance_name

    def stop_instance(self, compose_file):
        """Stop a single Docker Compose instance."""
        instance_name = compose_file.stem
        print(f"Stopping instance: {instance_name}")

        try:
            cmd = [
                "docker",
                "compose",
                "-p",
                instance_name,
                "-f",
                str(compose_file),
                "down",
                "-v",
            ]
            result = subprocess.run(
                cmd, capture_output=True, text=True, cwd=self.compose_dir.parent
            )

            if result.returncode == 0:
                print(f"✅ Stopped: {instance_name}")
                return True, instance_name
            else:
                print(f"❌ Failed to stop {instance_name}: {result.stderr}")
                return False, instance_name

        except Exception as e:
            print(f"❌ Error stopping {instance_name}: {e}")
            return False, instance_name

    def start_all(self):
        """Start all instances in parallel."""
        compose_files = self.get_compose_files()
        total_instances = len(compose_files)

        if total_instances == 0:
            print("No Docker Compose files found. Run generate_compose.py first.")
            return

        print(f"Starting {total_instances} instances in parallel...")

        # Start all instances simultaneously
        with ThreadPoolExecutor(max_workers=total_instances) as executor:
            futures = {
                executor.submit(self.start_instance, cf): cf for cf in compose_files
            }

            for future in as_completed(futures):
                success, instance_name = future.result()
                if success:
                    self.running_instances[instance_name] = futures[future]

        print(
            f"\n🎉 Started {len(self.running_instances)}/{total_instances} instances successfully"
        )

    def stop_all(self):
        """Stop all instances."""
        compose_files = self.get_compose_files()
        total_instances = len(compose_files)

        if total_instances == 0:
            print("No Docker Compose files found.")
            return

        print(f"Stopping {total_instances} instances...")

        with ThreadPoolExecutor(max_workers=total_instances) as executor:
            futures = {
                executor.submit(self.stop_instance, cf): cf for cf in compose_files
            }

            stopped_count = 0
            for future in as_completed(futures):
                success, instance_name = future.result()
                if success:
                    stopped_count += 1

        print(f"\n🛑 Stopped {stopped_count}/{total_instances} instances")

    def status(self):
        """Show status of all instances."""
        compose_files = self.get_compose_files()

        if not compose_files:
            print("No Docker Compose files found.")
            return

        print(f"Found {len(compose_files)} configured instances:")
        print("\nChecking status...")

        running_count = 0
        for compose_file in compose_files:
            instance_name = compose_file.stem
            try:
                cmd = [
                    "docker",
                    "compose",
                    "-p",
                    instance_name,
                    "-f",
                    str(compose_file),
                    "ps",
                    "-q",
                ]
                result = subprocess.run(
                    cmd, capture_output=True, text=True, cwd=self.compose_dir.parent
                )

                if result.stdout.strip():
                    # Check if containers are actually running
                    container_ids = result.stdout.strip().split("\n")
                    container_ids = [
                        cid for cid in container_ids if cid.strip()
                    ]  # Filter empty strings

                    running_containers = 0
                    for container_id in container_ids:
                        inspect_cmd = [
                            "docker",
                            "inspect",
                            "--format",
                            "{{.State.Status}}",
                            container_id,
                        ]
                        inspect_result = subprocess.run(
                            inspect_cmd, capture_output=True, text=True
                        )
                        if inspect_result.stdout.strip() == "running":
                            running_containers += 1

                    if running_containers > 0:
                        print(
                            f"🟢 {instance_name}: {running_containers} containers running"
                        )
                        running_count += 1
                    else:
                        print(f"🟡 {instance_name}: containers exist but not running")
                else:
                    print(f"🔴 {instance_name}: stopped")

            except Exception as e:
                print(f"❓ {instance_name}: error checking status - {e}")

        print(f"\nSummary: {running_count}/{len(compose_files)} instances running")

    def logs(self, instance_pattern=None, follow=False):
        """Show logs for instances matching pattern."""
        compose_files = self.get_compose_files()

        if instance_pattern:
            compose_files = [cf for cf in compose_files if instance_pattern in cf.stem]

        if not compose_files:
            print(f"No instances found matching pattern: {instance_pattern}")
            return

        if len(compose_files) == 1:
            # Show logs for single instance
            compose_file = compose_files[0]
            cmd = [
                "docker",
                "compose",
                "-p",
                compose_file.stem,
                "-f",
                str(compose_file),
                "logs",
            ]
            if follow:
                cmd.append("-f")
            subprocess.run(cmd, cwd=self.compose_dir.parent)
        else:
            # Show logs for multiple instances
            print(f"Showing logs for {len(compose_files)} instances...")
            for compose_file in compose_files:
                print(f"\n{'='*50}")
                print(f"Logs for {compose_file.stem}")
                print(f"{'='*50}")
                cmd = [
                    "docker",
                    "compose",
                    "-p",
                    compose_file.stem,
                    "-f",
                    str(compose_file),
                    "logs",
                    "--tail",
                    "20",
                ]
                subprocess.run(cmd, cwd=self.compose_dir.parent)


def main():
    parser = argparse.ArgumentParser(
        description="Orchestrate multiple Docker Compose instances"
    )
    parser.add_argument(
        "command",
        choices=["start", "stop", "status", "logs"],
        help="Command to execute",
    )
    parser.add_argument(
        "--compose-dir",
        default="compose_configs",
        help="Directory containing Docker Compose files",
    )
    parser.add_argument("--instance", help="Instance pattern for logs command")
    parser.add_argument(
        "--follow",
        "-f",
        action="store_true",
        help="Follow logs (only for single instance)",
    )

    args = parser.parse_args()

    manager = InstanceManager(args.compose_dir)

    if args.command == "start":
        manager.start_all()
    elif args.command == "stop":
        manager.stop_all()
    elif args.command == "status":
        manager.status()
    elif args.command == "logs":
        manager.logs(args.instance, args.follow)


if __name__ == "__main__":
    main()
