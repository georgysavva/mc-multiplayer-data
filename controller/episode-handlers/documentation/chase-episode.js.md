# chase-episode.js Documentation

## Overview

`chase-episode.js` implements intelligent chase and evade behaviors where one bot pursues a fleeing bot. This episode demonstrates advanced pathfinding usage, role assignment, and dynamic movement coordination for realistic predator-prey scenarios.

## Class: ChaseEpisode

### Static Properties

| Property                  | Value  | Description                     |
| ------------------------- | ------ | ------------------------------- |
| `WORKS_IN_NON_FLAT_WORLD` | `true` | Supports non-flat world terrain |

### Constructor

Standard BaseEpisode constructor with no additional initialization.

## Behavior Roles

### Chaser Role

**Responsibilities:**

- Pursue the runner using intelligent pathfinding
- Maintain optimal chase distance
- Update camera to track runner
- Use GoalNear for dynamic following

### Runner Role

**Responsibilities:**

- Flee directly away from chaser
- Choose deterministic escape destination
- Use pathfinding for efficient escape
- Set single GoalNear for entire chase duration

## Configuration Constants

| Constant                      | Value   | Description                          |
| ----------------------------- | ------- | ------------------------------------ |
| `CHASE_DURATION_MS_MIN`       | `5000`  | Minimum chase duration (5 seconds)   |
| `CHASE_DURATION_MS_MAX`       | `15000` | Maximum chase duration (15 seconds)  |
| `POSITION_UPDATE_INTERVAL_MS` | `500`   | Position update frequency            |
| `MIN_CHASE_DISTANCE`          | `3.0`   | Minimum distance chaser maintains    |
| `ESCAPE_DISTANCE`             | `8.0`   | Distance triggering direction change |
| `DIRECTION_CHANGE_INTERVAL`   | `4000`  | Direction change frequency (legacy)  |
| `CAMERA_SPEED`                | `90`    | Camera movement speed (degrees/sec)  |

## Core Functions

### chaseRunner(bot, coordinator, otherBotName, episodeNum, chaseDurationMs)

Implements intelligent chasing behavior using pure pathfinder.

**Parameters:**

- `bot` - Mineflayer bot instance (chaser)
- `coordinator` - Bot coordinator
- `otherBotName` - Runner bot name
- `episodeNum` - Current episode number
- `chaseDurationMs` - Duration to chase

**Algorithm:**

1. **Pathfinder Setup**: Initialize with sprinting, parkour, digging enabled
2. **Main Loop**: While chase duration not exceeded:
   - Get runner position
   - Update camera every 2 seconds
   - Update pathfinder goal every second based on distance
   - Maintain minimum chase distance
3. **Cleanup**: Clear goals, stop movement

**Key Features:**

- **Dynamic Goals**: Updates GoalNear based on runner position
- **Distance Management**: Stops pathfinding when too close
- **Camera Tracking**: Periodic looks at runner for realism
- **Performance**: 1-second goal updates, 2-second camera updates

### runFromChaser(bot, coordinator, otherBotName, episodeNum, chaseDurationMs)

Implements strategic escape behavior with deterministic pathfinding.

**Parameters:**

- `bot` - Mineflayer bot instance (runner)
- `coordinator` - Bot coordinator
- `otherBotName` - Chaser bot name
- `episodeNum` - Current episode number
- `chaseDurationMs` - Duration to run

**Algorithm:**

1. **Pathfinder Setup**: Initialize with full capabilities (sprinting, parkour, digging, placing)
2. **Destination Calculation**:
   - Get chaser position (fallback to own position)
   - Calculate direction directly away from chaser
   - Choose escape distance (100 blocks)
   - Set single GoalNear for entire chase
3. **Execution**: Let pathfinding handle movement for duration
4. **Cleanup**: Clear goals

**Key Features:**

- **Deterministic Escape**: Always runs directly away from chaser
- **Single Goal**: Sets one GoalNear for entire chase duration
- **Full Capabilities**: Can dig through obstacles, place blocks to bridge
- **Efficiency**: Minimal CPU usage after initial goal setting

## Episode Flow

### Main Sequence

1. **Step 1**: Bots spawn (teleport phase)
2. **Step 2**: Initial eye contact (1.5s)
3. **Step 3**: Role assignment using decidePrimaryBot()
4. **Step 4**: Random chase duration selection
5. **Step 5**: Execute chase/evade behavior based on role
6. **Step 6**: Transition to stop phase

### Role Assignment

```javascript
// Uses shared RNG for deterministic role assignment
const isChaser = decidePrimaryBot(bot, sharedBotRng, args);
console.log(`I am the ${isChaser ? "🏃 CHASER" : "🏃‍♂️ RUNNER"}`);
```

## Pathfinder Integration

### Chaser Configuration

