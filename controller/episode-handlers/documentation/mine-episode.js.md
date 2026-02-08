# mine-episode.js Documentation

## Overview

`mine-episode.js` implements underground mining episodes where bots dig down to create tunnels and explore underground environments. This episode focuses on pathfinding-based mining with torch placement for visibility, creating realistic mining scenarios for data collection.

## Class: MineEpisode

### Static Properties

| Property                  | Value  | Description                     |
| ------------------------- | ------ | ------------------------------- |
| `WORKS_IN_NON_FLAT_WORLD` | `true` | Supports non-flat world terrain |

### Episode Characteristics

**Mining Strategy:**

- Pathfinder-enabled mining with intelligent obstacle navigation
- Torch placement for visibility in dark tunnels
- Underground exploration with safety considerations
- Midpoint-based tunnel creation between bots

**Key Features:**

- Automatic digging through obstacles
- Strategic torch placement every 999 blocks (effectively disabled)
- Chunk loading integration for underground positions
- Safety checks for lava and cave detection

## Configuration Constants

| Constant                   | Value               | Description                     |
| -------------------------- | ------------------- | ------------------------------- |
| `INITIAL_EYE_CONTACT_MS`   | `1500`              | Initial eye contact duration    |
| `FINAL_EYE_CONTACT_MS`     | `1500`              | Final eye contact duration      |
| `TOOL_TYPE`                | `"diamond_pickaxe"` | Mining tool                     |
| `PATHFIND_TIMEOUT_MS`      | `60000`             | Pathfinder timeout (60 seconds) |
| `UNDERGROUND_DEPTH`        | `1`                 | Blocks to dig down initially    |
| `TORCH_TYPE`               | `"torch"`           | Torch item for lighting         |
| `TORCH_PLACEMENT_INTERVAL` | `999`               | Torch placement frequency       |
| `LOOK_DELAY_MS`            | `500`               | Camera delay for visibility     |
| `FALL_DELAY_MS`            | `800`               | Delay after digging down        |
| `TORCH_EQUIP_DELAY_MS`     | `500`               | Delay after equipping torch     |
| `TORCH_LOOK_DELAY_MS`      | `800`               | Delay before torch placement    |
| `TORCH_PLACE_DELAY_MS`     | `1200`              | Delay after placing torch       |

## Core Mining Functions

### digDownToUnderground(depth)

Safely digs down to create underground starting position.

**Safety Checks:**

- Block existence validation
- Lava detection (aborts if found)
- Cave detection (continues falling)
- Ground position verification

**Process:**

1. Check block below for validity
2. Look down and dig safely
3. Wait for fall to complete
4. Track actual depth achieved

### placeTorchOnFloor(bot, movementDirection)

Places torch at bot's current feet position for lighting.

**Smart Placement:**

- Validates floor block existence
- Checks for existing torches
- Equips torch from inventory
- Places on top face of floor block
- Includes camera movements for realism

### mineTowardsTargetWithTorchPlacement(bot, targetPos)

Advanced mining with periodic torch placement using pathfinder.

**Pathfinder Configuration:**

- Mining enabled (`canDig: true`)
- Cheap digging costs to prefer mining over walking
- Expensive placing to prevent climbing
- Surface path penalties to encourage tunneling

**Torch Management:**

- Places torches every 999 blocks (configurable)
- Re-equips pickaxe after torch placement
- Checks inventory availability

### mineTowardsTarget(bot, targetPos)

Simplified mining without torch placement.

**Movement Configuration:**

- Mining enabled with safety constraints
- No vertical drops (stays at same Y level)
- Entity detection for avoiding other bots

## Episode Flow

### Main Sequence

1. **Spawn & Eye Contact**: Initial coordination
2. **Tool Equipping**: Diamond pickaxe preparation
3. **Dig Down**: Create underground starting point
4. **Position Calculation**: Determine midpoint target
5. **Mining Execution**: Pathfinder-based tunnel creation
6. **Final Contact**: Episode completion

### Mining Strategy

#### Underground Positioning

```javascript
// Calculate positions underground (UNDERGROUND_DEPTH below surface)
const myUndergroundPos = new Vec3(
  phaseDataOur.position.x,
  phaseDataOur.position.y - UNDERGROUND_DEPTH,
  phaseDataOur.position.z,
);
```

