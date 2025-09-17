# Minecraft Multiplayer Data Collection System

This project is a data collection system for Minecraft multiplayer interactions. It uses automated bots (Alpha and Bravo) to play Minecraft together while collecting synchronized video recordings and gameplay data including player positions, actions, and interactions.

## Overview

The system consists of:

- **Minecraft Server**: A creative mode server with flat terrain using Paper
- **Bot Agents**: Two coordinated bots (Alpha and Bravo) that interact in the game world
- **Data Receivers**: Services that capture and store video frames and gameplay metadata
- **Orchestration Tools**: Scripts for running single or multiple parallel data collection instances

## Dependencies

This project uses several forked and modified libraries to enable Minecraft data collection:

### Prismarine Viewer

We use a forked version of prismarine-viewer from [@YXHXianYu/prismarine-viewer-colalab](https://github.com/YXHXianYu/prismarine-viewer-colalab). This fork can render different skins which we use to distinguish the bots. We further modify it to record actions along side observations.

### Mineflayer

We patch the mineflayer code library to expose additional information about current actions from the physics plugin. These modifications allow us to:

- Access detailed physics state information
- Synchronize action data with visual observations
- Capture precise movement and interaction data

### Mineflayer Pathfinder

Although we maintain a fork of the mineflayer pathfinder library, we haven't made any modifications to it.

## Installation

1. Clone this repository:

```bash
git clone <repository-url>
cd mc-multiplayer-data
```

2. Build the Docker image:

```bash
docker build -t mc-multiplayer:latest .
```

## Quick Start - Single Instance Data Collection

The simplest way to collect data is using the default `docker-compose.yml` file:

### 1. Start Data Collection

```bash
docker compose up -d
```

This will start:

- A Minecraft server on port 25565 (RCON on 25575)
- Two bot agents (Alpha and Bravo) that interact in the game
- Two data receivers that capture video and gameplay data
- All services coordinated through Docker networking

### 2. Monitor Progress

Check the status of running services:

```bash
docker compose ps
```

View logs from specific services:

```bash
# View all logs
docker compose logs

# View logs from specific service
docker compose logs sender_alpha
docker compose logs receiver_alpha
```

### 3. Stop Collection

```bash
docker compose down -v
```

### 4. Access Collected Data

Data will be saved to:

- `./output/` - Alpha bot data (videos, JSON metadata)
- `./output/` - Bravo bot data (videos, JSON metadata)

## Parallel Data Collection

For large-scale data collection, you can run multiple independent instances in parallel using the provided orchestration tools.

### 1. Generate Docker Compose Configurations

Use `generate_compose.py` to create multiple instance configurations:

```bash
# Generate 10 parallel instances
python3 generate_compose.py --instances 10

# Generate 32 instances with custom settings
python3 generate_compose.py \
    --instances 32 \
    --base-port 25565 \
    --base-rcon-port 25675 \
    --num_episodes 5 \
    --bootstrap_wait_time 60
```

**Available Options:**

- `--instances`: Number of parallel instances (default: 32)
- `--compose-dir`: Directory for generated compose files (default: compose_configs)
- `--base-port`: Starting Minecraft server port (default: 25565)
- `--base-rcon-port`: Starting RCON port (default: 25675)
- `--receiver-port`: Receiver service port (default: 8090)
- `--coord-port`: Bot coordination port (default: 8100)
- `--data-dir`: Base directory for server data (default: ./data)
- `--output-dir`: Shared output directory (default: ./output)
- `--num_episodes`: Episodes per instance (default: 5)
- `--episode_start_id`: Starting episode ID (default: 0)
- `--bootstrap_wait_time`: Wait time before starting bots (default: 60)

This creates:

- Individual Docker Compose files in `compose_configs/`
- Unique port assignments for each instance
- Separate mc server data directories (`data0/`, `data1/`, etc.)
- Varied terrain types across instances

### 2. Orchestrate Multiple Instances

Use `orchestrate.py` to manage all generated instances:

#### Start All Instances

```bash
python3 orchestrate.py start
```

#### Check Status

```bash
python3 orchestrate.py status
```

#### View Logs

```bash
# View logs from all instances
python3 orchestrate.py logs

# View logs from specific instance
python3 orchestrate.py logs --instance docker-compose-001

# Follow logs in real-time (single instance only)
python3 orchestrate.py logs --instance docker-compose-001 --follow
```

#### Stop All Instances

```bash
python3 orchestrate.py stop
```

### 3. Monitor Resource Usage

With parallel instances, monitor system resources:

```bash
# Check Docker container resource usage
docker stats
```

## Configuration

### Environment Variables

Key environment variables that can be customized:

**Bot Configuration:**

- `BOT_NAME`: Name of the bot (Alpha/Bravo)
- `OTHER_BOT_NAME`: Name of the other bot
- `BOT_RNG_SEED`: Random seed for reproducible behavior. This should be the same for two bots for them to agree on certain actions that require randomness.
- `EPISODES_NUM`: Number of episodes to run
- `BOOTSTRAP_WAIT_TIME`: Seconds to wait before starting bots. This is needed to ensure the server is running before they try to connect.

**Network Configuration:**

- `MC_HOST`/`MC_PORT`: Minecraft server connection
- `RCON_HOST`/`RCON_PORT`: RCON server connection
- `RECEIVER_HOST`/`RECEIVER_PORT`: Data receiver connection
- `COORD_PORT`: Bot coordination port

**Data Configuration:**

- `INSTANCE_ID`: Unique identifier for this instance
- `EPISODE_START_ID`: Starting episode number
- `COLOR`: Bot display color (red/blue)

### Terrain Types

The system automatically varies terrain across instances:

- Plains with grass blocks
- Windswept hills with grass blocks
- Snowy plains with snow blocks
- Desert with sand blocks
- Desert with red sand blocks

## Bot Interaction Phases Mechanism

The system implements a phases-based coordination mechanism that allows two bots (Alpha and Bravo) to interact synchronously during gameplay episodes. This mechanism ensures both bots remain synchronized while performing various activities like teleporting, walking, looking at each other, and recording data.

### Architecture Overview

The phases mechanism is built around three core components:

1. **BotCoordinator Class**: Manages TCP-based communication between bots
2. **Shared Random Number Generator**: Ensures deterministic, synchronized behavior
3. **Event-Driven Phase System**: Coordinates bot actions through sequential phases

### Bot Coordination System

Each bot runs a `BotCoordinator` instance that:

- **Server Component**: Listens on a designated port for messages from the other bot
- **Client Component**: Connects to the other bot's server port
- **Event System**: Uses Node.js EventEmitter to handle phase transitions
- **Message Protocol**: Exchanges JSON messages containing event names and parameters

The coordinator establishes bidirectional TCP connections between bots, allowing them to send position updates and phase synchronization signals.

### Synchronization Mechanism

Bots achieve synchronization through:

- **Shared RNG Seed**: Both bots use the same random seed (`BOT_RNG_SEED`) to generate identical random sequences. It's needed for them to know what random number the other will use without communicating it, for example what location to teleport to.
- **Deterministic Decision Making**: All random choices (positions, walking modes, action counts) use the shared RNG
- **Event-Based Handshaking**: Each phase waits for confirmation from both bots before proceeding

### Phase Sequence

Each episode follows this structured phase sequence:

#### 1. Teleport Phase (`teleportPhase`)

- **Purpose**: Position bots at optimal distance for interaction
- **Process**:
  - Generate random point within teleport radius using shared RNG
  - Calculate desired distance between bots (9-10 blocks)
  - Position bots on opposite sides of the random point
  - Use RCON to teleport bots to calculated positions
  - Both bots look at each other's computed position
  - Start episode recording with initial buffer time

#### 2. Walk and Look Phase (`walkAndLookPhase_N`)

- **Purpose**: Create varied interaction scenarios
- **Process**:
  - Determine action count (3-5 actions) using shared RNG
  - Select walking mode using shared RNG:
    - `both_bots_walk`: Both bots perform walking actions
    - `lower_name_walks`: Only the bot with lexicographically smaller name walks
    - `bigger_name_walks`: Only the bot with lexicographically larger name walks
  - Active bot(s) perform walking sequences while inactive bot(s) observe
  - Each bot looks at the other bot's position at the start of the phase
- **Iteration**: This phase repeats multiple times per episode (configurable)

#### 3. Stop Phase (`stopPhase`)

- **Purpose**: Cleanly end episode recording
- **Process**:
  - Signal end of episode recording
  - Wait for video/data streams to close properly
  - Prepare for next episode or program termination

#### 4. Stopped Phase (`stoppedPhase`)

- **Purpose**: Final synchronization before next episode
- **Process**:
  - Confirm both bots have stopped recording
  - Brief pause before starting next episode
  - Resolve episode promise to proceed to next iteration

### Walking Behavior Details

During walking phases, active bots perform:

- **Random Walking**: Move in cardinal directions (forward/back/left/right) for 3-4 blocks
- **Return Behavior**: Walk back to starting position after each movement
- **Jump Actions**: Random jumping with 25% probability, lasting 1-3 seconds
- **Sleep Intervals**: 1.5-3 second pauses between actions
- **Smooth Camera Movement**: Look at other bot at 30°/second

### Message Flow Example

For a typical phase transition:

```
Bot Alpha                           Bot Bravo
   |                                   |
   |-- teleportPhase event --------->  |
   |<-- teleportPhase confirmation --  |
   |                                   |
   |-- walkAndLookPhase_0 event ----> |
   |<-- walkAndLookPhase_0 confirm -- |
   |                                   |
   |-- stopPhase event ------------->  |
   |<-- stopPhase confirmation -----  |
```

### Configuration Parameters

Key parameters controlling the phases mechanism:

- `BOT_RNG_SEED`: Shared random seed for deterministic behavior
- `iterations_num_per_episode`: Number of walk/look phase iterations (default: 3)
- `teleport_radius`: Maximum distance from center for teleportation (default: 500)
- `COORD_PORT` / `OTHER_COORD_PORT`: TCP ports for bot coordination

### Error Handling

The system includes robust error handling:

- **Connection Retries**: Automatic reconnection if communication fails
- **Timeout Protection**: Walk actions have configurable timeouts
- **Graceful Degradation**: Continues if individual actions fail
- **State Recovery**: Can resume from failed phases

This phases mechanism ensures that both bots generate synchronized, high-quality interaction data suitable for machine learning applications while maintaining deterministic and reproducible behavior across multiple episodes.

## Data Output

Each instance generates:

### Video Files

- `*.mp4`: H.264 encoded video of bot perspective
- Frame rate: 20 FPS
- Resolution: Configurable (default based on Minecraft client)

### JSON Metadata

- Player positions (x, y, z coordinates)
- Camera orientation (yaw, pitch)
- Frame timestamps and counts
- Game state information
- Bot interaction events

### File Structure

```
output/
├── Alpha_episode_0_*.mp4
├── Alpha_episode_0_*.json
├── Bravo_episode_0_*.mp4
├── Bravo_episode_0_*.json
└── ...
```

## Analysis Tools

The project includes analysis utilities:

```bash
# Analyze collected JSON data
python3 analyze/analyze_json_data.py

# Count frame mismatches
python3 analyze/count_mismatched_ticks.py

# Align two videos from two bots to view as a single video
python3 align_videos.py
```
