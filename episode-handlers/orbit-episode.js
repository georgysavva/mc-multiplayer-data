const Vec3 = require("vec3").Vec3;
const { Movements, GoalNear } = require("../utils/bot-factory");
const {
  stopAll,
  lookAtBot,
  lookAtSmooth,
  sleep,
  initializePathfinder,
  stopPathfinder,
} = require("../utils/movement");
const { tickMVC, createMVC } = require("../utils/mvc");
const { BaseEpisode } = require("./base-episode");

// Constants for orbit behavior
const ORBIT_DURATION_MS = 15000; // 15 seconds of orbiting
const ORBIT_UPDATE_INTERVAL_MS = 200; // Update positions every 200ms
const ORBIT_RADIUS = 5.0; // Fixed radius around midpoint
const ORBIT_SPEED = 0.1; // Angular speed for circular movement (radians per update)
const CAMERA_SPEED_DEGREES_PER_SEC = 90; // Camera movement speed
const EYE_CONTACT_UPDATE_INTERVAL_MS = 500; // Update eye contact every 1 second

// MVC Configuration for orbit episode
const ORBIT_MVC_CONFIG = {
  fov_max_deg: 90, // Slightly larger FOV for orbit movement
  d_min: 3.0, // Minimum distance (closer than orbit radius)
  d_max: 8.0, // Maximum distance (further than orbit radius)
  enable_los_check: false, // Phase I - flat terrain
  correction_strength: 0.3, // Gentle corrections during orbit
  debug_logging: true,
};

/**
 * Make both bots orbit around their shared midpoint using checkpoints
 * @param {Bot} bot - Mineflayer bot instance
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {string} otherBotName - Name of the other bot
 * @param {Vec3} sharedMidpoint - Shared orbit center between both bots
 * @param {number} radius - Orbit radius
 * @param {number} durationMs - Duration to orbit in milliseconds
 */
async function orbitAroundSharedMidpoint(
  bot,
  coordinator,
  otherBotName,
  sharedMidpoint,
  durationMs
) {
  console.log(
    `[${bot.username}] Starting ${
      durationMs / 1000
    }s MVC-enhanced pathfinder orbit around shared midpoint (${sharedMidpoint.x.toFixed(
      1
    )}, ${sharedMidpoint.y.toFixed(1)}, ${sharedMidpoint.z.toFixed(1)})`
  );

  // Initialize pathfinder with optimal settings for orbiting
  initializePathfinder(bot, {
    allowSprinting: false,
    allowParkour: false,
    canDig: false,
    allowEntityDetection: true,
  });

  // Create MVC instance for this episode
  const mvc = createMVC(ORBIT_MVC_CONFIG);

  console.log(`[${bot.username}] Pathfinder and MVC initialized for orbit`);

  const startTime = Date.now();
  let lastEyeContactUpdate = 0;
  let lastMVCUpdate = 0;

  // Calculate starting angle based on bot's current position relative to midpoint
  const startPos = bot.entity.position;
  const initialDx = startPos.x - sharedMidpoint.x;
  const initialDz = startPos.z - sharedMidpoint.z;
  let angle = Math.atan2(initialDz, initialDx); // Starting angle

  console.log(
    `[${bot.username}] Starting orbit angle: ${(
      (angle * 180) /
      Math.PI
    ).toFixed(1)}°`
  );

  // MVC state tracking for metadata
  let mvcMetadata = {
    partner_in_fov: true,
    fov_angle_deg: 0,
    distance_to_partner: 0,
    mvc_corrections_applied: 0,
  };

  try {
    while (Date.now() - startTime < durationMs) {
      const now = Date.now();

      // Calculate target position on the circle around shared midpoint
      const targetX = sharedMidpoint.x + ORBIT_RADIUS * Math.cos(angle);
      const targetZ = sharedMidpoint.z + ORBIT_RADIUS * Math.sin(angle);
      const targetPos = new Vec3(targetX, sharedMidpoint.y, targetZ);

      // Use pathfinder to move to orbit position
      bot.pathfinder.setGoal(
        new GoalNear(targetPos.x, targetPos.y, targetPos.z, 1.0)
      );

      console.log(
        `[${bot.username}] Orbit target: (${targetX.toFixed(
          2
        )}, ${targetZ.toFixed(2)}) angle: ${((angle * 180) / Math.PI).toFixed(
          1
        )}°`
      );

      // Get other bot's position for MVC
      const otherBot = bot.players[otherBotName];
      if (otherBot && otherBot.entity) {
        const otherBotPos = otherBot.entity.position;

        // Run MVC tick every update interval
        if (now - lastMVCUpdate > ORBIT_UPDATE_INTERVAL_MS) {
          try {
            const mvcResult = await mvc.tick(bot, otherBotPos);

            // Update metadata with MVC state
            mvcMetadata = {
              ...mvcMetadata,
              ...mvcResult.mvcState,
            };

            if (
              mvcResult.appliedCorrections.lookedAt ||
              mvcResult.appliedCorrections.movedRight
            ) {
              mvcMetadata.mvc_corrections_applied++;
              console.log(
                `[${bot.username}] MVC applied corrections during orbit: lookAt=${mvcResult.appliedCorrections.lookedAt}, moveRight=${mvcResult.appliedCorrections.movedRight}`
              );
            }

            lastMVCUpdate = now;
          } catch (error) {
            console.error(`[${bot.username}] MVC error during orbit:`, error);
          }
        }

        // Maintain eye contact with other bot (less frequent than MVC to avoid conflicts)
        if (now - lastEyeContactUpdate > EYE_CONTACT_UPDATE_INTERVAL_MS) {
          // Only do manual eye contact if MVC didn't just correct it
          if (now - lastMVCUpdate > 100) {
            await lookAtBot(bot, otherBotName, CAMERA_SPEED_DEGREES_PER_SEC);
            console.log(
              `[${bot.username}] Manual eye contact with ${otherBotName} while orbiting`
            );
          }
          lastEyeContactUpdate = now;
        }
      } else {
        console.log(
          `[${bot.username}] Cannot see ${otherBotName} for MVC/eye contact`
        );
      }

      // Advance angle for next orbit position
      angle += ORBIT_SPEED;
      if (angle > 2 * Math.PI) {
        angle -= 2 * Math.PI; // Keep angle in [0, 2π] range
      }

      await sleep(ORBIT_UPDATE_INTERVAL_MS);
    }
  } finally {
    // Clean up pathfinder
    stopPathfinder(bot);

    // Log MVC statistics
    console.log(`[${bot.username}] MVC-enhanced orbit complete! Stats:`, {
      final_partner_in_fov: mvcMetadata.partner_in_fov,
      final_fov_angle: mvcMetadata.fov_angle_deg.toFixed(1),
      final_distance: mvcMetadata.distance_to_partner.toFixed(2),
      total_corrections: mvcMetadata.mvc_corrections_applied,
    });
  }
}

