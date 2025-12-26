# builder.js Documentation

## Overview

`builder.js` provides comprehensive block placement utilities for the Minecraft multiplayer data collection system. It implements robust, human-like building capabilities with intelligent face selection, line-of-sight validation, and fallback mechanisms for reliable block placement.

## Core Concepts

### Cardinal Directions
The system uses a prioritized list of 6 cardinal directions for block placement:

```javascript
const CARDINALS = [
  new Vec3(0, 1, 0),  // +Y (top) - PREFERRED: easiest to place on
  new Vec3(-1, 0, 0), // -X (west)
  new Vec3(1, 0, 0),  // +X (east)
  new Vec3(0, 0, -1), // -Z (north)
  new Vec3(0, 0, 1),  // +Z (south)
  new Vec3(0, -1, 0), // -Y (bottom) - LAST: hardest to place on
];
```

### Face Scoring System
Each potential placement face is scored based on:
- **View Direction**: Bonus for faces bot is already looking at
- **Face Orientation**: Bonus for horizontal faces (+10), top face (+15)
- **Distance**: Bonus for closer blocks
- **Difficulty Penalty**: Penalty for bottom face (-10)

## Core Functions

### placeAt(bot, targetPos, itemName, options)
Primary block placement function with comprehensive validation and fallbacks.

**Parameters:**
- `bot` - Mineflayer bot instance
- `targetPos` - Vec3 position to place block at
- `itemName` - Name of block/item to place
- `options` - Configuration options

**Options:**
```javascript
{
  useSneak: false,        // Whether to sneak while placing
  tries: 5,               // Attempts per face candidate
  prePlacementDelay: 150, // Delay before placement (ms)
  maxRetries: 10,         // Maximum total attempts
  args: null              // Configuration arguments
}
```

**Algorithm:**
1. **Validation**: Check if block already exists
2. **Item Equipping**: Ensure correct item in hand
3. **Face Discovery**: Find all viable placement faces
4. **Face Iteration**: Try each face with retries
5. **Preparation**: Look at face, validate reach/sight
6. **Placement**: Execute placement with camera control
7. **Verification**: Confirm block was actually placed

### placeMultiple(bot, positions, itemName, options)
Places multiple blocks with intelligent ordering and progress tracking.

**Parameters:**
- `bot` - Mineflayer bot instance
- `positions` - Array of Vec3 positions
- `itemName` - Block type to place
- `options` - Configuration options

**Options:**
```javascript
{
  delayMs: 300,              // Delay between placements
  useBuildOrder: true,       // Use intelligent ordering
  useSmartPositioning: false // Smart positioning (performance tradeoff)
}
```

**Features:**
- **Build Ordering**: Sorts blocks for structural validity (bottom-up, dependencies)
- **Progress Tracking**: Success/failure/skipped counters
- **Smart Positioning**: Optional movement to optimal placement positions

### buildTowerUnderneath(bot, towerHeight, args, options)
Implements classic Minecraft pillar jumping for tower construction.

**Parameters:**
- `bot` - Mineflayer bot instance
- `towerHeight` - Desired height
- `args` - Configuration arguments
- `options` - Building options

**Options:**
```javascript
{
  blockType: "oak_planks",
  enableRetry: true,
  breakOnFailure: false,
  maxPlaceAttempts: 10,
  settleDelayMs: 200,
  jumpDurationMs: 50,
  placeRetryDelayMs: 20
}
```

**Algorithm:**
1. **Setup**: Look down, equip blocks
2. **Build Loop**: For each level:
   - Jump and spam placement attempts
   - Verify height gain
   - Retry if necessary
3. **Tracking**: Return success/failure statistics

## Utility Functions

### Face and Position Validation

#### findBestPlaceReference(bot, targetPos, options)
Finds optimal reference block and face for placement.

**Parameters:**
- `bot` - Mineflayer bot instance
- `targetPos` - Target position
- `options` - {returnAll: boolean, minScore: number}

**Returns:** Best candidate or all candidates array

**Validation Checks:**
- Block existence and solidity
- Line-of-sight (bot.canSeeBlock)
- Obstruction detection (raycast)
- Face orientation validation

#### scoreFace(bot, faceVec, refBlockPos)
Calculates placement score for a face (0-100).

**Scoring Factors:**
- View direction alignment (0-30 points)
- Horizontal face bonus (+10)
- Top face bonus (+15)
- Bottom face penalty (-10)
- Distance-based bonus (0-10)

#### canSeeFace(bot, refBlock, faceVec)
Validates line-of-sight to a specific face.

**Checks:**
1. Basic visibility (canSeeBlock)
2. Raycast obstruction detection
3. Face orientation validation
4. Distance limits

### Movement and Positioning

#### calculateOptimalPosition(bot, refBlock, faceVec, targetPos)
Calculates best standing position for block placement.

**Logic:**
- Determine direction away from face
- Calculate optimal distance (2.5-3.5 blocks)
- Adjust for horizontal vs vertical faces
- Find safe ground position

#### moveToPlacementPosition(bot, refBlock, faceVec, targetPos, timeoutMs)
Moves bot to optimal placement position using pathfinding.

