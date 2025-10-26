const mineflayerViewerhl = require("prismarine-viewer-colalab").headless;
const Vec3 = require("vec3").Vec3;
const { sleep } = require("../utils/helpers");
const { Rcon } = require("rcon-client");
const seedrandom = require("seedrandom");
const { land_pos, lookAtSmooth } = require("../utils/movement");
const { rconTp } = require("../utils/coordination");
const { waitForCameras } = require("../utils/camera-ready");
const { getOnStraightLineWalkPhaseFn } = require("./straight-line-episode");
const { getOnChasePhaseFn } = require("./chase-episode");
const { getOnOrbitPhaseFn } = require("./orbit-episode");
const { getOnMVCTestPhaseFn } = require("./mvc-test-episode");
const { getOnBridgeBuilderPhaseFn } = require("./bridge-builder-episode");
const { getOnWalkLookPhaseFn } = require("./walk-look-episode");
const { getOnWalkLookAwayPhaseFn } = require("./walk-look-away-episode");
const {
  MIN_BOTS_DISTANCE,
  MAX_BOTS_DISTANCE,
  DEFAULT_CAMERA_SPEED_DEGREES_PER_SEC,
} = require("../utils/constants");
const { getOnPVEPhaseFn } = require("./pve-episode");

// Import episode-specific handlers
const episodeTypes = [
  // "chase",
  // "orbit",
  // "walkLook",
  // "walkLookAway",
  "pve",
  // "mvcTest"  // Add MVC test episode for validation
  // "bridgeBuilder"  // Add cooperative bridge building episode
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
  run_id,
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
      getOnPeerErrorPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        episodeNum,
        run_id,
        args
      )
    );

    coordinator.onceEvent(
      "teleportPhase",
      getOnTeleportPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        episodeNum,
        run_id,
        args
      )
    );
    coordinator.sendToOtherBot(
      "teleportPhase",
      bot.entity.position.clone(),
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
    "error notifier"
  );
  coordinator.onceEvent(
    "stopPhase",
    getOnStopPhaseFn(bot, sharedBotRng, coordinator, args.other_bot_name)
  );
  coordinator.sendToOtherBot(
    "stopPhase",
    bot.entity.position.clone(),
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
    });
    const rcon = await Rcon.connect({
      host: args.rcon_host,
      port: args.rcon_port,
      password: args.rcon_password,
    });
    // Run multiple episodes
    for (
      let episodeNum = args.start_episode_id;
      episodeNum < args.start_episode_id + args.episodes_num;
      episodeNum++
    ) {
      const botsRngBaseSeed = args.bot_rng_seed;
      // Concatenate episodeNum to the seed string to get a unique, reproducible seed per episode
      const botsRngSeedWithEpisode = `${botsRngBaseSeed}_${episodeNum}`;
      const sharedBotRng = seedrandom(botsRngSeedWithEpisode);
      await runSingleEpisode(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        episodeNum,
        args.run_id,
        args
      );
      console.log(`[${bot.username}] Episode ${episodeNum} completed`);
    }
    await rcon.end();

    console.log(
      `[${bot.username}] All ${args.episodes_num} episodes completed`
    );
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
  run_id,
  args
) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      "teleportPhase",
      bot.entity.position.clone(),
      "teleportPhase beginning"
    );
    if (args.teleport) {
      otherBotPosition = await teleport(
        bot,
        rcon,
        sharedBotRng,
        args,
        otherBotPosition
      );
    }

    // Generate desired distance between bots using sharedBotRng
    await lookAtSmooth(
      bot,
      otherBotPosition,
      DEFAULT_CAMERA_SPEED_DEGREES_PER_SEC
    );
    await sleep(1000);
    console.log(`[${bot.username}] starting episode recording`);
    bot.emit("startepisode", 0);
    // await sleep(episodeNum === 0 ? 6000 : 1000);

    startEpisode(
      bot,
      rcon,
      sharedBotRng,
      coordinator,
      episodeNum,
      args,
      getOnStopPhaseFn
    );
  };
}
async function teleport(bot, rcon, sharedBotRng, args, otherBotPosition) {
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

/**
 * Start an episode by selecting episode type and initializing the appropriate handler
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} episodeNum - Episode number
 * @param {Object} args - Configuration arguments
 * @param {Function} getOnStopPhaseFn - Function to get stop phase handler
 */
function startEpisode(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  episodeNum,
  args,
  getOnStopPhaseFn
) {
  // Add episode type selection - Enable multiple types for diverse data collection
  const selectedEpisodeType =
    episodeTypes[Math.floor(sharedBotRng() * episodeTypes.length)];

  console.log(
    `[${bot.username}] Selected episode type: ${selectedEpisodeType}`
  );

  const iterationID = 0;
  if (selectedEpisodeType === "straightLineWalk") {
    coordinator.onceEvent(
      `straightLineWalkPhase_${iterationID}`,
      getOnStraightLineWalkPhaseFn(
        bot,
        sharedBotRng,
        coordinator,
        iterationID,
        args.other_bot_name,
        episodeNum,
        getOnStopPhaseFn,
        args
      )
    );
    coordinator.sendToOtherBot(
      `straightLineWalkPhase_${iterationID}`,
      bot.entity.position.clone(),
      "teleportPhase end"
    );
  } else if (selectedEpisodeType === "chase") {
    coordinator.onceEvent(
      `chasePhase_${iterationID}`,
      getOnChasePhaseFn(
        bot,
        sharedBotRng,
        coordinator,
        iterationID,
        args.other_bot_name,
        episodeNum,
        getOnStopPhaseFn,
        args
      )
    );
    coordinator.sendToOtherBot(
      `chasePhase_${iterationID}`,
      bot.entity.position.clone(),
      "teleportPhase end"
    );
  } else if (selectedEpisodeType === "orbit") {
    coordinator.onceEvent(
      `orbitPhase_${iterationID}`,
      getOnOrbitPhaseFn(
        bot,
        sharedBotRng,
        coordinator,
        iterationID,
        args.other_bot_name,
        episodeNum,
        getOnStopPhaseFn,
        args
      )
    );
    coordinator.sendToOtherBot(
      `orbitPhase_${iterationID}`,
      bot.entity.position.clone(),
      "teleportPhase end"
    );
  } else if (selectedEpisodeType === "mvcTest") {
    coordinator.onceEvent(
      `mvcTestPhase_${iterationID}`,
      getOnMVCTestPhaseFn(
        bot,
        sharedBotRng,
        coordinator,
        iterationID,
        args.other_bot_name,
        episodeNum,
        getOnStopPhaseFn,
        args
      )
    );
    coordinator.sendToOtherBot(
      `mvcTestPhase_${iterationID}`,
      bot.entity.position.clone(),
      "teleportPhase end"
    );
  } else if (selectedEpisodeType === "bridgeBuilder") {
    coordinator.onceEvent(
      `bridgeBuilderPhase_${iterationID}`,
      getOnBridgeBuilderPhaseFn(
        bot,
        sharedBotRng,
        coordinator,
        iterationID,
        args.other_bot_name,
        episodeNum,
        getOnStopPhaseFn,
        args
      )
    );
    coordinator.sendToOtherBot(
      `bridgeBuilderPhase_${iterationID}`,
      bot.entity.position.clone(),
      "teleportPhase end"
    );
  } else if (selectedEpisodeType === "walkLook") {
    // Original walkAndLook episode
    coordinator.onceEvent(
      `walkLookPhase_${iterationID}`,
      getOnWalkLookPhaseFn(
        bot,
        sharedBotRng,
        coordinator,
        iterationID,
        episodeNum,
        getOnStopPhaseFn,
        args
      )
    );
    coordinator.sendToOtherBot(
      `walkLookPhase_${iterationID}`,
      bot.entity.position.clone(),
      "teleportPhase end"
    );
  } else if (selectedEpisodeType === "walkLookAway") {
    coordinator.onceEvent(
      `walkLookAwayPhase_${iterationID}`,
      getOnWalkLookAwayPhaseFn(
        bot,
        sharedBotRng,
        coordinator,
        iterationID,
        episodeNum,
        getOnStopPhaseFn,
        args
      )
    );
    coordinator.sendToOtherBot(
      `walkLookAwayPhase_${iterationID}`,
      bot.entity.position.clone(),
      "teleportPhase end"
    );
  } else if (selectedEpisodeType === "pve") {
    coordinator.onceEvent(
      `pvePhase`,
      getOnPVEPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        episodeNum,
        getOnStopPhaseFn,
        args
      )
    );
    coordinator.sendToOtherBot(
      `pvePhase`,
      { position: bot.entity.position.clone() },
      "teleportPhase end"
    );
  } else {
    throw new Error(
      `Invalid episode type: ${selectedEpisodeType}, allowed types are: ${episodeTypes.join(
        ", "
      )}`
    );
  }
}
function getOnPeerErrorPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  episodeNum,
  run_id,
  args
) {
  return async (phaseDataOther) => {
    console.error(
      `[${bot.username}] Received peerErrorPhase_${episodeNum} from peer, stopping.`,
      phaseDataOther["reason"]
    );
    coordinator.onceEvent(
      "stopPhase",
      getOnStopPhaseFn(bot, sharedBotRng, coordinator, args.other_bot_name)
    );
    coordinator.sendToOtherBot(
      "stopPhase",
      bot.entity.position.clone(),
      `peerErrorPhase_${episodeNum} end`
    );
  };
}
/**
 * Get stop phase handler function
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {string} otherBotName - Other bot name
 * @returns {Function} Stop phase handler
 */
function getOnStopPhaseFn(bot, sharedBotRng, coordinator, otherBotName) {
  return async (otherBotPosition) => {
    if (bot._episodeStopping) {
      console.log(
        `[${bot.username}] Episode already stopping, skipping stop phase.`
      );
      return;
    }
    bot._episodeStopping = true;
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
    await sleep(1000);

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

/**
 * Get stopped phase handler function
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {string} otherBotName - Other bot name
 * @param {Function} episodeResolve - Episode resolve function
 * @returns {Function} Stopped phase handler
 */
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

    console.log(`[${bot.username}] stopped`);
    // Resolve the episode promise instead of exiting
    episodeResolve();
  };
}

module.exports = {
  runSingleEpisode,
  getOnSpawnFn,
  getOnTeleportPhaseFn,
  getOnStopPhaseFn,
  getOnStoppedPhaseFn,
};
