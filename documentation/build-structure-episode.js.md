# build-structure-episode.js Documentation

## Overview

`build-structure-episode.js` implements general-purpose structure building supporting multiple structure types (walls, towers, platforms) with coordinated bot roles. This episode provides flexible building scenarios for data collection.

## Class: BuildStructureEpisode

### Static Properties

| Property | Value | Description |
|----------|-------|-------------|
| `INIT_MIN_BOTS_DISTANCE` | `8` | Minimum distance between bots |
| `INIT_MAX_BOTS_DISTANCE` | `15` | Maximum distance between bots |
| `WORKS_IN_NON_FLAT_WORLD` | `true` | Supports non-flat worlds |

### Constructor

```javascript
constructor(sharedBotRng)
```

**Parameters:**
- `sharedBotRng` - Shared random number generator

**Behavior:**
- Randomly selects structure type from available options
- Stores selection for episode execution

### Available Structure Types

```javascript
const ALL_STRUCTURE_TYPES = ["wall", "tower", "platform"];
```

## Structure Types

### Wall Structure

**Description:** Horizontal wall construction with coordinated side-by-side building

**Bot Roles:**
- Alpha builds left side, Bravo builds right side
- Deterministic assignment based on bot name comparison

**Parameters:**
- Length: 5 blocks
- Height: 3 blocks
- Direction: X-axis (east-west)

**Positioning:**
```javascript
// Alpha builds at offset +2 from current position
const startPos = botPos.offset(2, 0, 0);
positions = generateWallPositions(startPos, 5, 3, "x");
```

### Tower Structure

**Description:** Individual tower building where each bot constructs their own tower

**Bot Roles:**
- Each bot builds independently
- No coordination required

**Parameters:**
- Height: 5 blocks
- Independent positioning

**Positioning:**
```javascript
// Offset based on bot name for deterministic placement
const startPos = botPos.offset(3, 0, botNameSmaller ? 0 : 3);
positions = generateTowerPositions(startPos, 5);
```

### Platform Structure

**Description:** Shared platform construction with split work areas

**Bot Roles:**
- Split by rows (north-south halves)
- Based on relative position to platform center

**Parameters:**
- Width: 4 blocks
- Depth: 4 blocks
- Centered at midpoint between bots

**Work Division:**
```javascript
// Determine which bot is north/south of platform center
const platformCenterZ = startPos.z + depth / 2;
const botIsNorth = botPos.z < platformCenterZ;
```

## Core Functions

### buildStructure(bot, positions, blockType, args)
Main building function using enhanced placement system.

**Parameters:**
- `bot` - Mineflayer bot instance
- `positions` - Array of Vec3 positions to build at
- `blockType` - Type of block to place
- `args` - Configuration arguments

**Features:**
- Pathfinder initialization with building settings
- Intelligent build ordering via `placeMultiple()`
- Success/failure tracking and logging
- 50% success rate threshold checking

### Structure Generators

#### generateWallPositions(startPos, length, height, direction)
Creates wall block positions.

**Parameters:**
- `startPos` - Starting corner position
- `length` - Wall length
- `height` - Wall height
- `direction` - "x" or "z" axis

#### generateTowerPositions(basePos, height)
Creates vertical tower positions.

**Parameters:**
- `basePos` - Base position
- `height` - Tower height

#### generatePlatformPositions(startPos, width, depth)
Creates platform block positions.

**Parameters:**
- `startPos` - Starting corner position
- `width` - Platform width (X-axis)
- `depth` - Platform depth (Z-axis)

## Episode Flow

### Main Sequence

1. **Step 1**: Bots spawn (teleport phase)
2. **Step 2**: Initial eye contact (1.5s)
3. **Step 3**: Determine build positions based on structure type and bot role
4. **Step 4**: Build the structure using `buildStructure()`
5. **Step 5**: Final eye contact (1.5s)
6. **Step 6**: Transition to stop phase

### Role Assignment Logic

```javascript
// Deterministic role assignment based on bot name comparison
const botNameSmaller = bot.username < args.other_bot_name;

// Structure-specific role logic:
// Wall: Alpha (smaller name) builds left, Bravo builds right
// Tower: Each bot builds independently
// Platform: Split by relative position to platform center
```

## Configuration Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `ALL_STRUCTURE_TYPES` | `["wall", "tower", "platform"]` | Available structure types |
| `INITIAL_EYE_CONTACT_MS` | `1500` | Eye contact duration |
| `BUILD_BLOCK_TYPES` | `["stone", "cobblestone", "oak_planks", "bricks"]` | Available building materials |
| `BLOCK_PLACE_DELAY_MS` | `1500` | Delay between block placements |

## Error Handling

### Build Validation
- **Success Rate Check**: Requires >50% placement success
- **Logging**: Detailed success/failure statistics
- **Error Propagation**: Throws on critical failures

### Pathfinder Management
- Automatic initialization with building-appropriate settings
- Cleanup in finally block ensures proper shutdown

## Dependencies

### Required Imports
- `placeAt, placeMultiple` from `./builder`
- `initializePathfinder, stopPathfinder` from `../utils/movement`
- `BaseEpisode` from `./base-episode`
- `pickRandom` from `../utils/coordination`
- `ensureBotHasEnough, unequipHand` from `../utils/items`

## Integration Points

### Builder System Integration
- Uses `placeMultiple()` for robust block placement
- Leverages intelligent build ordering
- Supports various placement options and delays

### Coordinator Integration
- Phase-based communication via `buildPhase_${iterationID}`
- Proper stop phase transitions
- Episode recording lifecycle support

## Usage Examples

### Wall Building
```javascript
// Alpha builds left side (x+2 to x+6)
// Bravo builds right side (x+2 to x+6, z+2)
const startPos = botPos.offset(2, 0, 0);
if (botNameSmaller) {
  positions = generateWallPositions(startPos, 5, 3, "x");
} else {
  positions = generateWallPositions(startPos.offset(0, 0, 2), 5, 3, "x");
}
```

### Platform Building
```javascript
// Centered at midpoint, split by rows
const midpoint = botPos.plus(otherBotPos).scaled(0.5).floored();
const startPos = midpoint.offset(-2, 0, -2);
const botIsNorth = botPos.z < (startPos.z + 2);

// North bot builds top half, South bot builds bottom half
```

### Tower Building
```javascript
// Independent tower construction
const startPos = botPos.offset(3, 0, botNameSmaller ? 0 : 3);
positions = generateTowerPositions(startPos, 5);
```

## Testing Considerations

### Deterministic Behavior
- Role assignment based on bot name comparison ensures consistent behavior
- Shared RNG for structure type selection
- Position calculations relative to bot locations

### Performance Optimization
- Pathfinder settings optimized for building tasks
- Block placement delays prevent spam-clicking
- Memory cleanup prevents resource leaks

### Error Recovery
- Comprehensive error handling for placement failures
- Graceful degradation on partial failures
- Proper state cleanup on episode termination
