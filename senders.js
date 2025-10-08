const mineflayerViewerhl = require("prismarine-viewer-colalab").headless;
const seedrandom = require("seedrandom");
const { Rcon } = require("rcon-client");

// Constants
const MIN_WALK_DISTANCE = 3;
const MAX_WALK_DISTANCE = 4;
const MIN_BOTS_DISTANCE = 9;
const MAX_BOTS_DISTANCE = 10;
const CAMERA_SPEED_DEGREES_PER_SEC = 30;
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
    episode_category: "look",
    bot_rng_seed: "12345",
    episodes_num: 1,
    start_episode_id: 0,
    color: "red", // default color name
    bootstrap_wait_time: 0,
    teleport_center_x: 0,
    teleport_center_z: 0,
    teleport_radius: 500,
    walk_timeout: 5, // walk timeout in seconds
  },
});

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

async function walk(bot, distance, lookAway, flipCameraInReturn) {
  const startPos = bot.entity.position.clone();
  const dir = choice(["forward", "back", "left", "right"]);
  const walkTimeoutMs = args.walk_timeout * 1000; // Convert to milliseconds
  // Save bot's original pitch and yaw
  const originalYaw = bot.entity.yaw;
  const originalPitch = bot.entity.pitch;
  console.log(
    `[${
      bot.username
    }] Walking ${dir} for ${distance} blocks from position (${startPos.x.toFixed(
      2
    )}, ${startPos.y.toFixed(2)}, ${startPos.z.toFixed(2)}) with ${
      args.walk_timeout
    }s timeout lookAway: ${lookAway} flipCameraInReturn: ${flipCameraInReturn}`
  );
  if (lookAway) {
    // Pick a random angle between -90 and +90 degrees behind the bot's current yaw
    // "Behind" means add 180 degrees (π radians), then offset by [-90, +90] degrees
    const behindOffsetDeg = Math.random() * 180 - 90; // [-90, +90]
    const behindOffsetRad = (behindOffsetDeg * Math.PI) / 180;
    const newYaw = originalYaw + Math.PI + behindOffsetRad;
    // Keep pitch the same
    await lookSmooth(bot, newYaw, originalPitch, CAMERA_SPEED_DEGREES_PER_SEC);
  }

  // Walk in the chosen direction until we reach the target distance
  bot.setControlState(dir, true);

  let actualDistance = 0;
  const forwardStartTime = Date.now();
  try {
    while (bot.entity.position.distanceTo(startPos) < distance) {
      // Check for timeout
      if (Date.now() - forwardStartTime > walkTimeoutMs) {
        console.log(
          `[${bot.username}] Walk timeout (${args.walk_timeout}s) reached while walking ${dir}`
        );
        break;
      }
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
  let returnDir;
  if (flipCameraInReturn) {
    await lookSmooth(
      bot,
      bot.entity.yaw + Math.PI,
      bot.entity.pitch,
      CAMERA_SPEED_DEGREES_PER_SEC
    );
    console.log(`[${bot.username}] Flipped camera in return`);
    returnDir = dir;
  } else {
    // Define the reverse direction
    const reverseDir = {
      forward: "back",
      back: "forward",
      left: "right",
      right: "left",
    };
    returnDir = reverseDir[dir];
  }
  // Now return to the starting position by walking in the reverse direction
  console.log(
    `[${bot.username}] Returning to starting position by walking ${returnDir}`
  );

  bot.setControlState(returnDir, true);

  const returnStartTime = Date.now();
  try {
    // Walk back until we're close to the starting position
    while (bot.entity.position.distanceTo(startPos) > 1.0) {
      // Check for timeout
      if (Date.now() - returnStartTime > walkTimeoutMs) {
        console.log(
          `[${bot.username}] Walk timeout (${args.walk_timeout}s) reached while returning via ${returnDir}`
        );
        break;
      }
      await sleep(50); // Check position every 50ms
    }
  } finally {
    bot.setControlState(returnDir, false);
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
  if (lookAway) {
    await lookSmooth(
      bot,
      originalYaw,
      originalPitch,
      CAMERA_SPEED_DEGREES_PER_SEC
    );
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

  await lookSmooth(bot, targetYaw, targetPitch, degreesPerSecond, {
    logTarget: `[${bot.username}] Looking at (${targetPosition.x.toFixed(
      2
    )}, ${targetPosition.y.toFixed(2)}, ${targetPosition.z.toFixed(2)})`,
  });
}

/**
 * Smoothly rotates the bot to the given yaw and pitch, at the given speed.
 * Usage: await lookSmooth(bot, yaw, pitch, degreesPerSecond)
 * @param {Bot} bot
 * @param {number} targetYaw
 * @param {number} targetPitch
 * @param {number} degreesPerSecond
 * @param {object} [opts] - Optional: {logTarget: string}
 */
async function lookSmooth(
  bot,
  targetYaw,
  targetPitch,
  degreesPerSecond,
  opts = {}
) {
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

  if (opts.logTarget) {
    console.log(
      `${opts.logTarget} at ${degreesPerSecond}°/s over ${(
        totalTimeMs / 1000
      ).toFixed(2)}s`
    );
  } else {
    console.log(
      `[${bot.username}] Looking at yaw=${targetYaw.toFixed(
        2
      )}, pitch=${targetPitch.toFixed(2)} at ${degreesPerSecond}°/s over ${(
        totalTimeMs / 1000
      ).toFixed(2)}s`
    );
  }

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

async function run(bot, actionCount, lookAway) {
  const actions = [];
  if (lookAway) {
    actions.push(() =>
      walk(
        bot,
        rand(MIN_WALK_DISTANCE, MAX_WALK_DISTANCE),
        lookAway,
        /*flipCameraInReturn*/ true
      )
    );
    actions.push(() =>
      walk(
        bot,
        rand(MIN_WALK_DISTANCE, MAX_WALK_DISTANCE),
        lookAway,
        /*flipCameraInReturn*/ false
      )
    );
  } else {
    actions.push(() =>
      walk(
        bot,
        rand(MIN_WALK_DISTANCE, MAX_WALK_DISTANCE),
        lookAway,
        /*flipCameraInReturn*/ false
      )
    );
  }

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

async function runSingleEpisode(
  bot,
  sharedBotRng,
  coordinator,
  episodeNum,
  episodeCategory
) {
  console.log(
    `[${bot.username}] Starting episode ${episodeNum} in category ${episodeCategory}`
  );

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
function getOnSpawnFn(
  bot,
  host,
  receiverPort,
  sharedBotRng,
  coordinator,
  episodeCategory
) {
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

    const { x, y, z } = bot.entity.position;
    console.log(
      `[${bot.username}] spawned at (${x.toFixed(2)}, ${y.toFixed(
        2
      )}, ${z.toFixed(2)})`
    );

    // Initialize viewer once for the entire program
    mineflayerViewerhl(bot, {
      output: `${args.receiver_host}:${receiverPort}`,
      width: 640,
      height: 360,
      frames: 400,
    });

    // Run multiple episodes
    for (
      let episodeNum = args.start_episode_id;
      episodeNum < args.start_episode_id + args.episodes_num;
      episodeNum++
    ) {
      await runSingleEpisode(
        bot,
        sharedBotRng,
        coordinator,
        episodeNum,
        episodeCategory
      );
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
  episodeNum,
  episodeCategory
) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      "teleportPhase",
      bot.entity.position.clone(),
      "teleportPhase beginning"
    );

    // Generate desired distance between bots using sharedBotRng
    const desiredDistance =
      MIN_BOTS_DISTANCE +
      sharedBotRng() * (MAX_BOTS_DISTANCE - MIN_BOTS_DISTANCE);

    // Pick a random point in the world within the specified radius from center
    const randomAngle = sharedBotRng() * 2 * Math.PI;
    const randomDistance = sharedBotRng() * args.teleport_radius;

    const randomPointX =
      args.teleport_center_x + randomDistance * Math.cos(randomAngle);
    const randomPointZ =
      args.teleport_center_z + randomDistance * Math.sin(randomAngle);

    console.log(
      `[${bot.username}] picked random point at (${randomPointX.toFixed(
        2
      )}, ${randomPointZ.toFixed(
        2
      )}) with desired bot distance: ${desiredDistance.toFixed(2)}`
    );

    // Generate a random angle to position bots on opposite sides of the random point
    const botAngle = sharedBotRng() * 2 * Math.PI;

    // Calculate distance from random point to each bot (half the desired distance between bots)
    const halfDistance = desiredDistance / 2;

    let newX, newZ;

    // Position bots on opposite sides of the random point
    if (bot.username < otherBotName) {
      // Bot A goes in one direction
      newX = randomPointX + halfDistance * Math.cos(botAngle);
      newZ = randomPointZ + halfDistance * Math.sin(botAngle);
    } else {
      // Bot B goes in opposite direction
      newX = randomPointX - halfDistance * Math.cos(botAngle);
      newZ = randomPointZ - halfDistance * Math.sin(botAngle);
    }

    // Use land_pos to determine proper Y coordinate
    const landPosition = land_pos(bot, newX, newZ);
    const currentPos = bot.entity.position.clone();
    const newY = landPosition ? landPosition.y + 1 : currentPos.y;

    // Compute the other bot's new position (opposite side of the random point)
    let otherBotNewX, otherBotNewZ;
    if (bot.username < otherBotName) {
      // This bot goes in one direction, other bot goes in opposite direction
      otherBotNewX = randomPointX - halfDistance * Math.cos(botAngle);
      otherBotNewZ = randomPointZ - halfDistance * Math.sin(botAngle);
    } else {
      // This bot goes in opposite direction, other bot goes in initial direction
      otherBotNewX = randomPointX + halfDistance * Math.cos(botAngle);
      otherBotNewZ = randomPointZ + halfDistance * Math.sin(botAngle);
    }

    // Estimate other bot's Y coordinate
    const otherBotLandPosition = land_pos(bot, otherBotNewX, otherBotNewZ);
    const otherBotNewY = otherBotLandPosition
      ? otherBotLandPosition.y + 1
      : otherBotPosition.y;

    const computedOtherBotPosition = new Vec3(
      otherBotNewX,
      otherBotNewY,
      otherBotNewZ
    );

    console.log(
      `[${bot.username}] teleporting to (${newX.toFixed(2)}, ${newY.toFixed(
        2
      )}, ${newZ.toFixed(2)})`
    );
    console.log(
      `[${bot.username}] other bot will be at (${otherBotNewX.toFixed(
        2
      )}, ${otherBotNewY.toFixed(2)}, ${otherBotNewZ.toFixed(2)})`
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
    await lookAtSmooth(
      bot,
      computedOtherBotPosition,
      CAMERA_SPEED_DEGREES_PER_SEC
    );
    await sleep(1000);
    console.log(`[${bot.username}] starting episode recording`);
    bot.emit("startepisode", episodeNum === 0 ? 50 : 0);
    await sleep(episodeNum === 0 ? 6000 : 1000);

    const iterationID = 0;
    if (episodeCategory === "look") {
      coordinator.onceEvent(
        `walkLookPhase_${iterationID}`,
        getOnWalkLookPhaseFn(
          bot,
          sharedBotRng,
          coordinator,
          iterationID,
          args.other_bot_name,
          episodeNum
        )
      );
      coordinator.sendToOtherBot(
        `walkLookPhase_${iterationID}`,
        bot.entity.position.clone(),
        "teleportPhase end"
      );
    } else if (episodeCategory === "look_away") {
      coordinator.onceEvent(
        `walkLookAwayPhase_${iterationID}`,
        getOnWalkLookAwayPhaseFn(
          bot,
          sharedBotRng,
          coordinator,
          iterationID,
          args.other_bot_name,
          episodeNum
        )
      );
      coordinator.sendToOtherBot(
        `walkLookAwayPhase_${iterationID}`,
        bot.entity.position.clone(),
        "teleportPhase end"
      );
    } else {
      console.error(
        `[${bot.username}] Invalid episode category: ${episodeCategory}`
      );
      process.exit(1);
    }
  };
}
function getOnWalkLookPhaseFn(
  bot,
  sharedBotRng,
  coordinator,
  iterationID,
  otherBotName,
  episodeNum
) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      `walkLookPhase_${iterationID}`,
      bot.entity.position.clone(),
      `walkLookPhase_${iterationID} beginning`
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
      await run(bot, actionCount, /*lookAway*/ false);
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
        `walkLookPhase_${iterationID} end`
      );
      return;
    }
    const nextIterationID = iterationID + 1;
    coordinator.onceEvent(
      `walkLookPhase_${nextIterationID}`,
      getOnWalkLookPhaseFn(
        bot,
        sharedBotRng,
        coordinator,
        nextIterationID,
        args.other_bot_name,
        episodeNum
      )
    );
    coordinator.sendToOtherBot(
      `walkLookPhase_${nextIterationID}`,
      bot.entity.position.clone(),
      `walkLookPhase_${iterationID} end`
    );
  };
}
function getOnWalkLookAwayPhaseFn(
  bot,
  sharedBotRng,
  coordinator,
  iterationID,
  otherBotName,
  episodeNum
) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      `walkLookAwayPhase_${iterationID}`,
      bot.entity.position.clone(),
      `walkLookAwayPhase_${iterationID} beginning`
    );
    const actionCount =
      MIN_RUN_ACTIONS +
      Math.floor(sharedBotRng() * (MAX_RUN_ACTIONS - MIN_RUN_ACTIONS + 1));

    // Define three walking phase modes and randomly pick one using sharedBotRng
    const walkingModes = ["lower_name_walks", "bigger_name_walks"];
    const selectedMode =
      walkingModes[Math.floor(sharedBotRng() * walkingModes.length)];

    console.log(
      `[iter ${iterationID}] [${bot.username}] starting walk phase with ${actionCount} actions - mode: ${selectedMode}`
    );

    // Determine if this bot should walk based on the selected mode
    let shouldThisBotWalk = false;

    switch (selectedMode) {
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
      await run(bot, actionCount, /*lookAway*/ true);
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
        `walkLookAwayPhase_${iterationID} end`
      );
      return;
    }
    const nextIterationID = iterationID + 1;
    coordinator.onceEvent(
      `walkLookAwayPhase_${nextIterationID}`,
      getOnWalkLookAwayPhaseFn(
        bot,
        sharedBotRng,
        coordinator,
        nextIterationID,
        args.other_bot_name,
        episodeNum
      )
    );
    coordinator.sendToOtherBot(
      `walkLookAwayPhase_${nextIterationID}`,
      bot.entity.position.clone(),
      `walkLookAwayPhase_${iterationID} end`
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
