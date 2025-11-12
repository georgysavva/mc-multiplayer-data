const { BaseEpisode } = require("./base-episode");
const { GoalNear } = require("../utils/bot-factory");
const { lookAtSmooth } = require("../utils/movement");

class TurnToLookEpisode extends BaseEpisode {
  static WORKS_IN_NON_FLAT_WORLD = true;

  async entryPoint(bot, rcon, sharedBotRng, coordinator, iterationID, episodeNum, args) {
    const otherName = args.other_bot_name;
    const other = bot.players[otherName]?.entity;
    if (!other) {
      console.log(`[${bot.username}] Other bot missing, ending episode.`);
      return this.endEpisode();
    }

    const me = bot.entity.position;
    const them = other.position;
    const midX = (me.x + them.x) / 2;
    const midZ = (me.z + them.z) / 2;

    const dx = Math.abs(me.x - them.x);
    const dz = Math.abs(me.z - them.z);

    const isAlpha = bot.username < otherName;
    const offset = isAlpha ? 1 : -1;

    let targetX = midX;
    let targetZ = midZ;

    if (dx >= dz) {
      targetZ += offset * 1.2;
    } else {
      targetX += offset * 1.2;
    }

    console.log(`[${bot.username}] Moving to (${targetX.toFixed(2)}, ${targetZ.toFixed(2)})`);

    let radius = 1.2;
    let success = false;
    for (let attempt = 0; attempt < 5 && !success; attempt++) {
      try {
        await bot.pathfinder.goto(new GoalNear(targetX, me.y, targetZ, 1));
        success = true;
      } catch (_) {
        radius += 0.8;
        if (dx >= dz) targetZ = midZ + offset * radius;
        else targetX = midX + offset * radius;
        console.log(`[${bot.username}] Re-adjusting position radius → ${radius.toFixed(1)}`);
      }
    }

    const COMPASS = [
      { name: "north", x: 0, z: -1 },
      { name: "east", x: 1, z: 0 },
      { name: "south", x: 0, z: 1 },
      { name: "west", x: -1, z: 0 },
    ];

    const i = Math.floor(sharedBotRng() * COMPASS.length);
    const chosen = COMPASS[i];

    console.log(`[${bot.username}] Facing ${chosen.name}`);

    const pos = bot.entity.position.clone();
    const faceTarget = pos.offset(chosen.x, 0, chosen.z);
    await lookAtSmooth(bot, faceTarget, 60);

    await bot.waitForTicks(40); 
    this.endEpisode();
  }
}

module.exports = { TurnToLookEpisode };
