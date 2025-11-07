// structureEval.js - Independent structure building and evaluation episode
const { Vec3 } = require("vec3");
const {
  sleep,
  initializePathfinder,
  stopPathfinder,
  gotoWithTimeout,
  lookAtSmooth,
} = require("../utils/movement");
const { placeAt, placeMultiple } = require("./builder");
const { BaseEpisode } = require("./base-episode");
const { pickRandom } = require("../utils/coordination");
const { GoalNear } = require("mineflayer-pathfinder").goals;

// Constants for building behavior
const ALL_STRUCTURE_TYPES = ["wall", "tower", "platform"];
const INITIAL_EYE_CONTACT_MS = 1500; // Initial look duration
const STRUCTURE_GAZE_MS = 2000; // How long to look at structures
const BUILD_BLOCK_TYPES = ["stone", "cobblestone", "oak_planks", "bricks"];
const BLOCK_PLACE_DELAY_MS = 400; // Delay between placing blocks (more human-like)

/**
 * Generate positions for a simple wall structure
 * @param {Vec3} startPos - Starting position
 * @param {number} length - Length of wall
 * @param {number} height - Height of wall
 * @param {string} direction - 'x' or 'z' axis
 * @returns {Array<Vec3>} Array of positions
 */
function generateWallPositions(startPos, length, height, direction = "x") {
  const positions = [];
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < length; i++) {
      if (direction === "x") {
        positions.push(startPos.offset(i, y, 0));
      } else {
        positions.push(startPos.offset(0, y, i));
      }
    }
  }
  return positions;
}

/**
 * Generate positions for a tower structure
 * @param {Vec3} basePos - Base position
 * @param {number} height - Height of tower
 * @returns {Array<Vec3>} Array of positions
 */
function generateTowerPositions(basePos, height) {
  const positions = [];
  for (let y = 0; y < height; y++) {
    positions.push(basePos.offset(0, y, 0));
  }
  return positions;
}

/**
 * Generate positions for a platform structure
 * @param {Vec3} startPos - Starting corner position
 * @param {number} width - Width (X axis)
 * @param {number} depth - Depth (Z axis)
 * @returns {Array<Vec3>} Array of positions
 */
function generatePlatformPositions(startPos, width, depth) {
  const positions = [];
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < depth; z++) {
      positions.push(startPos.offset(x, 0, z));
    }
  }
  return positions;
}

/**
 * Calculate the center position of a structure for camera targeting
 * @param {string} structureType - Type of structure
 * @param {Vec3} basePos - Base position of structure
 * @param {number} height - Height of structure
 * @param {number} length - Length of structure (for wall)
 * @param {number} width - Width of structure (for platform)
 * @returns {Vec3} Center position to look at
 */
function getStructureCenter(structureType, basePos, height, length = 5, width = 4) {
  if (structureType === "tower") {
    // Look at middle of tower
    return basePos.offset(0, height / 2, 0);
  } else if (structureType === "wall") {
    // Look at center of wall
    return basePos.offset(length / 2, height / 2, 0);
  } else if (structureType === "platform") {
    // Look at center of platform
    return basePos.offset(width / 2, 0.5, width / 2);
  }
  return basePos;
}

/**
 * Main building loop - bot builds assigned structure
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Array<Vec3>} positions - Positions to build at
 * @param {string} blockType - Type of block to place
 * @param {Object} args - Configuration arguments
 * @returns {Promise<Object>} Build statistics
 */
async function buildStructure(bot, positions, blockType, args) {
  console.log(
    `[${bot.username}] 🏗️ Starting to build ${positions.length} blocks...`
  );

  // Initialize pathfinder for movement
  initializePathfinder(bot, {
    allowSprinting: false,
    allowParkour: true,
    canDig: true,
    allowEntityDetection: true,
  });

  try {
    const result = await placeMultiple(bot, positions, blockType, {
      useSneak: true,
      tries: 5,
      args: args,
      delayMs: BLOCK_PLACE_DELAY_MS, // Add delay between blocks
    });

    console.log(`[${bot.username}] 🏁 Build complete!`);
    console.log(
      `[${bot.username}]    Success: ${result.success}/${positions.length}`
    );
    console.log(
      `[${bot.username}]    Failed: ${result.failed}/${positions.length}`
    );

    return result;
  } finally {
    stopPathfinder(bot);
  }
}

/**
 * Get the phase function for structure eval episodes
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Object} rcon - RCON connection
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} iterationID - Iteration ID
 * @param {number} episodeNum - Episode number
 * @param {Object} episodeInstance - Episode instance
 * @param {Object} args - Configuration arguments
 * @returns {Function} Phase function
 */
function getOnStructureEvalPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  iterationID,
  episodeNum,
  episodeInstance,
  args
) {
  return async function onStructureEvalPhase(otherBotPosition) {
    coordinator.sendToOtherBot(
      `structureEvalPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `structureEvalPhase_${iterationID} beginning`
    );

    console.log(`[${bot.username}] 🚀 Starting STRUCTURE EVAL phase ${iterationID}`);

    // Save initial spawn position for later return
    const initialSpawnPos = bot.entity.position.clone();
    console.log(
      `[${bot.username}] 📍 Spawn position: ${initialSpawnPos.toString()}`
    );

    // STEP 1: Bots spawn (already done by teleport phase)
    console.log(`[${bot.username}] ✅ STEP 1: Bot spawned`);

    // STEP 1b: Clear construction area - move away from spawn
    console.log(
      `[${bot.username}] 🚶 STEP 1b: Moving away from spawn to clear construction area...`
    );
    try {
      initializePathfinder(bot, {
        allowSprinting: true,
        allowParkour: true,
        canDig: false,
        allowEntityDetection: true,
      });

      // Randomly choose direction to move (North/South/East/West)
      const directions = [
        { name: "North", offset: [0, 0, -8] },  // -Z
        { name: "South", offset: [0, 0, 8] },   // +Z
        { name: "East", offset: [8, 0, 0] },    // +X
        { name: "West", offset: [-8, 0, 0] },   // -X
      ];
      const chosenDirection = directions[Math.floor(Math.random() * directions.length)];
      
      console.log(
        `[${bot.username}] 🧭 Moving ${chosenDirection.name} (${chosenDirection.offset[0]}, ${chosenDirection.offset[2]})`
      );

      // Move 8 blocks away from spawn in chosen direction
      const clearPos = initialSpawnPos.offset(
        chosenDirection.offset[0],
        chosenDirection.offset[1],
        chosenDirection.offset[2]
      );
      const clearGoal = new GoalNear(clearPos.x, clearPos.y, clearPos.z, 1);
      await gotoWithTimeout(bot, clearGoal, { timeoutMs: 10000 });
      console.log(`[${bot.username}] ✅ Cleared construction area`);
    } catch (pathError) {
      console.log(
        `[${bot.username}] ⚠️ Could not clear area: ${pathError.message}`
      );
    } finally {
      stopPathfinder(bot);
    }

    await sleep(500);

    // STEP 2: Initial eye contact
    console.log(
      `[${bot.username}] 👀 STEP 2: Making eye contact with ${args.other_bot_name}...`
    );
    try {
      const otherEntity = bot.players[args.other_bot_name]?.entity;
      if (otherEntity) {
        const targetPos = otherEntity.position.offset(0, otherEntity.height, 0);
        await bot.lookAt(targetPos);
        await sleep(INITIAL_EYE_CONTACT_MS);
      }
    } catch (lookError) {
      console.log(
        `[${bot.username}] ⚠️ Could not look at other bot: ${lookError.message}`
      );
    }

    // STEP 3: Determine build positions based on bot role
    console.log(
      `[${bot.username}] 📐 STEP 3: Planning structure...`
    );
    
    // Determine if this bot is the builder or observer
    const isBuilder = bot.username < args.other_bot_name;
    const role = isBuilder ? "BUILDER" : "OBSERVER";
    
    console.log(
      `[${bot.username}] 🎭 Role: ${role}`
    );
    
    // Each bot independently chooses structure type and block type
    const structureType = ALL_STRUCTURE_TYPES[Math.floor(Math.random() * ALL_STRUCTURE_TYPES.length)];
    const blockType = BUILD_BLOCK_TYPES[Math.floor(Math.random() * BUILD_BLOCK_TYPES.length)];
    
    console.log(
      `[${bot.username}] 🎲 Randomly selected: ${structureType} with ${blockType}`
    );
    
    const botPos = bot.entity.position.floored();
    let positions = [];
    let structureBasePos = null;
    let structureHeight = 0;
    let structureLength = 5;
    let structureWidth = 4;

    if (structureType === "wall") {
      const startPos = botPos.offset(2, 0, 0);
      const length = 5;
      const height = 3;
      structureHeight = height;
      structureLength = length;
      positions = generateWallPositions(startPos, length, height, "x");
      structureBasePos = startPos;
    } else if (structureType === "tower") {
      const startPos = botPos.offset(3, 0, 0);
      const height = 5;
      structureHeight = height;
      positions = generateTowerPositions(startPos, height);
      structureBasePos = startPos;
    } else if (structureType === "platform") {
      const startPos = botPos.offset(2, 0, 0);
      const width = 4;
      const depth = 4;
      structureHeight = 1;
      structureWidth = width;
      positions = generatePlatformPositions(startPos, width, depth);
      structureBasePos = startPos;
    }

    console.log(
      `[${bot.username}] 📋 ${isBuilder ? 'Building' : 'Observing'} ${positions.length} blocks with ${blockType}`
    );

    // STEP 4: Build the structure (only builder builds, observer watches)
    let buildResult = { placed: 0, failed: 0 };
    
    if (isBuilder) {
      console.log(`[${bot.username}] 🏗️ STEP 4: Building structure...`);
      buildResult = await buildStructure(bot, positions, blockType, args);
    } else {
      console.log(`[${bot.username}] 👁️ STEP 4: Observing (not building)...`);
      // Observer waits while builder builds
      await sleep(positions.length * BLOCK_PLACE_DELAY_MS);
    }

    // Calculate structure center for viewing
    const structureCenter = getStructureCenter(
      structureType,
      structureBasePos,
      structureHeight,
      structureLength,
      structureWidth
    );

    // STEP 5: Return to spawn position
    console.log(
      `[${bot.username}] 🏠 STEP 5: Returning to spawn position...`
    );
    try {
      initializePathfinder(bot, {
        allowSprinting: true,
        allowParkour: true,
        canDig: false,
        allowEntityDetection: true,
      });

      const returnGoal = new GoalNear(
        initialSpawnPos.x,
        initialSpawnPos.y,
        initialSpawnPos.z,
        1
      );
      await gotoWithTimeout(bot, returnGoal, { timeoutMs: 15000 });
      console.log(`[${bot.username}] ✅ Returned to spawn`);
    } catch (pathError) {
      console.log(
        `[${bot.username}] ⚠️ Could not return to spawn: ${pathError.message}`
      );
    } finally {
      stopPathfinder(bot);
    }

    await sleep(500);

    // STEP 6: Look at own structure
    console.log(
      `[${bot.username}] 👁️ STEP 6: Looking at own ${structureType}...`
    );
    try {
      if (structureCenter) {
        await lookAtSmooth(bot, structureCenter, 90);
        await sleep(STRUCTURE_GAZE_MS);
        console.log(`[${bot.username}] ✅ Admired own structure`);
      }
    } catch (lookError) {
      console.log(
        `[${bot.username}] ⚠️ Could not look at own structure: ${lookError.message}`
      );
    }

    // STEP 7: Final eye contact
    console.log(`[${bot.username}] 👀 STEP 7: Final eye contact...`);
    try {
      const otherEntity = bot.players[args.other_bot_name]?.entity;
      if (otherEntity) {
        const targetPos = otherEntity.position.offset(0, otherEntity.height, 0);
        await bot.lookAt(targetPos);
        await sleep(INITIAL_EYE_CONTACT_MS);
      }
    } catch (lookError) {
      console.log(
        `[${bot.username}] ⚠️ Could not look at other bot: ${lookError.message}`
      );
    }

    console.log(`[${bot.username}] ✅ STRUCTURE EVAL phase complete!`);

    // Transition to stop phase
    coordinator.onceEvent(
      "stopPhase",
      episodeNum,
      episodeInstance.getOnStopPhaseFn(
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
      `structureEvalPhase_${iterationID} end`
    );

    return buildResult;
  };
}

/**
 * StructureEvalEpisode - Episode class for independent structure building and evaluation
 */
class StructureEvalEpisode extends BaseEpisode {
  static INIT_MIN_BOTS_DISTANCE = 8;
  static INIT_MAX_BOTS_DISTANCE = 15;
  static WORKS_IN_NON_FLAT_WORLD = true;

  constructor(sharedBotRng) {
    super();
  }

  async setupEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args) {}

  async entryPoint(
    bot,
    rcon,
    sharedBotRng,
    coordinator,
    iterationID,
    episodeNum,
    args
  ) {
    coordinator.onceEvent(
      `structureEvalPhase_${iterationID}`,
      episodeNum,
      getOnStructureEvalPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        iterationID,
        episodeNum,
        this,
        args
      )
    );
    coordinator.sendToOtherBot(
      `structureEvalPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      "entryPoint end"
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
    // Clean up any remaining blocks from inventory
  }
}

module.exports = {
  buildStructure,
  generateWallPositions,
  generateTowerPositions,
  generatePlatformPositions,
  getStructureCenter,
  getOnStructureEvalPhaseFn,
  StructureEvalEpisode,
};
