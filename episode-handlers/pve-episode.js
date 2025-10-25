const { isPrimaryBot, decidePrimaryBot } = require("../utils/coordination");
const { lookAtSmooth, sleep, land_pos } = require("../utils/movement");

const CAMERA_SPEED_DEGREES_PER_SEC = 30;

const ITERATIONS_NUM_PER_EPISODE = 1;
const VIEW_DISTANCE = 16;
const LOCK_EYE_DURATION_MIN = 1000;
const LOCK_EYE_DURATION_MAX = 3000;
async function spawnWithRconAround(
  bot,
  rcon,
  { mob = "minecraft:zombie", count = 8 } = {}
) {
  const { x, y, z } = bot.entity.position;

  // Make sure the world will actually keep hostiles:
  await rcon.send("difficulty easy"); // or hard
  // If you want hard night spawns:
  // await rcon.send('time set midnight');
  // await rcon.send('weather thunder');

  const baseX = Math.floor(x),
    baseZ = Math.floor(z);
  const cmds = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const r = Math.sqrt(Math.random()) * VIEW_DISTANCE;
    const dx = Math.round(Math.cos(angle) * r);
    const dz = Math.round(Math.sin(angle) * r);
    const pos = land_pos(bot, baseX + dx, baseZ + dz);
    const posY = pos ? pos.y + 1 : y;
    cmds.push(`summon ${mob} ${pos.x} ${posY} ${pos.z}`);
  }

  for (const cmd of cmds) {
    const res = await rcon.send(cmd);
    console.log(`[${bot.username}] Spawned mob: ${cmd} with response: ${res}`);
  }
}

function isHostileMobFilter(bot) {
  return (e) =>
    e &&
    e.name === "zombie" &&
    e.position.distanceTo(bot.entity.position) < VIEW_DISTANCE;
}

function getNearestHostile(bot) {
  const mob = bot.nearestEntity(isHostileMobFilter(bot));

  if (!mob) {
    console.log(`[${bot.username}] No hostile mob in range.`);
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
      mob = getNearestHostile(bot);
      if (!mob) {
        await spawnWithRconAround(bot, rcon, {
          mob: "minecraft:zombie",
          count: 1,
        });
        while (!mob) {
          await sleep(1000);
          mob = getNearestHostile(bot);
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
    // await attackUntilStopped(bot, target);
    await sleep(10000);
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
