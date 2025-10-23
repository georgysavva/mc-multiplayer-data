// tower-bridge-episode.js - Episode where bots build towers then bridge towards each other
const { Vec3 } = require('vec3');
const { sleep } = require('../utils/movement');
const { ensureItemInHand } = require('./builder');
const { placeAt } = require('./builder');

// Constants for tower-bridge behavior
const INITIAL_EYE_CONTACT_MS = 1500;     // Initial look duration
const FINAL_EYE_CONTACT_MS = 1500;       // Final look duration
const RECORDING_DELAY_MS = 500;          // Recording stabilization delay
const TOWER_HEIGHT = 8;                  // Fixed tower height
const TOWER_BLOCK_TYPE = 'oak_planks';   // Block type for towers
const BRIDGE_BLOCK_TYPE = 'oak_planks';  // Block type for bridge
const JUMP_DURATION_MS = 50;             // How long to hold jump
const PLACE_RETRY_DELAY_MS = 20;         // Delay between place attempts
const MAX_PLACE_ATTEMPTS = 10;           // Max attempts to place a block
const SETTLE_DELAY_MS = 200;             // Delay to settle after placing

/**
 * Fast block placement - no checks, just place immediately
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
  
  // Look down ONCE before starting
  console.log(`[${bot.username}] 👇 Looking down once...`);
  await bot.look(bot.entity.yaw, -1.45, true);
  await sleep(50);
  
  for (let i = 0; i < towerHeight; i++) {
    console.log(`[${bot.username}] ═══════════════════════════════════════`);
    console.log(`[${bot.username}] 🧱 Building block ${i + 1}/${towerHeight}`);
    
    // Find the block we're sneaking on (even if floating off the edge)
    const sneakingBlockInfo = findSneakingBlock(bot);
    
    if (!sneakingBlockInfo) {
      console.log(`[${bot.username}] ❌ No ground block found - not sneaking on any block`);
      failed++;
      break;
    }
    
    const groundBlock = sneakingBlockInfo.block;
    const groundPos = sneakingBlockInfo.pos;
    
    console.log(`[${bot.username}] 📦 Reference block: ${groundBlock.name} at ${groundPos}`);
    
    // Target position (where the new block will be)
    const targetPos = groundPos.offset(0, 1, 0);
    
    // Jump and spam place attempts
    console.log(`[${bot.username}] 🦘 Jumping and spamming place...`);
    bot.setControlState('jump', true);
    
    // Spam place attempts immediately while jumping
    for (let attempt = 1; attempt <= MAX_PLACE_ATTEMPTS; attempt++) {
      fastPlaceBlock(bot, groundBlock)
        .then(() => console.log(`[${bot.username}] 🎯 Place fired on attempt ${attempt}`))
        .catch(() => {});
      
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
      
      // Don't break immediately - log the failure but continue
      console.log(`[${bot.username}] ⚠️ Continuing despite failure...`);
    }
    
    // Settle on the new block - increased delay for reliability
    console.log(`[${bot.username}] ⏳ Settling...`);
    await sleep(SETTLE_DELAY_MS + 100); // Extra time to ensure bot is stable
    
    // Verify height
    const newPos = bot.entity.position.clone();
    const newY = Math.floor(newPos.y);
    const heightGained = newY - startY;
    console.log(`[${bot.username}] 📏 New Y: ${newY} (gained ${heightGained} blocks, target: ${i + 1})`);
    
    // If we haven't gained height, something is wrong - retry this block
    if (heightGained < i + 1) {
      console.log(`[${bot.username}] ⚠️ Height mismatch! Expected ${i + 1}, got ${heightGained}`);
      console.log(`[${bot.username}] 🔄 Retrying block ${i + 1}...`);
      
      // Find the block we're sneaking on (even if floating off the edge)
      const retrySneakingBlockInfo = findSneakingBlock(bot);
      
      if (!retrySneakingBlockInfo) {
        console.log(`[${bot.username}] ❌ No ground block found - not sneaking on any block`);
        failed++;
        break;
      }
      
      const retryGroundBlock = retrySneakingBlockInfo.block;
      const retryGroundPos = retrySneakingBlockInfo.pos;
      
      // Look down again
      await bot.look(bot.entity.yaw, -1.45, true);
      await sleep(50);
      
      // Try one more time
      bot.setControlState('jump', true);
      for (let retry = 1; retry <= MAX_PLACE_ATTEMPTS; retry++) {
        fastPlaceBlock(bot, retryGroundBlock).catch(() => {});
        await sleep(PLACE_RETRY_DELAY_MS);
      }
      await sleep(JUMP_DURATION_MS);
      bot.setControlState('jump', false);
      await sleep(SETTLE_DELAY_MS + 100);
      
      // Check again
      const retryPos = bot.entity.position.clone();
      const retryY = Math.floor(retryPos.y);
      const retryHeight = retryY - startY;
      console.log(`[${bot.username}] 📏 After retry - Y: ${retryY}, height: ${retryHeight}`);
      
      if (retryHeight < i + 1) {
        console.log(`[${bot.username}] ❌ Retry failed - aborting tower build`);
        failed++;
        break;
      }
    }
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
 * Build a bridge towards a target position by placing blocks on the side of the current block
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPos - Target position to build towards
 * @param {Object} args - Configuration arguments
 * @returns {Promise<Object>} Build statistics
 */
