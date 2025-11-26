# random-movement.js Documentation

## Overview

`random-movement.js` provides randomized movement patterns for exploration and behavioral episodes. This module implements walk-and-return sequences with configurable camera behaviors, jump probabilities, and timeout protections to create natural, varied bot movement patterns.

## Core Functions

### walk(bot, distance, lookAway, flipCameraInReturn, args, customConstants)

Execute a single walk-and-return movement sequence.

**Parameters:**
- `distance` - Target walking distance in blocks
- `lookAway` - Whether to look away from movement direction
- `flipCameraInReturn` - Whether to flip camera 180° when returning
- `args` - Episode arguments (contains walk_timeout)
- `customConstants` - Optional constant overrides

**Movement Sequence:**

1. **Direction Selection**: Random cardinal direction (forward/back/left/right)
2. **Camera Setup**: Look away if requested (90° offset behind movement)
3. **Forward Movement**: Walk until target distance or timeout
4. **Random Jump**: 25% chance to jump before returning
5. **Return Navigation**: Walk back to starting position
6. **Camera Reset**: Return to original facing if looked away
7. **Final Jump**: 25% chance to jump after returning

### Look-Away Behavior

When `lookAway` is true:
- Calculates random angle between -90° and +90° behind current facing
- Smoothly rotates camera using `lookSmooth()`
- Maintains original pitch while adjusting yaw
- Resets camera to original position after return

### Return Strategies

**flipCameraInReturn = false (Default):**
- Uses reverse direction (forward→back, left→right)
- Natural return path following outward journey

**flipCameraInReturn = true:**
- Flips camera 180° instead of changing direction
- Creates "moonwalk" effect while facing return direction

### run(bot, actionCount, lookAway, args, customConstants)

Execute multiple random walk sequences in succession.

**Parameters:**
- `actionCount` - Number of walk sequences to perform
- `lookAway` - Whether to use look-away behavior
- `args` - Episode arguments
- `customConstants` - Optional constant overrides

**Action Pool Creation:**

**With lookAway:**
- Action 1: Walk with camera flip on return
- Action 2: Walk with normal direction reversal

**Without lookAway:**
- Single action: Walk with normal direction reversal

**Execution Flow:**
1. Random delay before each action (0.2-0.5 seconds)
2. Random action selection from pool
3. Execute walk sequence with error handling
4. Cleanup with `stopAll()` after each action

## Configuration and Constants

### Default Constants (from constants.js)
```javascript
MIN_WALK_DISTANCE: 3,      // Minimum walk distance
MAX_WALK_DISTANCE: 4,      // Maximum walk distance
JUMP_PROBABILITY: 0.25,    // 25% chance for jumps
MIN_JUMP_DURATION_SEC: 1,  // Minimum jump duration
MAX_JUMP_DURATION_SEC: 3,  // Maximum jump duration
MIN_SLEEP_BETWEEN_ACTIONS_SEC: 0.2,  // Min delay between actions
MAX_SLEEP_BETWEEN_ACTIONS_SEC: 0.5,  // Max delay between actions
```

### Custom Constants Override
```javascript
const customConstants = {
  JUMP_PROBABILITY: 0.5,           // 50% jump chance
  MIN_WALK_DISTANCE: 5,            // Longer walks
  MAX_WALK_DISTANCE: 8
};
```

## Technical Implementation

### Movement Control
- Uses manual control states (`setControlState`) for precise movement
- Distance tracking via `position.distanceTo(startPos)`
- Timeout protection prevents infinite movement
- 50ms position polling for responsive distance checking

### Camera Manipulation
- Preserves original yaw/pitch for reset capability
- Calculates "behind" angles using 180° + random offset
- Smooth camera transitions using movement utilities
- Handles both look-away and return scenarios

### Jump Integration
- Random jump timing using configured probability
- Variable jump durations for natural variation
- Strategic placement: before return and after arrival
- Uses dedicated `jump()` function for consistent behavior

### Error Handling
- Timeout protection for both forward and return movement
- Try/finally blocks ensure control state cleanup
- Distance calculation error resilience
- Logging for debugging movement issues

## Integration Points

### Episode System Integration
- Used in exploration and behavioral episodes
- Supports look-away evaluation episodes
- Provides timeout-based episode safety
- Integrates with camera control systems

### Constants System Integration
- Uses centralized movement parameters
- Supports per-episode customization
- Maintains behavioral consistency
- Enables easy parameter tuning

### Movement System Integration
- Leverages `lookSmooth()` for camera control
- Uses `jump()` for standardized jumping
- Implements `stopAll()` for cleanup
- Compatible with pathfinding systems

## Usage Examples

### Basic Random Walk
```javascript
const { walk } = require('./utils/random-movement');

// Simple walk and return
await walk(bot, 5.0, false, false, { walk_timeout: 30 });
```

### Look-Away Behavior
```javascript
// Walk while looking away, flip camera on return
await walk(bot, 4.0, true, true, { walk_timeout: 25 });
```

### Multiple Actions
```javascript
const { run } = require('./utils/random-movement');

// Run 5 random walk sequences with look-away
await run(bot, 5, true, { walk_timeout: 30 });
```

### Custom Parameters
```javascript
const customParams = {
  JUMP_PROBABILITY: 0.1,      // Less jumping
  MIN_WALK_DISTANCE: 2,       // Shorter walks
  MAX_WALK_DISTANCE: 3
};

await run(bot, 3, false, { walk_timeout: 20 }, customParams);
```

## Behavioral Patterns

### Exploration Behavior
- Random directional choices create natural exploration
- Distance limits prevent excessive wandering
- Timeout protection handles stuck situations
- Return-to-start ensures episode completion

### Social Evaluation
- Look-away option supports attention studies
- Camera flipping enables directional analysis
- Jump variations add behavioral richness
- Timing controls support synchronization

### Safety Features
- Position tracking prevents infinite loops
- Timeout mechanisms handle navigation failures
- Control state cleanup prevents stuck states
- Error logging aids debugging

## Performance Characteristics

### Resource Usage
- **CPU**: Moderate (distance calculations, position polling)
- **Memory**: Low (position tracking, minimal state)
- **Network**: None (local movement control)

### Timing Characteristics
- **Walk Duration**: Variable based on distance/terrain
- **Return Time**: Dependent on outward journey
- **Action Delays**: 200-500ms between sequences
- **Camera Movement**: Smooth transitions (configurable speed)

## Testing Considerations

### Deterministic Testing
- Random elements make testing challenging
- Consider seeding RNG for reproducible runs
- Test timeout scenarios explicitly
- Verify position accuracy after movements

### Edge Cases
- **Timeout Conditions**: Stuck terrain, obstacles
- **Camera Limits**: Extreme angle scenarios
- **Jump Timing**: Movement interruption handling
- **Distance Calculation**: Position tracking accuracy

### Debug Features
- Comprehensive logging of movement phases
- Distance and timing measurements
- Camera angle tracking
- Error condition reporting

## Future Enhancements

### Potential Features
- **Terrain Awareness**: Obstacle avoidance in random walks
- **Goal-Oriented Movement**: Target-based random exploration
- **Complex Behaviors**: Multi-stage movement patterns
- **Social Coordination**: Inter-bot movement synchronization
- **Dynamic Parameters**: Runtime behavior adjustment
