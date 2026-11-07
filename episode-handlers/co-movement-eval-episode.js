const Vec3 = require("vec3").Vec3;
const { lookAtSmooth, sneak } = require("../utils/movement");
const { BaseEpisode } = require("./base-episode");

const CAMERA_SPEED_DEGREES_PER_SEC = 171.8873;
const EPISODE_MIN_TICKS = 300;
// Optional block placed at the midpoint between the two bots, as a fixed visual
// reference for judging ego-motion separately from the other bot's motion.
// Only the "WithDivider" variant places it.
const DIVIDER_BLOCK_TYPE = "minecraft:stone";
// Each bot walks toward the midpoint and stops this far from it, leaving the two
// roughly 2x this distance apart (~7.4 blocks in practice, since each bot slightly
// overshoots the per-tick distance check). This is the original spacing, which
// keeps both players at a readable size on screen.
const STOP_XZ_DISTANCE_FROM_MARKER = 4;
const APPROACH_TIMEOUT_TICKS = 200;
// How far each bot travels during the co-movement phase. BOTH bots move, so the
// "same command" cases produce 2x this in relative displacement.
//
// Lateral (left/right) was originally sized so that 2x matched the one-player
// translation eval's peak relative displacement (7.54 blocks), but at this
// spacing that pushed the partner to ~45 degrees off-centre, i.e. the very edge
// of the frame. Reduced by 1 block per bot to keep both players comfortably in
// view; 2x is now ~5.5-6 blocks of relative displacement.
//
// Radial (forward/back) has to be smaller: the bots start only ~7.4 blocks apart,
// so a 3.75 block move each would close the gap to zero and collide. 2 blocks
// each leaves ~3.4 blocks at the closest (both forward) and ~11.4 at the farthest
// (both backward), the latter matching the one-player eval's ~10.7 separation.
// Radial motion also changes apparent size, so it reads clearly at a smaller
// magnitude than lateral does.
const MOVE_XZ_DISTANCE_LATERAL = 2.75;
const MOVE_XZ_DISTANCE_RADIAL = 2;
const MOVE_XZ_DISTANCE_FOR = {
  left: MOVE_XZ_DISTANCE_LATERAL,
  right: MOVE_XZ_DISTANCE_LATERAL,
  forward: MOVE_XZ_DISTANCE_RADIAL,
  back: MOVE_XZ_DISTANCE_RADIAL,
};
const MOVE_TIMEOUT_TICKS = 100;
// Hold still between the approach and the co-movement so the two sub-tasks are
// cleanly separable in the video. Both bots re-face each other at the END of the
// approach phase, so this phase is a fixed freeze followed by the move, keeping
// the two bots' movements simultaneous.
const FREEZE_TICKS = 20;

// The four egocentric directions, mirroring the one-player translation eval.
const DIRECTIONS = ["forward", "back", "left", "right"];
const OPPOSITE = {
  forward: "back",
  back: "forward",
  left: "right",
  right: "left",
};

/**
 * Both bots face each other, so an egocentric command maps to relative motion as:
 *   same command     -> they move in opposite world directions -> 2x relative motion
 *   opposite command -> they move in the same world direction  -> no relative motion
 *
 * caseNum = episodeNum % NUM_CASES enumerates (direction x relation):
 *   0..3 = forward/back/left/right, both bots issue the SAME command
 *   4..7 = forward/back/left/right, the follower issues the OPPOSITE command
 *
 * The "AlwaysRelativeMotion" variants drop the opposite-command half, leaving
 * only the 4 same-command cases (sameCommandOnly = true, NUM_CASES = 4).
 */
function numMovementCases(sameCommandOnly) {
  return sameCommandOnly ? 4 : 8;
}

function movementCase(episodeNum, sameCommandOnly = false) {
  const caseNum = episodeNum % numMovementCases(sameCommandOnly);
  const leaderDirection = DIRECTIONS[caseNum % 4];
  const isSame = sameCommandOnly || caseNum < 4;
  return {
    caseNum,
    leaderDirection,
    followerDirection: isSame ? leaderDirection : OPPOSITE[leaderDirection],
    relation: isSame ? "same" : "opposite",
    relativeMotion: isSame ? "2x" : "none",
  };
}

