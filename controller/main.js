/**
 * Modularized Minecraft Bot Coordination System
 *
 * This is the new modular version of controller.js with improved code organization.
 * All utility functions have been extracted into separate modules for better maintainability.
 */

const { sleep } = require("./utils/helpers");
const { BotCoordinator } = require("./utils/coordination");
const { makeBot } = require("./utils/bot-factory");
const { getOnSpawnFn } = require("./episode-handlers");
const { parseArgs } = require("./config/args");

/**
 * Main function to initialize and run the bot
 */
async function main() {
  console.log("DEBUG environment variable:", process.env.DEBUG);

  // Parse command line arguments
  const args = parseArgs();

  console.log(`Starting bot: ${args.bot_name}`);
  console.log(
    `Coordinator: ${args.bot_name}, Ports: ${args.coord_port}/${args.other_coord_port}`
  );
  console.log(
    `[${args.bot_name}] Waiting ${args.bootstrap_wait_time} seconds before creating bot...`
  );

  // Wait for bootstrap time
  await sleep(args.bootstrap_wait_time * 1000);

  // Create bot instance
  const bot = makeBot({
    username: args.bot_name,
    host: args.host,
    port: args.port,
    version: args.mc_version,
  });

  // Initialize shared RNG and coordinator
  const coordinator = new BotCoordinator(
    args.bot_name,
    args.coord_port,
    args.other_coord_host,
    args.other_coord_port
  );

  // Set up spawn event handler
  bot.once(
    "spawn",
    getOnSpawnFn(bot, args.act_recorder_host, args.act_recorder_port, coordinator, args)
  );

  // Handle system chat packets
  bot._client.on("packet", (data, meta) => {
    if (meta.name === "system_chat" && data && data.content) {
      console.log("SYSTEM:", JSON.stringify(data.content));
    }
  });
}

// Run the main function
main().catch(console.error);
