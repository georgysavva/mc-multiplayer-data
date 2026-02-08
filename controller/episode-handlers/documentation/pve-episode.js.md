# pve-episode.js Documentation

## Overview

`pve-episode.js` implements player versus environment (PvE) combat episodes where bots fight hostile mobs in coordinated guard positions. This episode evaluates combat AI, positioning strategy, and cooperative defense patterns.

## Class: PveEpisode

### Static Properties

| Property                  | Value  | Description                     |
| ------------------------- | ------ | ------------------------------- |
| `INIT_MIN_BOTS_DISTANCE`  | `15`   | Minimum distance between bots   |
| `INIT_MAX_BOTS_DISTANCE`  | `25`   | Maximum distance between bots   |
| `WORKS_IN_NON_FLAT_WORLD` | `true` | Supports non-flat world terrain |

### Episode Characteristics

**Combat Focus:**

- Guard-based positioning with coordinated defense
- Hostile mob spawning and targeting
- FOV-constrained mob detection
- Combat timing and engagement strategies

**Key Features:**

- Strategic mob spawning in forward field of view
- Guard position defense with eye contact
- Combat timeout protection
- Health and resource monitoring

## Configuration Constants

| Constant                       | Value  | Description                    |
| ------------------------------ | ------ | ------------------------------ |
| `CAMERA_SPEED_DEGREES_PER_SEC` | `30`   | Smooth camera movement speed   |
| `VIEW_DISTANCE`                | `16`   | Maximum mob detection distance |
| `LOCK_EYE_DURATION_MIN`        | `1000` | Minimum eye contact duration   |
| `LOCK_EYE_DURATION_MAX`        | `3000` | Maximum eye contact duration   |
| `FOV_DEGREES`                  | `90`   | Forward field of view angle    |
| `MIN_MOBS`                     | `2`    | Minimum mobs to spawn          |
| `MAX_MOBS`                     | `5`    | Maximum mobs to spawn          |

## Hostile Mob Configuration

```javascript
const HOSTILE_MOBS_SUMMON_IDS = [
  "minecraft:zombie",
  "minecraft:skeleton",
  "minecraft:spider",
  "minecraft:husk",
];

const HOSTILE_ENTITY_NAMES = new Set(
  HOSTILE_MOBS_SUMMON_IDS.map((id) => id.split(":")[1]),
);
```

## Core Combat Functions

### isInForwardFOV(bot, targetPos, fovDegrees)

Determines if target position is within bot's forward field of view.

**Algorithm:**

```javascript
// Calculate forward direction vector
const forwardX = -Math.sin(yaw);
const forwardZ = -Math.cos(yaw);

// Calculate dot product with target direction
const dotProduct = forwardX * targetDirX + forwardZ * targetDirZ;
const angleThreshold = Math.cos((fovDegrees * Math.PI) / 180);

return dotProduct >= angleThreshold;
```

### spawnWithRconAround(bot, rcon, options)

Spawns hostile mobs within bot's forward FOV cone.

**Parameters:**

- `mob` - Mob type to spawn
- `count` - Number of mobs
- `maxRadius` - Maximum spawn distance
- `minRadius` - Minimum spawn distance

**Strategy:**

- Random direction within FOV cone
- Biased outward distance distribution
- Safe position finding with chunk loading

### getNearestHostile(bot, maxDistance, checkFOV)

Finds nearest hostile mob within constraints.

**Filtering:**

- Hostile mob type validation
- Distance limits
- Optional FOV checking
- Line-of-sight validation

### guardAndFight(bot, guardPosition, otherBotGuardPosition)

Executes guard-based combat strategy.

**Combat Sequence:**

1. Wait for mob within melee range (7 blocks)
2. Engage with PvP system
3. Fight until mob defeated or timeout
4. Return to guard position
5. Make eye contact with other bot

## Episode Flow

### Main Sequence

