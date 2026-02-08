# walk-look-episode.js Documentation

## Overview

`walk-look-episode.js` implements walking episodes with maintained eye contact where bots walk while continuously looking at each other. This episode evaluates social navigation, coordination during movement, and sustained attention patterns.

## Class: WalkLookEpisode (Not Exported)

The file defines phase functions for walking with eye contact but doesn't export a class.

## Configuration Constants

| Constant                       | Value | Description                       |
| ------------------------------ | ----- | --------------------------------- |
| `CAMERA_SPEED_DEGREES_PER_SEC` | `30`  | Camera movement speed             |
| `ITERATIONS_NUM_PER_EPISODE`   | `1`   | Single iteration per episode      |
| `MIN_WALK_LOOK_DURATION_SEC`   | `1.0` | Minimum episode duration          |
| `MAX_WALK_LOOK_DURATION_SEC`   | `1.0` | Maximum episode duration (fixed)  |
| `EPISODE_MIN_TICKS`            | `300` | Minimum episode duration in ticks |

## Episode Characteristics

**Social Navigation Focus:**

- Walking while maintaining eye contact
- Social coordination during locomotion
- Sustained attention evaluation
- Movement-awareness interaction

**Key Features:**

- Continuous eye contact during walking
- Social navigation coordination
- Attention maintenance evaluation
- Movement-synchronized interaction

## Behavioral Patterns

### Walking with Eye Contact

```javascript
// Execute walking while maintaining attention
await executeWalkingWithEyeContact(bot, otherBotName, walkParams, durationMs);

// Includes:
// - Continuous forward movement
// - Sustained eye contact maintenance
// - Camera tracking during locomotion
// - Social navigation coordination
```

### Social Dynamics

- **Mutual Awareness**: Continuous visual connection
- **Coordination**: Movement synchronization
- **Attention Maintenance**: Sustained engagement
- **Spatial Awareness**: Position-based interaction

## Integration Points

### Movement System Integration

- Uses walking pathfinding systems
- Leverages `lookAtBot()` for continuous tracking
- Integrates with `sleep()` for timing control

### Coordinator Integration

- Phase-based communication via `walkLookPhase_${iterationID}`
- Proper stop phase transitions
- Episode recording lifecycle support

## Usage Examples

### Episode Execution

```javascript
// Episode automatically handles:
// - Walking movement with continuous eye contact
// - Social navigation coordination
// - Sustained attention pattern evaluation
// - Timing management and duration control
```

## Performance Characteristics

### Resource Usage

- **CPU**: Moderate (movement + continuous camera tracking)
- **Memory**: Low (attention state tracking)
- **Network**: Low (coordinator messages)

### Behavioral Metrics

- **Eye Contact Maintenance**: Attention continuity during movement
- **Navigation Coordination**: Social movement synchronization
- **Attention Stability**: Sustained engagement quality

## Testing Considerations

### Deterministic Behavior

- Movement parameters based on shared RNG
- Attention maintenance consistency
- Coordination timing predictability

### Edge Cases

- **Attention Maintenance**: Camera tracking during movement
- **Coordination Challenges**: Movement synchronization
- **Distance Effects**: Eye contact quality at varying distances

### Debug Features

- Eye contact status logging
- Movement synchronization verification
- Attention continuity monitoring
- Coordination quality assessment
