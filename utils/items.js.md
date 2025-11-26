# items.js Documentation

## Overview

`items.js` provides inventory management utilities for Minecraft bots. This module handles equipment operations and inventory stock management, enabling reliable item distribution and equipment control across episodes.

## Core Functions

### Equipment Management

#### unequipHand(bot, itemType)
Safely removes items from the bot's main hand slot.

**Parameters:**
- `bot` - Mineflayer bot instance
- `itemType` - Optional item type filter (e.g., "sword", "pickaxe")

**Returns:** `Promise<boolean>` - Success status

**Validation Process:**
1. **Bot State Check**: Validates bot initialization
2. **Equipment Check**: Confirms item is equipped
3. **Type Filtering**: Optional item type verification
4. **Unequip Operation**: Safe removal from hand slot

**Type Matching Logic:**
```javascript
// Checks both item name and display name
itemName.includes(itemType.toLowerCase()) ||
displayName.includes(itemType.toLowerCase())
```

### Inventory Stock Management

#### ensureBotHasEnough(bot, rcon, itemName, targetCount)
Ensures bot has sufficient quantity of specified item via RCON distribution.

**Parameters:**
- `bot` - Mineflayer bot instance
- `rcon` - RCON connection for item distribution
- `itemName` - Minecraft item identifier (e.g., "stone")
- `targetCount` - Desired inventory quantity (default: 128)

**Process:**
1. **Item Validation**: Verify item exists in Minecraft data
2. **Stock Assessment**: Count current inventory quantity
3. **Need Calculation**: Determine required additional items
4. **RCON Distribution**: Execute `/give` command for missing items
5. **Verification**: Confirm inventory update after distribution

**RCON Command Format:** `give <username> minecraft:<itemName> <quantity>`

## Technical Implementation

### Equipment Operations
- Uses `bot.heldItem` to check current hand contents
- Calls `bot.unequip("hand")` for safe removal
- Includes comprehensive error checking
- Provides detailed logging for debugging

### Inventory Management
- Leverages `minecraft-data` for item ID resolution
- Uses `bot.inventory.count(itemId, null)` for stock counting
- Implements verification delay for inventory synchronization
- Handles edge cases (unknown items, RCON failures)

## Integration Points

### Episode System Integration
- **Setup Phase**: Equipment preparation before episodes
- **Cleanup Phase**: Item removal after episode completion
- **Building Episodes**: Tool management and material distribution

### RCON System Integration
- Requires active RCON connection for item distribution
- Uses administrative commands for inventory management
- Validates command execution with response logging

### Building System Integration
- Ensures sufficient building materials before construction
- Manages tool equipping/unequipping during building phases
- Provides inventory verification for complex builds

## Usage Examples

### Equipment Management
```javascript
const { unequipHand } = require('./utils/items');

// Remove any equipped item
await unequipHand(bot);

// Remove only if it's a sword
await unequipHand(bot, 'sword');

// Safe to call even if nothing equipped
const success = await unequipHand(bot);
```

### Inventory Stocking
```javascript
const { ensureBotHasEnough } = require('./utils/items');

// Ensure bot has 64 cobblestone for building
await ensureBotHasEnough(bot, rcon, 'cobblestone', 64);

// Default 128 stone blocks
await ensureBotHasEnough(bot, rcon, 'stone');
```

### Episode Preparation Pattern
```javascript
// During episode setup
async setupEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args) {
  // Clear any existing equipment
  await unequipHand(bot);
  
  // Ensure building materials for construction episodes
  await ensureBotHasEnough(bot, rcon, 'cobblestone', 256);
  await ensureBotHasEnough(bot, rcon, 'wood', 128);
  
  // Bot is now ready with required materials
}
```

## Error Handling

### Validation Checks
- **Bot State**: Comprehensive null checking
- **Item Existence**: Minecraft data validation
- **RCON Connection**: Command execution verification
- **Inventory Updates**: Post-distribution verification

### Failure Modes
- **Unknown Items**: Throws descriptive error
- **RCON Failure**: Logs response for debugging
- **Inventory Sync**: Handles timing issues with delays

## Performance Characteristics

### Resource Usage
- **unequipHand()**: Minimal CPU, single bot operation
- **ensureBotHasEnough()**: Network operation via RCON

### Execution Time
- **unequipHand()**: < 100ms (local operation)
- **ensureBotHasEnough()**: 800-2000ms (includes RCON + verification delay)

### Network Impact
- **RCON Commands**: Single command per unequip operation
- **Item Distribution**: One command per needed item type
- **Verification**: Local inventory polling only

## Testing Considerations

### Unit Testing
- **Mock Bot**: Test with mock Mineflayer instances
- **RCON Simulation**: Mock RCON responses
- **Inventory States**: Test various inventory conditions

### Integration Testing
- **Episode Flow**: Verify in complete episode execution
- **RCON Connectivity**: Test with real Minecraft server
- **Inventory Persistence**: Verify items persist across episodes

### Edge Cases
- **Empty Inventory**: Unequip operations on empty slots
- **Unknown Items**: Error handling for invalid item names
- **RCON Timeouts**: Network failure scenarios

## Future Enhancements

### Potential Features
- **Bulk Operations**: Multiple item types in single call
- **Smart Equipping**: Best tool selection for tasks
- **Inventory Optimization**: Automatic cleanup and organization
- **Custom Items**: Support for enchanted/modified items
- **Quantity Tracking**: Persistent inventory monitoring
