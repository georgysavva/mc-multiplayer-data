// build-tower-episode.js - Individual tower building episode
const { Vec3 } = require('vec3');
const { sleep, initializePathfinder, stopPathfinder } = require('../utils/movement');
const { ensureItemInHand } = require('./builder');

// Constants for tower building behavior
const INITIAL_EYE_CONTACT_MS = 1500;     // Initial look duration
const FINAL_EYE_CONTACT_MS = 1500;       // Final look duration
const RECORDING_DELAY_MS = 500;          // Recording stabilization delay
const MIN_TOWER_HEIGHT = 8;              // Minimum tower height
const MAX_TOWER_HEIGHT = 8;              // Maximum tower height
const TOWER_BLOCK_TYPE = 'oak_planks';   // Block type for towers
const JUMP_DURATION_MS = 50;             // How long to hold jump
const PLACE_RETRY_DELAY_MS = 20;         // Delay between place attempts
const MAX_PLACE_ATTEMPTS = 10;           // Max attempts to place a block
const SETTLE_DELAY_MS = 200;             // Delay to settle after placing

/**
 * Place a block directly underneath the bot at specific coordinates
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPos - Exact position to place block
 * @param {string} blockType - Type of block to place
 * @returns {Promise<boolean>} True if successfully placed
 */
async function placeBlockAtPosition(bot, targetPos, blockType) {
  console.log(`[${bot.username}] 🎯 Attempting to place ${blockType} at ${targetPos}`);
  
  // Look straight down (negative pitch looks down in mineflayer)
  await bot.look(bot.entity.yaw, -1.45, true); // -1.45 radians is almost straight down
  await sleep(50);
  
  // Try to place the block
  try {
    const targetBlock = bot.blockAt(targetPos);
    
    // If block already exists, we're done
    if (targetBlock && targetBlock.name !== 'air' && targetBlock.name !== 'cave_air') {
      console.log(`[${bot.username}] ✅ Block already exists at ${targetPos}: ${targetBlock.name}`);
      return true;
    }
    
    // Find a reference block to place against (the block below target)
    const belowPos = targetPos.offset(0, -1, 0);
    const referenceBlock = bot.blockAt(belowPos);
    
    if (!referenceBlock || referenceBlock.name === 'air') {
      console.log(`[${bot.username}] ❌ No reference block at ${belowPos}`);
      return false;
    }
    
    console.log(`[${bot.username}] 📦 Placing on top of ${referenceBlock.name} at ${belowPos}`);
    
    // Place block on top face of reference block
    const faceVector = new Vec3(0, 1, 0); // Top face
    await bot.placeBlock(referenceBlock, faceVector);
    
    // Verify placement
    await sleep(100);
    const placedBlock = bot.blockAt(targetPos);
    if (placedBlock && placedBlock.name === blockType) {
      console.log(`[${bot.username}] ✅ Successfully placed ${blockType} at ${targetPos}`);
      return true;
    } else {
      console.log(`[${bot.username}] ⚠️ Placement verification failed at ${targetPos}`);
      return false;
    }
    
  } catch (error) {
    console.log(`[${bot.username}] ❌ Error placing block: ${error.message}`);
    return false;
  }
}

/**
 * Fast block placement - no checks, just place immediately
 * Used during pillar jumping where we know the context
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Block} referenceBlock - Block to place on top of
 * @returns {Promise<boolean>} True if placement was attempted
 */
async function fastPlaceBlock(bot, referenceBlock) {
  try {
    const faceVector = new Vec3(0, 1, 0); // Top face
    await bot.placeBlock(referenceBlock, faceVector);
    return true;
  } catch (error) {
    // Don't log here - too noisy during spam attempts
    return false;
  }
}

/**
 * Build a tower by jumping and placing blocks directly underneath
 * @param {Bot} bot - Mineflayer bot instance
 * @param {number} towerHeight - Height of tower to build
 * @param {Object} args - Configuration arguments
 * @returns {Promise<Object>} Build statistics
 */
