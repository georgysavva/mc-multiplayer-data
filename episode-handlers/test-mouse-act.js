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
const {
  Movements,
  GoalNear,
  GoalFollow,
  GoalBlock,
} = require("../utils/bot-factory");

// Constants for the new episode
const STRAIGHT_WALK_DISTANCE = 8; // Distance to walk in straight line
const LOOK_UPDATE_INTERVAL = 50; // How often to update look direction (ms)
const CAMERA_SPEED_DEGREES_PER_SEC = 180; // Same as main file

/**
 * Get straight line walk phase handler function
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} iterationID - Iteration ID
 * @param {string} otherBotName - Other bot name
 * @param {number} episodeNum - Episode number
 * @param {Function} getOnStopPhaseFn - Stop phase function getter
 * @param {Object} args - Configuration arguments
 * @returns {Function} Straight line walk phase handler
 */
function getOnTestMouseActPhaseFn(
  bot,
  sharedBotRng,
  coordinator,
  iterationID,
  otherBotName,
  episodeNum,
  getOnStopPhaseFn,
  args
) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      `testMouseActPhase_${iterationID}`,
      bot.entity.position.clone(),
      `testMouseActPhase_${iterationID} beginning`
    );

    console.log(
      `[${bot.username}] Starting test mouse act phase ${iterationID}`
    );
    const defaultMove = new Movements(bot);
    defaultMove.allowSprinting = true;
    defaultMove.allowParkour = true;
    defaultMove.canDig = true;

    bot.pathfinder.setMovements(defaultMove);

    // Calculate target position 10 blocks directly below
    const currentPos = bot.entity.position.clone();
    const targetPos = currentPos.offset(0, -100, 0);

    console.log(`[${bot.username}] Current position: ${currentPos.toString()}`);
    console.log(
      `[${
        bot.username
      }] Target position (10 blocks down): ${targetPos.toString()}`
    );

    // Set the goal to the block 10 blocks below
    const goal = new GoalBlock(targetPos.x, targetPos.y, targetPos.z);

    try {
      console.log(`[${bot.username}] Starting pathfinding to dig down...`);
      await bot.pathfinder.goto(goal);
      console.log(`[${bot.username}] Successfully reached target position!`);
    } catch (err) {
      console.log(`[${bot.username}] Pathfinding failed: ${err.message}`);
    }

    // Wait a moment to observe the result
    await sleep(2000);

    // Continue to next iteration or stop
    coordinator.onceEvent(
      "stopPhase",
      getOnStopPhaseFn(bot, sharedBotRng, coordinator, otherBotName)
    );
    coordinator.sendToOtherBot(
      "stopPhase",
      bot.entity.position.clone(),
      `straightLineWalkPhase_${iterationID} end`
    );
    return;
  };
}

module.exports = {
  getOnTestMouseActPhaseFn,
};