**Features:**
- Position safety validation
- Pathfinding with timeout
- Line-of-sight verification after movement
- Fallback position alternatives

### Preparation and Ritual

#### prepareForPlacement(bot, refBlock, faceVec, delayMs)
Pre-placement ritual for human-like behavior.

**Sequence:**
1. Temporarily disable pathfinder auto-look
2. Smooth camera turn to face
3. Natural pause (configurable delay)
4. Reach and sight validation
5. Restore pathfinder settings

#### ensureReachAndSight(bot, refBlock, faceVec, maxTries)
Ensures bot can reach and see target face.

**Fallback Logic:**
- Check current reach/sight
- Use pathfinder to move closer if needed
- Retry up to maxTries

### Fast Placement

#### fastPlaceBlock(bot, referenceBlock)
Immediate block placement without validation (for spam attempts).

**Usage:** Pillar jumping during jumps where context is known.

## Advanced Features

### Build Order Optimization

#### sortByBuildability(positions, bot)
Sorts positions for structurally valid building order.

**Algorithm:**
- Group by Y-level (bottom to top)
- Within level: bot-distance ordering
- Dependency resolution using adjacent support checking
- Fallback for unsortable blocks

#### hasAdjacentSupport(bot, targetPos, placedBlocks)
Checks if position has structural support.

**Rules:**
- Ground level (Y≤0) always supported
- Check 6 adjacent positions for solid blocks
- Include already-placed blocks in consideration

### Raycast Validation

#### raycastToPosition(bot, fromPos, toPos)
Detailed line-of-sight checking with raycast.

**Implementation:**
- Step through ray in 0.1 block increments
- Check each position for solid blocks
- Return clear/obstruction status

#### isBlockObstructed(bot, targetPos)
Checks if target position is completely enclosed.

**Logic:** Count blocked faces (all 6 = completely obstructed)

### Inventory Management

#### ensureItemInHand(bot, itemName, args)
Ensures specified item is equipped in hand.

**Process:**
- Find item in inventory
- Equip if not already equipped
- Throw error if unavailable

## Error Handling

### Comprehensive Validation
- **Pre-conditions**: Check existing blocks, item availability
- **Mid-placement**: Reach and sight validation
- **Post-placement**: World state verification
- **Fallbacks**: Multiple face candidates with scoring

### Graceful Degradation
- **Face Fallback**: Try multiple faces if primary fails
- **Position Alternatives**: Alternative standing positions
- **Retry Logic**: Configurable retry attempts per face
- **Timeout Handling**: Prevent infinite waiting

### Logging and Debugging
- **Face Scoring**: Detailed scoring breakdown
- **Placement Attempts**: Per-attempt logging with context
- **Success Tracking**: Comprehensive statistics
- **Camera Logging**: Debug camera angles during placement

## Performance Optimizations

### Smart Caching
- Face candidate scoring and sorting
- Position safety validation results
- Build order computation

### Memory Management
- Proper cleanup of pathfinder goals
- Temporary state restoration
- Resource leak prevention

### CPU Optimization
- Early exit conditions
- Bounded retry loops
- Timeout-based fail-safes

## Integration Patterns

### With Episodes
```javascript
// Single block placement
await placeAt(bot, targetPos, "stone");

// Multiple block construction
const result = await placeMultiple(bot, positions, "stone", {
  useBuildOrder: true,
  useSmartPositioning: true
});

// Tower building
const stats = await buildTowerUnderneath(bot, 8, args);
```

### With Pathfinding
```javascript
// Initialize with building-appropriate settings
initializePathfinder(bot, {
  allowSprinting: false,
  allowParkour: true,
  canDig: false,
  allowEntityDetection: true
});
```

### With Coordinator
- Integrates with episode phase system
- Supports cancellation via episode stopping
- Compatible with recording lifecycle

## Testing Considerations

### Deterministic Behavior
- Position calculations relative to bot location
- Consistent face scoring algorithms
- Predictable fallback sequences

### Edge Cases
- **Obstructed Positions**: Completely enclosed blocks
- **Inventory Issues**: Missing or insufficient materials
- **Pathfinding Failures**: Unreachable positions
- **Camera Constraints**: Limited viewing angles

### Performance Benchmarking
- Placement success rates
- Time per block placement
- Memory usage patterns
- Pathfinding integration overhead

## Dependencies

- `minecraft-data` - For block and item information
- `mineflayer-pathfinder` - For movement and navigation
- `vec3` - For 3D vector mathematics

## Constants and Configuration

| Constant | Default | Description |
|----------|---------|-------------|
| `CARDINALS` | 6 directions | Ordered face preference list |
| `EYE_LEVEL` | 1.8 | Bot eye height approximation |
| `MAX_REACH` | 4.5/6.0 | Creative/survival reach distance |

## Future Enhancements

### Potential Improvements
- **Multi-block Placement**: Place multiple blocks per action
- **Structure Templates**: Pre-defined building patterns
- **Dynamic Pathfinding**: Real-time path recalculation
- **Material Optimization**: Smart material selection
- **Collaborative Building**: Multi-bot coordination primitives
