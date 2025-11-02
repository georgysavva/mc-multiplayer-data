const Vec3 = require("vec3").Vec3;
const { Movements, GoalNear, GoalBlock } = require("../utils/bot-factory");
const {
  stopAll,
  lookAtBot,
  sleep,
  initializePathfinder,
  stopPathfinder,
  land_pos,
} = require("../utils/movement");
const { BaseEpisode } = require("./base-episode");
const { decidePrimaryBot } = require("../utils/coordination");
const Lock = require("../utils/lock");

// Constants for collector behavior
const MEETUP_TIMEOUT_MS = 15000; // 15 seconds to meet up
const LEADER_FOLLOWER_PROBABILITY = 0.66; // 66% chance of leader-follower mode
const FOLLOWER_NEAR_DISTANCE = 5; // Distance to maintain while following
const FOLLOWER_FAR_DISTANCE = 10; // Distance before resuming following
const FOLLOWER_UPDATE_INTERVAL_MS = 1000; // Check follower distance every second
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

    // Try placing torch sequentially until one succeeds
    for (const blockPos of sortedPositions) {
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
      await bot.waitForTicks(4);
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
  const customMoves = new Movements(bot);
  customMoves.allow1by1towers = false;
  customMoves.allowParkour = false;
  customMoves.allowDigging = true;
  customMoves.blocksToAvoid.add(bot.registry.blocksByName.water.id);
  customMoves.blocksToAvoid.add(bot.registry.blocksByName.lava.id);
  customMoves.blocksToAvoid.add(bot.registry.blocksByName.bedrock.id);
  bot.pathfinder.setMovements(customMoves);

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

    // Small delay between tasks
    await sleep(1000);
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
 * @param {number} iterationID - Iteration ID
 * @returns {Promise} Promise that resolves when following completes
 */
async function followAndPlaceTorches(
  bot,
  coordinator,
  leaderName,
  mcData,
  oreIds,
  episodeNum,
  iterationID
) {
  console.log(`[${bot.username}] Starting follower mode - following ${leaderName}`);

  // Initialize pathfinder
  initializePathfinder(bot, {
    allowSprinting: false,
    allowParkour: false,
    canDig: true,
    allowEntityDetection: true,
  });

  let isFollowing = false;
  let lastDistance = 0;

  // Set up listener for mining completion
  const miningCompletePromise = new Promise((resolve) => {
    coordinator.onceEvent(`miningComplete_${iterationID}`, episodeNum, () => {
      console.log(`[${bot.username}] Leader finished mining`);
      resolve();
    });
  });

  // Start following loop
  const followLoop = async () => {
    while (true) {
      const leaderBot = bot.players[leaderName];
      if (leaderBot && leaderBot.entity) {
        const leaderPos = leaderBot.entity.position;
        const myPos = bot.entity.position;
        const distance = myPos.distanceTo(leaderPos);

        console.log(
          `[${bot.username}] Distance to ${leaderName}: ${distance.toFixed(2)}`
        );

        // If not following and distance >= 10, start following
        if (!isFollowing && distance >= FOLLOWER_FAR_DISTANCE) {
          console.log(`[${bot.username}] Distance >= 10, starting to follow`);
          isFollowing = true;
          bot.pathfinder.setGoal(
            new GoalNear(
              leaderPos.x,
              leaderPos.y,
              leaderPos.z,
              FOLLOWER_NEAR_DISTANCE
            )
          );
        }

        // If following, update goal continuously
        if (isFollowing) {
          bot.pathfinder.setGoal(
            new GoalNear(
              leaderPos.x,
              leaderPos.y,
              leaderPos.z,
              FOLLOWER_NEAR_DISTANCE
            )
          );

          // Check if we reached the goal (distance <= 5)
          if (distance <= FOLLOWER_NEAR_DISTANCE) {
            console.log(
              `[${bot.username}] Reached follower distance, placing torch and waiting`
            );
            bot.pathfinder.setGoal(null);
            isFollowing = false;

            // Place torch
            await placeTorch(bot, mcData, oreIds);
          }
        }

        lastDistance = distance;
      } else {
        console.log(`[${bot.username}] Cannot see ${leaderName}`);
      }

      await sleep(FOLLOWER_UPDATE_INTERVAL_MS);
    }
  };

  // Race between mining completion and follow loop
  await Promise.race([miningCompletePromise, followLoop()]);

  console.log(`[${bot.username}] Follower mode complete`);
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
  const customMoves = new Movements(bot);
  customMoves.allow1by1towers = false;
  customMoves.allowParkour = false;
  customMoves.allowDigging = true;
  customMoves.blocksToAvoid.add(bot.registry.blocksByName.water.id);
  customMoves.blocksToAvoid.add(bot.registry.blocksByName.lava.id);
  customMoves.blocksToAvoid.add(bot.registry.blocksByName.bedrock.id);
  bot.pathfinder.setMovements(customMoves);

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

    // Small delay between tasks
    await sleep(1000);
  }

  console.log(`[${bot.username}] Independent mining complete - 2 repetitions done`);
  stopPathfinder(bot);
}

