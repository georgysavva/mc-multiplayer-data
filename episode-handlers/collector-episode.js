const Vec3 = require("vec3").Vec3;
const { Movements, GoalNear, GoalBlock, GoalFollow } = require("../utils/bot-factory");
const {
  stopAll,
  lookAtBot,
  sleep,
  initializePathfinder,
  stopPathfinder,
  land_pos,
} = require("../utils/movement");
const { BaseEpisode } = require("./base-episode");
const Lock = require("../utils/lock");

// Constants for collector behavior
const HANDSHAKE_INTERVAL_MS = 500; // Send handshake signals every 500ms
const HANDSHAKE_TIMEOUT_MS = 30000; // Timeout handshake after 30 seconds
const MEETUP_TIMEOUT_MS = 15000; // 15 seconds to meet up
const CHECKPOINT_POLL_INTERVAL_MS = 100; // Poll for checkpoint signals every 100ms
const CHECKPOINT_TIMEOUT_MS = 60000; // Timeout checkpoints after 60 seconds
const LEADER_FOLLOWER_PROBABILITY = 0.66; // 66% chance of leader-follower mode
const FOLLOWER_NEAR_DISTANCE = 4; // Distance to maintain while following
const FOLLOWER_FAR_DISTANCE = 7; // Distance before resuming following
const RANDOM_MOTION_TIMEOUT_MS = 8000; // Stop task after 8 seconds
const ORE_MINING_TIMEOUT_MS = 8000; // Wait 8 seconds to mine an ore
const TASK_CHECK_INTERVAL_MS = 500; // Check task status every 500ms
const MAX_ORES_TO_MINE = 8; // Maximum ores to mine per cycle
const MAX_TORCH_DISTANCE = 2; // Maximum distance to place torch
const MAX_MINING_CYCLES = 10; // Maximum number of mining cycles before stopping

// Valuable ore types (by block name)
const VALUABLE_ORES = [
  "diamond_ore",
  "deepslate_diamond_ore",
  "emerald_ore",
  "deepslate_emerald_ore",
  "gold_ore",
  "deepslate_gold_ore",
  "iron_ore",
  "deepslate_iron_ore",
  "lapis_ore",
  "deepslate_lapis_ore",
  "redstone_ore",
  "deepslate_redstone_ore",
  "coal_ore",
  "deepslate_coal_ore",
  "copper_ore",
  "deepslate_copper_ore",
];

// ============================================================================
// SYNCHRONIZATION PRIMITIVES
// ============================================================================

/**
 * Perform initial handshake between bots to ensure both are ready
 * Both bots continuously send handshake signals until they receive the other's
 * This ensures no messages are lost due to listeners not being set up yet
 *
 * @param {Bot} bot - Mineflayer bot instance
 * @param {BotCoordinator} coordinator - Bot coordinator
 * @param {number} episodeNum - Episode number
 * @returns {Promise<boolean>} True if handshake succeeded, false if timeout
 */
async function performHandshake(bot, coordinator, episodeNum) {
  console.log(`[${bot.username}] Starting handshake...`);

  let otherBotReady = false;
  const startTime = Date.now();

  // Set up recurring listener for other bot's handshake signal
  const handshakeHandler = () => {
    console.log(`[${bot.username}] Received handshake from other bot`);
    otherBotReady = true;
  };

  // We need a recurring listener since we don't know when the signal will arrive
  const setupListener = () => {
    coordinator.onceEvent('handshake', episodeNum, () => {
      handshakeHandler();
      if (!otherBotReady) {
        setupListener(); // Re-setup if somehow still not ready
      }
    });
  };
  setupListener();

  // Continuously send handshake signals until we receive one back
  while (!otherBotReady) {
    if (Date.now() - startTime > HANDSHAKE_TIMEOUT_MS) {
      console.log(`[${bot.username}] Handshake timeout!`);
      return false;
    }

    coordinator.sendToOtherBot('handshake', null, episodeNum, 'handshake');
    await sleep(HANDSHAKE_INTERVAL_MS);
  }

  // Send one final handshake to ensure other bot received ours
  coordinator.sendToOtherBot('handshake', null, episodeNum, 'handshake');

  console.log(`[${bot.username}] Handshake complete!`);
  return true;
}

