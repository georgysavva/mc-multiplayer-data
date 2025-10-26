const { decidePrimaryBot } = require("../utils/coordination");
const {
  lookAtSmooth,
  sleep,
  land_pos,
  horizontalDistanceTo,
} = require("../utils/movement");

const { GoalNear, Movements } = require("../utils/bot-factory");
const { BaseEpisode } = require("./base-episode");

const CAMERA_SPEED_DEGREES_PER_SEC = 30;

const VIEW_DISTANCE = 16;
const LOCK_EYE_DURATION_MIN = 1000;
const LOCK_EYE_DURATION_MAX = 3000;
const FOV_DEGREES = 90; // total FOV in front of the bot
const MIN_MOBS = 2;
const MAX_MOBS = 5;

/**
 * Check if a position is within the bot's forward-facing FOV cone.
 * @param {any} bot - The bot instance
 * @param {any} targetPos - The target position (Vec3)
 * @param {number} fovDegrees - Field of view in degrees (default 90)
 * @returns {boolean} True if the target is in the bot's FOV
 */
function isInForwardFOV(bot, targetPos, fovDegrees = FOV_DEGREES) {
  const botPos = bot.entity.position;
  const yaw = bot.entity.yaw;

  // Calculate forward direction vector
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);

  // Calculate direction to target
  const dx = targetPos.x - botPos.x;
  const dz = targetPos.z - botPos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist === 0) return true; // Target is at bot position

  // Normalize direction to target
  const targetDirX = dx / dist;
  const targetDirZ = dz / dist;

  // Calculate dot product (cosine of angle between vectors)
  const dotProduct = forwardX * targetDirX + forwardZ * targetDirZ;

  // Calculate the angle threshold
  const fovRadians = (fovDegrees * Math.PI) / 180;
  const angleThreshold = Math.cos(fovRadians / 2);

  return dotProduct >= angleThreshold;
}
/**
 * @typedef {Object} SpawnOptions
 * @property {string=} mob
 * @property {number=} count
 * @property {number=} maxRadius
 */
/**
 * Spawn mobs around the bot within its forward-facing FOV.
 * @param {any} bot
 * @param {any} rcon
 * @param {SpawnOptions=} options
 */
async function spawnWithRconAround(
  bot,
  rcon,
  { mob = "minecraft:zombie", count = 8, maxRadius: maxRadiusOpt } = {}
) {
  const { x, y, z } = bot.entity.position;

  // Make sure the world will actually keep hostiles:
  await rcon.send("difficulty easy"); // or hard
  // If you want hard night spawns:
  // await rcon.send('time set midnight');
  // await rcon.send('weather thunder');

  const baseX = Math.floor(x),
    baseZ = Math.floor(z);
  const yaw = bot.entity.yaw;
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const fovRadians = (FOV_DEGREES * Math.PI) / 180;
  const minRadius = 2;
  const maxRadius = Math.max(minRadius + 1, maxRadiusOpt ?? VIEW_DISTANCE);
  const cmds = [];
  for (let i = 0; i < count; i++) {
    // Pick a random direction within the forward FOV cone
    const angleOffset = (Math.random() - 0.5) * fovRadians;
    const cosA = Math.cos(angleOffset);
    const sinA = Math.sin(angleOffset);
    const dirX = forwardX * cosA - forwardZ * sinA;
    const dirZ = forwardX * sinA + forwardZ * cosA;

    // Pick a random distance biased outward
    const r = Math.sqrt(Math.random()) * (maxRadius - minRadius) + minRadius;
    const dx = Math.round(dirX * r);
    const dz = Math.round(dirZ * r);

    // Find a safe land position, falling back to flat Y if chunk is unloaded
    const posCandidate = land_pos(bot, baseX + dx, baseZ + dz);
    const spawnX = posCandidate ? posCandidate.x : baseX + dx;
    const spawnZ = posCandidate ? posCandidate.z : baseZ + dz;
    const spawnY = posCandidate ? posCandidate.y + 1 : y;

    cmds.push(`summon ${mob} ${spawnX} ${spawnY} ${spawnZ}`);
  }

  for (const cmd of cmds) {
    const res = await rcon.send(cmd);
    console.log(`[${bot.username}] Spawned mob: ${cmd} with response: ${res}`);
  }
}

/**
 * Create a filter function for hostile mobs within FOV and distance.
 * @param {any} bot - The bot instance
 * @param {number} maxDistance - Maximum distance to search (default VIEW_DISTANCE)
 * @param {number} fovDegrees - Field of view in degrees (default FOV_DEGREES)
 * @returns {function} Filter function for entities
 */
