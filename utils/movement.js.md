# movement.js Documentation

## Overview

`movement.js` provides comprehensive movement, navigation, and camera control utilities for Mineflayer bots. This module serves as the core movement system, offering both high-level pathfinding operations and low-level control primitives for precise bot behavior across all episodes.

## Scaffolding Block Configuration

### DEFAULT_SCAFFOLDING_BLOCK_NAMES
Comprehensive list of 42 block types suitable for pathfinding scaffolding and bridging:

**Categories:**
- **Basic**: dirt, cobblestone, stone
- **Stone Variants**: andesite, diorite, granite (+ polished)
- **Stone Bricks**: regular, cracked, mossy, chiseled
- **Deepslate**: cobbled, bricks, cracked
- **Bricks**: clay, nether, red nether
- **Sandstone**: regular, red (+ cut, smooth)
- **Wood Planks**: All 11 types (oak → warped)

### getScaffoldingBlockIds(mcData, blockNames)
Converts block names to Minecraft item IDs for pathfinding configuration.

**Parameters:**
- `mcData` - minecraft-data instance
- `blockNames` - Optional custom block list (defaults to comprehensive list)

**Returns:** Array of block item IDs, filtering out undefined entries

## Basic Control Functions

### Movement Controls

#### stopAll(bot)
Immediately halts all bot movement and actions.

**Actions Stopped:**
- Pathfinder navigation
- Manual movement controls (forward, back, left, right)
- Jump, sprint, and sneak states

#### setControls(bot, controls)
Sets multiple movement controls simultaneously.

**Example:**
```javascript
setControls(bot, { forward: true, sprint: true, jump: false });
```

#### enableSprint(bot) / disableSprint(bot)
Simple sprint state toggles using control states.

## Pathfinder Setup and Configuration

### initializePathfinder(bot, options)
Configures pathfinder with optimal settings for robust navigation.

**Default Configuration (All Enabled):**
- `allowSprinting`: true - Sprint during movement
- `allowParkour`: true - Jump over gaps
- `canDig`: true - Break blocks to clear paths
- `canPlaceOn`: true - Place blocks to bridge gaps
- `allowEntityDetection`: true - Avoid other entities
- `maxDropDown`: 4 blocks
- `infiniteLiquidDropdownDistance`: true

**Scaffolding:** Uses comprehensive 42-block list by default

**Returns:** Configured Movements instance

### stopPathfinder(bot)
Stops active pathfinding and clears current goals.

## Pathfinder Navigation Helpers

### gotoWithTimeout(bot, goal, options)
Navigate to a pathfinding goal with timeout protection.

**Parameters:**
- `goal` - Pathfinder Goal instance (GoalNear, GoalBlock, etc.)
- `options.timeoutMs` - Maximum navigation time (default: 10 seconds)
- `options.stopOnTimeout` - Clear goal on timeout (default: true)

**Returns:** Promise resolving on success, rejecting on timeout

### digWithTimeout(bot, block, options)
Dig a block with timeout protection.

**Parameters:**
- `block` - Block object to dig
- `options.timeoutMs` - Maximum digging time (default: 7 seconds)
- `options.stopOnTimeout` - Stop digging on timeout (default: true)

**Returns:** Promise resolving on completion, rejecting on timeout

## Directional Movement Functions

### moveDirection(bot, direction, sprint)
Move in a cardinal direction using manual controls.

**Directions:** "forward", "back", "left", "right"

**Process:**
1. Stop all current movement
2. Enable specified direction control
3. Optionally enable sprinting

### moveToward(bot, targetPosition, sprint, threshold)
Navigate toward a target position using directional controls.

**Algorithm:**
1. Calculate vector to target
2. Determine primary movement axis (N/S vs E/W)
3. Set appropriate directional controls
4. Enable sprinting if requested

**Returns:** Primary direction being moved ("forward", "back", "left", "right", "stopped")

### moveAway(bot, avoidPosition, sprint)
Move away from a specified position.

**Strategy:** Creates escape target 5 blocks away in opposite direction

## Random Sampling Utilities

### sampleLognormal(mu, sigma)
Generate log-normal distributed random samples using Box-Muller transform.

**Parameters:**
- `mu` - Mean of underlying normal distribution
- `sigma` - Standard deviation of underlying normal distribution

**Returns:** Log-normally distributed positive value

### getMeanPreservingScalingFactor(volatility)
Generate scaling factor with expected value of 1.0.

**Purpose:** Creates natural variation while preserving average behavior

## Camera and Looking Functions

### Look Options
```javascript
DEFAULT_LOOK_OPTIONS = {
  useEasing: false,    // Smooth acceleration/deceleration
  randomized: false,   // Variable speed using log-normal distribution
  volatility: 0.4      // Speed variation intensity
}
```

