# index.js Documentation

## Overview

`index.js` serves as the main episode coordinator and lifecycle manager for the Minecraft multiplayer data collection system. It orchestrates episode execution, manages bot coordination, handles teleportation, and provides the central entry point for running episodes.

## Core Responsibilities

### Episode Management

- Episode type selection and instantiation
- Lifecycle coordination (setup → execution → teardown)
- Error handling and recovery
- Recording integration

### Bot Coordination

- Multi-bot synchronization
- Phase-based communication
- Position management and teleportation
- World state setup

### System Integration

- RCON communication for server control
- Camera management and recording
- Inventory and effect management
- Performance monitoring

## Episode Selection System

### Available Episode Types

```javascript
const episodeTypes = [
  "straightLineWalk",
  "chase",
  "orbit",
  "walkLook",
  "buildHouse",
  "walkLookAway",
  "pvp",
  "pve",
  "buildStructure",
  "buildTower",
  "mine",
  "towerBridge",
  "collector",
  "structureEval",
  "translationEval",
  "lookAwayEval",
  "rotationEval",
];
```

### Episode Class Mapping

```javascript
const episodeClassMap = {
  buildHouse: BuildHouseEpisode,
  buildTower: BuildTowerEpisode,
  buildStructure: BuildStructureEpisode,
  chase: ChaseEpisode,
  collector: CollectorEpisode,
  // ... additional mappings
};
```

### Selection Logic

#### Normal Mode

- Random selection from eligible episodes
- Filtering based on world type compatibility
- Shared RNG for deterministic behavior

#### Smoke Test Mode

- Sequential execution of all eligible episodes
- Alphabetical ordering for predictable testing
- Single episode per type

## Core Functions

### runSingleEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, episodeInstance, args)

Main episode execution orchestrator.

**Responsibilities:**

1. **Setup**: Error handlers, death detection, episode state initialization
2. **Execution**: Coordinate phase transitions and episode logic
3. **Cleanup**: Stop pathfinding, clear goals, teardown episode
4. **Recovery**: Handle errors and ensure proper state cleanup

**Error Handling:**

- Episode-scoped error capture
- Process-level exception handling
- Bot death detection and episode termination
- Graceful degradation on failures

### Episode Execution Flow

```
Bot Spawn
├── Setup world and effects
├── Camera synchronization
├── Episode loop:
│   ├── RNG seed generation
│   ├── Episode type selection
│   ├── Episode instantiation
│   ├── Teleport phase
│   ├── Episode execution
│   ├── Episode teardown
│   ├── Result saving
│   └── Bot synchronization
└── Process exit
```

## Phase Management System

### Standard Phase Sequence

1. **Teleport Phase**: Position bots for episode
2. **Post-Teleport Phase**: Episode-specific setup
3. **Start Recording Phase**: Begin video/audio capture
4. **Episode Execution**: Run episode-specific logic
5. **Stop Phase**: End recording and cleanup

### Phase Handlers

#### getOnTeleportPhaseFn()

Handles initial bot positioning and teleportation.

**Logic:**

- Primary bot performs teleportation using RCON
- Secondary bot waits for positioning
- Validates episode compatibility with world type

#### Teleportation System (teleport())

Uses Minecraft's `spreadplayers` command for coordinated positioning.

**Parameters:**

- Center point (calculated from bot positions)
- Radius (configurable, default 3000 blocks)
- Minimum/maximum bot distances
- Retry logic for failed placements

**Algorithm:**

1. Calculate center point between bots
2. Expand radius on failures (up to 10 attempts)
3. Use spreadplayers for collision-free positioning
4. Wait for positioning to complete

## Bot and World Setup

### setupBotAndWorldOnce(bot, rcon)

One-time setup for each bot (called once per bot).

**Effects Applied:**

- Resistance (permanent, max level)
- Water breathing (permanent)
- Fall damage immunity
- Peaceful difficulty
- Fall damage gamerule disabled
- Immediate respawn enabled
- Keep inventory enabled
- Death message suppression
- Bot tagging for coordination

### setupCameraPlayerOnce(bot, rcon)

Camera player protection setup (called once per camera).

**Effects Applied:**

- Resistance and water breathing for camera bots
- Fall damage immunity

### setupBotAndCameraForEpisode(bot, rcon, args)

Per-episode setup for bots and cameras.

**Actions:**

- Saturation effects for hunger management
- Camera saturation (if enabled)
- Inventory clearing and tool giving
- Hand unequipping

## Configuration and Environment

### Environment Variables

#### EPISODE_TYPES

