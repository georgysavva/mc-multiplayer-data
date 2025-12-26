# Minecraft Multiplayer Data Collection - Episode Handlers Documentation

This document provides comprehensive documentation for the episode handler files in the mc-multiplayer-data project. These files implement various coordinated behaviors for two Minecraft bots (Alpha and Bravo) that collect synchronized gameplay data for ML training.

## Overview

The episode system consists of several types of episodes where bots perform coordinated activities:

- **Base Episode**: Abstract base class providing common lifecycle and coordination
- **Building Episodes**: Collaborative construction tasks (houses, towers, structures)
- **Interaction Episodes**: Chase sequences, mining, and other coordinated behaviors
- **Coordinator**: Manages bot-to-bot communication and synchronization

## File Structure

### Core Files
- `base-episode.js` - Abstract base class for all episodes
- `index.js` - Main episode coordinator and lifecycle manager
- `builder.js` - Low-level block placement utilities

### Episode Implementations
- `build-house-episode.js` - Collaborative house building
- `build-tower-episode.js` - Individual tower building with pillar jumping
- `build-structure-episode.js` - General structure building (walls, towers, platforms)
- `chase-episode.js` - Chase and evade behaviors
- `collector-episode.js` - Mining and resource collection

---

## base-episode.js

### Purpose
Abstract base class that provides the common lifecycle and coordination framework for all episode types. Handles episode initialization, cleanup, and the standardized stop/start phases.

### Key Classes

#### `BaseEpisode`
Abstract base class that all episode implementations must extend.

**Static Properties:**
- `INIT_MIN_BOTS_DISTANCE` - Minimum distance bots should maintain (default: MIN_BOTS_DISTANCE)
- `INIT_MAX_BOTS_DISTANCE` - Maximum distance bots should maintain (default: MAX_BOTS_DISTANCE)
- `WORKS_IN_NON_FLAT_WORLD` - Whether episode works in non-flat worlds (default: false)

**Methods:**
- `setupEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args)` - Optional setup hook
- `entryPoint(bot, rcon, sharedBotRng, coordinator, iterationID, episodeNum, args)` - Main episode logic (must be implemented by subclasses)
- `tearDownEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args)` - Optional cleanup hook

### Stop Phase Handling

The base class provides standardized stop phase handling with automatic recording management:

```javascript
getOnStopPhaseFn(bot, rcon, sharedBotRng, coordinator, otherBotName, episodeNum, args)
```

**Stop Phase Sequence:**
1. Sets `_episodeStopping = true` to prevent duplicate stops
2. Emits "endepisode" to stop recording if episode was started
3. Waits for recording to end
4. Sets up listener for "stoppedPhase" from other bot
5. Sends "stoppedPhase" to other bot

### Usage
```javascript
class MyEpisode extends BaseEpisode {
  async entryPoint(bot, rcon, sharedBotRng, coordinator, iterationID, episodeNum, args) {
    // Implement episode logic here
    // Call getOnStopPhaseFn() when ready to end
  }
}
```

---

## builder.js

### Purpose
Comprehensive block placement utility providing robust, human-like building capabilities. Features intelligent face selection, line-of-sight validation, and fallback mechanisms for reliable block placement.

### Core Functions

#### `placeAt(bot, targetPos, itemName, options)`
Primary block placement function with advanced features:

```javascript
await placeAt(bot, targetPos, "stone", {
  useSneak: false,        // Whether to sneak while placing
  tries: 5,               // Attempts per face candidate
  prePlacementDelay: 150, // Delay before placement (ms)
  maxRetries: 10,         // Maximum total attempts
  args: args              // Configuration arguments
});
```

**Features:**
- **Face Selection**: Scores all 6 cardinal directions, prefers top faces
- **Line-of-Sight**: Raycast validation ensures clear placement path
- **Positioning**: Smart positioning to optimal distance before placement
- **Fallback**: Multiple face candidates with scoring-based priority
- **Validation**: Pre-placement ritual with camera aiming and reach checks

#### `placeMultiple(bot, positions, itemName, options)`
Places multiple blocks with intelligent ordering:

```javascript
const result = await placeMultiple(bot, positions, "stone", {
  delayMs: 300,              // Delay between placements
  useBuildOrder: true,       // Intelligent bottom-up ordering
  useSmartPositioning: false // Smart positioning (performance tradeoff)
});
```

**Build Order Features:**
- **Dependency Tracking**: Places blocks in order respecting structural dependencies
- **Bottom-Up**: Ensures support blocks are placed first
- **Distance Optimization**: Near-to-far within same Y level

