// mine-episode.js - Mining episode where bots dig down and mine towards each other
const { Vec3 } = require("vec3");
const {
  sleep,
  initializePathfinder,
  stopPathfinder,
  digWithTimeout,
} = require("../utils/movement");
const { ensureItemInHand } = require("./builder");
const { BaseEpisode } = require("./base-episode");
const { unequipHand } = require("../utils/items");

// Constants for mining behavior
const INITIAL_EYE_CONTACT_MS = 1500; // Initial look duration
const FINAL_EYE_CONTACT_MS = 1500; // Final look duration
const DIG_DELAY_MS = 100; // Delay between dig attempts
const TOOL_TYPE = "diamond_pickaxe"; // Tool for mining
const PATHFIND_TIMEOUT_MS = 30000; // 30 second timeout for pathfinding

/**
 * Dig a single block at a specific position
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} blockPos - Position of block to dig
 * @returns {Promise<boolean>} True if successfully dug
 */
async function digBlock(bot, blockPos) {
  try {
    const block = bot.blockAt(blockPos);

    if (!block || block.name === "air" || block.name === "cave_air") {
      console.log(`[${bot.username}] ✅ Block at ${blockPos} is already air`);

      return true;
    }

    console.log(`[${bot.username}] ⛏️ Digging ${block.name} at ${blockPos}`);

    // Look at the block
    const blockCenter = blockPos.offset(0.5, 0.5, 0.5);
    await bot.lookAt(blockCenter);
    await sleep(50);

    // Dig the block
    await digWithTimeout(bot, block);
    console.log(`[${bot.username}] ✅ Successfully dug ${block.name}`);

    return true;
  } catch (error) {
    console.log(
      `[${bot.username}] ❌ Error digging block at ${blockPos}: ${error.message}`
    );
    return false;
  }
}

/**
 * Dig down one block directly underneath the bot
 * @param {Bot} bot - Mineflayer bot instance
 * @returns {Promise<boolean>} True if successfully dug down
 */
async function digDownOneBlock(bot) {
  console.log(`[${bot.username}] 👇 Digging down one block...`);

  const currentPos = bot.entity.position.clone();
  const blockBelowPos = new Vec3(
    Math.floor(currentPos.x),
    Math.floor(currentPos.y) - 1,
    Math.floor(currentPos.z)
  );

  console.log(
    `[${bot.username}] 📍 Current position: ${currentPos.x.toFixed(
      2
    )}, ${currentPos.y.toFixed(2)}, ${currentPos.z.toFixed(2)}`
  );
  console.log(`[${bot.username}] 🎯 Target block below: ${blockBelowPos}`);

  // Look down
  await bot.look(bot.entity.yaw, 1.57, true); // 1.57 radians = 90 degrees down
  await sleep(200);

  // Dig the block below
  const success = await digBlock(bot, blockBelowPos);

  if (success) {
    // Wait for bot to fall
    console.log(`[${bot.username}] ⬇️ Falling down...`);
    await sleep(500);

    const newPos = bot.entity.position.clone();
    console.log(
      `[${bot.username}] 📍 New position: ${newPos.x.toFixed(
        2
      )}, ${newPos.y.toFixed(2)}, ${newPos.z.toFixed(2)}`
    );
    console.log(
      `[${bot.username}] 📏 Y-level change: ${(newPos.y - currentPos.y).toFixed(
        2
      )}`
    );
  }

  return success;
}

/**
 * Dig a 2x1 tunnel (2 blocks high, 1 wide) in a specific direction
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPos - Target position to mine towards
 * @param {number} maxBlocks - Maximum number of blocks to mine
 * @returns {Promise<Object>} Mining statistics
 */
