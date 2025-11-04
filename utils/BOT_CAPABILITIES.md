# 🤖 Mineflayer Bot Capabilities Reference

This document provides a comprehensive overview of all bot capabilities available in the system.

## 📦 Core Plugins (Always Loaded)

### 1. **Pathfinder Plugin** (`mineflayer-pathfinder`)
Intelligent navigation and pathfinding for bot movement.

**Available Goals:**
```javascript
const { GoalNear, GoalNearXZ, GoalBlock, GoalFollow } = require('../utils/bot-factory');

// Navigate to within 3 blocks of position
bot.pathfinder.setGoal(new GoalNear(x, y, z, 3));

// Navigate to XZ coordinates (ignore Y)
bot.pathfinder.setGoal(new GoalNearXZ(x, z, 3));

// Navigate to exact block position
bot.pathfinder.setGoal(new GoalBlock(x, y, z));

// Follow an entity (player/mob)
bot.pathfinder.setGoal(new GoalFollow(entity, 2));
```

**Configuration:**
```javascript
const { Movements } = require('../utils/bot-factory');
const mcData = require('minecraft-data')(bot.version);
const movements = new Movements(bot, mcData);

movements.allowSprinting = true;      // Sprint while moving
movements.allowParkour = true;        // Jump gaps
movements.canDig = false;             // Break blocks to path
movements.canPlaceOn = false;         // Place blocks to path
movements.allowEntityDetection = true; // Avoid entities

bot.pathfinder.setMovements(movements);
```

**Usage:**
```javascript
// Start pathfinding
await bot.pathfinder.goto(goal);

// Stop pathfinding
bot.pathfinder.stop();
bot.pathfinder.setGoal(null);
```

### 2. **PvP Plugin** (`mineflayer-pvp`)
Combat and entity interaction capabilities.

**Features:**
- Automatic target following
- Attack timing and cooldown management
- Entity tracking

**Usage:**
```javascript
// Attack an entity
await bot.attack(targetEntity);

// Use PvP plugin for automatic combat
bot.pvp.attack(targetEntity);

// Stop PvP
bot.pvp.stop();
bot.pvp.forceStop();
```

---

## 🎮 Built-in Mineflayer Capabilities

These are always available without additional plugins:

### **Block Interaction**

```javascript
// Break a block
await bot.dig(block);
await bot.dig(block, true); // Force dig even if not optimal tool

// Place a block
const referenceBlock = bot.blockAt(targetPos.offset(0, -1, 0));
await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));

// Activate a block (door, button, lever, etc.)
await bot.activateBlock(block);

// Get block at position
const block = bot.blockAt(new Vec3(x, y, z));

// Find nearest block of type
const block = bot.findBlock({
  matching: bot.registry.blocksByName.diamond_ore.id,
  maxDistance: 64,
  count: 1
});

// Check line of sight to block
const canSee = bot.canSeeBlock(block);
```

### **Item & Inventory Management**

```javascript
// Equip an item
await bot.equip(itemId, 'hand');     // Main hand
await bot.equip(itemId, 'head');     // Helmet
await bot.equip(itemId, 'torso');    // Chestplate
await bot.equip(itemId, 'legs');     // Leggings
await bot.equip(itemId, 'feet');     // Boots
await bot.equip(itemId, 'off-hand'); // Off-hand

// Unequip an item
await bot.unequip('hand');

// Use/activate held item (eat, shoot bow, etc.)
await bot.activateItem();

// Get held item
const heldItem = bot.heldItem;

// Inventory access
const items = bot.inventory.items();
const itemCount = bot.inventory.count(itemId);
const slot = bot.inventory.slots[36]; // Hotbar slot 0

// Select hotbar slot (0-8)
bot.setQuickBarSlot(0);

// Creative mode inventory
if (bot.game.gameMode === 1) {
  const Item = require('prismarine-item')(bot.version);
  await bot.creative.setInventorySlot(36, new Item(itemId, 64));
}
```

### **Movement Controls**

```javascript
// Manual movement
bot.setControlState('forward', true);
bot.setControlState('back', true);
bot.setControlState('left', true);
bot.setControlState('right', true);
bot.setControlState('jump', true);
bot.setControlState('sprint', true);
bot.setControlState('sneak', true);

// Stop all movement
for (const control of ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak']) {
  bot.setControlState(control, false);
}

// Jump
bot.setControlState('jump', true);
```

### **Camera Control**

```javascript
// Look at position (instant)
await bot.lookAt(new Vec3(x, y, z));
await bot.lookAt(position, true); // Force look

// Look at specific angles
bot.look(yaw, pitch, force);

// Get current look direction
const yaw = bot.entity.yaw;
const pitch = bot.entity.pitch;
```

### **Entity Interaction**

```javascript
// Attack entity
await bot.attack(entity);

// Get nearest entity
const entity = bot.nearestEntity((e) => {
  return e.type === 'player' && e.username === 'Alpha';
});

// Get all entities
const entities = Object.values(bot.entities);

// Get players
const players = bot.players; // Object with player data
const playerEntity = bot.players['Alpha']?.entity;

// Entity properties
entity.position;   // Vec3 position
entity.velocity;   // Vec3 velocity
entity.yaw;        // Horizontal rotation
entity.pitch;      // Vertical rotation
entity.onGround;   // Boolean
entity.height;     // Entity height
entity.width;      // Entity width
entity.type;       // 'player', 'mob', etc.
entity.username;   // For players
entity.health;     // For mobs
```

### **Bot State**

