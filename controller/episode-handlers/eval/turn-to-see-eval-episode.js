const { lookAtSmooth, sneak } = require("../../primitives/movement");
const { BaseEpisode } = require("../base-episode");

const CAMERA_SPEED_DEGREES_PER_SEC = 30;
const EPISODE_MIN_TICKS = 300;

function getOnTurnToSeePhaseFn(
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
      "turnToSeePhase",
      bot.entity.position.clone(),
      episodeNum,
      "turnToSeePhase beginning",
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

    // ---- Phase 1: Compute sideways direction ----
    const vx = them.x - me.x;
    const vz = them.z - me.z;

    const mag = Math.sqrt(vx * vx + vz * vz) || 1;
    const nx = vx / mag;
    const nz = vz / mag;

    // Alpha faces left (dir=+1), Bravo faces right (dir=-1)
    const dir = bot.username < otherName ? 1 : -1;

    const sideX = -nz * dir;
    const sideZ = nx * dir;

    const facePos = bot.entity.position.offset(sideX, 0, sideZ);

    // ---- Phase 2: Fast snap to sideways (90 deg/s) ----
    console.log(
      `[${bot.username}] Snapping sideways (${sideX.toFixed(2)}, ${sideZ.toFixed(2)})`,
    );
    await lookAtSmooth(bot, facePos, 90, {
      randomized: false,
      useEasing: false,
    });

    // ---- Phase 3: Signal beginning ----
    console.log(`[${bot.username}] Sneaking to signal beginning`);
    await sneak(bot);
    const startTick = bot.time.age;

    // ---- Phase 4: Slow rotation toward other bot (30 deg/s) ----
    console.log(`[${bot.username}] Turning to face ${otherName}`);

    episodeInstance._evalMetadata = {
      camera_speed_degrees_per_sec: CAMERA_SPEED_DEGREES_PER_SEC,
      side_vector: { x: sideX, z: sideZ },
      dir: dir,
    };

    await lookAtSmooth(bot, them, CAMERA_SPEED_DEGREES_PER_SEC, {
      randomized: false,
      useEasing: false,
    });

    // ---- Phase 5: Ensure minimum ticks ----
    const endTick = bot.time.age;
    const elapsed = endTick - startTick;
    const remaining = EPISODE_MIN_TICKS - elapsed;
    if (remaining > 0) {
      console.log(
        `[${bot.username}] Waiting ${remaining} ticks to reach ${EPISODE_MIN_TICKS}`,
      );
      await bot.waitForTicks(remaining);
    }

    // ---- Phase 6: Stop phase ----
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
      "turnToSeePhase end",
    );
  };
}

class TurnToSeeEvalEpisode extends BaseEpisode {
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
      "turnToSeePhase",
      episodeNum,
      getOnTurnToSeePhaseFn(
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
      "turnToSeePhase",
      bot.entity.position.clone(),
      episodeNum,
      "teleportPhase end",
    );
  }
}

module.exports = {
  getOnTurnToSeePhaseFn,
  TurnToSeeEvalEpisode,
};
