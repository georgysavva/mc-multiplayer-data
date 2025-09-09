#!/usr/bin/env python3
"""
Generate multiple Docker Compose configurations for parallel Minecraft data collection.
Each instance will have its own ports and output directories to avoid conflicts.
"""

import argparse
import os
from pathlib import Path

import yaml


def generate_compose_config(
    instance_id,
    base_port=25565,
    base_rcon_port=25675,
    base_receiver_port=8090,
    base_coord_port=9100,
    data_dir_base="./data",
    output_dir="./output",
):
    """Generate a Docker Compose configuration for a single instance."""

    # Calculate ports for this instance
    mc_port = base_port + instance_id
    rcon_port = base_rcon_port + instance_id
    receiver1_port = base_receiver_port + (instance_id * 10) + 1
    receiver2_port = base_receiver_port + (instance_id * 10) + 2
    coord1_port = base_coord_port + (instance_id * 10) + 1
    coord2_port = base_coord_port + (instance_id * 10) + 2

    # Directories - each instance gets its own data subdirectory
    data_dir = f"{data_dir_base}{instance_id}"

    config = {
        "services": {
            f"mc_{instance_id}": {
                "image": "itzg/minecraft-server",
                "tty": True,
                "ports": [f"{mc_port}:25565", f"{rcon_port}:25575"],
                "environment": {
                    "EULA": "TRUE",
                    "VERSION": "1.21",
                    "MODE": "creative",
                    "OPS": "Alpha\nBravo",
                    "ONLINE_MODE": False,
                    "ENFORCE_SECURE_PROFILE": False,
                    "RCON_PASSWORD": "change-me",
                    "LEVEL_TYPE": "minecraft:flat",
                    "GENERATOR_SETTINGS": {
                        "layers": [
                            {"block": "minecraft:bedrock", "height": 1},
                            {"block": "minecraft:stone", "height": 124},
                            {"block": "minecraft:dirt", "height": 2},
                            {"block": "minecraft:grass_block", "height": 1},
                        ],
                        "biome": "minecraft:plains",
                    },
                },
                "volumes": [f"{data_dir}:/data"],
            },
            f"senders1_{instance_id}": {
                "build": ".",
                "depends_on": [f"mc_{instance_id}", f"receiver1_{instance_id}"],
                "ports": [f"{coord1_port}:{coord1_port}"],
                "volumes": [f"{output_dir}:/output"],
                "environment": {
                    "BOT_NAME": "Alpha",
                    "OTHER_BOT_NAME": "Bravo",
                    "RECEIVER_PORT": receiver1_port,
                    "COORD_PORT": coord1_port,
                    "OTHER_COORD_PORT": coord2_port,
                    "BOT_RNG_SEED": str(12345 + instance_id),
                    "EPISODES_NUM": 5,
                    "MC_PORT": mc_port,
                },
                "command": "./entrypoint_senders.sh",
            },
            f"senders2_{instance_id}": {
                "build": ".",
                "depends_on": [
                    f"mc_{instance_id}",
                    f"receiver2_{instance_id}",
                    f"senders1_{instance_id}",
                ],
                "ports": [f"{coord2_port}:{coord2_port}"],
                "volumes": [f"{output_dir}:/output"],
                "environment": {
                    "BOT_NAME": "Bravo",
                    "OTHER_BOT_NAME": "Alpha",
                    "RECEIVER_PORT": receiver2_port,
                    "COORD_PORT": coord2_port,
                    "OTHER_COORD_PORT": coord1_port,
                    "BOT_RNG_SEED": str(12345 + instance_id),
                    "EPISODES_NUM": 5,
                    "MC_PORT": mc_port,
                },
                "command": "./entrypoint_senders.sh",
            },
            f"receiver1_{instance_id}": {
                "build": ".",
                "environment": {
                    "PORT": receiver1_port,
                    "NAME": "Alpha",
                    "INSTANCE_ID": instance_id,
                },
                "ports": [f"{receiver1_port}:{receiver1_port}"],
                "tty": True,
                "volumes": [f"{output_dir}:/output"],
                "command": "./entrypoint_receiver.sh",
            },
            f"receiver2_{instance_id}": {
                "build": ".",
                "environment": {
                    "PORT": receiver2_port,
                    "NAME": "Bravo",
                    "INSTANCE_ID": instance_id,
                },
                "ports": [f"{receiver2_port}:{receiver2_port}"],
                "tty": True,
                "volumes": [f"{output_dir}:/output"],
                "command": "./entrypoint_receiver.sh",
            },
            f"script_{instance_id}": {
                "build": ".",
                "tty": True,
                "volumes": [f"{output_dir}:/output"],
                "command": "python align_videos.py /output/20250907_173011_Alpha.mp4 /output/20250907_173011_Alpha.json /output/20250907_173011_Bravo.mp4 /output/20250907_173011_Bravo.json /output",
            },
        }
    }

    return config


def main():
    parser = argparse.ArgumentParser(
        description="Generate Docker Compose files for parallel Minecraft data collection"
    )
    parser.add_argument(
        "--instances",
        type=int,
        default=32,
        help="Number of instances to generate (default: 32)",
    )
    parser.add_argument(
        "--compose-dir",
        default="compose_configs",
        help="Directory to store generated compose files",
    )
    parser.add_argument(
        "--base-port",
        type=int,
        default=25565,
        help="Base Minecraft server port (default: 25565)",
    )
    parser.add_argument(
        "--base-rcon-port",
        type=int,
        default=25575,
        help="Base RCON port (default: 25575)",
    )
    parser.add_argument(
        "--base-receiver-port",
        type=int,
        default=8090,
        help="Base receiver port (default: 8090)",
    )
    parser.add_argument(
        "--base-coord-port",
        type=int,
        default=8100,
        help="Base coordination port (default: 8100)",
    )
    parser.add_argument(
        "--data-dir",
        default="./data",
        help="Base directory for instance data directories (default: ./data)",
    )
    parser.add_argument(
        "--output-dir",
        default="./output",
        help="Shared output directory for all instances (default: ./output)",
    )

    args = parser.parse_args()

    # Create compose directory
    compose_dir = Path(args.compose_dir)
    compose_dir.mkdir(exist_ok=True)

    print(f"Generating {args.instances} Docker Compose configurations...")

    for i in range(args.instances):
        config = generate_compose_config(
            i,
            args.base_port,
            args.base_rcon_port,
            args.base_receiver_port,
            args.base_coord_port,
            args.data_dir,
            args.output_dir,
        )

        # Write compose file
        compose_file = compose_dir / f"docker-compose-{i:03d}.yml"
        with open(compose_file, "w") as f:
            yaml.dump(config, f, default_flow_style=False, sort_keys=False)

        # Create necessary directories
        os.makedirs(f"{args.data_dir}{i}", exist_ok=True)

        print(f"Generated: {compose_file}")

    # Create shared output directory
    os.makedirs(args.output_dir, exist_ok=True)

    print(f"\nGenerated {args.instances} configurations in {compose_dir}/")
    print(f"Port ranges used:")
    print(
        f"  Minecraft servers: {args.base_port}-{args.base_port + args.instances - 1}"
    )
    print(
        f"  RCON ports: {args.base_rcon_port}-{args.base_rcon_port + args.instances - 1}"
    )
    print(
        f"  Receiver ports: {args.base_receiver_port + 1}-{args.base_receiver_port + args.instances * 10 + 2}"
    )
    print(
        f"  Coordination ports: {args.base_coord_port + 1}-{args.base_coord_port + args.instances * 10 + 2}"
    )


if __name__ == "__main__":
    main()
