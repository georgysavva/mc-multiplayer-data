const Vec3 = require("vec3").Vec3;
const { 
  stopAll, 
  lookAtBot,
  lookAtSmooth, 
  sleep,
  horizontalDistanceTo,
  moveToward,
  isNearPosition
} = require('../utils/movement');
const { tickMVC, createMVC } = require('../utils/mvc');
const { BaseEpisode } = require("./base-episode");

// Constants for bridge building episode
const BRIDGE_BUILD_DURATION_MS = 20000; // 20 seconds of building
const BRIDGE_LENGTH = 8; // 8 blocks long bridge
const BLOCK_PLACE_INTERVAL_MS = 2000; // Place block every 2 seconds
const EYE_CONTACT_DURATION_MS = 1000; // Look at partner for 1 second
const COORDINATION_CHECK_INTERVAL_MS = 500; // Check coordination every 500ms

// MVC Configuration for bridge building - relaxed during placement
const BRIDGE_MVC_CONFIG = {
  fov_max_deg: 120, // Relaxed FOV for block placement
  d_min: 2.0, // Minimum distance buffer
  d_max: 10.0, // Larger max distance for building
  enable_los_check: false, // Phase I - flat terrain
  correction_strength: 0.3, // Gentle corrections during building
  debug_logging: true,
};

// Block types for building (in order of preference)
const BLOCK_TYPES = ["cobblestone", "oak_planks", "stone_bricks", "white_wool"];

/**
 * Simple block placement - each bot places one block in front of them
 * @param {Bot} bot - Mineflayer bot instance
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {string} otherBotName - Name of the other bot
 * @param {number} durationMs - Duration to build in milliseconds
 */
