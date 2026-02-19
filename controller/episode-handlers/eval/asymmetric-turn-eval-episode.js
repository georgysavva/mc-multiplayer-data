const { lookAtSmooth, sneak } = require("../../primitives/movement");
const { BaseEpisode } = require("../base-episode");

const CAMERA_SPEED_DEGREES_PER_SEC = 30;
const EPISODE_MIN_TICKS = 300;

function getOnAsymmetricTurnPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  episodeNum,
  episodeInstance,
  args,
) {
  return async (otherBotPosition) => {
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
    await bot.waitForTicks(2);

    coordinator.sendToOtherBot(
      "asymmetricTurnPhase",
      bot.entity.position.clone(),
      episodeNum,
      "asymmetricTurnPhase beginning",
    );

    const otherName = args.other_bot_name;
    const other = bot.players[otherName]?.entity;
    if (!other) {
      console.log(`[${bot.username}] Other bot missing, skipping.`);
      coordinator.sendToOtherBot(
        "stopPhase",
        bot.entity.position.clone(),
        episodeNum,
        "missing other bot",
      );
      return;
    }

    const me = bot.entity.position;
    const them = other.position;

    // Determine roles: which bot turns, alternating by episodeNum
    // Both bots consume sharedBotRng in the same order to stay in sync
    const turnerIsAlpha = episodeNum % 2 === 0;
    const isAlpha = bot.username < otherName;
    const isTurner = turnerIsAlpha === isAlpha;
    const role = isTurner ? "TURNER" : "WATCHER";

    console.log(
      `[${bot.username}] Role: ${role} (turnerIsAlpha=${turnerIsAlpha})`,
    );

    if (isTurner) {
      // ---- Turner: snap sideways, then slowly turn toward watcher ----

      // Compute sideways direction
      const vx = them.x - me.x;
      const vz = them.z - me.z;
      const mag = Math.sqrt(vx * vx + vz * vz) || 1;
      const nx = vx / mag;
      const nz = vz / mag;

      // Turner always faces left relative to the line between bots
      const dir = 1;
      const sideX = -nz * dir;
      const sideZ = nx * dir;

      const facePos = bot.entity.position.offset(sideX, 0, sideZ);

      // Fast snap sideways (90 deg/s)
      console.log(
        `[${bot.username}] Snapping sideways (${sideX.toFixed(2)}, ${sideZ.toFixed(2)})`,
      );
      await lookAtSmooth(bot, facePos, 90, {
        randomized: false,
        useEasing: false,
      });

      // Signal beginning
      console.log(`[${bot.username}] Sneaking to signal beginning`);
      await sneak(bot);
      const startTick = bot.time.age;

      // Slow turn toward watcher (30 deg/s)
      console.log(`[${bot.username}] Turning to face ${otherName}`);

      episodeInstance._evalMetadata = {
        camera_speed_degrees_per_sec: CAMERA_SPEED_DEGREES_PER_SEC,
        side_vector: { x: sideX, z: sideZ },
        dir: dir,
        turner_bot: bot.username,
        watcher_bot: otherName,
      };

      await lookAtSmooth(bot, them, CAMERA_SPEED_DEGREES_PER_SEC, {
        randomized: false,
        useEasing: false,
      });

      // Ensure minimum ticks
      const endTick = bot.time.age;
      const elapsed = endTick - startTick;
      const remaining = EPISODE_MIN_TICKS - elapsed;
      if (remaining > 0) {
        console.log(
          `[${bot.username}] Waiting ${remaining} ticks to reach ${EPISODE_MIN_TICKS}`,
        );
        await bot.waitForTicks(remaining);
      }
    } else {
      // ---- Watcher: face the other bot and hold still ----

      // Look at turner (fast)
      console.log(`[${bot.username}] Looking at ${otherName} (watcher role)`);
      await lookAtSmooth(bot, them, 90, {
        randomized: false,
        useEasing: false,
      });

      // Signal beginning
      console.log(`[${bot.username}] Sneaking to signal beginning`);
      await sneak(bot);
      const startTick = bot.time.age;

      episodeInstance._evalMetadata = {
        camera_speed_degrees_per_sec: CAMERA_SPEED_DEGREES_PER_SEC,
        turner_bot: otherName,
        watcher_bot: bot.username,
      };

      // Hold still for minimum ticks
      const remaining = EPISODE_MIN_TICKS;
      console.log(
        `[${bot.username}] Holding still for ${remaining} ticks (watcher)`,
      );
      await bot.waitForTicks(remaining);
    }

    // ---- Stop phase ----
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
        args,
      ),
    );

    coordinator.sendToOtherBot(
      "stopPhase",
      bot.entity.position.clone(),
      episodeNum,
      "asymmetricTurnPhase end",
    );
  };
}

class AsymmetricTurnEvalEpisode extends BaseEpisode {
  static INIT_MIN_BOTS_DISTANCE = 10;
  static INIT_MAX_BOTS_DISTANCE = 12;
  static WORKS_IN_NON_FLAT_WORLD = true;

  async entryPoint(
    bot,
    rcon,
    sharedBotRng,
    coordinator,
    iterationID,
    episodeNum,
    args,
  ) {
    coordinator.onceEvent(
      "asymmetricTurnPhase",
      episodeNum,
      getOnAsymmetricTurnPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        episodeNum,
        this,
        args,
      ),
    );

    coordinator.sendToOtherBot(
      "asymmetricTurnPhase",
      bot.entity.position.clone(),
      episodeNum,
      "teleportPhase end",
    );
  }
}

module.exports = {
  getOnAsymmetricTurnPhaseFn,
  AsymmetricTurnEvalEpisode,
};
