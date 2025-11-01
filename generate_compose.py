#!/usr/bin/env python3
"""
Generate multiple Docker Compose configurations for parallel Minecraft data collection.
Each instance will have its own ports and output directories to avoid conflicts.

Enhancements:
- Support generating a mix of flatland and normal worlds via
  `--num_flatland_world` and `--num_normal_world`.
- Add `--viewer_rendering_disabled` (default: 1) applied to senders/receivers.
- Keep `--bootstrap_wait_time` unchanged as an argument.
- Set default `--iterations_num_per_episode` to 5.
"""

import argparse
import os
import re
from pathlib import Path

import yaml


def absdir(path: str) -> str:
    """Validate path is absolute and return it.

    Raises AssertionError if not absolute to avoid ambiguous mounts.
    """
    assert os.path.isabs(path), f"expected absolute path, got: {path}"
    return path


def camera_paths(
    instance_id: int,
    alpha_base: str,
    bravo_base: str,
    data_alpha_base: str,
    data_bravo_base: str,
) -> dict:
    return {
        "alpha_output_host": os.path.join(alpha_base, str(instance_id)),
        "bravo_output_host": os.path.join(bravo_base, str(instance_id)),
        "alpha_data_host": os.path.join(data_alpha_base, str(instance_id)),
        "bravo_data_host": os.path.join(data_bravo_base, str(instance_id)),
    }


