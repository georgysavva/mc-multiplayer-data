// build-tower-episode.js - Individual tower building episode
const { Vec3 } = require('vec3');
const { sleep, initializePathfinder, stopPathfinder } = require('../utils/movement');
const { placeAt, placeMultiple } = require('./builder');

// Constants for tower building behavior
const INITIAL_EYE_CONTACT_MS = 1500;     // Initial look duration
const FINAL_EYE_CONTACT_MS = 1500;       // Final look duration
const RECORDING_DELAY_MS = 500;          // Recording stabilization delay
const MIN_TOWER_HEIGHT = 6;              // Minimum tower height
const MAX_TOWER_HEIGHT = 12;             // Maximum tower height
const TOWER_BLOCK_TYPE = 'oak_planks';   // Block type for towers
const TOWER_SPACING = 5;                 // Distance between towers

/**
 * Generate positions for a vertical tower
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
 * Build a single tower
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Array<Vec3>} positions - Positions to build at
 * @param {Object} args - Configuration arguments
 * @returns {Promise<Object>} Build statistics
 */
async function buildTower(bot, positions, args) {
  console.log(`[${bot.username}] 🗼 Starting to build ${positions.length}-block tower...`);
  
  // Initialize pathfinder for movement
  initializePathfinder(bot, {
    allowSprinting: false,
    allowParkour: false,
    canDig: false,
    allowEntityDetection: true
  });
  
  try {
    const result = await placeMultiple(bot, positions, TOWER_BLOCK_TYPE, {
      useSneak: true,
      tries: 5,
      args: args
    });
    
    console.log(`[${bot.username}] 🏁 Tower complete!`);
    console.log(`[${bot.username}]    Success: ${result.success}/${positions.length}`);
    console.log(`[${bot.username}]    Failed: ${result.failed}/${positions.length}`);
    
    return result;
  } finally {
    stopPathfinder(bot);
  }
}

/**
 * Get the phase function for tower building episodes
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} iterationID - Iteration ID
 * @param {string} otherBotName - Other bot name
 * @param {number} episodeNum - Episode number
 * @param {Function} getOnStopPhaseFn - Stop phase function getter
 * @param {Object} args - Configuration arguments
 * @returns {Function} Phase function
 */
function getOnBuildTowerPhaseFn(
  bot,
  sharedBotRng,
  coordinator,
  iterationID,
  otherBotName,
  episodeNum,
  getOnStopPhaseFn,
  args
) {
  return async function onBuildTowerPhase(otherBotPosition) {
    coordinator.sendToOtherBot(
      `buildTowerPhase_${iterationID}`,
      bot.entity.position.clone(),
      `buildTowerPhase_${iterationID} beginning`
    );
    
    console.log(`[${bot.username}] 🚀 Starting BUILD TOWER phase ${iterationID}`);
    
    // STEP 1: Bots spawn (already done by teleport phase)
    console.log(`[${bot.username}] ✅ STEP 1: Bot spawned`);
    
    // Strategic delay to ensure recording has fully started
    console.log(`[${bot.username}] ⏳ Waiting ${RECORDING_DELAY_MS}ms for recording to stabilize...`);
    await sleep(RECORDING_DELAY_MS);
    
    // STEP 2: Initial eye contact
    console.log(`[${bot.username}] 👀 STEP 2: Making eye contact with ${otherBotName}...`);
    try {
      const otherEntity = bot.players[otherBotName]?.entity;
      if (otherEntity) {
        const targetPos = otherEntity.position.offset(0, otherEntity.height, 0);
        await bot.lookAt(targetPos);
        await sleep(INITIAL_EYE_CONTACT_MS);
      }
    } catch (lookError) {
      console.log(`[${bot.username}] ⚠️ Could not look at other bot: ${lookError.message}`);
    }
    
    // STEP 3: Prepare to place blocks
    console.log(`[${bot.username}] 📐 STEP 3: Preparing to build tower...`);
    
    // STEP 4: Determine tower height and position
    const towerHeight = MIN_TOWER_HEIGHT + Math.floor(sharedBotRng() * (MAX_TOWER_HEIGHT - MIN_TOWER_HEIGHT + 1));
    console.log(`[${bot.username}] 📏 Tower height: ${towerHeight} blocks`);
    
    const botPos = bot.entity.position.floored();
    
    // Position towers with spacing based on bot name
    let towerBasePos;
    if (bot.username === 'Alpha') {
      towerBasePos = botPos.offset(3, 0, 0);
    } else {
      towerBasePos = botPos.offset(3, 0, TOWER_SPACING);
    }
    
    console.log(`[${bot.username}] 📍 Tower base position: (${towerBasePos.x}, ${towerBasePos.y}, ${towerBasePos.z})`);
    
    // Generate tower positions
    const positions = generateTowerPositions(towerBasePos, towerHeight);
    
    // STEP 5: Build the tower
    console.log(`[${bot.username}] 🗼 STEP 5: Building ${towerHeight}-block tower with ${TOWER_BLOCK_TYPE}...`);
    const buildResult = await buildTower(bot, positions, args);
    
    // STEP 6: Final eye contact
    console.log(`[${bot.username}] 👀 STEP 6: Final eye contact...`);
    try {
      const otherEntity = bot.players[otherBotName]?.entity;
      if (otherEntity) {
        const targetPos = otherEntity.position.offset(0, otherEntity.height, 0);
        await bot.lookAt(targetPos);
        await sleep(FINAL_EYE_CONTACT_MS);
      }
    } catch (lookError) {
      console.log(`[${bot.username}] ⚠️ Could not look at other bot: ${lookError.message}`);
    }
    
    console.log(`[${bot.username}] ✅ BUILD TOWER phase complete!`);
    console.log(`[${bot.username}] 📊 Final stats: ${buildResult.success}/${positions.length} blocks placed`);
    
    // STEP 7: Transition to stop phase (end episode)
    coordinator.onceEvent(
      "stopPhase",
      getOnStopPhaseFn(bot, sharedBotRng, coordinator, otherBotName)
    );
    coordinator.sendToOtherBot(
      "stopPhase",
      bot.entity.position.clone(),
      `buildTowerPhase_${iterationID} end`
    );
    
    return buildResult;
  };
}

module.exports = {
  buildTower,
  generateTowerPositions,
  getOnBuildTowerPhaseFn,
  MIN_TOWER_HEIGHT,
  MAX_TOWER_HEIGHT,
  TOWER_BLOCK_TYPE
};