async function buildCooperativeBridge(
  bot,
  coordinator,
  otherBotName,
  durationMs
) {
  console.log(
    `[${bot.username}] Starting simple block placement episode with ${otherBotName}`
  );

  // Create MVC instance for coordination
  const mvc = createMVC(BRIDGE_MVC_CONFIG);

  const startTime = Date.now();
  let lastMVCUpdate = 0;
  let blockPlaced = false;

  // Building statistics
  const buildStats = {
    blocks_placed: 0,
    coordination_checks: 0,
    eye_contact_duration: 0,
    mvc_corrections: 0,
    placement_attempts: 0,
  };

  console.log(
    `[${bot.username}] Current position: (${bot.entity.position.x.toFixed(
      2
    )}, ${bot.entity.position.y.toFixed(2)}, ${bot.entity.position.z.toFixed(
      2
    )})`
  );

  /**
   * Convert yaw to cardinal direction for precise block placement
   * @param {number} yaw - Bot's yaw in radians
   * @returns {Vec3} Direction vector for block placement
   */
  function yawToCardinal(yaw) {
    // Convert yaw to the nearest block step on X/Z so we hit the exact block in front
    const dx = Math.round(Math.cos(yaw));
    const dz = Math.round(Math.sin(yaw));
    // If both round to 0 (rare at diagonals), fall back to sign
    return new Vec3(
      dx || Math.sign(Math.cos(yaw)),
      0,
      dz || Math.sign(Math.sin(yaw))
    );
  }

  try {
    // Simple loop - try to place one block every few seconds
    while (Date.now() - startTime < durationMs) {
      const now = Date.now();

      // Get other bot's position for MVC and coordination
      const otherBot = bot.players[otherBotName];
      if (otherBot && otherBot.entity) {
        const otherBotPos = otherBot.entity.position;

        // Run MVC tick periodically
        if (now - lastMVCUpdate > COORDINATION_CHECK_INTERVAL_MS) {
          try {
            const mvcResult = await mvc.tick(bot, otherBotPos);
            if (
              mvcResult.appliedCorrections.lookedAt ||
              mvcResult.appliedCorrections.movedRight
            ) {
              buildStats.mvc_corrections++;
            }
            lastMVCUpdate = now;
          } catch (error) {
            console.error(`[${bot.username}] MVC error:`, error);
          }
        }

        // Coordination: Look at partner before placing
        if (!blockPlaced) {
          console.log(
            `[${bot.username}] Step 1: Looking at ${otherBotName} before placing block`
          );
          try {
            await lookAtBot(bot, otherBotName, 180);
            buildStats.eye_contact_duration += 1000;
            buildStats.coordination_checks++;
            await sleep(1000);
          } catch (error) {
            console.log(
              `[${bot.username}] Look at partner failed:`,
              error.message
            );
          }
        }
      }

      // Block Placement: Place one block in front of bot using reliable method
      if (!blockPlaced) {
        console.log(
          `[${bot.username}] Step 2: Attempting to place block in front using reliable method`
        );

        try {
          buildStats.placement_attempts++;

          // 1) Pick a block from inventory (first placeable item or fallback)
          let item = bot.inventory
            .items()
            .find((i) => bot.registry.items[i.type]?.stackSize); // any placeable

          // Try preferred block types if no placeable found
          if (!item) {
            for (const blockName of BLOCK_TYPES) {
              const wantedId = bot.registry.itemsByName[blockName]?.id;
              if (wantedId) {
                item = bot.inventory.items().find((i) => i.type === wantedId);
                if (item) break;
              }
            }
          }

          // Creative mode fallback - try to get a block
          if (!item && bot.game.gameMode === "creative") {
            console.log(
              `[${bot.username}] Creative mode: Setting inventory slot with cobblestone`
            );
            try {
              await bot.creative.setInventorySlot(
                36,
                bot.registry.itemsByName["cobblestone"],
                1
              );
              await sleep(100);
              item = bot.inventory.slots[36];
            } catch (creativeError) {
              console.log(
                `[${bot.username}] Creative inventory set failed:`,
                creativeError.message
              );
            }
          }

          if (!item) {
            console.log(
              `[${bot.username}] ❌ No placeable block found in inventory`
            );
            await sleep(2000);
            continue;
          }

          console.log(
            `[${bot.username}] Found placeable item: ${
              bot.registry.items[item.type].name
            } (${item.count} available)`
          );

          // Equip the block
          await bot.equip(item, "hand");
          await sleep(200);

          // 2) Compute the block position directly in front of the bot (same height)
          const dir = yawToCardinal(bot.entity.yaw); // one step in the facing direction
          const front = bot.entity.position.offset(dir.x, 0, dir.z).floored();

          console.log(
            `[${bot.username}] Bot yaw: ${bot.entity.yaw.toFixed(2)} radians`
          );
          console.log(
            `[${bot.username}] Direction vector: (${dir.x}, ${dir.y}, ${dir.z})`
          );
          console.log(
            `[${bot.username}] Target front position: (${front.x}, ${front.y}, ${front.z})`
          );

          // 3) We'll place ON TOP of the ground in front (flat world ground is solid)
          const ground = bot.blockAt(front.offset(0, -1, 0));

          if (!ground) {
            console.log(
              `[${bot.username}] ❌ No ground block found at (${front.x}, ${
                front.y - 1
              }, ${front.z})`
            );
            await sleep(2000);
            continue;
          }

          console.log(
            `[${bot.username}] Ground block: ${ground.name} at (${ground.position.x}, ${ground.position.y}, ${ground.position.z})`
          );

          if (ground.boundingBox !== "block") {
            console.log(
              `[${bot.username}] ❌ Ground is not a solid block (boundingBox: ${ground.boundingBox})`
            );
            await sleep(2000);
            continue;
          }

          // Check if target position is already occupied
          const existingBlock = bot.blockAt(front);
          if (existingBlock && existingBlock.name !== "air") {
            console.log(
              `[${bot.username}] ❌ Target position already occupied by ${existingBlock.name}`
            );
            blockPlaced = true; // Consider it "done" to avoid infinite attempts
            continue;
          }

          // 4) Look at the ground and place on its top face (face up = (0,1,0))
          await bot.lookAt(ground.position.offset(0.5, 0.5, 0.5));
          await sleep(300);

          console.log(
            `[${bot.username}] Placing ${
              bot.registry.items[item.type].name
            } on top of ${ground.name}`
          );
          await bot.placeBlock(ground, new Vec3(0, 1, 0));

          buildStats.blocks_placed++;
          blockPlaced = true;
          console.log(
            `[${bot.username}] ✅ SUCCESS: ${
              bot.registry.items[item.type].name
            } placed at (${front.x}, ${front.y}, ${front.z})`
          );
        } catch (error) {
          console.error(
            `[${bot.username}] Block placement error:`,
            error.message
          );
          await sleep(2000);
        }
      }

      // Confirmation: Look at partner after placing (or attempting to place)
      if (blockPlaced && otherBot && otherBot.entity) {
        console.log(
          `[${bot.username}] Step 3: Looking at ${otherBotName} to confirm placement`
        );
        try {
          await lookAtBot(bot, otherBotName, 120);
          await sleep(500);
          buildStats.eye_contact_duration += 500;
        } catch (error) {
          console.log(
            `[${bot.username}] Confirmation look failed:`,
            error.message
          );
        }
      }

      // Wait a bit before next attempt
      await sleep(2000);
    }
  } finally {
    stopAll(bot);

    // Calculate final statistics
    const totalTime = Date.now() - startTime;
    const eyeContactPercentage =
      (buildStats.eye_contact_duration / totalTime) * 100;

    console.log(
      `[${bot.username}] Simple block placement complete! Statistics:`,
      {
        blocks_placed: buildStats.blocks_placed,
        placement_attempts: buildStats.placement_attempts,
        success_rate:
          buildStats.placement_attempts > 0
            ? (
                (buildStats.blocks_placed / buildStats.placement_attempts) *
                100
              ).toFixed(1) + "%"
            : "0%",
        coordination_checks: buildStats.coordination_checks,
        eye_contact_percentage: eyeContactPercentage.toFixed(1) + "%",
        mvc_corrections: buildStats.mvc_corrections,
        total_duration: (totalTime / 1000).toFixed(1) + "s",
      }
    );
  }
}

