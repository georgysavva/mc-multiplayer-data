# SolarisEngine

This repository contains a multiplayer data collection framework for Minecraft. It uses programmed bots based on [Mineflayer](https://github.com/PrismarineJS/mineflayer) that engage in a diverse, collaborative, multiplayer scenarios. The data it collects is the official Minecraft graphics (observations) for every player, annotated with their corresponding actions.

`SolarisEngine` consists of the following components Controller Bot, Camera Bot, Minecraft Server Plugin, Spectator Bot, and a suite of postprocessing scripts.

## Controller

The Controller Bot is a JavaScript program build on top of Mineflayer. It connects to the Minecraft Server, and drives the behavior of the player. To ensure collaboration, it communicates with the Controller instances of other players connected to the same server. It features a set of high-level, reusable game play primitives and a modular system of various episode types focusing on different aspects of the game. See {doc}`controller` for more details.

## Camera

The Camera Bot is the official Minecraft Java Client that runs in headless. It connects to the server and pairs up with the corresponding Controller Bot of that player, so that these two processing are logically a single player. Through the server-side plugin, the camera bot, at all times, shares the first person perspective of its controller bot. It records the graphics using `ffmpeg`, which `SolarisEngine` aligns with the actions in postprocessing to form a final episode.

## Minecraft Server Plugin

`SolarisEngine` works with a standard Minecraft 1.21 Paper server that it augments with a custom server-side plugin: Episode Manager Plugin. It loads on the server start and, after the bots of all players have been connected, it continuously synchronizes the character states of the controller bots to their corresponding camera bots. It replays all action, positions, camera movements, and GUI elements. It keeps the camera bot invisible to all players.

TODO: @twmeehan elaborate on this part.

## Spectator Bot

The spectator bot is another Mineflayer bot (making it a total of 3 bots constituting a single logic player). It always stays in the Spectate mode and just follows its controller bot. It doesn't produce any observations nor actions. It's an auxiliary bot that the Camera bot and the Episode Manger Plugin need for the proper game state synchronization between the controller and the camera (specifically block breaking animation).

## Postprocessing

After all the controller and camera processes finish, `SolarisEngine` cuts the single, raw camera output of a player into episodes, according to the episode action json files produced by the controller. The postprocessing script, `postprocess/process_recordings.py`, uses `ffprobe` to extract frames corresponding to their actions based on the per-frame wallclock timestamps. TODO: @daohanlu you can probably talk more about the new frame extraction here. An episode always consists of `N` actions and `N` observations, with the observation at index `t` being a physics tick (~`50ms`) after the action at index `t`, making the observation a causal consequences of applying the action.

`postprocess/prepare_train_dataset.py`, `postprocess/split_train_test.py`, and `postprocess/prepare_eval_datasets.py` validate and transform the output of `SolarisEngine` to the final training and evaluation dataset formats Solaris model code expects.

`postprocess/annotate_video_batch.py` is an optional script that stitches the videos of all players into one and overlays them with visualized actions. It's a helpful debug tool to see how well all bots behave in an episode and that their actions are properly aligned with the observations.

TODO: Document filter water episodes

## Docker

`SolarisEngine` uses Docker and Docker Compose to manage its components. The controller bot, camera bot, spectator bot, and Minecraft server are separate Docker container. The controller bot has the additional `act_recorder` Python process for writing actions to disk that runs in a separate Docker container. All in all, for two players, it's `2 * 4 + 1 = 9` long running Docker containers total. They are bundled in docker compose, forming a unit, which allows them to run in isolation. A docker compose unit also has two additional procedural Docker containers, `plugin_starter` and `prep_data`, that run at startup to setup the Minecraft server and the server-side plugin.

The outer layer of Python scripts, `generate_compose.py` and `orchestrate.py`, generates a configurable number of such docker compose units and executes them in parallel, enabling data collection at scale.

The camera bot has a dedicated Docker image, `solaris-engine-camera`, configured with a Java runtime and the official Minecraft Java client in headless. It does its rendering on GPU and requires the host machine to have one to ensure proper Minecraft graphic rendering FPS. TODO: @daohanlu add more details. The controller bot, spectator bot, and `act_recording` all share the `solaris-engine-base` Docker image that has both Node and Python environments set up. The Minecraft server uses the publicly available `itzg/minecraft-server` Docker image.

All postprocessing after all Docker Compose units finish happens on the host.

## How to Run

1. Create the conda env (for postprocessing scripts):

```
conda env create -f env.yaml
```

1. Collect training data

```
./run.sh
```

1. Collect eval data

```
./run_evals.sh
```

The `run.sh`/`run_evals.sh` will generate a folder with the Docker Compose files for two units, build the local Docker images, gather the recording outputs in `./output/data_collection/`, and prepare the final datasets in `./output/datasets/`.