function isHostileMobFilter(
  bot,
  maxDistance = VIEW_DISTANCE,
  checkFOV = false
) {
  return (e) => {
    if (!e || e.name !== "zombie") return false;

    const dist = e.position.distanceTo(bot.entity.position);
    if (dist >= maxDistance) return false;
    if (checkFOV && !isInForwardFOV(bot, e.position)) return false;
    return true;
  };
}

/**
 * Get the nearest hostile mob within the bot's FOV.
 * @param {any} bot - The bot instance
 * @param {number} maxDistance - Maximum distance to search (default VIEW_DISTANCE)
 * @returns {any} The nearest hostile mob or undefined
 */
function getNearestHostile(bot, maxDistance = VIEW_DISTANCE, checkFOV = false) {
  const mob = bot.nearestEntity(isHostileMobFilter(bot, maxDistance, checkFOV));

  if (!mob) {
    console.log(
      `[${bot.username}] No hostile mob ${
        checkFOV ? "in FOV" : ""
      } within ${maxDistance.toFixed(1)} blocks.`
    );
    return;
  }
  const dist = bot.entity.position.distanceTo(mob.position).toFixed(1);
  const msg =
    `[${bot.username}] Nearest hostile: name=${mob.name}, type=${mob.type}, displayName=${mob.displayName} @ ${dist} blocks ` +
    `pos(${mob.position.x.toFixed(1)},${mob.position.y.toFixed(
      1
    )},${mob.position.z.toFixed(1)})`;
  console.log(msg);
  return mob;
}

/**
 * Guard-based combat system for PvE fighting
 * @param {any} bot - The bot instance
 * @param {any} guardPosition - The position to guard
 * @param {any} otherBotGuardPosition - The other bot's guard position to look at
 * @returns {Promise} Promise that resolves when combat is complete
 */
async function guardAndFight(bot, guardPosition, otherBotGuardPosition) {
  const MELEE_RANGE = 3.5;

  // Ensure we're not currently pathfinding/combat from a previous step
  await bot.pvp.stop();
  bot.pathfinder.setGoal(null);

  // Wait for a hostile mob to come within melee distance
  let target;
  while (true) {
    await sleep(200);
    target = getNearestHostile(bot, MELEE_RANGE);
    if (!target) {
      console.log(
        `[${
          bot.username
        }] nothing to guard no hostile mob in ${MELEE_RANGE.toFixed(1)} blocks.`
      );
      continue;
    }
    break;
  }
  console.log(`[${bot.username}] Target found: ${target.name}`);

  // Engage using mineflayer-pvp
  bot.pvp.attack(target);

  // Wait until the target is defeated (despawned/dead)
  while (true) {
    await sleep(200);
    const still = bot.entities[target.id];
    if (!still || !still.isValid) break;
  }
  console.log(`[${bot.username}] Target defeated.`);

  // Stop combat if still active
  console.log(`[${bot.username}] Stopping combat.`);
  await bot.pvp.stop();

  const goal = new GoalNear(
    guardPosition.x,
    guardPosition.y,
    guardPosition.z,
    1
  );
  const mcData = require("minecraft-data")(bot.version);
  bot.pathfinder.setMovements(new Movements(bot, mcData));
  let reached = false;
  for (let attempt = 0; attempt < 2 && !reached; attempt++) {
    try {
      await bot.pathfinder.goto(goal);
      reached = true;
    } catch (err) {
      const msg = String(err?.message || err || "");
      console.log(
        `[${bot.username}] goto to guard failed (attempt ${
          attempt + 1
        }): ${msg}`
      );
      // Ignore PathStopped and retry once after clearing goal
      bot.pathfinder.setGoal(null);
      await sleep(200);
    }
  }
  // If still not at guard, just continue (avoid crashing the episode)

  // Look at the other bot's guard position for a random lock-eye interval
  await lookAtSmooth(bot, otherBotGuardPosition, CAMERA_SPEED_DEGREES_PER_SEC);
  await sleep(
    LOCK_EYE_DURATION_MIN +
      Math.random() * (LOCK_EYE_DURATION_MAX - LOCK_EYE_DURATION_MIN)
  );
}

function getOnPVEFightPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  iterationID,
  episodeNum,
  getOnStopPhaseFn,
  args,
  phaseDataOur
) {
  return async (phaseDataOther) => {
    coordinator.sendToOtherBot(
      `pvePhase_fight_${iterationID}`,
      phaseDataOur,
      `pvePhase_fight_${iterationID} beginning`
    );
    let mob = null;
    const distToOther = horizontalDistanceTo(
      phaseDataOur.guardPosition,
      phaseDataOther.guardPosition
    );
    const mobDist = distToOther / 4;

    // Use guard-based combat: guard our position and look at other bot's position
    const ourGuardPosition = phaseDataOur.guardPosition;
    const otherGuardPosition = phaseDataOther.guardPosition;
    const numMobs =
      Math.floor(sharedBotRng() * (MAX_MOBS - MIN_MOBS + 1)) + MIN_MOBS;
    for (let mobI = 0; mobI < numMobs; mobI++) {
      const mobInFov = getNearestHostile(bot, mobDist, true);
      if (!mobInFov) {
        console.log(
          `[${bot.username}] No mob in FOV, Spawning mob ${mobI} in FOV.`
        );
        await spawnWithRconAround(bot, rcon, {
          mob: "minecraft:zombie",
          count: 1,
          maxRadius: mobDist,
        });
      }
      let retries = 5;
      while (!mob && retries > 0) {
        await sleep(1000);
        mob = getNearestHostile(bot, mobDist);
        retries--;
      }
      if (!mob) {
        throw new Error(
          `[${bot.username}] Could not find hostile mob ${mobI} after spawning and waiting.`
        );
      }
      console.log(
        `[${
          bot.username
        }] iteration ${iterationID} mob ${mobI} starting PvE, health=${bot.health.toFixed(
          1
        )}/20 food=${bot.food}`
      );

      await guardAndFight(bot, ourGuardPosition, otherGuardPosition);

      console.log(
        `[${
          bot.username
        }] iteration ${iterationID} mob ${mobI} finished PvE, health=${bot.health.toFixed(
          1
        )}/20 food=${bot.food}`
      );
    }
    coordinator.onceEvent(
      "stopPhase",
      getOnStopPhaseFn(bot, sharedBotRng, coordinator, args.other_bot_name)
    );
    coordinator.sendToOtherBot(
      "stopPhase",
      bot.entity.position.clone(),
      `pvePhase_${iterationID} end`
    );
  };
}
function getOnPVEPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  episodeNum,
  getOnStopPhaseFn,
  args
) {
  return async (phaseDataOther) => {
    coordinator.sendToOtherBot(
      `pvePhase`,
      { position: bot.entity.position.clone() },
      `pvePhase beginning`
    );

    // Give bot a random sword
    const swords = [
      "minecraft:wooden_sword",
      "minecraft:stone_sword",
      "minecraft:iron_sword",
      "minecraft:golden_sword",
      "minecraft:diamond_sword",
      "minecraft:netherite_sword",
    ];
    const randomSword = swords[Math.floor(Math.random() * swords.length)];
    const giveSwordRes = await rcon.send(
      `give ${bot.username} ${randomSword} 1`
    );
    console.log(
      `[${bot.username}] Gave random sword: ${randomSword}, response=${giveSwordRes}`
    );

    // Wait for the item to be added to inventory
    await sleep(500);

    // Find and equip the sword
    const swordName = randomSword.split(":")[1]; // e.g., "diamond_sword"
    const swordItem = bot.inventory
      .items()
      .find((item) => item.name === swordName);
    if (swordItem) {
      await bot.equip(swordItem, "hand");
      console.log(`[${bot.username}] Equipped ${swordName} to hand`);
    } else {
      console.log(
        `[${bot.username}] Warning: Could not find ${swordName} in inventory to equip`
      );
    }

    const resistEffectRes = await rcon.send(
      `effect give ${bot.username} minecraft:resistance 999999 255 true`
    );
    console.log(`[${bot.username}] resistEffectRes=${resistEffectRes}`);
    const iterationID = 0;
    const nextPhaseDataOur = {
      guardPosition: bot.entity.position.clone(),
    };
    coordinator.onceEvent(
      `pvePhase_fight_${iterationID}`,
      getOnPVEFightPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        iterationID,
        episodeNum,
        getOnStopPhaseFn,
        args,
        nextPhaseDataOur
      )
    );
    coordinator.sendToOtherBot(
      `pvePhase_fight_${iterationID}`,
      nextPhaseDataOur,
      `pvePhase end`
    );
    return;
  };
}

class PveEpisode extends BaseEpisode {
  async setupEpisode(
    bot,
    rcon,
    sharedBotRng,
    coordinator,
    episodeNum,
    runId,
    args
  ) {
    // optional setup
  }

  async entryPoint(
    bot,
    rcon,
    sharedBotRng,
    coordinator,
    iterationID,
    episodeNum,
    getOnStopPhaseFn,
    args
  ) {
    coordinator.onceEvent(
      `pvePhase`,
      getOnPVEPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        episodeNum,
        getOnStopPhaseFn,
        args
      )
    );
    coordinator.sendToOtherBot(
      `pvePhase`,
      { position: bot.entity.position.clone() },
      "entryPoint end"
    );
  }

  async tearDownEpisode(
    bot,
    rcon,
    sharedBotRng,
    coordinator,
    episodeNum,
    runId,
    args
  ) {
    // optional teardown
  }
}

module.exports = {
  getOnPVEPhaseFn,
  PveEpisode,
};
