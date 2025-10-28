// build-tower-episode.js - Individual tower building episode
const { Vec3 } = require("vec3");
const {
  sleep,
  initializePathfinder,
  stopPathfinder,
} = require("../utils/movement");
const {
  ensureItemInHand,
  buildTowerUnderneath,
  fastPlaceBlock,
} = require("./builder");
const { BaseEpisode } = require("./base-episode");

// Constants for tower building behavior
const INITIAL_EYE_CONTACT_MS = 1500; // Initial look duration
const FINAL_EYE_CONTACT_MS = 1500; // Final look duration
const RECORDING_DELAY_MS = 500; // Recording stabilization delay
const MIN_TOWER_HEIGHT = 8; // Minimum tower height
const MAX_TOWER_HEIGHT = 8; // Maximum tower height
const TOWER_BLOCK_TYPE = "oak_planks"; // Block type for towers
const JUMP_DURATION_MS = 50; // How long to hold jump
const PLACE_RETRY_DELAY_MS = 20; // Delay between place attempts
const MAX_PLACE_ATTEMPTS = 10; // Max attempts to place a block
const SETTLE_DELAY_MS = 200; // Delay to settle after placing

/**
 * Place a block directly underneath the bot at specific coordinates
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPos - Exact position to place block
 * @param {string} blockType - Type of block to place
 * @returns {Promise<boolean>} True if successfully placed
 */
async function placeBlockAtPosition(bot, targetPos, blockType) {
  console.log(
    `[${bot.username}] 🎯 Attempting to place ${blockType} at ${targetPos}`
  );

  // Look straight down (negative pitch looks down in mineflayer)
  await bot.look(bot.entity.yaw, -1.45, true); // -1.45 radians is almost straight down
  await sleep(50);

  // Try to place the block
  try {
    const targetBlock = bot.blockAt(targetPos);

    // If block already exists, we're done
    if (
      targetBlock &&
      targetBlock.name !== "air" &&
      targetBlock.name !== "cave_air"
    ) {
      console.log(
        `[${bot.username}] ✅ Block already exists at ${targetPos}: ${targetBlock.name}`
      );
      return true;
    }

    // Find a reference block to place against (the block below target)
    const belowPos = targetPos.offset(0, -1, 0);
    const referenceBlock = bot.blockAt(belowPos);

    if (!referenceBlock || referenceBlock.name === "air") {
      console.log(`[${bot.username}] ❌ No reference block at ${belowPos}`);
      return false;
    }

    console.log(
      `[${bot.username}] 📦 Placing on top of ${referenceBlock.name} at ${belowPos}`
    );

    // Place block on top face of reference block
    const faceVector = new Vec3(0, 1, 0); // Top face
    await bot.placeBlock(referenceBlock, faceVector);

    // Verify placement
    await sleep(100);
    const placedBlock = bot.blockAt(targetPos);
    if (placedBlock && placedBlock.name === blockType) {
      console.log(
        `[${bot.username}] ✅ Successfully placed ${blockType} at ${targetPos}`
      );
      return true;
    } else {
      console.log(
        `[${bot.username}] ⚠️ Placement verification failed at ${targetPos}`
      );
      return false;
    }
  } catch (error) {
    console.log(`[${bot.username}] ❌ Error placing block: ${error.message}`);
    return false;
  }
}

/**
 * Get the phase function for tower building episodes
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
function getOnBuildTowerPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  iterationID,
  episodeNum,
  episodeInstance,
  args
) {
  return async function onBuildTowerPhase(otherBotPosition) {
    coordinator.sendToOtherBot(
      `buildTowerPhase_${iterationID}`,
      bot.entity.position.clone(),
      `buildTowerPhase_${iterationID} beginning`
    );

    console.log(
      `[${bot.username}] 🚀 Starting BUILD TOWER phase ${iterationID}`
    );

    // STEP 1: Bots spawn (already done by teleport phase)
    console.log(`[${bot.username}] ✅ STEP 1: Bot spawned`);

    // Strategic delay to ensure recording has fully started
    console.log(
      `[${bot.username}] ⏳ Waiting ${RECORDING_DELAY_MS}ms for recording to stabilize...`
    );
    await sleep(RECORDING_DELAY_MS);

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

    // STEP 3: Prepare to place blocks
    console.log(`[${bot.username}] 📐 STEP 3: Preparing to build tower...`);

    // STEP 4: Determine tower height and position
    const towerHeight =
      MIN_TOWER_HEIGHT +
      Math.floor(sharedBotRng() * (MAX_TOWER_HEIGHT - MIN_TOWER_HEIGHT + 1));
    console.log(`[${bot.username}] 📏 Tower height: ${towerHeight} blocks`);

    // STEP 5: Build the tower
    console.log(
      `[${bot.username}] 🗼 STEP 5: Building ${towerHeight}-block tower with ${TOWER_BLOCK_TYPE}...`
    );
    const buildResult = await buildTowerUnderneath(bot, towerHeight, args, {
      blockType: TOWER_BLOCK_TYPE,
      breakOnFailure: true, // build-tower-episode breaks immediately on failure
      enableRetry: false, // simpler version without retry logic
    });

    // STEP 6: Final eye contact
    console.log(`[${bot.username}] 👀 STEP 6: Final eye contact...`);
    try {
      const otherEntity = bot.players[args.other_bot_name]?.entity;
      if (otherEntity) {
        const targetPos = otherEntity.position.offset(0, otherEntity.height, 0);
        await bot.lookAt(targetPos);
        await sleep(FINAL_EYE_CONTACT_MS);
      }
    } catch (lookError) {
      console.log(
        `[${bot.username}] ⚠️ Could not look at other bot: ${lookError.message}`
      );
    }

    console.log(`[${bot.username}] ✅ BUILD TOWER phase complete!`);
    console.log(
      `[${bot.username}] 📊 Final stats: ${buildResult.success}/${towerHeight} blocks placed`
    );

    // STEP 7: Transition to stop phase (end episode)
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
      `buildTowerPhase_${iterationID} end`
    );

    return buildResult;
  };
}

/**
 * Generate positions for a vertical tower (legacy - not used in new approach)
 * @param {Vec3} basePos - Base position of tower
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
 * BuildTowerEpisode - Episode class for individual tower building
 */
class BuildTowerEpisode extends BaseEpisode {
  static INIT_MIN_BOTS_DISTANCE = 8;
  static INIT_MAX_BOTS_DISTANCE = 15;

  async setupEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args) {
    // Give tower building blocks via RCON
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
    coordinator.onceEvent(
      `buildTowerPhase_${iterationID}`,
      episodeNum,
      getOnBuildTowerPhaseFn(
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
      `buildTowerPhase_${iterationID}`,
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
  getOnBuildTowerPhaseFn,
  MIN_TOWER_HEIGHT,
  MAX_TOWER_HEIGHT,
  TOWER_BLOCK_TYPE,
  BuildTowerEpisode,
};
