const mineflayer = require("mineflayer");
const minimist = require("minimist");
const mineflayerViewerhl = require("prismarine-viewer").headless;
const mineflayerViewer = require("prismarine-viewer").mineflayer;
const {
  pathfinder,
  Movements,
  goals: { GoalNear, GoalNearXZ, GoalBlock },
} = require("mineflayer-pathfinder");
const { get_target } = require("./targets.js");
const Vec3 = require("vec3").Vec3;
const fs = require("fs"); // 添加 fs 模块

const args = minimist(process.argv.slice(2));
let tp_target = get_target(args.location);
let nv_type = args.nvtype;
if (tp_target === null) {
  console.log("Invalid location");
  process.exit(1);
}
console.log(
  "collecting in",
  args.location,
  tp_target,
  " using ",
  nv_type,
  "type navigation"
);

const bot = mineflayer.createBot({
  username: args.name,
  host: "127.0.0.1",
  port: 25565,
});

bot.loadPlugin(pathfinder);

/*
  find the first non air block on given x,z
*/
function land_pos(x, z) {
  const pos = new Vec3(x, 64, z);
  let block = bot.blockAt(pos);

  if (block === null) {
    // unloaded chunk
    return null;
  }
  let dy = 0;
  while (block.type !== bot.registry.blocksByName.air.id) {
    dy++;
    block = bot.blockAt(pos.offset(0, dy, 0));
    if (block.type === bot.registry.blocksByName.air.id) {
      return pos.offset(0, dy - 1, 0);
    }
  }
  while (block.type === bot.registry.blocksByName.air.id) {
    dy--;
    block = bot.blockAt(pos.offset(0, dy, 0));
    if (block.type !== bot.registry.blocksByName.air.id) {
      return pos.offset(0, dy, 0);
    }
  }
}
/*
  [-range,range] 区域内的一个(x,z)，该位置的xz坐标上最高的非空气方块
  *要求并且必须是泥土或者石头（放置goal在屋顶上的奇怪情况）
  *要求距离tp点不超过80格, 并且距离起始点至少20格
*/

function random_pos(range) {
  const start_pos = bot.entity.position.clone();
  while (true) {
    const x = Math.floor(Math.random() * range * 2) - range;
    const z = Math.floor(Math.random() * range * 2) - range;
    let limit = (range * 4) / 5;
    if (x * x + z * z < limit * limit) {
      // ensure the distance is not to short
      continue;
    }
    // ensure the distance is not to far away from village center
    dx = start_pos.x + x - tp_target.x;
    dz = start_pos.z + z - tp_target.z;
    if (dx * dx + dz * dz > 80 * 80) {
      continue;
    }
    if (
      args.location === "stronghold" ||
      args.location === "nether_bastion" ||
      args.location === "nether_fortress"
    ) {
      return new Vec3(start_pos.x + x, start_pos.y, start_pos.z + z);
    }
    const pos = land_pos(start_pos.x + x, start_pos.z + z);
    if (Math.abs(pos.y - start_pos.y) > 10) {
      continue;
    }
    landable = new Set([
      bot.registry.blocksByName.dirt.id,
      bot.registry.blocksByName.stone.id,
      // bot.registry.blocksByName.grass_path.id,
      bot.registry.blocksByName.sand.id,
      bot.registry.blocksByName.grass_block.id,
      bot.registry.blocksByName.snow.id,
      bot.registry.blocksByName.gravel.id,
      bot.registry.blocksByName.sandstone.id,
      bot.registry.blocksByName.red_sand.id,
      bot.registry.blocksByName.terracotta.id,
      bot.registry.blocksByName.mycelium.id,
      bot.registry.blocksByName.end_stone.id,
      bot.registry.blocksByName.nether_bricks.id,
      bot.registry.blocksByName.blackstone.id,
      bot.registry.blocksByName.polished_blackstone_bricks.id,
      bot.registry.blocksByName.cracked_polished_blackstone_bricks.id,
      bot.registry.blocksByName.netherrack.id,
    ]);
    if (pos !== null) {
      const block = bot.blockAt(pos);
      blockunder = bot.blockAt(pos.offset(0, -1, 0));
      if (landable.has(block.type) && landable.has(blockunder.type)) {
        pos.y = pos.y + 1;
        return pos;
      } else {
        console.log("rej block type", block.type, blockunder.type);
      }
    }
  }
}
/*
  move to a random position in a range*range cube around the bot
*/
function move(range) {
  const pos = random_pos(range);
  console.log("moving to", pos);
  console.log("distance", bot.entity.position.distanceTo(pos));
  const defaultMove = new Movements(bot);
  defaultMove.allowSprinting = false;
  bot.pathfinder.setMovements(defaultMove);
  if (
    args.location === "stronghold" ||
    args.location === "nether_bastion" ||
    args.location === "nether_fortress"
  ) {
    bot.pathfinder.setGoal(new GoalNearXZ(pos.x, pos.z, 1), false);
  } else {
    bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z), false);
  }
}