/**
 * Set up signal registry to track received checkpoint signals
 * Sets up listeners for all possible checkpoints in advance
 *
 * @param {BotCoordinator} coordinator - Bot coordinator
 * @param {number} episodeNum - Episode number
 * @param {number} maxCycles - Maximum number of mining cycles
 * @returns {Object} Signal registry object
 */
function setupSignalRegistry(coordinator, episodeNum, maxCycles) {
  const signals = {};

  // Define all checkpoints
  const checkpoints = [];
  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    checkpoints.push(`meetup_ready_${cycle}`);
    checkpoints.push(`mining_ready_${cycle}`);
    // Also set up listener for leader/follower done signal
    checkpoints.push(`done_${cycle}`);
  }

  // Set up persistent listeners for all checkpoints
  for (const checkpoint of checkpoints) {
    signals[checkpoint] = false;

    // Set up recurring listener
    const setupListener = () => {
      coordinator.onceEvent(checkpoint, episodeNum, () => {
        console.log(`[SIGNAL REGISTRY] Received signal: ${checkpoint}`);
        signals[checkpoint] = true;
        // Re-setup listener in case of multiple signals
        setupListener();
      });
    };
    setupListener();
  }

  return signals;
}

/**
 * Wait for a checkpoint synchronization point
 * Sends our ready signal and waits for other bot's ready signal
 * Both bots must reach this point before either proceeds
 *
 * @param {Bot} bot - Mineflayer bot instance
 * @param {BotCoordinator} coordinator - Bot coordinator
 * @param {string} checkpointName - Name of the checkpoint
 * @param {number} episodeNum - Episode number
 * @param {Object} signals - Signal registry object
 * @returns {Promise<boolean>} True if sync succeeded, false if timeout
 */
async function syncCheckpoint(bot, coordinator, checkpointName, episodeNum, signals) {
  console.log(`[${bot.username}] Syncing at checkpoint: ${checkpointName}`);

  // Send our ready signal
  coordinator.sendToOtherBot(checkpointName, null, episodeNum, 'checkpoint');

  // Wait for other bot's ready signal (poll the signal registry)
  const startTime = Date.now();
  while (!signals[checkpointName]) {
    if (Date.now() - startTime > CHECKPOINT_TIMEOUT_MS) {
      console.log(`[${bot.username}] Checkpoint timeout: ${checkpointName}`);
      return false;
    }
    await sleep(CHECKPOINT_POLL_INTERVAL_MS);
  }

  console.log(`[${bot.username}] Checkpoint synchronized: ${checkpointName}`);
  return true;
}

/**
 * Determine if this bot should take a specific role
 * Both bots call this with same RNG, but get different results based on bot name
 * This ensures symmetric RNG consumption while enabling role assignment
 *
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared RNG function
 * @param {Object} args - Episode arguments
 * @returns {boolean} True if this bot should be the "primary" for this decision
 */
function isMyTurn(bot, sharedBotRng, args) {
  // Both bots consume the RNG
  const randomValue = sharedBotRng();

  // Determine role based on bot name (deterministic given same random value)
  const botNames = [bot.username, args.other_bot_name].sort();
  const myIndex = botNames.indexOf(bot.username);

  // If random < 0.5, first bot in sorted order is primary
  return (randomValue < 0.5) === (myIndex === 0);
}

// ============================================================================
// PATHFINDING AND MINING UTILITIES
// ============================================================================

/**
 * Configure pathfinder movements for collector episode
 * @param {Bot} bot - Mineflayer bot instance
 */
function setMovementsForCollector(bot) {
  const customMoves = new Movements(bot);
  customMoves.allow1by1towers = false;
  customMoves.allowParkour = false;
  customMoves.allowDigging = true;
  customMoves.blocksToAvoid.add(bot.registry.blocksByName.water.id);
  customMoves.blocksToAvoid.add(bot.registry.blocksByName.lava.id);
  customMoves.blocksToAvoid.add(bot.registry.blocksByName.bedrock.id);
  bot.pathfinder.setMovements(customMoves);
}

/**
 * Check if a block is visible to the bot
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Block} block - Block to check
 * @returns {boolean} Whether the block is visible
 */
function isBlockVisible(bot, block) {
  if (!block) return false;
  return bot.canSeeBlock(block);
}

/**
 * Check if a torch can be placed on a block and return the best face direction
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} pos - Position to place torch
 * @returns {[boolean, Vec3|null]} [canPlace, faceVector]
 */
