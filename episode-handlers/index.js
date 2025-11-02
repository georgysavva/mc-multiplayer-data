const fs = require("fs/promises");
const path = require("path");
const mineflayerViewerhl = require("prismarine-viewer-colalab").headless;
const Vec3 = require("vec3").Vec3;
const { sleep } = require("../utils/helpers");
const { Rcon } = require("rcon-client");
const seedrandom = require("seedrandom");
const { land_pos, lookAtSmooth, stopAll } = require("../utils/movement");
const { rconTp } = require("../utils/coordination");
const { waitForCameras } = require("../utils/camera-ready");
const {
  MIN_BOTS_DISTANCE,
  MAX_BOTS_DISTANCE,
  DEFAULT_CAMERA_SPEED_DEGREES_PER_SEC,
} = require("../utils/constants");
const { ensureBotHasEnough, unequipHand } = require("../utils/items");

// Import episode classes
const { StraightLineEpisode } = require("./straight-line-episode");
const { ChaseEpisode } = require("./chase-episode");
const { OrbitEpisode } = require("./orbit-episode");
const { WalkLookEpisode } = require("./walk-look-episode");
const { WalkLookAwayEpisode } = require("./walk-look-away-episode");
const { PvpEpisode } = require("./pvp-episode");
const { BuildStructureEpisode } = require("./build-structure-episode");
const { BuildTowerEpisode } = require("./build-tower-episode");
const { MineEpisode } = require("./mine-episode");
const { PveEpisode } = require("./pve-episode");
const { TowerBridgeEpisode } = require("./tower-bridge-episode");
const { CollectorEpisode } = require("./collector-episode");

// Map episode type strings to their class implementations
const episodeClassMap = {
  straightLineWalk: StraightLineEpisode,
  chase: ChaseEpisode,
  orbit: OrbitEpisode,
  walkLook: WalkLookEpisode,
  walkLookAway: WalkLookAwayEpisode,
  pvp: PvpEpisode,
  pve: PveEpisode,
  buildStructure: BuildStructureEpisode,
  buildTower: BuildTowerEpisode,
  mine: MineEpisode,
  towerBridge: TowerBridgeEpisode,
  collector: CollectorEpisode,
};

// Import episode-specific handlers

// Add episode type selection - Enable multiple types for diverse data collection
// Default episode types list
const defaultEpisodeTypes = [
  "straightLineWalk",
  "chase",
  "orbit",
  "walkLook",
  "walkLookAway",
  "pvp",
  "pve",
  "buildStructure",
  "buildTower",
  "mine",
  "towerBridge",
  "collector",
];

// Load episode types from environment variable or use default
const episodeTypes =
  process.env.EPISODE_TYPES && process.env.EPISODE_TYPES !== "all"
    ? process.env.EPISODE_TYPES.split(",").map((type) => type.trim())
    : defaultEpisodeTypes;

function formatDateForFilename(date) {
  const pad = (value, length = 2) => String(value).padStart(length, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate()
  )}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function saveEpisodeInfo({
  args,
  bot,
  episodeInstance,
  episodeNum,
  episodeType,
}) {
  const now = new Date();
  const formattedTimestamp = formatDateForFilename(now);
  const episodeNumStr = String(episodeNum).padStart(6, "0");
  const instanceId = args.instance_id ?? 0;
  const instanceIdStr = String(instanceId).padStart(3, "0");
  const botName = args.bot_name;
  const outputDir = args.output_dir;

  await fs.mkdir(outputDir, { recursive: true });

  const baseFileName = `${formattedTimestamp}_${episodeNumStr}_${botName}_instance_${instanceIdStr}_episode_info`;
  const filePath = path.join(outputDir, `${baseFileName}.json`);

  const payload = {
    timestamp: now.toISOString(),
    bot_name: botName,
    world_type: args.world_type,
    episode_number: episodeNum,
    episode_type: episodeType,
    instance_id: instanceId,
    encountered_error: Boolean(episodeInstance?._encounteredError),
    peer_encountered_error: Boolean(episodeInstance?._peerError),
    bot_died: Boolean(episodeInstance?._botDied),
    episode_recording_started: Boolean(
      episodeInstance?._episodeRecordingStarted
    ),
  };

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
  console.log(
    `[${bot.username}] Saved episode info to ${filePath} (encountered_error=${payload.encountered_error}, peer_encountered_error=${payload.peer_encountered_error}, bot_died=${payload.bot_died})`
  );
}
/**
 * Run a single episode
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} episodeNum - Episode number
 * @param {string} run_id - Run ID
 * @param {Object} args - Configuration arguments
 * @returns {Promise} Promise that resolves when episode completes
 */