function* moveAround(range) {
  const start_pos = bot.entity.position.clone();
  move(range);
  yield;
  if (nv_type === "ABCA") {
    move(range);
    yield;
  }
  console.log("moving back to", start_pos);
  const defaultMove = new Movements(bot);
  defaultMove.allowSprinting = false;
  bot.pathfinder.setMovements(defaultMove);
  bot.pathfinder.setGoal(new GoalNearXZ(start_pos.x, start_pos.z, 1), false);
  yield;
  setTimeout(() => {
    bot.emit("endtask");
  }, 3000);
}
function* lookaround() {
  let pitch = 0;
  let yaw = 0;
  bot.look(yaw, pitch, false);
  yield;
  yaw = Math.PI / 2;
  bot.look(yaw, pitch, false);
  yield;
  yaw = Math.PI;
  bot.look(yaw, pitch, false);
  yield;
  yaw = (Math.PI * 3) / 2;
  bot.look(yaw, pitch, false);
  yield;
  yaw = 0;
  bot.look(yaw, pitch, false);
  yield;
  let controller = moveAround(args.nvrange);
  controller.next();
  // Force end of stream
  bot.on("goal_reached", () => {
    console.log("goal reached");
    controller.next();
    // bot.quit()
  });
}
bot.once("spawn", () => {
  console.log("Starting headless viewer");
  mineflayerViewerhl(bot, {
    output: `127.0.0.1:${args.port}`,
    frames: -1,
    width: 640,
    height: 360,
  });
  const p = bot.entity.position;
  console.log(
    `Spawned at x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} z=${p.z.toFixed(2)}`
  );
  setTimeout(() => {
    // First move to a random position with inital range

    // Track if we've started the viewer
    console.log("Teleporting");
    const x = bot.username === "Bot1" ? 66.0 : 68.0;
    bot.chat(`/tp ${bot.username} ${x} ${55.0} ${77.0}`);
    // bot.chat(
    //   `/execute in minecraft:overworld run tp @p ${44.0} ${55.0} ${77.0}`
    // );
    setTimeout(async () => {
      const p2 = bot.entity.position;
      console.log(
        `teleported to x=${p2.x.toFixed(2)} y=${p2.y.toFixed(
          2
        )} z=${p2.z.toFixed(2)}`
      );
      while (true) {
        await spin360(1200);
      }
      // setTimeout(() => {
      //   bot.emit("endtask");
      // }, 5000);
    }, 1000);
  }, 1000);
});

async function spin360(durationMs = 1200) {
  const steps = 60; // higher = smoother
  const startYaw = bot.entity.yaw; // current yaw
  const pitch = bot.entity.pitch; // keep current pitch

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  for (let i = 1; i <= steps; i++) {
    const yaw = startYaw + (i * 2 * Math.PI) / steps;
    await bot.look(yaw, pitch, true); // true = force immediate head turn
    await sleep(durationMs / steps);
  }
}