function canPlaceTorch(bot, pos) {
  // Check for above, east, west, south, and north torches
  const directions = [
    new Vec3(0, 1, 0), // up
    new Vec3(1, 0, 0), // east
    new Vec3(-1, 0, 0), // west
    new Vec3(0, 0, 1), // south
    new Vec3(0, 0, -1), // north
  ];

  // Calculate direction from block to bot
  const eyePosition = bot.entity.position.offset(0, 1.8, 0); // hardcode to ignore sneaking
  const toBot = new Vec3(
    eyePosition.x - pos.x,
    eyePosition.y - pos.y,
    eyePosition.z - pos.z
  );

  // Sort directions by how well they point towards the bot
  // (using dot product: higher = more aligned)
  const sortedDirections = directions.slice().sort((a, b) => {
    const dotA = a.x * toBot.x + a.y * toBot.y + a.z * toBot.z;
    const dotB = b.x * toBot.x + b.y * toBot.y + b.z * toBot.z;
    return dotB - dotA; // Higher dot product first
  });

  for (const dir of sortedDirections) {
    const neighborPos = pos.offset(dir.x, dir.y, dir.z);
    const neighbor = bot.blockAt(neighborPos);
    if (neighbor && neighbor.name === "air") return [true, dir];
  }
  return [false, null];
}

/**
 * Place a torch on a nearby surface
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Object} mcData - Minecraft data
 * @param {Array} oreIds - Array of ore block IDs to avoid
 */
async function placeTorch(bot, mcData, oreIds) {
  const isSolid = (b) =>
    b && b.boundingBox === "block" && !b.name.includes("leaves");
  try {
    const torchSlot = bot.inventory.findInventoryItem(mcData.itemsByName.torch.id);
    if (!torchSlot) {
      console.log(`[${bot.username}] No torch in inventory`);
      return;
    }

    // Find a suitable surface to place torch
    const torchBasePositions = bot.findBlocks({
      matching: (block) => isSolid(block),
      maxDistance: MAX_TORCH_DISTANCE,
      count: 20,
    });

    if (torchBasePositions.length === 0) {
      console.log(`[${bot.username}] No suitable surface for torch`);
      return;
    }

    await bot.equip(torchSlot, "hand");
    await bot.waitForTicks(2);

    const botPosition = bot.entity.position;
    const eyeLevel = botPosition.y + 1.8; // hardcode to ignore sneaking

    // Sort blocks by proximity to head level (prioritize head-level blocks)
    const sortedPositions = torchBasePositions.sort((a, b) => {
      const distA = Math.abs(a.y - eyeLevel);
      const distB = Math.abs(b.y - eyeLevel);
      return distA - distB;
    });

    // Try placing torch sequentially until one succeeds, up to a total of 6 seconds
    const startTime = Date.now();
    for (const blockPos of sortedPositions) {
      if (Date.now() - startTime > 6000) {
        console.log(`[${bot.username}] Torch placement timed out after 6 seconds`);
        return;
      }

      const distance = blockPos.distanceTo(botPosition);
      if (distance > MAX_TORCH_DISTANCE) continue;

      const block = bot.blockAt(blockPos);
      // if it's an ore block, continue
      if (!block || oreIds.includes(block.type)) continue;

      const [canPlace, faceVector] = canPlaceTorch(bot, blockPos);
      if (!canPlace) continue;

      if (!bot.world.getBlock(blockPos)) continue;

      try {
        await bot.waitForTicks(2);
        await bot.placeBlock(block, faceVector);
        await bot.waitForTicks(2);
        console.log(`[${bot.username}] Torch placed at ${blockPos}`);
        return;
      } catch (error) {
        // Continue to next position
      }
    }
  } catch (error) {
    console.log(`[${bot.username}] Failed to place torch:`, error.message);
  }
}

/**
 * Find visible valuable ores
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Array} oreIds - Array of ore block IDs
 * @returns {Array} Array of visible ore blocks
 */
