# 🚀 Enhanced Movement Capabilities

## Overview

The pathfinder system has been updated to enable **full autonomous movement capabilities** by default. Bots can now navigate complex terrain automatically by breaking blocks, placing blocks, jumping gaps, and sprinting.

## 🎯 Default Capabilities (All Enabled)

When you call `initializePathfinder(bot)` without options, bots now have:

| Capability | Status | Description |
|------------|--------|-------------|
| **Sprint** | ✅ Enabled | Bot sprints while moving for faster travel |
| **Parkour** | ✅ Enabled | Bot jumps gaps and performs parkour movements |
| **Dig Blocks** | ✅ Enabled | Bot breaks blocks to path through terrain |
| **Place Blocks** | ✅ Enabled | Bot places blocks to bridge gaps or climb |
| **Entity Detection** | ✅ Enabled | Bot avoids colliding with other entities |
| **Max Drop Down** | 4 blocks | Maximum safe fall distance |
| **Water Drops** | ✅ Unlimited | Can drop any distance into water |

## 📝 Usage Examples

### Basic Usage (Full Capabilities)
```javascript
const { initializePathfinder } = require('../utils/movement');
const { GoalNear } = require('../utils/bot-factory');

// Initialize with all capabilities enabled
initializePathfinder(bot);

// Bot will automatically:
// - Sprint to destination
// - Jump gaps
// - Break blocks in the way
// - Place blocks to bridge gaps
// - Avoid entities
bot.pathfinder.setGoal(new GoalNear(x, y, z, 3));
```

### Custom Configuration
```javascript
// Override specific capabilities
initializePathfinder(bot, {
  allowSprinting: false,  // Don't sprint (walk only)
  canDig: false,          // Don't break blocks
  canPlaceOn: false,      // Don't place blocks
  maxDropDown: 10,        // Allow larger drops
});
```

### Episode-Specific Examples

#### Chase Episode - Full Escape Capabilities
```javascript
// Runner can break/place blocks to escape
initializePathfinder(bot, {
  allowSprinting: true,
  allowParkour: true,
  canDig: true,        // Break obstacles
  canPlaceOn: true,    // Build escape routes
});
```

#### Combat Episode - Aggressive Navigation
```javascript
// Chaser can break through terrain to reach target
initializePathfinder(bot, {
  allowSprinting: true,
  canDig: true,        // Break through walls
  canPlaceOn: true,    // Build bridges to target
});
```

#### Building Episode - Careful Movement
```javascript
// Don't modify terrain while building
initializePathfinder(bot, {
  allowSprinting: false,  // Slow, careful movement
  canDig: false,          // Preserve terrain
  canPlaceOn: false,      // Only place via episode logic
});
```

## 🌍 Terrain Navigation Scenarios

### Scenario 1: Mountain Climbing
```javascript
initializePathfinder(bot);
bot.pathfinder.setGoal(new GoalNear(x, y + 50, z, 3));

// Bot will automatically:
// 1. Find climbable path
// 2. Place blocks to create stairs if needed
// 3. Jump gaps between ledges
// 4. Break overhanging blocks
```

### Scenario 2: Cave Navigation
```javascript
initializePathfinder(bot);
bot.pathfinder.setGoal(new GoalNear(x, y - 30, z, 3));

// Bot will automatically:
// 1. Dig through cave walls if needed
// 2. Drop down safely (max 4 blocks)
// 3. Place blocks to climb up
// 4. Navigate around lava/water
```

### Scenario 3: Ocean Crossing
```javascript
initializePathfinder(bot, {
  infiniteLiquidDropdownDistance: true,  // Can drop into water
  scaffoldingBlocks: [bot.registry.blocksByName.dirt.id],  // Use dirt for bridging
});
bot.pathfinder.setGoal(new GoalNear(x, y, z, 3));

// Bot will automatically:
// 1. Place blocks to bridge water
// 2. Swim if no blocks available
// 3. Drop into water from any height
```

