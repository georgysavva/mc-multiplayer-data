# straight-line-episode.js Documentation

## Overview

`straight-line-episode.js` implements straight-line walking episodes where bots move in direct paths with periodic eye contact. This episode evaluates basic locomotion, path following, and social coordination during movement.

## Class: StraightLineEpisode (Not Exported)

The file defines phase functions for straight-line movement but doesn't export a class.

## Configuration Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `CAMERA_SPEED_DEGREES_PER_SEC` | `30` | Camera movement speed |
| `ITERATIONS_NUM_PER_EPISODE` | `1` | Single iteration per episode |
| `MIN_WALK_DURATION_SEC` | `1.0` | Minimum walking duration |
| `MAX_WALK_DURATION_SEC` | `1.0` | Maximum walking duration (fixed) |
| `EPISODE_MIN_TICKS` | `300` | Minimum episode duration in ticks |

## Episode Characteristics

**Locomotion Focus:**
- Direct path following behavior
- Periodic eye contact during movement
- Basic navigation evaluation
- Social awareness in motion

**Key Features:**
- Straight-line path execution
- Camera coordination during walking
- Timing management for evaluation
- Position-based movement patterns

## Movement Patterns

### Straight-Line Execution
```javascript
// Calculate movement parameters
const walkDirection = Math.random() < 0.5 ? -1 : 1;
const walkOffsetDeg = 90 * walkDirection + sharedBotRng() * 45 - 22.5;

// Execute walking with camera control
await executeWalkingWithEyeContact(bot, otherBotName, walkOffsetDeg, durationMs);
```

### Eye Contact Integration
- Periodic looks at other bot during movement
- Smooth camera transitions
- Timing coordination between bots

## Integration Points

### Movement System Integration
- Uses pathfinding for straight-line navigation
- Leverages `lookAtBot()` for eye contact
- Integrates with `sleep()` for timing control

### Coordinator Integration
- Phase-based communication via `straightLinePhase_${iterationID}`
- Proper stop phase transitions
- Episode recording lifecycle support

## Usage Examples

### Episode Execution
```javascript
// Episode automatically handles:
// - Straight-line path calculation and execution
// - Periodic eye contact during movement
// - Timing management and duration control
// - Proper cleanup and phase transitions
```

## Performance Characteristics

### Resource Usage
- **CPU**: Moderate (pathfinding calculations)
- **Memory**: Low (position tracking)
- **Network**: Low (coordinator messages)

### Movement Metrics
- **Path Accuracy**: Straight-line following precision
- **Eye Contact Frequency**: Periodic social interaction
- **Duration Control**: Timing management effectiveness

## Testing Considerations

### Deterministic Behavior
- Movement parameters based on shared RNG
- Path calculation consistency
- Timing sequence predictability

### Edge Cases
- **Path Obstructions**: Navigation around obstacles
- **Timing Conflicts**: Eye contact during movement
- **Distance Variations**: Variable bot separation

### Debug Features
- Path execution logging
- Eye contact timing verification
- Movement parameter tracking
