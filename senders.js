const mineflayerViewerhl = require("prismarine-viewer-colalab").headless;

// two-bots-run-together.js
const minimist = require("minimist");
const mineflayer = require("mineflayer");
const {
  pathfinder,
  Movements,
  goals: { GoalFollow },
} = require("mineflayer-pathfinder");
const mcDataLoader = require("minecraft-data");

const args = minimist(process.argv.slice(2), {
  default: {
    host: "127.0.0.1",
    port: 25565,
    a_port: 8090,
    b_port: 8091,
    a: "Alpha",
    b: "Bravo",
  },
});

function makeBot({ username, host, port, receiverPort }) {
  const bot = mineflayer.createBot({ host, port, username, version: "1.21.1" });

  bot.loadPlugin(pathfinder);

  bot.once("spawn", () => {
    mineflayerViewerhl(
      bot,
      {},
      {
        output: `${host}:${receiverPort}`,
        // frames: 50,
        width: 640,
        height: 360,
      }
    );
    const mcData = mcDataLoader(bot.version);
    const moves = new Movements(bot, mcData);
    moves.allowSprinting = true; // makes them run
    moves.canDig = false; // keep it simple; no digging
    bot.pathfinder.setMovements(moves);
    console.log(`[${bot.username}] spawned.`);
  });

  // bot.on("death", () => {
  //   // keep walking after respawn
  //   setTimeout(() => bot.emit("readyToChase"), 500);
  // });

  bot.on("end", () => console.log(`[${bot.username}] disconnected.`));
  bot.on("kicked", (reason) =>
    console.log(`[${bot.username}] kicked:`, reason)
  );
  bot.on("error", (err) => console.log(`[${bot.username}] error:`, err));

  return bot;
}

const botA = makeBot({
  username: args.a,
  host: args.host,
  port: args.port,
  receiverPort: args.a_port,
});
const botB = makeBot({
  username: args.b,
  host: args.host,
  port: args.port,
  receiverPort: args.b_port,
});

linkBotsToChase(botA, botB);
linkBotsToChase(botB, botA);

/**
 * Make follower bot continually pathfind toward the other bot as soon as both are in-world.
 * Uses GoalFollow with dynamic=true so the path updates as the target moves.
 */
function linkBotsToChase(follower, leader) {
  const leaderName = leader.username;
  let interval = null;

  function tryStartFollowing() {
    const targetEntity =
      follower.players[leaderName] && follower.players[leaderName].entity;
    if (!targetEntity) return;

    console.log(`[${follower.username}] following ${leaderName}…`);
    follower.pathfinder.setGoal(new GoalFollow(targetEntity, 1), true); // range=1, dynamic=true
    clearInterval(interval);
    interval = null;
  }

  // Start trying after follower has spawned
  const armFollow = () => {
    if (interval) return;
    interval = setInterval(tryStartFollowing, 500);
  };

  // When either spawns, re-arm the follow logic
  follower.once("spawn", armFollow);
  leader.once("spawn", armFollow);

  // If the leader entity despawns/respawns, re-arm
  // follower.on('entityGone', (entity) => {
  //   const current = follower.players[leaderName] && follower.players[leaderName].entity;
  //   if (entity && current && entity.id === current.id) {
  //     console.log(`[${follower.username}] lost sight of ${leaderName}, reacquiring…`);
  //     armFollow();
  //   }
  // });

  // // If movement gets stuck, you can periodically “nudge” replans (optional)
  // setInterval(() => {
  //   if (!follower.entity) return;
  //   // If not currently pathfinding, try to re-acquire
  //   if (!follower.pathfinder.isMoving()) {
  //     const targetEntity = follower.players[leaderName] && follower.players[leaderName].entity;
  //     if (targetEntity) {
  //       follower.pathfinder.setGoal(new GoalFollow(targetEntity, 1), true);
  //     }
  //   }
  // }, 5000);
}