#### `buildTowerUnderneath(bot, towerHeight, args, options)`
Implements the classic Minecraft "pillar jumping" technique:

```javascript
const result = await buildTowerUnderneath(bot, 8, args, {
  blockType: "oak_planks",
  enableRetry: true,
  breakOnFailure: false,
  maxPlaceAttempts: 10
});
```

**Algorithm:**
1. Places block at feet level
2. Jumps multiple times to get on top
3. Repeats until desired height
4. Handles failures with retry logic

### Utility Functions

#### Face and Position Validation
- `findBestPlaceReference(bot, targetPos, options)` - Finds optimal reference block/face
- `canSeeFace(bot, refBlock, faceVec)` - Validates line-of-sight to face
- `isPositionSafe(bot, position, targetPos)` - Checks if position is safe for bot
- `calculateOptimalPosition(bot, refBlock, faceVec, targetPos)` - Calculates best standing position

#### Preparation and Movement
- `prepareForPlacement(bot, refBlock, faceVec, delayMs)` - Pre-placement ritual
- `moveToPlacementPosition(bot, refBlock, faceVec, targetPos, timeoutMs)` - Smart positioning

### Constants
```javascript
const CARDINALS = [
  new Vec3(0, 1, 0),  // +Y (top) - PREFERRED
  new Vec3(-1, 0, 0), // -X (west)
  new Vec3(1, 0, 0),  // +X (east)
  new Vec3(0, 0, -1), // -Z (north)
  new Vec3(0, 0, 1),  // +Z (south)
  new Vec3(0, -1, 0), // -Y (bottom) - LAST
];
```

---

## build-house-episode.js

### Purpose
Implements collaborative house building where two bots work together to construct a 5x5x5 house. Features work division, phased construction, and proper synchronization.

### House Blueprint
**Dimensions:** 5×5×5 blocks (25×25×25 in world space)
**Structure:**
- **Floor**: 25 cobblestone blocks (Y=0)
- **Walls**: 48 cobblestone blocks (3 layers high)
- **Door**: 2 oak door blocks
- **Windows**: 4 glass pane blocks
- **Roof**: 25 cobblestone blocks
- **Total**: ~104 blocks

### Work Division
Uses X-axis checkerboard pattern:
- **Alpha bot**: x=0, 1, 2 (west half + center) ≈ 60% of blocks
- **Bravo bot**: x=3, 4 (east half) ≈ 40% of blocks

### Construction Phases
1. **Floor** - Base layer
2. **Walls** - Three layers of walls
3. **Door** - Entrance placement
4. **Windows** - Glass pane placement
5. **Roof** - Top layer

### Key Functions

#### `getOnBuildHousePhaseFn()`
Main phase handler coordinating the building sequence:

```javascript
// STEP 1-2: Spawn and eye contact
// STEP 3: Determine house location (midpoint between bots)
// STEP 4: Generate blueprint and convert to world coordinates
// STEP 5: Initialize pathfinder
// STEP 6: Build in phases with work division
// STEP 7: Stop pathfinder
// STEP 8: Exit through door and admire house
```

#### `makeHouseBlueprint5x5(materials)`
Generates the complete house blueprint with material assignments.

#### `splitWorkByXAxis(targets, botName, otherBotName)`
Divides work between bots using X-coordinate based splitting.

### Episode Flow
```
Spawn → Eye Contact → Plan Location → Clear Area → Build Phases → Exit Door → Admire → Return to Spawn → Final Look
```

### Configuration
```javascript
const MATERIALS = {
  floor: "cobblestone",
  walls: "cobblestone", 
  door: "oak_door",
  windows: "glass_pane",
  roof: "cobblestone"
};
```

---

## build-tower-episode.js

### Purpose
Individual tower building episode where each bot builds their own tower using the classic "pillar jumping" technique. Contrasts with collaborative building by having independent construction.

### Key Features
- **Individual Building**: Each bot builds separately (no coordination needed)
- **Random Heights**: 8-12 blocks tall
- **Pillar Jumping**: Classic Minecraft technique
- **Retry Logic**: Handles placement failures gracefully

### Tower Building Algorithm
```javascript
for (let i = 0; i < towerHeight; i++) {
  // Place block at feet level
  await placeBlockAtFeet();
  
  // Jump and spam placement attempts
  bot.setControlState("jump", true);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    fastPlaceBlock(groundBlock);
  }
  bot.setControlState("jump", false);
  
  // Settle and verify height gain
  await settle();
}
```

