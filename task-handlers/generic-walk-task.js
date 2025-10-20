const { 
  stopAll, 
  lookAtSmooth, 
  sleep,
  run
} = require('../utils/movement');
const { getGenericWalkConfig } = require('../config/generic-walk-config');

// Get generic walk-specific configuration
const genericWalkConfig = getGenericWalkConfig();

/**
 * Get generic walk phase handler function
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} iterationID - Iteration ID
 * @param {string} otherBotName - Other bot name
 * @param {number} episodeNum - Episode number
 * @param {Object} args - Configuration arguments
 * @returns {Function} Generic walk phase handler
 */
function getOnGenericWalkPhaseFn(
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
      `genericWalkPhase_${iterationID}`,
      bot.entity.position.clone(),
      `genericWalkPhase_${iterationID} beginning`
    );
    
    const actionCount =
      genericWalkConfig.min_run_actions +
      Math.floor(sharedBotRng() * (genericWalkConfig.max_run_actions - genericWalkConfig.min_run_actions + 1));

    // Define three walking phase modes and randomly pick one using sharedBotRng
    const walkingModes = [
      "both_bots_walk",
      "lower_name_walks", 
      "bigger_name_walks"
    ];
    const selectedMode =
      walkingModes[Math.floor(sharedBotRng() * walkingModes.length)];

    console.log(
      `[iter ${iterationID}] [${bot.username}] starting generic walk phase with ${actionCount} actions - mode: ${selectedMode}`
    );

    // Determine if this bot should walk based on the selected mode
    let shouldThisBotWalk = false;

    switch (selectedMode) {
      case "both_bots_walk":
        shouldThisBotWalk = true;
        break;
      case "lower_name_walks":
        shouldThisBotWalk = bot.username < otherBotName;
        break;
      case "bigger_name_walks":
        shouldThisBotWalk = bot.username > otherBotName;
        break;
    }

    console.log(
      `[iter ${iterationID}] [${bot.username}] will ${
        shouldThisBotWalk ? "walk" : "sleep"
      } during this phase`
    );

    // Look at the other bot smoothly at the start of the phase
    await lookAtSmooth(bot, otherBotPosition, 180);

    // Either run() or sleep() based on the mode
    if (shouldThisBotWalk) {
      await run(bot, actionCount, args);
    } else {
      // Bot doesn't run, so no sleep is needed
      console.log(
        `[iter ${iterationID}] [${bot.username}] not walking this phase`
      );
    }

    if (iterationID == args.iterations_num_per_episode - 1) {
      coordinator.onceEvent(
        "stopPhase",
        getOnStopPhaseFn(bot, sharedBotRng, coordinator, args.other_bot_name)
      );
      coordinator.sendToOtherBot(
        "stopPhase",
        bot.entity.position.clone(),
        `genericWalkPhase_${iterationID} end`
      );
      return;
    }
    const nextIterationID = iterationID + 1;
    coordinator.onceEvent(
      `genericWalkPhase_${nextIterationID}`,
      getOnGenericWalkPhaseFn(
        bot,
        sharedBotRng,
        coordinator,
        nextIterationID,
        args.other_bot_name,
        episodeNum,
        getOnStopPhaseFn,
        args
      )
    );
    coordinator.sendToOtherBot(
      `genericWalkPhase_${nextIterationID}`,
      bot.entity.position.clone(),
      `genericWalkPhase_${iterationID} end`
    );
  };
}

module.exports = {
  getOnGenericWalkPhaseFn
};
