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
// After approaching, each bot independently sidesteps this far to its own left or right.
const SIDESTEP_XZ_DISTANCE = 3;
const SIDESTEP_TIMEOUT_TICKS = 100;
// Hold still between the approach and the sidestep so the two sub-tasks are
// cleanly separable in the video.
const FREEZE_TICKS = 60;

function xzDistance(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
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

    // Each bot picks its sidestep direction independently, but both draws come
    // from the shared RNG (alpha's first, bravo's second) so both processes
    // agree on both choices and the episode is reproducible from the seed.
    const alphaGoesRight = sharedBotRng() < 0.5;
    const bravoGoesRight = sharedBotRng() < 0.5;
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
      `[${bot.username}] approaching marker at (${markerPos.x}, ${markerPos.y}, ${markerPos.z}), ` +
        `will stop ${STOP_XZ_DISTANCE_FROM_MARKER} blocks away, then sidestep ${
          thisBotGoesRight ? "right" : "left"
        }`
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

    // Re-face the other bot at its post-approach position so left/right are
    // well-defined relative to the line between the bots, then hold still so
    // the approach and sidestep are visually separable.
    await lookAtSmooth(
      bot,
      new Vec3(otherBotPosition.x, otherBotPosition.y, otherBotPosition.z),
      CAMERA_SPEED_DEGREES_PER_SEC,
      { randomized: false, useEasing: false }
    );
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
    // Both bots compute the same midpoint from the exchanged positions;
    // only the alpha bot issues the setblock commands.
    const midX = Math.floor((botPosition.x + otherBotPosition.x) / 2);
    const midZ = Math.floor((botPosition.z + otherBotPosition.z) / 2);

    // Find the ground surface at the midpoint so the marker sits on top of it
    const scanTop = Math.floor(Math.max(botPosition.y, otherBotPosition.y)) + 2;
    let markerY = null;
    for (let y = scanTop; y >= scanTop - 10; y--) {
      const block = bot.blockAt(new Vec3(midX, y, midZ));
      if (block && block.boundingBox === "block") {
        markerY = y + 1;
        break;
      }
    }
    if (markerY === null) {
      markerY = Math.floor(botPosition.y);
      console.log(
        `[${bot.username}] could not find ground at midpoint, defaulting marker y to ${markerY}`
      );
    }
    this._markerPos = new Vec3(midX, markerY, midZ);

    if (bot.username < args.other_bot_name) {
      const res = await rcon.send(
        `setblock ${midX} ${markerY} ${midZ} ${MARKER_BLOCK_TYPE}`
      );
      console.log(
        `[${bot.username}] placed midpoint marker at (${midX}, ${markerY}, ${midZ}), result: ${res}`
      );
    }

    return {
      botPositionNew: botPosition,
      otherBotPositionNew: otherBotPosition,
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
