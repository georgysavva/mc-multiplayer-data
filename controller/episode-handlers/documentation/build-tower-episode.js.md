# build-tower-episode.js Documentation

## Overview

`build-tower-episode.js` implements individual tower building where each bot constructs their own tower using the classic Minecraft "pillar jumping" technique. This episode focuses on independent construction without requiring bot coordination.

## Class: BuildTowerEpisode

### Static Properties

| Property                  | Value  | Description                   |
| ------------------------- | ------ | ----------------------------- |
| `INIT_MIN_BOTS_DISTANCE`  | `8`    | Minimum distance between bots |
| `INIT_MAX_BOTS_DISTANCE`  | `15`   | Maximum distance between bots |
| `WORKS_IN_NON_FLAT_WORLD` | `true` | Supports non-flat worlds      |

## Episode Characteristics

### Individual Construction

- Each bot builds independently
- No coordination required between bots
- Deterministic but separate tower construction

### Pillar Jumping Technique

The episode uses the classic Minecraft tower building method:

1. Place block at feet level
2. Jump multiple times to reach new height
3. Repeat until desired tower height
4. Each bot ends at the top of their tower

## Configuration Constants

| Constant                 | Value          | Description                          |
| ------------------------ | -------------- | ------------------------------------ |
| `MIN_TOWER_HEIGHT`       | `8`            | Minimum tower height in blocks       |
| `MAX_TOWER_HEIGHT`       | `12`           | Maximum tower height in blocks       |
| `TOWER_BLOCK_TYPE`       | `"oak_planks"` | Block type used for towers           |
| `INITIAL_EYE_CONTACT_MS` | `1500`         | Initial eye contact duration         |
| `FINAL_EYE_CONTACT_MS`   | `1500`         | Final eye contact duration           |
| `JUMP_DURATION_MS`       | `50`           | How long to hold jump button         |
| `PLACE_RETRY_DELAY_MS`   | `20`           | Delay between place attempts         |
| `MAX_PLACE_ATTEMPTS`     | `10`           | Maximum placement attempts per block |
| `SETTLE_DELAY_MS`        | `200`          | Delay to settle after placing        |

## Episode Flow

### Main Sequence

1. **Step 1**: Bots spawn (handled by teleport phase)
2. **Step 2**: Initial eye contact (1.5s)
3. **Step 3**: Prepare to place blocks
4. **Step 4**: Determine random tower height (8-12 blocks)
5. **Step 5**: Build tower using pillar jumping
6. **Step 6**: Final eye contact (1.5s)
7. **Step 7**: Transition to stop phase

### Tower Building Algorithm

```javascript
// Main building loop
for (let i = 0; i < towerHeight; i++) {
  // Get ground block below bot
  const groundBlock = bot.blockAt(groundPos);

  // Jump and spam placement attempts
  bot.setControlState("jump", true);
  for (let attempt = 1; attempt <= MAX_PLACE_ATTEMPTS; attempt++) {
    fastPlaceBlock(bot, groundBlock);
    await sleep(PLACE_RETRY_DELAY_MS);
  }
  bot.setControlState("jump", false);

  // Settle and verify height gain
  await sleep(SETTLE_DELAY_MS);
}
```

## Key Functions

### getOnBuildTowerPhaseFn()

Main phase handler for tower building episodes.

**Parameters:**

- `bot` - Mineflayer bot instance
- `rcon` - RCON connection
- `sharedBotRng` - Shared random number generator
- `coordinator` - Bot coordinator
- `iterationID` - Current iteration ID
- `episodeNum` - Episode number
- `episodeInstance` - Episode instance
- `args` - Configuration arguments

**Returns:** Phase handler function

### buildTowerUnderneath() - Core Building Logic

**Parameters:**

- `bot` - Mineflayer bot instance
- `towerHeight` - Desired tower height
- `args` - Configuration arguments
- `options` - Building options

**Options:**

