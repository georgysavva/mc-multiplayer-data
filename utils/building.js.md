# building.js Documentation

## Overview

`building.js` provides comprehensive utilities for collaborative house building episodes. This module handles blueprint generation, coordinate transformations, work splitting, material management, scaffolding, and phased construction with automatic error recovery.

## Core Functions

### Blueprint Generation

#### makeHouseBlueprint5x5(options)
Generates a complete 5×5×5 house blueprint with 5 construction phases.

**Parameters:**
```javascript
options = {
  materials: {
    floor: "cobblestone",    // Default: cobblestone
    walls: "cobblestone",    // Default: cobblestone
    door: "oak_door",        // Default: oak_door
    windows: "glass_pane",   // Default: glass_pane
    roof: "cobblestone"      // Default: cobblestone
  }
}
```

**Blueprint Structure:**
```javascript
{
  x: number,        // Local X coordinate (0-4)
  y: number,        // Local Y coordinate (0-4)
  z: number,        // Local Z coordinate (0-4)
  block: string,    // Block type name
  phase: string,    // Construction phase ("floor", "walls", "door", "windows", "roof")
  data: object      // Additional block data (door orientation, etc.)
}
```

**Construction Phases:**

1. **Floor Phase** (y=0): Complete 5×5 cobblestone base
2. **Walls Phase** (y=1-3): Hollow rectangular walls with door opening
3. **Door Phase**: Oak door installation (south-facing)
4. **Windows Phase** (y=2): Glass pane windows on all sides
5. **Roof Phase** (y=4): Flat cobblestone roof

### Coordinate System

#### rotateLocalToWorld(local, origin, orientation)
Transforms local blueprint coordinates to world coordinates with rotation support.

**Parameters:**
- `local` - Local position object `{x, y, z}`
- `origin` - World origin position (Vec3)
- `orientation` - Rotation in degrees: `0`, `90`, `180`, `270`

**Rotation Logic:**
- **0°**: No rotation (default orientation)
- **90°**: Rotate 90° counterclockwise
- **180°**: Rotate 180° (flip)
- **270°**: Rotate 270° clockwise

**Formula:**
```javascript
// For 90° rotation: [rx, rz] = [-local.z, local.x]
const worldPos = new Vec3(origin.x + rx, origin.y + local.y, origin.z + rz);
```

### Work Distribution

#### splitWorkByXAxis(targets, alphaBotName, bravoBotName)
Divides construction work between two bots along the X-axis.

**Division Strategy:**
- **Alpha Bot**: Builds west half + center (x ≤ 2)
- **Bravo Bot**: Builds east half (x ≥ 3)

**Returns:**
```javascript
{
  alphaTargets: Array,    // Blocks assigned to Alpha
  bravoTargets: Array     // Blocks assigned to Bravo
}
```

**Work Balance:**
- Alpha: ~60% of blocks (west + center sections)
- Bravo: ~40% of blocks (east section only)

### Material Management

#### ensureBlocks(bot, rcon, materials)
Distributes required building materials via RCON `/give` commands.

**Parameters:**
- `bot` - Mineflayer bot instance
- `rcon` - RCON client connection
- `materials` - Object mapping block names to counts

**Process:**
1. Validates RCON connection
2. Issues `/give` commands for each material type
3. Includes 100ms delay between commands to prevent spam

#### calculateMaterialCounts(blueprint)
Calculates total material requirements from blueprint.

**Returns:** Object with block counts:
```javascript
{
  "cobblestone": 64,    // Floor + walls + roof
  "oak_door": 1,        // Door (counts as 1 item)
  "glass_pane": 4       // Four windows
}
```

### Construction Support

#### hasAdjacentSolidBlock(bot, pos)
Checks if target position has adjacent solid blocks for placement reference.

**Check Order (Priority):**
1. **Below** (y-1) - Preferred support
2. **East** (+x) - Adjacent horizontal
3. **West** (-x) - Adjacent horizontal
4. **South** (+z) - Adjacent horizontal
5. **North** (-z) - Adjacent horizontal
6. **Above** (+y) - Last resort

**Returns:** `true` if any adjacent block is solid and non-air

#### placeScaffold(bot, targetPos, args)
Places temporary cobblestone scaffold below target position for support.

**Process:**
1. Checks if scaffold position is already occupied
2. Uses `placeAt()` utility for placement
3. Tracks scaffold positions for cleanup
4. Includes error handling and retry logic

**Tracking:** All scaffold positions stored in global `scaffoldBlocks` array

### Phased Construction

#### buildPhase(bot, targets, options)
Executes construction of one phase for a single bot with auto-scaffolding.

**Parameters:**
```javascript
options = {
  args: Object,      // Episode arguments (for RCON)
  delayMs: 300       // Delay between placements (default: 300ms)
}
```

