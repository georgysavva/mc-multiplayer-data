const mineflayerViewerhl = require("prismarine-viewer-colalab").headless;
const seedrandom = require("seedrandom");

// Constants
const MIN_WALK_DURATION_SEC = 7;
const MAX_WALK_DURATION_SEC = 13;
const MIN_ALIGN_RADIUS = 4;
const MAX_ALIGN_RADIUS = 8;
const MIN_RESET_DISTANCE = 5;
const MAX_RESET_DISTANCE = 10;

// two-bots-run-together.js
const minimist = require("minimist");
const mineflayer = require("mineflayer");
const {
  pathfinder,
  Movements,
  goals: { GoalNear, GoalNearXZ, GoalBlock, GoalFollow },
} = require("mineflayer-pathfinder");

const mcDataLoader = require("minecraft-data");
const Vec3 = require("vec3").Vec3;

const args = minimist(process.argv.slice(2), {
  default: {
    host: "127.0.0.1",
    port: 25565,
    a_port: 8091,
    b_port: 8092,
    a: "Alpha",
    b: "Bravo",
    iterations_num_per_episode: 3,
  },
});

function land_pos(bot, x, z) {
  const pos = new Vec3(x, 64, z);
  let block = bot.blockAt(pos);

  if (block === null) {
    // unloaded chunk
    return null;
  }
  let dy = 0;
  while (block.type !== bot.registry.blocksByName.air.id) {
    dy++;
    block = bot.blockAt(pos.offset(0, dy, 0));
    if (block.type === bot.registry.blocksByName.air.id) {
      return pos.offset(0, dy - 1, 0);
    }
  }
  while (block.type === bot.registry.blocksByName.air.id) {
    dy--;
    block = bot.blockAt(pos.offset(0, dy, 0));
    if (block.type !== bot.registry.blocksByName.air.id) {
      return pos.offset(0, dy, 0);
    }
  }
}
/*
  [-range,range] 区域内的一个(x,z)，该位置的xz坐标上最高的非空气方块
  *要求并且必须是泥土或者石头（放置goal在屋顶上的奇怪情况）
  *要求距离tp点不超过80格, 并且距离起始点至少20格
*/

