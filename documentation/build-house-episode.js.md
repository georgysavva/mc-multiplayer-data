# build-house-episode.js Documentation

## Overview

`build-house-episode.js` implements collaborative house building where two bots work together to construct a complete 5x5x5 house. This episode demonstrates advanced work division, phased construction, and proper bot synchronization.

## Class: BuildHouseEpisode

### Static Properties

| Property | Value | Description |
|----------|-------|-------------|
| `INIT_MIN_BOTS_DISTANCE` | `10` | Minimum distance between bots during house building |
| `INIT_MAX_BOTS_DISTANCE` | `20` | Maximum distance between bots during house building |
| `WORKS_IN_NON_FLAT_WORLD` | `true` | Supports non-flat worlds (auto-scaffolding enabled) |

### Constructor

```javascript
constructor(sharedBotRng)
```

**Parameters:**
- `sharedBotRng` - Shared random number generator

**Behavior:**
- Selects random material set for the episode (currently fixed to cobblestone materials)

### Material Configuration

```javascript
const MATERIALS = {
  floor: "cobblestone",
  walls: "cobblestone",
  door: "oak_door",
  windows: "glass_pane",
  roof: "cobblestone"
};
```

## House Blueprint

### Dimensions
- **Size**: 5×5×5 blocks (25×25×25 in world space)
- **Total Blocks**: ~104 blocks

### Structure Components

| Component | Blocks | Description |
|-----------|--------|-------------|
| Floor | 25 | Complete base layer at Y=0 |
| Walls | 48 | 3-layer walls (Y=1 to Y=3) |
| Door | 2 | Oak door at front (x=2, z=0, y=1-2) |
| Windows | 4 | Glass panes on sides |
| Roof | 25 | Complete top layer at Y=4 |

### Blueprint Generation

#### makeHouseBlueprint5x5(materials)
Generates complete house blueprint with material assignments.

**Parameters:**
- `materials` - Object containing material mappings

**Returns:** Array of block specifications with position, material, and phase information

### Work Division

#### splitWorkByXAxis(targets, botName, otherBotName)
Divides work between bots using X-axis based splitting.

**Parameters:**
- `targets` - Array of block targets
- `botName` - Current bot name ("Alpha" or "Bravo")
- `args.bot_name` - Other bot name
- `args.other_bot_name` - Other bot name

**Returns:** `{alphaTargets, bravoTargets}`

**Division Logic:**
- **Alpha**: x=0, 1, 2 (west half + center column) ≈ 60% of blocks
- **Bravo**: x=3, 4 (east half) ≈ 40% of blocks

## Construction Phases

### Phase Sequence
1. **Floor** - Complete base layer
2. **Walls** - Three layers of exterior walls
3. **Door** - Front entrance placement
4. **Windows** - Side window placement
5. **Roof** - Complete top layer

### Phase Execution
Each phase follows the same pattern:
1. Get targets for current phase
2. Split work between bots
3. Each bot builds assigned blocks
4. Synchronize before next phase

## Episode Flow

### Main Sequence

1. **Step 1**: Bots spawn (handled by teleport phase)
2. **Step 2**: Initial eye contact (1.5s)
3. **Step 3**: Determine house location (midpoint between bots)
4. **Step 4**: Generate blueprint and convert to world coordinates
5. **Step 5**: Initialize pathfinder with building settings
6. **Step 6**: Build house in phases (floor → walls → door → windows → roof)
7. **Step 7**: Stop pathfinder
8. **Step 8**: Exit through door and admire house
9. **Step 9**: Return to spawn position
10. **Step 10**: Final admiration and transition to stop phase

### Key Behaviors

#### House Location Planning
```javascript
// Place house origin at midpoint between bots
const worldOrigin = new Vec3(
  Math.floor((botPos.x + otherBotPos.x) / 2),
  Math.floor(botPos.y),
  Math.floor((botPos.z + otherBotPos.z) / 2)
);
```

#### Work Assignment
```javascript
// CRITICAL: Direct string comparison for bot assignment
const myTargets = bot.username === "Alpha" ? alphaTargets : bravoTargets;
```

#### Phase Synchronization
```javascript
// Wait for other bot to finish current phase
await sleep(2000); // Give other bot time to catch up
```

## Error Handling

### Build Failure Detection
- **Threshold**: >50% blocks failed in a phase = abort
- **Behavior**: Log error, stop pathfinder, transition to stop phase
- **Pattern**: Wrapped in try-catch blocks around building operations

### Pathfinder Management
- Initialized once at episode start with building-appropriate settings
- Stopped after construction completes
- Re-initialized for admiration movement

## Dependencies

### Required Imports
- `makeHouseBlueprint5x5, rotateLocalToWorld, splitWorkByXAxis, ensureBlocks, buildPhase, cleanupScaffolds, admireHouse, calculateMaterialCounts` from `../utils/building`
- `initializePathfinder, stopPathfinder` from `../utils/movement`
- `BaseEpisode` from `./base-episode`
- `pickRandom` from `../utils/coordination`
- `ensureBotHasEnough, unequipHand` from `../utils/items`

## Configuration Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `INITIAL_EYE_CONTACT_MS` | `1500` | Initial look duration |
| `FINAL_EYE_CONTACT_MS` | `2000` | Final admiration duration |
| `BLOCK_PLACE_DELAY_MS` | `300` | Delay between block placements |
| `ORIENTATION` | `0` | House orientation (south-facing) |

## Integration Points

### Coordinator Integration
- Uses phase-based communication (`buildHousePhase_${iterationID}`)
- Implements proper stop phase transitions
- Supports episode recording lifecycle

### Building System Integration
- Leverages `buildPhase()` for robust block placement
- Uses work division utilities for collaborative construction
- Integrates with admiration system for post-build behavior

## Usage Example

```javascript
// Episode automatically handles:
// - Material setup and inventory management
// - Blueprint generation and coordinate conversion
// - Work division between Alpha and Bravo bots
// - Phased construction with synchronization
// - Error handling and graceful failure recovery
// - Post-construction admiration sequence
```

## Testing Considerations

### Critical Bug Fixes
- **Work Assignment Bug**: Fixed `bot.username === args.bot_name` comparison that caused both bots to get same work assignments
- **Phase Synchronization**: Added delays between phases to ensure both bots complete work before advancing
- **Error Recovery**: Added try-catch blocks to prevent hanging on build failures

### Performance Notes
- Pathfinder initialization optimized for building tasks
- Block placement delays prevent spam-clicking
- Memory management through proper cleanup