### Scenario 4: Forest Navigation
```javascript
initializePathfinder(bot);
bot.pathfinder.setGoal(new GoalNear(x, y, z, 3));

// Bot will automatically:
// 1. Break leaves/logs in the way
// 2. Navigate around trees if faster
// 3. Jump over small obstacles
// 4. Sprint through open areas
```

## 🔧 Advanced Configuration

### Scaffolding Blocks
Specify which blocks to use for bridging:
```javascript
const mcData = require('minecraft-data')(bot.version);
initializePathfinder(bot, {
  scaffoldingBlocks: [
    mcData.blocksByName.dirt.id,
    mcData.blocksByName.cobblestone.id,
    mcData.blocksByName.stone.id,
  ]
});
```

### Custom Drop Distance
Allow bots to drop from greater heights:
```javascript
initializePathfinder(bot, {
  maxDropDown: 10,  // Allow 10-block drops (with resistance effect)
});
```

### Free Motion (Flying/Swimming)
Enable for creative mode or water navigation:
```javascript
initializePathfinder(bot, {
  allowFreeMotion: true,  // Enable 3D movement
});
```

## 📊 Performance Considerations

### When to Disable Capabilities

**Disable `canDig`** when:
- You want to preserve terrain
- Bot should only use existing paths
- Performance is critical (digging is computationally expensive)

**Disable `canPlaceOn`** when:
- You don't want bots modifying terrain
- Blocks are scarce
- Building is handled by episode logic

**Disable `allowSprinting`** when:
- You want slower, more careful movement
- Observing detailed movement patterns
- Reducing energy consumption (roleplay)

### Optimization Tips

1. **Use appropriate goals**: `GoalNearXZ` is faster than `GoalNear` when Y doesn't matter
2. **Set reasonable distances**: Pathfinding to very distant locations is expensive
3. **Stop pathfinder when done**: Always call `bot.pathfinder.setGoal(null)` when finished
4. **Timeout long paths**: Use `gotoWithTimeout()` to prevent infinite pathfinding

## 🎮 Episode Integration

All episodes now benefit from full movement capabilities:

- **PvP**: Bots can chase through terrain
- **Chase**: Runner can break/build to escape
- **Orbit**: Smooth circular movement around obstacles
- **BuildTower**: Can navigate to building location
- **Mine**: Can path to ore deposits through rock
- **PvE**: Can navigate to mob spawn locations

## 🐛 Troubleshooting

### Bot gets stuck in terrain
```javascript
// Increase max drop down
initializePathfinder(bot, {
  maxDropDown: 8,
});
```

### Bot destroys too much terrain
```javascript
// Disable digging
initializePathfinder(bot, {
  canDig: false,
});
```

### Bot doesn't bridge gaps
```javascript
// Ensure blocks are available and capability is enabled
const mcData = require('minecraft-data')(bot.version);
await ensureBotHasEnough(bot, rcon, 'dirt', 64);
initializePathfinder(bot, {
  canPlaceOn: true,
  scaffoldingBlocks: [mcData.blocksByName.dirt.id],
});
```

### Pathfinding is too slow
```javascript
// Reduce pathfinder complexity
bot.pathfinder.thinkTimeout = 5000;  // Reduce from 7500ms
bot.pathfinder.searchRadius = 64;    // Reduce from 96
```

## 📖 Related Documentation

- [BOT_CAPABILITIES.md](./BOT_CAPABILITIES.md) - Complete bot API reference
- [movement.js](./movement.js) - Movement utility functions
- [Mineflayer Pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder) - Official documentation

## 🎉 Summary

Your bots now have **full autonomous navigation capabilities** enabled by default! They can:
- ✅ Navigate any terrain automatically
- ✅ Break blocks to create paths
- ✅ Place blocks to bridge gaps
- ✅ Jump, sprint, and parkour
- ✅ Avoid entities and obstacles

All capabilities can be customized per episode as needed. Happy bot building! 🤖
