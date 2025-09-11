const mineflayerViewerhl = require("prismarine-viewer-colalab").headless;
const seedrandom = require("seedrandom");
const { Rcon } = require("rcon-client");
const crypto = require("crypto");

// Constants
const MIN_WALK_DISTANCE = 3;
const MAX_WALK_DISTANCE = 4;
const MIN_BOTS_DISTANCE = 9;
const MAX_BOTS_DISTANCE = 10;
const CAMERA_SPEED_DEGREES_PER_SEC = 15;
const JUMP_PROBABILITY = 0.25;
const MIN_JUMP_DURATION_SEC = 1;
const MAX_JUMP_DURATION_SEC = 3;
const MIN_RUN_ACTIONS = 3;
const MAX_RUN_ACTIONS = 5;
const MIN_SLEEP_BETWEEN_ACTIONS_SEC = 1.5;
const MAX_SLEEP_BETWEEN_ACTIONS_SEC = 3;

// two-bots-run-together.js
const minimist = require("minimist");
const mineflayer = require("mineflayer");
const {
  pathfinder,
  Movements,
  goals: { GoalNear, GoalNearXZ, GoalBlock, GoalFollow },
} = require("mineflayer-pathfinder");
const net = require("net");
const EventEmitter = require("events");

const mcDataLoader = require("minecraft-data");
const Vec3 = require("vec3").Vec3;

async function rconTp(name, x, y, z) {
  const rcon = await Rcon.connect({
    host: args.rcon_host,
    port: args.rcon_port,
    password: "change-me",
  });
  const res = await rcon.send(`tp ${name} ${x} ${y} ${z}`);
  await rcon.end();
  return res;
}
async function rconEquipDyedHelmet(name, decColor) {
  const rcon = await Rcon.connect({
    host: args.rcon_host,
    port: args.rcon_port,
    password: "change-me",
  });
  console.log(`Equipping dyed helmet to ${name} with color ${decColor}`);
  const res = await rcon.send(
    `item replace entity ${name} armor.head with minecraft:leather_helmet[dyed_color=${decColor}] 1`
  );
  console.log(`Result: ${res}`);
  await rcon.end();
}

async function rconEquipBannerOffhand(
  name,
  colorName /* e.g. red, blue, lime */
) {
  const rcon = await Rcon.connect({
    host: args.rcon_host,
    port: args.rcon_port,
    password: "change-me",
  });
  console.log(`Equipping banner to ${name} with color ${colorName}`);
  const res = await rcon.send(
    `item replace entity ${name} weapon.offhand with minecraft:${colorName}_banner 1`
  );
  console.log(`Result: ${res}`);

  await rcon.end();
}

async function rconGiveColoredChestplate(name, color) {
  const rcon = await Rcon.connect({
    host: args.rcon_host,
    port: args.rcon_port,
    password: "change-me",
  });
  console.log(`Giving colored chestplate to ${name} with color ${color}`);
  const res = await rcon.send(
    `item replace entity ${name} armor.chest with minecraft:leather_chestplate[dyed_color=${color}] 1`
  );
  console.log(`Result: ${res}`);
  await rcon.end();
  return res;
}

async function rconSkinSet(playerName, skinName) {
  const rcon = await Rcon.connect({
    host: args.rcon_host,
    port: args.rcon_port,
    password: "change-me",
  });
  console.log(`Setting skin for ${playerName} to ${skinName}`);
  const res = await rcon.send(`skin set Angry bear ${playerName}`);
  console.log(`Skin set response: ${res}`);
  const res2 = await rcon.send(`sr applyskin ${playerName}`);
  console.log(`Skin apply response: ${res2}`);
  await rcon.end();
  return res;
}

async function rconSetSkinsRestorerPermission(botName) {
  const rcon = await Rcon.connect({
    host: args.rcon_host,
    port: args.rcon_port,
    password: "change-me",
  });
  console.log(`Setting SkinsRestorer permissions for ${botName}`);
  const permissions = [
    "skinsrestorer.command",
    "skinsrestorer.command.set",
    "skinsrestorer.command.set.other",
    "skinsrestorer.player",
    "skinsrestorer.admin",
    "skinsrestorer.admincommand.createcustom",
    "skinsrestorer.admincommand.applyskin",
    "skinsrestorer.admincommand.applyskinall",
    "skinsrestorer.ownskin",
  ];

  for (const permission of permissions) {
    const res = await rcon.send(
      `lp user ${botName} permission set ${permission} true`
    );
    console.log(`Permission set response for ${permission}: ${res}`);
  }
  await rcon.end();
}

