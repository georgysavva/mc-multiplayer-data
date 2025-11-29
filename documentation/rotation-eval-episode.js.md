# rotation-eval-episode.js Documentation

## Overview

`rotation-eval-episode.js` implements rotational movement evaluation episodes where bots perform controlled turning behaviors. This episode evaluates camera control, angular movement precision, and rotational awareness in social contexts.

## Class: RotationEvalEpisode (Not Exported)

The file defines phase functions for rotational evaluation but doesn't export a class.

## Configuration Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `CAMERA_SPEED_DEGREES_PER_SEC` | `30` | Smooth camera rotation speed |
| `ITERATIONS_NUM_PER_EPISODE` | `1` | Single iteration per episode |
| `MIN_ROTATION_DURATION_SEC` | `1.0` | Minimum rotation duration |
| `MAX_ROTATION_DURATION_SEC` | `1.0` | Maximum rotation duration (fixed) |
| `EPISODE_MIN_TICKS` | `300` | Minimum episode duration in ticks |

## Episode Characteristics

**Rotation Focus:**
- Controlled camera turning behaviors
- Angular movement evaluation
- Social context awareness during rotation
- Timing and precision assessment

**Key Features:**
- Smooth camera rotations using `lookSmooth()`
- Deterministic rotation patterns
- Duration management and timing
- Evaluation metadata collection

## Behavioral Patterns

### Rotation Execution
```javascript
// Calculate rotation parameters
const rotationDirection = Math.random() < 0.5 ? -1 : 1;
const rotationOffsetDeg = 90 * rotationDirection + sharedBotRng() * 45 - 22.5;

// Execute smooth rotation
await lookSmooth(bot, newYaw, originalPitch, CAMERA_SPEED_DEGREES_PER_SEC);

// Hold position and ensure timing
await bot.waitForTicks(freezeTicks);
```

### Evaluation Metadata
```javascript
episodeInstance._evalMetadata = {
  rotation_offset_deg: rotationOffsetDeg,
  rotation_direction: rotationDirection,
  camera_speed_degrees_per_sec: CAMERA_SPEED_DEGREES_PER_SEC,
  freeze_ticks: freezeTicks,
};
```

## Integration Points

### Movement System Integration
- Uses `lookSmooth()` for controlled camera movement
- Leverages `lookAtSmooth()` for initial positioning
- Integrates with `sneak()` for evaluation signaling

### Coordinator Integration
- Phase-based communication via `rotationEvalPhase_${iterationID}`
- Proper stop phase transitions
- Episode recording lifecycle support

## Usage Examples

### Episode Execution
```javascript
// Episode automatically handles:
// - Deterministic rotation pattern selection
// - Smooth camera turning behaviors
// - Timing management and duration control
// - Evaluation metadata collection
// - Proper cleanup and phase transitions
```

## Performance Characteristics

### Resource Usage
- **CPU**: Low (camera control calculations)
- **Memory**: Low (metadata storage)
- **Network**: Low (coordinator messages)

### Timing Characteristics
- **Rotation Duration**: Variable based on angle and speed
- **Freeze Period**: Configurable tick hold
- **Total Episode**: Minimum 300 ticks

## Testing Considerations

### Deterministic Behavior
- Rotation parameters based on shared RNG
- Consistent camera movement patterns
- Predictable timing sequences

### Edge Cases
- **Camera Limits**: Movement boundary handling
- **Timing Issues**: Duration management precision
- **State Conflicts**: Concurrent movement prevention

### Debug Features
- Rotation parameter logging
- Camera position tracking
- Timing verification
- Metadata validation