async function runSingleEpisode(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  episodeNum,
  episodeInstance,
  args
) {
  console.log(`[${bot.username}] Starting episode ${episodeNum}`);

  episodeInstance._botDied = false;
  episodeInstance._episodeRecordingStarted = false;

  return new Promise((resolve) => {
    // Reset episode stopping guard at the start of each episode
    bot._episodeStopping = false;

    // Episode-scoped error handler that captures this episode number
    let episodeErrorHandled = false;
    const handleAnyError = async (err) => {
      if (episodeErrorHandled) {
        console.log(
          `[${bot.username}] Episode ${episodeNum} error already handled, skipping.`
        );
        return;
      }
      episodeErrorHandled = true;
      episodeInstance._encounteredError = true;
      await notifyPeerErrorAndStop(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        episodeNum,
        episodeInstance,
        args,
        err
      );
    };
    const handleBotDeath = () => {
      console.warn(
        `[${bot.username}] Episode ${episodeNum} detected bot death`
      );
      episodeInstance._botDied = true;
    };
    const cleanupErrorHandlers = () => {
      process.removeListener("unhandledRejection", handleAnyError);
      process.removeListener("uncaughtException", handleAnyError);
    };
    const cleanupEpisodeScopedHandlers = () => {
      cleanupErrorHandlers();
      bot.removeListener("death", handleBotDeath);
    };
    process.on("unhandledRejection", handleAnyError);
    process.on("uncaughtException", handleAnyError);
    bot.once("death", handleBotDeath);

    // Ensure we clean up episode-scoped handlers when the episode resolves
    bot._currentEpisodeResolve = () => {
      cleanupEpisodeScopedHandlers();
      resolve(undefined);
    };

    const { x, y, z } = bot.entity.position;
    console.log(
      `[${bot.username}] episode ${episodeNum} at (${x.toFixed(2)}, ${y.toFixed(
        2
      )}, ${z.toFixed(2)})`
    );

    coordinator.onceEvent(
      `peerErrorPhase_${episodeNum}`,
      episodeNum,
      getOnPeerErrorPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        episodeNum,
        episodeInstance,
        args
      )
    );

    coordinator.onceEvent(
      "teleportPhase",
      episodeNum,
      getOnTeleportPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        episodeNum,
        episodeInstance,
        args
      )
    );
    coordinator.sendToOtherBot(
      "teleportPhase",
      bot.entity.position.clone(),
      episodeNum,
      "spawnPhase end"
    );
  });
}

async function notifyPeerErrorAndStop(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  episodeNum,
  episodeInstance,
  args,
  error
) {
  const reason = error && error.message ? error.message : String(error);
  console.error(
    `[${bot.username}] Episode ${episodeNum} encountered an error:`,
    error
  );
  coordinator.sendToOtherBot(
    `peerErrorPhase_${episodeNum}`,
    { reason },
    episodeNum,
    "error notifier"
  );
  coordinator.onceEvent(
    "stopPhase",
    episodeNum,
    episodeInstance.getOnStopPhaseFn(
      bot,
      rcon,
      sharedBotRng,
      coordinator,
      args.other_bot_name,
      episodeNum,
      args
    )
  );
  coordinator.sendToOtherBot(
    "stopPhase",
    bot.entity.position.clone(),
    episodeNum,
    `error notifier end`
  );
  // Initiate our own stop sequence
}