function findVisibleOres(bot, oreIds) {
  const visibleOres = [];
  const oreBlocks = bot.findBlocks({
    matching: oreIds,
    maxDistance: 16,
    count: 20,
  });
  console.log(`[${bot.username}] Found ${oreBlocks.length} valuable ores nearby`);
  const botPosition = bot.entity.position;
  for (const blockPos of oreBlocks) {
    const block = bot.blockAt(blockPos);
    if (
      block &&
      block.position.distanceTo(botPosition) < 16 &&
      isBlockVisible(bot, block)
    ) {
      visibleOres.push(block);
      console.log(`[${bot.username}] Found visible ${block.name} at ${block.position}`);
    }
  }
  return visibleOres;
}

/**
 * Get random cardinal direction (north, south, east, west)
 * @returns {Object} Direction object with name and offset
 */
function getRandomDirection() {
  const directions = [
    { name: "north", offset: new Vec3(0, 0, -1) },
    { name: "south", offset: new Vec3(0, 0, 1) },
    { name: "east", offset: new Vec3(1, 0, 0) },
    { name: "west", offset: new Vec3(-1, 0, 0) },
  ];
  return directions[Math.floor(Math.random() * directions.length)];
}

/**
 * Perform directional mining
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Object} direction - Direction object with offset
 * @param {number} distance - Distance to mine
 */
function performDirectionalMining(bot, direction, distance) {
  console.log(
    `[${bot.username}] Directional mining: ${direction.name}, distance ${distance}`
  );

  const startPos = bot.entity.position;
  const targetPos = startPos.plus(direction.offset.scaled(distance));

  // Set pathfinding goal
  bot.pathfinder.setGoal(new GoalNear(targetPos.x, targetPos.y, targetPos.z, 1));
}

/**
 * Perform staircase mining (45 degrees down)
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Object} direction - Direction object with offset
 * @param {number} depth - Depth to mine
 */
function performStaircaseMining(bot, direction, depth) {
  console.log(`[${bot.username}] Staircase mining: ${direction.name}, depth ${depth}`);

  const startPos = bot.entity.position;
  const targetY = Math.max(startPos.y - depth, 5); // Go down by depth, but not below y=5
  const horizontalDistance = depth; // Same distance horizontally as vertically
  const targetX = startPos.x + direction.offset.x * horizontalDistance;
  const targetZ = startPos.z + direction.offset.z * horizontalDistance;

  // Set pathfinding goal
  bot.pathfinder.setGoal(new GoalNear(targetX, targetY, targetZ, 2));
}

/**
 * Execute a single mining task (collect ores, then directional/staircase mining)
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Object} mcData - Minecraft data
 * @param {Array} oreIds - Array of ore block IDs
 * @param {Object} taskSpec - Task specification {type, direction, distance}
 * @param {Lock} taskLock - Lock for task synchronization
 * @returns {Promise} Promise that resolves when task completes
 */
async function executeMiningTask(bot, mcData, oreIds, taskSpec, taskLock) {
  console.log(
    `[${bot.username}] Executing task: ${taskSpec.type} ${taskSpec.direction.name}`
  );

  // Place torch before mining
  await placeTorch(bot, mcData, oreIds);

  // Collect visible ores
  const visibleOres = findVisibleOres(bot, oreIds);
  if (visibleOres.length > 0) {
    const maxOresToMine = Math.min(visibleOres.length, MAX_ORES_TO_MINE);
    console.log(`[${bot.username}] Collecting ${maxOresToMine} visible ores`);

    for (let i = 0; i < maxOresToMine; i++) {
      const ore = visibleOres[i];
      console.log(
        `[${bot.username}] Mining ${ore.name} at (${ore.position.x.toFixed(
          1
        )}, ${ore.position.y.toFixed(1)}, ${ore.position.z.toFixed(1)})`
      );

      bot.pathfinder.setGoal(
        new GoalBlock(ore.position.x, ore.position.y, ore.position.z)
      );

      // Wait for goal_reached or timeout
      await Promise.race([
        new Promise((resolve) => bot.once("goal_reached", resolve)),
        sleep(ORE_MINING_TIMEOUT_MS),
      ]);

      bot.pathfinder.setGoal(null);
    }
  }

  // Execute the main task based on specification
  if (taskSpec.type === "directional") {
    performDirectionalMining(bot, taskSpec.direction, taskSpec.distance);
  } else {
    performStaircaseMining(bot, taskSpec.direction, taskSpec.distance);
  }

  // Wait for goal_reached or timeout
  const taskStartTime = Date.now();
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (Date.now() - taskStartTime > RANDOM_MOTION_TIMEOUT_MS) {
        clearInterval(checkInterval);
        bot.pathfinder.setGoal(null);
        console.log(`[${bot.username}] Task timeout reached`);
        resolve();
      }
    }, TASK_CHECK_INTERVAL_MS);

    bot.once("goal_reached", () => {
      clearInterval(checkInterval);
      console.log(`[${bot.username}] Task goal reached`);
      resolve();
    });
  });
}

