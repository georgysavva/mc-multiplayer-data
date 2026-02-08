# collector-episode.js Documentation

## Overview

`collector-episode.js` implements mining and resource collection episodes with cooperative modes (leader-follower and independent mining). This episode demonstrates complex multi-bot coordination, torch placement, ore detection, and structured exploration patterns.

## Class: CollectorEpisode

### Static Properties

| Property                  | Value  | Description                           |
| ------------------------- | ------ | ------------------------------------- |
| `WORKS_IN_NON_FLAT_WORLD` | `true` | Supports non-flat world terrain       |
| `INIT_MIN_BOTS_DISTANCE`  | `0`    | No minimum distance requirement       |
| `INIT_MAX_BOTS_DISTANCE`  | `20`   | Allow bots to spread out while mining |

### Episode Characteristics

**Multi-Phase Episode:**

- Meetup phase for bot convergence
- Mining cycles with cooperative behaviors
- Torch placement for visibility
- Ore collection and exploration

**Cooperative Modes:**

- **Leader-Follower**: One bot leads mining, other follows and places torches
- **Independent**: Both bots mine separately using same patterns

## Configuration Constants

| Constant                      | Value   | Description                         |
| ----------------------------- | ------- | ----------------------------------- |
| `MEETUP_TIMEOUT_MS`           | `4000`  | Maximum time to meet up             |
| `LEADER_FOLLOWER_PROBABILITY` | `3/3`   | 100% chance of leader-follower mode |
| `FOLLOWER_NEAR_DISTANCE`      | `2`     | Distance follower maintains         |
| `FOLLOWER_FAR_DISTANCE`       | `6`     | Distance before resuming following  |
| `RANDOM_MOTION_TIMEOUT_MS`    | `10000` | Task completion timeout             |
| `ORE_MINING_TIMEOUT_MS`       | `8000`  | Per-ore mining timeout              |
| `TASK_CHECK_INTERVAL_MS`      | `500`   | Task status check frequency         |
| `MAX_ORES_TO_MINE`            | `8`     | Maximum ores per cycle              |
| `MAX_TORCH_DISTANCE`          | `2`     | Torch placement range               |
| `MAX_MINING_CYCLES`           | `20`    | Maximum mining cycles               |

## Valuable Ore Types

```javascript
const VALUABLE_ORES = [
  "diamond_ore",
  "deepslate_diamond_ore",
  "emerald_ore",
  "deepslate_emerald_ore",
  "gold_ore",
  "deepslate_gold_ore",
  "iron_ore",
  "deepslate_iron_ore",
  "lapis_ore",
  "deepslate_lapis_ore",
  "redstone_ore",
  "deepslate_redstone_ore",
  "coal_ore",
  "deepslate_coal_ore",
  "copper_ore",
  "deepslate_copper_ore",
];
```

## Core Functions

### Synchronization Primitives

#### isMyTurn(bot, sharedBotRng, args)

Deterministic role assignment using shared RNG.

**Logic:**

- Both bots consume RNG equally
- Role determined by bot name sorting + random value
- Ensures symmetric behavior across episodes

### Pathfinder Configuration

#### setMovementsForCollector(bot)

Configures pathfinder movements for mining activities.

```javascript
const customMoves = new Movements(bot);
customMoves.allow1by1towers = false;
customMoves.allowParkour = false;
customMoves.allowDigging = true;
customMoves.blocksToAvoid.add(bot.registry.blocksByName.water.id);
// ... additional blocks to avoid
```

### Torch Management

#### placeTorch(bot, mcData, oreIds, maxTryTime, stopRetryCondition)

Places torches on nearby surfaces for visibility.

**Algorithm:**

1. Find torch in inventory and equip
2. Scan for solid surfaces within range
3. Sort by proximity to eye level
4. Try placement with orientation calculation
5. Retry until timeout or stop condition

#### canPlaceTorch(bot, pos)

Validates torch placement possibility and returns best face.

**Returns:** `[canPlace, faceVector]` or `[false, null]`

### Ore Detection and Mining

#### findVisibleOres(bot, oreIds)

Discovers valuable ores within vision and reach.

**Process:**

1. Find blocks matching ore IDs within 16 blocks
2. Filter for visibility using `isBlockVisible()`
3. Return array of visible ore blocks

#### executeMiningTask(bot, mcData, oreIds, taskSpec)

Executes a single mining task with ore collection and exploration.

**Task Types:**

- **Directional Mining**: Straight-line mining in cardinal direction
- **Staircase Mining**: 45-degree descent mining

**Sequence:**

1. Place torch for visibility
2. Collect visible ores (up to MAX_ORES_TO_MINE)
3. Execute main mining pattern
4. Wait for goal completion or timeout

### Cooperative Behaviors

#### mineAsLeader(bot, coordinator, mcData, oreIds, episodeNum, iterationID)

Leader mining behavior with task repetition tracking.

**Pattern:**

- Generate and execute 2 tasks per cycle
- Tasks alternate between directional and staircase mining
- Signal completion to follower bot

#### followAndPlaceTorches(bot, leaderName, mcData, oreIds, isLeaderDone)

Follower behavior providing torch support.

**Responsibilities:**

- Follow leader while maintaining distance
- Place torches periodically (every 5 seconds)
- Continue until leader signals completion

#### independentMining(bot, mcData, oreIds)

