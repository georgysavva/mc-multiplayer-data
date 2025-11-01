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
  // mine: MineEpisode,
  towerBridge: TowerBridgeEpisode,
};

// Import episode-specific handlers

// Add episode type selection - Enable multiple types for diverse data collection
const episodeTypes = [
  "straightLineWalk",
  "chase",
  "orbit",
  "walkLook",
  "walkLookAway",
  "pvp",
  "pve",
  "buildStructure",
  "buildTower",
  // "mine",
  "towerBridge",
];
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
    const cleanupErrorHandlers = () => {
      process.removeListener("unhandledRejection", handleAnyError);
      process.removeListener("uncaughtException", handleAnyError);
    };
    process.on("unhandledRejection", handleAnyError);
    process.on("uncaughtException", handleAnyError);

    // Ensure we clean up episode-scoped handlers when the episode resolves
    bot._currentEpisodeResolve = () => {
      cleanupErrorHandlers();
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
    const rcon = await Rcon.connect({
      host: args.rcon_host,
      port: args.rcon_port,
      password: args.rcon_password,
    });
    const resistEffectRes = await rcon.send(
      `effect give ${bot.username} minecraft:resistance 999999 255 true`
    );
    console.log(`[${bot.username}] resistEffectRes=${resistEffectRes}`);
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
    // In smoke test mode, iterate over all episode types in alphabetical order
    let episodesToRun = [];
    if (args.smoke_test === 1) {
      // Get all episode types and sort alphabetically
      const allEpisodeTypes = Object.keys(episodeClassMap).sort();
      episodesToRun = allEpisodeTypes.map((episodeType, index) => ({
        episodeNum: args.start_episode_id + index,
        episodeType: episodeType,
      }));
      console.log(
        `[${bot.username}] SMOKE TEST MODE: Running all ${episodesToRun.length} episode types in alphabetical order`
      );
    } else {
      // Normal mode: use the configured episode types and episodes_num
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
          : episodeTypes[Math.floor(sharedBotRng() * episodeTypes.length)];

      console.log(
        `[${bot.username}] Selected episode type: ${selectedEpisodeType}`
      );

      // Get the episode class for the selected type
      const EpisodeClass = episodeClassMap[selectedEpisodeType];

      if (!EpisodeClass) {
        throw new Error(
          `Invalid episode type: ${selectedEpisodeType}, allowed types are: ${episodeTypes.join(
            ", "
          )}`
        );
      }

      // Create an instance of the episode class
      const episodeInstance = new EpisodeClass({});

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
      console.log(`[${bot.username}] Syncing bots for episode ${episodeNum}`);
      await coordinator.syncBots(episodeNum);
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
    await episodeInstance.setupEpisode(
      bot,
      rcon,
      sharedBotRng,
      coordinator,
      episodeNum,
      args
    );

    console.log(`[${bot.username}] starting episode recording`);
    bot.emit("startepisode", 0);
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
  
  // Calculate current average position of both bots
  const currentPos = bot.entity.position.clone();
  const avgX = (currentPos.x + otherBotPosition.x) / 2;
  const avgZ = (currentPos.z + otherBotPosition.z) / 2;
  
  console.log(
    `[${bot.username}] current average position: (${avgX.toFixed(2)}, ${avgZ.toFixed(2)})`
  );
  
  // Use rejection sampling to find a point that's at least min_distance away
  let randomPointX, randomPointZ, distanceFromCurrent;
  let attempts = 0;
  const maxAttempts = 100;
  
  do {
    // Pick a random point in the world within the specified radius from center
    const randomAngle = sharedBotRng() * 2 * Math.PI;
    const randomDistance = sharedBotRng() * args.teleport_radius;

    randomPointX = args.teleport_center_x + randomDistance * Math.cos(randomAngle);
    randomPointZ = args.teleport_center_z + randomDistance * Math.sin(randomAngle);
    
    // Calculate distance from current average position
    const dx = randomPointX - avgX;
    const dz = randomPointZ - avgZ;
    distanceFromCurrent = Math.sqrt(dx * dx + dz * dz);
    
    attempts++;
    
    if (attempts >= maxAttempts) {
      console.warn(
        `[${bot.username}] Could not find point ${args.teleport_min_distance} blocks away after ${maxAttempts} attempts. Using best attempt with distance ${distanceFromCurrent.toFixed(2)}`
      );
      break;
    }
  } while (distanceFromCurrent < args.teleport_min_distance);

  console.log(
    `[${bot.username}] picked random point at (${randomPointX.toFixed(
      2
    )}, ${randomPointZ.toFixed(
      2
    )}) - ${distanceFromCurrent.toFixed(2)} blocks from current avg position (attempts: ${attempts}), desired bot distance: ${desiredDistance.toFixed(2)}`
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

  // Verify landing position is safe (not water/lava/leaves)
  // Try up to 5 times to find a safe landing spot
  let landPosition = await land_pos(bot, newX, newZ);
  let safetyAttempts = 0;
  const maxSafetyAttempts = 5;
  
  while (!landPosition && safetyAttempts < maxSafetyAttempts) {
    safetyAttempts++;
    console.log(
      `[${bot.username}] Unsafe landing at (${newX.toFixed(2)}, ${newZ.toFixed(2)}), attempt ${safetyAttempts}/${maxSafetyAttempts} to find safe spot`
    );
    
    // Try a new random position nearby (within 50 blocks)
    const offsetAngle = sharedBotRng() * 2 * Math.PI;
    const offsetDistance = 20 + sharedBotRng() * 30; // 20-50 blocks away
    newX = newX + offsetDistance * Math.cos(offsetAngle);
    newZ = newZ + offsetDistance * Math.sin(offsetAngle);
    
    landPosition = await land_pos(bot, newX, newZ);
  }
  
  if (!landPosition) {
    console.warn(
      `[${bot.username}] Could not find safe landing after ${maxSafetyAttempts} attempts. Using Y=128 anyway and hoping for the best.`
    );
  } else {
    console.log(
      `[${bot.username}] Found safe landing at Y=${landPosition.y.toFixed(2)} (ground level)`
    );
  }

  // Spawn at Y=128 and let bots fall to the ground
  // This ensures we never spawn inside blocks or in invalid locations
  const newY = 128;
  
  console.log(
    `[${bot.username}] Will spawn at Y=128 and fall to ground at (${newX.toFixed(2)}, ${newZ.toFixed(2)})`
  );
  
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

  // Verify other bot's landing position is safe too
  let otherBotLandPosition = await land_pos(bot, otherBotNewX, otherBotNewZ);
  let otherBotSafetyAttempts = 0;
  
  while (!otherBotLandPosition && otherBotSafetyAttempts < maxSafetyAttempts) {
    otherBotSafetyAttempts++;
    console.log(
      `[${bot.username}] Other bot unsafe landing at (${otherBotNewX.toFixed(2)}, ${otherBotNewZ.toFixed(2)}), attempt ${otherBotSafetyAttempts}/${maxSafetyAttempts}`
    );
    
    // Try a new random position nearby
    const offsetAngle = sharedBotRng() * 2 * Math.PI;
    const offsetDistance = 20 + sharedBotRng() * 30;
    otherBotNewX = otherBotNewX + offsetDistance * Math.cos(offsetAngle);
    otherBotNewZ = otherBotNewZ + offsetDistance * Math.sin(offsetAngle);
    
    otherBotLandPosition = await land_pos(bot, otherBotNewX, otherBotNewZ);
  }
  
  if (!otherBotLandPosition) {
    console.warn(
      `[${bot.username}] Could not find safe landing for other bot after ${maxSafetyAttempts} attempts.`
    );
  } else {
    console.log(
      `[${bot.username}] Other bot safe landing at Y=${otherBotLandPosition.y.toFixed(2)}`
    );
  }

  // Other bot also spawns at Y=128
  const otherBotNewY = 128;

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
    const tpResult = await rconTp(
      rcon,
      bot.username,
      Math.floor(newX),
      Math.floor(newY),
      Math.floor(newZ)
    );
    
    if (!tpResult.success) {
      console.error(
        `[${bot.username}] Teleport failed: ${tpResult.message}. Skipping teleportation for this episode.`
      );
      // Return current position if teleport fails
      return bot.entity.position.clone();
    }
    
    console.log(
      `[${bot.username}] Teleport completed successfully. Forceloaded ${tpResult.forceloadResult.loadedChunks.length} chunks.`
    );
    console.log(
      `[${
        bot.username
      }] New local position: (${newX.toFixed(2)}, ${newY.toFixed(
        2
      )}, ${newZ.toFixed(2)})`
    );
    
    // Wait for bot to fall and land on the ground
    console.log(`[${bot.username}] Waiting for bot to fall and land...`);
    await sleep(3000); // 3 seconds should be enough for falling from Y=128
    console.log(`[${bot.username}] Bot landed at Y=${bot.entity.position.y.toFixed(2)}`);
  } catch (error) {
    console.error(`[${bot.username}] Teleport error:`, error);
    // Return current position if teleport fails
    return bot.entity.position.clone();
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
};
