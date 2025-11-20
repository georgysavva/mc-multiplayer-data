const Vec3 = require("vec3").Vec3;
const { Movements, GoalFollow, GoalNear } = require("../utils/bot-factory");
const { equipSword, giveRandomSword } = require("../utils/fighting");
const { unequipHand } = require("../utils/items");
const {
  stopAll,
  lookAtBot,
  sleep,
  initializePathfinder,
  stopPathfinder,
} = require("../utils/movement");
const Rcon = require("rcon-client").Rcon;
const { BaseEpisode } = require("./base-episode");

// Constants for PVP behavior
const PVP_DURATION_MS_MIN = 10000; // 5 seconds of combat
const PVP_DURATION_MS_MAX = 15000; // 15 seconds of combat
const ATTACK_COOLDOWN_MS = 500; // 0.5s between attacks
const MELEE_RANGE = 3; // Attack range in blocks
const APPROACH_DISTANCE = 2; // Pathfinder target distance
const COMBAT_LOOP_INTERVAL_MS = 100; // Combat loop update rate
const MIN_SPAWN_DISTANCE = 8; // Minimum distance between bots at spawn
const MAX_SPAWN_DISTANCE = 15; // Maximum distance between bots at spawn
const INITIAL_EYE_CONTACT_MS = 500; // Initial look duration


/**
 * Main PVP combat loop
 * @param {Bot} bot - Mineflayer bot instance
 * @param {string} targetBotName - Name of target bot
 * @param {number} durationMs - Combat duration in milliseconds
 */
async function pvpCombatLoop(bot, targetBotName, durationMs) {
  console.log(
    `[${bot.username}] ⚔️ Starting PVP combat loop for ${durationMs / 1000}s`
  );

  // Initialize pathfinder for combat
  initializePathfinder(bot, {
    allowSprinting: true, // Sprint to close distance
    allowParkour: true, // Stable movement
    canDig: true, // No terrain modification
    allowEntityDetection: true,
  });

  console.log(`[${bot.username}] ✅ Pathfinder initialized for combat`);

  const startTime = Date.now();
  let lastAttackTime = 0;
  let totalAttacks = 0;
  let lastHealthLog = Date.now();

  try {
    while (Date.now() - startTime < durationMs) {
      // Get target entity using nearestEntity for more robust targeting
      const targetEntity = bot.nearestEntity((entity) => {
        // Find the specific target player by username
        return entity.type === "player" && entity.username === targetBotName;
      });

      if (!targetEntity) {
        console.log(`[${bot.username}] ⚠️ Cannot find target ${targetBotName}`);
        await sleep(COMBAT_LOOP_INTERVAL_MS);
        continue;
      }

      const distance = bot.entity.position.distanceTo(targetEntity.position);

      // Update pathfinder to follow target
      bot.pathfinder.setGoal(
        new GoalFollow(targetEntity, APPROACH_DISTANCE),
        true
      );

      // Look at target during combat (aim at head height)
      try {
        const targetHeadPos = targetEntity.position.offset(
          0,
          targetEntity.height,
          0
        );
        await bot.lookAt(targetHeadPos, true);
      } catch (lookError) {
        // Ignore look errors during combat
      }

      // Attack if in melee range and cooldown expired
      if (distance <= MELEE_RANGE) {
        const now = Date.now();
        if (now - lastAttackTime >= ATTACK_COOLDOWN_MS) {
          try {
            await bot.attack(targetEntity);
            totalAttacks++;
            lastAttackTime = now;
            console.log(
              `[${
                bot.username
              }] ⚔️ Attack #${totalAttacks} on ${targetBotName} (distance: ${distance.toFixed(
                2
              )} blocks)`
            );
          } catch (attackError) {
            console.log(
              `[${bot.username}] ⚠️ Attack failed: ${attackError.message}`
            );
          }
        }
      } else {
        // Log chase status occasionally
        if (Date.now() - lastHealthLog > 2000) {
          console.log(
            `[${
              bot.username
            }] 🏃 Chasing ${targetBotName} (distance: ${distance.toFixed(
              2
            )} blocks)`
          );
          lastHealthLog = Date.now();
        }
      }

      // Log health periodically
      if (Date.now() - lastHealthLog > 3000) {
        console.log(`[${bot.username}] ❤️ Health: ${bot.health}/20`);
        lastHealthLog = Date.now();
      }

      // Check if bot died (but continue episode)
      if (bot.health <= 0) {
        console.log(`[${bot.username}] 💀 Died in combat (continuing episode)`);
      }

      await sleep(COMBAT_LOOP_INTERVAL_MS);
    }
  } finally {
    // Clean up pathfinder
    stopPathfinder(bot);

    // Log combat statistics
    const duration = Date.now() - startTime;
    console.log(`[${bot.username}] 🏁 Combat complete! Stats:`);
    console.log(
      `[${bot.username}]    Duration: ${(duration / 1000).toFixed(1)}s`
    );
    console.log(`[${bot.username}]    Total attacks: ${totalAttacks}`);
    console.log(`[${bot.username}]    Final health: ${bot.health}/20`);
    console.log(
      `[${bot.username}]    Attacks per second: ${(
        totalAttacks /
        (duration / 1000)
      ).toFixed(2)}`
    );
  }
}