```javascript
// Position and movement
bot.entity.position;  // Vec3
bot.entity.velocity;  // Vec3
bot.entity.yaw;       // Horizontal rotation
bot.entity.pitch;     // Vertical rotation
bot.entity.onGround;  // Boolean
bot.entity.height;    // Bot height (1.8 for player)

// Health and status
bot.health;           // 0-20
bot.food;             // 0-20
bot.foodSaturation;   // 0-5
bot.oxygenLevel;      // 0-20

// Game state
bot.game.gameMode;    // 0=survival, 1=creative, 2=adventure, 3=spectator
bot.game.difficulty;  // 0=peaceful, 1=easy, 2=normal, 3=hard
bot.game.dimension;   // 'minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'

// World
bot.time.timeOfDay;   // 0-24000
bot.isRaining;        // Boolean
bot.thunderState;     // 0-1
```

### **Communication**

```javascript
// Send chat message
bot.chat('Hello world!');

// Whisper to player
bot.whisper('Alpha', 'Private message');

// Listen to chat
bot.on('chat', (username, message) => {
  console.log(`${username}: ${message}`);
});

bot.on('whisper', (username, message) => {
  console.log(`${username} whispers: ${message}`);
});
```

### **Crafting**

```javascript
// Get crafting table
const craftingTable = bot.findBlock({
  matching: bot.registry.blocksByName.crafting_table.id,
  maxDistance: 32
});

// Craft item
const recipe = bot.recipesFor(itemId, null, 1, craftingTable)[0];
if (recipe) {
  await bot.craft(recipe, 1, craftingTable);
}
```

---

## 🔌 Optional Plugins (Not Currently Installed)

These can be added by installing the npm package and uncommenting in `bot-factory.js`:

### 1. **mineflayer-tool**
Automatic tool selection for optimal mining/digging.

```bash
npm install mineflayer-tool
```

```javascript
// Auto-select best tool for block
await bot.tool.equipForBlock(block);
```

### 2. **mineflayer-armor-manager**
Automatic armor equipping based on best available.

```bash
npm install mineflayer-armor-manager
```

```javascript
// Automatically equips best armor
// Runs in background, no manual calls needed
```

### 3. **mineflayer-collectblock**
Automatic item collection and pathfinding to items.

```bash
npm install mineflayer-collectblock
```

```javascript
// Collect nearest item
const item = bot.nearestEntity(e => e.name === 'item');
await bot.collectBlock.collect(item);
```

### 4. **mineflayer-auto-eat**
Automatic food consumption when hungry.

```bash
npm install mineflayer-auto-eat
```

```javascript
// Enable auto-eating
bot.autoEat.options = {
  priority: 'foodPoints',
  startAt: 14,
  bannedFood: []
};
```

---

## 📚 Usage Examples

### Example 1: Navigate to Player and Attack
```javascript
const { GoalFollow } = require('../utils/bot-factory');

// Find target player
const targetPlayer = bot.players['Bravo'];
if (targetPlayer && targetPlayer.entity) {
  // Follow player
  bot.pathfinder.setGoal(new GoalFollow(targetPlayer.entity, 2));
  
  // Attack when in range
  const distance = bot.entity.position.distanceTo(targetPlayer.entity.position);
  if (distance <= 3) {
    await bot.attack(targetPlayer.entity);
  }
}
```

### Example 2: Mine Blocks
```javascript
// Find diamond ore
const diamondOre = bot.findBlock({
  matching: bot.registry.blocksByName.diamond_ore.id,
  maxDistance: 64
});

if (diamondOre) {
  // Navigate to block
  const { GoalBlock } = require('../utils/bot-factory');
  await bot.pathfinder.goto(new GoalBlock(diamondOre.position.x, diamondOre.position.y, diamondOre.position.z));
  
  // Mine the block
  await bot.dig(diamondOre);
}
```

### Example 3: Build Structure
```javascript
const { Vec3 } = require('vec3');

// Equip blocks
const mcData = require('minecraft-data')(bot.version);
const stoneId = mcData.blocksByName.stone.id;
await bot.equip(stoneId, 'hand');

// Place blocks in a line
for (let i = 0; i < 5; i++) {
  const targetPos = bot.entity.position.offset(i, 0, 0);
  const referenceBlock = bot.blockAt(targetPos.offset(0, -1, 0));
  
  if (referenceBlock) {
    await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
  }
}
```

---

## 🎯 Best Practices

1. **Always check if entities/blocks exist before using them**
   ```javascript
   const player = bot.players['Alpha'];
   if (player && player.entity) {
     // Safe to use player.entity
   }
   ```

2. **Use pathfinder for complex navigation**
   - Handles obstacles, terrain, and optimal pathing
   - More reliable than manual controls for long distances

3. **Stop pathfinder before manual controls**
   ```javascript
   bot.pathfinder.setGoal(null);
   bot.setControlState('forward', true);
   ```

4. **Handle errors gracefully**
   ```javascript
   try {
     await bot.dig(block);
   } catch (err) {
     console.error('Failed to dig:', err.message);
   }
   ```

5. **Clean up after episodes**
   ```javascript
   // Stop all movement
   bot.pathfinder.setGoal(null);
   if (bot.pvp) bot.pvp.forceStop();
   stopAll(bot);
   
   // Unequip items
   await bot.unequip('hand');
   ```

---

## 📖 Additional Resources

- [Mineflayer Documentation](https://github.com/PrismarineJS/mineflayer/tree/master/docs)
- [Mineflayer Pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder)
- [Mineflayer PvP](https://github.com/PrismarineJS/mineflayer-pvp)
- [Minecraft Data](https://github.com/PrismarineJS/minecraft-data) - Block/item IDs and properties