/**
 * Mine as leader - performs mining tasks with repetition tracking
 * @param {Bot} bot - Mineflayer bot instance
 * @param {BotCoordinator} coordinator - Bot coordinator
 * @param {Object} mcData - Minecraft data
 * @param {Array} oreIds - Array of ore block IDs
 * @param {number} episodeNum - Episode number
 * @param {number} iterationID - Iteration ID
 * @returns {Promise} Promise that resolves when mining completes
 */
async function mineAsLeader(
  bot,
  coordinator,
  mcData,
  oreIds,
  episodeNum,
  iterationID
) {
  console.log(`[${bot.username}] Starting leader mining mode`);

  // Initialize pathfinder
  setMovementsForCollector(bot);

  let lastTaskSpec = null;
  let taskRepeatCount = 0;
  const taskLock = new Lock();

  while (taskRepeatCount < 2) {
    await taskLock.acquire();

    let taskSpec;

    // Check if we need to repeat the last task
    if (lastTaskSpec && taskRepeatCount === 1) {
      // Repeat the last task (second execution)
      taskSpec = lastTaskSpec;
      taskRepeatCount = 2;
      console.log(
        `[${bot.username}] Task 2/2: ${taskSpec.type} ${taskSpec.direction.name} (repeat)`
      );
    } else {
      // Create new random task specification (first execution)
      const taskType = Math.random() < 0.7 ? "directional" : "staircase";
      const direction = getRandomDirection();
      const distance =
        taskType === "directional"
          ? Math.floor(Math.random() * 7) + 2
          : Math.floor(Math.random() * 4) + 5;

      taskSpec = { type: taskType, direction: direction, distance: distance };
      lastTaskSpec = taskSpec;
      taskRepeatCount = 1;
      console.log(
        `[${bot.username}] Task 1/2: ${taskSpec.type} ${taskSpec.direction.name}`
      );
    }

    // Execute the mining task
    await executeMiningTask(bot, mcData, oreIds, taskSpec, taskLock);
    taskLock.release();

    // Small tick wait between tasks
    await bot.waitForTicks(10);
  }

  console.log(`[${bot.username}] Leader mining complete - 2 repetitions done`);
  stopPathfinder(bot);
}

/**
 * Follow leader and place torches
 * @param {Bot} bot - Mineflayer bot instance (follower)
 * @param {BotCoordinator} coordinator - Bot coordinator
 * @param {string} leaderName - Name of the leader bot
 * @param {Object} mcData - Minecraft data
 * @param {Array} oreIds - Array of ore block IDs
 * @param {number} episodeNum - Episode number
 * @param {number} cycle - Current cycle number
 * @param {Object} signals - Signal registry object
 * @returns {Promise} Promise that resolves when following completes
 */
