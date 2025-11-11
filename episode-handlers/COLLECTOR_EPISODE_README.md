# Collector Episode

## Overview

The Collector Episode simulates cooperative and independent mining behaviors between two bots. This episode is inspired by `debugging/collector_bot.js` and adapted to work within the multi-bot episode framework.

## Episode Flow

### 1. Setup Phase
- Both bots receive mining equipment via RCON commands:
  - 1x Diamond Pickaxe
  - 1x Diamond Shovel
  - 256x Torches
  - 256x Dirt blocks

### 2. Meetup Phase
- One bot (randomly chosen as "primary") pathfinds to the other bot using `GoalNear(1)`
- The "secondary" bot waits in place
- Maximum duration: 15 seconds
- Purpose: Ensures bots start mining from a shared location

### 3. Mining Phase
The episode randomly selects one of two mining variants:

#### Variant A: Leader-Follower Mode (66% probability)
- **Leader Bot**:
  - Executes mining tasks (directional or staircase mining)
  - Collects visible ores before each task
  - Places torches periodically
  - Repeats the same directional task twice (e.g., "mine north" then "mine north" again)
  - Episode ends when 2 repetitions complete
  
- **Follower Bot**:
  - Follows the leader using `GoalNear(leaderPos, 5)`
  - When reaching the goal (distance ≤ 5 blocks):
    - Places a torch
    - Stops following
    - Waits until distance ≥ 10 blocks
  - Resumes following when leader moves far enough away
  - Ends when leader signals completion

#### Variant B: Independent Mining (34% probability)
- **Both Bots**:
  - Mine independently using the same logic as the leader
  - Both collect ores and place torches
  - Both perform directional/staircase mining with 2 repetitions
  - Episode ends when **both** bots complete their 2 repetitions

### 4. Stop Phase
- Standard episode termination
- Both bots stop all movement
- Pathfinder goals cleared
- Episode recording ends

## Mining Behavior Details

### Task Types
Each bot executes one of two task types (70% directional, 30% staircase):

1. **Directional Mining**:
   - Mine in a cardinal direction (north, south, east, west)
   - Distance: 2-8 blocks
   - Uses `GoalNear` with pathfinder digging enabled

2. **Staircase Mining**:
   - Mine down at ~45° angle
   - Depth: 5-8 blocks (won't go below y=5)
   - Moves horizontally same distance as vertically

### Task Repetition
- Each bot picks a random task (direction + type)
- Executes it once
- Executes the **same exact task** again
- Total: 2 repetitions of the same direction/type

### Ore Collection
Before each mining task, bots:
1. Scan for visible valuable ores within 16 blocks
2. Mine up to 8 visible ores using pathfinder
3. Timeout: 8 seconds per ore
4. Valuable ores include: diamond, emerald, gold, iron, lapis, redstone, coal, copper

### Torch Placement
- Torches placed before mining tasks and when follower reaches goal
- Finds solid blocks within 2 blocks
- Prioritizes head-level placement
- Avoids placing on ore blocks
- Uses intelligent face vector calculation toward bot

## Configuration Constants

```javascript
MEETUP_TIMEOUT_MS = 15000               // Meetup phase duration
LEADER_FOLLOWER_PROBABILITY = 0.66      // 66% chance of leader-follower
FOLLOWER_NEAR_DISTANCE = 5              // Follow distance threshold
FOLLOWER_FAR_DISTANCE = 10              // Resume following threshold
FOLLOWER_UPDATE_INTERVAL_MS = 1000      // Follower check frequency
RANDOM_MOTION_TIMEOUT_MS = 8000         // Mining task timeout
ORE_MINING_TIMEOUT_MS = 8000            // Per-ore mining timeout
MAX_ORES_TO_MINE = 8                    // Max ores per cycle
MAX_TORCH_DISTANCE = 2                  // Torch placement range
```

## Coordination Events

- `meetupPhase_{iterationID}` - Start meetup phase
- `miningPhase_{iterationID}` - Start mining phase
- `miningComplete_{iterationID}` - Signal mining completion
- `stopPhase` - Episode termination

## Key Differences from `collector_bot.js`

1. **Time-bounded**: Episodes have defined end conditions (task completion), not infinite loops
2. **Coordination**: Uses BotCoordinator for inter-bot communication
3. **Dual Roles**: Bots can be leader, follower, or independent miner
4. **Episode Structure**: Follows BaseEpisode lifecycle (setup → entry → teardown)
5. **RCON Integration**: Uses RCON for item giving instead of chat commands

## Usage

The collector episode can be selected randomly along with other episodes, or specifically requested:

```javascript
// In episode selection code
const episodeType = "collector";

// Or let it be randomly selected from episodeTypes array
```

## Technical Implementation

- **Class**: `CollectorEpisode extends BaseEpisode`
- **Works in non-flat worlds**: `WORKS_IN_NON_FLAT_WORLD = true`
- **Pathfinder**: Uses mineflayer-pathfinder with digging enabled
- **Lock-based task management**: Prevents overlapping tasks
- **Async/await patterns**: Clean coordination between bots

## Testing Notes

To test the collector episode:
1. Ensure bots spawn in a cave or underground location
2. Monitor console logs for task types and repetitions
3. Verify both variants (leader-follower and independent) execute correctly
4. Check that episodes end cleanly after 2 repetitions
5. Confirm torches are placed and ores are collected

## Future Enhancements

Potential improvements:
- Add metadata tracking for ores collected
- Support for more mining patterns (branch mining, spiral mining)
- Dynamic difficulty adjustment based on y-level
- Inventory management (return to base when full)