```javascript
initializePathfinder(bot, {
  allowSprinting: true, // Fast pursuit
  allowParkour: true, // Jump over obstacles
  canDig: true, // Clear path if needed
  allowEntityDetection: true,
});
```

### Runner Configuration

```javascript
initializePathfinder(bot, {
  allowSprinting: true, // Fast escape
  allowParkour: true, // Navigate terrain
  canDig: true, // Break through blocks
  canPlaceOn: true, // Bridge gaps if needed
  allowEntityDetection: true,
});
```

## Technical Implementation

### Distance-Based Goal Updates

```javascript
// Chaser updates goal based on distance to runner
if (distance > MIN_CHASE_DISTANCE) {
  bot.pathfinder.setGoal(new GoalNear(targetPos, MIN_CHASE_DISTANCE));
} else {
  bot.pathfinder.setGoal(null); // Too close, stop
}
```

### Deterministic Escape Calculation

```javascript
// Calculate direction away from chaser
const dx = currentPos.x - chaserPos.x;
const dz = currentPos.z - chaserPos.z;
const distance = Math.sqrt(dx * dx + dz * dz);

// Normalize direction
const normalizedDx = dx / distance;
const normalizedDz = dz / distance;

// Set escape destination
const escapeX = currentPos.x + normalizedDx * escapeDistance;
const escapeZ = currentPos.z + normalizedDz * escapeDistance;
```

### Camera Management

```javascript
// Periodic camera updates for chaser
if (now - lastCameraUpdate > 2000) {
  await lookAtBot(bot, otherBotName, CAMERA_SPEED);
  lastCameraUpdate = now;
}
```

## Error Handling

### Runner Position Validation

- Checks if runner bot exists and is visible
- Falls back gracefully if runner not found
- Stops chase and continues to completion

### Pathfinder State Management

- Proper goal clearing in finally blocks
- Movement stopping to prevent continuation
- State cleanup for next episode

## Dependencies

### Required Imports

- `Movements, GoalNear, GoalFollow` from `../utils/bot-factory`
- `lookAtBot, sleep, horizontalDistanceTo, stopAll, initializePathfinder, stopPathfinder` from `../primitives/movement`
- `BaseEpisode` from `./base-episode`
- `decidePrimaryBot` from `../utils/coordination`

## Integration Points

### Coordinator Integration

- Phase-based communication via `chasePhase_${iterationID}`
- Proper stop phase transitions
- Episode recording lifecycle support

### RNG Integration

- Uses shared RNG for role assignment
- Deterministic chase duration selection
- Consistent behavior across runs

## Usage Examples

### Episode Execution

```javascript
// Episode automatically handles:
// - Role assignment (chaser vs runner)
// - Random duration selection (5-15 seconds)
// - Intelligent pathfinding for both roles
// - Camera tracking for chaser
// - Proper cleanup and phase transitions
```

### Manual Chase Setup

```javascript
// Direct usage for custom scenarios
await chaseRunner(bot, coordinator, "Bravo", 0, 10000);
// Chases Bravo for 10 seconds with intelligent pathfinding
```

## Performance Characteristics

### CPU Usage

- **Chaser**: Moderate (goal updates every second, camera every 2 seconds)
- **Runner**: Low (single goal setting, passive pathfinding)
- **Overall**: Efficient for real-time gameplay

### Memory Usage

- Minimal state tracking
- Pathfinder goal management
- No complex data structures

### Network Usage

- Position updates every 500ms
- Coordinator message passing
- Camera synchronization

## Testing Considerations

### Deterministic Behavior

- Role assignment based on shared RNG
- Consistent escape direction calculations
- Predictable chase duration selection

### Edge Cases

- **Runner Disappears**: Graceful handling when runner goes out of sight
- **Pathfinding Blocks**: Chaser can dig through obstacles
- **Distance Issues**: Proper distance maintenance logic
- **Timing**: Chase duration enforcement

### Debug Features

- Comprehensive logging of distances and goals
- Camera angle tracking
- Pathfinder state monitoring
- Performance timing

## Differences from Other Episodes

| Aspect       | Chase Episode    | Build Episodes  | Collector Episode |
| ------------ | ---------------- | --------------- | ----------------- |
| Coordination | Role-based       | Work division   | Leader-follower   |
| Movement     | Dynamic          | Static building | Mining patterns   |
| Pathfinding  | Heavy usage      | Moderate        | Task-based        |
| Duration     | Variable (5-15s) | Fixed phases    | Multiple cycles   |
| Complexity   | Medium           | High            | High              |

## Future Enhancements

### Potential Features

- **Multiple Chasers**: Multi-bot pursuit scenarios
- **Terrain Adaptation**: Smarter pathfinding around obstacles
- **Strategy Variation**: Different chase/evade patterns
- **Difficulty Levels**: Adjustable AI complexity
- **Multi-stage Chases**: Changing dynamics over time