/**
 * orientation places bravo on +X, -X, +Z or -Z of alpha.
 *
 * 8-case variants: each instance runs 16 episodes, which on its own covers only
 * two of the four orientations (floor(0..15 / 8) = 0,1). Offsetting by the
 * instance id shifts instance 1 to the other two, so a 16-episode x 2-instance
 * run enumerates all 8 x 4 = 32 (case x orientation) combinations exactly once,
 * across two worlds, for 64 videos - the per-type size of the existing eval set.
 *
 * 4-case variants: 16 episodes already cover all 4 x 4 = 16 combinations, so a
 * 16-episode x 2-instance run covers each combination exactly twice (once per
 * world), again 64 videos. The instance offset just rotates which episode index
 * lands on which orientation, keeping the two worlds from marching in lockstep.
 */
function lineupPlan(episodeNum, instanceId = 0, sameCommandOnly = false) {
  const orientation =
    (Math.floor(episodeNum / numMovementCases(sameCommandOnly)) +
      2 * Number(instanceId || 0)) %
    4;
  return {
    orientation,
    axis: orientation < 2 ? "x" : "z",
    sign: orientation % 2 === 0 ? 1 : -1,
  };
}

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

function getOnApproachPhaseFn(
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
      "coMovementApproachPhase",
      bot.entity.position.clone(),
      episodeNum,
      "coMovementApproachPhase beginning"
    );

    const sameCommandOnly = !!episodeInstance.constructor.SAME_COMMAND_ONLY;
    const plan = movementCase(episodeNum, sameCommandOnly);
    const isAlpha = bot.username < args.other_bot_name;
    const alphaName = isAlpha ? bot.username : args.other_bot_name;
    const bravoName = isAlpha ? args.other_bot_name : bot.username;
    // Alpha is the leader; bravo mirrors it (same or opposite command).
    const thisBotDirection = isAlpha
      ? plan.leaderDirection
      : plan.followerDirection;

    const markerPos = episodeInstance._markerPos;
    const approachStartPos = bot.entity.position.clone();

    // Directions are egocentric, i.e. relative to each bot's own facing while it
    // looks at the other bot.
    episodeInstance._evalMetadata = {
      bots_chosen: [bot.username, args.other_bot_name].sort(),
      camera_speed_degrees_per_sec: CAMERA_SPEED_DEGREES_PER_SEC,
      divider_placed: !!episodeInstance.constructor.PLACES_DIVIDER,
      divider_block: episodeInstance.constructor.PLACES_DIVIDER
        ? DIVIDER_BLOCK_TYPE
        : null,
      midpoint_position: { x: markerPos.x, y: markerPos.y, z: markerPos.z },
      lineup_axis: episodeInstance._lineupAxis,
      lineup_orientation: episodeInstance._lineupOrientation,
      lineup_sign: episodeInstance._lineupSign,
      case_num: plan.caseNum,
      num_cases: numMovementCases(sameCommandOnly),
      same_command_only: sameCommandOnly,
      leader: alphaName,
      relation: plan.relation,
      relative_motion: plan.relativeMotion,
      move_directions: {
        [alphaName]: plan.leaderDirection,
        [bravoName]: plan.followerDirection,
      },
      this_bot_move_direction: thisBotDirection,
      stop_xz_distance_from_marker: STOP_XZ_DISTANCE_FROM_MARKER,
      move_xz_distance: MOVE_XZ_DISTANCE_FOR[thisBotDirection],
      move_xz_distance_lateral: MOVE_XZ_DISTANCE_LATERAL,
      move_xz_distance_radial: MOVE_XZ_DISTANCE_RADIAL,
      freeze_ticks: FREEZE_TICKS,
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
      `[${bot.username}] approaching midpoint at (${markerPos.x}, ${markerPos.y}, ${markerPos.z}) ` +
        `along ${episodeInstance._lineupAxis} axis, stopping ${STOP_XZ_DISTANCE_FROM_MARKER} blocks away, ` +
        `then moving ${thisBotDirection} (case ${plan.caseNum}: ${plan.relation}, ${plan.relativeMotion} relative motion)`
    );

    // Both bots walk straight toward each other (the midpoint lies on that line)
    // and stop at a fixed distance from it.
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
      )}), ${xzDistance(approachEndPos, markerPos).toFixed(2)} blocks from midpoint`
    );

    // Re-face the other bot NOW (before the co-movement handshake) so both bots
    // enter the move phase already oriented and move simultaneously.
    const otherEntity = bot.players[args.other_bot_name]
      ? bot.players[args.other_bot_name].entity
      : null;
    const refacePos = otherEntity
      ? otherEntity.position
      : new Vec3(markerPos.x, approachEndPos.y, markerPos.z); // midpoint is on the same line
    await lookAtSmooth(bot, refacePos, CAMERA_SPEED_DEGREES_PER_SEC, {
      randomized: false,
      useEasing: false,
    });

    coordinator.onceEvent(
      "coMovementPhase",
      episodeNum,
      getOnCoMovementPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        episodeNum,
        episodeInstance,
        args,
        thisBotDirection
      )
    );
    coordinator.sendToOtherBot(
      "coMovementPhase",
      bot.entity.position.clone(),
      episodeNum,
      "coMovementApproachPhase end"
    );
  };
}

function getOnCoMovementPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  episodeNum,
  episodeInstance,
  args,
  thisBotDirection
) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      "coMovementPhase",
      bot.entity.position.clone(),
      episodeNum,
      "coMovementPhase beginning"
    );

    // Both bots are already facing each other (re-face happened at the end of
    // the approach phase); a fixed-length freeze keeps the moves simultaneous
    // and makes the approach and the co-movement visually separable.
    await bot.waitForTicks(FREEZE_TICKS);

    console.log(`[${bot.username}] moving ${thisBotDirection}`);

    const moveDistance = MOVE_XZ_DISTANCE_FOR[thisBotDirection];
    const moveStartPos = bot.entity.position.clone();
    const moveStartTick = bot.time.age;
    bot.setControlState(thisBotDirection, true);
    try {
      while (
        xzDistance(bot.entity.position, moveStartPos) < moveDistance &&
        bot.time.age - moveStartTick < MOVE_TIMEOUT_TICKS
      ) {
        await bot.waitForTicks(1);
      }
    } finally {
      bot.setControlState(thisBotDirection, false);
    }
    await bot.waitForTicks(2);

    const moveEndPos = bot.entity.position.clone();
    episodeInstance._evalMetadata.move_end_position = {
      x: moveEndPos.x,
      y: moveEndPos.y,
      z: moveEndPos.z,
    };
    console.log(
      `[${bot.username}] move done, travelled ${xzDistance(
        moveEndPos,
        moveStartPos
      ).toFixed(2)} blocks ${thisBotDirection}`
    );

    // Ensure minimum episode length measured from the start-of-eval sneak
    const startTick =
      episodeInstance._evalStartTick !== undefined
        ? episodeInstance._evalStartTick
        : moveStartTick;
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
      "coMovementPhase end"
    );
  };
}

/**
 * Two bots line up on a principal axis, walk toward the shared midpoint, then
 * move simultaneously in one of four egocentric directions. The follower either
 * issues the same command (2x relative motion) or the opposite one (no relative
 * motion), which is the quantity being evaluated.
 */
class CoMovementEvalEpisode extends BaseEpisode {
  static WORKS_IN_NON_FLAT_WORLD = true;
  // Original spawn spacing: far enough that each bot still walks a judgable
  // distance (~3-5 blocks) before reaching its stop point.
  static INIT_MIN_BOTS_DISTANCE = 14;
  static INIT_MAX_BOTS_DISTANCE = 18;
  // Whether a stone block is placed at the midpoint as a visual divider.
  static PLACES_DIVIDER = false;
  // When true, drop the opposite-command cases (the ones with no relative
  // motion) and enumerate only the 4 same-command directions.
  static SAME_COMMAND_ONLY = false;

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

    // Line the bots up along a principal axis: keep alpha in place and teleport
    // bravo so both share the other coordinate, preserving the current distance.
    // Both bots compute the same plan from the exchanged positions; only bravo
    // teleports itself. Axis and side are deterministic in episodeNum so that a
    // 32 episode run enumerates all (movement case x orientation) pairs.
    const { orientation, axis, sign } = lineupPlan(
      episodeNum,
      args.instance_id,
      !!this.constructor.SAME_COMMAND_ONLY
    );
    this._lineupAxis = axis;
    this._lineupOrientation = orientation;
    this._lineupSign = sign;

    const dist = xzDistance(alphaPos, bravoPos);
    let bravoTargetX, bravoTargetZ;
    if (axis === "x") {
      bravoTargetX = alphaPos.x + sign * dist;
      bravoTargetZ = alphaPos.z;
    } else {
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
        `[${bot.username}] aligned to ${axis} axis (orientation ${orientation}) at ` +
          `(${bravoTargetX.toFixed(2)}, ${bravoTargetY}, ${bravoTargetZ.toFixed(2)}), result: ${tpRes}`
      );
      await bot.waitForTicks(10);
    }

    const alphaNew = new Vec3(alphaPos.x, alphaPos.y, alphaPos.z);
    const bravoNew = new Vec3(bravoTargetX, bravoTargetY, bravoTargetZ);

    // Midpoint of the (now axis-aligned) pair. Both bots walk toward it in every
    // variant; only the WithDivider variant places a block there.
    const midX = Math.floor((alphaNew.x + bravoNew.x) / 2);
    const midZ = Math.floor((alphaNew.z + bravoNew.z) / 2);
    let markerY = findSurfaceY(bot, midX, midZ, scanTop);
    if (markerY === null) {
      markerY = Math.floor(alphaPos.y);
      console.log(
        `[${bot.username}] could not find ground at midpoint, defaulting y to ${markerY}`
      );
    }
    this._markerPos = new Vec3(midX, markerY, midZ);

    if (isAlpha && this.constructor.PLACES_DIVIDER) {
      const res = await rcon.send(
        `setblock ${midX} ${markerY} ${midZ} ${DIVIDER_BLOCK_TYPE}`
      );
      this._dividerPlaced = true;
      console.log(
        `[${bot.username}] placed midpoint divider at (${midX}, ${markerY}, ${midZ}), result: ${res}`
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
      "coMovementApproachPhase",
      episodeNum,
      getOnApproachPhaseFn(
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
      "coMovementApproachPhase",
      bot.entity.position.clone(),
      episodeNum,
      "teleportPhase end"
    );
  }

  async tearDownEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args) {
    if (this._dividerPlaced && this._markerPos && bot.username < args.other_bot_name) {
      try {
        const { x, y, z } = this._markerPos;
        const res = await rcon.send(`setblock ${x} ${y} ${z} minecraft:air`);
        console.log(
          `[${bot.username}] removed midpoint divider at (${x}, ${y}, ${z}), result: ${res}`
        );
      } catch (err) {
        console.log(
          `[${bot.username}] failed to remove midpoint divider: ${(err && err.message) || err}`
        );
      }
    }
  }
}

class CoMovementWithDividerEvalEpisode extends CoMovementEvalEpisode {
  static PLACES_DIVIDER = true;
}

/**
 * Same as CoMovementEvalEpisode but with the opposite-command cases removed, so
 * the two bots always issue the same egocentric command and therefore always
 * produce 2x relative motion. 4 cases instead of 8.
 */
class CoMovementAlwaysRelativeMotionEvalEpisode extends CoMovementEvalEpisode {
  static SAME_COMMAND_ONLY = true;
}

class CoMovementWithDividerAlwaysRelativeMotionEvalEpisode extends CoMovementEvalEpisode {
  static PLACES_DIVIDER = true;
  static SAME_COMMAND_ONLY = true;
}

module.exports = {
  getOnApproachPhaseFn,
  getOnCoMovementPhaseFn,
  movementCase,
  numMovementCases,
  lineupPlan,
  CoMovementEvalEpisode,
  CoMovementWithDividerEvalEpisode,
  CoMovementAlwaysRelativeMotionEvalEpisode,
  CoMovementWithDividerAlwaysRelativeMotionEvalEpisode,
};