#### Midpoint Targeting

```javascript
// Create tunnel between bot positions
const midpoint = new Vec3(
  Math.floor((myUndergroundPos.x + otherUndergroundPos.x) / 2),
  Math.floor(myUndergroundPos.y), // Underground Y level
  Math.floor((myUndergroundPos.z + otherUndergroundPos.z) / 2),
);

const miningTarget = midpoint.offset(0, -1, 0); // 1 block below midpoint
```

## Safety and Constraints

### Mining Safety

- **Lava Detection**: Aborts digging if lava encountered
- **Cave Handling**: Continues falling through natural caves
- **Timeout Protection**: 60-second pathfinding timeout
- **Chunk Loading**: Uses `land_pos()` for safe positioning

### Resource Management

- **Tool Validation**: Ensures diamond pickaxe equipped
- **Torch Inventory**: Checks torch availability before placement
- **Pathfinder Cleanup**: Proper goal clearing and state management

## Integration Points

### Builder System Integration

- Uses `ensureItemInHand()` for tool management
- Leverages `digWithTimeout()` for safe digging
- Integrates with inventory management

### Coordinator Integration

- Phase-based communication via `minePhase_${iterationID}`
- Proper stop phase transitions
- Episode recording lifecycle support

## Technical Implementation

### Pathfinder Configuration

```javascript
const movements = new Movements(bot, mcData);
movements.canDig = true;
movements.digCost = 0.1; // Prefer digging
movements.placeCost = 1000; // Avoid placing
movements.blocksCost = 10; // Penalize surface paths
movements.allowParkour = false; // Disable parkour
movements.allowSprinting = false; // Disable sprinting
movements.allowJumping = false; // Disable jumping
```

### Torch Placement Logic

```javascript
// Periodic torch placement during mining
const torchCheckInterval = setInterval(async () => {
  const distanceSinceLastTorch = currentPos.distanceTo(lastTorchPos);
  if (distanceSinceLastTorch >= TORCH_PLACEMENT_INTERVAL) {
    await placeTorchOnFloor(bot);
    torchesPlaced++;
    lastTorchPos = currentPos.clone();
  }
}, 2000); // Check every 2 seconds
```

## Usage Examples

### Episode Execution

```javascript
// Episode automatically handles:
// - Underground tunnel creation between bot positions
// - Intelligent obstacle navigation with mining
// - Torch placement for tunnel illumination
// - Safety checks and timeout protection
// - Proper cleanup and phase transitions
```

### Manual Mining

```javascript
// Direct mining to specific target
const result = await mineTowardsTargetWithTorchPlacement(bot, targetPos);
console.log(
  `Mined ${result.distanceTraveled}m, placed ${result.torchesPlaced} torches`,
);
```

## Performance Characteristics

### Resource Usage

- **CPU**: High (complex pathfinding with mining calculations)
- **Memory**: Moderate (pathfinding state, position tracking)
- **Network**: Low (coordinator messages, RCON commands)

### Mining Efficiency

- **Success Rate**: Depends on terrain and obstacle complexity
- **Torch Usage**: Minimal with 999-block intervals
- **Completion Time**: Variable based on distance and obstacles

## Testing Considerations

### Deterministic Behavior

- Position calculations relative to bot spawn locations
- Midpoint targeting ensures consistent tunnel creation
- RNG-independent core functionality

### Edge Cases

- **Unloaded Chunks**: Fallback to surface Y levels
- **Mining Failures**: Timeout handling and graceful degradation
- **Torch Depletion**: Continues mining without lighting
- **Pathfinding Blocks**: Intelligent obstacle navigation

### Debug Features

- Comprehensive logging of mining progress
- Distance and torch placement tracking
- Pathfinder state monitoring
- Safety check reporting

## Future Enhancements

### Potential Features

- **Branch Mining**: Multiple tunnel creation patterns
- **Ore Detection**: Intelligent ore-seeking behavior
- **Minecart Systems**: Transportation integration
- **Multi-level Mining**: 3D exploration patterns
- **Resource Collection**: Automated ore gathering
