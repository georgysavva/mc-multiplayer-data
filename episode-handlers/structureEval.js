// structureEval.js - Independent structure building and evaluation episode
const { Vec3 } = require("vec3");
const {
  sleep,
  initializePathfinder,
  stopPathfinder,
  gotoWithTimeout,
  lookAtSmooth,
} = require("../utils/movement");
const { placeAt } = require("./builder");
const { BaseEpisode } = require("./base-episode");
const { pickRandom } = require("../utils/coordination");
const { GoalNear } = require("mineflayer-pathfinder").goals;

// Constants for building behavior
// const ALL_STRUCTURE_TYPES = ["platform_2x2", "wall_2x2", "wall_4x1", "tower_4"];
const ALL_STRUCTURE_TYPES = ["wall_2x2", "wall_4x1", "tower_4"];
const INITIAL_EYE_CONTACT_MS = 1500; // Initial look duration
const STRUCTURE_GAZE_MS = 2000; // How long to look at structures
const BUILD_BLOCK_TYPES = ["stone"]; // Only stone blocks for building
const BLOCK_PLACE_DELAY_MS = 400; // Delay between placing blocks (more human-like)
const BUILDER_ADMIRE_MS = 3000; // Time for builder to admire structure with observer

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
 * Calculate the center position of a structure for camera targeting at eye level
 * @param {string} structureType - Type of structure
 * @param {Vec3} basePos - Base position of structure
 * @param {number} height - Height of structure
 * @param {number} length - Length of structure (for wall)
 * @param {number} width - Width of structure (for platform)
 * @returns {Vec3} Center position to look at (at eye level ~1.6 blocks)
 */
function getStructureCenter(structureType, basePos, height, length = 5, width = 4) {
  const EYE_LEVEL = 1.6; // Standard Minecraft player eye level
  
  if (structureType === "tower_4") {
    // Look at eye level of tower (or middle if tower is shorter than eye level)
    const lookHeight = Math.min(EYE_LEVEL, height / 2);
    return basePos.offset(0, lookHeight, 0);
  } else if (structureType === "wall_2x2" || structureType === "wall_4x1") {
    // Look at center of wall at eye level (or middle height if wall is shorter)
    const lookHeight = Math.min(EYE_LEVEL, height / 2);
    return basePos.offset(length / 2, lookHeight, 0);
  } else if (structureType === "platform_2x2") {
    // Look at center of platform at eye level
    return basePos.offset(width / 2, EYE_LEVEL, width / 2);
  }
  return basePos.offset(0, EYE_LEVEL, 0);
}

/**
 * Place multiple blocks with delay between each placement (custom version for structureEval)
 * This version overrides the lookAt behavior to use smooth looking instead of instant snap
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Array<Vec3>} positions - Array of positions to place blocks
 * @param {string} itemName - Name of block/item to place
 * @param {Object} options - Options for placement
 * @returns {Promise<Object>} {success: number, failed: number, placed: number}
 */