async function buildBridgeTowards(bot, targetPos, args) {
  console.log(`[${bot.username}] 🌉 Building bridge towards ${targetPos}`);
  
  let blocksPlaced = 0;
  const startPos = bot.entity.position.clone();
  
  // Calculate direction to target
  const dx = targetPos.x - startPos.x;
  const dz = targetPos.z - startPos.z;
  const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
  
  console.log(`[${bot.username}] 📐 Direction to target: dx=${dx.toFixed(2)}, dz=${dz.toFixed(2)}, distance=${horizontalDistance.toFixed(2)}`);
  
  // Normalize direction
  const dirX = dx / horizontalDistance;
  const dirZ = dz / horizontalDistance;
  
  // Calculate yaw to face the target
  const targetYaw = Math.atan2(-dirX, -dirZ);
  console.log(`[${bot.username}] 🧭 Facing target at yaw: ${targetYaw.toFixed(2)} radians`);
  
  // Ensure we have blocks
  await ensureItemInHand(bot, BRIDGE_BLOCK_TYPE, args);
  
  // Build bridge block by block
  const maxBlocks = Math.ceil(horizontalDistance / 2) + 2; // Build halfway plus buffer
  
  for (let i = 0; i < maxBlocks; i++) {
    const myPos = bot.entity.position.clone();
    const distanceToTarget = Math.sqrt(
      Math.pow(targetPos.x - myPos.x, 2) + 
      Math.pow(targetPos.z - myPos.z, 2)
    );
    
    console.log(`[${bot.username}] 📏 Distance to target: ${distanceToTarget.toFixed(2)} blocks`);
    
    // Stop if we're close enough to the target
    if (distanceToTarget < 2.0) {
      console.log(`[${bot.username}] 🎯 Reached target area!`);
      break;
    }
    
    // Find the block we're sneaking on (even if floating off the edge)
    const sneakingBlockInfo = findSneakingBlock(bot);
    
    if (!sneakingBlockInfo) {
      console.log(`[${bot.username}] ❌ No ground block found - not sneaking on any block`);
      break;
    }
    
    const groundBlock = sneakingBlockInfo.block;
    const groundPos = sneakingBlockInfo.pos;
    
    console.log(`[${bot.username}] 📦 Standing on: ${groundBlock.name} at ${groundPos}`);
    
    // Determine which face to place on based on direction to target
    // Calculate which direction is dominant
    const absDx = Math.abs(dirX);
    const absDz = Math.abs(dirZ);
    
    let faceVector;
    if (absDx > absDz) {
      // Moving more in X direction
      faceVector = new Vec3(dirX > 0 ? 1 : -1, 0, 0);
      console.log(`[${bot.username}] 🧭 Placing on ${dirX > 0 ? 'East (+X)' : 'West (-X)'} face`);
    } else {
      // Moving more in Z direction
      faceVector = new Vec3(0, 0, dirZ > 0 ? 1 : -1);
      console.log(`[${bot.username}] 🧭 Placing on ${dirZ > 0 ? 'South (+Z)' : 'North (-Z)'} face`);
    }
    
    console.log(`[${bot.username}] 🧱 Placing bridge block ${i + 1} on side of ${groundBlock.name}`);
    
    try {
      // Look towards the target (slightly down to see the placement)
      await bot.look(targetYaw, 0.3, true);
      await sleep(100);
      
      // Place block on the side of the block we're standing on
      await bot.placeBlock(groundBlock, faceVector);
      blocksPlaced++;
      console.log(`[${bot.username}] ✅ Bridge block ${i + 1} placed successfully`);
      
      await sleep(200); // Wait for block to appear
      
      // Move forward onto the new block (slower while sneaking)
      console.log(`[${bot.username}] 🚶 Walking forward onto bridge...`);
      
      // Face the target direction
      await bot.look(targetYaw, 0, true);
      
      bot.setControlState('forward', true);
      await sleep(1000); // Reduced to prevent overshooting (sneaking speed ~1.3 blocks/s, so 600ms = ~0.78 blocks)
      bot.setControlState('forward', false);
      
      await sleep(300); // Settle on new block
      
      // Verify we moved forward
      const newPos = bot.entity.position.clone();
      const distanceMoved = myPos.distanceTo(newPos);
      console.log(`[${bot.username}] 📏 Moved ${distanceMoved.toFixed(2)} blocks forward`);
      
      if (distanceMoved < 0.3) {
        console.log(`[${bot.username}] ⚠️ Didn't move much, might be stuck`);
      }
      
    } catch (placeError) {
      console.log(`[${bot.username}] ❌ Error placing bridge block: ${placeError.message}`);
      // Try to continue anyway
    }
  }
  
  const endPos = bot.entity.position.clone();
  const distanceTraveled = startPos.distanceTo(endPos);
  
  console.log(`[${bot.username}] 🏁 Bridge building complete!`);
  console.log(`[${bot.username}]    Blocks placed: ${blocksPlaced}`);
  console.log(`[${bot.username}]    Distance traveled: ${distanceTraveled.toFixed(2)} blocks`);
  
  return { blocksPlaced, distanceTraveled };
}

