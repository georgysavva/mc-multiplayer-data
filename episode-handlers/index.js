const mineflayerViewerhl = require("prismarine-viewer-colalab").headless;
const Vec3 = require("vec3").Vec3;
const { sleep } = require('../utils/helpers');
const { land_pos, lookAtSmooth } = require('../utils/movement');
const { rconTp } = require('../utils/coordination');
const { waitForCameras } = require('../utils/camera-ready');
const {
  MIN_BOTS_DISTANCE,
  MAX_BOTS_DISTANCE,
  CAMERA_SPEED_DEGREES_PER_SEC,
  MIN_RUN_ACTIONS,
  MAX_RUN_ACTIONS
} = require('../utils/constants');

// Import episode-specific handlers
const { walkStraightWhileLooking, getOnStraightLineWalkPhaseFn } = require('./straight-line-episode');
const { chaseRunner, runFromChaser, getOnChasePhaseFn } = require('./chase-episode');
const { orbitAroundFixedPoint, getOnOrbitPhaseFn } = require('./orbit-episode');
const { testMVCBehavior, getOnMVCTestPhaseFn } = require('./mvc-test-episode');
// const { buildCooperativeBridge, getOnBridgeBuilderPhaseFn } = require('./bridge-builder-episode');
const { placeDirtBlock, getOnPlaceBlockPhaseFn } = require('./place-block-episode');
const { pvpCombatLoop, getOnPvpPhaseFn } = require('./pvp-episode');
const { buildStructure, getOnBuildPhaseFn } = require('./build-structure-episode');
const { buildTower, getOnBuildTowerPhaseFn } = require('./build-tower-episode');

// Add episode type selection - Enable multiple types for diverse data collection
const episodeTypes = [
  // "chase",
  // "orbit",
  // "pvp",
  // "buildWall",
  "buildTower",
  // "placeBlock",
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
async function runSingleEpisode(bot, sharedBotRng, coordinator, episodeNum, run_id, args) {
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
function getOnSpawnFn(bot, host, receiverPort, sharedBotRng, coordinator, args) {
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
      )}, ${z.toFixed(
        2
      )})`
    );

    // Wait for both cameras to join before starting recording
    console.log(`[${bot.username}] Waiting for cameras to join server...`);
    const camerasReady = await waitForCameras(
      args.rcon_host,
      args.rcon_port,
      args.rcon_password,
      args.camera_ready_retries,
      args.camera_ready_check_interval
    );

    if (!camerasReady) {
      console.error(`[${bot.username}] Cameras failed to join within timeout. Exiting.`);
      process.exit(1);
    }

    console.log(`[${bot.username}] Cameras detected, waiting ${args.bootstrap_wait_time}s for popups to clear...`);
    await sleep(args.bootstrap_wait_time * 1000);

    // Initialize viewer once for the entire program
    mineflayerViewerhl(bot, {
      output: `${host}:${receiverPort}`,
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
      await runSingleEpisode(bot, sharedBotRng, coordinator, episodeNum, args.run_id, args);
      console.log(`[${bot.username}] Episode ${episodeNum} completed`);
    }

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
  sharedBotRng,
  coordinator,
  otherBotName,
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
        Math.floor(newZ),
        args
      );
      // await sleep(1000);
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
    // await sleep(episodeNum === 0 ? 6000 : 1000);


    const selectedEpisodeType = episodeTypes[Math.floor(sharedBotRng() * episodeTypes.length)];

    console.log(`[${bot.username}] Selected episode type: ${selectedEpisodeType}`);

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
    } else if (selectedEpisodeType === "placeBlock") {
      coordinator.onceEvent(
        `placeBlockPhase_${iterationID}`,
        getOnPlaceBlockPhaseFn(
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
        `placeBlockPhase_${iterationID}`,
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
    } else if (selectedEpisodeType === "pvp") {
      coordinator.onceEvent(
        `pvpPhase_${iterationID}`,
        getOnPvpPhaseFn(
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
        `pvpPhase_${iterationID}`,
        bot.entity.position.clone(),
        "teleportPhase end"
      );
    } else if (selectedEpisodeType === "buildWall") {
      coordinator.onceEvent(
        `buildPhase_${iterationID}`,
        getOnBuildPhaseFn(
          bot,
          sharedBotRng,
          coordinator,
          iterationID,
          args.other_bot_name,
          episodeNum,
          getOnStopPhaseFn,
          args,
          'wall'  // structure type
        )
      );
      coordinator.sendToOtherBot(
        `buildPhase_${iterationID}`,
        bot.entity.position.clone(),
        "teleportPhase end"
      );
    } else if (selectedEpisodeType === "buildTower") {
      coordinator.onceEvent(
        `buildTowerPhase_${iterationID}`,
        getOnBuildTowerPhaseFn(
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
        `buildTowerPhase_${iterationID}`,
        bot.entity.position.clone(),
        "teleportPhase end"
      );
    } else {
      // Original walkAndLook episode
      coordinator.onceEvent(
        `walkAndLookPhase_${iterationID}`,
        getOnWalkAndLookPhaseFn(
          bot,
          sharedBotRng,
          coordinator,
          iterationID,
          args.other_bot_name,
          episodeNum,
          args
        )
      );
      coordinator.sendToOtherBot(
        `walkAndLookPhase_${iterationID}`,
        bot.entity.position.clone(),
        "teleportPhase end"
      );
    }
  };
}

/**
 * Get walk and look phase handler function
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} iterationID - Iteration ID
 * @param {string} otherBotName - Other bot name
 * @param {number} episodeNum - Episode number
 * @param {Object} args - Configuration arguments
 * @returns {Function} Walk and look phase handler
 */
function getOnWalkAndLookPhaseFn(
  bot,
  sharedBotRng,
  coordinator,
  iterationID,
  otherBotName,
  episodeNum,
  args
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
      "lower_name_walks_straight", 
      "bigger_name_walks_straight"
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
      await run(bot, actionCount, args);
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
        episodeNum,
        args
      )
    );
    coordinator.sendToOtherBot(
      `walkAndLookPhase_${nextIterationID}`,
      bot.entity.position.clone(),
      `walkAndLookPhase_${iterationID} end`
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

    await sleep(3000);

    console.log(`[${bot.username}] stopped`);
    // Resolve the episode promise instead of exiting
    episodeResolve();
  };
}

module.exports = {
  runSingleEpisode,
  getOnSpawnFn,
  getOnTeleportPhaseFn,
  getOnWalkAndLookPhaseFn,
  getOnStopPhaseFn,
  getOnStoppedPhaseFn
};
