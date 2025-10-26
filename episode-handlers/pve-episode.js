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
    return true;
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

/**
 * Guard-based combat system for PvE fighting
 * @param {any} bot - The bot instance
 * @param {Vec3} guardPosition - The position to guard
 * @param {Vec3} otherBotGuardPosition - The other bot's guard position to look at
 * @param {number} maxCombatTime - Maximum time for combat in milliseconds
 * @returns {Promise} Promise that resolves when combat is complete
 */
async function guardAndFight(
  bot,
  guardPosition,
  otherBotGuardPosition,
  maxCombatTime = 120000
) {
  const mcData = require("minecraft-data")(bot.version);
  const { Movements, GoalNear } = require("../utils/bot-factory");

  let guardPos = guardPosition;
  let movingToGuardPos = false;
  let combatActive = true;
  const startTime = Date.now();

  // Pathfinder to the guard position
  async function moveToGuardPos() {
    if (movingToGuardPos) return;

    console.log(`[${bot.username}] Moving to guard position`);
    bot.pathfinder.setMovements(new Movements(bot, mcData));

    movingToGuardPos = true;
    await bot.pathfinder.goto(
      new GoalNear(guardPos.x, guardPos.y, guardPos.z, 2)
    );
    movingToGuardPos = false;
    console.log(`[${bot.username}] Reached guard position`);

    // Look at other bot's guard position when at own guard position
    await lookAtSmooth(
      bot,
      otherBotGuardPosition,
      CAMERA_SPEED_DEGREES_PER_SEC
    );
  }

  // Handler for when bot stops attacking (enemy is dead)
  const onStoppedAttacking = async () => {
    if (combatActive) {
      console.log(
        `[${bot.username}] Enemy defeated, returning to guard position`
      );
      await moveToGuardPos();
    }
  };

  // Main combat loop - check for enemies on physics tick
  const onPhysicsTick = async () => {
    if (!combatActive) return;
    if (!guardPos) return;

    // Check timeout
    if (Date.now() - startTime > maxCombatTime) {
      combatActive = false;
      return;
    }

    let entity = null;

    // Only look for mobs if bot is close to guard position
    if (bot.entity.position.distanceTo(guardPos) < 16) {
      // Look for hostile mobs within 10 blocks
      const filter = (e) => {
        return (
          e.name === "zombie" &&
          e.position.distanceTo(bot.entity.position) < 10 &&
          e.displayName !== "Armor Stand"
        );
      };
      entity = bot.nearestEntity(filter);
    }

    if (entity != null && !movingToGuardPos) {
      // Found an enemy and not moving back - attack!
      if (!bot.pvp.target || bot.pvp.target.id !== entity.id) {
        console.log(
          `[${bot.username}] Engaging enemy: ${
            entity.name
          } at distance ${entity.position
            .distanceTo(bot.entity.position)
            .toFixed(1)}`
        );
        bot.pvp.attack(entity);
      }
    } else {
      // No enemy or moving back to guard position
      if (bot.entity.position.distanceTo(guardPos) < 2) {
        // Already at guard position, just look at other bot's position
        if (otherBotGuardPosition && !bot.pvp.target) {
          await lookAtSmooth(
            bot,
            otherBotGuardPosition,
            CAMERA_SPEED_DEGREES_PER_SEC
          );
        }
        return;
      }

      // Too far from guard position - stop combat and return
      if (bot.pvp.target) {
        await bot.pvp.stop();
      }
      await moveToGuardPos();
    }
  };

  // Register event handlers
  bot.on("stoppedAttacking", onStoppedAttacking);
  bot.on("physicsTick", onPhysicsTick);

  // First move to guard position
  await moveToGuardPos();

  // Wait for combat to complete (either all enemies dead or timeout)
  await new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      // Check if no more zombies nearby
      const filter = (e) =>
        e.name === "zombie" && e.position.distanceTo(bot.entity.position) < 20;
      const nearbyZombies = Object.values(bot.entities).filter(filter);

      if (nearbyZombies.length === 0 || !combatActive) {
        clearInterval(checkInterval);
        resolve(undefined);
      }
    }, 1000);
  });

  // Cleanup
  combatActive = false;
  bot.removeListener("stoppedAttacking", onStoppedAttacking);
  bot.removeListener("physicsTick", onPhysicsTick);

  // Stop any ongoing combat
  if (bot.pvp.target) {
    await bot.pvp.stop();
  }

  // Final move to guard position
  await moveToGuardPos();

  console.log(`[${bot.username}] Guard and fight phase complete`);
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
      phaseDataOther.guardPosition,
      CAMERA_SPEED_DEGREES_PER_SEC
    );
    await sleep(
      LOCK_EYE_DURATION_MIN +
        sharedBotRng() * (LOCK_EYE_DURATION_MAX - LOCK_EYE_DURATION_MIN)
    );
    let mob = null;
    const distToOther = horizontalDistanceTo(
      bot.entity.position,
      phaseDataOther.position
    );
    const mobDist = distToOther / 4;

    await spawnWithRconAround(bot, rcon, {
      mob: "minecraft:zombie",
      count: 1,
      maxRadius: mobDist,
    });
    let retries = 5;
    while (!mob && retries > 0) {
      await sleep(1000);
      mob = getNearestHostile(bot, mobDist);
      retries--;
    }
    if (!mob) {
      throw new Error(
        `[${bot.username}] Could not find hostile mob after spawning and waiting.`
      );
    }
    const nextPhaseDataOur = {
      guardPosition: phaseDataOther.guardPosition,
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

    console.log(
      `[${
        bot.username
      }] iteration ${iterationID} starting PvE, health=${bot.health.toFixed(
        1
      )}/20 food=${bot.food}`
    );

    // Use guard-based combat: guard our position and look at other bot's position
    const ourGuardPosition = phaseDataOur.guardPosition;
    const otherGuardPosition = phaseDataOther.guardPosition;

    await guardAndFight(bot, ourGuardPosition, otherGuardPosition);

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
    const resistEffectRes = await rcon.send(
      `effect give ${bot.username} minecraft:resistance 999999 255 true`
    );
    console.log(`[${bot.username}] resistEffectRes=${resistEffectRes}`);
    // Kill all hostile mobs (not just zombies). List from Minecraft 1.20.4.
    // Hostile mobs (not every possible hostile mob, but all vanilla main ones)
    // const hostileTypes = [
    //   "minecraft:zombie",
    //   "minecraft:skeleton",
    //   "minecraft:creeper",
    //   "minecraft:spider",
    //   "minecraft:enderman",
    //   "minecraft:wither_skeleton",
    //   "minecraft:stray",
    //   "minecraft:husk",
    //   "minecraft:pillager",
    //   "minecraft:vindicator",
    //   "minecraft:evoker",
    //   "minecraft:illusioner",
    //   "minecraft:witch",
    //   "minecraft:drowned",
    //   "minecraft:phantom",
    //   "minecraft:zombified_piglin",
    //   "minecraft:blaze",
    //   "minecraft:cave_spider",
    //   "minecraft:magma_cube",
    //   "minecraft:slime",
    //   "minecraft:silverfish",
    //   "minecraft:shulker",
    //   "minecraft:endermite",
    //   "minecraft:guardian",
    //   "minecraft:elder_guardian",
    //   "minecraft:vex",
    //   "minecraft:ravager",
    //   "minecraft:warden",
    //   "minecraft:piglin_brute",
    //   "minecraft:hoglin",
    //   "minecraft:zoglin",
    // ];
    // let killHostileRes = [];
    // for (const mobType of hostileTypes) {
    //   const res = await rcon.send(`kill @e[type=${mobType}]`);
    //   killHostileRes.push(`${mobType}: ${res}`);
    // }
    // const killZombieRes = killHostileRes.join("; ");
    // console.log(`[${bot.username}] killZombieRes=${killZombieRes}`);
    // await sleep(1000);
    const iterationID = 0;
    const nextPhaseDataOur = {
      guardPosition: bot.entity.position.clone(),
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
