# AGENTS

## Purpose
Collect synchronized vision and action data from multiple Minecraft agents so we can train large-scale video diffusion / world-models on real multiplayer interactions.

## Architecture Overview
- **Minecraft server (`mc`)** – Paper 1.20.4 server running in offline mode, exposes gameplay and RCON ports via host networking. World data lives under `data53/`.
- **Mineflayer senders (`sender_alpha`, `sender_bravo`)** – Node.js bots that coordinate scripted episodes, stream actions to receivers, and exit when episodes finish. Both mount `/output` and record absolute action timestamps plus per-episode metadata for alignment.
- **Receivers (`receiver_alpha`, `receiver_bravo`)** – Capture and serialize observations/actions emitted by the corresponding sender, writing alongside the sender output volume.
- **Camera clients (`camera_alpha`, `camera_bravo`)** – Headless Linux desktops launching real Minecraft clients under Xvfb. They connect to the server, record video via FFmpeg, and expose VNC/noVNC for inspection. Recordings land in `camera/output_alpha/` and `camera/output_bravo/`.
- **Spectator helpers (`camera_*_follow`)** – Short-lived Node scripts that wait for bots/cameras to join, issue `/gamemode spectator` and `/spectate` via RCON, then exit.
- **Orchestration (`run_stack.sh`)** – Wrapper around docker compose: ensures directories, launches the stack, captures per-service logs, and auto-shuts everything down when both Mineflayer senders complete.
- **Post-processing (`postprocess/align_camera_video.py`)** – Trims real camera MP4s using the recorded start timestamps and action traces, producing aligned videos plus a frame-to-action mapping JSON for training. `postprocess/auto_align.py` runs automatically after each stack to generate these artifacts.
- **Prismarine viewer fork** – Included for headless rendering/alternate visualization but not part of the live recording pipeline.

## Future Work
- **Camera-Action Alignment** – Automated trimming now runs after each stack execution. If drift appears, consider parsing actual per-frame PTS via `ffprobe` or delaying Mineflayer startup until the camera reports it’s recording.
- **Better Skin Customization** – Current offline logins keep default Steve/Alex skins in the real Minecraft footage. Recommended path: enable the SkinsRestorer plugin (already noted in `docker-compose.yml`) and issue `/skin set <player> <SkinName>` via RCON (or embed this in the spectator helper). Alternatives: switch to online-mode with real accounts or keep skin tweaks limited to the prismarine-viewer fork.