/**
 * Setup bot protection effects and world rules (called once per bot)
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Rcon} rcon - RCON connection instance
 */
async function setupBotAndWorldOnce(bot, rcon) {
  const resistEffectRes = await rcon.send(
    `effect give ${bot.username} minecraft:resistance 999999 255 true`
  );
  console.log(`[${bot.username}] resistEffectRes=${resistEffectRes}`);
  const waterBreathingEffectRes = await rcon.send(
    `effect give ${bot.username} minecraft:water_breathing 999999 0 true`
  );
  console.log(
    `[${bot.username}] waterBreathingEffectRes=${waterBreathingEffectRes}`
  );
  const fallDamageRes = await rcon.send(
    `attribute ${bot.username} minecraft:fall_damage_multiplier base set 0`
  );
  console.log(`[${bot.username}] fallDamageRes=${fallDamageRes}`);
  const difficultyRes = await rcon.send("difficulty peaceful"); // or hard
  console.log(
    `[${bot.username}] set difficulty to peaceful, difficultyRes=${difficultyRes}`
  );
  const fallDamageGameruleRes = await rcon.send("gamerule fallDamage false");
  console.log(
    `[${bot.username}] set fallDamage gamerule to false, fallDamageGameruleRes=${fallDamageGameruleRes}`
  );
  const doImmediateRespawnRes = await rcon.send(
    "gamerule doImmediateRespawn true"
  );
  console.log(
    `[${bot.username}] set doImmediateRespawn gamerule to true, doImmediateRespawnRes=${doImmediateRespawnRes}`
  );
  const keepInventoryRes = await rcon.send("gamerule keepInventory true");
  console.log(
    `[${bot.username}] set keepInventory gamerule to true, keepInventoryRes=${keepInventoryRes}`
  );
  const showDeathMessagesRes = await rcon.send(
    "gamerule showDeathMessages false"
  );
  console.log(
    `[${bot.username}] set showDeathMessages gamerule to false, showDeathMessagesRes=${showDeathMessagesRes}`
  );
  const givePickaxeRes = await rcon.send(
    `give ${bot.username} minecraft:diamond_pickaxe 1`
  );
  console.log(`[${bot.username}] givePickaxeRes=${givePickaxeRes}`);
  const giveShovelRes = await rcon.send(
    `give ${bot.username} minecraft:diamond_shovel 1`
  );
  console.log(`[${bot.username}] giveShovelRes=${giveShovelRes}`);
}

/**
 * Setup camera player protection effects (called once per camera)
 * @param {Bot} bot - Mineflayer bot instance (used to derive camera username)
 * @param {Rcon} rcon - RCON connection instance
 */
async function setupCameraPlayerOnce(bot, rcon) {
  const cameraUsername = `Camera${bot.username}`;
  const resistEffectResCamera = await rcon.send(
    `effect give ${cameraUsername} minecraft:resistance 999999 255 true`
  );
  console.log(`[${cameraUsername}] resistEffectRes=${resistEffectResCamera}`);
  const waterBreathingEffectResCamera = await rcon.send(
    `effect give ${cameraUsername} minecraft:water_breathing 999999 0 true`
  );
  console.log(
    `[${cameraUsername}] waterBreathingEffectRes=${waterBreathingEffectResCamera}`
  );
  const fallDamageResCamera = await rcon.send(
    `attribute ${cameraUsername} minecraft:fall_damage_multiplier base set 0`
  );
  console.log(`[${cameraUsername}] fallDamageRes=${fallDamageResCamera}`);
}

/**
 * Setup bot and camera saturation effects for each episode
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Rcon} rcon - RCON connection instance
 * @param {Object} args - Configuration arguments
 */
async function setupBotAndCameraForEpisode(bot, rcon, args) {
  await ensureBotHasEnough(bot, rcon, "stone", 128);
  const saturationEffectRes = await rcon.send(
    `effect give ${bot.username} minecraft:saturation 999999 255 true`
  );
  console.log(`[${bot.username}] saturationEffectRes=${saturationEffectRes}`);
  if (args.enable_camera_wait) {
    const camRes = await rcon.send(
      `effect give Camera${bot.username} minecraft:saturation 999999 255 true`
    );
    console.log(`[${bot.username}] Camera saturationEffectRes=${camRes}`);
  }
  await sleep(1000);
  console.log(`[${bot.username}] unequipping hand before episode`);
  await unequipHand(bot);
}

