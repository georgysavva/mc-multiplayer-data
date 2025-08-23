const mineflayer = require("mineflayer");
const minimist = require("minimist");
const mineflayerViewerhl = require("prismarine-viewer-colalab").headless;
const mineflayerVersion = require("mineflayer/package.json").version;
console.log("mineflayer version:", mineflayerVersion);
const prismarineVersion =
  require("prismarine-viewer-colalab/package.json").version;
console.log("prismarine-viewer version:", prismarineVersion);
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
  version: "1.21.1",
});
console.log("bot version", bot.version);
bot.loadPlugin(pathfinder);
let views = {};
bot.once("spawn", () => {
  console.log("Starting headless viewer");
  mineflayerViewerhl(bot, views, {
    // output: `${args.output_path}/output.mp4`,
    output: `127.0.0.1:${args.port}`,
    frames: 220,
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
    const x = bot.username === "Bot1" ? 1402 : 1407;
    // bot.chat(`/tp ${bot.username} ${x} ${70} ${65}`);
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
