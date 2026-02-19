const { GoalNear } = require("mineflayer-pathfinder").goals;
const { Vec3 } = require("vec3");

const { placeMultiple } = require("../../primitives/building");
const { digBlock } = require("../../primitives/digging");
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
const WALL_WIDTH = 3;
const WALL_HEIGHT = 3;
const BLOCK_TYPE = "stone";
const WALL_DISTANCE = 2; // blocks in front of builder to place wall

function getOnWallBreakPhaseFn(
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
      "wallBreakPhase",
      bot.entity.position.clone(),
      episodeNum,
      "wallBreakPhase beginning",
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

    // Determine roles: builder and breaker alternate by episodeNum
    const builderIsAlpha = episodeNum % 2 === 0;
    const isAlpha = bot.username < otherName;
    const isBuilder = builderIsAlpha === isAlpha;
    const role = isBuilder ? "BUILDER" : "BREAKER";

    console.log(
      `[${bot.username}] Role: ${role} (builderIsAlpha=${builderIsAlpha})`,
    );

    // ---- Phase 1: Look at each other ----
    console.log(`[${bot.username}] Looking at ${otherName}`);
    await lookAtSmooth(bot, them, 90, { randomized: false, useEasing: false });

    // ---- Phase 2: Signal beginning ----
    console.log(`[${bot.username}] Sneaking to signal beginning`);
    await sneak(bot);
    const startTick = bot.time.age;

    // ---- Phase 3: Compute wall position near the builder ----
    const builderPos = isBuilder ? me : them;
    const observerPos = isBuilder ? them : me;

    // Direction from builder toward observer
    const dx = observerPos.x - builderPos.x;
    const dz = observerPos.z - builderPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;

    // Wall center: WALL_DISTANCE blocks in front of builder
    const wallCenterX = builderPos.x + (dx / dist) * WALL_DISTANCE;
    const wallCenterZ = builderPos.z + (dz / dist) * WALL_DISTANCE;

    // Perpendicular direction for wall extent (snap to cardinal)
    const perpX = -dz / dist;
    const perpZ = dx / dist;
    const useXAxis = Math.abs(perpX) >= Math.abs(perpZ);
    const wallDirection = useXAxis ? "x" : "z";

    // Wall start position: center the wall at the computed position
    const halfWidth = Math.floor(WALL_WIDTH / 2);
    let wallStartPos;
    if (useXAxis) {
      wallStartPos = new Vec3(
        Math.floor(wallCenterX) - halfWidth,
        Math.floor(builderPos.y),
        Math.floor(wallCenterZ),
      );
    } else {
      wallStartPos = new Vec3(
        Math.floor(wallCenterX),
        Math.floor(builderPos.y),
        Math.floor(wallCenterZ) - halfWidth,
      );
    }

    const wallPositions = generateWallPositions(
      wallStartPos,
      WALL_WIDTH,
      WALL_HEIGHT,
      wallDirection,
    );

    console.log(
      `[${bot.username}] Wall: ${WALL_WIDTH}x${WALL_HEIGHT} near builder, direction=${wallDirection}, ${wallPositions.length} blocks`,
    );

    episodeInstance._evalMetadata = {
      wall_width: WALL_WIDTH,
      wall_height: WALL_HEIGHT,
      builder_bot: isBuilder ? bot.username : otherName,
      breaker_bot: isBuilder ? otherName : bot.username,
      block_type: BLOCK_TYPE,
    };

    // ---- Phase 4: Builder places wall without moving, breaker waits ----
    if (isBuilder) {
      console.log(`[${bot.username}] Placing wall (staying still)...`);
      await placeMultiple(bot, wallPositions, BLOCK_TYPE, {
        delayMs: 300,
        useBuildOrder: true,
        useSmartPositioning: false,
      });
      console.log(`[${bot.username}] Wall placed`);

      // Look back at the other bot through the wall
      const otherEntity = bot.players[otherName]?.entity;
      if (otherEntity) {
        await lookAtSmooth(bot, otherEntity.position, 90, {
          randomized: false,
          useEasing: false,
        });
      }
    } else {
      // Breaker waits while wall is being built
      console.log(`[${bot.username}] Waiting for wall to be placed...`);
      const estimatedBuildTicks = wallPositions.length * 15;
      await bot.waitForTicks(estimatedBuildTicks);
    }

    // ---- Phase 5: Sync after building ----
    coordinator.onceEvent(
      "wallBuiltPhase",
      episodeNum,
      async (otherPos) => {
        coordinator.sendToOtherBot(
          "wallBuiltPhase",
          bot.entity.position.clone(),
          episodeNum,
          "wallBuiltPhase ack",
        );

        // ---- Phase 6: Breaker breaks the wall ----
        if (!isBuilder) {
          console.log(`[${bot.username}] Breaking wall...`);

          initializePathfinder(bot, {
            allowSprinting: false,
            allowParkour: true,
            canDig: false,
            allowEntityDetection: true,
          });

          // Break blocks from top to bottom for stability
          const sortedPositions = [...wallPositions].sort(
            (a, b) => b.y - a.y || a.x - b.x || a.z - b.z,
          );

          for (const pos of sortedPositions) {
            try {
              // Walk close to block if out of reach
              const blockCenter = pos.offset(0.5, 0.5, 0.5);
              const dist = bot.entity.position.distanceTo(blockCenter);
              if (dist > 4.0) {
                const goal = new GoalNear(pos.x, pos.y, pos.z, 3);
                await gotoWithTimeout(bot, goal, { timeoutMs: 10000 });
              }

              console.log(
                `[${bot.username}] Breaking block at (${pos.x}, ${pos.y}, ${pos.z})`,
              );
              await digBlock(bot, pos);
              await bot.waitForTicks(2);
            } catch (breakError) {
              console.log(
                `[${bot.username}] Error breaking block at (${pos.x}, ${pos.y}, ${pos.z}): ${breakError.message}`,
              );
            }
          }
          stopPathfinder(bot);
          console.log(`[${bot.username}] Wall broken`);
        } else {
          // Builder watches breaker
          console.log(`[${bot.username}] Watching wall being broken...`);
          const estimatedBreakTicks = wallPositions.length * 15;
          await bot.waitForTicks(estimatedBreakTicks);
        }

        // ---- Phase 7: Look at each other after wall is gone ----
        const otherEntity = bot.players[otherName]?.entity;
        if (otherEntity) {
          console.log(
            `[${bot.username}] Looking at ${otherName} after wall break`,
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
          "wallBreakPhase end",
        );
      },
    );

    coordinator.sendToOtherBot(
      "wallBuiltPhase",
      bot.entity.position.clone(),
      episodeNum,
      "wall building done",
    );
  };
}

class WallBreakEvalEpisode extends BaseEpisode {
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
    // Both bots get stone (builder needs it) and diamond_pickaxe (breaker needs it)
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
      "wallBreakPhase",
      episodeNum,
      getOnWallBreakPhaseFn(
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
      "wallBreakPhase",
      bot.entity.position.clone(),
      episodeNum,
      "teleportPhase end",
    );
  }
}

module.exports = {
  getOnWallBreakPhaseFn,
  WallBreakEvalEpisode,
};
