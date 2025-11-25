// build-structure-episode.js - Collaborative building episode
const { Vec3 } = require("vec3");
const {
  sleep,
  initializePathfinder,
  stopPathfinder,
} = require("../utils/movement");
const { placeAt, placeMultiple } = require("./builder");
const { BaseEpisode } = require("./base-episode");
const { pickRandom } = require("../utils/coordination");
const { ensureBotHasEnough, unequipHand } = require("../utils/items");

// Constants for building behavior
const ALL_STRUCTURE_TYPES = ["wall", "tower", "platform"];
const INITIAL_EYE_CONTACT_MS = 1500; // Initial look duration
const BUILD_BLOCK_TYPES = ["stone", "cobblestone", "oak_planks", "bricks"];
const BLOCK_PLACE_DELAY_MS = 1500; // Delay between placing blocks (1.5 seconds for more visible building)

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
 * Main building loop - bot builds assigned structure
 * Enhanced with intelligent build order and comprehensive logging
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Array<Vec3>} positions - Positions to build at
 * @param {string} blockType - Type of block to place
 * @param {Object} args - Configuration arguments
 * @returns {Promise<Object>} Build statistics
 */
async function buildStructure(bot, positions, blockType, args) {
  console.log(
    `[${bot.username}] 🏗️ Starting to build ${positions.length} blocks with ${blockType}...`
  );

  // Initialize pathfinder for movement with appropriate settings
  initializePathfinder(bot, {
    allowSprinting: false,
    allowParkour: true,
    canDig: false, // Don't dig during building
    allowEntityDetection: true,
  });

  try {
    const result = await placeMultiple(bot, positions, blockType, {
      useSneak: false, // No sneaking needed for normal structure building
      tries: 5,
      args: args,
      delayMs: BLOCK_PLACE_DELAY_MS,
      useBuildOrder: true, // Enable intelligent build order
      useSmartPositioning: true, // Enable smart positioning to move to optimal distance before placing
      prePlacementDelay: 500, // Natural pause before placement
    });

    console.log(`[${bot.username}] 🏁 Build complete!`);
    console.log(
      `[${bot.username}]    ✅ Success: ${result.success}/${positions.length} ` +
      `(${((result.success / positions.length) * 100).toFixed(1)}%)`
    );
    console.log(
      `[${bot.username}]    ❌ Failed: ${result.failed}/${positions.length}`
    );
    if (result.skipped > 0) {
      console.log(
        `[${bot.username}]    ⏭️ Skipped: ${result.skipped}/${positions.length}`
      );
    }

    // Check if build was successful enough (>50% success rate)
    const successRate = result.success / positions.length;
    if (successRate < 0.5) {
      console.warn(
        `[${bot.username}] ⚠️ Low success rate: ${(successRate * 100).toFixed(1)}%`
      );
    }

    return result;
  } catch (error) {
    console.error(`[${bot.username}] ❌ Build error: ${error.message}`);
    throw error;
  } finally {
    stopPathfinder(bot);
  }
}

/**
 * Get the phase function for building episodes
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Object} rcon - RCON connection
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} iterationID - Iteration ID
 * @param {number} episodeNum - Episode number
 * @param {Object} episodeInstance - Episode instance
 * @param {Object} args - Configuration arguments
 * @param {string} structureType - Type of structure ('wall', 'tower', 'platform')
 * @param {Object} phaseDataOur - Phase data for this bot (contains position)
 * @returns {Function} Phase function
 */
function getOnBuildPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  iterationID,
  episodeNum,
  episodeInstance,
  args,
  structureType = "wall",
  phaseDataOur
) {
  return async function onBuildPhase(phaseDataOther) {
    coordinator.sendToOtherBot(
      `buildPhase_${iterationID}`,
      phaseDataOur,
      episodeNum,
      `buildPhase_${iterationID} beginning`
    );

    console.log(`[${bot.username}] 🚀 Starting BUILD phase ${iterationID}`);

    // STEP 1: Bots spawn (already done by teleport phase)
    console.log(`[${bot.username}] ✅ STEP 1: Bot spawned`);

    // STEP 2: Initial eye contact
    console.log(
      `[${bot.username}] 👀 STEP 2: Making eye contact with ${args.other_bot_name}...`
    );
    try {
      const otherEntity = bot.players[args.other_bot_name]?.entity;
      if (otherEntity) {
        const targetPos = otherEntity.position.offset(0, otherEntity.height, 0);
        await bot.lookAt(targetPos, false);
        await sleep(INITIAL_EYE_CONTACT_MS);
      }
    } catch (lookError) {
      console.log(
        `[${bot.username}] ⚠️ Could not look at other bot: ${lookError.message}`
      );
    }

    // STEP 3: Determine build positions based on bot role
    console.log(
      `[${bot.username}] 📐 STEP 3: Planning structure ${structureType}...`
    );
    const botPos = phaseDataOur.position.floored();
    let positions = [];
    let blockType =
      BUILD_BLOCK_TYPES[Math.floor(sharedBotRng() * BUILD_BLOCK_TYPES.length)];
    const botNameSmaller = bot.username < args.other_bot_name;

    if (structureType === "wall") {
      // Alpha builds left side, Bravo builds right side
      const startPos = botPos.offset(2, 0, 0);
      const length = 5;
      const height = 3;

      if (botNameSmaller) {
        positions = generateWallPositions(startPos, length, height, "x");
      } else {
        positions = generateWallPositions(
          startPos.offset(0, 0, 2),
          length,
          height,
          "x"
        );
      }
    } else if (structureType === "tower") {
      // Each bot builds their own tower
      const startPos = botPos.offset(3, 0, botNameSmaller ? 0 : 3);
      const height = 5;
      positions = generateTowerPositions(startPos, height);
    } else if (structureType === "platform") {
      // Bots build a shared platform - use midpoint between bots as reference
      const midpoint = botPos.plus(phaseDataOther.position).scaled(0.5).floored();
      const startPos = midpoint.offset(-2, 0, -2); // Center the 4x4 platform at midpoint
      const width = 4;
      const depth = 4;

      // Split platform horizontally: Assign halves based on bot position relative to platform
      positions = [];
      const halfDepth = Math.floor(depth / 2);
      
      // Determine which bot is closer to which half based on Z coordinate
      const platformCenterZ = startPos.z + depth / 2;
      const botIsNorth = botPos.z < platformCenterZ; // Bot is north (smaller Z) of platform center
      
      if (botIsNorth) {
        // This bot is north - build top half (z=0,1) from middle outward
        for (let z = halfDepth - 1; z >= 0; z--) {
          for (let x = 0; x < width; x++) {
            positions.push(startPos.offset(x, 0, z));
          }
        }
        console.log(
          `[${bot.username}] 🎯 Platform centered at midpoint (${midpoint.x}, ${midpoint.y}, ${midpoint.z}), building ${positions.length} blocks (NORTH half - top rows)`
        );
      } else {
        // This bot is south - build bottom half (z=2,3) from middle outward
        for (let z = halfDepth; z < depth; z++) {
          for (let x = 0; x < width; x++) {
            positions.push(startPos.offset(x, 0, z));
          }
        }
        console.log(
          `[${bot.username}] 🎯 Platform centered at midpoint (${midpoint.x}, ${midpoint.y}, ${midpoint.z}), building ${positions.length} blocks (SOUTH half - bottom rows)`
        );
      }
    }

    console.log(
      `[${bot.username}] 📋 Building ${positions.length} blocks with ${blockType}`
    );

    // STEP 4: Build the structure
    console.log(`[${bot.username}] 🏗️ STEP 4: Building structure...`);
    const buildResult = await buildStructure(bot, positions, blockType, args);

    // STEP 5: Final eye contact
    console.log(`[${bot.username}] 👀 STEP 5: Final eye contact...`);
    try {
      const otherEntity = bot.players[args.other_bot_name]?.entity;
      if (otherEntity) {
        const targetPos = otherEntity.position.offset(0, otherEntity.height, 0);
        await bot.lookAt(targetPos, false);
        await sleep(INITIAL_EYE_CONTACT_MS);
      }
    } catch (lookError) {
      console.log(
        `[${bot.username}] ⚠️ Could not look at other bot: ${lookError.message}`
      );
    }

    console.log(`[${bot.username}] ✅ BUILD phase complete!`);

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
      phaseDataOur,
      episodeNum,
      `buildPhase_${iterationID} end`
    );

    return buildResult;
  };
}

/**
 * BuildStructureEpisode - Episode class for collaborative structure building
 */
class BuildStructureEpisode extends BaseEpisode {
  static INIT_MIN_BOTS_DISTANCE = 8;
  static INIT_MAX_BOTS_DISTANCE = 15;
  static WORKS_IN_NON_FLAT_WORLD = true;

  constructor(sharedBotRng) {
    super();
    this.structureType = pickRandom(ALL_STRUCTURE_TYPES, sharedBotRng);
  }

  async setupEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args) {
    for (const blockType of BUILD_BLOCK_TYPES) {
      await ensureBotHasEnough(bot, rcon, blockType, 64);
    }
    await unequipHand(bot);
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
    const phaseDataOur = {
      position: bot.entity.position.clone()
    };
    
    coordinator.onceEvent(
      `buildPhase_${iterationID}`,
      episodeNum,
      getOnBuildPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        iterationID,
        episodeNum,
        this,
        args,
        this.structureType,
        phaseDataOur
      )
    );
    coordinator.sendToOtherBot(
      `buildPhase_${iterationID}`,
      phaseDataOur,
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
  getOnBuildPhaseFn,
  BuildStructureEpisode,
};
