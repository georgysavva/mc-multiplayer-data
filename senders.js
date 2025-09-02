const mineflayerViewerhl = require("prismarine-viewer-colalab").headless;

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
    if (Math.abs(pos.y - start_pos.y) > 10) {
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
        console.log("rej block type", block.type, blockunder.type);
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
  console.log("distance", bot.entity.position.distanceTo(pos));
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
  console.log(`Walking ${dir} for ${(durationMs / 1000).toFixed(1)}s`);
  bot.setControlState(dir, true);
  try {
    await sleep(durationMs);
  } finally {
    bot.setControlState(dir, false);
  }
}

async function jump(bot, durationMs) {
  console.log(`Jumping for ${(durationMs / 1000).toFixed(1)}s`);
  const end = Date.now() + durationMs;
  while (Date.now() < end) {
    bot.setControlState("jump", true);
    await sleep(250);
    bot.setControlState("jump", false);
    await sleep(250);
  }
}

async function lookAround(bot, durationMs) {
  console.log(`Looking around for ${(durationMs / 1000).toFixed(1)}s`);
  const yaw = rand(-Math.PI, Math.PI);
  await lookSideways(bot, yaw, durationMs);
}

async function lookSideways(bot, targetYaw, durationMs) {
  console.log(
    `Looking sideways to yaw ${targetYaw.toFixed(2)} over ${(
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
      console.error("Action error:", err);
    } finally {
      stopAll(bot);
    }

    // Only sleep if we have time remaining
    if (Date.now() + 300 < endTime) {
      await sleep(300); // small pause between actions
    }
  }
}

function makeBot({ username, host, port, receiverPort }) {
  const bot = mineflayer.createBot({ host, port, username, version: "1.21.1" });

  bot.loadPlugin(pathfinder);

  bot.once("spawn", async () => {
    console.log(host, receiverPort);
    mineflayerViewerhl(bot, {
      output: `${host}:${receiverPort}`,
      width: 640,
      height: 360,
    });
    const mcData = mcDataLoader(bot.version);
    const moves = new Movements(bot, mcData);
    moves.allowSprinting = true; // makes them run
    moves.canDig = false; // keep it simple; no digging
    bot.pathfinder.setMovements(moves);
    console.log(`[${bot.username}] spawned.`);
    // bot.on("path_update", (r) => {
    //   const nodesPerTick = ((r.visitedNodes * 50) / r.time).toFixed(2);
    //   console.log(
    //     `I can get there in ${
    //       r.path.length
    //     } moves. Computation took ${r.time.toFixed(
    //       2
    //     )} ms (${nodesPerTick} nodes/tick). ${r.status}`
    //   );
    // });
    await sleep(5000);
    console.log("start task");
    console.log("spawn at", bot.entity.position);
    // bot.chat(`/tp ${bot.username} 40 63 -70`);
    console.log("teleported to", bot.entity.position);
    await move(botA, 60);
    // await run(bot, 50000);
    // setTimeout(() => {
    //   console.log("time");
    // }, 5000);
    console.log("Sleeping");
    await sleep(5000);
    console.log("ending");
    bot.emit("endtask");
    console.log("ended");
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

async function digDown(bot, maxSteps = 10) {
  await bot.waitForChunksToLoad();

  for (let i = 0; i < maxSteps; i++) {
    console.log("digging down", i);
    const feet = bot.entity.position.floored();
    const belowPos = feet.offset(0, -1, 0);
    const below = bot.blockAt(belowPos);

    // If the chunk isn't loaded yet, give it a moment and retry this step.
    if (!below) {
      await sleep(50);
      i--;
      console.log("no below");
      continue;
    }

    // Safety / early-exit checks
    if (!below.diggable) {
      console.log("not diggable");
      break; // bedrock, barrier, etc.
    }
    if (below.name.includes("lava")) {
      console.log("lava");
      break; // don't drop into lava
    }

    try {
      // Optional: equip a suitable tool if you use mineflayer-tool plugin:
      // await bot.tool.equipForBlock(below);

      await bot.dig(below); // dig the block under our feet
    } catch (err) {
      // Can't dig (wrong tool, protected, out of reach...)
      // Stop gracefully.
      console.warn("Stopping digDown:", err.message);
      break;
    }

    // Let gravity do its thing; wait until we land before the next iteration.
    await waitUntilOnGround(bot, 4000);
    // Tiny pause to ensure new blocks are known.
    await sleep(50);
  }
}
async function waitUntilOnGround(bot, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const onTick = () => {
      if (bot.entity.onGround || Date.now() - start > timeoutMs) {
        bot.removeListener("physicsTick", onTick);
        resolve();
      }
    };
    bot.on("physicsTick", onTick);
  });
}
const botA = makeBot({
  username: args.a,
  host: args.host,
  port: args.port,
  receiverPort: args.a_port,
});

// const botB = makeBot({
//   username: args.b,
//   host: args.host,
//   port: args.port,
//   receiverPort: args.b_port,
// });

// linkBotsToChase(botA, botB);
// linkBotsToChase(botB, botA);
// setTimeout(() => {
// }, 5000);

/**
 * Make follower bot continually pathfind toward the other bot as soon as both are in-world.
 * Uses GoalFollow with dynamic=true so the path updates as the target moves.
 */
function linkBotsToChase(follower, leader) {
  let interval = null;

  function tryStartFollowing() {
    const leaderName = leader.username;
    const targetEntity =
      follower.players[leaderName] && follower.players[leaderName].entity;
    if (!targetEntity) return;

    console.log(
      `[${follower.username}] moving to a random location before following`
    );

    // Stop retrying; we are starting the pre-follow move
    clearInterval(interval);

    // After reaching the random spot, begin following the leader
    const startFollowing = () => {
      console.log(
        `[${follower.username}] ${follower.entity.position} following ${leaderName}… ${leader.entity.position}`
      );
      follower.pathfinder.setGoal(new GoalFollow(targetEntity, 1), true);
      follower.on("goal_reached", () => {
        console.log(
          `[${follower.username}] reached goal: ${follower.entity.position}`
        );
      });
    };

    follower.once("goal_reached", startFollowing);
    move(follower, 20);
  }

  // Start trying after follower has spawned
  const armFollow = () => {
    if (interval) return;
    interval = setInterval(tryStartFollowing, 500);
  };

  // When either spawns, re-arm the follow logic
  follower.once("spawn", armFollow);
  leader.once("spawn", armFollow);
}

// setTimeout(() => {
//   console.log("ending");
//   botA.emit("endtask");
//   // botB.emit("endtask");
// }, 150000);
