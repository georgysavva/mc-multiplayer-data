# Human-Like Block Placement System

## Overview

A comprehensive 7-phase system for intelligent, human-like block placement in Minecraft bots. This system ensures blocks are placed naturally with proper validation, line-of-sight checks, intelligent build ordering, and robust error handling.

## Features

- ✅ **Intelligent Face Selection**: Scores and selects optimal block faces based on bot orientation and accessibility
- ✅ **Line-of-Sight Validation**: Raycast-based visibility checks ensure bots can see what they're placing
- ✅ **Smart Positioning**: Calculates optimal standing positions for natural placement
- ✅ **Build Order Optimization**: Ensures blocks are placed bottom-up with proper support
- ✅ **Pre-placement Ritual**: Natural camera movements and pauses before placement
- ✅ **Multiple Fallbacks**: Tries alternative faces if primary placement fails
- ✅ **Comprehensive Validation**: Checks bot state, positions, and item availability
- ✅ **Graceful Error Handling**: Never crashes, always returns status

## Architecture

### Phase 1: Enhanced Reference Finding
- `scoreFace()`: Calculates 0-100 score for each face based on view direction, orientation, and distance
- `findBestPlaceReference()`: Returns best face with visibility checks and scoring
- CARDINALS array reordered to prefer top face, then horizontals, then bottom

### Phase 2: Line-of-Sight Validation
- `raycastToPosition()`: 0.1 block resolution raycast for precise obstruction detection
- `isBlockObstructed()`: Checks if target position is completely enclosed
- `canSeeFace()`: 3-layer validation (basic visibility, raycast, face orientation)

### Phase 3: Smart Positioning
- `isPositionSafe()`: Validates ground support, headroom, and distance
- `calculateOptimalPosition()`: Calculates ideal standing position 3 blocks from target
- `moveToPlacementPosition()`: Uses pathfinder to navigate to optimal position

### Phase 4: Build Order Optimization
- `hasAdjacentSupport()`: Checks if block has adjacent support (Y≤0 always supported)
- `sortByBuildability()`: Orders blocks bottom-up with dependency tracking

### Phase 5: Pre-placement Ritual
- `prepareForPlacement()`: Smooth camera turn, natural pause, validates reach/sight
- Disables pathfinder auto-look to prevent camera snap

### Phase 6: Integration
- `placeMultiple()`: Enhanced with build order, smart positioning, skip detection
- `buildStructure()`: Episode handler with success rate tracking

### Phase 7: Error Handling
- Multiple fallback faces with retry limits
- Comprehensive validation (bot state, positions, items)
- Graceful degradation with detailed logging

## Usage

### Basic Block Placement

```javascript
const { placeAt } = require('./builder');

// Place a single block
const success = await placeAt(bot, targetPos, 'stone', {
  useSneak: true,
  tries: 5,
  prePlacementDelay: 150,
  maxRetries: 10
});
```

### Multiple Block Placement

```javascript
const { placeMultiple } = require('./builder');

const positions = [
  new Vec3(0, 0, 0),
  new Vec3(1, 0, 0),
  new Vec3(0, 1, 0)
];

const result = await placeMultiple(bot, positions, 'stone', {
  useSneak: true,
  tries: 5,
  delayMs: 300,
  useBuildOrder: true,        // Enable intelligent ordering
  useSmartPositioning: false, // Disable for performance
  prePlacementDelay: 150,
  maxRetries: 10
});

console.log(`Success: ${result.success}, Failed: ${result.failed}, Skipped: ${result.skipped}`);
```

### Structure Building (Episode Handler)

```javascript
const { buildStructure } = require('./build-structure-episode');

await buildStructure(bot, positions, 'stone', args);
// Automatically uses intelligent build order and logs success rate
```

## Configuration Options

### `placeAt()` Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useSneak` | boolean | `true` | Enable sneaking during placement |
| `tries` | number | `5` | Attempts per face before trying next |
| `args` | object | `null` | RCON args for item spawning |
| `prePlacementDelay` | number | `150` | Pause (ms) before placement |
| `maxRetries` | number | `10` | Maximum total attempts across all faces |

### `placeMultiple()` Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useBuildOrder` | boolean | `true` | Enable intelligent build ordering |
| `useSmartPositioning` | boolean | `false` | Enable bot repositioning (slower) |
| `delayMs` | number | `300` | Delay between block placements |
| All `placeAt()` options | - | - | Passed through to `placeAt()` |

