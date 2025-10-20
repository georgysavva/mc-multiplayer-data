"""
Base docker-compose template for task generation.

This template includes all services (mc server, senders, receivers, cameras)
with PLACEHOLDER values that will be overridden by task generators.
"""


def get_base_compose_template():
    """
    Returns the base docker-compose structure as a Python dict.
    
    PLACEHOLDER strings will be replaced by task generators with actual values:
    - Ports (mc_port, rcon_port, vnc ports)
    - Directories (data_dir, output_dir, camera dirs)
    - Environment variables (EPISODE_CATEGORY, seeds, etc.)
    """
    return {
        "services": {
            "mc": {
                "image": "itzg/minecraft-server",
                "tty": True,
                "network_mode": "host",
                "environment": {
                    "EULA": "TRUE",
                    "VERSION": "1.20.4",
                    "TYPE": "PAPER",
                    "MODE": "creative",
                    "ONLINE_MODE": False,
                    "ENFORCE_SECURE_PROFILE": False,
                    "RCON_PASSWORD": "research",
                    "BROADCAST_RCON_TO_OPS": True,
                    "SERVER_PORT": "PLACEHOLDER_MC_PORT",
                    "RCON_PORT": "PLACEHOLDER_RCON_PORT",
                    "LEVEL_TYPE": "minecraft:flat",
                    "GENERATOR_SETTINGS": "PLACEHOLDER_TERRAIN",
                    "SEED": "PLACEHOLDER_SEED",
                },
                "volumes": ["PLACEHOLDER_DATA_DIR:/data"],
                "healthcheck": {
                    "test": ["CMD-SHELL", "mc-monitor status --host localhost --port PLACEHOLDER_MC_PORT"],
                    "interval": "10s",
                    "timeout": "5s",
                    "retries": 12
                }
            },
            "sender_alpha": {
                "image": "ojmichel/mc-multiplayer-base:latest",
                "depends_on": {
                    "mc": {"condition": "service_healthy"},
                    "receiver_alpha": {"condition": "service_started"}
                },
                "volumes": ["PLACEHOLDER_OUTPUT_DIR:/output"],
                "environment": {
                    "BOT_NAME": "Alpha",
                    "OTHER_BOT_NAME": "Bravo",
                    "RECEIVER_HOST": "receiver_alpha",
                    "RECEIVER_PORT": 8090,
                    "COORD_PORT": 8100,
                    "OTHER_COORD_HOST": "sender_bravo",
                    "OTHER_COORD_PORT": 8100,
                    "BOT_RNG_SEED": "PLACEHOLDER_BOT_RNG_SEED",
                    "EPISODES_NUM": 1,
                    "EPISODE_CATEGORY": "PLACEHOLDER_TASK_TYPE",
                    "MC_HOST": "host.docker.internal",
                    "MC_PORT": "PLACEHOLDER_MC_PORT",
                    "RCON_HOST": "host.docker.internal",
                    "RCON_PORT": "PLACEHOLDER_RCON_PORT",
                    "RCON_PASSWORD": "research",
                    "COLOR": "red",
                    "BOOTSTRAP_WAIT_TIME": "PLACEHOLDER_BOOTSTRAP_WAIT",
                    "MIN_RUN_ACTIONS": "PLACEHOLDER_MIN_ACTIONS",
                    "MAX_RUN_ACTIONS": "PLACEHOLDER_MAX_ACTIONS",
                    "ITERATIONS_NUM_PER_EPISODE": "PLACEHOLDER_ITERATIONS",
                    "MC_VERSION": "1.20.4",
                    "EPISODE_START_ID": 0,
                },
                "extra_hosts": ["host.docker.internal:host-gateway"],
                "command": "./entrypoint_senders.sh"
            },
            "sender_bravo": {
                "image": "ojmichel/mc-multiplayer-base:latest",
                "depends_on": {
                    "mc": {"condition": "service_healthy"},
                    "receiver_bravo": {"condition": "service_started"},
                    "sender_alpha": {"condition": "service_started"}
                },
                "volumes": ["PLACEHOLDER_OUTPUT_DIR:/output"],
                "environment": {
                    "BOT_NAME": "Bravo",
                    "OTHER_BOT_NAME": "Alpha",
                    "RECEIVER_HOST": "receiver_bravo",
                    "RECEIVER_PORT": 8090,
                    "COORD_PORT": 8100,
                    "OTHER_COORD_HOST": "sender_alpha",
                    "OTHER_COORD_PORT": 8100,
                    "BOT_RNG_SEED": "PLACEHOLDER_BOT_RNG_SEED",
                    "EPISODES_NUM": 1,
                    "EPISODE_CATEGORY": "PLACEHOLDER_TASK_TYPE",
                    "MC_HOST": "host.docker.internal",
                    "MC_PORT": "PLACEHOLDER_MC_PORT",
                    "RCON_HOST": "host.docker.internal",
                    "RCON_PORT": "PLACEHOLDER_RCON_PORT",
                    "RCON_PASSWORD": "research",
                    "COLOR": "blue",
                    "BOOTSTRAP_WAIT_TIME": "PLACEHOLDER_BOOTSTRAP_WAIT",
                    "MIN_RUN_ACTIONS": "PLACEHOLDER_MIN_ACTIONS",
                    "MAX_RUN_ACTIONS": "PLACEHOLDER_MAX_ACTIONS",
                    "ITERATIONS_NUM_PER_EPISODE": "PLACEHOLDER_ITERATIONS",
                    "MC_VERSION": "1.20.4",
                    "EPISODE_START_ID": 0,
                },
                "extra_hosts": ["host.docker.internal:host-gateway"],
                "command": "./entrypoint_senders.sh"
            },
            "receiver_alpha": {
                "image": "ojmichel/mc-multiplayer-base:latest",
                "environment": {
                    "PORT": 8090,
                    "NAME": "Alpha",
                    "INSTANCE_ID": "PLACEHOLDER_INSTANCE_ID",
                    "EPISODE_START_ID": 0
                },
                "tty": True,
                "volumes": ["PLACEHOLDER_OUTPUT_DIR:/output"],
                "command": "./entrypoint_receiver.sh"
            },
            "receiver_bravo": {
                "image": "ojmichel/mc-multiplayer-base:latest",
                "environment": {
                    "PORT": 8090,
                    "NAME": "Bravo",
                    "INSTANCE_ID": "PLACEHOLDER_INSTANCE_ID",
                    "EPISODE_START_ID": 0
                },
                "tty": True,
                "volumes": ["PLACEHOLDER_OUTPUT_DIR:/output"],
                "command": "./entrypoint_receiver.sh"
            },
            "camera_alpha": {
                "image": "ojmichel/mineflayer-spectator-client:latest",
                "container_name": "PLACEHOLDER_CAMERA_ALPHA_CONTAINER",
                "restart": "unless-stopped",
                "network_mode": "host",
                "depends_on": {
                    "mc": {"condition": "service_healthy"}
                },
                "environment": {
                    "MC_VERSION": "1.20.4",
                    "MC_HOST": "127.0.0.1",
                    "MC_PORT": "PLACEHOLDER_MC_PORT",
                    "CAMERA_NAME": "CameraAlpha",
                    "DISPLAY": "PLACEHOLDER_DISPLAY_ALPHA",
                    "VNC_PORT": "PLACEHOLDER_VNC_PORT_ALPHA",
                    "NOVNC_PORT": "PLACEHOLDER_NOVNC_PORT_ALPHA",
                    "WIDTH": "1280",
                    "HEIGHT": "720",
                    "FPS": "20",
                    "VNC_PASSWORD": "research",
                    "ENABLE_RECORDING": "1",
                    "RECORDING_PATH": "/output/camera_alpha.mp4"
                },
                "volumes": [
                    "PLACEHOLDER_CAMERA_DATA_ALPHA:/root",
                    "PLACEHOLDER_CAMERA_OUTPUT_ALPHA:/output",
                    "./camera/entrypoint.sh:/app/entrypoint.sh:ro",
                    "./camera/launch_minecraft.py:/app/launch_minecraft.py:ro"
                ]
            },
            "camera_alpha_follow": {
                "image": "node:20",
                "container_name": "PLACEHOLDER_CAMERA_ALPHA_FOLLOW_CONTAINER",
                "network_mode": "host",
                "depends_on": {
                    "mc": {"condition": "service_healthy"},
                    "camera_alpha": {"condition": "service_started"}
                },
                "working_dir": "/app",
                "environment": {
                    "RCON_HOST": "127.0.0.1",
                    "RCON_PORT": "PLACEHOLDER_RCON_PORT",
                    "RCON_PASSWORD": "research",
                    "BOT_NAME": "Alpha",
                    "CAMERA_NAME": "CameraAlpha"
                },
                "volumes": [
                    "./camera/spectator.js:/app/spectator.js:ro",
                    "./camera/package.json:/app/package.json:ro"
                ],
                "command": ["sh", "-c", "npm install --omit=dev --no-progress && node spectator.js"]
            },
            "camera_bravo": {
                "image": "ojmichel/mineflayer-spectator-client:latest",
                "container_name": "PLACEHOLDER_CAMERA_BRAVO_CONTAINER",
                "restart": "unless-stopped",
                "network_mode": "host",
                "depends_on": {
                    "mc": {"condition": "service_healthy"}
                },
                "environment": {
                    "MC_VERSION": "1.20.4",
                    "MC_HOST": "127.0.0.1",
                    "MC_PORT": "PLACEHOLDER_MC_PORT",
                    "CAMERA_NAME": "CameraBravo",
                    "DISPLAY": "PLACEHOLDER_DISPLAY_BRAVO",
                    "VNC_PORT": "PLACEHOLDER_VNC_PORT_BRAVO",
                    "NOVNC_PORT": "PLACEHOLDER_NOVNC_PORT_BRAVO",
                    "WIDTH": "1280",
                    "HEIGHT": "720",
                    "FPS": "20",
                    "VNC_PASSWORD": "research",
                    "ENABLE_RECORDING": "1",
                    "RECORDING_PATH": "/output/camera_bravo.mp4"
                },
                "volumes": [
                    "PLACEHOLDER_CAMERA_DATA_BRAVO:/root",
                    "PLACEHOLDER_CAMERA_OUTPUT_BRAVO:/output",
                    "./camera/entrypoint.sh:/app/entrypoint.sh:ro",
                    "./camera/launch_minecraft.py:/app/launch_minecraft.py:ro"
                ]
            },
            "camera_bravo_follow": {
                "image": "node:20",
                "container_name": "PLACEHOLDER_CAMERA_BRAVO_FOLLOW_CONTAINER",
                "network_mode": "host",
                "depends_on": {
                    "mc": {"condition": "service_healthy"},
                    "camera_bravo": {"condition": "service_started"}
                },
                "working_dir": "/app",
                "environment": {
                    "RCON_HOST": "127.0.0.1",
                    "RCON_PORT": "PLACEHOLDER_RCON_PORT",
                    "RCON_PASSWORD": "research",
                    "BOT_NAME": "Bravo",
                    "CAMERA_NAME": "CameraBravo"
                },
                "volumes": [
                    "./camera/spectator.js:/app/spectator.js:ro",
                    "./camera/package.json:/app/package.json:ro"
                ],
                "command": ["sh", "-c", "npm install --omit=dev --no-progress && node spectator.js"]
            }
        }
    }