async function botSkinSet(bot, skinName) {
  bot.chat(`/skin set ${skinName} ${bot.username}`);
  await sleep(1000);
  bot.chat(`/sr applyskin ${bot.username}`);
  await sleep(1000);
  return true;
}

// Color name to RGB color code mapping
const COLOR_MAP = {
  red: 16711680, // 0xFF0000
  blue: 255, // 0x0000FF
  green: 65280, // 0x00FF00
  yellow: 16776960, // 0xFFFF00
  purple: 16711935, // 0xFF00FF
  cyan: 65535, // 0x00FFFF
  orange: 16753920, // 0xFFA500
  pink: 16761035, // 0xFFC0CB
  lime: 8388352, // 0x7FFF00
  black: 0, // 0x000000
  white: 16777215, // 0xFFFFFF
  gray: 8421504, // 0x808080
  brown: 9127187, // 0x8B4513
};

// Color to skin name mapping
const COLOR_TO_SKIN_MAP = {
  red: "capybara",
  blue: "capybara",
};

const args = minimist(process.argv.slice(2), {
  default: {
    host: "127.0.0.1",
    port: 25565,
    rcon_host: "127.0.0.1",
    rcon_port: 25575,
    receiver_host: "127.0.0.1",
    receiver_port: 8091,
    bot_name: "Alpha",
    other_bot_name: "Bravo",
    coord_port: 8093,
    other_coord_host: "127.0.0.1",
    other_coord_port: 8094,
    iterations_num_per_episode: 3,
    bot_rng_seed: "12345",
    episodes_num: 1,
    start_episode_id: 0,
    color: "red", // default color name
    bootstrap_wait_time: 0,
  },
});

// Convert color name to color code
const chestplate_color = COLOR_MAP[args.color.toLowerCase()] || COLOR_MAP.red;
const skin_name = COLOR_TO_SKIN_MAP[args.color.toLowerCase()];
console.log(`Using color: ${args.color} (code: ${chestplate_color})`);
console.log(`Skin name for color ${args.color}: ${skin_name}`);