### `findBestPlaceReference()` Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `returnAll` | boolean | `false` | Return all candidates instead of best |
| `minScore` | number | `0` | Minimum score threshold for candidates |

## API Reference

### Core Functions

#### `scoreFace(bot, faceVec, refBlockPos)`
Calculates quality score (0-100) for a block face.

**Scoring Factors:**
- View direction alignment: +30 for facing, -20 for behind
- Face orientation: +15 for top, +10 for horizontal, -10 for bottom
- Distance: +10 for closer blocks

#### `findBestPlaceReference(bot, targetPos, options)`
Finds the best face to click for block placement.

**Returns:** `{refBlock, faceVec, score, alternatives}` or `null`

**Validation:**
- Checks position validity
- Filters solid blocks only
- Verifies bot can see block
- Checks for obstructions

#### `placeAt(bot, targetPos, itemName, options)`
Places a single block with fallback mechanisms.

**Returns:** `boolean` - true if successfully placed

**Process:**
1. Validates bot state and item availability
2. Gets all viable face candidates
3. Tries each face with retries
4. Performs pre-placement ritual
5. Verifies placement success

#### `placeMultiple(bot, positions, itemName, options)`
Places multiple blocks with intelligent ordering.

**Returns:** `{success, failed, skipped}`

**Features:**
- Intelligent build order (bottom-up with dependencies)
- Skip detection for collaborative building
- Optional smart positioning
- Progress tracking

#### `sortByBuildability(positions, bot)`
Orders blocks to ensure proper support.

**Returns:** `Array<Vec3>` - sorted positions

**Algorithm:**
1. Groups by Y level (bottom to top)
2. Checks adjacent support for each block
3. Builds dependency graph
4. Returns buildable order

## Best Practices

### 1. Use Intelligent Build Order
Always enable `useBuildOrder: true` for structures with multiple layers:

```javascript
await placeMultiple(bot, positions, 'stone', {
  useBuildOrder: true  // Ensures proper support
});
```

### 2. Disable Smart Positioning for Performance
Unless positioning is critical, keep `useSmartPositioning: false`:

```javascript
await placeMultiple(bot, positions, 'stone', {
  useSmartPositioning: false  // Better performance
});
```

### 3. Handle Collaborative Building
The system automatically skips already-placed blocks:

```javascript
const result = await placeMultiple(bot, positions, 'stone', options);
console.log(`Skipped ${result.skipped} blocks already placed by other bot`);
```

### 4. Monitor Success Rates
Check success rates to detect issues:

```javascript
const result = await placeMultiple(bot, positions, 'stone', options);
const successRate = result.success / positions.length;
if (successRate < 0.5) {
  console.warn('Low success rate:', successRate);
}
```

### 5. Use Appropriate Delays
Adjust delays based on structure complexity:

```javascript
// Simple structures
await placeMultiple(bot, positions, 'stone', { delayMs: 300 });

// Complex structures (more visible)
await placeMultiple(bot, positions, 'stone', { delayMs: 1500 });
```

## Troubleshooting

### Issue: Blocks not placing

**Possible causes:**
1. No valid faces found → Check if target position has adjacent blocks
2. Bot out of reach → Enable `useSmartPositioning: true`
3. Line-of-sight blocked → Bot may need to move

**Solution:**
```javascript
// Enable detailed logging to diagnose
const result = await placeAt(bot, targetPos, 'stone', {
  maxRetries: 15,  // Increase retries
  tries: 10        // More attempts per face
});
```

### Issue: Floating blocks

**Cause:** Build order not respecting dependencies

**Solution:**
```javascript
// Always use intelligent build order
await placeMultiple(bot, positions, 'stone', {
  useBuildOrder: true  // Ensures bottom-up placement
});
```

### Issue: Slow performance

**Cause:** Smart positioning enabled

**Solution:**
```javascript
// Disable smart positioning for better performance
await placeMultiple(bot, positions, 'stone', {
  useSmartPositioning: false,  // Much faster
  delayMs: 300                 // Reduce delay if needed
});
```

### Issue: Bot camera snapping

**Cause:** Pathfinder interfering with manual look

**Solution:** Already handled automatically by `prepareForPlacement()` which disables `pathfinder.enableLook` during placement.

## Performance Considerations

### Memory Usage
- Each block placement creates temporary objects for candidates
- `sortByBuildability()` creates a Set to track placed blocks
- Memory usage is O(n) where n = number of blocks

