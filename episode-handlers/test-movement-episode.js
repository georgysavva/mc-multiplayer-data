const { BaseEpisode } = require("./base-episode");
const { sleep } = require("../utils/movement");

const ITERATIONS_NUM_PER_EPISODE = 5;

function getOnTestMovementPhaseFn(
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
    coordinator.sendToOtherBot(
      `testMovementPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `testMovementPhase_${iterationID} beginning`
    );

    console.log(
      `[iter ${iterationID}] [${bot.username}] starting empty test movement phase`
    );
    const tick = () => {
      const entity = bot.nearestEntity((entity) => entity.type === "player");
      if (entity) {
        // set the proximity target to the nearest entity
        bot.movement.heuristic.get("proximity").target(entity.position);
        // move towards the nearest entity
        const yaw = bot.movement.getYaw(240, 15, 1);
        bot.movement.steer(yaw);
      }
    };
    bot.on("physicsTick", tick);
    await sleep(10000);
    bot.removeListener("physicsTick", tick);

    // Empty phase - no actions performed

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
      `testMovementPhase_${iterationID} end`
    );
  };
}

class TestMovementEpisode extends BaseEpisode {
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
      `testMovementPhase_${iterationID}`,
      episodeNum,
      getOnTestMovementPhaseFn(
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
      `testMovementPhase_${iterationID}`,
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
  getOnTestMovementPhaseFn,
  TestMovementEpisode,
};