/**
 * Find the block the bot is currently sneaking on, even if floating off the edge.
 * This handles the Minecraft mechanic where sneaking prevents falling.
 * @param {Bot} bot - The mineflayer bot
 * @returns {Object|null} Object with {block, pos} or null if no ground found
 */
function findSneakingBlock(bot) {
  const myPos = bot.entity.position.clone();
  
  // Check directly below first
  const directlyBelow = new Vec3(
    Math.floor(myPos.x),
    Math.floor(myPos.y) - 1,
    Math.floor(myPos.z)
  );
  
  let groundBlock = bot.blockAt(directlyBelow);
  
  if (groundBlock && groundBlock.name !== 'air') {
    return { block: groundBlock, pos: directlyBelow };
  }
  
  // If floating, check adjacent blocks (bot is hanging off edge while sneaking)
  // Check all 4 cardinal directions
  const checkPositions = [
    new Vec3(Math.floor(myPos.x) + 1, Math.floor(myPos.y) - 1, Math.floor(myPos.z)),     // East (+X)
    new Vec3(Math.floor(myPos.x) - 1, Math.floor(myPos.y) - 1, Math.floor(myPos.z)),     // West (-X)
    new Vec3(Math.floor(myPos.x), Math.floor(myPos.y) - 1, Math.floor(myPos.z) + 1),     // South (+Z)
    new Vec3(Math.floor(myPos.x), Math.floor(myPos.y) - 1, Math.floor(myPos.z) - 1),     // North (-Z)
  ];
  
  // Find the closest solid block that bot could be sneaking on
  let closestBlock = null;
  let closestDistance = Infinity;
  
  for (const checkPos of checkPositions) {
    const block = bot.blockAt(checkPos);
    if (block && block.name !== 'air') {
      // Calculate distance from bot to center of this block
      const blockCenter = checkPos.offset(0.5, 1, 0.5);
      const distance = myPos.distanceTo(blockCenter);
      
      // Bot must be within 1.5 blocks to be sneaking on it
      if (distance < 1.5 && distance < closestDistance) {
        closestBlock = { block: block, pos: checkPos };
        closestDistance = distance;
      }
    }
  }
  
  return closestBlock;
}

