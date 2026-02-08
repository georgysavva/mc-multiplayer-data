# structureEval.js Documentation

## Overview

`structureEval.js` implements structure evaluation episodes where one bot builds while the other observes. This episode evaluates builder-observer social dynamics, construction observation, and role-based coordination.

## Class: StructureEvalEpisode

### Static Properties

| Property                  | Value  | Description                     |
| ------------------------- | ------ | ------------------------------- |
| `WORKS_IN_NON_FLAT_WORLD` | `true` | Supports non-flat world terrain |

### Episode Characteristics

**Social Evaluation Focus:**

- Builder-observer role assignment
- Independent structure planning
- Coordinated timing between roles
- Structure viewing and evaluation

**Key Features:**

- Role-based bot assignment (builder vs observer)
- Independent randomization for each bot
- Synchronized structure viewing
- Comprehensive evaluation metadata

## Configuration Constants

| Constant               | Value                                              | Description                    |
| ---------------------- | -------------------------------------------------- | ------------------------------ |
| `BLOCK_PLACE_DELAY_MS` | `1500`                                             | Delay between block placements |
| `ALL_STRUCTURE_TYPES`  | `["horizontal_1x4", "vertical_2x1", "square_2x2"]` | Available structure types      |

## Structure Types

### horizontal_1x4

- **Layout**: 1×4 horizontal strip
- **Blocks**: 4 blocks in a row
- **Complexity**: Simple linear structure

### vertical_2x1

- **Layout**: 2×1 vertical stack
- **Blocks**: 2 blocks high
- **Complexity**: Basic vertical structure

### square_2x2

- **Layout**: 2×2 square base
- **Blocks**: 4 blocks (2×2)
- **Complexity**: Small platform structure

## Role Assignment

### Builder Role

- Assigned to bot with lexicographically lower name
- Plans and builds their own structure
- Independent randomization from observer
- Timing coordination for evaluation

### Observer Role

- Assigned to bot with lexicographically higher name
- Observes builder during construction
- Plans structure but doesn't build
- Synchronized viewing after construction

## Behavioral Flow

### Independent Randomization

```javascript
// Each bot independently chooses:
const direction = getRandomDirection(); // N/S/E/W
const structureType =
  ALL_STRUCTURE_TYPES[Math.floor(Math.random() * ALL_STRUCTURE_TYPES.length)];
const blockType =
  BUILD_BLOCK_TYPES[Math.floor(Math.random() * BUILD_BLOCK_TYPES.length)];
```

### Coordinated Execution

1. **Area Clearing**: Both bots move to designated areas
2. **Structure Planning**: Independent planning phase
3. **Role Execution**: Builder builds, observer waits
4. **Viewing Phase**: Both bots view builder's structure
5. **Return Phase**: Both bots return to start positions

## Integration Points

### Building System Integration

- Uses `buildStructure()` for construction
- Leverages `placeMultiple()` for block placement
- Integrates with structure generation functions

### Movement System Integration

- Uses pathfinding for area navigation
- Leverages `gotoWithTimeout()` for positioning
- Integrates with `lookAtSmooth()` for viewing

### Coordinator Integration

- Phase-based communication via `structureEvalPhase_${iterationID}`
- Proper stop phase transitions
- Episode recording lifecycle support

## Usage Examples

### Episode Execution

```javascript
// Episode automatically handles:
// - Role assignment based on bot names
// - Independent randomization for each bot
// - Coordinated builder-observer dynamics
// - Structure viewing and evaluation
// - Comprehensive metadata collection
```

## Performance Characteristics

### Resource Usage

- **CPU**: High (building calculations, pathfinding)
- **Memory**: Moderate (structure planning, position tracking)
- **Network**: Low (coordinator messages)

### Timing Characteristics

- **Building Phase**: Variable based on structure size
- **Viewing Phase**: Fixed duration for evaluation
- **Total Episode**: Depends on structure complexity

## Testing Considerations

### Deterministic Behavior

- Role assignment based on bot name comparison
- Independent RNG for each bot's choices
- Structure generation consistency

### Edge Cases

- **Building Failures**: Structure completion handling
- **Pathfinding Issues**: Navigation around obstacles
- **Timing Coordination**: Synchronization between roles

### Debug Features

- Role assignment logging
- Structure planning verification
- Building progress tracking
- Timing coordination monitoring
