const mineflayer = require("mineflayer");
const mineflayerViewer = require("prismarine-viewer").headless;

const bot = mineflayer.createBot({
  username: "Bot",
  host: "mc",
  port: 25565,
});

bot.once("spawn", () => {
  // Stream frames over tcp to a server listening on port 8089, ends when the application stop
  const client = mineflayerViewer(bot, {
    output: "127.0.0.1:8089",
    frames: -1,
    width: 512,
    height: 512,
  });

  let count = 0;
  const jumpLoop = async () => {
    while (count < 100) {
      bot.setControlState("jump", true);
      await new Promise((resolve) => setTimeout(resolve, 100)); // sleep 100ms
      bot.setControlState("jump", false);
      await new Promise((resolve) => setTimeout(resolve, 100)); // sleep 100ms
      count++;
    }
  };
  jumpLoop();
});