/**
 * Get the phase function for tower-bridge episodes
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
function getOnTowerBridgePhaseFn(
  bot,
  sharedBotRng,
  coordinator,
  iterationID,
  otherBotName,
  episodeNum,
  getOnStopPhaseFn,
  args
) {
  return async function onTowerBridgePhase(otherBotPosition) {
    coordinator.sendToOtherBot(
      `towerBridgePhase_${iterationID}`,
      bot.entity.position.clone(),
      `towerBridgePhase_${iterationID} beginning`
    );
    
    console.log(`[${bot.username}] 🚀 Starting TOWER-BRIDGE phase ${iterationID}`);
    console.log(`[${bot.username}] 🎬 TOWER-BRIDGE EPISODE - Episode ${episodeNum}, Iteration ${iterationID}`);
    
    // STEP 1: Bots spawn (already done by teleport phase)
    console.log(`[${bot.username}] ✅ STEP 1: Bot spawned`);
    
    // Strategic delay to ensure recording has fully started
    console.log(`[${bot.username}] ⏳ Waiting ${RECORDING_DELAY_MS}ms for recording to stabilize...`);
    await sleep(RECORDING_DELAY_MS);
    
    // STEP 2: Initial eye contact
    console.log(`[${bot.username}] 👀 STEP 2: Making eye contact with ${otherBotName}...`);
    let actualOtherBotPosition = null;
    try {
      const otherEntity = bot.players[otherBotName]?.entity;
      if (otherEntity) {
        actualOtherBotPosition = otherEntity.position.clone();
        const targetPos = otherEntity.position.offset(0, otherEntity.height, 0);
        await bot.lookAt(targetPos);
        await sleep(INITIAL_EYE_CONTACT_MS);
      } else {
        console.log(`[${bot.username}] ⚠️ Could not find other bot entity, using passed position`);
        actualOtherBotPosition = otherBotPosition.clone();
      }
    } catch (lookError) {
      console.log(`[${bot.username}] ⚠️ Could not look at other bot: ${lookError.message}`);
      actualOtherBotPosition = otherBotPosition.clone();
    }
    
    // STEP 3: Move backward to increase distance for longer bridges
    console.log(`[${bot.username}] 🚶 STEP 3: Moving backward 3 blocks to increase bridge distance...`);
    const startPos = bot.entity.position.clone();
    
    // Calculate direction AWAY from other bot
    const backwardDx = startPos.x - actualOtherBotPosition.x;
    const backwardDz = startPos.z - actualOtherBotPosition.z;
    const backwardDistance = Math.sqrt(backwardDx * backwardDx + backwardDz * backwardDz);
    
    // Normalize direction (away from other bot)
    const backwardDirX = backwardDx / backwardDistance;
    const backwardDirZ = backwardDz / backwardDistance;
    
    // Calculate yaw to face AWAY from other bot
    const awayYaw = Math.atan2(-backwardDirX, -backwardDirZ);
    
    console.log(`[${bot.username}] 🧭 Facing away from ${otherBotName} at yaw: ${awayYaw.toFixed(2)} radians`);
    await bot.look(awayYaw, 0, true);
    await sleep(200);
    
    // Walk backward 3 blocks
    const BACKWARD_DISTANCE = 3;
    const WALK_TIME_PER_BLOCK = 1000; // ~1 second per block at walking speed
    
    console.log(`[${bot.username}] 🚶 Walking backward ${BACKWARD_DISTANCE} blocks...`);
    bot.setControlState('forward', true);
    await sleep(BACKWARD_DISTANCE * WALK_TIME_PER_BLOCK);
    bot.setControlState('forward', false);
    
    const newPos = bot.entity.position.clone();
    const distanceMoved = startPos.distanceTo(newPos);
    console.log(`[${bot.username}] ✅ Moved ${distanceMoved.toFixed(2)} blocks backward`);
    
    await sleep(500); // Settle after moving
    
    // STEP 4: Build tower underneath (8 blocks high)
    console.log(`[${bot.username}] 🗼 STEP 4: Building ${TOWER_HEIGHT}-block tower...`);
    const towerResult = await buildTowerUnderneath(bot, TOWER_HEIGHT, args);
    
    if (towerResult.failed > 2) {
      console.log(`[${bot.username}] ⚠️ Tower build failed significantly, aborting episode...`);
      return;
    }
    
    if (towerResult.failed > 0 || towerResult.heightGained < TOWER_HEIGHT - 1) {
      console.log(`[${bot.username}] ⚠️ Tower build incomplete, but continuing...`);
    }
    
    // Wait a moment for both bots to finish their towers
    await sleep(1500);
    
    // STEP 5: Enable sneaking to prevent falling off tower
    console.log(`[${bot.username}] 🐢 STEP 5: Enabling sneak mode (crouch) to prevent falling...`);
    bot.setControlState('sneak', true);
    await sleep(500);
    console.log(`[${bot.username}] ✅ Sneak mode enabled - safe to build bridge!`);
    
    // STEP 6: Look at each other from top of towers
    console.log(`[${bot.username}] 👀 STEP 6: Looking at other bot from tower top...`);
    try {
      const otherEntity2 = bot.players[otherBotName]?.entity;
      if (otherEntity2) {
        actualOtherBotPosition = otherEntity2.position.clone();
        const targetPos = otherEntity2.position.offset(0, otherEntity2.height, 0);
        await bot.lookAt(targetPos);
        await sleep(INITIAL_EYE_CONTACT_MS);
      }
    } catch (lookError) {
      console.log(`[${bot.username}] ⚠️ Could not look at other bot: ${lookError.message}`);
    }
    
    // STEP 7: Calculate midpoint at new height
    console.log(`[${bot.username}] 📐 STEP 7: Calculating midpoint at tower height...`);
    const myPos = bot.entity.position.clone();
    
    // Try to get updated other bot position
    const otherEntity3 = bot.players[otherBotName]?.entity;
    if (otherEntity3) {
      actualOtherBotPosition = otherEntity3.position.clone();
    }
    
    const midpoint = new Vec3(
      Math.floor((myPos.x + actualOtherBotPosition.x) / 2),
      Math.floor(myPos.y), // Same Y level (top of tower)
      Math.floor((myPos.z + actualOtherBotPosition.z) / 2)
    );
    
    console.log(`[${bot.username}] 📍 My position: ${myPos.x.toFixed(2)}, ${myPos.y.toFixed(2)}, ${myPos.z.toFixed(2)}`);
    console.log(`[${bot.username}] 📍 Other bot position: ${actualOtherBotPosition.x.toFixed(2)}, ${actualOtherBotPosition.y.toFixed(2)}, ${actualOtherBotPosition.z.toFixed(2)}`);
    console.log(`[${bot.username}] 🎯 Midpoint (original): ${midpoint.x}, ${midpoint.y}, ${midpoint.z}`);
    
    // Snap midpoint to cardinal direction to avoid diagonal bridging issues
    const dx = Math.abs(midpoint.x - myPos.x);
    const dz = Math.abs(midpoint.z - myPos.z);
    
    if (dx > dz) {
      // Move primarily in X direction, keep Z the same
      midpoint.z = Math.floor(myPos.z);
      console.log(`[${bot.username}] 🧭 Snapping to X-axis (East/West) - keeping Z at ${midpoint.z}`);
    } else {
      // Move primarily in Z direction, keep X the same
      midpoint.x = Math.floor(myPos.x);
      console.log(`[${bot.username}] 🧭 Snapping to Z-axis (North/South) - keeping X at ${midpoint.x}`);
    }
    
    console.log(`[${bot.username}] 🎯 Midpoint (cardinal): ${midpoint.x}, ${midpoint.y}, ${midpoint.z}`);

    // STEP 8: Build bridge towards midpoint
    console.log(`[${bot.username}] 🌉 STEP 8: Building bridge towards midpoint...`);
    const bridgeResult = await buildBridgeTowards(bot, midpoint, args);
    
    console.log(`[${bot.username}] ✅ Bridge building complete! Placed ${bridgeResult.blocksPlaced} blocks`);
    
    // Disable sneaking after bridge is complete
    console.log(`[${bot.username}] 🚶 Disabling sneak mode...`);
    bot.setControlState('sneak', false);
    await sleep(300);
    
    // STEP 9: Final eye contact
    console.log(`[${bot.username}] 👀 STEP 9: Final eye contact...`);
    try {
      const otherEntity4 = bot.players[otherBotName]?.entity;
      if (otherEntity4) {
        const targetPos = otherEntity4.position.offset(0, otherEntity4.height, 0);
        await bot.lookAt(targetPos);
        await sleep(FINAL_EYE_CONTACT_MS);
      }
    } catch (lookError) {
      console.log(`[${bot.username}] ⚠️ Could not look at other bot: ${lookError.message}`);
    }
    
    console.log(`[${bot.username}] ✅ TOWER-BRIDGE phase complete!`);
    console.log(`[${bot.username}] 📊 Final stats: Tower ${towerResult.heightGained} blocks, Bridge ${bridgeResult.blocksPlaced} blocks`);
    
    // STEP 10: Transition to stop phase (end episode)
    coordinator.onceEvent(
      "stopPhase",
      getOnStopPhaseFn(bot, sharedBotRng, coordinator, otherBotName)
    );
    coordinator.sendToOtherBot(
      "stopPhase",
      bot.entity.position.clone(),
      `towerBridgePhase_${iterationID} end`
    );
    
    return { towerResult, bridgeResult };
  };
}

module.exports = {
  getOnTowerBridgePhaseFn,
  buildTowerUnderneath,
  buildBridgeTowards,
  TOWER_HEIGHT,
  TOWER_BLOCK_TYPE,
  BRIDGE_BLOCK_TYPE
};
