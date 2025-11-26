# fighting.js Documentation

## Overview

`fighting.js` provides combat preparation utilities for bot episodes requiring weapon usage. This module handles random sword distribution and automatic equipping, enabling consistent weapon management across PvE and PvP episodes.

## Core Functions

### giveRandomSword(bot, rcon)

Distributes a randomly selected sword to a bot via RCON commands.

**Sword Selection Pool:**
```javascript
const swords = [
  "minecraft:wooden_sword",    // Basic wooden sword
  "minecraft:stone_sword",     // Stone tier
  "minecraft:iron_sword",      // Iron tier
  "minecraft:golden_sword",    // Golden sword (fast but weak)
  "minecraft:diamond_sword",   // Diamond tier
  "minecraft:netherite_sword"  // Best tier (if available)
];
```

**Process:**
1. Randomly select sword from available types
2. Execute RCON `/give` command
3. Log distribution result with response

**RCON Command Format:** `give <username> <item> 1`

### equipSword(bot)

Automatically equips the first available sword from bot's inventory to hand slot.

**Search Logic:**
```javascript
const swordItem = bot.inventory
  .items()
  .find((item) => item.name.includes("sword"));
```

**Process:**
1. Scan inventory for any item containing "sword"
2. Equip found sword to hand slot
3. Log successful equip or warning

**Equipping:** Uses `bot.equip(item, "hand")` for weapon slot

## Integration Points

### Combat Episode Integration
- **PvP Episodes**: Weapon preparation before bot vs bot combat
- **PvE Episodes**: Sword equipping for hostile mob fighting
- **Setup Phase**: Called during episode initialization

### RCON System Integration
- Requires active RCON connection to Minecraft server
- Uses administrative commands for item distribution
- Validates command execution with response logging

## Usage Examples

### Combat Preparation
```javascript
const { giveRandomSword, equipSword } = require('./utils/fighting');

// Distribute weapon via RCON
await giveRandomSword(bot, rcon);

// Equip the received sword
await equipSword(bot);

// Bot is now ready for combat
```

### Episode Setup Pattern
```javascript
// In episode setupEpisode method
async setupEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args) {
  // Prepare for combat episodes
  await giveRandomSword(bot, rcon);
  await equipSword(bot);
  
  // Bot now has randomized weapon equipped
}
```

## Technical Implementation

### Random Selection Algorithm
- Uses `Math.random()` for uniform distribution
- All sword types have equal probability
- Includes progression from basic to advanced weapons

### Inventory Management
- Searches entire inventory for sword items
- Case-insensitive name matching ("sword" substring)
- Equips to hand slot for immediate weapon access

### Error Handling
- **RCON Failure**: Command response logged (may indicate server issues)
- **No Sword Found**: Warning logged (inventory may be empty)
- **Equip Failure**: Implicit handling (bot.equip may throw)

## Sword Type Characteristics

| Sword Type | Material | Damage | Durability | Notes |
|------------|----------|--------|------------|-------|
| **Wooden** | Wood | 4 | 59 | Basic, short lifespan |
| **Stone** | Cobblestone | 5 | 131 | Common, decent durability |
| **Iron** | Iron Ingot | 6 | 250 | Balanced performance |
| **Golden** | Gold Ingot | 4 | 32 | Fast mining, very weak |
| **Diamond** | Diamond | 7 | 1561 | High damage, long lasting |
| **Netherite** | Netherite Ingot | 8 | 2031 | Best performance (1.16+) |

## Performance Considerations

### Resource Usage
- **Network**: Single RCON command per sword distribution
- **Time**: Minimal delay for command execution
- **Inventory**: Linear search through inventory items

### Execution Time
- **RCON Command**: ~50-200ms server response time
- **Inventory Search**: O(n) where n = inventory size
- **Equip Operation**: Near-instantaneous

## Integration with Combat Systems

### PvP Plugin Integration
- Works with mineflayer-pvp for automated combat
- Sword equipping enables attack functionality
- Randomization adds behavioral variety

### Episode Combat Flow
1. **Preparation**: `giveRandomSword()` distributes weapon
2. **Equipping**: `equipSword()` prepares for combat
3. **Engagement**: PvP plugin handles attack logic
4. **Monitoring**: Health tracking and statistics collection

## Testing Considerations

### Deterministic Testing
- Random sword selection may vary between runs
- Consider seeding RNG for reproducible testing
- Verify inventory state after distribution

### Edge Cases
- **RCON Unavailable**: Graceful degradation or error handling
- **Inventory Full**: Sword distribution may fail silently
- **No Swords Available**: Equip will log warning but continue

### Validation Checks
- Confirm sword appears in inventory after `/give`
- Verify sword is equipped in hand slot
- Test combat effectiveness with different sword types

## Future Enhancements

### Potential Features
- **Weapon Selection**: Specify sword types instead of random
- **Multiple Weapons**: Support for bows, axes, etc.
- **Armor Distribution**: Complete combat loadout management
- **Durability Checking**: Replace worn weapons automatically
- **Custom Items**: Support for enchanted or special weapons
