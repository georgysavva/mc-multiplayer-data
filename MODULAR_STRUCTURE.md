# Modular Structure Documentation

## Overview

The original `senders.js` file (1029 lines) has been refactored into a modular structure to improve maintainability, testability, and code organization. This document outlines the new structure and how to use it.

## File Structure

```
├── senders-modular.js          # New main entry point (68 lines)
├── config/
│   └── args.js                 # Command line argument parsing
├── utils/
│   ├── constants.js            # Configuration constants
│   ├── helpers.js              # General utility functions
│   ├── movement.js             # Movement and physics functions
│   ├── coordination.js         # Bot coordination and communication
│   └── bot-factory.js          # Bot creation and setup
├── episode-handlers/
│   └── index.js                # Episode management functions
├── straight-line-episode.js    # Existing episode file
├── chase-episode.js            # Existing episode file
├── orbit-episode.js            # Existing episode file
└── senders.js                  # Original file (kept for reference)
```

## Module Descriptions

### 1. `config/args.js`
- **Purpose**: Command line argument parsing with default values
- **Exports**: `parseArgs()`
- **Usage**: Centralized configuration management

### 2. `utils/constants.js`
- **Purpose**: All configuration constants and magic numbers
- **Exports**: Movement constants, landable blocks, timing parameters
- **Benefits**: Easy to modify behavior without hunting through code

### 3. `utils/helpers.js`
- **Purpose**: General utility functions used across modules
- **Exports**: `sleep()`, `rand()`, `choice()`, `equipFirst()`
- **Benefits**: Reusable utilities with clear documentation

### 4. `utils/movement.js`
- **Purpose**: All movement-related functions and physics
- **Exports**: `walk()`, `jump()`, `lookAtSmooth()`, `land_pos()`, `random_pos()`, `run()`, `stopAll()`
- **Benefits**: Isolated movement logic, easier to test and modify

### 5. `utils/coordination.js`
- **Purpose**: Inter-bot communication and RCON functionality
- **Exports**: `BotCoordinator` class, `rconTp()`
- **Benefits**: Clean separation of networking concerns

### 6. `utils/bot-factory.js`
- **Purpose**: Bot creation and initial setup
- **Exports**: `makeBot()`
- **Benefits**: Centralized bot configuration

### 7. `episode-handlers/index.js`
- **Purpose**: Episode management and phase handlers
- **Exports**: All episode handler functions
- **Benefits**: Organized episode logic, easier to add new episodes

## Migration Guide

### Using the New Structure

1. **Replace the old senders.js**:
   ```bash
   # Backup the original
   mv senders.js senders-original.js
   
   # Use the new modular version
   mv senders-modular.js senders.js
   ```

2. **No changes needed to**:
   - Command line arguments
   - Episode files (straight-line-episode.js, chase-episode.js, orbit-episode.js)
   - External scripts or configurations

### Adding New Features

1. **New Movement Function**:
   - Add to `utils/movement.js`
   - Export in module.exports
   - Import where needed

2. **New Episode Type**:
   - Create new episode file (e.g., `follow-episode.js`)
   - Import in `episode-handlers/index.js`
   - Add to episode selection in `getOnTeleportPhaseFn()`

3. **New Configuration**:
   - Add constant to `utils/constants.js`
   - Add argument to `config/args.js` if needed

## Benefits of Modular Structure

### 1. **Maintainability**
- Each module has a single responsibility
- Easy to locate and modify specific functionality
- Clear dependencies between modules

### 2. **Testability**
- Individual modules can be unit tested
- Mock dependencies easily
- Isolated testing of movement, coordination, etc.

### 3. **Reusability**
- Utility functions can be reused across episodes
- Movement functions available to all episode types
- Coordination logic shared between different bot types

### 4. **Extensibility**
- Easy to add new episode types
- Simple to add new movement patterns
- Clear structure for new features

### 5. **Code Organization**
- Related functions grouped together
- Clear module boundaries
- Reduced cognitive load when working on specific features

## Example: Adding a New Episode

```javascript
// 1. Create new-episode.js
const { lookAtSmooth } = require('./utils/movement');
const { sleep } = require('./utils/helpers');

function newEpisodeBehavior(bot, coordinator, args) {
  // Implementation here
}

function getOnNewEpisodePhaseFn(bot, sharedBotRng, coordinator, iterationID, otherBotName, episodeNum, getOnStopPhaseFn, args) {
  // Phase handler implementation
}

module.exports = { newEpisodeBehavior, getOnNewEpisodePhaseFn };

// 2. Import in episode-handlers/index.js
const { getOnNewEpisodePhaseFn } = require('../new-episode');

// 3. Add to episode selection
const episodeTypes = ["walkAndLook", "straightLineWalk", "chase", "orbit", "newEpisode"];
```

## Testing the Modular Structure

1. **Verify all imports work**:
   ```bash
   node -c senders-modular.js
   ```

2. **Test individual modules**:
   ```javascript
   const { sleep, rand } = require('./utils/helpers');
   console.log(await sleep(100)); // Should work
   console.log(rand(1, 10)); // Should return number between 1-10
   ```

3. **Run the full system**:
   ```bash
   node senders-modular.js --bot_name TestBot
   ```

## Backward Compatibility

The modular structure maintains 100% backward compatibility:
- Same command line arguments
- Same episode behavior
- Same coordination protocol
- Same external interfaces

The only change is internal code organization for better maintainability.