/**
 * Get PVP phase handler function
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Object} rcon - RCON connection
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} iterationID - Iteration ID
 * @param {number} episodeNum - Episode number
 * @param {Object} episodeInstance - Episode instance
 * @param {Object} args - Configuration arguments
 * @returns {Function} PVP phase handler
 */
function getOnPvpPhaseFn(
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
    const startTime = Date.now();
    console.log(
      `[${bot.username}] ⚔️ PVP EPISODE STARTING - Episode ${episodeNum}, Iteration ${iterationID}`
    );
    console.log(
      `[${bot.username}] 🕐 Episode start time: ${new Date(
        startTime
      ).toISOString()}`
    );

    coordinator.sendToOtherBot(
      `pvpPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `pvpPhase_${iterationID} beginning`
    );

    console.log(`[${bot.username}] 🚀 Starting PVP phase ${iterationID}`);

    // STEP 1: Bots spawn (already done by teleport phase)
    console.log(`[${bot.username}] ✅ STEP 1: Bot spawned`);

    // STEP 2: Both bots look at each other
    console.log(`[${bot.username}] 👀 STEP 2: Looking at other bot...`);
    try {
      await lookAtBot(bot, args.other_bot_name, 180);
      console.log(
        `[${bot.username}] ✅ Initial eye contact established with ${args.other_bot_name}`
      );
      await sleep(INITIAL_EYE_CONTACT_MS);
    } catch (lookError) {
      console.log(
        `[${bot.username}] ⚠️ Failed initial look: ${lookError.message}`
      );
    }

    // STEP 3: Get coordinates and check distance
    const myPosition = bot.entity.position.clone();
    const otherPosition = otherBotPosition;
    const initialDistance = myPosition.distanceTo(otherPosition);

    console.log(`[${bot.username}] 📍 STEP 3: Got coordinates`);
    console.log(
      `[${bot.username}]    My position: (${myPosition.x.toFixed(
        1
      )}, ${myPosition.y.toFixed(1)}, ${myPosition.z.toFixed(1)})`
    );
    console.log(
      `[${bot.username}]    ${
        args.other_bot_name
      } position: (${otherPosition.x.toFixed(1)}, ${otherPosition.y.toFixed(
        1
      )}, ${otherPosition.z.toFixed(1)})`
    );
    console.log(
      `[${bot.username}]    Distance: ${initialDistance.toFixed(2)} blocks`
    );

    // Check if spawn distance is appropriate
    if (initialDistance < MIN_SPAWN_DISTANCE) {
      console.log(
        `[${bot.username}] ⚠️ Bots spawned too close (${initialDistance.toFixed(
          2
        )} < ${MIN_SPAWN_DISTANCE})`
      );
    } else if (initialDistance > MAX_SPAWN_DISTANCE) {
      console.log(
        `[${bot.username}] ⚠️ Bots spawned too far (${initialDistance.toFixed(
          2
        )} > ${MAX_SPAWN_DISTANCE})`
      );
    } else {
      console.log(`[${bot.username}] ✅ Spawn distance is appropriate`);
    }

    // STEP 4: Equip random sword
    console.log(`[${bot.username}] 🗡️ STEP 4: Equipping sword...`);
    const equippedSword = await equipSword(bot);

    if (!equippedSword) {
      console.log(`[${bot.username}] ❌ Failed to equip sword - aborting PVP`);
      throw new Error("Failed to equip sword, aborting PVP episode...");
    }

    await sleep(500); // Brief pause after equipping

    // STEP 5-7: Enter combat loop
    console.log(`[${bot.username}] ⚔️ STEP 5-7: Beginning PVP combat...`);
    const pvpDurationMS =
      PVP_DURATION_MS_MIN +
      Math.floor(
        sharedBotRng() * (PVP_DURATION_MS_MAX - PVP_DURATION_MS_MIN + 1)
      );
    await pvpCombatLoop(bot, args.other_bot_name, pvpDurationMS);

    // STEP 8: Episode ends
    console.log(`[${bot.username}] 🎬 STEP 8: PVP episode ending...`);

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`[${bot.username}] 🏁 PVP episode completed in ${duration}ms`);
    console.log(
      `[${bot.username}] 🕐 Episode end time: ${new Date(
        endTime
      ).toISOString()}`
    );

    // Transition to stop phase
    console.log(`[${bot.username}] 🔄 Transitioning to stop phase...`);
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
      `pvpPhase_${iterationID} end`
    );

    console.log(
      `[${bot.username}] ✅ PVP phase ${iterationID} transition complete`
    );
  };
}

/**
 * PvpEpisode - Episode class for player vs player combat
 */
class PvpEpisode extends BaseEpisode {
  static INIT_MIN_BOTS_DISTANCE = MIN_SPAWN_DISTANCE;
  static INIT_MAX_BOTS_DISTANCE = MAX_SPAWN_DISTANCE;
  static WORKS_IN_NON_FLAT_WORLD = true;

  async setupEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args) {
    // No setup needed - swords are equipped during the episode
    // Wait for the item to be added to inventory
    await giveRandomSword(bot, rcon);
    await sleep(500);
    await unequipHand(bot);
    await sleep(500);
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
      `pvpPhase_${iterationID}`,
      episodeNum,
      getOnPvpPhaseFn(
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
      `pvpPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      "entryPoint end"
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
  }
}

module.exports = {
  pvpCombatLoop,
  getOnPvpPhaseFn,
  PvpEpisode,
};