async function mineTunnelTowards(bot, targetPos, maxBlocks = 20) {
  console.log(`[${bot.username}] 🚇 Mining 2x1 tunnel towards ${targetPos}`);

  let blocksMined = 0;
  const startPos = bot.entity.position.clone();
  const miningStartTime = Date.now();

  // Calculate direction to target
  const currentPos = bot.entity.position.clone();
  const dx = targetPos.x - currentPos.x;
  const dz = targetPos.z - currentPos.z;
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

  // Look towards the target horizontally
  await bot.look(targetYaw, 0, true);
  await sleep(500);

  // Mine blocks one at a time, moving forward
  let distanceTraveled = 0;
  const stepSize = 1.0; // Move 1 block at a time

  while (
    distanceTraveled < horizontalDistance - 1.5 &&
    blocksMined < maxBlocks
  ) {
    // Timeout guard to prevent infinite mining loop
    if (Date.now() - miningStartTime > 60000) {
      throw new Error(
        `Mining loop timed out after 60 seconds (distanceTraveled=${distanceTraveled.toFixed(
          2
        )}, ` +
          `horizontalDistance=${horizontalDistance.toFixed(
            2
          )}, blocksMined=${blocksMined}/${maxBlocks})`
      );
    }
    const myPos = bot.entity.position.clone();

    console.log(
      `[${bot.username}] 📍 Current position: ${myPos.x.toFixed(
        2
      )}, ${myPos.y.toFixed(2)}, ${myPos.z.toFixed(2)}`
    );
    console.log(
      `[${bot.username}] 📏 Distance to target: ${myPos
        .distanceTo(targetPos)
        .toFixed(2)} blocks`
    );

    // Calculate next block position in front of bot
    const nextBlockX = Math.floor(myPos.x + dirX * 1.2);
    const nextBlockZ = Math.floor(myPos.z + dirZ * 1.2);
    const currentY = Math.floor(myPos.y);

    // Dig 2 blocks high (current level and above)
    const blocksToDigPositions = [
      new Vec3(nextBlockX, currentY, nextBlockZ), // Bottom block
      new Vec3(nextBlockX, currentY + 1, nextBlockZ), // Top block
    ];

    console.log(
      `[${bot.username}] ⛏️ Digging 2x1 tunnel at X=${nextBlockX}, Z=${nextBlockZ}`
    );

    // Dig both blocks
    for (const blockPos of blocksToDigPositions) {
      const block = bot.blockAt(blockPos);

      if (block && block.name !== "air" && block.name !== "cave_air") {
        console.log(
          `[${bot.username}] 🔨 Digging ${block.name} at ${blockPos}`
        );

        try {
          // Look at the block
          const blockCenter = blockPos.offset(0.5, 0.5, 0.5);
          await bot.lookAt(blockCenter);
          await sleep(50);

          // Dig the block
          await digWithTimeout(bot, block);
          blocksMined++;
          console.log(
            `[${bot.username}] ✅ Mined block ${blocksMined}: ${block.name}`
          );
          await sleep(100);
        } catch (digError) {
          console.log(
            `[${bot.username}] ⚠️ Failed to dig block at ${blockPos}: ${digError.message}`
          );
        }
      } else {
        console.log(`[${bot.username}] ⏭️ Block at ${blockPos} is already air`);
      }
    }

    // Move forward by setting control states
    console.log(`[${bot.username}] 🚶 Moving forward...`);

    // Face the target again
    await bot.look(targetYaw, 0, true);

    // Walk forward for a short duration
    bot.setControlState("forward", true);
    await sleep(800); // Walk for 0.8 seconds
    bot.setControlState("forward", false);

    await sleep(200); // Settle

    // Update distance traveled
    const newPos = bot.entity.position.clone();
    distanceTraveled = startPos.distanceTo(newPos);

    console.log(
      `[${bot.username}] 📊 Progress: ${distanceTraveled.toFixed(
        2
      )}/${horizontalDistance.toFixed(2)} blocks`
    );

    // Safety check: if we're close enough to target, stop
    if (newPos.distanceTo(targetPos) < 2.0) {
      console.log(`[${bot.username}] 🎯 Reached target area!`);
      break;
    }
  }

  const endPos = bot.entity.position.clone();
  const finalDistance = startPos.distanceTo(endPos);

  console.log(`[${bot.username}] 🏁 Mining complete!`);
  console.log(`[${bot.username}]    Blocks mined: ${blocksMined}`);
  console.log(
    `[${bot.username}]    Distance traveled: ${finalDistance.toFixed(2)} blocks`
  );

  return { blocksMined, distanceMined: finalDistance };
}