/**
 * Get orbit phase handler function
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} iterationID - Iteration ID
 * @param {string} otherBotName - Other bot name
 * @param {number} episodeNum - Episode number
 * @param {Object} episodeInstance - Episode instance
 * @param {Object} args - Configuration arguments
 * @returns {Function} Orbit phase handler
 */
function getOnOrbitPhaseFn(
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
    const startTime = Date.now();
    console.log(
      `[${bot.username}] ORBIT EPISODE STARTING - Episode ${episodeNum}, Iteration ${iterationID}`
    );
    console.log(
      `[${bot.username}] Episode start time: ${new Date(
        startTime
      ).toISOString()}`
    );

    coordinator.sendToOtherBot(
      `orbitPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `orbitPhase_${iterationID} beginning`
    );

    console.log(
      `[${bot.username}] Starting pathfinder orbit phase ${iterationID}`
    );

    // Calculate shared midpoint between both bots
    const myPosition = bot.entity.position;
    const otherPosition = otherBotPosition; // Received from coordination

    const sharedMidpoint = new Vec3(
      Math.round((myPosition.x + otherPosition.x) / 2),
      Math.round((myPosition.y + otherPosition.y) / 2),
      Math.round((myPosition.z + otherPosition.z) / 2)
    );

    console.log(
      `[${bot.username}] Shared midpoint calculated: (${sharedMidpoint.x}, ${sharedMidpoint.y}, ${sharedMidpoint.z})`
    );
    console.log(
      `[${bot.username}] My position: (${myPosition.x.toFixed(
        1
      )}, ${myPosition.y.toFixed(1)}, ${myPosition.z.toFixed(1)})`
    );
    console.log(
      `[${bot.username}] ${otherBotName} position: (${otherPosition.x.toFixed(
        1
      )}, ${otherPosition.y.toFixed(1)}, ${otherPosition.z.toFixed(1)})`
    );

    // Execute the orbit behavior using pathfinder around shared midpoint
    await orbitAroundSharedMidpoint(
      bot,
      coordinator,
      otherBotName,
      sharedMidpoint,
      ORBIT_DURATION_MS
    );

    // Transition to stop phase
    console.log(`[${bot.username}] Transitioning to stop phase...`);
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
      `orbitPhase_${iterationID} end`
    );

    console.log(
      `[${bot.username}] Orbit phase ${iterationID} transition complete`
    );
  };
}

class OrbitEpisode extends BaseEpisode {
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
      `orbitPhase_${iterationID}`,
      episodeNum,
      getOnOrbitPhaseFn(
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
      `orbitPhase_${iterationID}`,
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
  orbitAroundSharedMidpoint,
  getOnOrbitPhaseFn,
  OrbitEpisode,
};
