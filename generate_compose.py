#!/usr/bin/env python3
"""
Generate multiple Docker Compose configurations for parallel Minecraft data collection.
Each instance will have its own ports and output directories to avoid conflicts.
"""

import argparse
import json
import os
import re
from pathlib import Path

import yaml


def generate_terrain_settings(biome, surface_block):
    """Generate terrain settings JSON for flat world generation."""
    terrain_settings = {
        "layers": [
            {"block": "minecraft:bedrock", "height": 1},
            {"block": "minecraft:stone", "height": 124},
            {"block": "minecraft:dirt", "height": 2},
            {"block": f"minecraft:{surface_block}", "height": 1},
        ],
        "biome": f"minecraft:{biome}",
    }
    return terrain_settings


def generate_compose_config(
    instance_id,
    base_port,
    base_rcon_port,
    receiver_port,
    coord_port,
    data_dir_base,
    output_dir,
    num_episodes,
    episode_start_id,
    bootstrap_wait_time,
):
    """Generate a Docker Compose configuration for a single instance."""

    # Calculate ports for this instance
    mc_port = base_port + instance_id
    rcon_port = base_rcon_port + instance_id

    # Directories - each instance gets its own data subdirectory
    data_dir = f"{data_dir_base}/{instance_id}"

    config = {
        "networks": {f"mc_network_{instance_id}": {"driver": "bridge"}},
        "services": {
            f"mc_instance_{instance_id}": {
                "image": "itzg/minecraft-server",
                "tty": True,
                "network_mode": "host",
                "environment": {
                    "EULA": "TRUE",
                    "VERSION": "1.21",
                    "TYPE": "PAPER",
                    "MODE": "creative",
                    "RCON_PORT": rcon_port,
                    "SERVER_PORT": mc_port,
                    "ONLINE_MODE": False,
                    "ENFORCE_SECURE_PROFILE": False,
                    "RCON_PASSWORD": "change-me",
                    "LEVEL_TYPE": "minecraft:flat",
                    "GENERATOR_SETTINGS": "TERRAIN_SETTINGS_PLACEHOLDER",
                },
                "volumes": [f"{data_dir}:/data"],
            },
            f"sender_alpha_instance_{instance_id}": {
                "image": "mc-multiplayer:latest",
                "depends_on": [
                    f"mc_instance_{instance_id}",
                    f"receiver_alpha_instance_{instance_id}",
                ],
                "volumes": [f"{output_dir}:/output"],
                "environment": {
                    "BOT_NAME": "Alpha",
                    "OTHER_BOT_NAME": "Bravo",
                    "RECEIVER_HOST": f"receiver_alpha_instance_{instance_id}",
                    "RECEIVER_PORT": receiver_port,
                    "COORD_PORT": coord_port,
                    "OTHER_COORD_HOST": f"sender_bravo_instance_{instance_id}",
                    "OTHER_COORD_PORT": coord_port,
                    "BOT_RNG_SEED": str(12345 + instance_id),
                    "EPISODES_NUM": num_episodes,
                    "EPISODE_START_ID": episode_start_id,
                    "MC_HOST": "host.docker.internal",
                    "MC_PORT": mc_port,
                    "RCON_HOST": "host.docker.internal",
                    "RCON_PORT": rcon_port,
                    "BOOTSTRAP_WAIT_TIME": bootstrap_wait_time,
                },
                "extra_hosts": ["host.docker.internal:host-gateway"],
                "networks": [f"mc_network_{instance_id}"],
                "command": "./entrypoint_senders.sh",
            },
            f"sender_bravo_instance_{instance_id}": {
                "image": "mc-multiplayer:latest",
                "depends_on": [
                    f"mc_instance_{instance_id}",
                    f"receiver_bravo_instance_{instance_id}",
                    f"sender_alpha_instance_{instance_id}",
                ],
                "volumes": [f"{output_dir}:/output"],
                "environment": {
                    "BOT_NAME": "Bravo",
                    "OTHER_BOT_NAME": "Alpha",
                    "RECEIVER_HOST": f"receiver_bravo_instance_{instance_id}",
                    "RECEIVER_PORT": receiver_port,
                    "COORD_PORT": coord_port,
                    "OTHER_COORD_HOST": f"sender_alpha_instance_{instance_id}",
                    "OTHER_COORD_PORT": coord_port,
                    "BOT_RNG_SEED": str(12345 + instance_id),
                    "EPISODES_NUM": num_episodes,
                    "EPISODE_START_ID": episode_start_id,
                    "MC_HOST": "host.docker.internal",
                    "MC_PORT": mc_port,
                    "RCON_HOST": "host.docker.internal",
                    "RCON_PORT": rcon_port,
                    "BOOTSTRAP_WAIT_TIME": bootstrap_wait_time,
                },
                "extra_hosts": ["host.docker.internal:host-gateway"],
                "networks": [f"mc_network_{instance_id}"],
                "command": "./entrypoint_senders.sh",
            },
            f"receiver_alpha_instance_{instance_id}": {
                "image": "mc-multiplayer:latest",
                "environment": {
                    "PORT": receiver_port,
                    "NAME": "Alpha",
                    "INSTANCE_ID": instance_id,
                    "EPISODE_START_ID": episode_start_id,
                },
                "tty": True,
                "volumes": [f"{output_dir}:/output"],
                "networks": [f"mc_network_{instance_id}"],
                "command": "./entrypoint_receiver.sh",
            },
            f"receiver_bravo_instance_{instance_id}": {
                "image": "mc-multiplayer:latest",
                "environment": {
                    "PORT": receiver_port,
                    "NAME": "Bravo",
                    "INSTANCE_ID": instance_id,
                    "EPISODE_START_ID": episode_start_id,
                },
                "tty": True,
                "volumes": [f"{output_dir}:/output"],
                "networks": [f"mc_network_{instance_id}"],
                "command": "./entrypoint_receiver.sh",
            },
        },
    }

    return config