function random_pos(bot, range) {
  const start_pos = bot.entity.position.clone();
  while (true) {
    const x = Math.floor(Math.random() * range * 2) - range;
    const z = Math.floor(Math.random() * range * 2) - range;
    let limit = (range * 4) / 5;
    if (x * x + z * z < limit * limit) {
      // ensure the distance is not to short
      continue;
    }
    // ensure the distance is not to far away from village center
    // dx = start_pos.x + x - tp_target.x;
    // dz = start_pos.z + z - tp_target.z;
    // if (dx * dx + dz * dz > 80 * 80) {
    //   continue;
    // }
    // if (
    //   args.location === "stronghold" ||
    //   args.location === "nether_bastion" ||
    //   args.location === "nether_fortress"
    // ) {
    //   return new Vec3(start_pos.x + x, start_pos.y, start_pos.z + z);
    // }
    const pos = land_pos(bot, start_pos.x + x, start_pos.z + z);
    if (pos == null || Math.abs(pos.y - start_pos.y) > 10) {
      console.log(`[${bot.username}] rej null or y diff`);
      continue;
    }
    landable = new Set([
      bot.registry.blocksByName.dirt.id,
      bot.registry.blocksByName.stone.id,
      // bot.registry.blocksByName.grass_path.id,
      bot.registry.blocksByName.sand.id,
      bot.registry.blocksByName.grass_block.id,
      bot.registry.blocksByName.snow.id,
      bot.registry.blocksByName.gravel.id,
      bot.registry.blocksByName.sandstone.id,
      bot.registry.blocksByName.red_sand.id,
      bot.registry.blocksByName.terracotta.id,
      bot.registry.blocksByName.mycelium.id,
      bot.registry.blocksByName.end_stone.id,
      bot.registry.blocksByName.nether_bricks.id,
      bot.registry.blocksByName.blackstone.id,
      bot.registry.blocksByName.polished_blackstone_bricks.id,
      bot.registry.blocksByName.cracked_polished_blackstone_bricks.id,
      bot.registry.blocksByName.netherrack.id,
    ]);
    if (pos !== null) {
      const block = bot.blockAt(pos);
      blockunder = bot.blockAt(pos.offset(0, -1, 0));
      if (landable.has(block.type) && landable.has(blockunder.type)) {
        pos.y = pos.y + 1;
        return pos;
      } else {
        console.log(
          `[${bot.username}] rej block type`,
          block.type,
          blockunder.type
        );
      }
    }
  }
}
/*
  move to a random position in a range*range cube around the bot
*/
async function move(bot, range) {
  const pos = random_pos(bot, range);
  console.log(`${bot.username} moving to`, pos);
  console.log(
    `[${bot.username}] distance`,
    bot.entity.position.distanceTo(pos)
  );
  const defaultMove = new Movements(bot);
  defaultMove.allowSprinting = false;
  bot.pathfinder.setMovements(defaultMove);
  bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z), false);

  return new Promise((resolve) => {
    const onGoalReached = () => {
      bot.pathfinder.stop();
      bot.clearControlStates();
      bot.removeListener("goal_reached", onGoalReached);
      resolve();
    };
    bot.on("goal_reached", onGoalReached);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.random() * (max - min) + min;
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

function emitWithLog(bot, eventName, eventParams, location, iterationID) {
  const listenerCount = bot.listenerCount(eventName);
  if (listenerCount > 0) {
    console.log(
      `[emitWithLog] [iter ${iterationID}] ${location}: Emitting ${eventName} to ${bot.username} (${listenerCount} listeners)`
    );
    bot.emit(eventName, eventParams);
  } else {
    console.log(
      `[emitWithLog] [iter ${iterationID}] ${location}: No listeners for ${eventName} on ${bot.username}`
    );
  }
}

function stopAll(bot) {
  for (const k of [
    "forward",
    "back",
    "left",
    "right",
    "jump",
    "sprint",
    "sneak",
  ]) {
    bot.setControlState(k, false);
  }
}

async function walk(bot, durationMs) {
  const dir = choice(["forward", "back", "left", "right"]);
  console.log(
    `[${bot.username}] Walking ${dir} for ${(durationMs / 1000).toFixed(1)}s`
  );
  bot.setControlState(dir, true);
  try {
    await sleep(durationMs);
  } finally {
    bot.setControlState(dir, false);
  }
}

async function jump(bot, durationMs) {
  console.log(
    `[${bot.username}] Jumping for ${(durationMs / 1000).toFixed(1)}s`
  );
  const end = Date.now() + durationMs;
  while (Date.now() < end) {
    bot.setControlState("jump", true);
    await sleep(250);
    bot.setControlState("jump", false);
    await sleep(250);
  }
}

async function lookAround(bot, durationMs) {
  console.log(
    `[${bot.username}] Looking around for ${(durationMs / 1000).toFixed(1)}s`
  );
  const yaw = rand(-Math.PI, Math.PI);
  await lookSideways(bot, yaw, durationMs);
}

async function lookSideways(bot, targetYaw, durationMs) {
  console.log(
    `[${bot.username}] Looking sideways to yaw ${targetYaw.toFixed(2)} over ${(
      durationMs / 1000
    ).toFixed(1)}s`
  );

  const startPitch = bot.entity.pitch;
  const startYaw = bot.entity.yaw;
  const startTime = Date.now();
  const endTime = startTime + durationMs;

  while (Date.now() < endTime) {
    const elapsed = Date.now() - startTime;
    const progress = elapsed / durationMs;

    // Linear interpolation between start and target yaw
    const currentYaw = startYaw + (targetYaw - startYaw) * progress;

    bot.look(currentYaw, startPitch, true);
    await sleep(50); // Small delay for smooth movement
  }

  // Ensure we end exactly at the target yaw
  bot.look(targetYaw, startPitch, true);
}

async function run(bot, durationMs) {
  const minMs = 2000;
  const maxMs = 5000;
  const actions = [
    () => walk(bot, rand(minMs, maxMs)),
    () => jump(bot, rand(minMs * 0.6, maxMs * 0.8)),
    () => lookAround(bot, rand(minMs, maxMs)),
  ];

  const endTime = Date.now() + durationMs;

  while (Date.now() < endTime) {
    const action = choice(actions);
    try {
      await action();
    } catch (err) {
      console.error(`[${bot.username}] Action error:`, err);
    } finally {
      stopAll(bot);
    }

    // Only sleep if we have time remaining
    if (Date.now() + 300 < endTime) {
      await sleep(300); // small pause between actions
    }
  }
}

function getOnSpawnFn(bot, host, receiverPort, botRng, otherBot) {
  return async () => {
    await sleep(10000);
    const mcData = mcDataLoader(bot.version);
    const moves = new Movements(bot, mcData);
    moves.allowSprinting = true; // makes them run
    moves.canDig = false; // keep it simple; no digging
    bot.pathfinder.setMovements(moves);
    const { x, y, z } = bot.entity.position;
    console.log(
      `[${bot.username}] spawned at (${x.toFixed(2)}, ${y.toFixed(
        2
      )}, ${z.toFixed(2)})`
    );
    mineflayerViewerhl(bot, {
      output: `${host}:${receiverPort}`,
      width: 640,
      height: 360,
    });
    const iterationID = 0;
    bot.once(
      "alignPositionsPhase",
      getOnAlignPositionsPhaseFn(bot, botRng, otherBot, iterationID)
    );
    emitWithLog(
      otherBot,
      "alignPositionsPhase",
      bot.entity.position,
      "spawn phase end",
      iterationID
    );
  };
}
function getOnAlignPositionsPhaseFn(bot, botRng, otherBot, iterationID) {
  return async (otherBotPosition) => {
    emitWithLog(
      otherBot,
      "alignPositionsPhase",
      bot.entity.position,
      "alignPositionsPhase beginning",
      iterationID
    );
    console.log(
      `[iter ${iterationID}] [${bot.username}] aligns itself with ${otherBot.username} at ${otherBotPosition} (going to midpoint)`
    );

    const botPosition = bot.entity.position.clone();

    // Calculate midpoint between the two bots
    const midpoint = new Vec3(
      (botPosition.x + otherBotPosition.x) / 2,
      (botPosition.y + otherBotPosition.y) / 2,
      (botPosition.z + otherBotPosition.z) / 2
    );

    // Use land_pos to get proper ground level for the midpoint
    const landPosition = land_pos(bot, midpoint.x, midpoint.z);
    if (landPosition) {
      midpoint.y = landPosition.y + 1;
    }

    console.log(
      `[iter ${iterationID}] [${bot.username}] moving to midpoint: ${midpoint}`
    );

    // Move to the midpoint
    const defaultMove = new Movements(bot);
    defaultMove.allowSprinting = false;
    bot.pathfinder.setMovements(defaultMove);
    bot.pathfinder.setGoal(
      new GoalBlock(midpoint.x, midpoint.y, midpoint.z),
      false
    );

    // Wait for movement to complete using Promise
    await new Promise((resolve) => {
      const onGoalReached = () => {
        bot.pathfinder.stop();
        bot.clearControlStates();
        bot.removeListener("goal_reached", onGoalReached);
        resolve();
      };
      bot.on("goal_reached", onGoalReached);
    });

    console.log(`[iter ${iterationID}] [${bot.username}] reached midpoint`);
    bot.once(
      "resetPositionsPhase",

      getOnResetPositionsPhaseFn(bot, botRng, otherBot, iterationID)
    );
    emitWithLog(
      otherBot,
      "resetPositionsPhase",
      bot.entity.position.clone(),
      "alignPositionsPhase end",
      iterationID
    );
  };
}
function getOnResetPositionsPhaseFn(bot, botRng, otherBot, iterationID) {
  return async (otherBotPosition) => {
    emitWithLog(
      otherBot,
      "resetPositionsPhase",
      bot.entity.position.clone(),
      "resetPositionsPhase beginning",
      iterationID
    );
    const distance =
      MIN_RESET_DISTANCE + botRng() * (MAX_RESET_DISTANCE - MIN_RESET_DISTANCE);
    console.log(
      `[iter ${iterationID}] [${
        bot.username
      }] resetting position with distance ${distance.toFixed(2)}`
    );
    await move(bot, distance);
    bot.once(
      "walkAndLookPhase",
      getOnWalkAndLookPhaseFn(bot, botRng, otherBot, iterationID)
    );
    emitWithLog(
      otherBot,
      "walkAndLookPhase",
      bot.entity.position.clone(),
      "resetPositionsPhase end",
      iterationID
    );
  };
}
function getOnWalkAndLookPhaseFn(bot, botRng, otherBot, iterationID) {
  return async (otherBotPosition) => {
    emitWithLog(
      otherBot,
      "walkAndLookPhase",
      bot.entity.position.clone(),
      "walkAndLookPhase beginning",
      iterationID
    );
    const durationSec =
      MIN_WALK_DURATION_SEC +
      botRng() * (MAX_WALK_DURATION_SEC - MIN_WALK_DURATION_SEC);
    const durationMs = Math.floor(durationSec * 1000);
    console.log(
      `[iter ${iterationID}] [${
        bot.username
      }] starting walk and look phase for ${durationSec.toFixed(2)}s`
    );
    await run(bot, durationMs);
    if (iterationID == args.iterations_num_per_episode - 1) {
      bot.once(
        "stopPhase",
        getOnStopPhaseFn(bot, botRng, otherBot, iterationID)
      );
      emitWithLog(
        otherBot,
        "stopPhase",
        bot.entity.position.clone(),
        "walkAndLookPhase end",
        iterationID
      );
      return;
    }
    bot.once(
      "alignPositionsPhase",
      getOnAlignPositionsPhaseFn(bot, botRng, otherBot, iterationID + 1)
    );
    emitWithLog(
      otherBot,
      "alignPositionsPhase",
      bot.entity.position.clone(),
      "walkAndLookPhase end",
      iterationID
    );
  };
}

let endedBots = 0;
const totalBots = 2;

function getOnStopPhaseFn(bot, botRng, otherBot, iterationID) {
  return async (otherBotPosition) => {
    emitWithLog(
      otherBot,
      "stopPhase",
      bot.entity.position.clone(),
      "stopPhase beginning",
      iterationID
    );
    console.log(`[iter ${iterationID}] [${bot.username}] stops recording`);
    bot.emit("endtask");
    await sleep(5000);

    // Track completed bots and exit when both are done
    if (!endedBots) endedBots = 0;
    endedBots++;
    console.log(`[${bot.username}] task completed (${endedBots}/${totalBots})`);

    if (endedBots >= totalBots) {
      console.log("Both bots finished their tasks. Exiting program...");
      process.exit(0);
    }
  };
}

function makeBot({ username, host, port }) {
  const bot = mineflayer.createBot({
    host,
    port,
    username,
    version: "1.21.1",
    checkTimeoutInterval: 10 * 60 * 1000,
  });

  bot.loadPlugin(pathfinder);

  bot.on("end", () => console.log(`[${bot.username}] disconnected.`));
  bot.on("kicked", (reason) =>
    console.log(`[${bot.username}] kicked:`, reason)
  );
  bot.on("error", (err) => console.log(`[${bot.username}] error:`, err));

  return bot;
}

console.log("DEBUG environment variable:", process.env.DEBUG);


const botA = makeBot({
  username: args.a,
  host: args.host,
  port: args.port,
});

const botB = makeBot({
  username: args.b,
  host: args.host,
  port: args.port,
});
const botsRngSeed = Date.now().toString();
const botARng = seedrandom(botsRngSeed);
const botBRng = seedrandom(botsRngSeed);
botA.once("spawn", getOnSpawnFn(botA, args.host, args.a_port, botARng, botB));
botB.once("spawn", getOnSpawnFn(botB, args.host, args.b_port, botBRng, botA));
