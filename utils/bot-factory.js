const mineflayer = require("mineflayer");
const {
  pathfinder,
  Movements,
  goals: { GoalNear, GoalNearXZ, GoalBlock, GoalFollow },
} = require("mineflayer-pathfinder");

const pvp = require("mineflayer-pvp").plugin;

/**
 * Create a new Mineflayer bot instance
 * @param {Object} config - Bot configuration
 * @param {string} config.username - Bot username
 * @param {string} config.host - Server host
 * @param {number} config.port - Server port
 * @param {string} config.version - Minecraft version (defaults to 1.20.4)
 * @returns {Bot} Mineflayer bot instance
 */
function makeBot({ username, host, port, version = "1.20.4" }) {
  const bot = mineflayer.createBot({
    host,
    port,
    username,
    version,
    checkTimeoutInterval: 10 * 60 * 1000,
  });

  // Load pathfinder plugin
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);

  bot.on("end", () => console.log(`[${bot.username}] disconnected.`));
  bot.on("kicked", (reason) =>
    console.log(`[${bot.username}] kicked:`, reason)
  );
  bot.on("error", (err) => console.log(`[${bot.username}] error:`, err));

  return bot;
}

module.exports = {
  makeBot,
  Movements,
  GoalNear,
  GoalNearXZ,
  GoalBlock,
  GoalFollow,
};
