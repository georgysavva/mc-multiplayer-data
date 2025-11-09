const { lookAtSmooth, lookSmooth } = require("../utils/movement");
const { sleep } = require("../utils/helpers");
const { BaseEpisode } = require("./base-episode");

const CAMERA_SPEED_DEGREES_PER_SEC = 30;
const ITERATIONS_NUM_PER_EPISODE = 3;
const MIN_LOOK_AWAY_DURATION_SEC = 2;
const MAX_LOOK_AWAY_DURATION_SEC = 4;

function getOnLookAwayPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  iterationID,
  episodeNum,
  episodeInstance,
  args
) {
  return async (otherBotPosition) => {
    // Add a small 1s delay at the start of each iteration for both bots
    await bot.waitForTicks(20);
    coordinator.sendToOtherBot(
      `lookAwayPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `lookAwayPhase_${iterationID} beginning`
    );

    // Deterministic mode selection based on iteration number
    const walkingModes = [
      "lower_name_looks_away",
      "bigger_name_looks_away",
      "both_look_away",
    ];
    const selectedMode = walkingModes[iterationID];

    console.log(
      `[iter ${iterationID}] [${bot.username}] starting look away phase - mode: ${selectedMode}`
    );

    // Determine if this bot should look away based on the selected mode
    let shouldThisBotLookAway = false;

    switch (selectedMode) {
      case "lower_name_looks_away":
        shouldThisBotLookAway = bot.username < args.other_bot_name;
        break;
      case "bigger_name_looks_away":
        shouldThisBotLookAway = bot.username > args.other_bot_name;
        break;
      case "both_look_away":
        shouldThisBotLookAway = true;
        break;
    }

    console.log(
      `[iter ${iterationID}] [${bot.username}] will ${
        shouldThisBotLookAway ? "look away" : "keep looking"
      } during this phase`
    );

    // Look at the other bot smoothly at the start of the phase
    await lookAtSmooth(bot, otherBotPosition, CAMERA_SPEED_DEGREES_PER_SEC);

    // Either look away or stay looking based on the mode
    if (shouldThisBotLookAway) {
      // Save bot's original pitch and yaw
      const originalYaw = bot.entity.yaw;
      const originalPitch = bot.entity.pitch;

      // Pick a random angle between -90 and +90 degrees behind the bot's current yaw
      // "Behind" means add 180 degrees (π radians), then offset by [-90, +90] degrees
      const behindOffsetDeg = sharedBotRng() * 180 - 90; // [-90, +90]
      const behindOffsetRad = (behindOffsetDeg * Math.PI) / 180;
      const newYaw = originalYaw + Math.PI + behindOffsetRad;

      console.log(
        `[iter ${iterationID}] [${bot.username}] looking away (offset: ${behindOffsetDeg.toFixed(1)}°)`
      );

      // Look away
      await lookSmooth(
        bot,
        newYaw,
        originalPitch,
        CAMERA_SPEED_DEGREES_PER_SEC
      );

      // Stay looking away for a duration
      const lookAwayDuration =
        MIN_LOOK_AWAY_DURATION_SEC +
        sharedBotRng() * (MAX_LOOK_AWAY_DURATION_SEC - MIN_LOOK_AWAY_DURATION_SEC);
      const lookAwayDurationMs = Math.floor(lookAwayDuration * 1000);

      console.log(
        `[iter ${iterationID}] [${bot.username}] staying looking away for ${lookAwayDuration.toFixed(2)}s`
      );
      await sleep(lookAwayDurationMs);

      // Look back at the other bot
      console.log(
        `[iter ${iterationID}] [${bot.username}] looking back at other bot`
      );
      await lookAtSmooth(bot, otherBotPosition, CAMERA_SPEED_DEGREES_PER_SEC);
    } else {
      // Bot keeps looking at the other bot - just wait for the same duration
      const lookAwayDuration =
        MIN_LOOK_AWAY_DURATION_SEC +
        sharedBotRng() * (MAX_LOOK_AWAY_DURATION_SEC - MIN_LOOK_AWAY_DURATION_SEC);
      const lookAwayDurationMs = Math.floor(lookAwayDuration * 1000);

      console.log(
        `[iter ${iterationID}] [${bot.username}] keeping looking at other bot for ${lookAwayDuration.toFixed(2)}s`
      );
      await sleep(lookAwayDurationMs);
    }

    if (iterationID == ITERATIONS_NUM_PER_EPISODE - 1) {
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
        `lookAwayPhase_${iterationID} end`
      );
      return;
    }
    const nextIterationID = iterationID + 1;
    coordinator.onceEvent(
      `lookAwayPhase_${nextIterationID}`,
      episodeNum,
      getOnLookAwayPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        nextIterationID,
        episodeNum,
        episodeInstance,
        args
      )
    );
    coordinator.sendToOtherBot(
      `lookAwayPhase_${nextIterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `lookAwayPhase_${iterationID} end`
    );
  };
}

class LookAwayEvalEpisode extends BaseEpisode {
  static WORKS_IN_NON_FLAT_WORLD = true;
  static INIT_MIN_BOTS_DISTANCE = 10;  // Override: bots spawn 10-12 blocks apart
  static INIT_MAX_BOTS_DISTANCE = 12;

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
      `lookAwayPhase_${iterationID}`,
      episodeNum,
      getOnLookAwayPhaseFn(
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
      `lookAwayPhase_${iterationID}`,
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
  getOnLookAwayPhaseFn,
  LookAwayEvalEpisode,
};

