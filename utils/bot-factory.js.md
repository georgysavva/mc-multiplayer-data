# bot-factory.js Documentation

## Overview

`bot-factory.js` provides a centralized factory function for creating Mineflayer bot instances with pre-configured plugins and event handlers. This utility simplifies bot creation by handling plugin loading, error handling, and essential event setup.

## Core Function

### makeBot(config)

Creates a new Mineflayer bot instance with all essential plugins and event handlers.

**Parameters:**
```javascript
config = {
  username: string,    // Bot username
  host: string,        // Server host
  port: number,        // Server port
  version: string      // Minecraft version (defaults to "1.20.4")
}
```

**Returns:** `Bot` - Fully configured Mineflayer bot instance

## Plugin Architecture

### Core Plugins (Always Loaded)

| Plugin | Purpose | Source |
|--------|---------|--------|
| **pathfinder** | Intelligent navigation and movement | mineflayer-pathfinder |
| **PvP** | Combat and entity interaction | mineflayer-pvp |

### Optional Plugins (Commented Out)

These plugins can be enabled by uncommenting the code:

#### Tool Plugin
```javascript
// Automatic tool selection for mining/digging
// npm install mineflayer-tool
```
- Automatically selects appropriate tools for breaking blocks
- Improves mining efficiency

#### Armor Manager
```javascript
// Automatic armor equipping
// npm install mineflayer-armor-manager
```
- Automatically equips best available armor
- Manages armor durability

#### Collect Block
```javascript
// Automatic item collection
// npm install mineflayer-collectblock
```
- Automatically picks up dropped items
- Streamlines resource gathering

#### Auto Eat
```javascript
// Automatic food consumption
// npm install mineflayer-auto-eat
```
- Automatically eats when hungry
- Maintains health and saturation

## Built-in Mineflayer Capabilities

The factory provides access to all core Mineflayer features:

### Block Operations
- `bot.dig(block)` - Break blocks
- `bot.placeBlock(block, face)` - Place blocks
- `bot.canSeeBlock(block)` - Line of sight checks
- `bot.findBlock(options)` - Search for blocks
- `bot.blockAt(position)` - Get block at position

### Movement & Navigation
- `bot.pathfinder` - Advanced pathfinding (via plugin)
- `bot.setControlState(state, value)` - Manual movement controls
- `bot.look(yaw, pitch)` / `bot.lookAt(position)` - Camera control

### Inventory Management
- `bot.inventory` - Full inventory access
- `bot.equip(item, destination)` - Equip items
- `bot.craft(recipe, count)` - Crafting recipes
- `bot.creative.setInventorySlot(slot, item)` - Creative mode inventory

### Entity Interaction
- `bot.attack(entity)` - Attack entities
- `bot.activateItem()` - Use items (eat, shoot bow, etc.)
- `bot.activateBlock(block)` - Interact with blocks
- `bot.nearestEntity(filter)` - Find closest entity

### Communication
- `bot.chat(message)` - Send chat messages
- `bot.whisper(username, message)` - Send private messages

### World Information
- `bot.entity` - Bot's entity data (position, health, etc.)
- `bot.players` - Other players on server
- `bot.entities` - All entities in world
- `bot.game` - Game state information

## Event Handlers

The factory automatically sets up essential event listeners:

### Connection Events
- **end** - Bot disconnected from server
- **kicked** - Bot was kicked with reason
- **error** - Connection or protocol errors

### Gameplay Events
- **spawn** - Bot spawned in world (logs position and game mode)
- **health** - Health changed (warns when health ≤ 5)
- **death** - Bot died (logs death position)
- **respawn** - Bot respawned after death

## Exported Pathfinding Classes

The module re-exports essential pathfinding classes for convenience:

```javascript
const { Movements, GoalNear, GoalNearXZ, GoalXZ, GoalBlock, GoalFollow } = require('./utils/bot-factory');
```

### Movement Classes

#### Movements
Configuration class for pathfinding behavior:
```javascript
const movements = new Movements(bot, mcData);
// Configure movement costs, abilities, etc.
```

#### Goal Classes

| Goal Class | Description | Use Case |
|------------|-------------|----------|
| **GoalNear** | Reach within distance of position | General navigation |
| **GoalNearXZ** | Reach position ignoring Y coordinate | Horizontal movement |
| **GoalXZ** | Reach exact X,Z coordinates | 2D positioning |
| **GoalBlock** | Reach specific block position | Block interaction |
| **GoalFollow** | Follow another entity | Chasing/trailing |

## Usage Examples

### Basic Bot Creation
```javascript
const { makeBot } = require('./utils/bot-factory');

const bot = makeBot({
  username: 'MyBot',
  host: 'localhost',
  port: 25565,
  version: '1.20.4'
});

// Bot is now ready with pathfinder and PvP plugins loaded
```

### Using Pathfinding
```javascript
const { Movements, GoalNear } = require('./utils/bot-factory');

// Configure pathfinding
const movements = new Movements(bot, mcData);
movements.canDig = true;
bot.pathfinder.setMovements(movements);

// Navigate to a position
const goal = new GoalNear(100, 64, 100, 1);
bot.pathfinder.setGoal(goal);
```

### Plugin Extension
```javascript
// Enable additional plugins by uncommenting in makeBot()
const bot = makeBot({
  username: 'EnhancedBot',
  host: 'localhost',
  port: 25565
});

// Bot now has tool selection, armor management, item collection, and auto-eating
```

## Error Handling

The factory includes comprehensive error handling:

- **Plugin Loading**: Graceful degradation if optional plugins unavailable
- **Connection Issues**: Automatic retry and error logging
- **Health Monitoring**: Low health warnings
- **Death Tracking**: Position logging for debugging

## Performance Considerations

### Resource Usage
- **Memory**: Moderate (plugin overhead + event listeners)
- **CPU**: Low (event-driven, plugins only active when needed)
- **Network**: Minimal (only sends when explicitly commanded)

### Optimization Tips
- Disable unused optional plugins to reduce memory footprint
- Configure pathfinding movements for specific use cases
- Monitor health events for performance-critical applications
- Use appropriate goal types for different navigation needs

## Integration Notes

This factory is designed to work seamlessly with the episode system:

- **Pathfinder Integration**: Required for most episode movement
- **PvP Integration**: Required for combat episodes
- **Event Logging**: Consistent with episode logging patterns
- **Plugin Compatibility**: Works with all episode handler requirements

The factory provides a standardized bot creation interface that ensures all bots have consistent capabilities and behavior patterns across the entire data collection system.
