# translation-eval-episode.js Documentation

## Overview

`translation-eval-episode.js` implements translational movement evaluation episodes where bots perform controlled positional movements. This episode evaluates locomotion precision, spatial awareness, and movement coordination in social contexts.

## Class: TranslationEvalEpisode (Not Exported)

The file defines phase functions for translational evaluation but doesn't export a class.

## Configuration Constants

| Constant                       | Value | Description                       |
| ------------------------------ | ----- | --------------------------------- |
| `CAMERA_SPEED_DEGREES_PER_SEC` | `30`  | Camera movement speed             |
| `ITERATIONS_NUM_PER_EPISODE`   | `1`   | Single iteration per episode      |
| `MIN_TRANSLATION_DURATION_SEC` | `1.0` | Minimum movement duration         |
| `MAX_TRANSLATION_DURATION_SEC` | `1.0` | Maximum movement duration (fixed) |
| `EPISODE_MIN_TICKS`            | `300` | Minimum episode duration in ticks |

## Episode Characteristics

**Movement Focus:**

- Controlled positional translation
- Spatial movement evaluation
- Coordination during locomotion
- Movement precision assessment

**Key Features:**

- Directional movement patterns
- Position-based evaluation
- Timing and distance control
- Translational awareness testing

## Movement Patterns

### Translation Execution

```javascript
// Calculate movement parameters
const translationDirection = Math.random() < 0.5 ? -1 : 1;
const translationOffsetDeg =
  90 * translationDirection + sharedBotRng() * 45 - 22.5;

// Execute translational movement
await executeTranslationWithCoordination(
  bot,
  otherBotName,
  translationOffsetDeg,
  durationMs,
);
```

### Coordination Elements

- Position synchronization during movement
- Distance maintenance awareness
- Timing coordination between bots

## Integration Points

### Movement System Integration

- Uses pathfinding for controlled movement
- Leverages position tracking systems
- Integrates with `lookAtBot()` for coordination

### Coordinator Integration

- Phase-based communication via `translationEvalPhase_${iterationID}`
- Proper stop phase transitions
- Episode recording lifecycle support

## Usage Examples

### Episode Execution

```javascript
// Episode automatically handles:
// - Translational movement pattern execution
// - Position coordination between bots
// - Timing management and duration control
// - Movement precision evaluation
```

## Performance Characteristics

### Resource Usage

- **CPU**: Moderate (movement calculations, pathfinding)
- **Memory**: Low (position tracking)
- **Network**: Low (coordinator messages)

### Movement Metrics

- **Translation Accuracy**: Position change precision
- **Coordination Quality**: Inter-bot synchronization
- **Duration Control**: Timing management effectiveness

## Testing Considerations

### Deterministic Behavior

- Movement parameters based on shared RNG
- Position calculation consistency
- Coordination timing predictability

### Edge Cases

- **Movement Obstructions**: Navigation around obstacles
- **Distance Variations**: Variable bot separation effects
- **Timing Coordination**: Synchronization precision

### Debug Features

- Movement parameter logging
- Position tracking verification
- Coordination timing monitoring
