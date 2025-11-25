# Build House Episode

## Overview

The **Build House Episode** is a collaborative building episode where two bots (Alpha and Bravo) work together to construct a complete 6×6 house with floor, walls, door, windows, and flat roof. The bots split the work by X-axis (west/east halves) and coordinate their actions through the phase-based system.

## Features

- ✅ **Collaborative Building**: Both bots work together, splitting blocks by X-axis (west/east halves)
- ✅ **Complete House Structure**: Floor, walls, door, windows, and flat roof
- ✅ **Auto-Scaffolding**: Works on non-flat terrain (hills, water, etc.) using `builder.js` placement system
- ✅ **Material Variety**: Randomly selects from 4 different material sets per episode
- ✅ **Phase-Based Construction**: Builds in logical order (floor → walls → door → windows → roof)
- ✅ **Admiration Sequence**: Bots exit through door and look at finished house
- ✅ **RCON Integration**: Uses `/give` commands for creative mode inventory

## House Specifications

### Dimensions
- **Footprint**: 6×6 blocks (36 floor blocks)
- **Height**: 5 blocks total (floor at y=0, walls y=1-4, roof at y=5)
- **Door**: Left of center on south wall (x=2, z=0)
- **Windows**: 4 windows (west, east, north-left, north-right)
- **Total Blocks**: ~140 blocks per house

### Coordinate System
- **Origin**: South-west corner at ground level
- **Axes**: +X = East, +Z = South, +Y = Up
- **Orientation**: Currently only 0° supported (south-facing door)

### Material Sets

The episode randomly selects one of four material sets:

1. **Oak House** (default)
   - Floor/Walls/Roof: `oak_planks`
   - Door: `oak_door`
   - Windows: `glass_pane`

2. **Spruce House**
   - Floor/Walls/Roof: `spruce_planks`
   - Door: `spruce_door`
   - Windows: `glass_pane`

3. **Stone House**
   - Floor/Walls: `stone_bricks`
   - Roof: `stone_brick_slab`
   - Door: `oak_door`
   - Windows: `glass_pane`

4. **Cobblestone House**
   - Floor/Walls/Roof: `cobblestone`
   - Door: `iron_door`
   - Windows: `glass`

## Episode Flow

### Phase Sequence

1. **Spawn Phase**: Bots teleport to random location (handled by teleport system)
2. **Initial Eye Contact**: Bots look at each other for 1.5 seconds
3. **Planning**: Determine house origin at midpoint between bots
4. **Blueprint Generation**: Create 6×6 house blueprint with ~140 blocks
5. **Material Distribution**: Both bots receive blocks via RCON `/give`
6. **Building Phases**:
   - **Floor** (36 blocks): Both bots place floor blocks in west/east halves
   - **Walls** (72 blocks): Build 4-layer walls with door opening
   - **Door** (2 blocks): Place oak_door (lower and upper halves)
   - **Windows** (4 blocks): Place glass_panes
   - **Roof** (36 blocks): Place flat roof covering entire house
7. **Exit & Admire**: Bots pathfind through door, back up 7 blocks, look at house
8. **Stop Phase**: Episode ends, cleanup, prepare for next episode

### Work Distribution

Blocks are split by **X-axis (west/east halves)**:
- **Alpha Bot**: Blocks in west half
- **Bravo Bot**: Blocks in east half

This ensures:
- Fair work distribution (~50/50 split)
- Reduced collision (bots work on separate halves)
- Natural spacing for pathfinding

## Configuration

### Episode Class Properties

```javascript
class BuildHouseEpisode extends BaseEpisode {
  static INIT_MIN_BOTS_DISTANCE = 10;      // Minimum spawn distance
  static INIT_MAX_BOTS_DISTANCE = 20;      // Maximum spawn distance
  static WORKS_IN_NON_FLAT_WORLD = true;   // Auto-scaffolding enabled
}
```

### Constants

```javascript
const INITIAL_EYE_CONTACT_MS = 1500;    // Initial look duration
const FINAL_EYE_CONTACT_MS = 2000;      // Final admiration duration
const BLOCK_PLACE_DELAY_MS = 300;       // Delay between placing blocks
const ORIENTATION = 0;                   // Only 0° supported (south-facing)
```

## Usage

### Enable in Episode Rotation

Edit `episode-handlers/index.js`:

```javascript
const defaultEpisodeTypes = [
  "towerBridge",
  "buildHouse",  // ← Uncomment this line
  // ... other episodes
];
```

### Run Specific Episode Type

```bash
# Docker environment variable
EPISODE_TYPES=buildHouse

# Or run only buildHouse episodes
docker-compose up -d
```

### Smoke Test Mode

Test the episode in isolation:

```bash
# Set smoke_test=1 to run each episode type once
SMOKE_TEST=1 docker-compose up
```

## Technical Details

### File Structure

```
episode-handlers/
├── build-house-episode.js       # Main episode class
├── index.js                      # Episode registration
└── BUILD_HOUSE_EPISODE_README.md

utils/
└── building.js                   # House building utilities
```

### Key Functions

#### `utils/building.js`

- **`makeHouseBlueprint6x6(options)`**: Generate blueprint with ~140 blocks
- **`rotateLocalToWorld(local, origin, orientation)`**: Transform coordinates
- **`splitWorkByXAxis(targets, alpha, bravo)`**: Divide work between bots
- **`ensureBlocks(bot, rcon, materials)`**: Give blocks via RCON
- **`buildPhase(bot, targets, options)`**: Build assigned blocks
- **`admireHouse(bot, doorPos, center, distance)`**: Exit and look at house

