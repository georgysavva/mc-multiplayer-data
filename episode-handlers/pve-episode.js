const { isPrimaryBot } = require("../utils/coordination");
const { lookAtSmooth, sleep } = require("../utils/movement");

const CAMERA_SPEED_DEGREES_PER_SEC = 30;

const ITERATIONS_NUM_PER_EPISODE = 5;
const VIEW_DISTANCE = 16;
async function spawnWithRconAround(
  bot,
  rcon,
  { mob = "minecraft:zombie", count = 8, yOffset = 0 } = {}
) {
  const { x, y, z } = bot.entity.position;

  // Make sure the world will actually keep hostiles:
  await rcon.send("difficulty easy"); // or hard
  // If you want hard night spawns:
  // await rcon.send('time set midnight');
  // await rcon.send('weather thunder');

  const baseX = Math.floor(x),
    baseY = Math.floor(y) + yOffset,
    baseZ = Math.floor(z);
  const cmds = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const r = Math.sqrt(Math.random()) * VIEW_DISTANCE;
    const dx = Math.round(Math.cos(angle) * r);
    const dz = Math.round(Math.sin(angle) * r);
    cmds.push(`summon ${mob} ${baseX + dx} ${baseY} ${baseZ + dz}`);
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
    console.log(
      `[${bot.username}] Looking at other bot at position: ${phaseDataOther}`
    );
    await lookAtSmooth(
      bot,
      phaseDataOther.position,
      CAMERA_SPEED_DEGREES_PER_SEC
    );
    await sleep(1000);
    let mob = null;
    if (isPrimaryBot(bot, args)) {
      console.log(`[${bot.username}] Primary bot, getting nearest hostile`);
      mob = getNearestHostile(bot);
      if (!mob) {
        await spawnWithRconAround(bot, rcon, {
          mob: "minecraft:zombie",
          count: 1,
          yOffset: 0,
        });
        while (!mob) {
          await sleep(1000);
          mob = getNearestHostile(bot);
        }
      }
    }
    const phaseDataOur = { mob: mob };
    const iterationID = 0;
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
        phaseDataOur
      )
    );
    coordinator.sendToOtherBot(
      `pvePhase_fight_${iterationID}`,
      phaseDataOur,
      `pvePhase end`
    );
    // coordinator.onceEvent(
    //   "stopPhase",
    //   getOnStopPhaseFn(bot, sharedBotRng, coordinator, args.other_bot_name)
    // );
    // coordinator.sendToOtherBot(
    //   "stopPhase",
    //   bot.entity.position.clone(),
    //   `pvePhase_${iterationID} end`
    // );
    return;
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
    const mob = isPrimaryBot(bot, args) ? phaseDataOur.mob : phaseDataOther.mob;
    console.log(`[${bot.username}] PVE fight phase: mob=${mob.name}`);
    bot.pvp.attack(mob);
    await sleep(10000);
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
module.exports = {
  getOnPVEPhaseFn,
};
