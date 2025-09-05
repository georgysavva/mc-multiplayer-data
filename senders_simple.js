const mineflayerViewerhl = require("prismarine-viewer-colalab").headless;
const seedrandom = require("seedrandom");
const { Worker } = require('worker_threads');
const path = require('path');

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

// Worker thread management
let worker;
let taskIdCounter = 0;
const pendingTasks = new Map();

function initializeWorker() {
  worker = new Worker(path.join(__dirname, 'bot-worker.js'));
  
  worker.on('message', (message) => {
    const { id, result, error } = message;
    const pendingTask = pendingTasks.get(id);
    
    if (pendingTask) {
      pendingTasks.delete(id);
      if (error) {
        pendingTask.reject(new Error(error));
      } else {
        pendingTask.resolve(result);
      }
    }
  });
  
  worker.on('error', (error) => {
    console.error('Worker error:', error);
  });
}

function sendToWorker(type, data) {
  return new Promise((resolve, reject) => {
    const id = ++taskIdCounter;
    pendingTasks.set(id, { resolve, reject });
    worker.postMessage({ id, type, data });
  });
}

// Initialize worker
initializeWorker();

function getWorldBlocks(bot, centerX, centerZ, range) {
  const worldBlocks = {};
  const minY = 0;
  const maxY = 128;
  
  for (let x = centerX - range; x <= centerX + range; x++) {
    for (let z = centerZ - range; z <= centerZ + range; z++) {
      for (let y = minY; y <= maxY; y++) {
        const block = bot.blockAt(new Vec3(x, y, z));
        if (block) {
          worldBlocks[`${x},${y},${z}`] = block.type;
        }
      }
    }
  }
  
  return worldBlocks;
}

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

async function random_pos(bot, range) {
  const start_pos = bot.entity.position.clone();
  
  // Get world blocks data for the worker
  const worldBlocks = getWorldBlocks(bot, start_pos.x, start_pos.z, range);
  
  try {
    const pos = await sendToWorker('generateRandomPosition', {
      startPos: start_pos,
      range: range,
      worldBlocks: worldBlocks
    });
    
    if (!pos) {
      console.log(`[${bot.username}] Worker couldn't find valid position, falling back to original method`);
      return random_pos_fallback(bot, range);
    }
    
    return new Vec3(pos.x, pos.y, pos.z);
  } catch (error) {
    console.error(`[${bot.username}] Worker error, falling back to original method:`, error);
    return random_pos_fallback(bot, range);
  }
}

function random_pos_fallback(bot, range) {
  const start_pos = bot.entity.position.clone();
  while (true) {
    const x = Math.floor(Math.random() * range * 2) - range;
    const z = Math.floor(Math.random() * range * 2) - range;
    let limit = (range * 4) / 5;
    if (x * x + z * z < limit * limit) {
      continue;
    }
    const pos = land_pos(bot, start_pos.x + x, start_pos.z + z);
    if (pos == null || Math.abs(pos.y - start_pos.y) > 10) {
      console.log(`[${bot.username}] rej null or y diff`);
      continue;
    }
    const landable = new Set([
      bot.registry.blocksByName.dirt.id,
      bot.registry.blocksByName.stone.id,
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
      const blockunder = bot.blockAt(pos.offset(0, -1, 0));
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

async function walk(bot, durationMs, direction = null) {
  const dir = direction || choice(["forward", "back", "left", "right"]);
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
  try {
    // Plan action sequence in worker thread
    const actionSequence = await sendToWorker('planActionSequence', {
      durationMs: durationMs
    });
    
    console.log(`[${bot.username}] Executing ${actionSequence.length} planned actions`);
    
    for (const actionPlan of actionSequence) {
      try {
        await executeAction(bot, actionPlan);
      } catch (err) {
        console.error(`[${bot.username}] Action error:`, err);
      } finally {
        stopAll(bot);
      }
      
      // Small pause between actions
      await sleep(300);
    }
  } catch (error) {
    console.error(`[${bot.username}] Worker planning failed, falling back to original method:`, error);
    await run_fallback(bot, durationMs);
  }
}

async function executeAction(bot, actionPlan) {
  const { type, duration, params } = actionPlan;
  
  switch (type) {
    case 'walk':
      await walk(bot, duration, params.direction);
      break;
    case 'jump':
      await jump(bot, duration);
      break;
    case 'lookAround':
      await lookSideways(bot, params.targetYaw, duration);
      break;
    default:
      console.warn(`[${bot.username}] Unknown action type: ${type}`);
  }
}

async function run_fallback(bot, durationMs) {
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

    if (Date.now() + 300 < endTime) {
      await sleep(300);
    }
  }
}

function getOnSpawnFn(bot, host, receiverPort, botRng, otherBot) {
  return async () => {
    await sleep(10000);
    
    // Initialize worker with bot registry
    try {
      await sendToWorker('setBlockRegistry', bot.registry);
      console.log(`[${bot.username}] Worker initialized with block registry`);
    } catch (error) {
      console.error(`[${bot.username}] Failed to initialize worker:`, error);
    }
    
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
    const t0 = Date.now();
    console.log("DEBUG moving 175");
    await move(bot, 175);
    await run(bot, 40000)
    const t1 = Date.now();
    const durationSec = ((t1 - t0) / 1000).toFixed(2);
    console.log(`[${bot.username}] move(175) took ${durationSec}s`);
    bot.emit("endtask");

    const iterationID = 0;
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

  bot.on("end", () => {
    console.log(`[${bot.username}] disconnected.`);
    // Cleanup worker when bot disconnects
    if (worker) {
      worker.terminate();
    }
  });
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

const botsRngSeed = Date.now().toString();
const botARng = seedrandom(botsRngSeed);
const botBRng = seedrandom(botsRngSeed);
botA.once(
  "spawn",
  getOnSpawnFn(botA, args.host, args.a_port, botARng, undefined)
);// Cleanup worker on process exit
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  if (worker) {
    worker.terminate();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (worker) {
    worker.terminate();
  }
  process.exit(0);
});