/**
 * Get spawn phase handler function
 * @param {Bot} bot - Mineflayer bot instance
 * @param {string} host - Server host
 * @param {number} receiverPort - Receiver port
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {Object} args - Configuration arguments
 * @returns {Function} Spawn phase handler
 */
function getOnSpawnFn(bot, host, receiverPort, coordinator, args) {
  return async () => {
    bot.pathfinder.thinkTimeout = 7500; // max total planning time per path (ms)
    bot.pathfinder.tickTimeout = 15; // max CPU per tick spent "thinking" (ms)
    bot.pathfinder.searchRadius = 96; // don’t search beyond ~6 chunks from the bot
    bot.pathfinder.maxDropDown = 15;
    const rcon = await Rcon.connect({
      host: args.rcon_host,
      port: args.rcon_port,
      password: args.rcon_password,
    });
    await setupBotAndWorldOnce(bot, rcon);

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

    // Wait for both cameras to join before starting recording
    if (args.enable_camera_wait) {
      console.log(`[${bot.username}] Waiting for cameras to join server...`);
      const camerasReady = await waitForCameras(
        args.rcon_host,
        args.rcon_port,
        args.rcon_password,
        args.camera_ready_retries,
        args.camera_ready_check_interval
      );

      if (!camerasReady) {
        console.error(
          `[${bot.username}] Cameras failed to join within timeout. Exiting.`
        );
        process.exit(1);
      }
      // Give resistance to the camera bot paired with this bot, e.g., if Alpha then AlphaCamera
      await setupCameraPlayerOnce(bot, rcon);

      console.log(
        `[${bot.username}] Cameras detected, waiting ${args.bootstrap_wait_time}s for popups to clear...`
      );
      await sleep(args.bootstrap_wait_time * 1000);
    }

    // Initialize viewer once for the entire program
    mineflayerViewerhl(bot, {
      output: `${host}:${receiverPort}`,
      width: 640,
      height: 360,
      frames: 400,
      disableRendering: args.viewer_rendering_disabled,
      interval: 50,
    });
    // Run multiple episodes
    // Respect world type for eligible episode filtering
    const worldType = (args.world_type || "flat").toLowerCase();
    const isFlatWorld = worldType === "flat";
    const allEpisodeTypes = episodeTypes;
    const eligibleEpisodeTypesForWorld = isFlatWorld
      ? allEpisodeTypes
      : allEpisodeTypes.filter(
          (type) => episodeClassMap[type].WORKS_IN_NON_FLAT_WORLD === true
        );

    if (!isFlatWorld && eligibleEpisodeTypesForWorld.length === 0) {
      throw new Error(
        "No episodes are eligible for normal world. Mark episode classes with WORKS_IN_NON_FLAT_WORLD = true."
      );
    }
    const sortedEligible = eligibleEpisodeTypesForWorld.slice().sort();

    // In smoke test mode, iterate over all eligible episode types in alphabetical order
    let episodesToRun = [];
    if (args.smoke_test === 1) {
      episodesToRun = sortedEligible.map((episodeType, index) => ({
        episodeNum: args.start_episode_id + index,
        episodeType: episodeType,
      }));
      console.log(
        `[${bot.username}] SMOKE TEST MODE: Running ${episodesToRun.length} eligible episode types (world_type=${worldType}) in alphabetical order`
      );
    } else {
      // Normal mode: use the configured episodes_num, episode type picked at random from eligible
      for (let i = 0; i < args.episodes_num; i++) {
        episodesToRun.push({
          episodeNum: args.start_episode_id + i,
          episodeType: null, // Will be randomly selected
        });
      }
    }

    for (const episodeConfig of episodesToRun) {
      const episodeNum = episodeConfig.episodeNum;
      const botsRngBaseSeed = args.bot_rng_seed;
      // Concatenate episodeNum to the seed string to get a unique, reproducible seed per episode
      const botsRngSeedWithEpisode = `${botsRngBaseSeed}_${episodeNum}`;
      const sharedBotRng = seedrandom(botsRngSeedWithEpisode);

      // Select episode type
      const selectedEpisodeType =
        args.smoke_test === 1
          ? episodeConfig.episodeType
          : sortedEligible[Math.floor(sharedBotRng() * sortedEligible.length)];

      console.log(
        `[${bot.username}] Selected episode type: ${selectedEpisodeType}`
      );

      // Get the episode class for the selected type
      const EpisodeClass = episodeClassMap[selectedEpisodeType];

      if (!EpisodeClass) {
        throw new Error(
          `Invalid episode type: ${selectedEpisodeType}, allowed types are: ${sortedEligible.join(
            ", "
          )}`
        );
      }

      // Create an instance of the episode class
      const episodeInstance = new EpisodeClass(sharedBotRng);

      console.log(
        `[${bot.username}] Created ${EpisodeClass.name} instance for episode ${episodeNum}`
      );
      await runSingleEpisode(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        episodeNum,
        episodeInstance,
        args
      );
      await coordinator.waitForAllPhasesToFinish();

      // Force stop bot.pvp and pathfinder navigation
      if (bot.pvp) {
        bot.pvp.forceStop();
        console.log(`[${bot.username}] Stopped PVP for episode ${episodeNum}`);
      }
      if (bot.pathfinder) {
        bot.pathfinder.setGoal(null);
        console.log(
          `[${bot.username}] Stopped pathfinder navigation for episode ${episodeNum}`
        );
      }
      stopAll(bot);

      console.log(`[${bot.username}] tearing down episode ${episodeNum}`);
      try {
        await episodeInstance.tearDownEpisode(
          bot,
          rcon,
          sharedBotRng,
          coordinator,
          episodeNum,
          args
        );
      } catch (err) {
        console.error(
          `[${bot.username}] Error during tearDownEpisode, continuing:`,
          err
        );
      }
      console.log(`[${bot.username}] Episode ${episodeNum} completed`);
      await saveEpisodeInfo({
        args,
        bot,
        episodeInstance,
        episodeNum,
        episodeType: selectedEpisodeType,
      });
      console.log(`[${bot.username}] Syncing bots for episode ${episodeNum}`);
      await coordinator.syncBots(episodeNum);
      console.log(`[${bot.username}] Synced bots for episode ${episodeNum}`);
    }
    await rcon.end();

    const totalEpisodesRun = episodesToRun.length;
    console.log(`[${bot.username}] All ${totalEpisodesRun} episodes completed`);
    process.exit(0);
  };
}