def camera_ports(
    instance_id: int,
    alpha_vnc_base: int,
    alpha_novnc_base: int,
    bravo_vnc_base: int,
    bravo_novnc_base: int,
    display_base: int,
    vnc_step: int,
    display_step: int,
) -> dict:
    return {
        "alpha_vnc": alpha_vnc_base + vnc_step * instance_id,
        "alpha_novnc": alpha_novnc_base + vnc_step * instance_id,
        "bravo_vnc": bravo_vnc_base + vnc_step * instance_id,
        "bravo_novnc": bravo_novnc_base + vnc_step * instance_id,
        "alpha_display": f":{display_base + display_step * instance_id}",
        "bravo_display": f":{display_base + display_step * instance_id + 1}",
    }


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
    min_run_actions,
    max_run_actions,
    episode_category,
    episode_types,
    iterations_num_per_episode,
    smoke_test,
    viewer_rendering_disabled,
    world_type,
    # camera specific
    camera_output_alpha_base,
    camera_output_bravo_base,
    camera_data_alpha_base,
    camera_data_bravo_base,
    camera_alpha_vnc_base,
    camera_alpha_novnc_base,
    camera_bravo_vnc_base,
    camera_bravo_novnc_base,
    display_base,
    vnc_step,
    display_step,
):
    """Generate a Docker Compose configuration for a single instance."""

    # Calculate ports for this instance
    mc_port = base_port + instance_id
    rcon_port = base_rcon_port + instance_id

    # Directories - each instance gets its own data subdirectory
    data_dir = f"{data_dir_base}/{instance_id}"

    cam_paths = camera_paths(
        instance_id,
        camera_output_alpha_base,
        camera_output_bravo_base,
        camera_data_alpha_base,
        camera_data_bravo_base,
    )
    cam_ports = camera_ports(
        instance_id,
        camera_alpha_vnc_base,
        camera_alpha_novnc_base,
        camera_bravo_vnc_base,
        camera_bravo_novnc_base,
        display_base,
        vnc_step,
        display_step,
    )

    project_root = str(Path(__file__).resolve().parent)

    entrypoint_host = os.path.join(project_root, "camera", "entrypoint.sh")
    launch_host = os.path.join(project_root, "camera", "launch_minecraft.py")
    camera_package_json_host = os.path.join(project_root, "camera", "package.json")

    config = {
        "networks": {f"mc_network_{instance_id}": {"driver": "bridge"}},
        "services": {
            f"prep_data_instance_{instance_id}": {
                "image": "busybox:latest",
                "command": [
                    "sh",
                    "-c",
                    "mkdir -p /data /data/plugins /data/skins && "
                    "chmod 777 /data /data/plugins /data/skins && "
                    "if [ -d /source_plugins ] && [ -n \"$(ls -A /source_plugins 2>/dev/null)\" ]; then "
                    "  cp -r /source_plugins/. /data/plugins/; "
                    "fi; "
                    "if [ -d /source_skins ] && [ -n \"$(ls -A /source_skins 2>/dev/null)\" ]; then "
                    "  cp -r /source_skins/. /data/skins/; "
                    "fi; "
                    "chmod -R 777 /data/plugins /data/skins",
                ],
                "volumes": [
                    f"{data_dir}:/data",
                    f"{project_root}/plugins:/source_plugins:ro",
                    f"{project_root}/skins:/source_skins:ro",
                ],
                "restart": "no",
            },
            f"mc_instance_{instance_id}": {
                "depends_on": {
                    f"prep_data_instance_{instance_id}": {"condition": "service_completed_successfully"}
                },
                "image": "itzg/minecraft-server",
                "tty": True,
                "network_mode": "host",
                "environment": (lambda: {
                    # Base server env, common to both normal and flat worlds
                    "EULA": "TRUE",
                    "VERSION": "1.20.4",
                    "TYPE": "PAPER",
                    "MODE": "survival",
                    "RCON_PORT": rcon_port,
                    "SERVER_PORT": mc_port,
                    "ONLINE_MODE": False,
                    "ENFORCE_SECURE_PROFILE": False,
                    "RCON_PASSWORD": "research",
                    "BROADCAST_RCON_TO_OPS": True,
                    "OPS": "timwm,Pengulu",
                    **(
                        {"LEVEL_TYPE": "minecraft:flat", "GENERATOR_SETTINGS": "TERRAIN_SETTINGS_PLACEHOLDER"}
                        if str(world_type).lower() == "flat" else {}
                    ),
                })(),
                "volumes": [
                    f"{data_dir}:/data",
                    f"{project_root}/plugins:/data/plugins",
                    f"{project_root}/skins:/data/skins",
                ],
                "healthcheck": {
                    "test": [
                        "CMD-SHELL",
                        f"mc-monitor status --host localhost --port {mc_port}",
                    ],
                    "interval": "10s",
                    "timeout": "5s",
                    "retries": 12,
                },
            },
            f"sender_alpha_instance_{instance_id}": {
                "image": "ojmichel/mc-multiplayer-base:latest",
                "build": {
                    "context": project_root,
                    "dockerfile": "Dockerfile",
                },
                "depends_on": {
                    f"mc_instance_{instance_id}": {"condition": "service_healthy"},
                    f"receiver_alpha_instance_{instance_id}": {"condition": "service_started"},
                },
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
                    "EPISODES_NUM": 1,
                    "EPISODE_START_ID": episode_start_id,
                    "EPISODE_TYPES": episode_types,
                    "MC_HOST": "host.docker.internal",
                    "MC_PORT": mc_port,
                    "RCON_HOST": "host.docker.internal",
                    "RCON_PORT": rcon_port,
                    "RCON_PASSWORD": "research",
                    "BOOTSTRAP_WAIT_TIME": bootstrap_wait_time,
                    "ENABLE_CAMERA_WAIT": 1,
                    "CAMERA_READY_RETRIES": 300,
                    "CAMERA_READY_CHECK_INTERVAL": 2000,
                    "MIN_RUN_ACTIONS": min_run_actions,
                    "MAX_RUN_ACTIONS": max_run_actions,
                    "ITERATIONS_NUM_PER_EPISODE": iterations_num_per_episode,
                    "MC_VERSION": "1.20.4",
                    "VIEWER_RENDERING_DISABLED": viewer_rendering_disabled,
                    "VIEWER_RECORDING_INTERVAL": 50,
                    "WALK_TIMEOUT": 5,
                    "TELEPORT": 1,
                    "WORLD_TYPE": str(world_type).lower(),
                    "SMOKE_TEST": smoke_test,
                    "INSTANCE_ID": instance_id,
                    "OUTPUT_DIR": "/output",
                },
                "extra_hosts": ["host.docker.internal:host-gateway"],
                "networks": [f"mc_network_{instance_id}"],
                "command": "./entrypoint_senders.sh",
            },
            f"sender_bravo_instance_{instance_id}": {
                "image": "ojmichel/mc-multiplayer-base:latest",
                "build": {
                    "context": project_root,
                    "dockerfile": "Dockerfile",
                },
                "depends_on": {
                    f"mc_instance_{instance_id}": {"condition": "service_healthy"},
                    f"receiver_bravo_instance_{instance_id}": {"condition": "service_started"},
                    f"sender_alpha_instance_{instance_id}": {"condition": "service_started"},
                },
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
                    "EPISODES_NUM": 1,
                    "EPISODE_START_ID": episode_start_id,
                    "EPISODE_TYPES": episode_types,
                    "MC_HOST": "host.docker.internal",
                    "MC_PORT": mc_port,
                    "RCON_HOST": "host.docker.internal",
                    "RCON_PORT": rcon_port,
                    "RCON_PASSWORD": "research",
                    "BOOTSTRAP_WAIT_TIME": bootstrap_wait_time,
                    "ENABLE_CAMERA_WAIT": 1,
                    "CAMERA_READY_RETRIES": 300,
                    "CAMERA_READY_CHECK_INTERVAL": 2000,
                    "MIN_RUN_ACTIONS": min_run_actions,
                    "MAX_RUN_ACTIONS": max_run_actions,
                    "ITERATIONS_NUM_PER_EPISODE": iterations_num_per_episode,
                    "MC_VERSION": "1.20.4",
                    "VIEWER_RENDERING_DISABLED": viewer_rendering_disabled,
                    "VIEWER_RECORDING_INTERVAL": 50,
                    "WALK_TIMEOUT": 5,
                    "TELEPORT": 1,
                    "WORLD_TYPE": str(world_type).lower(),
                    "SMOKE_TEST": smoke_test,
                    "INSTANCE_ID": instance_id,
                    "OUTPUT_DIR": "/output",
                },
                "extra_hosts": ["host.docker.internal:host-gateway"],
                "networks": [f"mc_network_{instance_id}"],
                "command": "./entrypoint_senders.sh",
            },
            f"receiver_alpha_instance_{instance_id}": {
                "image": "ojmichel/mc-multiplayer-base:latest",
                "environment": {
                    "PORT": receiver_port,
                    "NAME": "Alpha",
                    "INSTANCE_ID": instance_id,
                    "EPISODE_START_ID": episode_start_id,
                    "VIEWER_RENDERING_DISABLED": viewer_rendering_disabled,
                },
                "tty": True,
                "volumes": [f"{output_dir}:/output"],
                "networks": [f"mc_network_{instance_id}"],
                "command": "./entrypoint_receiver.sh",
            },
            f"receiver_bravo_instance_{instance_id}": {
                "image": "ojmichel/mc-multiplayer-base:latest",
                "environment": {
                    "PORT": receiver_port,
                    "NAME": "Bravo",
                    "INSTANCE_ID": instance_id,
                    "EPISODE_START_ID": episode_start_id,
                    "VIEWER_RENDERING_DISABLED": viewer_rendering_disabled,
                },
                "tty": True,
                "volumes": [f"{output_dir}:/output"],
                "networks": [f"mc_network_{instance_id}"],
                "command": "./entrypoint_receiver.sh",
            },
            # Camera alpha: recording client
            f"camera_alpha_instance_{instance_id}": {
                "image": "ojmichel/mineflayer-spectator-client:latest",
                "build": {
                    "context": os.path.join(project_root, "camera"),
                    "dockerfile": "Dockerfile",
                },
                "restart": "unless-stopped",
                "network_mode": "host",
                "depends_on": {
                    f"mc_instance_{instance_id}": {"condition": "service_healthy"}
                },
                "environment": {
                    "MC_VERSION": "1.20.4",
                    "MC_HOST": "127.0.0.1",
                    "MC_PORT": mc_port,
                    "CAMERA_NAME": "CameraAlpha",
                    "DISPLAY": cam_ports["alpha_display"],
                    "VNC_PORT": str(cam_ports["alpha_vnc"]),
                    "NOVNC_PORT": str(cam_ports["alpha_novnc"]),
                    "WIDTH": "1280",
                    "HEIGHT": "720",
                    "FPS": "20",
                    "VNC_PASSWORD": "research",
                    "ENABLE_RECORDING": "1",
                    "RECORDING_PATH": "/output/camera_alpha.mp4",
                },
                "volumes": [
                    f"{cam_paths['alpha_data_host']}:/root",
                    f"{cam_paths['alpha_output_host']}:/output",
                ],
                "extra_hosts": [
                    "sessionserver.mojang.com:127.0.0.1",
                    "api.minecraftservices.com:127.0.0.1",
                    "authserver.mojang.com:127.0.0.1",
                    "textures.minecraft.net:127.0.0.1",
                    "pc.realms.minecraft.net:127.0.0.1",
                ],
            },
            # Episode starter: waits for all players then triggers episode start
            f"episode_starter_instance_{instance_id}": {
                "image": "node:20",
                "network_mode": "host",
                "depends_on": {
                    f"mc_instance_{instance_id}": {"condition": "service_healthy"},
                    f"camera_alpha_instance_{instance_id}": {"condition": "service_started"}
                },
                "working_dir": "/app",
                "environment": {
                    "RCON_HOST": "127.0.0.1",
                    "RCON_PORT": rcon_port,
                    "RCON_PASSWORD": "research",
                    "EPISODE_START_RETRIES": "60",
                    "EPISODE_REQUIRED_PLAYERS": "Alpha,CameraAlpha,Bravo,CameraBravo",
                    "EPISODE_START_COMMAND": "episode start technoblade.png technoblade.png",
                },
                "volumes": [
                    f"{os.path.join(project_root, 'camera', 'episode_starter.js')}:/app/episode_starter.js:ro",
                    f"{camera_package_json_host}:/app/package.json:ro",
                ],
                "command": [
                    "sh",
                    "-c",
                    "npm install --omit=dev --no-progress && node episode_starter.js",
                ],
            },
            # Camera bravo: recording client
            f"camera_bravo_instance_{instance_id}": {
                "image": "ojmichel/mineflayer-spectator-client:latest",
                "build": {
                    "context": os.path.join(project_root, "camera"),
                    "dockerfile": "Dockerfile",
                },
                "restart": "unless-stopped",
                "network_mode": "host",
                "depends_on": {
                    f"mc_instance_{instance_id}": {"condition": "service_healthy"}
                },
                "environment": {
                    "MC_VERSION": "1.20.4",
                    "MC_HOST": "127.0.0.1",
                    "MC_PORT": mc_port,
                    "CAMERA_NAME": "CameraBravo",
                    "DISPLAY": cam_ports["bravo_display"],
                    "VNC_PORT": str(cam_ports["bravo_vnc"]),
                    "NOVNC_PORT": str(cam_ports["bravo_novnc"]),
                    "WIDTH": "1280",
                    "HEIGHT": "720",
                    "FPS": "20",
                    "VNC_PASSWORD": "research",
                    "ENABLE_RECORDING": "1",
                    "RECORDING_PATH": "/output/camera_bravo.mp4",
                },
                "volumes": [
                    f"{cam_paths['bravo_data_host']}:/root",
                    f"{cam_paths['bravo_output_host']}:/output",
                ],
                "extra_hosts": [
                    "sessionserver.mojang.com:127.0.0.1",
                    "api.minecraftservices.com:127.0.0.1",
                    "authserver.mojang.com:127.0.0.1",
                    "textures.minecraft.net:127.0.0.1",
                    "pc.realms.minecraft.net:127.0.0.1",
                ],
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
        default=15,
        help="Number of instances to generate (default: 32)",
    )
    # World-split counts: if provided (>0), overrides --instances
    parser.add_argument(
        "--num_flatland_world",
        type=int,
        default=0,
        help="Number of flatland-world instances to generate (default: 0)",
    )
    parser.add_argument(
        "--num_normal_world",
        type=int,
        default=0,
        help="Number of normal-world instances to generate (default: 0)",
    )
    parser.add_argument(
        "--compose_dir",
        default="compose_configs",
        help="Directory to store generated compose files",
    )
    parser.add_argument(
        "--base_port",
        type=int,
        default=25565,
        help="Base Minecraft server port (default: 25565)",
    )
    parser.add_argument(
        "--base_rcon_port",
        type=int,
        default=25675,
        help="Base RCON port (default: 25675)",
    )
    parser.add_argument(
        "--receiver_port",
        type=int,
        default=8090,
        help="Receiver port for bridge network services (default: 8090)",
    )
    parser.add_argument(
        "--coord_port",
        type=int,
        default=8100,
        help="Coordination port for bridge network services (default: 8100)",
    )
    parser.add_argument(
        "--data_dir",
        required=True,
        help="Base directory for instance data directories (default: ./data)",
    )
    parser.add_argument(
        "--output_dir",
        default="./output",
        required=True,
        help="Shared output directory for all instances (default: ./output)",
    )
    # Camera-specific bases (absolute paths)
    parser.add_argument(
        "--camera_output_alpha_base",
        required=True,
        help="Absolute base dir for per-instance Camera Alpha outputs (e.g., /abs/.../camera/output_alpha)",
    )
    parser.add_argument(
        "--camera_output_bravo_base",
        required=True,
        help="Absolute base dir for per-instance Camera Bravo outputs (e.g., /abs/.../camera/output_bravo)",
    )
    parser.add_argument(
        "--camera_data_alpha_base",
        default=None,
        help="Absolute base dir for per-instance Camera Alpha data (default: <project>/camera/data_alpha)",
    )
    parser.add_argument(
        "--camera_data_bravo_base",
        default=None,
        help="Absolute base dir for per-instance Camera Bravo data (default: <project>/camera/data_bravo)",
    )
    parser.add_argument("--camera_alpha_vnc_base", type=int, default=5901)
    parser.add_argument("--camera_alpha_novnc_base", type=int, default=6901)
    parser.add_argument("--camera_bravo_vnc_base", type=int, default=5902)
    parser.add_argument("--camera_bravo_novnc_base", type=int, default=6902)
    parser.add_argument("--display_base", type=int, default=99)
    parser.add_argument("--vnc_step", type=int, default=2)
    parser.add_argument("--display_step", type=int, default=2)
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
    parser.add_argument(
        "--min_run_actions",
        type=int,
        default=3,
        help="Minimum number of run actions (default: 3)",
    )
    parser.add_argument(
        "--max_run_actions",
        type=int,
        default=5,
        help="Maximum number of run actions (default: 5)",
    )
    parser.add_argument(
        "--episode_category",
        default="look",
        help="Episode category (default: look)",
    )
    parser.add_argument(
        "--episode_types",
        default="all",
        help="Comma-separated episode types to run (default: all)",
    )
    parser.add_argument(
        "--iterations_num_per_episode",
        type=int,
        default=5,
        help="Number of iterations per episode (default: 5)",
    )
    parser.add_argument(
        "--viewer_rendering_disabled",
        type=int,
        choices=[0, 1],
        default=1,
        help="Disable viewer rendering for senders/receivers (default: 1)",
    )
    parser.add_argument(
        "--smoke_test",
        type=int,
        default=0,
        choices=[0, 1],
        help="Enable smoke test mode to run all episode types (default: 0)",
    )

    args = parser.parse_args()
    # Ensure required dirs are absolute
    args.output_dir = absdir(args.output_dir)
    args.data_dir = absdir(args.data_dir)
    args.camera_output_alpha_base = absdir(args.camera_output_alpha_base)
    args.camera_output_bravo_base = absdir(args.camera_output_bravo_base)

    # Defaults for camera data bases
    project_root = str(Path(__file__).resolve().parent)
    if args.camera_data_alpha_base is None:
        args.camera_data_alpha_base = absdir(os.path.join(project_root, "camera", "data_alpha"))
    else:
        args.camera_data_alpha_base = absdir(args.camera_data_alpha_base)
    if args.camera_data_bravo_base is None:
        args.camera_data_bravo_base = absdir(os.path.join(project_root, "camera", "data_bravo"))
    else:
        args.camera_data_bravo_base = absdir(args.camera_data_bravo_base)

    # Create compose directory
    compose_dir = Path(args.compose_dir)
    compose_dir.mkdir(exist_ok=True)

    # Determine number of instances and world plan
    use_split = (args.num_flatland_world > 0) or (args.num_normal_world > 0)
    if use_split:
        total_instances = args.num_flatland_world + args.num_normal_world
        world_plan = ["flat"] * args.num_flatland_world + ["normal"] * args.num_normal_world
    else:
        total_instances = args.instances
        world_plan = ["normal"] * total_instances

    print(f"Generating {total_instances} Docker Compose configurations...")

    for i in range(total_instances):
        world_type = world_plan[i]
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
            args.min_run_actions,
            args.max_run_actions,
            args.episode_category,
            args.episode_types,
            args.iterations_num_per_episode,
            args.smoke_test,
            args.viewer_rendering_disabled,
            world_type,
            # camera args
            args.camera_output_alpha_base,
            args.camera_output_bravo_base,
            args.camera_data_alpha_base,
            args.camera_data_bravo_base,
            args.camera_alpha_vnc_base,
            args.camera_alpha_novnc_base,
            args.camera_bravo_vnc_base,
            args.camera_bravo_novnc_base,
            args.display_base,
            args.vnc_step,
            args.display_step,
        )

        # Write compose file
        compose_file = compose_dir / f"docker-compose-{i:03d}.yml"
        with open(compose_file, "w") as f:
            yaml.dump(config, f, default_flow_style=False, sort_keys=False)

        # For flat worlds, inject generator settings into the compose file
        if world_type == "flat":
            terrain_options = [
                ("plains", "grass_block"),
                ("windswept_hills", "grass_block"),
                ("snowy_plains", "snow"),
                ("desert", "sand"),
                ("desert", "red_sand"),
            ]
            biome, surface_block = terrain_options[i % len(terrain_options)]
            terrain_settings = generate_terrain_settings(biome, surface_block)

            layers_json = []
            for layer in terrain_settings["layers"]:
                layer_str = f'{{ "block": "{layer["block"]}", "height": {layer["height"]} }}'
                layers_json.append(layer_str)
            layers_str = ",\n    ".join(layers_json)
            biome_val = terrain_settings["biome"]
            terrain_json = (
                f'{{\n  "layers": [\n    {layers_str}\n  ],\n  "biome": "{biome_val}"\n}}'
            )
            newline = "\n"
            terrain_multiline = f">-\n        {terrain_json.replace(newline, newline + '        ')}"

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
        # Camera output/data per-instance dirs
        cp = camera_paths(
            i,
            args.camera_output_alpha_base,
            args.camera_output_bravo_base,
            args.camera_data_alpha_base,
            args.camera_data_bravo_base,
        )
        os.makedirs(cp["alpha_output_host"], exist_ok=True)
        os.makedirs(cp["bravo_output_host"], exist_ok=True)
        os.makedirs(cp["alpha_data_host"], exist_ok=True)
        os.makedirs(cp["bravo_data_host"], exist_ok=True)

        print(f"Generated: {compose_file}")

    # Create shared output directory
    os.makedirs(args.output_dir, exist_ok=True)

    print(f"\nGenerated {total_instances} configurations in {compose_dir}/")
    print("Published port ranges (host network):")
    print(f"  Minecraft servers: {args.base_port}-{args.base_port + total_instances - 1}")
    print(f"  RCON ports: {args.base_rcon_port}-{args.base_rcon_port + total_instances - 1}")
    # Collision validation for camera ports
    alpha_vncs = {args.camera_alpha_vnc_base + args.vnc_step * i for i in range(total_instances)}
    alpha_novncs = {args.camera_alpha_novnc_base + args.vnc_step * i for i in range(total_instances)}
    bravo_vncs = {args.camera_bravo_vnc_base + args.vnc_step * i for i in range(total_instances)}
    bravo_novncs = {args.camera_bravo_novnc_base + args.vnc_step * i for i in range(total_instances)}
    assert len(alpha_vncs) == total_instances, "alpha VNC port collisions detected"
    assert len(alpha_novncs) == total_instances, "alpha noVNC port collisions detected"
    assert len(bravo_vncs) == total_instances, "bravo VNC port collisions detected"
    assert len(bravo_novncs) == total_instances, "bravo noVNC port collisions detected"
    print(f"  Camera Alpha noVNC: {args.camera_alpha_novnc_base}..{args.camera_alpha_novnc_base + args.vnc_step * (total_instances - 1)}")
    print(f"  Camera Bravo noVNC: {args.camera_bravo_novnc_base}..{args.camera_bravo_novnc_base + args.vnc_step * (total_instances - 1)}")
    print("Bridge network services (receivers, senders) use internal communication only.")


if __name__ == "__main__":
    main()
