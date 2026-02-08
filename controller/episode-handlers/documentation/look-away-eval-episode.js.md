# look-away-eval-episode.js Documentation

## Overview

`look-away-eval-episode.js` implements an evaluation episode focused on testing attention mechanisms and social cues. Bots perform coordinated look-away behaviors where one or both bots temporarily break eye contact, then look back at each other. This episode evaluates how well AI systems can interpret and respond to changes in visual attention.

## Class: LookAwayEvalEpisode

### Static Properties

| Property                  | Value  | Description                                  |
| ------------------------- | ------ | -------------------------------------------- |
| `WORKS_IN_NON_FLAT_WORLD` | `true` | Supports non-flat world terrain              |
| `INIT_MIN_BOTS_DISTANCE`  | `10`   | Minimum distance between bots (10-12 blocks) |
| `INIT_MAX_BOTS_DISTANCE`  | `12`   | Maximum distance between bots (10-12 blocks) |

### Episode Characteristics

**Evaluation Focus:**

- Tests visual attention mechanisms
- Evaluates response to broken eye contact
- Measures social cue interpretation
- Assesses gaze following behaviors

**Behavioral Patterns:**

- **lower_name_looks_away**: Bot with lexicographically lower name looks away
- **bigger_name_looks_away**: Bot with lexicographically higher name looks away
- **both_look_away**: Both bots simultaneously look away

## Configuration Constants

| Constant                       | Value | Description                               |
| ------------------------------ | ----- | ----------------------------------------- |
| `CAMERA_SPEED_DEGREES_PER_SEC` | `30`  | Smooth camera movement speed              |
| `ITERATIONS_NUM_PER_EPISODE`   | `1`   | Single iteration per episode              |
| `MIN_LOOK_AWAY_DURATION_SEC`   | `1.0` | Minimum look-away duration                |
| `MAX_LOOK_AWAY_DURATION_SEC`   | `1.0` | Maximum look-away duration (fixed at 1.0) |
| `EPISODE_MIN_TICKS`            | `300` | Minimum episode duration in ticks         |

## Look-Away Behavior

### Mode Selection

Episodes cycle through three modes deterministically based on episode number:

```javascript
const selectedMode = walkingModes[episodeNum % 3];
```

### Look-Away Execution

#### Direction Calculation

```javascript
// Random left/right direction with offset
const lookAwayDirection = Math.random() < 0.5 ? -1 : 1;
const lookAwayOffsetDeg = 90 * lookAwayDirection + sharedBotRng() * 45 - 22.5;
```

#### Camera Movement

1. **Initial Look**: Smooth camera turn to face other bot
2. **Sneak Signal**: Brief sneak to signal evaluation start
3. **Look Away**: Rotate camera by calculated offset (90° ± 22.5°)
4. **Freeze**: Hold position for 20 ticks
5. **Look Back**: Return to original facing direction
6. **Duration Padding**: Ensure minimum episode length

### Evaluation Metadata

```javascript
episodeInstance._evalMetadata = {
  bots_chosen: botsChosen,
  mode: selectedMode,
  camera_speed_degrees_per_sec: CAMERA_SPEED_DEGREES_PER_SEC,
  look_away_offset_deg: lookAwayOffsetDeg,
  look_away_direction: lookAwayDirection,
  freeze_ticks: freezeTicks,
};
```

## Episode Flow

### Main Sequence

1. **Mode Selection**: Choose look-away pattern based on episode number
2. **Role Assignment**: Determine which bot(s) will look away
3. **Initial Eye Contact**: Both bots look at each other
4. **Look-Away Execution**: Designated bot(s) perform look-away behavior
5. **Duration Management**: Ensure minimum episode length
6. **Iteration Handling**: Support for multiple iterations (currently 1)
7. **Stop Phase**: Transition to episode completion

### Behavioral Patterns

#### Single Bot Look-Away

- One bot maintains eye contact
- Other bot performs look-away sequence
- Clear role differentiation for evaluation

#### Simultaneous Look-Away

- Both bots perform identical look-away sequence
- Tests mutual attention breaking
- Evaluates synchronized behavior

## Dependencies

### Required Imports

- `lookAtSmooth, lookSmooth, sneak` from `../utils/movement`
- `sleep` from `../utils/helpers`
- `BaseEpisode` from `./base-episode`

## Integration Points

### Coordinator Integration

- Phase-based communication via `lookAwayPhase_${iterationID}`
- Proper stop phase transitions
- Episode recording lifecycle support

### Evaluation Framework

- Metadata collection for analysis
- Deterministic mode cycling
- Performance timing and duration management

## Usage Examples

### Episode Execution

```javascript
// Episode automatically handles:
// - Deterministic mode selection (cycles through 3 patterns)
// - Role assignment based on bot names and selected mode
// - Smooth camera movements and look-away behaviors
// - Duration management and evaluation metadata collection
// - Proper cleanup and phase transitions
```

### Mode Behavior Examples

```javascript
// Episode 0: lower_name_looks_away (e.g., Alpha looks away)
// Episode 1: bigger_name_looks_away (e.g., Bravo looks away)
// Episode 2: both_look_away (both bots look away)
// Episode 3: lower_name_looks_away (cycle repeats)
```

## Technical Implementation

### Camera Control

- **lookAtSmooth**: Initial eye contact establishment
- **lookSmooth**: Precise angular camera movements
- **sneak**: Visual signal for evaluation start

### Timing Management

- **Freeze Period**: 20 ticks to hold look-away position
- **Duration Padding**: Ensures minimum episode length
- **Smooth Transitions**: Controlled camera movement speeds

### Deterministic Behavior

- **Mode Cycling**: Episode number modulo 3
- **Offset Calculation**: Shared RNG for consistent angles
- **Role Assignment**: Lexicographic bot name comparison

## Testing Considerations

### Deterministic Reproduction

- Episode number determines behavior pattern
- Shared RNG ensures consistent camera angles
- Bot name comparison for role assignment

### Edge Cases

- **Single Bot Scenarios**: One bot disconnected/unavailable
- **Timing Variations**: Different tick rates affecting duration
- **Camera Constraints**: Movement limitations and precision

### Performance Metrics

- **Camera Movement Accuracy**: Angular precision
- **Timing Consistency**: Duration management
- **Synchronization**: Multi-bot coordination

## Future Enhancements

### Potential Features

- **Variable Durations**: Configurable look-away times
- **Complex Patterns**: Multi-stage attention shifts
- **Distance Effects**: Attention based on proximity
- **Object Tracking**: Look-away from objects vs bots
- **Emotional Context**: Different attention patterns