**Construction Process:**

1. **Sorting**: Bottom-up (Y), then near-to-far distance
2. **Validation**: Skip already-placed blocks
3. **Scaffolding**: Auto-place supports if needed
4. **Navigation**: Pathfind within 4 blocks of target
5. **Placement**: Use `placeAt()` with retry logic
6. **Progress**: Log every 5 blocks and final statistics

**Returns:**
```javascript
{
  success: number,   // Successfully placed blocks
  failed: number     // Failed placements
}
```

### Cleanup Operations

#### cleanupScaffolds(bot)
Removes all temporary scaffold blocks placed during construction.

**Process:**
1. Iterates through tracked scaffold positions
2. Validates block is still cobblestone
3. Uses `digWithTimeout()` for removal
4. Includes error handling for failed removals
5. Clears scaffold tracking array

### Post-Construction

#### admireHouse(bot, doorWorldPos, orientation, options)
Coordinates bot movement for house admiration sequence.

**Parameters:**
```javascript
options = {
  backOff: 7    // Distance to back away from house (default: 7 blocks)
}
```

**Admiration Sequence:**

1. **Exit**: Pathfind through door opening
2. **Positioning**: Move to viewing position based on orientation
3. **Viewing**: Face toward house center
4. **Timing**: 2-second admiration period

**Orientation Handling:**
- **0° (South)**: View from south (+Z)
- **90° (West)**: View from west (-X)
- **180° (North)**: View from north (-Z)
- **270° (East)**: View from east (+X)

## Integration Points

### Builder System Integration
- Uses `placeAt()` from builder.js for block placement
- Leverages `digWithTimeout()` from movement.js for cleanup
- Integrates with pathfinder goals for navigation

### Episode System Integration
- Designed for collaborative building episodes
- Supports multi-bot work distribution
- Includes comprehensive error handling
- Provides phase-based construction workflow

## Usage Examples

### Complete House Building Workflow
```javascript
// 1. Generate blueprint
const blueprint = makeHouseBlueprint5x5({
  materials: { walls: "stone", roof: "wood" }
});

// 2. Calculate materials
const materials = calculateMaterialCounts(blueprint);

// 3. Distribute materials
await ensureBlocks(bot, rcon, materials);

// 4. Convert to world coordinates
const worldTargets = blueprint.map(target => ({
  ...target,
  worldPos: rotateLocalToWorld(target, houseOrigin, 0)
}));

// 5. Split work between bots
const { alphaTargets, bravoTargets } = splitWorkByXAxis(worldTargets, "Alpha", "Bravo");

// 6. Build each phase
for (const phase of ["floor", "walls", "door", "windows", "roof"]) {
  const phaseTargets = alphaTargets.filter(t => t.phase === phase);
  await buildPhase(bot, phaseTargets, { args });
}

// 7. Cleanup scaffolds
await cleanupScaffolds(bot);

// 8. Admire completed house
await admireHouse(bot, doorWorldPos, 0);
```

### Custom Blueprint Creation
```javascript
// Create custom materials
const customMaterials = {
  floor: "diamond_block",
  walls: "iron_block",
  roof: "gold_block"
};

// Generate with custom materials
const luxuryHouse = makeHouseBlueprint5x5({ materials: customMaterials });
```

## Technical Implementation

### Coordinate System Details
- **Local Frame**: Origin at southwest corner, +X=east, +Z=south, +Y=up
- **World Transform**: Supports 90° rotations for varied house orientations
- **Door Positioning**: Always centered on south wall (z=0, x=2)

### Error Handling
- **Placement Failures**: Retry logic with multiple attempts
- **Navigation Issues**: Timeout protection and goal clearing
- **Material Shortages**: RCON-based distribution with validation
- **Scaffold Conflicts**: Position checking before placement/removal

### Performance Optimizations
- **Sorting Strategy**: Bottom-up construction prevents floating blocks
- **Distance-Based Navigation**: Only pathfind when >4 blocks away
- **Batch Processing**: Progress logging every 5 blocks
- **Delay Management**: Configurable delays prevent spam

## Dependencies

### Required Imports
- `Vec3` from vec3 - 3D vector mathematics
- `sleep` from ./helpers - Timing utilities
- `placeAt` from ../episode-handlers/builder - Block placement
- `digWithTimeout` from ./movement - Safe digging

### Optional Dependencies
- RCON client for material distribution
- Pathfinder plugins for navigation
- Builder utilities for advanced placement

## Future Enhancements

### Potential Features
- **Multi-Story Buildings**: Support for taller structures
- **Custom Blueprints**: User-defined building layouts
- **Advanced Scaffolding**: Pillar-based support systems
- **Interior Decoration**: Furniture and lighting placement
- **Building Styles**: Different architectural themes