### Constants
```javascript
const MIN_TOWER_HEIGHT = 8;
const MAX_TOWER_HEIGHT = 12;
const TOWER_BLOCK_TYPE = "oak_planks";
const JUMP_DURATION_MS = 50;
const SETTLE_DELAY_MS = 200;
const MAX_PLACE_ATTEMPTS = 10;
```

### Episode Flow
```
Spawn → Eye Contact → Plan Tower → Build Tower → Final Eye Contact → Stop
```

---

## build-structure-episode.js

### Purpose
General-purpose structure building episode supporting multiple structure types (walls, towers, platforms) with coordinated building roles.

### Supported Structures

#### Wall Structure
- **Dimensions**: Variable length × 3 height
- **Work Division**: Alpha builds left side, Bravo builds right side
- **Positioning**: Offset from bot position

#### Tower Structure
- **Dimensions**: 1×1×height
- **Work Division**: Each bot builds their own tower
- **Positioning**: Offset based on bot name (deterministic)

#### Platform Structure
- **Dimensions**: 4×4 (configurable)
- **Work Division**: Split by rows (north/south halves)
- **Positioning**: Centered at midpoint between bots

### Key Functions

#### `buildStructure(bot, positions, blockType, args)`
Main building function using enhanced placement system:
- Initializes pathfinder with building-appropriate settings
- Uses `placeMultiple()` with intelligent build ordering
- Tracks success/failure rates
- Comprehensive logging

#### Structure Generators
```javascript
generateWallPositions(startPos, length, height, direction)
generateTowerPositions(basePos, height) 
generatePlatformPositions(startPos, width, depth)
```

### Role Assignment
Uses bot name comparison for deterministic role assignment:
```javascript
const botNameSmaller = bot.username < args.other_bot_name;
// Alpha (< Bravo) vs Bravo (> Alpha)
```

### Episode Flow
```
Spawn → Eye Contact → Plan Structure → Build Structure → Final Eye Contact → Stop
```

---

## chase-episode.js

### Purpose
Implements chase and evade behaviors where one bot pursues while the other flees. Uses advanced pathfinding for intelligent AI movement.

### Behavior Roles

#### Chaser (Pure Pathfinder)
- Uses `GoalNear` with dynamic updates
- Maintains optimal chase distance (3-8 blocks)
- Camera tracking with periodic looks
- Intelligent pathfinding around obstacles

#### Runner (Strategic Escape)
- Calculates deterministic escape direction (directly away from chaser)
- Sets single `GoalNear` for entire chase duration
- Uses full pathfinding capabilities (can dig/place blocks)
- Maintains escape velocity

### Key Functions

#### `chaseRunner(bot, coordinator, otherBotName, episodeNum, chaseDurationMs)`
Implements intelligent chasing:
```javascript
// Update goal every second based on runner position
if (distance > MIN_CHASE_DISTANCE) {
  bot.pathfinder.setGoal(new GoalNear(targetPos, MIN_CHASE_DISTANCE));
}
```

#### `runFromChaser(bot, coordinator, otherBotName, episodeNum, chaseDurationMs)`
Implements strategic evasion:
```javascript
// Calculate escape direction (directly away from chaser)
const escapeX = currentPos.x + normalizedDx * escapeDistance;
const escapeZ = currentPos.z + normalizedDz * escapeDistance;
bot.pathfinder.setGoal(new GoalNear(escapeX, escapeY, escapeZ, 2));
```

### Constants
```javascript
const CHASE_DURATION_MS_MIN = 5000;   // 5 seconds
const CHASE_DURATION_MS_MAX = 15000;  // 15 seconds  
const MIN_CHASE_DISTANCE = 3.0;       // Maintain distance
const ESCAPE_DISTANCE = 8.0;          // Direction change trigger
const POSITION_UPDATE_INTERVAL_MS = 500;
```

### Episode Flow
```
Spawn → Eye Contact → Assign Roles → Chase/Evade → Stop
```

---

## collector-episode.js

### Purpose
Mining and resource collection episode with multiple cooperative modes: leader-follower mining and independent mining. Features torch placement, ore detection, and coordinated exploration.

### Mining Modes

#### Leader-Follower Mode (100% probability)
- **Leader**: Performs mining tasks with repetition tracking
- **Follower**: Follows leader while placing torches
- **Synchronization**: Leader signals completion to follower

#### Independent Mode
- Both bots mine separately using same task patterns
- Symmetric RNG consumption ensures deterministic behavior

### Task Types

#### Directional Mining
- Random cardinal direction (N/S/E/W)
- Distance: 5-9 blocks
- Straight-line pathfinding

