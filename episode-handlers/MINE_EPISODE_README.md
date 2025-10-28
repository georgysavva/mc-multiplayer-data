# Mine Episode Handler

## Overview
The `mine-episode.js` handler implements a mining/digging episode where two bots dig down and then mine towards each other through the floor, creating tunnels that meet in the middle.

## Episode Flow

### Step 1: Bots Spawn In
- Bots are teleported to their starting positions (handled by teleport phase)
- Recording stabilization delay of 500ms

### Step 2: Initial Eye Contact
- Both bots look at each other for 1.5 seconds
- Establishes visual connection before mining begins

### Step 3: Equip Mining Tool
- Bots equip a diamond pickaxe for efficient mining
- Tool is spawned via creative mode inventory or RCON

### Step 4: Dig Down One Block
- Each bot digs the block directly underneath themselves
- Bots look straight down (90 degrees pitch)
- Bots fall down by 1 Y-level after digging

### Step 5: Calculate Midpoint
- System calculates the midpoint between the two bots
- Midpoint is at the same Y-level (one block down from spawn)
- This becomes the target for both bots to mine towards

### Step 6: Mine 2x1 Tunnel Towards Midpoint
- Bots use pathfinding with digging enabled
- Creates a 2-block high, 1-block wide tunnel
- Pathfinder automatically handles:
  - Breaking blocks in the way
  - Moving forward as blocks are cleared
  - Creating proper tunnel dimensions
- Maximum timeout: 30 seconds
- Bots mine until they reach within 2 blocks of the midpoint

### Step 7: Final Eye Contact
- Bots look at each other again for 1.5 seconds
- Should now be able to see each other through the tunnel

### Step 8: Episode Ends
- Transition to stop phase
- Episode statistics logged (blocks mined, distance traveled)

## Key Features

### Digging Functions

#### `digBlock(bot, blockPos)`
- Digs a single block at a specific position
- Automatically looks at the block before digging
- Returns true if successful

#### `digDownOneBlock(bot)`
- Specialized function to dig the block directly underneath the bot
- Handles looking down and waiting for the bot to fall
- Logs Y-level change

#### `mineTunnelTowards(bot, targetPos, maxBlocks)`
- Mines a 2x1 tunnel towards a target position
- Uses mineflayer-pathfinder with digging enabled
- Tracks blocks mined via blockUpdate events
- Configurable pathfinding settings:
  - `canDig: true` - Allows breaking blocks
  - `digCost: 1` - Low cost for digging (encourages mining)
  - `placeCost: 1000` - High cost for placing (prevents placing blocks)
  - `allowSprinting: false` - Disabled for controlled mining
  - `allowParkour: false` - Disabled for safety

### Constants

```javascript
INITIAL_EYE_CONTACT_MS = 1500      // Initial look duration
FINAL_EYE_CONTACT_MS = 1500        // Final look duration
RECORDING_DELAY_MS = 500           // Recording stabilization
DIG_DELAY_MS = 100                 // Delay between dig attempts
TOOL_TYPE = 'diamond_pickaxe'      // Mining tool
PATHFIND_TIMEOUT_MS = 30000        // 30 second pathfinding timeout
```

## Integration

To use this episode in your bot system, import and register it:

```javascript
const { getOnMinePhaseFn } = require('./episode-handlers/mine-episode');

// In your episode selection logic:
case 'mine':
  coordinator.onceEvent(
    "minePhase",
    getOnMinePhaseFn(
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

1. **Synchronized Digging**: Both bots dig down at the same time
2. **Tunnel Creation**: Each bot creates a tunnel from their position towards the midpoint
3. **Meeting Point**: Bots should meet approximately in the middle
4. **2x1 Dimensions**: Tunnels are 2 blocks high (allowing bot to walk through) and 1 block wide

## Technical Notes

- Uses mineflayer's native `bot.dig()` function for block breaking
- Pathfinder automatically handles the 2x1 tunnel dimensions
- Block mining is tracked via `blockUpdate` events
- Pathfinding stops when within 2 blocks of target or after 30 second timeout
- All movement controls are stopped before transitioning to stop phase

## Debugging

The episode includes extensive logging:
- Current positions and target positions
- Blocks being mined
- Distance to target
- Mining progress (blocks mined count)
- Pathfinding status

Look for these log prefixes:
- `⛏️` - Mining/digging actions
- `📍` - Position information
- `🎯` - Target/goal information
- `📏` - Distance measurements
- `✅` - Success messages
- `❌` - Error messages
- `⚠️` - Warning messages

## Potential Issues

1. **Pathfinding Stuck**: If pathfinder gets stuck, it will timeout after 30 seconds
2. **No Tool**: If diamond pickaxe cannot be equipped, mining will be slower
3. **Unloaded Chunks**: If chunks aren't loaded, pathfinding may fail
4. **Collision**: Bots might collide if they reach the midpoint at the same time

## Future Enhancements

- Add support for different tunnel dimensions (3x3, 1x2, etc.)
- Implement staircase mining (diagonal descent)
- Add ore detection and collection
- Support for different mining patterns (branch mining, strip mining)
- Add lighting placement (torches) while mining
