const { BaseEpisode } = require("./base-episode");
const { GoalNear } = require("../utils/bot-factory");
const { lookAtSmooth, sneak } = require("../utils/movement");
const { GoalXZ } = require("../utils/bot-factory");

const EPISODE_MIN_TICKS = 300;

function getOnTurnToLookPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  episodeNum,
  episodeInstance,
  args
) {
  return async (otherBotPosition) => {
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
    await bot.waitForTicks(2);

    coordinator.sendToOtherBot(
      "turnToLookPhase",
      bot.entity.position.clone(),
      episodeNum,
      "turnToLookPhase beginning"
    );

    const otherName = args.other_bot_name;
    const other = bot.players[otherName]?.entity;
    if (!other) {
      console.log(`[${bot.username}] Other bot missing, skipping.`);
      coordinator.sendToOtherBot(
        "stopPhase",
        bot.entity.position.clone(),
        episodeNum,
        "missing other bot"
      );
      return;
    }

    const startTick = bot.time.age;
    const me = bot.entity.position;
    const them = other.position;

    // ---- Phase 1: Look at each other ----
    console.log(`[${bot.username}] Looking at ${otherName}`);
    await lookAtSmooth(bot, them, 60);
    await bot.waitForTicks(20);

    // ---- Phase 2: Walk toward midpoint with directional offset ----
    const midX = (me.x + them.x) / 2;
    const midZ = (me.z + them.z) / 2;
    const yLevel = me.y;

    // Determine primary axis of separation
    const dx = them.x - me.x;
    const dz = them.z - me.z;

    let targetX = midX;
    let targetZ = midZ;

    // Offset along whichever axis is greater in magnitude
    if (Math.abs(dx) > Math.abs(dz)) {
      // Bots are more separated along X
      targetX += me.x > them.x ? 1 : -1;
    } else {
      // Bots are more separated along Z
      targetZ += me.z > them.z ? 1 : -1;
    }

    console.log(
      `[${bot.username}] Walking toward (${targetX.toFixed(1)}, ${yLevel.toFixed(1)}, ${targetZ.toFixed(1)})`
    );

    try {
      await bot.pathfinder.goto(new GoalXZ(targetX, targetZ));
      console.log(`[${bot.username}] Reached offset midpoint.`);
    } catch (err) {
      console.log(`[${bot.username}] Pathfinding failed: ${err.message}`);
    }

    // ---- Phase 3: Face a random direction ----
    const vx = them.x - me.x;
    const vz = them.z - me.z;

    // Normalize horizontal vector
    const mag = Math.sqrt(vx*vx + vz*vz) || 1;
    const nx = vx / mag;
    const nz = vz / mag;

    // Rotate 90 degrees left or right
    // direction = +1 or -1 chosen from sharedRng so both bots choose opposite sides deterministically
    const dir = bot.username < otherName ? 1 : -1;

    // rotated vector
    const sideX = -nz * dir;
    const sideZ = nx * dir;

    const facePos = bot.entity.position.offset(sideX, 0, sideZ);
    console.log(`[${bot.username}] Facing sideways (${sideX.toFixed(2)}, ${sideZ.toFixed(2)})`);

    await lookAtSmooth(bot, facePos, 60);

    // ---- Phase 4: Sneak + ensure minimum ticks ----
    console.log(`[${bot.username}] Sneaking to signal completion`);
    await sneak(bot);

    const endTick = bot.time.age;
    const elapsed = endTick - startTick;
    const remaining = EPISODE_MIN_TICKS - elapsed;
    if (remaining > 0) {
      console.log(`[${bot.username}] Waiting ${remaining} ticks to reach ${EPISODE_MIN_TICKS}`);
      await bot.waitForTicks(remaining);
    }

    // ---- Phase 5: Stop phase ----
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
      "turnToLookPhase end"
    );
  };
}

class TurnToLookEpisode extends BaseEpisode {
  static WORKS_IN_NON_FLAT_WORLD = true;

  async entryPoint(bot, rcon, sharedBotRng, coordinator, iterationID, episodeNum, args) {
    coordinator.onceEvent(
      "turnToLookPhase",
      episodeNum,
      getOnTurnToLookPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        episodeNum,
        this,
        args
      )
    );

    coordinator.sendToOtherBot(
      "turnToLookPhase",
      bot.entity.position.clone(),
      episodeNum,
      "teleportPhase end"
    );
  }
}

module.exports = {
  getOnTurnToLookPhaseFn,
  TurnToLookEpisode,
};
