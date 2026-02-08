# orbit-episode.js Documentation

## Overview

`orbit-episode.js` implements circular orbiting behavior where bots travel around a shared center point in coordinated checkpoints. This episode evaluates spatial awareness, navigation precision, and synchronized movement patterns.

## Class: OrbitEpisode

### Static Properties

| Property                  | Value  | Description                     |
| ------------------------- | ------ | ------------------------------- |
| `WORKS_IN_NON_FLAT_WORLD` | `true` | Supports non-flat world terrain |

### Episode Characteristics

**Orbital Movement:**

- Circular path navigation around shared midpoint
- Checkpoint-based progression with eye contact
- Terrain adaptation with ground finding
- Coordinated timing and synchronization

**Key Features:**

- Dynamic radius calculation based on bot separation
- Smooth camera movements and eye contact
- Pathfinder integration with full movement capabilities
- Timeout protection for unreachable checkpoints

## Configuration Constants

| Constant                       | Value  | Description                                 |
| ------------------------------ | ------ | ------------------------------------------- |
| `NUM_CHECKPOINTS`              | `8`    | Number of orbital checkpoints               |
| `CHECKPOINT_REACH_DISTANCE`    | `1.5`  | Distance tolerance for reaching checkpoints |
| `CHECKPOINT_TIMEOUT_MS`        | `5000` | Maximum time per checkpoint (5 seconds)     |
| `EYE_CONTACT_DURATION_MS`      | `1000` | Eye contact duration at each checkpoint     |
| `CAMERA_SPEED_DEGREES_PER_SEC` | `90`   | Camera rotation speed                       |

## Core Functions

### calculateOrbitCheckpoints(center, radius, numCheckpoints, startAngle)

Generates evenly spaced checkpoint positions around a circle.

**Parameters:**

- `center` - Circle center position (Vec3)
- `radius` - Circle radius
- `numCheckpoints` - Number of checkpoints
- `startAngle` - Starting angle in radians

**Algorithm:**

```javascript
const angleStep = (2 * Math.PI) / numCheckpoints;
for (let i = 0; i < numCheckpoints; i++) {
  const angle = startAngle + i * angleStep;
  const x = center.x + radius * Math.cos(angle);
  const z = center.z + radius * Math.sin(angle);
  checkpoints.push(new Vec3(x, center.y, z));
}
```

### executeOrbitWithCheckpoints(bot, otherBotName, checkpoints, rcon)

Executes orbital movement through all checkpoints.

**Process:**

1. Initialize pathfinder with full capabilities
2. Visit each checkpoint in sequence
3. Find ground position using chunk loading
4. Navigate to checkpoint with timeout protection
5. Make eye contact with other bot
6. Repeat for all checkpoints

**Pathfinder Configuration:**

```javascript
initializePathfinder(bot, {
  allowSprinting: true, // Fast movement between checkpoints
  allowParkour: true, // Jump over obstacles
  canDig: true, // Clear path if needed
  canPlaceOn: true, // Bridge gaps if necessary
  allowEntityDetection: true,
});
```

## Episode Flow

### Main Sequence

1. **Midpoint Calculation**: Find center point between bots
2. **Radius Determination**: Calculate orbit radius (half bot separation)
3. **Starting Position**: Determine angle based on current bot position
4. **Checkpoint Generation**: Create 8 evenly spaced positions
5. **Orbital Execution**: Visit each checkpoint with eye contact
6. **Completion**: Clean up and transition to stop phase

### Position Calculations

#### Shared Midpoint

```javascript
const sharedMidpoint = new Vec3(
  (myPosition.x + otherPosition.x) / 2,
  (myPosition.y + otherPosition.y) / 2,
  (myPosition.z + otherPosition.z) / 2,
);
```

#### Orbit Radius

```javascript
const distanceBetweenBots = myPosition.distanceTo(otherPosition);
const orbitRadius = distanceBetweenBots / 2;
```

#### Starting Angle

```javascript
const dx = myPosition.x - sharedMidpoint.x;
const dz = myPosition.z - sharedMidpoint.z;
const startAngle = Math.atan2(dz, dx);
```

## Technical Implementation

### Checkpoint Navigation

Each checkpoint involves:

1. **Ground Finding**: `land_pos(bot, rcon, checkpoint.x, checkpoint.z)`
2. **Goal Setting**: `new GoalNear(targetPos.x, targetPos.y, targetPos.z, CHECKPOINT_REACH_DISTANCE)`
3. **Navigation**: Pathfinder execution with progress monitoring
4. **Timeout Handling**: 5-second limit per checkpoint
5. **Eye Contact**: Smooth camera turn to other bot
6. **Synchronization**: 1-second eye contact duration

### Progress Monitoring

```javascript
// Monitor checkpoint approach every 100ms
while (!reached && !timedOut) {
  const distance = bot.entity.position.distanceTo(targetPos);
  if (distance <= CHECKPOINT_REACH_DISTANCE) reached = true;
  if (elapsed > CHECKPOINT_TIMEOUT_MS) timedOut = true;
  await sleep(100); // Check every 100ms
}
```

### State Management

- **Pathfinder Control**: Clear goals between checkpoints
- **Movement States**: Manual control state management
- **Camera Control**: Smooth transitions using `lookAtBot()`
- **Error Recovery**: Continue to next checkpoint on timeout

## Integration Points

### Movement System Integration

- Uses `land_pos()` for safe ground positioning
- Leverages `initializePathfinder()` for navigation
- Integrates with camera control systems

### Coordinator Integration

- Phase-based communication via `orbitPhase_${iterationID}`
- Proper stop phase transitions
- Episode recording lifecycle support

## Usage Examples

### Episode Execution

```javascript
// Episode automatically handles:
// - Circular path calculation around bot midpoint
// - Terrain-adaptive checkpoint navigation
// - Synchronized eye contact at each checkpoint
// - Timeout protection and error recovery
// - Proper cleanup and phase transitions
```

### Manual Orbit Creation

```javascript
// Generate custom orbital path
const checkpoints = calculateOrbitCheckpoints(center, radius, 12, 0);
await executeOrbitWithCheckpoints(bot, "Bravo", checkpoints, rcon);
```

## Performance Characteristics

### Resource Usage

- **CPU**: High (complex pathfinding with terrain adaptation)
- **Memory**: Moderate (checkpoint array, pathfinding state)
- **Network**: Low (coordinator messages, chunk loading)

### Timing Characteristics

- **Per Checkpoint**: 5-10 seconds (navigation + eye contact)
- **Total Episode**: ~1-2 minutes for 8 checkpoints
- **Variability**: Depends on terrain complexity and bot separation

## Testing Considerations

### Deterministic Behavior

- Midpoint calculation based on bot positions
- Angle determination from relative positioning
- Checkpoint generation using fixed algorithms

### Edge Cases

- **Unreachable Checkpoints**: Timeout handling with continuation
- **Terrain Issues**: Ground finding with chunk loading
- **Bot Separation**: Minimum distance requirements
- **Pathfinding Failures**: Graceful degradation to next checkpoint

### Debug Features

- Comprehensive checkpoint progress logging
- Distance and timing measurements
- Pathfinder state monitoring
- Camera movement tracking

## Future Enhancements

### Potential Features

- **Variable Radii**: Dynamic orbit size adjustment
- **Multi-bot Orbits**: Complex formation patterns
- **Speed Variation**: Adjustable movement speeds
- **Terrain Following**: Height-adaptive orbital paths
- **Communication Patterns**: Different eye contact sequences