### Time Complexity
- `scoreFace()`: O(1)
- `findBestPlaceReference()`: O(6) - checks 6 cardinal directions
- `sortByBuildability()`: O(n²) worst case, O(n) typical
- `placeAt()`: O(f × t) where f = faces, t = tries per face

### Optimization Tips
1. Use `minScore` to filter low-quality faces
2. Disable `useSmartPositioning` unless necessary
3. Reduce `maxRetries` for simple structures
4. Increase `delayMs` only for visibility, not accuracy

## Examples

### Example 1: Simple Wall

```javascript
const positions = [];
for (let x = 0; x < 5; x++) {
  for (let y = 0; y < 3; y++) {
    positions.push(new Vec3(x, y, 0));
  }
}

await placeMultiple(bot, positions, 'stone', {
  useBuildOrder: true,
  delayMs: 500
});
```

### Example 2: Tower

```javascript
const positions = [];
for (let y = 0; y < 10; y++) {
  positions.push(new Vec3(0, y, 0));
}

await placeMultiple(bot, positions, 'stone', {
  useBuildOrder: true,  // Bottom-up placement
  delayMs: 300
});
```

### Example 3: Platform

```javascript
const positions = [];
for (let x = 0; x < 4; x++) {
  for (let z = 0; z < 4; z++) {
    positions.push(new Vec3(x, 5, z));  // Elevated platform
  }
}

await placeMultiple(bot, positions, 'stone', {
  useBuildOrder: true,  // Ensures support exists
  delayMs: 400
});
```

## Integration with Episodes

The system is integrated into episode handlers via `buildStructure()`:

```javascript
// In build-structure-episode.js
async function buildStructure(bot, positions, blockType, args) {
  const result = await placeMultiple(bot, positions, blockType, {
    useSneak: true,
    tries: 5,
    args: args,
    delayMs: BLOCK_PLACE_DELAY_MS,
    useBuildOrder: true,
    useSmartPositioning: false,
    prePlacementDelay: 150,
  });
  
  // Automatic success rate calculation and warnings
  const successRate = result.success / positions.length;
  if (successRate < 0.5) {
    console.warn(`Low success rate: ${(successRate * 100).toFixed(1)}%`);
  }
  
  return result;
}
```

## Logging

The system provides comprehensive logging at every step:

### Face Selection
```
[Alpha] 🎯 Best face: score=85.3, vec=(0,1,0), dist=2.1 (3 candidates)
```

### Placement Progress
```
[Alpha] 📋 Found 3 viable face(s) for placement
[Alpha] 🎯 Trying face 1/3 (score: 85.3, attempt: 1/10)
```

### Success/Failure
```
[Alpha] ✅ Successfully placed stone at [0, 1, 0] (face 1, attempt 2)
[Alpha] ❌ Failed to place block at [0, 2, 0] after 10 attempts across 3 face(s)
```

### Build Summary
```
[Alpha] 🏁 Placement complete!
[Alpha]    ✅ Success: 45/50 (90.0%)
[Alpha]    ❌ Failed: 3/50
[Alpha]    ⏭️ Skipped: 2/50
```

## Testing

To test the placement system:

```javascript
// Test single block placement
const testPos = bot.entity.position.offset(2, 0, 0);
const success = await placeAt(bot, testPos, 'stone');
console.log('Single block test:', success ? 'PASS' : 'FAIL');

// Test multiple blocks
const testPositions = [
  new Vec3(0, 0, 0),
  new Vec3(0, 1, 0),
  new Vec3(0, 2, 0)
];
const result = await placeMultiple(bot, testPositions, 'stone', {
  useBuildOrder: true
});
console.log('Multi-block test:', result.success === 3 ? 'PASS' : 'FAIL');
```

## Future Enhancements

Potential improvements for future versions:

1. **Machine Learning**: Train models to predict best faces based on context
2. **Parallel Placement**: Multiple bots coordinating placement
3. **Material Optimization**: Choose block types based on availability
4. **Undo Mechanism**: Remove incorrectly placed blocks
5. **Blueprint System**: Pre-defined structure templates
6. **Collision Avoidance**: Prevent bots from blocking each other

## Credits

Implemented as part of the Minecraft multiplayer data collection system.

**Key Components:**
- Face scoring and selection
- Line-of-sight validation
- Build order optimization
- Error handling and fallbacks

**Version:** 1.0.0  
**Last Updated:** 2024-11-20