async function followAndPlaceTorches(
  bot,
  coordinator,
  leaderName,
  mcData,
  oreIds,
  episodeNum,
  cycle,
  signals
) {
  console.log(`[${bot.username}] Starting follower mode - following ${leaderName}`);

  setMovementsForCollector(bot);

  let lastTorchPlaceTime = Date.now();
  const MIN_TORCH_INTERVAL = 5000; // Place torch at most every 5 seconds

  // Continuous following with dynamic torch placement
  // Continue until leader signals completion via done_${cycle}
  while (!signals[`done_${cycle}`]) {
    const leaderBot = bot.players[leaderName];
    if (leaderBot && leaderBot.entity) {
      const leaderPos = leaderBot.entity.position;
      const myPos = bot.entity.position;
      const distance = myPos.distanceTo(leaderPos);

      // Dynamically follow leader using GoalFollow
      if (distance >= FOLLOWER_FAR_DISTANCE) {
        console.log(
          `[${bot.username}] Following ${leaderName} (distance: ${distance.toFixed(1)})`
        );

        // Use GoalFollow for continuous following
        bot.pathfinder.setGoal(
          new GoalFollow(leaderBot.entity, FOLLOWER_NEAR_DISTANCE),
          true // dynamic goal
        );

        // Place torch periodically while following
        // Check signal before attempting to place torch (torch placement can be slow)
        const now = Date.now();
        if (!signals[`done_${cycle}`] && now - lastTorchPlaceTime > MIN_TORCH_INTERVAL) {
          console.log(`[${bot.username}] [DEBUG] About to place torch, signal=${signals[`done_${cycle}`]}`);
          await placeTorch(bot, mcData, oreIds);
          console.log(`[${bot.username}] [DEBUG] Torch placement done, signal=${signals[`done_${cycle}`]}`);
          lastTorchPlaceTime = now;
          // Check signal again after torch placement
          if (signals[`done_${cycle}`]) {
            console.log(`[${bot.username}] [DEBUG] Signal detected after torch placement, breaking`);
            break;
          }
        }
      } else if (bot.pathfinder.goal) {
        // Close enough, stop following
        bot.pathfinder.setGoal(null);
      }
    }

    // Small tick wait to prevent busy loop
    await bot.waitForTicks(10);
  }

  console.log(`[${bot.username}] [DEBUG] Exited follower loop, signal=${signals[`done_${cycle}`]}`);
  console.log(`[${bot.username}] Leader finished mining, follower mode complete`);
  stopPathfinder(bot);
}

/**
 * Mine independently (both bots mine separately)
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Object} mcData - Minecraft data
 * @param {Array} oreIds - Array of ore block IDs
 * @returns {Promise} Promise that resolves when mining completes
 */
async function independentMining(bot, mcData, oreIds) {
  console.log(`[${bot.username}] Starting independent mining mode`);

  // Initialize pathfinder
  setMovementsForCollector(bot);

  let lastTaskSpec = null;
  let taskRepeatCount = 0;
  const taskLock = new Lock();

  while (taskRepeatCount < 2) {
    await taskLock.acquire();

    let taskSpec;

    // Check if we need to repeat the last task
    if (lastTaskSpec && taskRepeatCount === 1) {
      // Repeat the last task (second execution)
      taskSpec = lastTaskSpec;
      taskRepeatCount = 2;
      console.log(
        `[${bot.username}] Task 2/2: ${taskSpec.type} ${taskSpec.direction.name} (repeat)`
      );
    } else {
      // Create new random task specification (first execution)
      const taskType = Math.random() < 0.7 ? "directional" : "staircase";
      const direction = getRandomDirection();
      const distance =
        taskType === "directional"
          ? Math.floor(Math.random() * 7) + 2
          : Math.floor(Math.random() * 4) + 5;

      taskSpec = { type: taskType, direction: direction, distance: distance };
      lastTaskSpec = taskSpec;
      taskRepeatCount = 1;
      console.log(
        `[${bot.username}] Task 1/2: ${taskSpec.type} ${taskSpec.direction.name}`
      );
    }

    // Execute the mining task
    await executeMiningTask(bot, mcData, oreIds, taskSpec, taskLock);
    taskLock.release();

    // Small tick wait between tasks
    await bot.waitForTicks(10);
  }

  console.log(`[${bot.username}] Independent mining complete - 2 repetitions done`);
  stopPathfinder(bot);
}

// ============================================================================
// EPISODE PHASE FUNCTIONS (SYMMETRIC)
// ============================================================================

/**
 * Meetup phase - both bots move toward each other
 * This is completely symmetric - both bots execute the same code
 *
 * @param {Bot} bot - Mineflayer bot instance
 * @param {BotCoordinator} coordinator - Bot coordinator
 * @param {string} otherBotName - Name of the other bot
 * @param {number} episodeNum - Episode number
 * @param {number} cycle - Current cycle number
 */