#### `episode-handlers/build-house-episode.js`

- **`BuildHouseEpisode`**: Main episode class extending `BaseEpisode`
- **`getOnBuildHousePhaseFn(...)`**: Phase handler for building sequence

### Auto-Scaffolding

The episode uses `builder.js` functions which automatically handle scaffolding:

```javascript
// From builder.js
async function placeAt(bot, targetPos, itemName, options) {
  // Finds reference block (neighbor to click on)
  // If no neighbor exists, auto-scaffolds
  // Retries up to 5 times with pathfinding
}
```

This allows houses to be built on:
- Flat terrain 
- Hills and slopes 
- Over water 
- In caves (with lighting) 

## Troubleshooting

### Common Issues

1. **Bots get stuck during building**
   - Check pathfinder is initialized correctly
   - Increase `BLOCK_PLACE_DELAY_MS` to give more time between placements
   - Verify RCON is giving blocks successfully

2. **Blocks not placing**
   - Ensure creative mode or RCON `/give` is working
   - Check `builder.js` logs for placement failures
   - Verify chunks are loaded (auto-forceload should handle this)

3. **Bots can't exit through door**
   - Door might not be placed correctly (check logs)
   - Pathfinder might need more time (increase sleep in `admireHouse()`)
   - Verify door is at correct position (x=2, y=1-2, z=0 in local coords)

4. **Episode hangs at end**
   - Check stopPhase coordination (see MEMORY about PVP episode fix)
   - Verify both bots complete all phases
   - Check for errors in tearDownEpisode

### Debug Logging

Enable verbose logging:

```javascript
// In build-house-episode.js
console.log(`[${bot.username}] Building phase: ${phaseName}`);
console.log(`[${bot.username}]    My blocks: ${myTargets.length}`);
```

Look for:
- Success messages: ` Placed block at (x, y, z)`
- Failure messages: ` Failed to place at (x, y, z)`
- Material distribution: ` 64x oak_planks`

## Future Enhancements

### Planned Features

- [ ] **Rotation Support**: Add 90°, 180°, 270° orientations
- [ ] **Sloped Roof**: Implement stairs-based roof with eaves
- [ ] **Interior Decoration**: Add torches, crafting table, bed
- [ ] **Size Variations**: 3×3, 7×7, custom dimensions
- [ ] **Multi-Story**: Build 2-3 story houses
- [ ] **Material Customization**: User-defined material sets
- [ ] **Landscaping**: Clear area, add path to door

### Extension Points

To add new features, modify:

1. **Blueprint**: Edit `makeHouseBlueprint6x6()` in `utils/building.js`
2. **Materials**: Add to `MATERIAL_SETS` array in `build-house-episode.js`
3. **Phases**: Add new phase to `phases` array in `getOnBuildHousePhaseFn()`

## Examples

### Example Episode Output

```
[Alpha] Starting BUILD HOUSE phase 0
[Alpha] STEP 1: Bot spawned
[Alpha] Making eye contact with Bravo...
[Alpha] Planning house location...
[Alpha] House origin: (123, 64, 456)
[Alpha] Generating blueprint...
[Alpha]    Total blocks: 140
[Alpha] Receiving building materials...
[Alpha]    72x oak_planks
[Alpha]    3x oak_door
[Alpha]    6x glass_pane
[Alpha] Initializing pathfinder...
[Alpha] Building house in phases...
[Alpha] ═══════════════════════════════════════
[Alpha] Building phase: FLOOR
[Alpha]    My blocks: 18/36
[Alpha] Building 18 blocks in phase...
[Alpha]    Success: 18/18
[Alpha]    Failed: 0/18
[Alpha] ═══════════════════════════════════════
[Alpha] Building phase: WALLS
[Alpha]    My blocks: 36/72
[Alpha] Building 36 blocks in phase...
[Alpha]    Success: 36/36
[Alpha]    Failed: 0/36
[Alpha] ═══════════════════════════════════════
[Alpha] Building phase: DOOR
[Alpha]    My blocks: 1/2
[Alpha] Building 1 blocks in phase...
[Alpha]    Success: 1/1
[Alpha]    Failed: 0/1
[Alpha] ═══════════════════════════════════════
[Alpha] Building phase: WINDOWS
[Alpha]    My blocks: 2/4
[Alpha] Building 2 blocks in phase...
[Alpha]    Success: 2/2
[Alpha]    Failed: 0/2
[Alpha] ═══════════════════════════════════════
[Alpha] Building phase: ROOF
[Alpha]    My blocks: 18/36
[Alpha] Building 18 blocks in phase...
[Alpha]    Success: 18/18
[Alpha]    Failed: 0/18
[Alpha] All phases complete!
[Alpha] Exiting and admiring house...
[Alpha] Exiting through door...
[Alpha] Admiring the house...
[Alpha] Admiration complete!
[Alpha] BUILD HOUSE phase complete!
```

## Credits

- **Design**: Based on comprehensive house-building specification
- **Implementation**: Uses existing `builder.js` utilities for robust placement
- **Coordination**: Leverages `BaseEpisode` phase system for synchronization
- **Auto-Scaffolding**: Powered by `placeAt()` and `placeMultiple()` functions

## License

Part of the mc-multiplayer-data collection system.