function land_pos(bot, x, z) {
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

function random_pos(bot, range) {
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
    // dx = start_pos.x + x - tp_target.x;
    // dz = start_pos.z + z - tp_target.z;
    // if (dx * dx + dz * dz > 80 * 80) {
    //   continue;
    // }
    // if (
    //   args.location === "stronghold" ||
    //   args.location === "nether_bastion" ||
    //   args.location === "nether_fortress"
    // ) {
    //   return new Vec3(start_pos.x + x, start_pos.y, start_pos.z + z);
    // }
    const pos = land_pos(bot, start_pos.x + x, start_pos.z + z);
    if (pos == null || Math.abs(pos.y - start_pos.y) > 10) {
      console.log(`[${bot.username}] rej null or y diff`);
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
        console.log(
          `[${bot.username}] rej block type`,
          block.type,
          blockunder.type
        );
      }
    }
  }
}
/*
  move to a random position in a range*range cube around the bot
*/
async function move(bot, range) {
  const pos = random_pos(bot, range);
  console.log(`${bot.username} moving to`, pos);
  console.log(
    `[${bot.username}] distance`,
    bot.entity.position.distanceTo(pos)
  );
  const defaultMove = new Movements(bot);
  defaultMove.allowSprinting = false;
  bot.pathfinder.setMovements(defaultMove);
  bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z), false);

  return new Promise((resolve) => {
    const onGoalReached = () => {
      bot.pathfinder.stop();
      bot.clearControlStates();
      bot.removeListener("goal_reached", onGoalReached);
      resolve();
    };
    bot.on("goal_reached", onGoalReached);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.random() * (max - min) + min;
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

// equip the first chestplate in inventory
async function equipFirst(bot, itemName, dest) {
  const item = bot.inventory.items().find((i) => i.name === itemName);
  if (item) await bot.equip(item, dest); // dest: 'torso','head','legs','feet','hand'
}

class BotCoordinator extends EventEmitter {
  constructor(botName, coordPort, otherCoordHost, otherCoordPort) {
    super();
    this.botName = botName;
    this.coordPort = coordPort;
    this.otherCoordHost = otherCoordHost;
    this.otherCoordPort = otherCoordPort;
    this.clientConnection = null;
    this.server = null;
  }

  async setupConnections() {
    console.log(`[${this.botName}] Setting up connections...`);

    // Set up server and client connections in parallel and wait for both to be ready
    const [serverReady, clientReady] = await Promise.all([
      this.setupServer(),
      this.setupClient(),
    ]);

    console.log(
      `[${this.botName}] All connections established - server ready: ${serverReady}, client ready: ${clientReady}`
    );
    return { serverReady, clientReady };
  }

  setupServer() {
    return new Promise((resolve) => {
      this.server = net.createServer((socket) => {
        console.log(`[${this.botName} Server] Other bot connected`);
        let buffer = "";

        socket.on("data", (data) => {
          buffer += data.toString();
          let lines = buffer.split("\n");

          // Keep the last incomplete line in the buffer
          buffer = lines.pop();

          // Process each complete line
          lines.forEach((line) => {
            if (line.trim()) {
              try {
                const message = JSON.parse(line);
                const listenerCount = this.listenerCount(message.eventName);
                if (listenerCount > 0) {
                  console.log(
                    `[${this.botName} Server] Received: ${message.eventName} (${listenerCount} listeners) - emitting`
                  );
                  this.emit(message.eventName, message.eventParams);
                } else {
                  console.log(
                    `[${this.botName} Server] Received: ${message.eventName} (no listeners)`
                  );
                }
              } catch (err) {
                console.error(
                  `[${
                    this.botName
                  } Server] Parse error: ${err}, message: ${data.toString()}`
                );
                console.error(
                  `[${this.botName} Server] Problematic line:`,
                  line
                );
              }
            }
          });
        });
        socket.on("close", () => {
          console.log(`[${this.botName} Server] Other bot disconnected`);
        });

        // Resolve when the other bot connects to our server
        resolve(true);
      });

      this.server.listen(this.coordPort, () => {
        console.log(
          `[${this.botName} Server] Listening on port ${this.coordPort}, waiting for other bot to connect...`
        );
      });
    });
  }

  setupClient() {
    return new Promise((resolve) => {
      const attemptConnection = () => {
        this.clientConnection = net.createConnection(
          { host: this.otherCoordHost, port: this.otherCoordPort },
          () => {
            console.log(
              `[${this.botName} Client] Connected to other bot's server at ${this.otherCoordHost}:${this.otherCoordPort}`
            );
            resolve(true);
          }
        );

        this.clientConnection.on("error", (err) => {
          console.log(
            `[${this.botName} Client] Connection failed, retrying in 2s:`,
            err.message
          );
          setTimeout(attemptConnection, 2000);
        });

        this.clientConnection.on("close", () => {
          console.log(`[${this.botName} Client] Disconnected from other bot`);
          this.clientConnection = null;
          setTimeout(attemptConnection, 2000); // Auto-reconnect
        });
      };

      attemptConnection();
    });
  }

  sendToOtherBot(eventName, eventParams, location) {
    if (this.clientConnection) {
      const message = JSON.stringify({ eventName, eventParams });
      console.log(
        `[sendToOtherBot] ${location}: Sending ${eventName} via client connection`
      );
      this.clientConnection.write(message + "\n");
    } else {
      console.log(
        `[sendToOtherBot] ${location}: No client connection available for ${eventName}`
      );
    }
  }

  onceEvent(eventName, handler) {
    this.once(eventName, handler);
  }
}

function stopAll(bot) {
  for (const k of [
    "forward",
    "back",
    "left",
    "right",
    "jump",
    "sprint",
    "sneak",
  ]) {
    bot.setControlState(k, false);
  }
}

async function walk(bot, distance) {
  const startPos = bot.entity.position.clone();
  const dir = choice(["forward", "back", "left", "right"]);

  // Define the reverse direction
  const reverseDir = {
    forward: "back",
    back: "forward",
    left: "right",
    right: "left",
  };

  console.log(
    `[${
      bot.username
    }] Walking ${dir} for ${distance} blocks from position (${startPos.x.toFixed(
      2
    )}, ${startPos.y.toFixed(2)}, ${startPos.z.toFixed(2)})`
  );

  // Walk in the chosen direction until we reach the target distance
  bot.setControlState(dir, true);

  let actualDistance = 0;
  try {
    while (bot.entity.position.distanceTo(startPos) < distance) {
      await sleep(50); // Check position every 50ms
    }
    actualDistance = bot.entity.position.distanceTo(startPos);
  } finally {
    bot.setControlState(dir, false);
  }

  const reachedPos = bot.entity.position.clone();
  console.log(
    `[${bot.username}] Reached distance ${actualDistance.toFixed(
      2
    )} blocks at position (${reachedPos.x.toFixed(2)}, ${reachedPos.y.toFixed(
      2
    )}, ${reachedPos.z.toFixed(2)})`
  );

  // Randomly jump before returning based on jump probability
  if (Math.random() < JUMP_PROBABILITY) {
    const jumpDurationSec =
      MIN_JUMP_DURATION_SEC +
      Math.random() * (MAX_JUMP_DURATION_SEC - MIN_JUMP_DURATION_SEC);
    const jumpDurationMs = Math.floor(jumpDurationSec * 1000);
    console.log(
      `[${bot.username}] Jumping for ${jumpDurationSec.toFixed(
        1
      )}s before returning`
    );
    await jump(bot, jumpDurationMs);
  }

  // Now return to the starting position by walking in the reverse direction
  console.log(
    `[${bot.username}] Returning to starting position by walking ${reverseDir[dir]}`
  );

  bot.setControlState(reverseDir[dir], true);

  try {
    // Walk back until we're close to the starting position
    while (bot.entity.position.distanceTo(startPos) > 1.0) {
      await sleep(50); // Check position every 50ms
    }
  } finally {
    bot.setControlState(reverseDir[dir], false);
  }

  const finalDistance = bot.entity.position.distanceTo(startPos);
  console.log(
    `[${bot.username}] Returned to within ${finalDistance.toFixed(
      2
    )} blocks of starting position`
  );

  // Randomly jump after returning to start position
  if (Math.random() < JUMP_PROBABILITY) {
    const jumpDurationSec =
      MIN_JUMP_DURATION_SEC +
      Math.random() * (MAX_JUMP_DURATION_SEC - MIN_JUMP_DURATION_SEC);
    const jumpDurationMs = Math.floor(jumpDurationSec * 1000);
    console.log(
      `[${bot.username}] Jumping for ${jumpDurationSec.toFixed(
        1
      )}s after returning to start`
    );
    await jump(bot, jumpDurationMs);
  }
}

async function jump(bot, durationMs) {
  console.log(
    `[${bot.username}] Jumping for ${(durationMs / 1000).toFixed(1)}s`
  );
  const end = Date.now() + durationMs;
  while (Date.now() < end) {
    bot.setControlState("jump", true);
    await sleep(250);
    bot.setControlState("jump", false);
    await sleep(250);
  }
}

async function lookAtSmooth(bot, targetPosition, degreesPerSecond) {
  const botPosition = bot.entity.position;

  // Calculate the vector from bot to target
  const dx = targetPosition.x - botPosition.x;
  const dy = targetPosition.y - botPosition.y;
  const dz = targetPosition.z - botPosition.z;

  // Calculate target yaw (horizontal rotation)
  const targetYaw = Math.atan2(-dx, -dz); // Minecraft coordinate system

  // Calculate target pitch (vertical rotation)
  const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
  const targetPitch = -Math.atan2(dy, horizontalDistance); // Negative for Minecraft pitch

  const startYaw = bot.entity.yaw;
  const startPitch = bot.entity.pitch;

  // Calculate angle differences, handling wrapping for yaw
  let yawDiff = targetYaw - startYaw;
  // Normalize yaw difference to [-π, π] for shortest rotation
  while (yawDiff > Math.PI) yawDiff -= 2 * Math.PI;
  while (yawDiff < -Math.PI) yawDiff += 2 * Math.PI;

  const pitchDiff = targetPitch - startPitch;

  // Calculate total angular distance in radians
  const totalAngleDistance = Math.sqrt(
    yawDiff * yawDiff + pitchDiff * pitchDiff
  );

  // Convert speed from degrees per second to radians per second
  const radiansPerSecond = (degreesPerSecond * Math.PI) / 180;

  // Calculate total time needed
  const totalTimeMs = (totalAngleDistance / radiansPerSecond) * 1000;

  console.log(
    `[${bot.username}] Looking at (${targetPosition.x.toFixed(
      2
    )}, ${targetPosition.y.toFixed(2)}, ${targetPosition.z.toFixed(
      2
    )}) at ${degreesPerSecond}°/s over ${(totalTimeMs / 1000).toFixed(2)}s`
  );

  const startTime = Date.now();
  const endTime = startTime + totalTimeMs;
  const updateInterval = 50; // 50ms intervals

  while (Date.now() < endTime) {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / totalTimeMs, 1.0);

    // Smooth interpolation using easing function (ease-out)
    const easedProgress = 1 - Math.pow(1 - progress, 2);

    // Calculate current angles
    const currentYaw = startYaw + yawDiff * easedProgress;
    const currentPitch = startPitch + pitchDiff * easedProgress;

    bot.look(currentYaw, currentPitch, true);

    if (progress >= 1.0) break;
    await sleep(updateInterval);
  }

  // Ensure we end exactly at the target angles
  bot.look(targetYaw, targetPitch, true);
}

async function run(bot, actionCount) {
  const actions = [() => walk(bot, rand(MIN_WALK_DISTANCE, MAX_WALK_DISTANCE))];

  console.log(`[${bot.username}] Running ${actionCount} actions`);

  for (let i = 0; i < actionCount; i++) {
    // Sleep before each action, including the first one
    const sleepTimeSec =
      MIN_SLEEP_BETWEEN_ACTIONS_SEC +
      Math.random() *
        (MAX_SLEEP_BETWEEN_ACTIONS_SEC - MIN_SLEEP_BETWEEN_ACTIONS_SEC);
    const sleepTimeMs = Math.floor(sleepTimeSec * 1000);
    console.log(
      `[${bot.username}] Sleeping for ${sleepTimeSec.toFixed(
        2
      )}s before action ${i + 1}`
    );
    await sleep(sleepTimeMs);

    const action = choice(actions);
    try {
      console.log(`[${bot.username}] Executing action ${i + 1}/${actionCount}`);
      await action();
    } catch (err) {
      console.error(`[${bot.username}] Action error:`, err);
    } finally {
      stopAll(bot);
    }
  }
}

async function runSingleEpisode(bot, sharedBotRng, coordinator, episodeNum) {
  console.log(`[${bot.username}] Starting episode ${episodeNum}`);

  return new Promise((resolve) => {
    bot._currentEpisodeResolve = resolve;

    const { x, y, z } = bot.entity.position;
    console.log(
      `[${bot.username}] episode ${episodeNum} at (${x.toFixed(2)}, ${y.toFixed(
        2
      )}, ${z.toFixed(2)})`
    );

    coordinator.onceEvent(
      "teleportPhase",
      getOnTeleportPhaseFn(
        bot,
        sharedBotRng,
        coordinator,
        args.other_bot_name,
        episodeNum
      )
    );
    coordinator.sendToOtherBot(
      "teleportPhase",
      bot.entity.position.clone(),
      "spawnPhase end"
    );
  });
}
function printInventory(bot) {
  const items = bot.inventory.items();
  if (items.length === 0) return console.log("Inventory: (empty)");
  console.log("Inventory:");
  for (const it of items) {
    console.log(`- ${it.count} × ${it.displayName}`); // it.name, it.type, it.stackSize also available
  }
  console.log(
    "Held item:",
    bot.heldItem
      ? `${bot.heldItem.count} × ${bot.heldItem.displayName}`
      : "(none)"
  );
}
// Offline-mode UUID = MD5 of "OfflinePlayer:" + name, with RFC4122 v3/variant bits set
function offlineUuidFromName(name) {
  const input = Buffer.from("OfflinePlayer:" + name, "utf8");
  const md5 = crypto.createHash("md5").update(input).digest();

  // set version (3) and variant (RFC 4122)
  md5[6] = (md5[6] & 0x0f) | 0x30; // version 3
  md5[8] = (md5[8] & 0x3f) | 0x80; // variant RFC 4122

  // format as UUID string
  const hex = md5.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function isSlimFromUuid(uuidStr) {
  // mimic Java UUID.hashCode() parity used by DefaultPlayerSkin.getSkinType
  const b = Buffer.from(uuidStr.replace(/-/g, ""), "hex");
  const to64 = (buf, start) => {
    let v = 0n;
    for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(buf[start + i]);
    return v;
  };
  const most = to64(b, 0);
  const least = to64(b, 8);
  const hilo = most ^ least;
  const hi32 = Number((hilo >> 32n) & 0xffffffffn) | 0;
  const lo32 = Number(hilo & 0xffffffffn) | 0;
  const hashCode = (hi32 ^ lo32) | 0;
  return (hashCode & 1) !== 0; // true => "slim (Alex)", false => "classic (Steve)"
}

function modelForName(name) {
  const uuid = offlineUuidFromName(name);
  return { name, uuid, model: isSlimFromUuid(uuid) ? "slim" : "classic" };
}
function getOnSpawnFn(bot, host, receiverPort, sharedBotRng, coordinator) {
  return async () => {
    // const mcData = mcDataLoader(bot.version);
    // const moves = new Movements(bot, mcData);
    // moves.allowSprinting = true; // makes them run
    // moves.canDig = false; // keep it simple; no digging
    // bot.pathfinder.setMovements(moves);
    // Wait for both connections to be established
    console.log("Setting up coordinator connections...");
    await coordinator.setupConnections();
    console.log(
      "All coordinator connections ready, proceeding with bot spawn..."
    );
    // Initialize viewer once for the entire program
    mineflayerViewerhl(bot, {
      output: `${args.receiver_host}:${receiverPort}`,
      width: 640,
      height: 360,
      frames: 400,
    });

    // await rconSetSkinsRestorerPermission(bot.username);
    // await sleep(1000);

    const { x, y, z } = bot.entity.position;
    console.log(
      `[${bot.username}] spawned at (${x.toFixed(2)}, ${y.toFixed(
        2
      )}, ${z.toFixed(2)})`
    );

    // Set skin based on color
    // if (skin_name) {
    //   try {
    //     console.log(
    //       `[${bot.username}] setting skin to ${skin_name} for color ${args.color}`
    //     );
    //     // await rconSkinSet(bot.username, skin_name);
    //     // await botSkinSet(bot, skin_name);
    //     // await sleep(1000); // Wait for skin to be applied
    //     // console.log(bot.entity);
    //     // console.log(bot.settings);
    //     // bot.settings.skinParts.showJacket = false;
    //     // await sleep(1000);
    //     console.log(bot.settings);
    //   } catch (error) {
    //     console.error(`[${bot.username}] failed to set skin:`, error);
    //   }
    // } else {
    //   console.log(
    //     `[${bot.username}] no skin mapping found for color: ${args.color}`
    //   );
    // }

    // Give colored chestplate and equip it
    // try {
    //   console.log(
    //     `[${bot.username}] giving colored chestplate (color: ${chestplate_color})`
    //   );
    //   await rconGiveColoredChestplate(bot.username, chestplate_color);
    //   await sleep(1000); // Wait for item to appear in inventory
    //   await rconEquipDyedHelmet(bot.username, chestplate_color);
    //   await sleep(1000); // Wait for item to appear in inventory
    //   await rconEquipBannerOffhand(bot.username, chestplate_color);
    //   await sleep(1000); // Wait for item to appear in inventory
    // } catch (error) {
    //   console.error(
    //     `[${bot.username}] failed to give/equip chestplate:`,
    //     error
    //   );
    // }

    // Run multiple episodes
    for (
      let episodeNum = args.start_episode_id;
      episodeNum < args.start_episode_id + args.episodes_num;
      episodeNum++
    ) {
      await runSingleEpisode(bot, sharedBotRng, coordinator, episodeNum);
      console.log(`[${bot.username}] Episode ${episodeNum} completed`);
    }

    console.log(
      `[${bot.username}] All ${args.episodes_num} episodes completed`
    );
    process.exit(0);
  };
}
function getOnTeleportPhaseFn(
  bot,
  sharedBotRng,
  coordinator,
  otherBotName,
  episodeNum
) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      "teleportPhase",
      bot.entity.position,
      "teleportPhase beginning"
    );

    // Generate desired distance between bots using sharedBotRng
    const desiredDistance =
      MIN_BOTS_DISTANCE +
      sharedBotRng() * (MAX_BOTS_DISTANCE - MIN_BOTS_DISTANCE);

    // Calculate current positions and distance
    const currentPos = bot.entity.position.clone();
    const otherPos = otherBotPosition;
    const currentDistance = currentPos.distanceTo(otherPos);

    console.log(
      `[${bot.username}] current distance: ${currentDistance.toFixed(
        2
      )}, desired: ${desiredDistance.toFixed(2)}`
    );

    let newX, newZ;

    // Handle case where both bots are at the same coordinate
    if (currentDistance < 0.01) {
      console.log(
        `[${bot.username}] bots at same position, using random angle`
      );

      // Pick a random angle from RNG
      const angle = sharedBotRng() * 2 * Math.PI;

      // Move half the desired distance in the chosen direction
      const moveDistance = desiredDistance / 2;

      // Bot A moves in initial direction, Bot B moves in opposite direction
      if (bot.username < otherBotName) {
        newX = currentPos.x + moveDistance * Math.cos(angle);
        newZ = currentPos.z + moveDistance * Math.sin(angle);
      } else {
        newX = currentPos.x - moveDistance * Math.cos(angle);
        newZ = currentPos.z - moveDistance * Math.sin(angle);
      }
    } else {
      // Normal case: move along the line connecting the two bots
      const movementDistance = (desiredDistance - currentDistance) / 2;

      // Calculate unit vector from this bot to the other bot
      const dx = otherPos.x - currentPos.x;
      const dz = otherPos.z - currentPos.z;
      const lineDistance = Math.sqrt(dx * dx + dz * dz);
      const unitX = dx / lineDistance;
      const unitZ = dz / lineDistance;

      // Calculate new position (move away from other bot if expanding, toward if contracting)
      newX = currentPos.x - movementDistance * unitX;
      newZ = currentPos.z - movementDistance * unitZ;
    }

    // Use land_pos to determine proper Y coordinate
    const landPosition = land_pos(bot, newX, newZ);
    const newY = landPosition ? landPosition.y + 1 : currentPos.y;

    console.log(
      `[${bot.username}] teleporting to (${newX.toFixed(2)}, ${newY.toFixed(
        2
      )}, ${newZ.toFixed(2)})`
    );

    // Teleport using rcon
    try {
      await rconTp(
        bot.username,
        Math.floor(newX),
        Math.floor(newY),
        Math.floor(newZ)
      );
      await sleep(1000);
      console.log(`[${bot.username}] teleport completed`);
    } catch (error) {
      console.error(`[${bot.username}] teleport failed:`, error);
    }
    await lookAtSmooth(bot, otherBotPosition, CAMERA_SPEED_DEGREES_PER_SEC);
    console.log(`[${bot.username}] starting episode recording`);
    bot.emit("startepisode", episodeNum === 0 ? 50 : 0);
    await sleep(episodeNum === 0 ? 6000 : 1000);

    const iterationID = 0;
    coordinator.onceEvent(
      `walkAndLookPhase_${iterationID}`,
      getOnWalkAndLookPhaseFn(
        bot,
        sharedBotRng,
        coordinator,
        iterationID,
        args.other_bot_name,
        episodeNum
      )
    );
    coordinator.sendToOtherBot(
      `walkAndLookPhase_${iterationID}`,
      bot.entity.position.clone(),
      "teleportPhase end"
    );
  };
}
function getOnWalkAndLookPhaseFn(
  bot,
  sharedBotRng,
  coordinator,
  iterationID,
  otherBotName,
  episodeNum
) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      `walkAndLookPhase_${iterationID}`,
      bot.entity.position.clone(),
      `walkAndLookPhase_${iterationID} beginning`
    );
    const actionCount =
      MIN_RUN_ACTIONS +
      Math.floor(sharedBotRng() * (MAX_RUN_ACTIONS - MIN_RUN_ACTIONS + 1));

    // Define three walking phase modes and randomly pick one using sharedBotRng
    const walkingModes = [
      "both_bots_walk",
      "lower_name_walks",
      "bigger_name_walks",
    ];
    const selectedMode =
      walkingModes[Math.floor(sharedBotRng() * walkingModes.length)];

    console.log(
      `[iter ${iterationID}] [${bot.username}] starting walk phase with ${actionCount} actions - mode: ${selectedMode}`
    );

    // Determine if this bot should walk based on the selected mode
    let shouldThisBotWalk = false;

    switch (selectedMode) {
      case "both_bots_walk":
        shouldThisBotWalk = true;
        break;
      case "lower_name_walks":
        shouldThisBotWalk = bot.username < otherBotName;
        break;
      case "bigger_name_walks":
        shouldThisBotWalk = bot.username > otherBotName;
        break;
    }

    console.log(
      `[iter ${iterationID}] [${bot.username}] will ${
        shouldThisBotWalk ? "walk" : "sleep"
      } during this phase`
    );

    // Look at the other bot smoothly at the start of the phase
    await lookAtSmooth(bot, otherBotPosition, CAMERA_SPEED_DEGREES_PER_SEC);

    // Either run() or sleep() based on the mode
    if (shouldThisBotWalk) {
      await run(bot, actionCount);
    } else {
      // Bot doesn't run, so no sleep is needed
      console.log(
        `[iter ${iterationID}] [${bot.username}] not walking this phase`
      );
    }

    if (iterationID == args.iterations_num_per_episode - 1) {
      coordinator.onceEvent(
        "stopPhase",
        getOnStopPhaseFn(bot, sharedBotRng, coordinator, args.other_bot_name)
      );
      coordinator.sendToOtherBot(
        "stopPhase",
        bot.entity.position.clone(),
        `walkAndLookPhase_${iterationID} end`
      );
      return;
    }
    const nextIterationID = iterationID + 1;
    coordinator.onceEvent(
      `walkAndLookPhase_${nextIterationID}`,
      getOnWalkAndLookPhaseFn(
        bot,
        sharedBotRng,
        coordinator,
        nextIterationID,
        args.other_bot_name,
        episodeNum
      )
    );
    coordinator.sendToOtherBot(
      `walkAndLookPhase_${nextIterationID}`,
      bot.entity.position.clone(),
      `walkAndLookPhase_${iterationID} end`
    );
  };
}

