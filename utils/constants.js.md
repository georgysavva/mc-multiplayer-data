# constants.js Documentation

## Overview

`constants.js` defines system-wide constants used throughout the Minecraft bot data collection system. This module centralizes configuration values for movement behaviors, spatial relationships, camera controls, and terrain validation.

## Movement Constants

### Bot Positioning
```javascript
MIN_BOTS_DISTANCE: 10,     // Minimum distance between bots (blocks)
MAX_BOTS_DISTANCE: 15,     // Maximum distance between bots (blocks)
```

**Usage Context:**
- Initial bot spawning in episodes
- Maintaining social distance during interactions
- Collision avoidance in multi-bot scenarios

### Locomotion Parameters
```javascript
MIN_WALK_DISTANCE: 3,      // Minimum random walk distance
MAX_WALK_DISTANCE: 4,      // Maximum random walk distance
```

**Application:**
- Random movement patterns in exploration episodes
- Pathfinding goal generation
- Behavioral variation in movement-based episodes

### Camera Control
```javascript
DEFAULT_CAMERA_SPEED_DEGREES_PER_SEC: 30,  // Standard camera rotation speed
```

**Integration Points:**
- Used by `lookSmooth()` and `lookAtSmooth()` functions
- Consistent turning behavior across episodes
- Smooth camera movements for natural bot behavior

### Jump Behavior
```javascript
JUMP_PROBABILITY: 0.25,           // 25% chance to jump during movement
MIN_JUMP_DURATION_SEC: 1,         // Minimum jump sequence duration
MAX_JUMP_DURATION_SEC: 3,         // Maximum jump sequence duration
```

**Behavioral Patterns:**
- Random jump interruptions during walking
- Variable jump timing for natural movement
- Controlled randomness in locomotion episodes

### Action Timing
```javascript
MIN_SLEEP_BETWEEN_ACTIONS_SEC: 0.2,  // 200ms minimum delay
MAX_SLEEP_BETWEEN_ACTIONS_SEC: 0.5,  // 500ms maximum delay
```

**Purpose:**
- Prevents action spamming
- Creates natural timing variation
- Controls episode pacing

## Terrain Constants

### Landable Blocks Array
```javascript
LANDABLE_BLOCKS: [
  "dirt", "stone", "sand", "grass_block", "snow",
  "gravel", "sandstone", "red_sand", "terracotta",
  "mycelium", "end_stone", "nether_bricks",
  "blackstone", "polished_blackstone_bricks",
  "cracked_polished_blackstone_bricks", "netherrack"
]
```

**Block Categories:**
- **Overworld**: dirt, stone, sand, grass_block, snow, gravel
- **Desert**: sandstone, red_sand, terracotta
- **Special**: mycelium (mushroom islands)
- **End Dimension**: end_stone
- **Nether Dimension**: Various nether materials

## Usage Patterns

### Episode Configuration
```javascript
const { MIN_BOTS_DISTANCE, MAX_BOTS_DISTANCE } = require('./utils/constants');

// Use in episode setup
const botDistance = MIN_BOTS_DISTANCE + 
  Math.random() * (MAX_BOTS_DISTANCE - MIN_BOTS_DISTANCE);
```

### Movement Generation
```javascript
const { MIN_WALK_DISTANCE, MAX_WALK_DISTANCE, JUMP_PROBABILITY } = require('./utils/constants');

// Generate random movement
const distance = MIN_WALK_DISTANCE + Math.random() * (MAX_WALK_DISTANCE - MIN_WALK_DISTANCE);
const shouldJump = Math.random() < JUMP_PROBABILITY;
```

### Camera Control
```javascript
const { DEFAULT_CAMERA_SPEED_DEGREES_PER_SEC } = require('./utils/constants');

// Consistent camera behavior
await lookSmooth(bot, targetYaw, targetPitch, DEFAULT_CAMERA_SPEED_DEGREES_PER_SEC);
```

### Terrain Validation
```javascript
const { LANDABLE_BLOCKS } = require('./utils/constants');

// Check if position is safe for landing
function isSafeLanding(block) {
  return LANDABLE_BLOCKS.includes(block.name);
}
```

## Integration Points

### Movement System
- Used by `random-movement.js` for behavior generation
- Referenced in pathfinding goal creation
- Applied in camera control functions

### Episode Handlers
- Distance constraints in multi-bot episodes
- Camera speed consistency across episodes
- Terrain validation in teleportation systems

### Building System
- Landable blocks for construction validation
- Movement parameters in building navigation

## Design Philosophy

### Centralized Configuration
- Single source of truth for system constants
- Easy tuning of behavioral parameters
- Consistent values across all modules

### Behavioral Realism
- Movement constants based on human-like behavior
- Terrain validation covers diverse biomes
- Timing values prevent robotic appearance

### Extensibility
- Clear naming conventions for new constants
- Grouped by functional area
- Comprehensive block type coverage

## Modification Guidelines

### Adding New Constants
```javascript
// Group related constants together
// Use descriptive UPPER_SNAKE_CASE names
// Add to module.exports
// Document purpose and usage
```

### Updating Values
- Test impact on episode behavior
- Update dependent code if ranges change
- Consider backward compatibility

### Block List Maintenance
- Add new landable blocks as they're discovered
- Test in diverse world generation scenarios
- Include blocks from all dimensions

## Performance Impact

### Memory Usage
- Minimal static data (small arrays and numbers)
- No dynamic memory allocation
- Constants loaded once at module initialization

### Runtime Performance
- Direct value access (no computation)
- Array inclusion checks are O(n) but n is small
- No impact on episode execution speed

## Testing Considerations

### Validation
- Constants should be positive and logical
- Array contents should be valid Minecraft block names
- Ranges should be reasonable for bot behavior

### Behavioral Testing
- Episode behavior changes when constants are modified
- Camera smoothness affected by speed values
- Movement patterns vary with distance ranges

## Future Enhancements

### Potential Additions
- **Episode-Specific Constants**: Per-episode configuration objects
- **Biome-Specific Blocks**: Context-aware landable block lists
- **Dynamic Constants**: Runtime-adjustable values based on performance
- **Validation Functions**: Automated constant validation
- **Configuration Files**: External configuration loading