/**
 * Get teleport phase handler function
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {string} otherBotName - Other bot name
 * @param {number} episodeNum - Episode number
 * @param {string} run_id - Run ID
 * @param {Object} args - Configuration arguments
 * @returns {Function} Teleport phase handler
 */
function getOnTeleportPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  episodeNum,
  episodeInstance,
  args
) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      "teleportPhase",
      bot.entity.position.clone(),
      episodeNum,
      "teleportPhase beginning"
    );

    if (args.teleport) {
      otherBotPosition = await teleport(
        bot,
        rcon,
        sharedBotRng,
        args,
        otherBotPosition,
        episodeInstance
      );
    }

    // Generate desired distance between bots using sharedBotRng
    await lookAtSmooth(
      bot,
      otherBotPosition,
      DEFAULT_CAMERA_SPEED_DEGREES_PER_SEC
    );
    console.log(`[${bot.username}] setting up episode ${episodeNum}`);
    try {
      await setupBotAndCameraForEpisode(bot, rcon, args);
    } catch (error) {
      console.error(
        `[${bot.username}] Failed to setup bot and camera for episode:`,
        error
      );
    }
    await episodeInstance.setupEpisode(
      bot,
      rcon,
      sharedBotRng,
      coordinator,
      episodeNum,
      args
    );

    await sleep(1000);
    console.log(`[${bot.username}] starting episode recording`);
    bot.emit("startepisode", episodeNum);
    episodeInstance._episodeRecordingStarted = true;
    await sleep(1000);
    // await sleep(episodeNum === 0 ? 6000 : 1000);

    // Call the entry point method
    const iterationID = 0;
    episodeInstance.entryPoint(
      bot,
      rcon,
      sharedBotRng,
      coordinator,
      iterationID,
      episodeNum,
      args
    );
  };
}
async function teleport(
  bot,
  rcon,
  sharedBotRng,
  args,
  otherBotPosition,
  episodeInstance
) {
  const desiredDistance =
    episodeInstance.constructor.INIT_MIN_BOTS_DISTANCE +
    sharedBotRng() *
      (episodeInstance.constructor.INIT_MAX_BOTS_DISTANCE -
        episodeInstance.constructor.INIT_MIN_BOTS_DISTANCE);

  console.log(
    `[${bot.username}] desired distance: ${desiredDistance.toFixed(2)}`
  );
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
  if (bot.username < args.other_bot_name) {
    // Bot A goes in one direction
    newX = randomPointX + halfDistance * Math.cos(botAngle);
    newZ = randomPointZ + halfDistance * Math.sin(botAngle);
  } else {
    // Bot B goes in opposite direction
    newX = randomPointX - halfDistance * Math.cos(botAngle);
    newZ = randomPointZ - halfDistance * Math.sin(botAngle);
  }

  // Use land_pos to determine proper Y coordinate
  const landPosition = await land_pos(bot, newX, newZ);
  const currentPos = bot.entity.position.clone();
  const newY = landPosition ? landPosition.y + 1 : currentPos.y;

  // Compute the other bot's new position (opposite side of the random point)
  let otherBotNewX, otherBotNewZ;
  if (bot.username < args.other_bot_name) {
    // This bot goes in one direction, other bot goes in opposite direction
    otherBotNewX = randomPointX - halfDistance * Math.cos(botAngle);
    otherBotNewZ = randomPointZ - halfDistance * Math.sin(botAngle);
  } else {
    // This bot goes in opposite direction, other bot goes in initial direction
    otherBotNewX = randomPointX + halfDistance * Math.cos(botAngle);
    otherBotNewZ = randomPointZ + halfDistance * Math.sin(botAngle);
  }

  // Estimate other bot's Y coordinate
  const otherBotLandPosition = await land_pos(bot, otherBotNewX, otherBotNewZ);
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
      rcon,
      bot.username,
      Math.floor(newX),
      Math.floor(newY),
      Math.floor(newZ)
    );
    // await sleep(1000);
    console.log(
      `[${
        bot.username
      }] teleport completed. New local position: (${newX.toFixed(
        2
      )}, ${newY.toFixed(2)}, ${newZ.toFixed(2)})`
    );
  } catch (error) {
    console.error(`[${bot.username}] teleport failed:`, error);
  }
  return computedOtherBotPosition;
}

function getOnPeerErrorPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  episodeNum,
  episodeInstance,
  args
) {
  return async (phaseDataOther) => {
    console.error(
      `[${bot.username}] Received peerErrorPhase_${episodeNum} from peer, stopping.`,
      phaseDataOther["reason"]
    );
    episodeInstance._peerError = true;
    coordinator.onceEvent(
      "stopPhase",
      episodeNum,
      episodeInstance.getOnStopPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        args.other_bot_name,
        episodeNum,
        args
      )
    );
    coordinator.sendToOtherBot(
      "stopPhase",
      bot.entity.position.clone(),
      episodeNum,
      `peerErrorPhase_${episodeNum} end`
    );
  };
}

module.exports = {
  runSingleEpisode,
  getOnSpawnFn,
  getOnTeleportPhaseFn,
  setupBotAndWorldOnce,
  setupCameraPlayerOnce,
  setupBotAndCameraForEpisode,
};