async function placeMultipleWithDelay(bot, positions, itemName, options = {}) {
  const { delayMs = 0 } = options;
  
  // Sort positions: bottom-up (Y), then near-to-far, then left-to-right
  const botPos = bot.entity.position;
  const sorted = positions.slice().sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y; // Bottom first
    const distA = botPos.distanceTo(a);
    const distB = botPos.distanceTo(b);
    if (Math.abs(distA - distB) > 0.5) return distA - distB; // Near first
    return a.x - b.x; // Left to right
  });

  let success = 0;
  let failed = 0;

  // Override bot.lookAt to use smooth looking (forceLook: false) for this episode
  const originalLookAt = bot.lookAt.bind(bot);
  bot.lookAt = async function(position, forceLook) {
    // Always use smooth looking (false) regardless of what placeAt requests
    return originalLookAt(position, false);
  };

  try {
    for (const pos of sorted) {
      try {
        const placed = await placeAt(bot, pos, itemName, options);
        if (placed) {
          success++;
          console.log(`[${bot.username}] ✅ Placed block at ${pos}`);
        } else {
          failed++;
          console.log(`[${bot.username}] ❌ Failed to place at ${pos}`);
        }
      } catch (error) {
        failed++;
        console.log(
          `[${bot.username}] ❌ Error placing at ${pos}: ${error.message}`
        );
      }
      
      // Add delay between blocks if specified
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  } finally {
    // Restore original lookAt behavior
    bot.lookAt = originalLookAt;
  }

  return { success, failed, placed: success };
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
    const result = await placeMultipleWithDelay(bot, positions, blockType, {
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

    // STEP 1b: Clear construction area - move away from spawn (BUILDER only)
    const isBuilder = bot.username < args.other_bot_name;
    const role = isBuilder ? "BUILDER" : "OBSERVER";
    
    console.log(
      `[${bot.username}] 🎭 Role: ${role}`
    );
    
    if (isBuilder) {
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
          { name: "North", offset: [0, 0, -3] },  // -Z
          { name: "South", offset: [0, 0, 3] },   // +Z
          { name: "East", offset: [3, 0, 0] },    // +X
          { name: "West", offset: [-3, 0, 0] },   // -X
        ];
        const chosenDirection = directions[Math.floor(Math.random() * directions.length)];
        
        console.log(
          `[${bot.username}] 🧭 Moving ${chosenDirection.name} (${chosenDirection.offset[0]}, ${chosenDirection.offset[2]})`
        );

        // Move 3 blocks away from spawn in chosen direction
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
    } else {
      console.log(
        `[${bot.username}] 🧍 STEP 1b: Staying stationary (observer role)`
      );
    }

    await sleep(500);

    // STEP 2: Initial eye contact (BUILDER only, observer remains stationary)
    if (isBuilder) {
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
    } else {
      console.log(
        `[${bot.username}] 🧍 STEP 2: Remaining stationary (observer role - no eye contact)`
      );
      await sleep(INITIAL_EYE_CONTACT_MS);
    }

    // STEP 3: Determine build positions based on bot role
    console.log(
      `[${bot.username}] 📐 STEP 3: Planning structure...`
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

    if (structureType === "platform_2x2") {
      const startPos = botPos.offset(2, 0, 0);
      const width = 2;
      const depth = 2;
      structureHeight = 1;
      structureWidth = width;
      positions = generatePlatformPositions(startPos, width, depth);
      structureBasePos = startPos;
    } else if (structureType === "wall_2x2") {
      const startPos = botPos.offset(2, 0, 0);
      const length = 2;
      const height = 2;
      structureHeight = height;
      structureLength = length;
      positions = generateWallPositions(startPos, length, height, "x");
      structureBasePos = startPos;
    } else if (structureType === "wall_4x1") {
      const startPos = botPos.offset(2, 0, 0);
      const length = 4;
      const height = 1;
      structureHeight = height;
      structureLength = length;
      positions = generateWallPositions(startPos, length, height, "x");
      structureBasePos = startPos;
    } else if (structureType === "tower_4") {
      const startPos = botPos.offset(3, 0, 0);
      const height = 4;
      structureHeight = height;
      positions = generateTowerPositions(startPos, height);
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
      console.log(`[${bot.username}] 🧍 STEP 4: Remaining stationary (observer role)...`);
      // Observer remains completely stationary - no looking, no movement
      const totalWatchTime = positions.length * BLOCK_PLACE_DELAY_MS;
      await sleep(totalWatchTime);
      console.log(`[${bot.username}] ✅ Finished waiting (stationary)`);
    }

    // Calculate structure center for viewing
    const structureCenter = getStructureCenter(
      structureType,
      structureBasePos,
      structureHeight,
      structureLength,
      structureWidth
    );

    // STEP 5: Builder moves next to observer and looks at structure together
    if (isBuilder) {
      console.log(
        `[${bot.username}] 🚶 STEP 5: Moving to stand next to observer...`
      );
      try {
        initializePathfinder(bot, {
          allowSprinting: true,
          allowParkour: true,
          canDig: false,
          allowEntityDetection: true,
        });

        // Get observer's position
        const otherEntity = bot.players[args.other_bot_name]?.entity;
        if (otherEntity) {
          const observerPos = otherEntity.position.clone();
          const observerYaw = otherEntity.yaw; // Observer's facing direction
          
          // Calculate a position 2 blocks to the RIGHT of observer (perpendicular to their view)
          // Yaw + 90° (π/2 radians) = right side
          const sideAngle = observerYaw + Math.PI / 2;
          const sideDistance = 2;
          
          const sideX = observerPos.x + Math.cos(sideAngle) * sideDistance;
          const sideZ = observerPos.z + Math.sin(sideAngle) * sideDistance;
          
          console.log(
            `[${bot.username}] 📐 Observer yaw: ${observerYaw.toFixed(2)}, moving to side position (${sideX.toFixed(1)}, ${sideZ.toFixed(1)})`
          );
          
          // Move to stand beside observer (not in front)
          const standGoal = new GoalNear(
            sideX,
            observerPos.y,
            sideZ,
            1 // Get within 1 block of the side position
          );
          await gotoWithTimeout(bot, standGoal, { timeoutMs: 10000 });
          console.log(`[${bot.username}] ✅ Moved next to observer (side position)`);
          
          // Look at the structure for 3 seconds
          if (structureCenter) {
            console.log(`[${bot.username}] 👁️ Looking at structure together...`);
            await lookAtSmooth(bot, structureCenter, 90);
            await sleep(BUILDER_ADMIRE_MS);
            console.log(`[${bot.username}] ✅ Admired structure from observer position`);
          }
        }
      } catch (pathError) {
        console.log(
          `[${bot.username}] ⚠️ Could not move to observer: ${pathError.message}`
        );
      } finally {
        stopPathfinder(bot);
      }
    } else {
      console.log(
        `[${bot.username}] 🧍 STEP 5: Remaining stationary (observer role)...`
      );
      // Observer waits while builder moves and looks
      await sleep(BUILDER_ADMIRE_MS + 5000); // Extra time for builder to pathfind
      console.log(`[${bot.username}] ✅ Finished waiting (stationary)`);
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
  placeMultipleWithDelay,
  StructureEvalEpisode,
};
