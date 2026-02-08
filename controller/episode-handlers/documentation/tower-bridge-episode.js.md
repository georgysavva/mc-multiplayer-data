# tower-bridge-episode.js Documentation

## Overview

`tower-bridge-episode.js` implements tower and bridge building episodes where bots construct vertical towers and horizontal bridges. This episode evaluates complex construction coordination, scaffolding usage, and multi-phase building strategies.

## Class: TowerBridgeEpisode (Not Exported)

The file defines phase functions for tower-bridge construction but doesn't export a class.

## Configuration Constants

| Constant               | Value    | Description                          |
| ---------------------- | -------- | ------------------------------------ |
| `BLOCK_PLACE_DELAY_MS` | `300`    | Delay between block placements       |
| `TOWER_HEIGHT`         | `8`      | Standard tower height                |
| `BRIDGE_LENGTH`        | `10`     | Standard bridge length               |
| `PHASE_TIMEOUT_MS`     | `120000` | Phase completion timeout (2 minutes) |

## Episode Characteristics

**Construction Focus:**

- Multi-phase building coordination
- Tower and bridge construction
- Scaffolding and support management
- Complex structural engineering

**Key Features:**

- Phased construction approach
- Error handling and recovery
- Pathfinder integration for navigation
- Material management and cleanup

## Building Phases

### Tower Construction Phase

- Vertical pillar jumping technique
- Height validation and error recovery
- Pathfinder-assisted building approach

### Bridge Construction Phase

- Horizontal bridge spanning
- Support structure management
- Terrain adaptation and gap crossing

## Technical Implementation

### Construction Strategy

```javascript
// Multi-phase building with error handling
try {
  await buildTowerUnderneath(bot, towerHeight, args, options);
  await buildBridgeWithPathfinder(bot, bridgeLength, args);
} catch (error) {
  // Error recovery and pathfinder cleanup
  stopPathfinder(bot);
  // Transition to stop phase
}
```

### Error Recovery

- Comprehensive try-catch blocks around building operations
- Pathfinder state cleanup on failures
- Graceful transition to stop phase
- Logging of failure reasons

## Integration Points

### Builder System Integration

- Uses `buildTowerUnderneath()` for vertical construction
- Leverages `buildBridgeWithPathfinder()` for horizontal spanning
- Integrates with `placeMultiple()` for block placement

### Movement System Integration

- Uses pathfinding for construction navigation
- Leverages `initializePathfinder()` for building movement
- Integrates with `stopPathfinder()` for cleanup

### Coordinator Integration

- Phase-based communication via `towerBridgePhase_${iterationID}`
- Proper stop phase transitions
- Episode recording lifecycle support

## Usage Examples

### Episode Execution

```javascript
// Episode automatically handles:
// - Tower construction using pillar jumping
// - Bridge building with pathfinding navigation
// - Error handling and recovery mechanisms
// - Proper cleanup and phase transitions
```

## Performance Characteristics

### Resource Usage

- **CPU**: High (complex building algorithms, pathfinding)
- **Memory**: High (structure planning, navigation state)
- **Network**: Moderate (coordinator messages, phase coordination)

### Construction Metrics

- **Tower Height**: 8 blocks vertical
- **Bridge Length**: 10 blocks horizontal
- **Success Rate**: Depends on terrain and navigation
- **Completion Time**: Variable based on complexity

## Testing Considerations

### Deterministic Behavior

- Fixed construction parameters
- Consistent building patterns
- Predictable error recovery

### Edge Cases

- **Terrain Issues**: Navigation around obstacles
- **Building Failures**: Structure completion problems
- **Pathfinding Blocks**: Alternative route finding
- **Resource Depletion**: Material availability handling

### Debug Features

- Construction progress logging
- Error condition reporting
- Pathfinder state monitoring
- Phase transition tracking