1. **Position Setup**: Establish guard positions
2. **Mob Spawning**: Create hostile mobs in FOV
3. **Combat Rounds**: Fight mobs sequentially
4. **Position Recovery**: Return to guard position
5. **Eye Contact**: Coordinate with other bot
6. **Completion**: Transition to stop phase

### Combat Rounds

```javascript
for (let mobI = 0; mobI < numMobs; mobI++) {
  // Check for existing mobs in FOV
  const mobInFov = getNearestHostile(bot, mobDistMax, true);
  if (!mobInFov) {
    // Spawn new mob in FOV
    await spawnWithRconAround(bot, rcon, { ... });
  }

  // Execute guard-based combat
  await guardAndFight(bot, ourGuardPosition, otherGuardPosition);
}
```

## Technical Implementation

### FOV-Based Spawning

```javascript
// Spawn within forward cone
const angleOffset = (Math.random() - 0.5) * fovRadians;
const cosA = Math.cos(angleOffset);
const sinA = Math.sin(angleOffset);
const dirX = forwardX * cosA - forwardZ * sinA;
const dirZ = forwardX * sinA + forwardZ * cosA;

// Biased outward distance
const r = Math.sqrt(Math.random()) * (maxRadius - minRadius) + minRadius;
```

### Combat State Management

- **PvP System**: Uses mineflayer-pvp for combat
- **Timeout Protection**: 15-second limits for engagement
- **Health Monitoring**: Tracks bot health and food
- **Position Recovery**: Pathfinder-based return to guard position

### Eye Contact Timing

```javascript
// Random duration between min and max
await sleep(
  LOCK_EYE_DURATION_MIN +
    Math.random() * (LOCK_EYE_DURATION_MAX - LOCK_EYE_DURATION_MIN),
);
```

## Integration Points

### Fighting System Integration

- Uses `giveRandomSword()` for weapon equipping
- Leverages `equipSword()` for combat preparation
- Integrates with PvP attack systems

### Coordinator Integration

- Phase-based communication via `pvePhase_fight_${iterationID}`
- Proper stop phase transitions
- Episode recording lifecycle support

## Usage Examples

### Episode Execution

```javascript
// Episode automatically handles:
// - Strategic mob spawning in forward field of view
// - Guard position defense with combat engagement
// - Sequential mob elimination with position recovery
// - Eye contact coordination between bots
// - Timeout protection and health monitoring
```

### Manual Combat

```javascript
// Direct guard-based combat
await guardAndFight(bot, guardPos, otherGuardPos);
// Bot will defend position and engage nearby mobs
```

## Performance Characteristics

### Resource Usage

- **CPU**: High (combat calculations, pathfinding, entity tracking)
- **Memory**: Moderate (entity tracking, position management)
- **Network**: Moderate (RCON commands for spawning, PvP coordination)

### Combat Metrics

- **Engagement Range**: 7-block melee distance
- **Timeout Protection**: 15-second combat limits
- **Mob Count**: 2-5 per episode (configurable)
- **Success Rate**: Depends on bot positioning and mob behavior

## Testing Considerations

### Deterministic Behavior

- Mob spawning based on shared RNG
- Position calculations relative to bot locations
- FOV calculations using consistent trigonometry

### Edge Cases

- **No Mobs Available**: Spawning fallback when none in FOV
- **Combat Timeouts**: Graceful handling of stuck combat
- **Position Recovery**: Pathfinding failure handling
- **Health Depletion**: Continued operation despite damage

### Debug Features

- Comprehensive combat logging
- Distance and FOV calculations
- Health status monitoring
- Mob spawning confirmation

## Future Enhancements

### Potential Features

- **Team Combat**: Multi-bot coordinated attacks
- **Strategic Positioning**: Dynamic guard position adjustment
- **Weapon Selection**: Different weapon effectiveness testing
- **Difficulty Scaling**: Adaptive mob spawning based on performance
- **Environmental Combat**: Terrain-based tactical considerations
