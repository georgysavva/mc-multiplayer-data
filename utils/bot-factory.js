const mineflayer = require("mineflayer");
const {
  pathfinder,
  Movements,
  goals: { GoalNear, GoalNearXZ, GoalXZ, GoalBlock, GoalFollow },
} = require("mineflayer-pathfinder");

const pvp = require("mineflayer-pvp").plugin;

// Log mineflayer version once to help debug protocol mismatches
const MINEFLAYER_VERSION =
  (require("mineflayer/package.json") || {}).version || "unknown";
console.log(`[bot-factory] mineflayer version: ${MINEFLAYER_VERSION}`);

/**
 * Create a new Mineflayer bot instance with all essential plugins
 * @param {Object} config - Bot configuration
 * @param {string} config.username - Bot username
 * @param {string} config.host - Server host
 * @param {number} config.port - Server port
 * @param {string} config.version - Minecraft version (defaults to 1.21)
 * @returns {Bot} Mineflayer bot instance
 */
function makeBot({ username, host, port, version = "1.21" }) {
  const bot = mineflayer.createBot({
    host,
    port,
    username,
    version,
    checkTimeoutInterval: 10 * 60 * 1000,
  });

  // ============================================================================
  // CORE PLUGINS - Essential for bot functionality
  // ============================================================================

  // Pathfinder - Intelligent navigation and movement
  bot.loadPlugin(pathfinder);
  console.log(`[${bot.username}] ✅ Loaded pathfinder plugin`);

  // PvP - Combat and entity interaction
  bot.loadPlugin(pvp);
  console.log(`[${bot.username}] ✅ Loaded PvP plugin`);

  // ============================================================================
  // ADDITIONAL PLUGINS - Enhanced capabilities (optional but recommended)
  // ============================================================================

  // Uncomment these as needed based on your use case:

  // Tool Plugin - Automatic tool selection for mining/digging
  // Requires: npm install mineflayer-tool
  // try {
  //   const toolPlugin = require('mineflayer-tool').plugin;
  //   bot.loadPlugin(toolPlugin);
  //   console.log(`[${bot.username}] ✅ Loaded tool plugin`);
  // } catch (err) {
  //   console.log(`[${bot.username}] ⚠️ Tool plugin not available`);
  // }

  // Armor Manager - Automatic armor equipping
  // Requires: npm install mineflayer-armor-manager
  // try {
  //   const armorManager = require('mineflayer-armor-manager');
  //   bot.loadPlugin(armorManager);
  //   console.log(`[${bot.username}] ✅ Loaded armor manager plugin`);
  // } catch (err) {
  //   console.log(`[${bot.username}] ⚠️ Armor manager plugin not available`);
  // }

  // Collect Block - Automatic item collection
  // Requires: npm install mineflayer-collectblock
  // try {
  //   const collectBlock = require('mineflayer-collectblock').plugin;
  //   bot.loadPlugin(collectBlock);
  //   console.log(`[${bot.username}] ✅ Loaded collect block plugin`);
  // } catch (err) {
  //   console.log(`[${bot.username}] ⚠️ Collect block plugin not available`);
  // }

  // Auto Eat - Automatic food consumption
  // Requires: npm install mineflayer-auto-eat
  // try {
  //   const autoEat = require('mineflayer-auto-eat').plugin;
  //   bot.loadPlugin(autoEat);
  //   console.log(`[${bot.username}] ✅ Loaded auto eat plugin`);
  // } catch (err) {
  //   console.log(`[${bot.username}] ⚠️ Auto eat plugin not available`);
  // }

  // ============================================================================
  // BUILT-IN MINEFLAYER CAPABILITIES (Always Available)
  // ============================================================================
  
  // These are built into mineflayer core and don't require plugins:
  // - bot.dig() - Break blocks
  // - bot.placeBlock() - Place blocks
  // - bot.equip() - Equip items
  // - bot.attack() - Attack entities
  // - bot.activateItem() - Use items (eat, shoot bow, etc.)
  // - bot.activateBlock() - Interact with blocks (doors, buttons, etc.)
  // - bot.craft() - Crafting recipes
  // - bot.creative.setInventorySlot() - Creative mode inventory
  // - bot.setControlState() - Manual movement controls
  // - bot.look() / bot.lookAt() - Camera control
  // - bot.chat() - Send chat messages
  // - bot.whisper() - Send private messages
  // - bot.inventory - Full inventory access
  // - bot.entity - Bot's entity data (position, health, etc.)
  // - bot.players - Other players on server
  // - bot.entities - All entities in world
  // - bot.blockAt() - Get block at position
  // - bot.canSeeBlock() - Line of sight checks
  // - bot.findBlock() - Search for blocks
  // - bot.nearestEntity() - Find closest entity

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  bot.on("end", () => console.log(`[${bot.username}] 🔌 Disconnected from server`));
  
  bot.on("kicked", (reason) =>
    console.log(`[${bot.username}] 👢 Kicked from server:`, reason)
  );
  
  bot.on("error", (err) => 
    console.log(`[${bot.username}] ❌ Error:`, err.message)
  );

  bot.on("spawn", () => {
    console.log(`[${bot.username}] 🎮 Spawned in world at (${bot.entity.position.x.toFixed(1)}, ${bot.entity.position.y.toFixed(1)}, ${bot.entity.position.z.toFixed(1)})`);
    console.log(`[${bot.username}] 🎯 Game mode: ${bot.game.gameMode === 0 ? 'Survival' : bot.game.gameMode === 1 ? 'Creative' : bot.game.gameMode === 2 ? 'Adventure' : 'Spectator'}`);
  });

  bot.on("health", () => {
    if (bot.health <= 5 && bot.health > 0) {
      console.log(`[${bot.username}] ⚠️ Low health: ${bot.health}/20`);
    }
  });

  bot.on("death", () => {
    console.log(`[${bot.username}] 💀 Died at (${bot.entity.position.x.toFixed(1)}, ${bot.entity.position.y.toFixed(1)}, ${bot.entity.position.z.toFixed(1)})`);
  });

  // Log when bot respawns
  bot.on("respawn", () => {
    console.log(`[${bot.username}] ♻️ Respawned`);
  });

  return bot;
}

module.exports = {
  makeBot,
  Movements,
  GoalNear,
  GoalNearXZ,
  GoalXZ,
  GoalBlock,
  GoalFollow,
};