/**
 * Get bridge builder phase handler function
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} iterationID - Iteration ID
 * @param {string} otherBotName - Other bot name
 * @param {number} episodeNum - Episode number
 * @param {Object} episodeInstance - Episode instance
 * @param {Object} args - Configuration arguments
 * @returns {Function} Bridge builder phase handler
 */
function getOnBridgeBuilderPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  iterationID,
  otherBotName,
  episodeNum,
  episodeInstance,
  args
) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      `bridgeBuilderPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `bridgeBuilderPhase_${iterationID} beginning`
    );

    console.log(
      `[${bot.username}] Starting cooperative bridge builder phase ${iterationID}`
    );

    // Execute cooperative bridge building
    await buildCooperativeBridge(
      bot,
      coordinator,
      otherBotName,
      BRIDGE_BUILD_DURATION_MS
    );

    // Transition to stop phase
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
      `bridgeBuilderPhase_${iterationID} end`
    );
  };
}

class BridgeBuilderEpisode extends BaseEpisode {
  async setupEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args) {
    // optional setup
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
      `bridgeBuilderPhase_${iterationID}`,
      episodeNum,
      getOnBridgeBuilderPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        iterationID,
        args.other_bot_name,
        episodeNum,
        this,
        args
      )
    );
    coordinator.sendToOtherBot(
      `bridgeBuilderPhase_${iterationID}`,
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
    // optional teardown
  }
}

module.exports = {
  buildCooperativeBridge,
  getOnBridgeBuilderPhaseFn,
  BRIDGE_MVC_CONFIG,
  BLOCK_TYPES,
  BridgeBuilderEpisode,
};