async function buildTowerUnderneath(bot, towerHeight, args) {
  console.log(`[${bot.username}] 🗼 Starting tower build: ${towerHeight} blocks`);
  
  let success = 0;
  let failed = 0;
  
  // Ensure we have the blocks
  await ensureItemInHand(bot, TOWER_BLOCK_TYPE, args);
  
  // Get bot's starting position
  const startPos = bot.entity.position.clone();
  const startY = Math.floor(startPos.y);
  console.log(`[${bot.username}] 📍 Starting position: X=${startPos.x.toFixed(2)}, Y=${startPos.y.toFixed(2)}, Z=${startPos.z.toFixed(2)}`);
  
  // Look down ONCE before starting (don't repeat this in the loop)
  console.log(`[${bot.username}] 👇 Looking down once...`);
  await bot.look(bot.entity.yaw, -1.45, true);
  await sleep(50);
  
  for (let i = 0; i < towerHeight; i++) {
    console.log(`[${bot.username}] ═══════════════════════════════════════`);
    console.log(`[${bot.username}] 🧱 Building block ${i + 1}/${towerHeight}`);
    
    // Get reference block (the block we're standing on)
    const currentPos = bot.entity.position.clone();
    const groundPos = new Vec3(Math.floor(currentPos.x), Math.floor(currentPos.y) - 1, Math.floor(currentPos.z));
    const referenceBlock = bot.blockAt(groundPos);
    
    if (!referenceBlock || referenceBlock.name === 'air') {
      console.log(`[${bot.username}] ❌ No ground block at ${groundPos}`);
      failed++;
      break;
    }
    
    console.log(`[${bot.username}] 📦 Reference block: ${referenceBlock.name} at ${groundPos}`);
    
    // Target position (where the new block will be)
    const targetPos = groundPos.offset(0, 1, 0);
    
    // Jump and spam place attempts
    console.log(`[${bot.username}] 🦘 Jumping and spamming place...`);
    bot.setControlState('jump', true);
    
    // Spam place attempts immediately while jumping (fire-and-forget to avoid memory overload)
    for (let attempt = 1; attempt <= MAX_PLACE_ATTEMPTS; attempt++) {
      // Fire without awaiting - let the server handle it asynchronously
      fastPlaceBlock(bot, referenceBlock)
        .then(() => console.log(`[${bot.username}] 🎯 Place fired on attempt ${attempt}`))
        .catch(() => {}); // Silent failure
      
      // Tiny delay between spam attempts
      await sleep(PLACE_RETRY_DELAY_MS);
    }
    
    await sleep(JUMP_DURATION_MS);
    bot.setControlState('jump', false);
    
    // Verify placement after jump completes
    await sleep(50);
    const placedBlock = bot.blockAt(targetPos);
    if (placedBlock && placedBlock.name === TOWER_BLOCK_TYPE) {
      console.log(`[${bot.username}] ✅ Block ${i + 1} placed successfully: ${placedBlock.name} at ${targetPos}`);
      success++;
    } else {
      console.log(`[${bot.username}] ❌ Block ${i + 1} placement failed at ${targetPos}`);
      failed++;
      break;
    }
    
    // Settle on the new block
    console.log(`[${bot.username}] ⏳ Settling...`);
    await sleep(SETTLE_DELAY_MS);
    
    // Verify height
    const newPos = bot.entity.position.clone();
    const newY = Math.floor(newPos.y);
    const heightGained = newY - startY;
    console.log(`[${bot.username}] 📏 New Y: ${newY} (gained ${heightGained} blocks, target: ${i + 1})`);
  }
  
  const finalPos = bot.entity.position.clone();
  const finalY = Math.floor(finalPos.y);
  const totalHeight = finalY - startY;
  
  console.log(`[${bot.username}] ═══════════════════════════════════════`);
  console.log(`[${bot.username}] 🏁 Tower build complete!`);
  console.log(`[${bot.username}]    Blocks placed: ${success}/${towerHeight}`);
  console.log(`[${bot.username}]    Failed: ${failed}/${towerHeight}`);
  console.log(`[${bot.username}]    Height gained: ${totalHeight} blocks`);
  console.log(`[${bot.username}]    Final position: X=${finalPos.x.toFixed(2)}, Y=${finalPos.y.toFixed(2)}, Z=${finalPos.z.toFixed(2)}`);
  
  return { success, failed, heightGained: totalHeight };
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
    
    // STEP 5: Build the tower
    console.log(`[${bot.username}] 🗼 STEP 5: Building ${towerHeight}-block tower with ${TOWER_BLOCK_TYPE}...`);
    const buildResult = await buildTowerUnderneath(bot, towerHeight, args);
    
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
    console.log(`[${bot.username}] 📊 Final stats: ${buildResult.success}/${towerHeight} blocks placed`);
    
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

module.exports = {
  buildTowerUnderneath,
  generateTowerPositions,
  getOnBuildTowerPhaseFn,
  MIN_TOWER_HEIGHT,
  MAX_TOWER_HEIGHT,
  TOWER_BLOCK_TYPE
};
