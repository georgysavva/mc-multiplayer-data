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
  const client = bot._client;

  client.on("packet", (data, meta) => {
    if (meta.state !== "play") {
      console.log(`S->C`, meta, data);
    } else {
      console.log(`S->C play`, meta);
    }
  });
  const write = bot._client.write.bind(bot._client);
  bot._client.write = (name, params) => {
    console.log(`C->S`, name, params);
    return write(name, params);
  };

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