def main():
    parser = argparse.ArgumentParser(
        description="Generate Docker Compose files for parallel Minecraft data "
        "collection"
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
        default=25675,
        help="Base RCON port (default: 25675)",
    )
    parser.add_argument(
        "--receiver-port",
        type=int,
        default=8090,
        help="Receiver port for bridge network services (default: 8090)",
    )
    parser.add_argument(
        "--coord-port",
        type=int,
        default=8100,
        help="Coordination port for bridge network services (default: 8100)",
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
    parser.add_argument(
        "--num_episodes",
        type=int,
        default=5,
        help="Number of episodes to run (default: 5)",
    )
    parser.add_argument(
        "--episode_start_id",
        type=int,
        default=0,
        help="Starting episode ID (default: 0)",
    )
    parser.add_argument(
        "--bootstrap_wait_time",
        type=int,
        default=60,
        help="Bootstrap wait time (default: 60)",
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
            args.receiver_port,
            args.coord_port,
            args.data_dir,
            args.output_dir,
            args.num_episodes,
            args.episode_start_id,
            args.bootstrap_wait_time,
        )

        # Write compose file
        compose_file = compose_dir / f"docker-compose-{i:03d}.yml"
        with open(compose_file, "w") as f:
            yaml.dump(config, f, default_flow_style=False, sort_keys=False)

        # Generate terrain settings for this instance
        terrain_options = [
            ("plains", "grass_block"),
            ("windswept_hills", "grass_block"),
            ("snowy_plains", "snow"),
            ("desert", "sand"),
            ("desert", "red_sand"),
        ]
        selected_terrain = terrain_options[i % len(terrain_options)]
        biome, surface_block = selected_terrain
        terrain_settings = generate_terrain_settings(biome, surface_block)

        # Format terrain settings as compact JSON multiline string
        layers_json = []
        for layer in terrain_settings["layers"]:
            layer_str = (
                f'{{ "block": "{layer["block"]}", "height": {layer["height"]} }}'
            )
            layers_json.append(layer_str)

        layers_str = ",\n    ".join(layers_json)
        biome = terrain_settings["biome"]
        terrain_json = (
            f'{{\n  "layers": [\n    {layers_str}\n  ],\n  "biome": "{biome}"\n}}'
        )
        newline = "\n"
        terrain_multiline = (
            f">-\n        {terrain_json.replace(newline, newline + '        ')}"
        )

        # Replace placeholder with actual terrain settings
        with open(compose_file, "r") as f:
            content = f.read()

        content = re.sub(
            r"GENERATOR_SETTINGS: TERRAIN_SETTINGS_PLACEHOLDER",
            f"GENERATOR_SETTINGS: {terrain_multiline}",
            content,
        )

        with open(compose_file, "w") as f:
            f.write(content)

        # Create necessary directories
        os.makedirs(f"{args.data_dir}/{i}", exist_ok=True)

        print(f"Generated: {compose_file}")

    # Create shared output directory
    os.makedirs(args.output_dir, exist_ok=True)

    print(f"\nGenerated {args.instances} configurations in {compose_dir}/")
    print(f"Published port ranges (host network):")
    print(
        f"  Minecraft servers: {args.base_port}-{args.base_port + args.instances - 1}"
    )
    print(
        f"  RCON ports: {args.base_rcon_port}-{args.base_rcon_port + args.instances - 1}"
    )
    print(
        f"Bridge network services (receivers, senders) use internal communication only."
    )


if __name__ == "__main__":
    main()