function getOnStopPhaseFn(bot, sharedBotRng, coordinator, otherBotName) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      "stopPhase",
      bot.entity.position.clone(),
      "stopPhase beginning"
    );
    console.log(`[${bot.username}] stops recording`);
    bot.emit("endepisode");

    // Wait for the connection to actually close
    console.log(`[${bot.username}] waiting for episode to end...`);
    await new Promise((resolve) => {
      bot.once("episodeended", resolve);
    });
    console.log(`[${bot.username}] episode ended, connection closed`);

    coordinator.onceEvent(
      "stoppedPhase",
      getOnStoppedPhaseFn(
        bot,
        sharedBotRng,
        coordinator,
        otherBotName,
        bot._currentEpisodeResolve
      )
    );
    coordinator.sendToOtherBot(
      "stoppedPhase",
      bot.entity.position.clone(),
      "StopPhase end"
    );
  };
}

function getOnStoppedPhaseFn(
  bot,
  sharedBotRng,
  coordinator,
  otherBotName,
  episodeResolve
) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      "stoppedPhase",
      bot.entity.position.clone(),
      "stoppedPhase beginning"
    );

    await sleep(3000);

    console.log(`[${bot.username}] stopped`);
    // Resolve the episode promise instead of exiting
    episodeResolve();
  };
}

