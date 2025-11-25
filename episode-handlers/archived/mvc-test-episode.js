const Vec3 = require("vec3").Vec3;
const {
  stopAll,
  sleep,
  moveDirection,
  horizontalDistanceTo,
} = require("../utils/movement");
const { tickMVC, createMVC, DEFAULT_MVC_CONFIG } = require("../utils/mvc");
const { BaseEpisode } = require("./base-episode");

// Constants for MVC test episode
const MVC_TEST_DURATION_MS = 10000; // 10 seconds of MVC testing
const MVC_TEST_UPDATE_INTERVAL_MS = 200; // Update every 200ms
const RANDOM_MOVEMENT_INTERVAL_MS = 2000; // Change movement every 2 seconds

// MVC Configuration for testing - more aggressive than default
const MVC_TEST_CONFIG = {
  fov_max_deg: 70, // Stricter FOV constraint for testing
  d_min: 2.5, // Minimum distance buffer
  d_max: 6.0, // Maximum distance buffer
  enable_los_check: false, // Phase I - flat terrain
  correction_strength: 0.8, // Strong corrections for testing
  debug_logging: true, // Verbose logging for testing
};

/**
 * Test MVC functionality with random movement patterns
 * @param {Bot} bot - Mineflayer bot instance
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {string} otherBotName - Name of the other bot
 * @param {number} durationMs - Duration to test in milliseconds
 */
async function testMVCBehavior(bot, coordinator, otherBotName, durationMs) {
  console.log(
    `[${bot.username}] Starting ${
      durationMs / 1000
    }s MVC behavior test with ${otherBotName}`
  );

  // Create MVC instance for testing
  const mvc = createMVC(MVC_TEST_CONFIG);

  const startTime = Date.now();
  let lastMVCUpdate = 0;
  let lastMovementChange = 0;
  let currentMovement = null;

  // MVC statistics tracking
  const mvcStats = {
    total_ticks: 0,
    fov_violations: 0,
    distance_violations: 0,
    corrections_applied: 0,
    avg_fov_angle: 0,
    avg_distance: 0,
  };

  const movements = ["forward", "back", "left", "right"];

  try {
    while (Date.now() - startTime < durationMs) {
      const now = Date.now();

      // Get other bot's position
      const otherBot = bot.players[otherBotName];
      if (!otherBot || !otherBot.entity) {
        console.log(
          `[${bot.username}] Cannot see ${otherBotName} for MVC testing`
        );
        await sleep(MVC_TEST_UPDATE_INTERVAL_MS);
        continue;
      }

      const otherBotPos = otherBot.entity.position;

      // Change movement direction periodically to test MVC corrections
      if (now - lastMovementChange > RANDOM_MOVEMENT_INTERVAL_MS) {
        stopAll(bot);

        // Pick random movement or stop
        if (Math.random() < 0.8) {
          // 80% chance to move
          currentMovement =
            movements[Math.floor(Math.random() * movements.length)];
          moveDirection(bot, currentMovement, true); // With sprint
          console.log(
            `[${bot.username}] MVC Test: Starting ${currentMovement} movement`
          );
        } else {
          currentMovement = null;
          console.log(`[${bot.username}] MVC Test: Stopping movement`);
        }

        lastMovementChange = now;
      }

      // Run MVC tick
      if (now - lastMVCUpdate > MVC_TEST_UPDATE_INTERVAL_MS) {
        try {
          const mvcResult = await mvc.tick(bot, otherBotPos);

          // Update statistics
          mvcStats.total_ticks++;
          mvcStats.avg_fov_angle =
            (mvcStats.avg_fov_angle * (mvcStats.total_ticks - 1) +
              mvcResult.mvcState.fov_angle_deg) /
            mvcStats.total_ticks;
          mvcStats.avg_distance =
            (mvcStats.avg_distance * (mvcStats.total_ticks - 1) +
              mvcResult.mvcState.distance_to_partner) /
            mvcStats.total_ticks;

          if (!mvcResult.mvcState.partner_in_fov) {
            mvcStats.fov_violations++;
          }

          if (!mvcResult.mvcState.distance_ok) {
            mvcStats.distance_violations++;
          }

          if (
            mvcResult.appliedCorrections.lookedAt ||
            mvcResult.appliedCorrections.movedRight
          ) {
            mvcStats.corrections_applied++;

            console.log(`[${bot.username}] MVC Test Correction Applied:`, {
              movement: currentMovement,
              fov_angle: mvcResult.mvcState.fov_angle_deg.toFixed(1),
              distance: mvcResult.mvcState.distance_to_partner.toFixed(2),
              looked_at: mvcResult.appliedCorrections.lookedAt,
              moved_right: mvcResult.appliedCorrections.movedRight,
            });
          }

          // Log periodic status
          if (mvcStats.total_ticks % 10 === 0) {
            console.log(`[${bot.username}] MVC Test Status:`, {
              ticks: mvcStats.total_ticks,
              current_fov: mvcResult.mvcState.fov_angle_deg.toFixed(1),
              current_distance:
                mvcResult.mvcState.distance_to_partner.toFixed(2),
              partner_in_fov: mvcResult.mvcState.partner_in_fov,
              distance_ok: mvcResult.mvcState.distance_ok,
              movement: currentMovement || "stopped",
            });
          }

          lastMVCUpdate = now;
        } catch (error) {
          console.error(`[${bot.username}] MVC Test error:`, error);
        }
      }

      await sleep(50); // Small sleep for smooth operation
    }
  } finally {
    stopAll(bot);

    // Calculate final statistics
    const fovViolationRate =
      (mvcStats.fov_violations / mvcStats.total_ticks) * 100;
    const distanceViolationRate =
      (mvcStats.distance_violations / mvcStats.total_ticks) * 100;
    const correctionRate =
      (mvcStats.corrections_applied / mvcStats.total_ticks) * 100;

    console.log(`[${bot.username}] MVC Test Complete! Final Statistics:`, {
      total_ticks: mvcStats.total_ticks,
      avg_fov_angle: mvcStats.avg_fov_angle.toFixed(1) + "°",
      avg_distance: mvcStats.avg_distance.toFixed(2) + " blocks",
      fov_violation_rate: fovViolationRate.toFixed(1) + "%",
      distance_violation_rate: distanceViolationRate.toFixed(1) + "%",
      correction_rate: correctionRate.toFixed(1) + "%",
      total_corrections: mvcStats.corrections_applied,
    });
  }
}

/**
 * Get MVC test phase handler function
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} iterationID - Iteration ID
 * @param {string} otherBotName - Other bot name
 * @param {number} episodeNum - Episode number
 * @param {Object} episodeInstance - Episode instance
 * @param {Object} args - Configuration arguments
 * @returns {Function} MVC test phase handler
 */
function getOnMVCTestPhaseFn(
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
      `mvcTestPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `mvcTestPhase_${iterationID} beginning`
    );

    console.log(`[${bot.username}] Starting MVC test phase ${iterationID}`);

    // Execute MVC behavior testing
    await testMVCBehavior(bot, coordinator, otherBotName, MVC_TEST_DURATION_MS);

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
      `mvcTestPhase_${iterationID} end`
    );
  };
}

class MvcTestEpisode extends BaseEpisode {


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
      `mvcTestPhase_${iterationID}`,
      episodeNum,
      getOnMVCTestPhaseFn(
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
      `mvcTestPhase_${iterationID}`,
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
  testMVCBehavior,
  getOnMVCTestPhaseFn,
  MVC_TEST_CONFIG,
  MvcTestEpisode,
};