#### Staircase Mining  
- 45-degree descent mining
- Horizontal + vertical movement
- Deeper exploration

### Key Features

#### Torch Placement System
```javascript
await placeTorch(bot, mcData, oreIds, 6000, stopCondition);
// Places torches on nearby surfaces
// Respects ore blocks (won't place on valuable resources)
// Up to 6-second timeout with stop condition support
```

#### Ore Detection
```javascript
const visibleOres = findVisibleOres(bot, oreIds);
// Finds ores within 16 blocks
// Validates line-of-sight using canSeeBlock()
// Filters by visibility and distance
```

#### Mining Cycles
- **Max Cycles**: 20 mining cycles per episode
- **Task Repetition**: Each task performed twice
- **Ore Limit**: Max 8 ores collected per cycle

### Valuable Ores
```javascript
const VALUABLE_ORES = [
  "diamond_ore", "deepslate_diamond_ore",
  "emerald_ore", "deepslate_emerald_ore", 
  "gold_ore", "deepslate_gold_ore",
  // ... and more
];
```

### Episode Structure
```
Setup → Multiple Mining Cycles → Cleanup
Each Cycle: Meetup → Mining Phase → Next Cycle
```

---

## index.js

### Purpose
Main episode coordinator managing the entire bot lifecycle, episode selection, teleportation, and system-wide coordination.

### Episode Selection System

#### Available Episodes
```javascript
const episodeTypes = [
  "straightLineWalk", "chase", "orbit", "walkLook",
  "buildHouse", "walkLookAway", "pvp", "pve", 
  "buildStructure", "buildTower", "mine", "towerBridge",
  "collector", "structureEval", "translationEval",
  "lookAwayEval", "rotationEval"
];
```

#### Episode Class Mapping
Maps string names to class implementations:
```javascript
const episodeClassMap = {
  "buildHouse": BuildHouseEpisode,
  "buildTower": BuildTowerEpisode,
  // ... etc
};
```

### Key Functions

#### `runSingleEpisode()`
Main episode execution function:
1. Sets up error handling and cleanup
2. Initializes episode state
3. Coordinates teleport and recording phases
4. Runs episode-specific logic
5. Handles cleanup and teardown

#### `getOnTeleportPhaseFn()`
Handles bot teleportation between episodes:
```javascript
if (args.teleport && bot.username < args.other_bot_name) {
  await teleport(bot, rcon, args, ourPosition, otherBotPosition, episodeInstance);
}
```

#### Teleportation System
Uses Minecraft's `spreadplayers` command for coordinated positioning:
- Radius-based random placement
- Maintains minimum/maximum bot distances
- Automatic chunk forceloading
- Retry logic for failed placements

### Phase Coordination
Implements the standard phase pattern:
1. **Teleport Phase**: Position bots for episode
2. **Post-Teleport Phase**: Setup episode-specific state  
3. **Start Recording Phase**: Begin video/audio capture
4. **Episode Execution**: Run episode-specific logic
5. **Stop Phase**: End recording and cleanup

### Configuration
Supports environment variables and args for:
- Episode type filtering
- Recording settings
- Teleportation parameters
- World type restrictions
- Smoke test mode

### Error Handling
Comprehensive error handling with:
- Episode-scoped error capture
- Peer error notification
- Automatic cleanup on failures
- Bot death detection

---

## Usage Examples

### Running Specific Episode Types
```bash
# Run only building episodes
EPISODE_TYPES="buildHouse,buildTower,buildStructure" npm start

# Smoke test all episodes
SMOKE_TEST=1 npm start
```

### Episode Development
```javascript
class CustomEpisode extends BaseEpisode {
  static WORKS_IN_NON_FLAT_WORLD = true;
  static INIT_MIN_BOTS_DISTANCE = 5;
  static INIT_MAX_BOTS_DISTANCE = 15;

  async entryPoint(bot, rcon, sharedBotRng, coordinator, iterationID, episodeNum, args) {
    // Implement custom episode logic
    // Use coordinator for bot synchronization
    // Call getOnStopPhaseFn() to end episode
  }
}
```

### Builder Usage
```javascript
// Place single block with full validation
await placeAt(bot, targetPos, "stone");

// Build complex structure
const positions = generateWallPositions(startPos, 5, 3);
const result = await placeMultiple(bot, positions, "stone", {
  useBuildOrder: true,
  useSmartPositioning: true
});
```

This documentation covers the core architecture and functionality of the episode system. Each episode type builds upon the base framework while implementing specialized coordinated behaviors for comprehensive Minecraft gameplay data collection.
