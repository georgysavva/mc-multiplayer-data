# walk-look-away-episode.js Documentation

## Overview

`walk-look-away-episode.js` implements walking episodes with look-away behaviors where bots walk while periodically breaking eye contact. This episode evaluates attention management during locomotion and social disengagement patterns.

## Class: WalkLookAwayEpisode (Not Exported)

The file defines phase functions for walking with look-away behavior but doesn't export a class.

## Configuration Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `CAMERA_SPEED_DEGREES_PER_SEC` | `30` | Camera movement speed |
| `ITERATIONS_NUM_PER_EPISODE` | `1` | Single iteration per episode |
| `MIN_WALK_LOOK_AWAY_DURATION_SEC` | `1.0` | Minimum episode duration |
| `MAX_WALK_LOOK_AWAY_DURATION_SEC` | `1.0` | Maximum episode duration (fixed) |
| `EPISODE_MIN_TICKS` | `300` | Minimum episode duration in ticks |

## Episode Characteristics

**Attention Management Focus:**
- Walking with periodic eye contact breaking
- Social disengagement during movement
- Attention shifting evaluation
- Locomotion-awareness coordination

**Key Features:**
- Combined walking and looking behaviors
- Attention pattern evaluation
- Movement continuity during disengagement
- Social cue management

## Behavioral Patterns

### Walking with Look-Away
```javascript
// Execute walking while managing attention
await executeWalkingWithLookAway(bot, otherBotName, walkParams, durationMs);

// Includes:
// - Forward movement maintenance
// - Periodic attention disengagement
// - Camera control during locomotion
// - Social cue timing management
```

### Attention Dynamics
- **Engagement Periods**: Normal eye contact phases
- **Disengagement Periods**: Look-away intervals
- **Transition Management**: Smooth attention shifts
- **Context Awareness**: Movement-based attention modulation

## Integration Points

### Movement System Integration
- Uses walking pathfinding systems
- Leverages `lookAtBot()` for attention management
- Integrates with `sleep()` for timing control

### Coordinator Integration
- Phase-based communication via `walkLookAwayPhase_${iterationID}`
- Proper stop phase transitions
- Episode recording lifecycle support

## Usage Examples

### Episode Execution
```javascript
// Episode automatically handles:
// - Walking movement with attention management
// - Periodic look-away behavior during locomotion
// - Social disengagement pattern evaluation
// - Timing coordination and duration control
```

## Performance Characteristics

### Resource Usage
- **CPU**: Moderate (movement + camera coordination)
- **Memory**: Low (attention state tracking)
- **Network**: Low (coordinator messages)

### Behavioral Metrics
- **Walking Continuity**: Movement smoothness during attention shifts
- **Attention Patterns**: Look-away frequency and duration
- **Social Coordination**: Disengagement timing precision

## Testing Considerations

### Deterministic Behavior
- Attention parameters based on shared RNG
- Movement pattern consistency
- Timing sequence predictability

### Edge Cases
- **Attention Conflicts**: Movement disruption during look-away
- **Timing Coordination**: Disengagement period management
- **Context Switching**: Smooth transitions between states

### Debug Features
- Attention state logging
- Movement continuity verification
- Timing coordination monitoring
- Behavioral pattern tracking