async function meetupPhase(bot, coordinator, otherBotName, episodeNum, cycle) {
  console.log(
    `[${bot.username}] MEETUP PHASE (Cycle ${cycle}/${MAX_MINING_CYCLES})`
  );

  // Initialize pathfinder
  setMovementsForCollector(bot);

  // Both bots follow each other, causing them to converge to midpoint
  const targetBot = bot.players[otherBotName];
  if (targetBot && targetBot.entity) {
    console.log(`[${bot.username}] Moving towards ${otherBotName}`);

    // Set GoalFollow (non-dynamic to avoid continuous updates)
    bot.pathfinder.setGoal(
      new GoalFollow(targetBot.entity, FOLLOWER_NEAR_DISTANCE),
      false
    );

    // Wait for goal_reached or timeout (with proper cleanup)
    await new Promise((resolve) => {
      let timeoutId;

      const goalReachedHandler = () => {
        clearTimeout(timeoutId);
        console.log(`[${bot.username}] Reached ${otherBotName}`);
        resolve();
      };

      timeoutId = setTimeout(() => {
        bot.removeListener("goal_reached", goalReachedHandler);
        console.log(`[${bot.username}] Meetup timeout`);
        resolve();
      }, MEETUP_TIMEOUT_MS);

      bot.once("goal_reached", goalReachedHandler);
    });

    bot.pathfinder.setGoal(null);
  } else {
    console.log(`[${bot.username}] Cannot see ${otherBotName}, waiting...`);
    await sleep(MEETUP_TIMEOUT_MS / 2);
  }

  stopPathfinder(bot);
  console.log(`[${bot.username}] Meetup phase complete`);
}

/**
 * Mining phase - both bots mine for ores
 * This is completely symmetric - both bots execute the same code and consume RNG equally
 * The mode (leader-follower vs independent) is decided using shared RNG
 *
 * @param {Bot} bot - Mineflayer bot instance
 * @param {BotCoordinator} coordinator - Bot coordinator
 * @param {Function} sharedBotRng - Shared RNG function
 * @param {string} otherBotName - Name of the other bot
 * @param {number} episodeNum - Episode number
 * @param {number} cycle - Current cycle number
 * @param {Object} args - Episode arguments
 * @param {Object} signals - Signal registry object
 */
async function miningPhase(
  bot,
  coordinator,
  sharedBotRng,
  otherBotName,
  episodeNum,
  cycle,
  args,
  signals
) {
  console.log(
    `[${bot.username}] MINING PHASE (Cycle ${cycle}/${MAX_MINING_CYCLES})`
  );

  // Get minecraft data and ore IDs
  const mcData = require("minecraft-data")(bot.version);
  const oreIds = VALUABLE_ORES.map(
    (oreName) => mcData.blocksByName[oreName]?.id
  ).filter((id) => id !== undefined);

  // SYMMETRIC RNG CONSUMPTION: Both bots decide mode together
  const isLeaderFollowerMode = sharedBotRng() < LEADER_FOLLOWER_PROBABILITY;
  console.log(
    `[${bot.username}] Mode: ${
      isLeaderFollowerMode ? "LEADER-FOLLOWER" : "INDEPENDENT"
    }`
  );

  if (isLeaderFollowerMode) {
    // SYMMETRIC RNG CONSUMPTION: Both bots determine roles together
    // but get different results based on bot name
    const isLeader = isMyTurn(bot, sharedBotRng, args);
    console.log(`[${bot.username}] Role: ${isLeader ? "LEADER" : "FOLLOWER"}`);

    if (isLeader) {
      // Mine as leader
      await mineAsLeader(bot, coordinator, mcData, oreIds, episodeNum, cycle);

      // Signal completion to follower
      coordinator.sendToOtherBot(
        `done_${cycle}`,
        bot.entity.position.clone(),
        episodeNum,
        "leader_done"
      );
    } else {
      // Follow and place torches
      await followAndPlaceTorches(
        bot,
        coordinator,
        otherBotName,
        mcData,
        oreIds,
        episodeNum,
        cycle,
        signals
      );
    }
  } else {
    // Independent mining mode
    await independentMining(bot, mcData, oreIds);
  }

  console.log(`[${bot.username}] Mining phase complete`);
}

/**
 * Collector Episode Class
 */
class CollectorEpisode extends BaseEpisode {
  static WORKS_IN_NON_FLAT_WORLD = true;