Independent mining where both bots mine separately.

**Behavior:** Same pattern as leader but without coordination.

## Episode Structure

### Phase Organization

#### Meetup Phase (meetupPhase)

**Purpose:** Bring bots together before coordinated activities

**Logic:**

- Both bots follow each other to converge at midpoint
- Timeout after MEETUP_TIMEOUT_MS if convergence fails
- Uses GoalFollow for smooth convergence

#### Mining Phase (miningPhase)

**Core mining execution with mode selection**

**Mode Selection:**

```javascript
const isLeaderFollowerMode = sharedBotRng() < LEADER_FOLLOWER_PROBABILITY;
```

**Leader-Follower Mode:**

- Deterministic role assignment using `isMyTurn()`
- Leader mines, follower provides torch support
- Coordination via completion signals

**Independent Mode:**

- Both bots execute same mining patterns
- No coordination required
- Symmetric RNG consumption

### Cycle Structure

```
Episode Start
├── Cycle 1
│   ├── Meetup Phase
│   └── Mining Phase
├── Cycle 2
│   ├── Meetup Phase
│   └── Mining Phase
└── ... (up to MAX_MINING_CYCLES)
Episode End
```

## Task Specification System

### Task Generation (getNextTaskSpec)

**Parameters:**

- `botUsername` - For logging
- `lastTaskSpec` - Previous task (or null)
- `taskRepeatCount` - Current repetition count

**Task Properties:**

- `type`: "directional" or "staircase"
- `direction`: Random cardinal direction with offset
- `distance`: 5-9 blocks

**Repetition Logic:**

- First execution: 60% directional, 40% staircase
- Second execution: Repeat previous task
- Reset to 0 after 2 repetitions

### Task Execution

#### Directional Mining (performDirectionalMining)

```javascript
const targetPos = startPos.plus(direction.offset.scaled(distance));
bot.pathfinder.setGoal(new GoalNear(targetPos.x, targetPos.y, targetPos.z, 1));
```

#### Staircase Mining (performStaircaseMining)

```javascript
const targetY = Math.max(startPos.y - depth, 5); // Don't go below y=5
const horizontalDistance = depth;
const targetX = startPos.x + direction.offset.x * horizontalDistance;
const targetZ = startPos.z + direction.offset.z * horizontalDistance;
```

## Dependencies

### Required Imports

- `Vec3, Movements, GoalNear, GoalBlock, GoalFollow` from `../utils/bot-factory`
- `stopAll, lookAtBot, sleep, land_pos` from `../utils/movement`
- `BaseEpisode` from `./base-episode`

### Minecraft Data Integration

- Uses `minecraft-data` for block/item ID lookups
- Ore detection via block type matching
- Inventory management for torches and tools

## Integration Points

### Coordinator Integration

- Phase-based communication via `cycle_${cycle}` events
- Completion signaling between leader and follower
- Proper stop phase transitions

### RNG Integration

- Shared RNG for mode selection and role assignment
- Deterministic task generation
- Symmetric consumption across bots

## Usage Examples

### Episode Execution

```javascript
// Episode automatically handles:
// - Multi-cycle mining with 20 max cycles
// - Mode selection (leader-follower vs independent)
// - Role assignment and coordination
// - Torch placement and ore collection
// - Task repetition and exploration patterns
```

### Manual Mining Task

```javascript
// Direct task execution
const taskSpec = {
  type: "directional",
  direction: getRandomDirection(),
  distance: 7,
};
await executeMiningTask(bot, mcData, oreIds, taskSpec);
```

## Performance Characteristics

### Resource Usage

- **CPU**: Moderate (pathfinding, ore scanning, torch placement)
- **Memory**: Low (task specs, ore lists)
- **Network**: Low (coordinator messages, position updates)

### Scalability

- Configurable cycle limits
- Timeout protections
- Graceful degradation on failures

## Testing Considerations

### Deterministic Behavior

- Shared RNG ensures consistent mode/role selection
- Task generation based on repetition tracking
- Position calculations relative to bot locations

### Edge Cases

- **Leader Disconnection**: Follower timeout handling
- **Ore Depletion**: Graceful handling of no visible ores
- **Pathfinding Blocks**: Torch placement for visibility
- **Inventory Issues**: Torch availability checking

### Debug Features

- Comprehensive logging of tasks and roles
- Ore discovery and collection tracking
- Torch placement success/failure
- Cycle completion monitoring

## Cooperative Mode Details

### Leader-Follower Synchronization

```javascript
// Leader signals completion
coordinator.sendToOtherBot(
  `done_${cycle}`,
  bot.entity.position.clone(),
  episodeNum,
  "leader_done",
);

// Follower waits for signal
coordinator.onceEvent(`done_${cycle}`, episodeNum, () => {
  leaderDone = true;
});
```

### Role Assignment

```javascript
// Symmetric role determination
const isLeader = isMyTurn(bot, sharedBotRng, args);
if (isLeader) {
  await mineAsLeader(/*...*/);
} else {
  await followAndPlaceTorches(/*...*/);
}
```

## Future Enhancements

### Potential Features

- **Dynamic Mode Switching**: Change modes mid-episode
- **Advanced Exploration**: Smarter ore-seeking algorithms
- **Resource Sharing**: Inventory coordination between bots
- **Minecart Usage**: Transportation system integration
- **Multi-level Mining**: 3D exploration patterns
