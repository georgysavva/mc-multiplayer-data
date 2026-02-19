const { GoalNear } = require("mineflayer-pathfinder").goals;
const { Vec3 } = require("vec3");

const { buildStructure } = require("../../primitives/building");
const { ensureBotHasEnough } = require("../../primitives/items");
const {
  lookAtSmooth,
  sneak,
  gotoWithTimeout,
  initializePathfinder,
  stopPathfinder,
} = require("../../primitives/movement");
const { BaseEpisode } = require("../base-episode");
const { generateWallPositions } = require("./structure-eval-episode");

const CAMERA_SPEED_DEGREES_PER_SEC = 30;
const EPISODE_MIN_TICKS = 300;
const WALL_WIDTH = 5;
const WALL_HEIGHT = 3;
const BLOCK_TYPE = "stone";
const PLACEMENT_STANDOFF_BLOCKS = 1;
const ADJACENT_GOAL_RADIUS = 1.0;
const WALK_PAST_DISTANCE = 4; // How far past the wall end to walk

function getOnWallWalkPhaseFn(
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
      "wallWalkPhase",
      bot.entity.position.clone(),
      episodeNum,
      "wallWalkPhase beginning",
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

    const me = bot.entity.position.clone();
    const them = other.position.clone();

    // Determine builder role: alternates by episodeNum
    const builderIsAlpha = episodeNum % 2 === 0;
    const isAlpha = bot.username < otherName;
    const isBuilder = builderIsAlpha === isAlpha;
    const role = isBuilder ? "BUILDER" : "OBSERVER";

    // Walk direction: same for both, determined by sharedBotRng
    const walkDirSign = sharedBotRng() > 0.5 ? 1 : -1;

    console.log(
      `[${bot.username}] Role: ${role}, walkDirSign=${walkDirSign}`,
    );

    // ---- Phase 1: Look at each other ----
    console.log(`[${bot.username}] Looking at ${otherName}`);
    await lookAtSmooth(bot, them, 90, { randomized: false, useEasing: false });

    // ---- Phase 2: Signal beginning ----
    console.log(`[${bot.username}] Sneaking to signal beginning`);
    await sneak(bot);
    const startTick = bot.time.age;

    // ---- Phase 3: Compute wall position at midpoint ----
    const midX = (me.x + them.x) / 2;
    const midZ = (me.z + them.z) / 2;

    // Wall direction: perpendicular to the line between bots
    const vx = them.x - me.x;
    const vz = them.z - me.z;
    const mag = Math.sqrt(vx * vx + vz * vz) || 1;

    // Perpendicular direction for the wall
    const perpX = -vz / mag;
    const perpZ = vx / mag;

    // Determine wall axis
    const useXAxis = Math.abs(perpX) >= Math.abs(perpZ);
    const wallDirection = useXAxis ? "x" : "z";

    // Wall start position: center the wall at the midpoint
    const halfWidth = Math.floor(WALL_WIDTH / 2);
    let wallStartPos;
    if (useXAxis) {
      wallStartPos = new Vec3(
        Math.floor(midX) - halfWidth,
        Math.floor(me.y),
        Math.floor(midZ),
      );
    } else {
      wallStartPos = new Vec3(
        Math.floor(midX),
        Math.floor(me.y),
        Math.floor(midZ) - halfWidth,
      );
    }

    const wallPositions = generateWallPositions(
      wallStartPos,
      WALL_WIDTH,
      WALL_HEIGHT,
      wallDirection,
    );

    console.log(
      `[${bot.username}] Wall: ${WALL_WIDTH}x${WALL_HEIGHT} at midpoint, direction=${wallDirection}, ${wallPositions.length} blocks`,
    );

    episodeInstance._evalMetadata = {
      wall_width: WALL_WIDTH,
      wall_height: WALL_HEIGHT,
      builder_bot: isBuilder ? bot.username : otherName,
      walk_direction: walkDirSign,
      block_type: BLOCK_TYPE,
    };

    // ---- Phase 4: Builder builds the wall ----
    if (isBuilder) {
      console.log(`[${bot.username}] Building wall...`);
      await buildStructure(
        bot,
        wallPositions,
        BLOCK_TYPE,
        PLACEMENT_STANDOFF_BLOCKS,
        ADJACENT_GOAL_RADIUS,
        args,
      );
      console.log(`[${bot.username}] Wall built`);
    } else {
      // Observer waits while wall is being built
      console.log(`[${bot.username}] Waiting for wall to be built...`);
      const estimatedBuildTicks = wallPositions.length * 15;
      await bot.waitForTicks(estimatedBuildTicks);
    }

    // ---- Phase 5: Sync after building ----
    coordinator.onceEvent(
      "wallBuiltWalkPhase",
      episodeNum,
      async (otherPos) => {
        coordinator.sendToOtherBot(
          "wallBuiltWalkPhase",
          bot.entity.position.clone(),
          episodeNum,
          "wallBuiltWalkPhase ack",
        );

        // ---- Phase 6: Both walk past the wall's end ----
        // Compute walk target: past the wall end in the walk direction
        let walkTargetX, walkTargetZ;
        if (useXAxis) {
          // Wall runs along X, walk along X to get past it
          const wallEndX =
            walkDirSign > 0
              ? wallStartPos.x + WALL_WIDTH + WALK_PAST_DISTANCE
              : wallStartPos.x - WALK_PAST_DISTANCE;
          walkTargetX = wallEndX;
          walkTargetZ = me.z; // Stay on our side (Z stays the same)
        } else {
          // Wall runs along Z, walk along Z to get past it
          const wallEndZ =
            walkDirSign > 0
              ? wallStartPos.z + WALL_WIDTH + WALK_PAST_DISTANCE
              : wallStartPos.z - WALK_PAST_DISTANCE;
          walkTargetX = me.x; // Stay on our side
          walkTargetZ = wallEndZ;
        }

        console.log(
          `[${bot.username}] Walking past wall to (${walkTargetX.toFixed(1)}, ${walkTargetZ.toFixed(1)})`,
        );

        try {
          initializePathfinder(bot, {
            allowSprinting: false,
            allowParkour: true,
            canDig: false,
            allowEntityDetection: true,
          });

          const walkGoal = new GoalNear(
            walkTargetX,
            bot.entity.position.y,
            walkTargetZ,
            1.5,
          );
          await gotoWithTimeout(bot, walkGoal, { timeoutMs: 15000 });
          console.log(`[${bot.username}] Reached walk target`);
        } catch (walkError) {
          console.log(
            `[${bot.username}] Walk error: ${walkError.message}`,
          );
        } finally {
          stopPathfinder(bot);
        }

        // ---- Phase 7: Look at each other ----
        const otherEntity = bot.players[otherName]?.entity;
        if (otherEntity) {
          console.log(
            `[${bot.username}] Looking at ${otherName} after walking past wall`,
          );
          await lookAtSmooth(
            bot,
            otherEntity.position,
            CAMERA_SPEED_DEGREES_PER_SEC,
            { randomized: false, useEasing: false },
          );
        }

        // ---- Phase 8: Ensure minimum ticks ----
        const endTick = bot.time.age;
        const elapsed = endTick - startTick;
        const remaining = EPISODE_MIN_TICKS - elapsed;
        if (remaining > 0) {
          console.log(
            `[${bot.username}] Waiting ${remaining} ticks to reach ${EPISODE_MIN_TICKS}`,
          );
          await bot.waitForTicks(remaining);
        }

        // ---- Phase 9: Stop phase ----
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
          "wallWalkPhase end",
        );
      },
    );

    coordinator.sendToOtherBot(
      "wallBuiltWalkPhase",
      bot.entity.position.clone(),
      episodeNum,
      "wall building done",
    );
  };
}

class WallWalkEvalEpisode extends BaseEpisode {
  static INIT_MIN_BOTS_DISTANCE = 10;
  static INIT_MAX_BOTS_DISTANCE = 12;
  static WORKS_IN_NON_FLAT_WORLD = true;

  async setupEpisode(
    bot,
    rcon,
    sharedBotRng,
    coordinator,
    episodeNum,
    args,
    botPosition,
    otherBotPosition,
  ) {
    await ensureBotHasEnough(bot, rcon, BLOCK_TYPE, 64);
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
    args,
  ) {
    coordinator.onceEvent(
      "wallWalkPhase",
      episodeNum,
      getOnWallWalkPhaseFn(
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
      "wallWalkPhase",
      bot.entity.position.clone(),
      episodeNum,
      "teleportPhase end",
    );
  }
}

module.exports = {
  getOnWallWalkPhaseFn,
  WallWalkEvalEpisode,
};