### lookAtSmooth(bot, targetPosition, degreesPerSecond, options)
Smoothly rotate camera to face a world position.

**Process:**
1. Calculate yaw/pitch angles to target
2. Apply smooth rotation with specified speed
3. Support easing and randomization options

### lookSmooth(bot, targetYaw, targetPitch, degreesPerSecond, options)
Rotate camera to specific yaw/pitch angles with smooth movement.

**Randomization:** Uses log-normal scaling for natural speed variation

### lookAtBot(bot, targetBotName, degreesPerSecond, options)
Look at another bot by player name.

**Validation:** Checks if target bot exists and has entity data

### lookDirection(bot, yawRadians, pitchRadians)
Instant camera rotation to specified angles.

## Utility Functions

### Position and Distance Calculations

#### land_pos(bot, x, z)
Find suitable ground position at coordinates.

**Algorithm:**
1. Start from Y=128 (air level)
2. Move downward through solid blocks
3. Find first air block above solid ground
4. Return safe landing position

#### distanceTo(pos1, pos2)
Calculate 3D Euclidean distance between positions.

#### horizontalDistanceTo(pos1, pos2)
Calculate 2D horizontal distance (ignoring Y axis).

#### getDirectionTo(fromPos, toPos)
Get normalized direction vector between positions.

**Returns:**
```javascript
{
  x: number,        // Normalized X component (-1 to 1)
  z: number,        // Normalized Z component (-1 to 1)
  distance: number  // Total horizontal distance
}
```

### Proximity Checks

#### isNearPosition(bot, targetPosition, threshold)
Check if bot is within distance of target position.

#### isNearBot(bot, targetBotName, threshold)
Check if bot is within distance of another bot.

### Action Functions

#### jump(bot, durationMs)
Make bot jump repeatedly for specified duration.

**Pattern:** 250ms jump, 250ms rest, repeated

#### sneak(bot, durationTicks, idleTicks)
Make bot sneak for specified duration with post-sneak pause.

**Default:** 5 ticks sneaking + 10 ticks idle (0.75 seconds total)

## Integration Points

### Episode System Integration
- **Pathfinding**: Core navigation for all movement episodes
- **Camera Control**: Smooth looking behaviors in social episodes
- **Positioning**: Landing position calculation for teleportation

### Builder System Integration
- **Scaffolding**: Block lists for construction navigation
- **Digging**: Timeout-protected block removal
- **Movement**: Coordinated positioning during building

### Combat System Integration
- **Positioning**: Distance calculations for engagement ranges
- **Camera Control**: Target tracking and aiming

## Usage Examples

### Pathfinder Navigation
```javascript
// Setup pathfinder
initializePathfinder(bot, { allowSprinting: true, canDig: true });

// Navigate to position with timeout
const goal = new GoalNear(100, 64, 100, 1);
await gotoWithTimeout(bot, goal, { timeoutMs: 15000 });
```

### Camera Control
```javascript
// Look at another bot smoothly
await lookAtBot(bot, "Bravo", 90, { randomized: true });

// Look at position with easing
await lookAtSmooth(bot, targetPos, 60, { useEasing: true });
```

### Directional Movement
```javascript
// Move toward target
const direction = moveToward(bot, targetPos, true, 2.0);

// Move away from threat
moveAway(bot, threatPos, true);
```

### Proximity Monitoring
```javascript
// Check if close to position
if (isNearPosition(bot, checkpoint, 1.5)) {
  console.log("Reached checkpoint");
}

// Check if close to other bot
if (isNearBot(bot, "Bravo", 3.0)) {
  console.log("Close to Bravo");
}
```

## Performance Characteristics

### Resource Usage
- **Pathfinding**: CPU-intensive during navigation
- **Camera Control**: Minimal CPU for angle calculations
- **Distance Checks**: Negligible CPU for position math

### Memory Usage
- **Block Lists**: Static arrays (minimal)
- **Pathfinding State**: Temporary during navigation
- **Position Objects**: Small Vec3 instances

## Technical Implementation Details

### Minecraft Coordinate System
- **Yaw**: Horizontal rotation (radians)
- **Pitch**: Vertical rotation (radians, negative downward)
- **Directions**: Positive X = East, Positive Z = South

### Pathfinder Integration
- Uses mineflayer-pathfinder for advanced navigation
- Supports all standard Goal types
- Configurable movement parameters per use case

### Timeout Protection
- Prevents infinite operations
- Automatic cleanup on timeout
- Configurable timeout durations

## Future Enhancements

### Potential Features
- **Advanced Pathfinding**: Multi-goal route planning
- **Terrain Analysis**: Intelligent path selection
- **Group Movement**: Coordinated multi-bot navigation
- **Dynamic Speed**: Context-aware movement speeds
- **Collision Prediction**: Advanced entity avoidance