/**
 * Get the phase function for mining episodes
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
function getOnMinePhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  iterationID,
  episodeNum,
  episodeInstance,
  args
) {
  return async function onMinePhase(otherBotPosition) {
    coordinator.sendToOtherBot(
      `minePhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `minePhase_${iterationID} beginning`
    );

    console.log(`[${bot.username}] 🚀 Starting MINE phase ${iterationID}`);
    console.log(
      `[${bot.username}] 🎬 MINING EPISODE - Episode ${episodeNum}, Iteration ${iterationID}`
    );

    // STEP 1: Bots spawn (already done by teleport phase)
    console.log(`[${bot.username}] ✅ STEP 1: Bot spawned`);

    // STEP 1.5: Teleport bots 100 blocks apart
    console.log(`[${bot.username}] 🧭 STEP 1.5: Teleporting bots 100 blocks apart...`);

    try {
      const myPos = bot.entity.position.clone();

      // Try to get other bot’s position from live entity
      let otherPos = bot.players[args.other_bot_name]?.entity?.position;
      if (!otherPos) {
        // Fallback: use passed-in otherBotPosition if entity not yet loaded
        otherPos = otherBotPosition.clone();
      }

      // Compute direction from other bot → this bot
      const dx = myPos.x - otherPos.x;
      const dz = myPos.z - otherPos.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;

      const dirX = dx / len;
      const dirZ = dz / len;

      // Final teleport target 100 blocks away
      const targetX = Math.floor(myPos.x + dirX * 100);
      const targetZ = Math.floor(myPos.z + dirZ * 100);
      const targetY = Math.floor(myPos.y); // keep same Y level

      const cmd = `tp ${bot.username} ${targetX} ${targetY} ${targetZ}`;
      console.log(`[${bot.username}] 📡 RCON → ${cmd}`);

      await rcon.send(cmd);
      await sleep(1000);

      console.log(
        `[${bot.username}] ✨ Teleported to (${targetX}, ${targetY}, ${targetZ})`
      );
    } catch (err) {
      console.log(
        `[${bot.username}] ⚠️ Teleport step failed: ${err.message}`
      );
    }

    // STEP 3: Equip mining tool
    console.log(`[${bot.username}] ⛏️ STEP 3: Equipping mining tool...`);
    try {
      await ensureItemInHand(bot, TOOL_TYPE, args);
      console.log(`[${bot.username}] ✅ Equipped ${TOOL_TYPE}`);
    } catch (toolError) {
      console.log(
        `[${bot.username}] ⚠️ Could not equip tool: ${toolError.message}`
      );
    }

    // STEP 4: Dig down one block
    console.log(`[${bot.username}] ⬇️ STEP 4: Digging down one block...`);
    const digSuccess = await digDownOneBlock(bot);

    if (!digSuccess) {
      console.log(`[${bot.username}] ❌ Failed to dig down, aborting episode`);
      // Transition to stop phase
      throw new Error("Failed to dig down, aborting episode...");
    }

    // Wait a moment to ensure both bots are down
    await sleep(1000);

    console.log(`[${bot.username}] ✅ MINE phase complete!`);
    console.log(
      `[${bot.username}] 📊 Final stats: ${
        miningResult.blocksMined
      } blocks mined, ${miningResult.distanceMined.toFixed(2)} blocks traveled`
    );

    // STEP 9: Transition to stop phase (end episode)
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
      `minePhase_${iterationID} end`
    );

    return miningResult;
  };
}

/**
 * MineEpisode - Episode class for mining towards each other
 */
class MineEpisode extends BaseEpisode {
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
      `minePhase_${iterationID}`,
      episodeNum,
      getOnMinePhaseFn(
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
      `minePhase_${iterationID}`,
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
    // Unequip pickaxe from main hand
    await unequipHand(bot);
  }
}

module.exports = {
  getOnMinePhaseFn,
  digBlock,
  digDownOneBlock,
  mineTunnelTowards,
  TOOL_TYPE,
  MineEpisode,
};