- **Purpose**: Filter episode types to run
- **Format**: Comma-separated list
- **Default**: All available episode types
- **Example**: `EPISODE_TYPES=buildHouse,chase,collector`

#### SMOKE_TEST

- **Purpose**: Enable smoke test mode
- **Values**: `1` for enabled, `0` or unset for disabled
- **Behavior**: Run all eligible episodes once each

### Configuration Arguments

#### Episode Control

- `episodes_num`: Number of episodes to run (default: configured value)
- `start_episode_id`: Starting episode number (default: 0)
- `world_type`: World type for episode filtering ("flat" or "normal")

#### Teleportation

- `teleport`: Enable/disable teleportation (default: configured)
- `teleport_radius`: Maximum teleport distance (default: 3000)
- `teleport_min_distance`: Minimum jump distance (default: 1000)

#### Recording and Cameras

- `enable_camera_wait`: Wait for cameras before starting
- `camera_ready_retries`: Camera connection retry attempts
- `viewer_rendering_disabled`: Disable viewer rendering
- `viewer_recording_interval`: Recording frame interval

## Error Handling and Recovery

### Episode-Level Errors

- Automatic transition to stop phase
- Peer error notification
- Comprehensive logging
- State cleanup and recovery

### System-Level Errors

- Process exception handling
- Unhandled rejection capture
- Graceful shutdown procedures
- Resource cleanup

### Bot Death Handling

- Death event detection
- Episode state marking
- Automatic episode termination
- Respawn management

## Data Collection Integration

### Episode Info Saving (saveEpisodeInfo)

Records episode metadata to JSON files.

**Captured Data:**

- Timestamp and episode identification
- Episode type and configuration
- Error states (encountered, peer, bot death)
- Recording status
- Evaluation metadata

**File Naming:** `YYYYMMDD_HHMMSS_{episodeNum}_{botName}_instance_{instanceId}_episode_info.json`

### Recording Lifecycle

- Automatic start/stop with episode phases
- Viewer integration for video capture
- Frame rate and quality configuration
- Synchronization with episode events

## Performance and Monitoring

### Pathfinder Configuration

- Think timeout: 7500ms
- Tick timeout: 15ms
- Search radius: 96 blocks
- Drop-down distance: 15 blocks

### Resource Management

- Memory leak prevention
- Connection cleanup
- Goal clearing between episodes
- Inventory management

### Logging and Debugging

- Comprehensive episode lifecycle logging
- Position and state tracking
- Error condition reporting
- Performance timing

## Integration Points

### External Systems

- **RCON**: Server administration and bot management
- **Coordinator**: Inter-bot communication and synchronization
- **Viewer**: Video recording and streaming
- **Minecraft Server**: World management and bot hosting

### Utility Dependencies

- Movement and pathfinding systems
- Item and inventory management
- Camera and recording utilities
- Coordination and RNG systems

## Usage Examples

### Standard Episode Execution

```javascript
// Run episodes with default configuration
node index.js --episodes_num 10 --world_type flat
```

### Smoke Testing

```javascript
// Test all episode types once
SMOKE_TEST=1 node index.js
```

### Filtered Episode Types

```javascript
// Run only building episodes
EPISODE_TYPES=buildHouse,buildTower,buildStructure node index.js
```

### Custom Configuration

```javascript
// Advanced configuration
node index.js \
  --episodes_num 5 \
  --start_episode_id 100 \
  --teleport_radius 5000 \
  --world_type normal \
  --enable_camera_wait true
```

## Testing Considerations

### Deterministic Behavior

- RNG seeding based on episode number
- Consistent episode type selection
- Predictable teleportation patterns

### Error Scenarios

- Network connectivity issues
- Camera synchronization failures
- Episode execution errors
- Resource exhaustion conditions

### Performance Benchmarking

- Episode completion times
- Memory usage patterns
- Network traffic analysis
- CPU utilization monitoring

## Architecture Patterns

### Coordinator Pattern

- Phase-based event communication
- Listener setup before message sending
- Symmetric behavior across bots
- Error propagation and handling

### Factory Pattern

- Dynamic episode instantiation
- Class mapping for type selection
- Configuration-driven behavior
- Extensibility for new episode types

### State Machine Pattern

- Well-defined phase transitions
- State validation and consistency
- Error recovery mechanisms
- Lifecycle management

## Future Enhancements

### Potential Features

- **Dynamic Episode Loading**: Runtime episode type loading
- **Configuration Hot-Reloading**: Runtime configuration updates
- **Advanced Monitoring**: Real-time performance dashboards
- **Distributed Coordination**: Multi-server episode execution
- **Adaptive Difficulty**: Dynamic episode parameter adjustment
