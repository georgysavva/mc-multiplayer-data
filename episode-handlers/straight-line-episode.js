// New episode functions for straight-line movement while facing other bot

const Vec3 = require("vec3").Vec3;
const {
  stopAll,
  moveToward,
  lookAtSmooth,
  lookAtBot,
  sleep,
  horizontalDistanceTo,
  getDirectionTo,
} = require("../utils/movement");
const { BaseEpisode } = require("./base-episode");

// Constants for the new episode
const STRAIGHT_WALK_DISTANCE = 8; // Distance to walk in straight line
const LOOK_UPDATE_INTERVAL = 50; // How often to update look direction (ms)
const CAMERA_SPEED_DEGREES_PER_SEC = 180; // Same as main file

/**
 * Walk straight while looking at other bot with offset to avoid collision
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} otherBotPosition - Position of the other bot
 * @param {number} walkDistance - Distance to walk
 * @param {number} walkTimeoutSec - Timeout for walking in seconds
 */
async function walkStraightWhileLooking(
  bot,
  otherBotPosition,
  walkDistance,
  walkTimeoutSec
) {
  console.log(
    `[${bot.username}] Starting straight walk toward other bot with ${walkDistance} block distance`
  );

  const startPos = bot.entity.position.clone();
  const walkTimeoutMs = walkTimeoutSec * 1000;

  // Calculate direction toward other bot
  const direction = getDirectionTo(startPos, otherBotPosition);

  // Add slight offset to avoid direct collision (walk past the other bot)
  const offsetDistance = walkDistance + 2; // Walk 2 blocks past the target
  const targetPos = new Vec3(
    startPos.x + direction.x * offsetDistance,
    startPos.y,
    startPos.z + direction.z * offsetDistance
  );

  console.log(
    `[${bot.username}] Walking from (${startPos.x.toFixed(
      2
    )}, ${startPos.z.toFixed(2)}) toward (${targetPos.x.toFixed(
      2
    )}, ${targetPos.z.toFixed(2)})`
  );

  const startTime = Date.now();
  let lastLookUpdate = 0;

  try {
    while (Date.now() - startTime < walkTimeoutMs) {
      const currentPos = bot.entity.position;
      const distanceWalked = horizontalDistanceTo(startPos, currentPos);

      // Check if we've walked far enough
      if (distanceWalked >= walkDistance) {
        console.log(
          `[${bot.username}] Completed straight walk: ${distanceWalked.toFixed(
            2
          )} blocks`
        );
        break;
      }

      // Update look direction periodically
      const now = Date.now();
      if (now - lastLookUpdate > LOOK_UPDATE_INTERVAL) {
        await lookAtSmooth(bot, otherBotPosition, CAMERA_SPEED_DEGREES_PER_SEC);
        lastLookUpdate = now;
      }

      // Use movement building block to move toward target
      const moveDirection = moveToward(bot, targetPos, true, 0.5); // Sprint enabled

      // Small delay for smooth movement
      await sleep(50);
    }

    const finalDistance = horizontalDistanceTo(startPos, bot.entity.position);
    console.log(
      `[${
        bot.username
      }] Completed offset straight walk: ${finalDistance.toFixed(2)} blocks`
    );
  } finally {
    // Stop all movement
    stopAll(bot);
    console.log(`[${bot.username}] Straight walk complete`);
  }
}

/**
 * Get straight line walk phase handler function
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} iterationID - Iteration ID
 * @param {string} otherBotName - Other bot name
 * @param {number} episodeNum - Episode number
 * @param {Object} episodeInstance - Episode instance
 * @param {Object} args - Configuration arguments
 * @returns {Function} Straight line walk phase handler
 */
function getOnStraightLineWalkPhaseFn(
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
      `straightLineWalkPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `straightLineWalkPhase_${iterationID} beginning`
    );

    console.log(
      `[${bot.username}] Starting straight line walk phase ${iterationID}`
    );

    // Determine walking modes and randomly pick one using sharedBotRng
    const walkingModes = [
      "lower_name_walks_straight",
      "bigger_name_walks_straight",
    ];
    const selectedMode =
      walkingModes[Math.floor(sharedBotRng() * walkingModes.length)];

    console.log(`[${bot.username}] Straight walk mode: ${selectedMode}`);

    // Determine if this bot should walk based on the selected mode
    let shouldThisBotWalk = false;

    switch (selectedMode) {
      case "lower_name_walks_straight":
        shouldThisBotWalk = bot.username < otherBotName;
        break;
      case "bigger_name_walks_straight":
        shouldThisBotWalk = bot.username > otherBotName;
        break;
    }

    console.log(
      `[${bot.username}] Will ${
        shouldThisBotWalk ? "walk straight" : "stay and look"
      } during this phase`
    );

    if (shouldThisBotWalk) {
      // Execute straight line walking using building blocks
      await walkStraightWhileLooking(
        bot,
        otherBotPosition,
        STRAIGHT_WALK_DISTANCE,
        args.walk_timeout
      );
    } else {
      // Bot doesn't walk, just looks at the other bot
      console.log(
        `[${bot.username}] Staying in place and looking at other bot`
      );
      await lookAtSmooth(bot, otherBotPosition, CAMERA_SPEED_DEGREES_PER_SEC);

      // Wait for the walking bot to complete (approximate time)
      const estimatedWalkTime = (STRAIGHT_WALK_DISTANCE / 4.3) * 1000; // Rough estimate based on sprint speed
      await sleep(estimatedWalkTime);
    }

    // Continue to next iteration or stop
    if (iterationID == 2) {
      // Assuming 3 iterations like the original
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
        `straightLineWalkPhase_${iterationID} end`
      );
      return;
    }

    const nextIterationID = iterationID + 1;
    coordinator.onceEvent(
      `straightLineWalkPhase_${nextIterationID}`,
      episodeNum,
      getOnStraightLineWalkPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        nextIterationID,
        otherBotName,
        episodeNum,
        episodeInstance,
        args
      )
    );
    coordinator.sendToOtherBot(
      `straightLineWalkPhase_${nextIterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `straightLineWalkPhase_${iterationID} end`
    );
  };
}

class StraightLineEpisode extends BaseEpisode {
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
      `straightLineWalkPhase_${iterationID}`,
      episodeNum,
      getOnStraightLineWalkPhaseFn(
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
      `straightLineWalkPhase_${iterationID}`,
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
  walkStraightWhileLooking,
  getOnStraightLineWalkPhaseFn,
  StraightLineEpisode,
};