function makeBot({ username, host, port }) {
  const bot = mineflayer.createBot({
    host,
    port,
    username,
    version: "1.21.1",
    checkTimeoutInterval: 10 * 60 * 1000,
  });

  bot.loadPlugin(pathfinder);

  bot.on("end", () => console.log(`[${bot.username}] disconnected.`));
  bot.on("kicked", (reason) =>
    console.log(`[${bot.username}] kicked:`, reason)
  );
  bot.on("error", (err) => console.log(`[${bot.username}] error:`, err));

  return bot;
}

async function main() {
  console.log("DEBUG environment variable:", process.env.DEBUG);
  console.log(`Starting bot: ${args.bot_name}`);
  console.log(
    `Coordinator: ${args.bot_name}, Ports: ${args.coord_port}/${args.other_coord_port}`
  );

  console.log(
    `[${args.bot_name}] Waiting ${args.bootstrap_wait_time} seconds before creating bot...`
  );
  await sleep(args.bootstrap_wait_time * 1000);

  const bot = makeBot({
    username: args.bot_name,
    host: args.host,
    port: args.port,
  });
  const botsRngSeed = args.bot_rng_seed;
  const sharedBotRng = seedrandom(botsRngSeed);
  const coordinator = new BotCoordinator(
    args.bot_name,
    args.coord_port,
    args.other_coord_host,
    args.other_coord_port
  );
  bot.once(
    "spawn",
    getOnSpawnFn(bot, args.host, args.receiver_port, sharedBotRng, coordinator)
  );
  bot._client.on("packet", (data, meta) => {
    if (meta.name === "system_chat" && data?.content) {
      console.log("SYSTEM:", JSON.stringify(data.content));
    }
  });
}

// Run the main function
main().catch(console.error);
