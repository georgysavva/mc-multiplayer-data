const { lookAtSmooth } = require("../utils/movement");
const { run } = require("../utils/random-movement");

const CAMERA_SPEED_DEGREES_PER_SEC = 30;
const ITERATIONS_NUM_PER_EPISODE = 3;
const MIN_RUN_ACTIONS = 1;
const MAX_RUN_ACTIONS = 1;

function getOnWalkLookAwayPhaseFn(
  bot,
  sharedBotRng,
  coordinator,
  iterationID,
  episodeNum,
  getOnStopPhaseFn,
  args
) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      `walkLookAwayPhase_${iterationID}`,
      bot.entity.position.clone(),
      `walkLookAwayPhase_${iterationID} beginning`
    );
    const actionCount =
      MIN_RUN_ACTIONS +
      Math.floor(sharedBotRng() * (MAX_RUN_ACTIONS - MIN_RUN_ACTIONS + 1));

    // Define three walking phase modes and randomly pick one using sharedBotRng
    const walkingModes = ["lower_name_walks", "bigger_name_walks"];
    const selectedMode =
      walkingModes[Math.floor(sharedBotRng() * walkingModes.length)];

    console.log(
      `[iter ${iterationID}] [${bot.username}] starting walk phase with ${actionCount} actions - mode: ${selectedMode}`
    );

    // Determine if this bot should walk based on the selected mode
    let shouldThisBotWalk = false;

    switch (selectedMode) {
      case "lower_name_walks":
        shouldThisBotWalk = bot.username < args.other_bot_name;
        break;
      case "bigger_name_walks":
        shouldThisBotWalk = bot.username > args.other_bot_name;
        break;
    }

    console.log(
      `[iter ${iterationID}] [${bot.username}] will ${
        shouldThisBotWalk ? "walk" : "sleep"
      } during this phase`
    );

    // Look at the other bot smoothly at the start of the phase
    await lookAtSmooth(bot, otherBotPosition, CAMERA_SPEED_DEGREES_PER_SEC);

    // Either run() or sleep() based on the mode
    if (shouldThisBotWalk) {
      await run(bot, actionCount, /*lookAway*/ true, args);
    } else {
      // Bot doesn't run, so no sleep is needed
      console.log(
        `[iter ${iterationID}] [${bot.username}] not walking this phase`
      );
    }

    if (iterationID == ITERATIONS_NUM_PER_EPISODE - 1) {
      coordinator.onceEvent(
        "stopPhase",
        getOnStopPhaseFn(bot, sharedBotRng, coordinator, args.other_bot_name)
      );
      coordinator.sendToOtherBot(
        "stopPhase",
        bot.entity.position.clone(),
        `walkLookAwayPhase_${iterationID} end`
      );
      return;
    }
    const nextIterationID = iterationID + 1;
    coordinator.onceEvent(
      `walkLookAwayPhase_${nextIterationID}`,
      getOnWalkLookAwayPhaseFn(
        bot,
        sharedBotRng,
        coordinator,
        nextIterationID,
        episodeNum,
        getOnStopPhaseFn,
        args
      )
    );
    coordinator.sendToOtherBot(
      `walkLookAwayPhase_${nextIterationID}`,
      bot.entity.position.clone(),
      `walkLookAwayPhase_${iterationID} end`
    );
  };
}
module.exports = {
  getOnWalkLookAwayPhaseFn,
};
