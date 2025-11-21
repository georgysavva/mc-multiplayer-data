// tower-bridge-episode.js - Episode where bots build towers then bridge towards each other
const { Vec3 } = require("vec3");
const { sleep } = require("../utils/movement");
const {
  ensureItemInHand,
  placeAt,
  fastPlaceBlock,
  buildTowerUnderneath,
} = require("./builder");
const { BaseEpisode } = require("./base-episode");

// Constants for tower-bridge behavior
const INITIAL_EYE_CONTACT_MS = 1500; // Initial look duration
const FINAL_EYE_CONTACT_MS = 1500; // Final look duration
const TOWER_HEIGHT = 8; // Fixed tower height
const TOWER_BLOCK_TYPE = "oak_planks"; // Block type for towers
const BRIDGE_BLOCK_TYPE = "oak_planks"; // Block type for bridge
const JUMP_DURATION_MS = 50; // How long to hold jump
const PLACE_RETRY_DELAY_MS = 20; // Delay between place attempts
const MAX_PLACE_ATTEMPTS = 10; // Max attempts to place a block
const SETTLE_DELAY_MS = 200; // Delay to settle after placing

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

  console.log(
    `[${bot.username}] 📐 Direction to target: dx=${dx.toFixed(
      2
    )}, dz=${dz.toFixed(2)}, distance=${horizontalDistance.toFixed(2)}`
  );

  // Normalize direction
  const dirX = dx / horizontalDistance;
  const dirZ = dz / horizontalDistance;

  // Calculate yaw to face the target
  const targetYaw = Math.atan2(-dirX, -dirZ);
  console.log(
    `[${bot.username}] 🧭 Facing target at yaw: ${targetYaw.toFixed(2)} radians`
  );

  // Ensure we have blocks
  await ensureItemInHand(bot, BRIDGE_BLOCK_TYPE, args);

  // Build bridge block by block
  const maxBlocks = Math.ceil(horizontalDistance / 2) + 2; // Build halfway plus buffer

  for (let i = 0; i < maxBlocks; i++) {
    const myPos = bot.entity.position.clone();
    const distanceToTarget = Math.sqrt(
      Math.pow(targetPos.x - myPos.x, 2) + Math.pow(targetPos.z - myPos.z, 2)
    );

    console.log(
      `[${bot.username}] 📏 Distance to target: ${distanceToTarget.toFixed(
        2
      )} blocks`
    );

    // Stop if we're close enough to the target
    if (distanceToTarget < 2.0) {
      console.log(`[${bot.username}] 🎯 Reached target area!`);
      break;
    }

    // Find the block we're sneaking on (even if floating off the edge)
    const sneakingBlockInfo = findSneakingBlock(bot);

    if (!sneakingBlockInfo) {
      console.log(
        `[${bot.username}] ❌ No ground block found - not sneaking on any block`
      );
      break;
    }

    const groundBlock = sneakingBlockInfo.block;
    const groundPos = sneakingBlockInfo.pos;

    console.log(
      `[${bot.username}] 📦 Standing on: ${groundBlock.name} at ${groundPos}`
    );

    // Determine which face to place on based on direction to target
    // Calculate which direction is dominant
    const absDx = Math.abs(dirX);
    const absDz = Math.abs(dirZ);

    let faceVector;
    if (absDx > absDz) {
      // Moving more in X direction
      faceVector = new Vec3(dirX > 0 ? 1 : -1, 0, 0);
      console.log(
        `[${bot.username}] 🧭 Placing on ${
          dirX > 0 ? "East (+X)" : "West (-X)"
        } face`
      );
    } else {
      // Moving more in Z direction
      faceVector = new Vec3(0, 0, dirZ > 0 ? 1 : -1);
      console.log(
        `[${bot.username}] 🧭 Placing on ${
          dirZ > 0 ? "South (+Z)" : "North (-Z)"
        } face`
      );
    }

    console.log(
      `[${bot.username}] 🧱 Placing bridge block ${i + 1} on side of ${
        groundBlock.name
      }`
    );

    try {
      // Look towards the target (slightly down to see the placement)
      await bot.look(targetYaw, 0.3, true);
      await sleep(100);

      // Place block on the side of the block we're standing on
      await bot.placeBlock(groundBlock, faceVector);
      blocksPlaced++;
      console.log(
        `[${bot.username}] ✅ Bridge block ${i + 1} placed successfully`
      );

      await sleep(200); // Wait for block to appear

      // Move forward onto the new block (slower while sneaking)
      console.log(`[${bot.username}] 🚶 Walking forward onto bridge...`);

      // Face the target direction
      await bot.look(targetYaw, 0, true);

      bot.setControlState("forward", true);
      await sleep(1000); // Reduced to prevent overshooting (sneaking speed ~1.3 blocks/s, so 600ms = ~0.78 blocks)
      bot.setControlState("forward", false);

      await sleep(300); // Settle on new block

      // Verify we moved forward
      const newPos = bot.entity.position.clone();
      const distanceMoved = myPos.distanceTo(newPos);
      console.log(
        `[${bot.username}] 📏 Moved ${distanceMoved.toFixed(2)} blocks forward`
      );

      if (distanceMoved < 0.3) {
        console.log(`[${bot.username}] ⚠️ Didn't move much, might be stuck`);
      }
    } catch (placeError) {
      console.log(
        `[${bot.username}] ❌ Error placing bridge block: ${placeError.message}`
      );
      // Try to continue anyway
    }
  }

  const endPos = bot.entity.position.clone();
  const distanceTraveled = startPos.distanceTo(endPos);

  console.log(`[${bot.username}] 🏁 Bridge building complete!`);
  console.log(`[${bot.username}]    Blocks placed: ${blocksPlaced}`);
  console.log(
    `[${bot.username}]    Distance traveled: ${distanceTraveled.toFixed(
      2
    )} blocks`
  );

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

  if (groundBlock && groundBlock.name !== "air") {
    return { block: groundBlock, pos: directlyBelow };
  }

  // If floating, check adjacent blocks (bot is hanging off edge while sneaking)
  // Check all 4 cardinal directions
  const checkPositions = [
    new Vec3(
      Math.floor(myPos.x) + 1,
      Math.floor(myPos.y) - 1,
      Math.floor(myPos.z)
    ), // East (+X)
    new Vec3(
      Math.floor(myPos.x) - 1,
      Math.floor(myPos.y) - 1,
      Math.floor(myPos.z)
    ), // West (-X)
    new Vec3(
      Math.floor(myPos.x),
      Math.floor(myPos.y) - 1,
      Math.floor(myPos.z) + 1
    ), // South (+Z)
    new Vec3(
      Math.floor(myPos.x),
      Math.floor(myPos.y) - 1,
      Math.floor(myPos.z) - 1
    ), // North (-Z)
  ];

  // Find the closest solid block that bot could be sneaking on
  let closestBlock = null;
  let closestDistance = Infinity;

  for (const checkPos of checkPositions) {
    const block = bot.blockAt(checkPos);
    if (block && block.name !== "air") {
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
 * @param {Object} rcon - RCON connection
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} iterationID - Iteration ID
 * @param {number} episodeNum - Episode number
 * @param {Object} episodeInstance - Episode instance
 * @param {Object} args - Configuration arguments
 * @returns {Function} Phase function
 */
function getOnTowerBridgePhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  iterationID,
  episodeNum,
  episodeInstance,
  args
) {
  return async function onTowerBridgePhase(otherBotPosition) {
    coordinator.sendToOtherBot(
      `towerBridgePhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `towerBridgePhase_${iterationID} beginning`
    );

    console.log(
      `[${bot.username}] 🚀 Starting TOWER-BRIDGE phase ${iterationID}`
    );
    console.log(
      `[${bot.username}] 🎬 TOWER-BRIDGE EPISODE - Episode ${episodeNum}, Iteration ${iterationID}`
    );

    // STEP 1: Bots spawn (already done by teleport phase)
    console.log(`[${bot.username}] ✅ STEP 1: Bot spawned`);

    // STEP 2: Initial eye contact
    console.log(
      `[${bot.username}] 👀 STEP 2: Making eye contact with ${args.other_bot_name}...`
    );
    let actualOtherBotPosition = null;
    try {
      const otherEntity = bot.players[args.other_bot_name]?.entity;
      if (otherEntity) {
        actualOtherBotPosition = otherEntity.position.clone();
        const targetPos = otherEntity.position.offset(0, otherEntity.height, 0);
        await bot.lookAt(targetPos);
        await sleep(INITIAL_EYE_CONTACT_MS);
      } else {
        console.log(
          `[${bot.username}] ⚠️ Could not find other bot entity, using passed position`
        );
        actualOtherBotPosition = otherBotPosition.clone();
      }
    } catch (lookError) {
      console.log(
        `[${bot.username}] ⚠️ Could not look at other bot: ${lookError.message}`
      );
      actualOtherBotPosition = otherBotPosition.clone();
    }

    // // STEP 3: Move backward to increase distance for longer bridges
    console.log(
      `[${bot.username}] 🚶 STEP 3: Moving backward SKIPPED MANUALLY...`
    );
    // const startPos = bot.entity.position.clone();

    // // Calculate direction AWAY from other bot
    // const backwardDx = startPos.x - actualOtherBotPosition.x;
    // const backwardDz = startPos.z - actualOtherBotPosition.z;
    // const backwardDistance = Math.sqrt(backwardDx * backwardDx + backwardDz * backwardDz);

    // // Normalize direction (away from other bot)
    // const backwardDirX = backwardDx / backwardDistance;
    // const backwardDirZ = backwardDz / backwardDistance;

    // // Calculate yaw to face AWAY from other bot
    // const awayYaw = Math.atan2(-backwardDirX, -backwardDirZ);

    // console.log(`[${bot.username}] 🧭 Facing away from ${otherBotName} at yaw: ${awayYaw.toFixed(2)} radians`);
    // await bot.look(awayYaw, 0, true);
    // await sleep(200);

    // // Walk backward 3 blocks
    // const BACKWARD_DISTANCE = 3;
    // const WALK_TIME_PER_BLOCK = 1000; // ~1 second per block at walking speed

    // console.log(`[${bot.username}] 🚶 Walking backward ${BACKWARD_DISTANCE} blocks...`);
    // bot.setControlState('forward', true);
    // await sleep(BACKWARD_DISTANCE * WALK_TIME_PER_BLOCK);
    // bot.setControlState('forward', false);

    // const newPos = bot.entity.position.clone();
    // const distanceMoved = startPos.distanceTo(newPos);
    // console.log(`[${bot.username}] ✅ Moved ${distanceMoved.toFixed(2)} blocks backward`);

    // await sleep(500); // Settle after moving

    // STEP 4: Build tower underneath (8 blocks high)
    console.log(
      `[${bot.username}] 🗼 STEP 4: Building ${TOWER_HEIGHT}-block tower...`
    );
    const towerResult = await buildTowerUnderneath(bot, TOWER_HEIGHT, args, {
      blockType: TOWER_BLOCK_TYPE,
      enableRetry: true, // tower-bridge uses robust version with retry logic
      breakOnFailure: false, // continues despite failures
    });

    if (towerResult.failed > 2) {
      console.log(
        `[${bot.username}] ⚠️ Tower build failed significantly, aborting episode...`
      );
      throw new Error("Tower build failed significantly, aborting episode...");
    }

    if (towerResult.failed > 0 || towerResult.heightGained < TOWER_HEIGHT - 1) {
      console.log(
        `[${bot.username}] ⚠️ Tower build incomplete, but continuing...`
      );
    }

    // Wait a moment for both bots to finish their towers
    await sleep(1500);

    // STEP 5: Enable sneaking to prevent falling off tower
    console.log(
      `[${bot.username}] 🐢 STEP 5: Enabling sneak mode (crouch) to prevent falling...`
    );
    bot.setControlState("sneak", true);
    await sleep(500);
    console.log(
      `[${bot.username}] ✅ Sneak mode enabled - safe to build bridge!`
    );

    // STEP 6: Look at each other from top of towers
    console.log(
      `[${bot.username}] 👀 STEP 6: Looking at other bot from tower top...`
    );
    try {
      const otherEntity2 = bot.players[args.other_bot_name]?.entity;
      if (otherEntity2) {
        actualOtherBotPosition = otherEntity2.position.clone();
        const targetPos = otherEntity2.position.offset(
          0,
          otherEntity2.height,
          0
        );
        await bot.lookAt(targetPos);
        await sleep(INITIAL_EYE_CONTACT_MS);
      }
    } catch (lookError) {
      console.log(
        `[${bot.username}] ⚠️ Could not look at other bot: ${lookError.message}`
      );
    }

    // STEP 7: Calculate midpoint at new height
    console.log(
      `[${bot.username}] 📐 STEP 7: Calculating midpoint at tower height...`
    );
    const myPos = bot.entity.position.clone();

    // Try to get updated other bot position
    const otherEntity3 = bot.players[args.other_bot_name]?.entity;
    if (otherEntity3) {
      actualOtherBotPosition = otherEntity3.position.clone();
    }

    const midpoint = new Vec3(
      Math.floor((myPos.x + actualOtherBotPosition.x) / 2),
      Math.floor(myPos.y), // Same Y level (top of tower)
      Math.floor((myPos.z + actualOtherBotPosition.z) / 2)
    );

    console.log(
      `[${bot.username}] 📍 My position: ${myPos.x.toFixed(
        2
      )}, ${myPos.y.toFixed(2)}, ${myPos.z.toFixed(2)}`
    );
    console.log(
      `[${
        bot.username
      }] 📍 Other bot position: ${actualOtherBotPosition.x.toFixed(
        2
      )}, ${actualOtherBotPosition.y.toFixed(
        2
      )}, ${actualOtherBotPosition.z.toFixed(2)}`
    );
    console.log(
      `[${bot.username}] 🎯 Midpoint (original): ${midpoint.x}, ${midpoint.y}, ${midpoint.z}`
    );

    // Snap to shared cardinal line based on which axis has more distance
    // This ensures BOTH bots target the same point
    const totalDx = Math.abs(actualOtherBotPosition.x - myPos.x);
    const totalDz = Math.abs(actualOtherBotPosition.z - myPos.z);

    let targetPoint;
    if (totalDx > totalDz) {
      // Bots are farther apart in X direction, so build along X-axis
      // Both bots use the SAME Z coordinate (the midpoint Z)
      targetPoint = new Vec3(
        midpoint.x,
        midpoint.y,
        Math.floor((myPos.z + actualOtherBotPosition.z) / 2)
      );
      console.log(
        `[${bot.username}] 🧭 Building along X-axis (East/West) - shared Z at ${targetPoint.z}`
      );
    } else {
      // Bots are farther apart in Z direction, so build along Z-axis
      // Both bots use the SAME X coordinate (the midpoint X)
      targetPoint = new Vec3(
        Math.floor((myPos.x + actualOtherBotPosition.x) / 2),
        midpoint.y,
        midpoint.z
      );
      console.log(
        `[${bot.username}] 🧭 Building along Z-axis (North/South) - shared X at ${targetPoint.x}`
      );
    }

    console.log(
      `[${bot.username}] 🎯 Target point (shared cardinal): ${targetPoint.x}, ${targetPoint.y}, ${targetPoint.z}`
    );

    // STEP 8: Build bridge towards midpoint
    console.log(
      `[${bot.username}] 🌉 STEP 8: Building bridge towards midpoint...`
    );
    const bridgeResult = await buildBridgeTowards(bot, targetPoint, args);

    console.log(
      `[${bot.username}] ✅ Bridge building complete! Placed ${bridgeResult.blocksPlaced} blocks`
    );

    // Disable sneaking after bridge is complete
    console.log(`[${bot.username}] 🚶 Disabling sneak mode...`);
    bot.setControlState("sneak", false);
    await sleep(300);

    // STEP 9: Final eye contact
    console.log(`[${bot.username}] 👀 STEP 9: Final eye contact...`);
    try {
      const otherEntity4 = bot.players[args.other_bot_name]?.entity;
      if (otherEntity4) {
        const targetPos = otherEntity4.position.offset(
          0,
          otherEntity4.height,
          0
        );
        await bot.lookAt(targetPos);
        await sleep(FINAL_EYE_CONTACT_MS);
      }
    } catch (lookError) {
      console.log(
        `[${bot.username}] ⚠️ Could not look at other bot: ${lookError.message}`
      );
    }

    console.log(`[${bot.username}] ✅ TOWER-BRIDGE phase complete!`);
    console.log(
      `[${bot.username}] 📊 Final stats: Tower ${towerResult.heightGained} blocks, Bridge ${bridgeResult.blocksPlaced} blocks`
    );

    // STEP 10: Transition to stop phase (end episode)
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
      `towerBridgePhase_${iterationID} end`
    );

    return { towerResult, bridgeResult };
  };
}

/**
 * TowerBridgeEpisode - Episode class for tower building and bridging
 */
class TowerBridgeEpisode extends BaseEpisode {
  static INIT_MIN_BOTS_DISTANCE = 12;
  static INIT_MAX_BOTS_DISTANCE = 20;
  static WORKS_IN_NON_FLAT_WORLD = true;

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
      `towerBridgePhase_${iterationID}`,
      episodeNum,
      getOnTowerBridgePhaseFn(
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
      `towerBridgePhase_${iterationID}`,
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
  ) {}
}

module.exports = {
  getOnTowerBridgePhaseFn,
  buildBridgeTowards,
  TOWER_HEIGHT,
  TOWER_BLOCK_TYPE,
  BRIDGE_BLOCK_TYPE,
  TowerBridgeEpisode,
};
