# Tower-Bridge Episode Handler

## Overview
The `tower-bridge-episode.js` handler implements a spectacular episode where two bots build towers underneath themselves, then construct bridges towards each other from the top of their towers, meeting in the middle high above the ground.

## Episode Flow

### Step 1: Bots Spawn In
- Bots are teleported to their starting positions (handled by teleport phase)
- Recording stabilization delay of 500ms

### Step 2: Initial Eye Contact
- Both bots look at each other for 1.5 seconds
- Establishes visual connection before building begins

### Step 3: Build Towers (8 Blocks High)
- Both bots use the classic Minecraft "pillar jumping" technique
- Each bot builds an 8-block tower directly underneath themselves
- Uses spam-placement while jumping to ensure blocks are placed
- Bots end up standing on top of their towers

**Tower Building Process:**
1. Look down at feet
2. Jump and spam place block attempts (10 attempts per jump)
3. Land on newly placed block
4. Repeat 8 times
5. Bot is now 8 blocks higher than starting position

### Step 4: Look at Each Other from Tower Tops
- Bots look at each other from their elevated positions
- 1.5 seconds of eye contact
- Dramatic view across the gap between towers

### Step 5: Calculate Midpoint at Tower Height
- System calculates the midpoint between the two bots
- Midpoint is at the same Y-level (top of towers)
- This becomes the target for both bots to build towards

### Step 6: Build Bridges Towards Midpoint
- Bots place blocks in front of themselves to create a bridge
- Each bot builds approximately halfway to the midpoint
- Bridges are built at feet level (one block below bot position)
- Bots walk forward onto each newly placed block

**Bridge Building Process:**
1. Calculate direction to midpoint
2. Face the target direction
3. Place block in front at feet level (using `placeAt` for robust placement)
4. Walk forward onto the new block
5. Repeat until reaching the midpoint or meeting the other bot

### Step 7: Final Eye Contact
- Bots look at each other from their bridge positions
- 1.5 seconds of eye contact
- Should now be very close to each other in the middle

### Step 8: Episode Ends
- Transition to stop phase
- Episode statistics logged (tower height, bridge blocks placed)

## Key Features

### Tower Building Function

#### `buildTowerUnderneath(bot, towerHeight, args)`
- Builds a vertical tower using pillar jumping technique
- **Spam placement**: Fires 10 block placement attempts per jump
- **Verification**: Checks each block was successfully placed
- **Height tracking**: Monitors Y-level progress
- Returns statistics: `{success, failed, heightGained}`

### Bridge Building Function

#### `buildBridgeTowards(bot, targetPos, args)`
- Builds a horizontal bridge towards a target position
- **Direction calculation**: Computes normalized direction vector
- **Robust placement**: Uses `placeAt` with retries and sneaking
- **Progressive movement**: Bot walks onto each placed block
- **Distance checking**: Stops when close to target
- Returns statistics: `{blocksPlaced, distanceTraveled}`

### Helper Function

#### `fastPlaceBlock(bot, referenceBlock)`
- Quick block placement without checks
- Used during tower building spam attempts
- Fire-and-forget approach for performance

### Constants

```javascript
INITIAL_EYE_CONTACT_MS = 1500      // Initial look duration
FINAL_EYE_CONTACT_MS = 1500        // Final look duration
RECORDING_DELAY_MS = 500           // Recording stabilization
TOWER_HEIGHT = 8                   // Fixed tower height
TOWER_BLOCK_TYPE = 'oak_planks'    // Block type for towers
BRIDGE_BLOCK_TYPE = 'oak_planks'   // Block type for bridge
JUMP_DURATION_MS = 50              // Jump hold duration
PLACE_RETRY_DELAY_MS = 20          // Delay between spam attempts
MAX_PLACE_ATTEMPTS = 10            // Spam attempts per jump
SETTLE_DELAY_MS = 200              // Settle after placing
```

## Integration

To use this episode in your bot system, import and register it:

```javascript
const { getOnTowerBridgePhaseFn } = require('./episode-handlers/tower-bridge-episode');

// In your episode selection logic:
case 'towerBridge':
  coordinator.onceEvent(
    "towerBridgePhase",
    getOnTowerBridgePhaseFn(
      bot,
      sharedBotRng,
      coordinator,
      iterationID,
      otherBotName,
      episodeNum,
      getOnStopPhaseFn,
      args
    )
  );
  break;
```

## Expected Behavior

1. **Synchronized Tower Building**: Both bots build towers simultaneously
2. **Elevated Position**: Bots end up 8 blocks above starting position
3. **Bridge Construction**: Each bot builds approximately halfway
4. **Meeting Point**: Bridges should connect in the middle
5. **Visual Spectacle**: Creates impressive aerial structure

## Technical Notes

### Tower Building
- Uses **pillar jumping**: Classic Minecraft technique
- **Spam placement** ensures blocks are placed even with timing issues
- Bot physically rises with each block placed
- Verifies each block before continuing

### Bridge Building
- Uses `placeAt` from `builder.js` for robust placement
- **Sneaking enabled** to prevent falling off bridge
- **Direction locked**: Maintains straight line to target
- **Progressive movement**: Bot walks onto each block after placing

### Coordination
- Both bots build independently but synchronously
- Shared RNG ensures deterministic behavior
- Midpoint calculation ensures bridges will meet
- Distance checking prevents overshooting

## Debugging

The episode includes extensive logging:
- Tower building progress (block by block)
- Height verification at each step
- Bridge placement attempts
- Distance to target
- Final statistics

Look for these log prefixes:
- `🗼` - Tower building
- `🌉` - Bridge building
- `🧱` - Block placement
- `📍` - Position information
- `🎯` - Target/goal information
- `📏` - Distance/height measurements
- `✅` - Success messages
- `❌` - Error messages
- `⚠️` - Warning messages

## Potential Issues

1. **Tower Build Failure**: If a block fails to place, tower will be incomplete
2. **Bridge Misalignment**: If towers are different heights, bridges may not connect
3. **Falling Off**: Bot might fall if bridge placement fails
4. **Block Shortage**: Needs sufficient blocks in creative mode inventory
5. **Timing Issues**: Spam placement helps but occasional failures possible

## Visual Result

The completed structure should look like:
```
        Bot A -------- Bridge -------- Bot B
          |                              |
          |                              |
        Tower                          Tower
          |                              |
          |                              |
       Ground                         Ground
```

## Future Enhancements

- Add support for different tower heights (randomized or configurable)
- Implement decorative elements (railings, torches)
- Add support for wider bridges (2-3 blocks wide)
- Include staircase descent after meeting
- Add celebration behavior when bridges connect
- Support for different block types per bot