```javascript
{
  blockType: "oak_planks",        // Block type to place
  enableRetry: true,              // Enable retry logic
  breakOnFailure: false,          // Stop on first failure
  maxPlaceAttempts: 10,           // Max attempts per block
  settleDelayMs: 200,             // Settle delay
  jumpDurationMs: 50,             // Jump duration
  placeRetryDelayMs: 20           // Retry delay
}
```

**Algorithm:**

1. Ensure correct block is equipped
2. Look down once for consistent camera angle
3. Build tower block by block using pillar jumping
4. Verify height gain after each block
5. Retry failed blocks if enabled
6. Track and return success/failure statistics

### generateTowerPositions() - Legacy Function

Creates vertical tower positions (not used in current implementation).

**Parameters:**

- `basePos` - Base position
- `height` - Tower height

**Returns:** Array of Vec3 positions

## Dependencies

### Required Imports

- `ensureItemInHand, buildTowerUnderneath, fastPlaceBlock` from `./builder`
- `initializePathfinder, stopPathfinder` from `../utils/movement`
- `BaseEpisode` from `./base-episode`
- `ensureBotHasEnough` from `../utils/items`

## Integration Points

### Builder System Integration

- Uses `buildTowerUnderneath()` for core building logic
- Leverages `fastPlaceBlock()` for spam placement during jumps
- Integrates with inventory management systems

### Coordinator Integration

- Phase-based communication via `buildTowerPhase_${iterationID}`
- Proper stop phase transitions
- Episode recording lifecycle support

## Usage Examples

### Episode Execution

```javascript
// Episode automatically handles:
// - Random height selection (8-12 blocks)
// - Independent tower construction for each bot
// - Pillar jumping technique implementation
// - Height verification and retry logic
// - Proper cleanup and phase transitions
```

### Manual Tower Building

```javascript
// Direct usage of buildTowerUnderneath
const result = await buildTowerUnderneath(bot, 10, args, {
  blockType: "oak_planks",
  enableRetry: true,
  breakOnFailure: false,
});

console.log(`Built ${result.success}/${10} blocks`);
```

## Technical Details

### Pillar Jumping Implementation

The classic Minecraft tower building technique:

1. **Block Placement**: Place block directly below current position
2. **Jump Initiation**: Start jumping while placing
3. **Spam Placement**: Rapid-fire placement attempts during jump
4. **Height Verification**: Check if bot reached new level
5. **Retry Logic**: Retry failed blocks up to limit

### Camera Control

- **Initial Setup**: Look down once (-1.45 radians pitch)
- **Consistency**: Maintains same camera angle throughout building
- **No Dynamic Look**: Camera stays fixed during construction

### Error Handling

- **Height Verification**: Checks actual height gain after each block
- **Retry Mechanism**: Retries failed blocks with fresh ground detection
- **Failure Handling**: Configurable break-on-failure behavior
- **State Tracking**: Comprehensive success/failure statistics

## Testing Considerations

### Deterministic Behavior

- Random height selection uses shared RNG
- Position calculations relative to spawn location
- Consistent camera angles for reproducible results

### Performance Characteristics

- Fast placement via `fastPlaceBlock()` (no delays)
- Minimal pathfinding usage (direct placement)
- Memory efficient (no complex state tracking)

### Edge Cases

- **Ground Detection**: Handles various block types as valid ground
- **Height Limits**: Respects world height limits
- **Inventory Management**: Ensures sufficient block supply
- **Bot State**: Handles various bot positions and orientations

## Differences from Other Building Episodes

| Aspect       | Build Tower    | Build Structure | Build House      |
| ------------ | -------------- | --------------- | ---------------- |
| Coordination | None           | Role-based      | Work division    |
| Technique    | Pillar jumping | Block placement | Block placement  |
| Structure    | Single column  | Various shapes  | Complex building |
| Pathfinding  | Minimal        | Moderate        | Extensive        |
| Complexity   | Low            | Medium          | High             |
