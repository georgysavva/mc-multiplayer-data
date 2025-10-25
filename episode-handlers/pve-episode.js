const { decidePrimaryBot } = require("../utils/coordination");
const {
  lookAtSmooth,
  sleep,
  land_pos,
  horizontalDistanceTo,
} = require("../utils/movement");

const CAMERA_SPEED_DEGREES_PER_SEC = 30;

const ITERATIONS_NUM_PER_EPISODE = 1;
const VIEW_DISTANCE = 16;
const LOCK_EYE_DURATION_MIN = 1000;
const LOCK_EYE_DURATION_MAX = 3000;
const FOV_DEGREES = 90; // total FOV in front of the bot

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
  fovDegrees = FOV_DEGREES
) {
  return (e) => {
    if (!e || e.name !== "zombie") return false;

    const dist = e.position.distanceTo(bot.entity.position);
    if (dist >= maxDistance) return false;

    // Check if mob is in the bot's forward FOV
    return isInForwardFOV(bot, e.position, fovDegrees);
  };
}

/**
 * Get the nearest hostile mob within the bot's FOV.
 * @param {any} bot - The bot instance
 * @param {number} maxDistance - Maximum distance to search (default VIEW_DISTANCE)
 * @returns {any} The nearest hostile mob or undefined
 */
function getNearestHostile(bot, maxDistance = VIEW_DISTANCE) {
  const mob = bot.nearestEntity(isHostileMobFilter(bot, maxDistance));

  if (!mob) {
    console.log(
      `[${bot.username}] No hostile mob in FOV within ${maxDistance.toFixed(
        1
      )} blocks.`
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
async function attackUntilStopped(bot, target, options) {
  return new Promise((resolve, reject) => {
    const onStopped = (reason) => {
      cleanup();
      resolve(reason);
    };
    const cleanup = () => {
      bot.off("stoppedAttacking", onStopped);
    };
    bot.on("stoppedAttacking", onStopped);
    bot.pvp.attack(target, options);
  });
}
function getOnPVESetupPhaseFn(
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
      `pvePhase_setup_${iterationID}`,
      phaseDataOur,
      `pvePhase_setup_${iterationID} beginning`
    );
    await lookAtSmooth(
      bot,
      phaseDataOther.position,
      CAMERA_SPEED_DEGREES_PER_SEC
    );
    await sleep(
      LOCK_EYE_DURATION_MIN +
        sharedBotRng() * (LOCK_EYE_DURATION_MAX - LOCK_EYE_DURATION_MIN)
    );
    let mob = null;
    const isPrimaryBot = decidePrimaryBot(bot, sharedBotRng, args);
    if (isPrimaryBot) {
      console.log(
        `[${bot.username}] iteration ${iterationID} Primary bot, getting nearest hostile`
      );
      const distToOther = horizontalDistanceTo(
        bot.entity.position,
        phaseDataOther.position
      );
      const halfDist = distToOther / 2;

      mob = getNearestHostile(bot, halfDist);
      if (!mob) {
        await spawnWithRconAround(bot, rcon, {
          mob: "minecraft:zombie",
          count: 1,
          maxRadius: halfDist,
        });
        let retries = 5;
        while (!mob && retries > 0) {
          await sleep(1000);
          mob = getNearestHostile(bot, halfDist);
          retries--;
        }
        if (!mob) {
          throw new Error(
            `[${bot.username}] Could not find hostile mob after spawning and waiting.`
          );
        }
      }
    }
    const nextPhaseDataOur = {
      mobId: mob ? mob.id : null,
      isPrimaryBot,
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
      `pvePhase_setup_${iterationID} end`
    );
  };
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
    const mobId = phaseDataOur.isPrimaryBot
      ? phaseDataOur.mobId
      : phaseDataOther.mobId;
    console.log(`[${bot.username}] PVE fight phase: mobId=${mobId}`);

    let target = null;
    if (mobId !== null && mobId !== undefined) {
      // Wait briefly for the entity to be visible locally
      for (let i = 0; i < 20; i++) {
        target = bot.entities[mobId];
        if (target) break;
        await sleep(250);
      }
    }

    if (!target) {
      throw new Error(
        `[${
          bot.username
        }] iteration ${iterationID} Could not find PVE target with mobId=${mobId} after waiting. phaseDataOur=${JSON.stringify(
          phaseDataOur
        )}, phaseDataOther=${JSON.stringify(phaseDataOther)}`
      );
    }

    console.log(
      `[${
        bot.username
      }] iteration ${iterationID} starting PvE, health=${bot.health.toFixed(
        1
      )}/20 food=${bot.food}`
    );
    await attackUntilStopped(bot, target);
    // await sleep(10000);
    console.log(
      `[${
        bot.username
      }] iteration ${iterationID} finished PvE, health=${bot.health.toFixed(
        1
      )}/20 food=${bot.food}`
    );
    if (iterationID + 1 >= ITERATIONS_NUM_PER_EPISODE) {
      coordinator.onceEvent(
        "stopPhase",
        getOnStopPhaseFn(bot, sharedBotRng, coordinator, args.other_bot_name)
      );
      coordinator.sendToOtherBot(
        "stopPhase",
        bot.entity.position.clone(),
        `pvePhase_${iterationID} end`
      );
      return;
    }
    const nextPhaseDataOur = {
      position: bot.entity.position.clone(),
    };
    coordinator.onceEvent(
      `pvePhase_setup_${iterationID + 1}`,
      getOnPVESetupPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        iterationID + 1,
        episodeNum,
        getOnStopPhaseFn,
        args,
        nextPhaseDataOur
      )
    );
    coordinator.sendToOtherBot(
      `pvePhase_setup_${iterationID + 1}`,
      nextPhaseDataOur,
      `pvePhase_fight_${iterationID} end`
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
    const iterationID = 0;
    const nextPhaseDataOur = {
      position: bot.entity.position.clone(),
    };
    coordinator.onceEvent(
      `pvePhase_setup_${iterationID}`,
      getOnPVESetupPhaseFn(
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
      `pvePhase_setup_${iterationID}`,
      nextPhaseDataOur,
      `pvePhase end`
    );
    return;
  };
}
module.exports = {
  getOnPVEPhaseFn,
};
