const { lookAtSmooth, sleep } = require("../utils/movement");

const CAMERA_SPEED_DEGREES_PER_SEC = 30;

const ITERATIONS_NUM_PER_EPISODE = 5;
async function spawnWithRconAround(
  bot,
  rcon,
  { mob = "minecraft:zombie", count = 8, radius = 6, yOffset = 0 } = {}
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
    const angle = (2 * Math.PI * i) / count;
    const dx = Math.round(Math.cos(angle) * radius);
    const dz = Math.round(Math.sin(angle) * radius);
    cmds.push(`summon ${mob} ${baseX + dx} ${baseY} ${baseZ + dz}`);
  }

  for (const cmd of cmds) {
    const res = await rcon.send(cmd);
    console.log(`[${bot.username}] Spawned mob: ${cmd} with response: ${res}`);
  }
}

function isHostileMob(e) {
  return e;
}

function getNearestHostile(bot) {
  return bot.nearestEntity(isHostileMob);
}

function reportNearestHostile(bot) {
  const mob = getNearestHostile(bot);
  if (!mob) {
    console.log(`[${bot.username}] No hostile mob in range.`);
    return;
  }
  const dist = bot.entity.position.distanceTo(mob.position).toFixed(1);
  const msg =
    `[${bot.username}] Nearest hostile: name=${mob.name}, type=${mob.type}, mobType=${mob.mobType} @ ${dist} blocks ` +
    `pos(${mob.position.x.toFixed(1)},${mob.position.y.toFixed(
      1
    )},${mob.position.z.toFixed(1)})`;
  console.log(msg);
  // also tell in chat (optional)
  try {
    bot.chat(msg);
  } catch {}
}

function getOnPVEPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  iterationID,
  episodeNum,
  getOnStopPhaseFn,
  args
) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      `pvePhase_${iterationID}`,
      bot.entity.position.clone(),
      `pvePhase_${iterationID} beginning`
    );
    await spawnWithRconAround(bot, rcon, {
      mob: "minecraft:zombie",
      count: 8,
      radius: 6,
      yOffset: 0,
    });

    // Report nearest hostile every 2 seconds for 50 seconds
    const intervalMs = 2000;
    const totalDurationMs = 50000;
    const numIntervals = Math.floor(totalDurationMs / intervalMs);
    for (let i = 0; i < numIntervals; i++) {
      reportNearestHostile(bot);
      await sleep(intervalMs);
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
    return;
  };
}
module.exports = {
  getOnPVEPhaseFn,
};
