const Vec3 = require("vec3").Vec3;
const { lookAtSmooth, sneak } = require("../utils/movement");
const { BaseEpisode } = require("./base-episode");

const CAMERA_SPEED_DEGREES_PER_SEC = 171.8873;
const EPISODE_MIN_TICKS = 300;
// Marker block placed at the midpoint between the two bots to serve as a
// fixed visual reference for judging both ego-motion and the other bot's motion.
const MARKER_BLOCK_TYPE = "minecraft:stone";
// Each bot walks toward the marker and stops at this XZ distance from it,
// leaving a ~2x gap between the bots.
const STOP_XZ_DISTANCE_FROM_MARKER = 4;
const APPROACH_TIMEOUT_TICKS = 200;
// After approaching, each bot sidesteps this far to its own left or right.
const SIDESTEP_XZ_DISTANCE = 3;
const SIDESTEP_TIMEOUT_TICKS = 100;
// Hold still between the approach and the sidestep so the two sub-tasks are
// cleanly separable in the video. Both bots re-face each other at the END of
// the approach phase (before the sidestep handshake), so the sidestep phase is
// a fixed-length freeze followed by the strafe — keeping the strafes of the
// two bots simultaneous.
const FREEZE_TICKS = 20;

function xzDistance(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

// Scan down at (x, z) for the ground surface and return the y of the air block
// on top of it (a valid standing/marker y). Returns null if no ground found.
function findSurfaceY(bot, x, z, scanTopY, scanDepth = 10) {
  for (let y = scanTopY; y >= scanTopY - scanDepth; y--) {
    const block = bot.blockAt(new Vec3(x, y, z));
    if (block && block.boundingBox === "block") {
      return y + 1;
    }
  }
  return null;
}

function getOnMutualApproachPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  episodeNum,
  episodeInstance,
  args
) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      "mutualApproachPhase",
      bot.entity.position.clone(),
      episodeNum,
      "mutualApproachPhase beginning"
    );

    // Deterministic sidestep directions: episodeNum % 4 cycles through all
    // four (alpha, bravo) combinations: LL, LR, RL, RR.
    const caseNum = episodeNum % 4;
    const alphaGoesRight = caseNum >= 2;
    const bravoGoesRight = caseNum % 2 === 1;
    const isAlpha = bot.username < args.other_bot_name;
    const alphaName = isAlpha ? bot.username : args.other_bot_name;
    const bravoName = isAlpha ? args.other_bot_name : bot.username;
    const thisBotGoesRight = isAlpha ? alphaGoesRight : bravoGoesRight;

    const markerPos = episodeInstance._markerPos;
    const approachStartPos = bot.entity.position.clone();

    // "right"/"left" are relative to the bot's own facing while it looks at the other bot
    episodeInstance._evalMetadata = {
      bots_chosen: [bot.username, args.other_bot_name].sort(),
      camera_speed_degrees_per_sec: CAMERA_SPEED_DEGREES_PER_SEC,
      marker_block: MARKER_BLOCK_TYPE,
      marker_position: { x: markerPos.x, y: markerPos.y, z: markerPos.z },
      lineup_axis: episodeInstance._lineupAxis,
      case_num: caseNum,
      stop_xz_distance_from_marker: STOP_XZ_DISTANCE_FROM_MARKER,
      sidestep_xz_distance: SIDESTEP_XZ_DISTANCE,
      freeze_ticks: FREEZE_TICKS,
      sidestep_directions: {
        [alphaName]: alphaGoesRight ? "right" : "left",
        [bravoName]: bravoGoesRight ? "right" : "left",
      },
      this_bot_sidestep_direction: thisBotGoesRight ? "right" : "left",
      approach_start_position: {
        x: approachStartPos.x,
        y: approachStartPos.y,
        z: approachStartPos.z,
      },
    };

    // Face the other bot, then sneak to signal evaluation start
    await lookAtSmooth(
      bot,
      new Vec3(otherBotPosition.x, otherBotPosition.y, otherBotPosition.z),
      CAMERA_SPEED_DEGREES_PER_SEC,
      { randomized: false, useEasing: false }
    );
    await sneak(bot);
    episodeInstance._evalStartTick = bot.time.age;

    console.log(
      `[${bot.username}] approaching marker at (${markerPos.x}, ${markerPos.y}, ${markerPos.z}) ` +
        `along ${episodeInstance._lineupAxis} axis, will stop ${STOP_XZ_DISTANCE_FROM_MARKER} blocks away, ` +
        `then sidestep ${thisBotGoesRight ? "right" : "left"} (case ${caseNum})`
    );

    // Both bots walk straight toward each other (the marker lies on that line)
    // and stop at a fixed distance from the marker.
    const approachStartTick = bot.time.age;
    bot.setControlState("forward", true);
    try {
      while (
        xzDistance(bot.entity.position, markerPos) > STOP_XZ_DISTANCE_FROM_MARKER &&
        bot.time.age - approachStartTick < APPROACH_TIMEOUT_TICKS
      ) {
        await bot.waitForTicks(1);
      }
    } finally {
      bot.setControlState("forward", false);
    }
    await bot.waitForTicks(2);

    const approachEndPos = bot.entity.position.clone();
    episodeInstance._evalMetadata.approach_end_position = {
      x: approachEndPos.x,
      y: approachEndPos.y,
      z: approachEndPos.z,
    };
    console.log(
      `[${bot.username}] approach done at (${approachEndPos.x.toFixed(2)}, ${approachEndPos.z.toFixed(
        2
      )}), ${xzDistance(approachEndPos, markerPos).toFixed(2)} blocks from marker`
    );

    // Re-face the other bot NOW (before the sidestep handshake) so both bots
    // enter the sidestep phase already oriented and strafe simultaneously.
    const otherEntity = bot.players[args.other_bot_name]
      ? bot.players[args.other_bot_name].entity
      : null;
    const refacePos = otherEntity
      ? otherEntity.position
      : new Vec3(markerPos.x, approachEndPos.y, markerPos.z); // marker lies on the same line
    await lookAtSmooth(bot, refacePos, CAMERA_SPEED_DEGREES_PER_SEC, {
      randomized: false,
      useEasing: false,
    });

    coordinator.onceEvent(
      "sidestepPhase",
      episodeNum,
      getOnSidestepPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        episodeNum,
        episodeInstance,
        args,
        thisBotGoesRight
      )
    );
    coordinator.sendToOtherBot(
      "sidestepPhase",
      bot.entity.position.clone(),
      episodeNum,
      "mutualApproachPhase end"
    );
  };
}

function getOnSidestepPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  episodeNum,
  episodeInstance,
  args,
  thisBotGoesRight
) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      "sidestepPhase",
      bot.entity.position.clone(),
      episodeNum,
      "sidestepPhase beginning"
    );

    // Both bots are already facing each other (re-face happened at the end of
    // the approach phase); a fixed-length freeze keeps the strafes simultaneous
    // and makes the approach and sidestep visually separable.
    await bot.waitForTicks(FREEZE_TICKS);

    const direction = thisBotGoesRight ? "right" : "left";
    console.log(`[${bot.username}] sidestepping ${direction}`);

    const sidestepStartPos = bot.entity.position.clone();
    const sidestepStartTick = bot.time.age;
    bot.setControlState(direction, true);
    try {
      while (
        xzDistance(bot.entity.position, sidestepStartPos) < SIDESTEP_XZ_DISTANCE &&
        bot.time.age - sidestepStartTick < SIDESTEP_TIMEOUT_TICKS
      ) {
        await bot.waitForTicks(1);
      }
    } finally {
      bot.setControlState(direction, false);
    }
    await bot.waitForTicks(2);

    const sidestepEndPos = bot.entity.position.clone();
    episodeInstance._evalMetadata.sidestep_end_position = {
      x: sidestepEndPos.x,
      y: sidestepEndPos.y,
      z: sidestepEndPos.z,
    };
    console.log(
      `[${bot.username}] sidestep done, moved ${xzDistance(
        sidestepEndPos,
        sidestepStartPos
      ).toFixed(2)} blocks ${direction}`
    );

    // Ensure minimum episode length measured from the start-of-eval sneak
    const startTick =
      episodeInstance._evalStartTick !== undefined
        ? episodeInstance._evalStartTick
        : sidestepStartTick;
    const endTick = bot.time.age;
    const remainingTicks = EPISODE_MIN_TICKS - (endTick - startTick);
    if (remainingTicks > 0) {
      console.log(
        `[${bot.username}] waiting ${remainingTicks} more ticks to reach ${EPISODE_MIN_TICKS} total ticks`
      );
      await bot.waitForTicks(remainingTicks);
    } else {
      console.log(
        `[${bot.username}] already passed ${EPISODE_MIN_TICKS} ticks (elapsed: ${endTick - startTick})`
      );
    }

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
      "sidestepPhase end"
    );
  };
}