/**
 * Get meetup phase handler function
 */
function getOnMeetupPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  iterationID,
  otherBotName,
  episodeNum,
  episodeInstance,
  args,
  cycleCount = 1
) {
  return async (otherBotPosition) => {
    console.log(
      `[${bot.username}] MEETUP PHASE (Cycle ${cycleCount}/${MAX_MINING_CYCLES}) - Episode ${episodeNum}, Iteration ${iterationID}`
    );

    coordinator.sendToOtherBot(
      `meetupPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `meetupPhase_${iterationID} beginning`
    );

    // Decide which bot goes to the other (primary bot goes to secondary)
    const isPrimary = decidePrimaryBot(bot, sharedBotRng, args);
    console.log(
      `[${bot.username}] I am ${isPrimary ? "PRIMARY (moving)" : "SECONDARY (waiting)"}`
    );

    if (isPrimary) {
      // Primary bot moves to the other bot
      console.log(`[${bot.username}] Moving to ${otherBotName}`);

      initializePathfinder(bot, {
        allowSprinting: true,
        allowParkour: true,
        canDig: false,
        allowEntityDetection: true,
      });

      const startTime = Date.now();
      while (Date.now() - startTime < MEETUP_TIMEOUT_MS) {
        const targetBot = bot.players[otherBotName];
        if (targetBot && targetBot.entity) {
          const targetPos = targetBot.entity.position;
          const myPos = bot.entity.position;
          const distance = myPos.distanceTo(targetPos);

          console.log(
            `[${bot.username}] Distance to ${otherBotName}: ${distance.toFixed(2)}`
          );

          if (distance <= 3) {
            console.log(`[${bot.username}] Reached ${otherBotName}`);
            break;
          }

          bot.pathfinder.setGoal(new GoalNear(targetPos.x, targetPos.y, targetPos.z, 1));
        }

        await sleep(500);
      }

      stopPathfinder(bot);
    } else {
      // Secondary bot waits
      console.log(`[${bot.username}] Waiting for ${otherBotName} to arrive`);
      await sleep(MEETUP_TIMEOUT_MS);
    }

    console.log(`[${bot.username}] Meetup phase complete`);

    // Transition to mining phase
    coordinator.onceEvent(
      `miningPhase_${iterationID}`,
      episodeNum,
      getOnMiningPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        iterationID,
        otherBotName,
        episodeNum,
        episodeInstance,
        args,
        cycleCount
      )
    );
    coordinator.sendToOtherBot(
      `miningPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `meetupPhase_${iterationID} end`
    );
  };
}

/**
 * Get mining phase handler function
 */
function getOnMiningPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  iterationID,
  otherBotName,
  episodeNum,
  episodeInstance,
  args,
  cycleCount = 1
) {
  return async (otherBotPosition) => {
    console.log(
      `[${bot.username}] MINING PHASE (Cycle ${cycleCount}/${MAX_MINING_CYCLES}) - Episode ${episodeNum}, Iteration ${iterationID}`
    );

    coordinator.sendToOtherBot(
      `miningPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `miningPhase_${iterationID} beginning`
    );

    // Get minecraft data and ore IDs
    const mcData = require("minecraft-data")(bot.version);
    const oreIds = VALUABLE_ORES.map((oreName) => mcData.blocksByName[oreName]?.id).filter(
      (id) => id !== undefined
    );

    // Decide mining mode (leader-follower or independent)
    const isLeaderFollowerMode = sharedBotRng() < LEADER_FOLLOWER_PROBABILITY;
    console.log(
      `[${bot.username}] Mining mode: ${
        isLeaderFollowerMode ? "LEADER-FOLLOWER" : "INDEPENDENT"
      }`
    );

    if (isLeaderFollowerMode) {
      // Decide who is leader
      const isLeader = decidePrimaryBot(bot, sharedBotRng, args);
      console.log(`[${bot.username}] I am ${isLeader ? "LEADER" : "FOLLOWER"}`);

      if (isLeader) {
        // Mine as leader
        await mineAsLeader(bot, coordinator, mcData, oreIds, episodeNum, iterationID);

        // Signal completion to follower
        coordinator.sendToOtherBot(
          `miningComplete_${iterationID}`,
          bot.entity.position.clone(),
          episodeNum,
          `miningComplete_${iterationID}`
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
          iterationID
        );
      }
    } else {
      // Both bots mine independently
      
      // Set up listener BEFORE mining to avoid race condition
      const otherBotCompletePromise = new Promise((resolve) => {
        coordinator.onceEvent(`miningComplete_${iterationID}`, episodeNum, resolve);
      });

      await independentMining(bot, mcData, oreIds);

      // Signal completion
      coordinator.sendToOtherBot(
        `miningComplete_${iterationID}`,
        bot.entity.position.clone(),
        episodeNum,
        `miningComplete_${iterationID}`
      );

      // Wait for other bot to complete
      await otherBotCompletePromise;
    }

    console.log(`[${bot.username}] Mining phase complete`);

    // Check if we should loop or stop
    if (cycleCount < MAX_MINING_CYCLES) {
      // Loop back to meetup phase with incremented cycle count
      const nextCycleCount = cycleCount + 1;
      const nextIterationID = `${episodeNum}_cycle${nextCycleCount}`;
      
      console.log(
        `[${bot.username}] Starting cycle ${nextCycleCount}/${MAX_MINING_CYCLES}`
      );

      // Transition to meetup phase for next cycle
      coordinator.onceEvent(
        `meetupPhase_${nextIterationID}`,
        episodeNum,
        getOnMeetupPhaseFn(
          bot,
          rcon,
          sharedBotRng,
          coordinator,
          nextIterationID,
          otherBotName,
          episodeNum,
          episodeInstance,
          args,
          nextCycleCount
        )
      );
      coordinator.sendToOtherBot(
        `meetupPhase_${nextIterationID}`,
        bot.entity.position.clone(),
        episodeNum,
        `miningPhase_${iterationID} end`
      );
    } else {
      // All cycles complete, transition to stop phase
      console.log(
        `[${bot.username}] All ${MAX_MINING_CYCLES} cycles complete, stopping`
      );

      coordinator.onceEvent(
        "stopPhase",
        episodeNum,
        episodeInstance.getOnStopPhaseFn(
          bot,
          rcon,
          sharedBotRng,
          coordinator,
          otherBotName,
          episodeNum,
          args
        )
      );
      coordinator.sendToOtherBot(
        "stopPhase",
        bot.entity.position.clone(),
        episodeNum,
        `miningPhase_${iterationID} end`
      );
    }
  };
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
    await sleep(1000);
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
      `[${bot.username}] COLLECTOR EPISODE ENTRY - Episode ${episodeNum}, Iteration ${iterationID}`
    );

    // Start with meetup phase (cycle 1)
    coordinator.onceEvent(
      `meetupPhase_${iterationID}`,
      episodeNum,
      getOnMeetupPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        iterationID,
        args.other_bot_name,
        episodeNum,
        this,
        args,
        1 // Start with cycle 1
      )
    );
    coordinator.sendToOtherBot(
      `meetupPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      "teleportPhase end"
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