  async setupEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args) {
    console.log(`[${bot.username}] Setting up collector episode`);

    // Give mining tools and torches via RCON
    await rcon.send(`clear ${bot.username}`);
    await rcon.send(`give ${bot.username} diamond_pickaxe 1`);
    await rcon.send(`give ${bot.username} diamond_shovel 1`);
    await rcon.send(`give ${bot.username} torch 256`);
    await rcon.send(`give ${bot.username} minecraft:dirt 256`);

    console.log(`[${bot.username}] Mining tools and torches provided`);
    await bot.waitForTicks(10);
  }

  async entryPoint(
    bot,
    rcon,
    sharedBotRng,
    coordinator,
    iterationID,
    episodeNum,
    args
  ) {
    console.log(
      `[${bot.username}] ========================================`
    );
    console.log(
      `[${bot.username}] COLLECTOR EPISODE START - Episode ${episodeNum}`
    );
    console.log(
      `[${bot.username}] ========================================`
    );

    const otherBotName = args.other_bot_name;

    // ========================================================================
    // PHASE 1: HANDSHAKE
    // Both bots continuously signal until both are ready
    // This prevents any messages from being lost
    // ========================================================================
    const handshakeSuccess = await performHandshake(bot, coordinator, episodeNum);
    if (!handshakeSuccess) {
      console.log(`[${bot.username}] Handshake failed, aborting episode`);
      return;
    }

    // ========================================================================
    // PHASE 2: SET UP SIGNAL REGISTRY
    // Set up all checkpoint listeners in advance
    // This ensures no checkpoint signals are lost
    // ========================================================================
    const signals = setupSignalRegistry(coordinator, episodeNum, MAX_MINING_CYCLES);
    console.log(`[${bot.username}] Signal registry set up for ${MAX_MINING_CYCLES} cycles`);

    // ========================================================================
    // PHASE 3: MAIN EPISODE LOOP
    // Both bots execute the exact same loop symmetrically
    // ========================================================================
    for (let cycle = 1; cycle <= MAX_MINING_CYCLES; cycle++) {
      console.log(
        `[${bot.username}] ----------------------------------------`
      );
      console.log(
        `[${bot.username}] Starting Cycle ${cycle}/${MAX_MINING_CYCLES}`
      );
      console.log(
        `[${bot.username}] ----------------------------------------`
      );

      // Meetup sub-phase: Both bots move toward each other
      await meetupPhase(bot, coordinator, otherBotName, episodeNum, cycle);

      // Meetup checkpoint: Wait for both bots to complete meetup
      const meetupSync = await syncCheckpoint(
        bot,
        coordinator,
        `meetup_ready_${cycle}`,
        episodeNum,
        signals
      );
      if (!meetupSync) {
        console.log(`[${bot.username}] Meetup sync failed, aborting episode`);
        return;
      }

      // Mining sub-phase: Both bots mine for ores
      await miningPhase(
        bot,
        coordinator,
        sharedBotRng,
        otherBotName,
        episodeNum,
        cycle,
        args,
        signals
      );

      // Mining checkpoint: Wait for both bots to complete mining
      const miningSync = await syncCheckpoint(
        bot,
        coordinator,
        `mining_ready_${cycle}`,
        episodeNum,
        signals
      );
      if (!miningSync) {
        console.log(`[${bot.username}] Mining sync failed, aborting episode`);
        return;
      }
    }

    // ========================================================================
    // PHASE 4: EPISODE COMPLETE
    // ========================================================================
    console.log(
      `[${bot.username}] ========================================`
    );
    console.log(
      `[${bot.username}] COLLECTOR EPISODE COMPLETE`
    );
    console.log(
      `[${bot.username}] Completed ${MAX_MINING_CYCLES} cycles successfully`
    );
    console.log(
      `[${bot.username}] ========================================`
    );

    // Transition to stop phase to properly end the episode
    coordinator.onceEvent(
      "stopPhase",
      episodeNum,
      this.getOnStopPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        args.other_bot_name,
        episodeNum,
        args
      )
    );
    coordinator.sendToOtherBot(
      "stopPhase",
      bot.entity.position.clone(),
      episodeNum,
      `collector entryPoint end`
    );
  }

  async tearDownEpisode(
    bot,
    rcon,
    sharedBotRng,
    coordinator,
    episodeNum,
    args
  ) {
    console.log(`[${bot.username}] Tearing down collector episode`);
    // Stop pathfinder and clear any remaining goals
    if (bot.pathfinder) {
      bot.pathfinder.setGoal(null);
    }
    stopAll(bot);
  }
}

module.exports = {
  CollectorEpisode,
  mineAsLeader,
  followAndPlaceTorches,
  independentMining,
  placeTorch,
  findVisibleOres,
};