class MutualApproachEvalEpisode extends BaseEpisode {
  static WORKS_IN_NON_FLAT_WORLD = true;
  // Spawn farther apart than the look evals so each bot walks a judgable
  // distance (~3-5 blocks) before reaching its stop point.
  static INIT_MIN_BOTS_DISTANCE = 14;
  static INIT_MAX_BOTS_DISTANCE = 18;

  async setupEpisode(
    bot,
    rcon,
    sharedBotRng,
    coordinator,
    episodeNum,
    args,
    botPosition,
    otherBotPosition
  ) {
    const isAlpha = bot.username < args.other_bot_name;
    const alphaPos = isAlpha ? botPosition : otherBotPosition;
    const bravoPos = isAlpha ? otherBotPosition : botPosition;

    // Line the bots up along a random principal axis: keep alpha in place and
    // teleport bravo so both share the other coordinate, preserving the current
    // distance and relative direction. Both bots compute the same plan from the
    // exchanged positions and the shared RNG; only bravo teleports itself.
    const axis = sharedBotRng() < 0.5 ? "x" : "z";
    this._lineupAxis = axis;
    const dist = xzDistance(alphaPos, bravoPos);
    let bravoTargetX, bravoTargetZ;
    if (axis === "x") {
      const sign = bravoPos.x >= alphaPos.x ? 1 : -1;
      bravoTargetX = alphaPos.x + sign * dist;
      bravoTargetZ = alphaPos.z;
    } else {
      const sign = bravoPos.z >= alphaPos.z ? 1 : -1;
      bravoTargetX = alphaPos.x;
      bravoTargetZ = alphaPos.z + sign * dist;
    }
    const scanTop = Math.floor(Math.max(alphaPos.y, bravoPos.y)) + 2;
    const bravoTargetY =
      findSurfaceY(bot, Math.floor(bravoTargetX), Math.floor(bravoTargetZ), scanTop) ||
      Math.floor(alphaPos.y);

    if (!isAlpha) {
      const tpRes = await rcon.send(
        `tp ${bot.username} ${bravoTargetX.toFixed(2)} ${bravoTargetY} ${bravoTargetZ.toFixed(2)}`
      );
      console.log(
        `[${bot.username}] aligned to ${axis} axis at (${bravoTargetX.toFixed(2)}, ${bravoTargetY}, ${bravoTargetZ.toFixed(2)}), result: ${tpRes}`
      );
      await bot.waitForTicks(10);
    }

    const alphaNew = new Vec3(alphaPos.x, alphaPos.y, alphaPos.z);
    const bravoNew = new Vec3(bravoTargetX, bravoTargetY, bravoTargetZ);

    // Marker at the (now axis-aligned) midpoint; only alpha places it.
    const midX = Math.floor((alphaNew.x + bravoNew.x) / 2);
    const midZ = Math.floor((alphaNew.z + bravoNew.z) / 2);
    let markerY = findSurfaceY(bot, midX, midZ, scanTop);
    if (markerY === null) {
      markerY = Math.floor(alphaPos.y);
      console.log(
        `[${bot.username}] could not find ground at midpoint, defaulting marker y to ${markerY}`
      );
    }
    this._markerPos = new Vec3(midX, markerY, midZ);

    if (isAlpha) {
      const res = await rcon.send(
        `setblock ${midX} ${markerY} ${midZ} ${MARKER_BLOCK_TYPE}`
      );
      console.log(
        `[${bot.username}] placed midpoint marker at (${midX}, ${markerY}, ${midZ}), result: ${res}`
      );
    }

    return {
      botPositionNew: isAlpha ? alphaNew : bravoNew,
      otherBotPositionNew: isAlpha ? bravoNew : alphaNew,
    };
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
      "mutualApproachPhase",
      episodeNum,
      getOnMutualApproachPhaseFn(
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
      "mutualApproachPhase",
      bot.entity.position.clone(),
      episodeNum,
      "teleportPhase end"
    );
  }

  async tearDownEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args) {
    if (this._markerPos && bot.username < args.other_bot_name) {
      try {
        const { x, y, z } = this._markerPos;
        const res = await rcon.send(`setblock ${x} ${y} ${z} minecraft:air`);
        console.log(
          `[${bot.username}] removed midpoint marker at (${x}, ${y}, ${z}), result: ${res}`
        );
      } catch (err) {
        console.log(
          `[${bot.username}] failed to remove midpoint marker: ${(err && err.message) || err}`
        );
      }
    }
  }
}

module.exports = {
  getOnMutualApproachPhaseFn,
  MutualApproachEvalEpisode,
};
