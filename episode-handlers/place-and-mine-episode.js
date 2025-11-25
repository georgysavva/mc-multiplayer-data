/**
 * Place-and-Mine Episode
 * 
 * Episode Flow:
 * 1. teleportPhase → Bots teleport to random positions (not recorded)
 * 2. setupEpisode → 
 *    - Provision items (6 block types)
 *    - Find ground using land_pos()
 *    - Find build location (P0: full cross, P2: single axis)
 *    - Position bots using rconTp()
 *    - Store build data (center, axes, roles)
 * 3. 📹 START RECORDING
 * 4. placeAndMinePhase →
 *    - Bots already positioned
 *    - If P2: Miner clears observation axis first
 *    - Builder places blocks in patterns (1-5 blocks per round)
 *    - Miner watches, then mines placed blocks
 *    - Repeat for NUM_ROUNDS rounds
 * 5. stopPhase → End episode
 */

const { Vec3 } = require("vec3");
const { sleep } = require("../utils/helpers");
const { placeAt, ensureItemInHand } = require("./builder");
const { BaseEpisode } = require("./base-episode");
const { ensureBotHasEnough, unequipHand } = require("../utils/items");
const { decidePrimaryBot, rconTp } = require("../utils/coordination");
const { lookAtBot, land_pos, digWithTimeout } = require("../utils/movement");

const BLOCK_PLACE_INTERVAL_MS = 150;
const BLOCK_BREAK_INTERVAL_MS = 100;
const ROUND_DELAY_MS = 500;
const NUM_ROUNDS = 20;
const PLACEMENT_RETRY_LIMIT = 3;
const DISTANCE_FROM_CENTER = 2;

const BLOCK_TYPES = [
  "stone",
  "oak_planks",
  "bricks",
  "dirt",
  "smooth_sandstone",
];

async function digBlock(bot, blockPos) {
  try {
    const block = bot.blockAt(blockPos);
    if (!block || block.name === "air" || block.name === "cave_air") {
      return true;
    }

    const blockCenter = blockPos.offset(0.5, 0.5, 0.5);
    await bot.lookAt(blockCenter);
    await sleep(50);
    await digWithTimeout(bot, block);
    return true;
  } catch (error) {
    console.log(`[${bot.username}] ❌ Error digging block: ${error.message}`);
    return false;
  }
}

function checkHorizontalStrip(bot, startX, y, startZ, direction, length = 5) {
  for (let i = 0; i < length; i++) {
    const pos = direction === "x"
      ? new Vec3(startX + i, y, startZ)
      : new Vec3(startX, y, startZ + i);

    const groundBlock = bot.blockAt(pos);
    const airAbove = bot.blockAt(pos.offset(0, 1, 0));

    if (!groundBlock || groundBlock.name === "air" || groundBlock.name === "cave_air" || groundBlock.boundingBox === "empty") {
      return false;
    }

    if (!airAbove || (airAbove.name !== "air" && airAbove.name !== "cave_air")) {
      return false;
    }
  }
  return true;
}

function checkCrossPattern(bot, centerX, y, centerZ) {
  const center = new Vec3(centerX, y, centerZ);
  const centerGround = bot.blockAt(center);
  const centerAir = bot.blockAt(center.offset(0, 1, 0));

  if (!centerGround || centerGround.name === "air" || centerGround.name === "cave_air" || 
      centerGround.name === "water" || centerGround.boundingBox === "empty") {
    return null;
  }

  if (!centerAir || (centerAir.name !== "air" && centerAir.name !== "cave_air")) {
    return null;
  }

  const hasXAxis = checkHorizontalStrip(bot, centerX - 2, y, centerZ, "x", 5);
  const hasZAxis = checkHorizontalStrip(bot, centerX, y, centerZ - 2, "z", 5);

  if (hasXAxis && hasZAxis) {
    return {
      center: center.offset(0, 1, 0),
      hasXAxis: true,
      hasZAxis: true,
      priority: 0,
      y: y + 1,
      groundY: y,
    };
  } else if (hasXAxis || hasZAxis) {
    return {
      center: center.offset(0, 1, 0),
      hasXAxis: !!hasXAxis,
      hasZAxis: !!hasZAxis,
      priority: 2,
      y: y + 1,
      groundY: y,
    };
  }

  return null;
}

function findBuildLocation(bot, startPos, searchRadius = 15) {
  const searchX = Math.floor(startPos.x);
  const searchZ = Math.floor(startPos.z);
  const searchY = Math.floor(startPos.y);

  let bestP2 = null;

  for (let radius = 0; radius <= searchRadius; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;

        const x = searchX + dx;
        const z = searchZ + dz;

        for (let dy = -5; dy <= 5; dy++) {
          const y = searchY + dy;
          const crossCheck = checkCrossPattern(bot, x, y, z);

          if (crossCheck) {
            if (crossCheck.priority === 0) {
              console.log(`[${bot.username}] ✅ P0: Found full cross at (${x}, ${y}, ${z})`);
              return crossCheck;
            } else if (crossCheck.priority === 2 && !bestP2) {
              bestP2 = crossCheck;
              bestP2.x = x;
              bestP2.z = z;
            }
          }
        }
      }
    }
  }

  if (bestP2) {
    console.log(`[${bot.username}] ⚠️ P2: Found single axis at (${bestP2.x}, ${bestP2.groundY}, ${bestP2.z})`);
    return bestP2;
  }

  return null;
}

function generateBlockPositions(center, blockCount, direction = "z") {
  const positions = [];
  const offsetDir = direction === "x" ? [1, 0, 0] : [0, 0, 1];

  if (blockCount === 1) {
    positions.push(center.clone());
  } else if (blockCount === 2) {
    positions.push(center.clone());
    const side = Math.random() < 0.5 ? -1 : 1;
    positions.push(center.offset(offsetDir[0] * side, offsetDir[1] * side, offsetDir[2] * side));
  } else if (blockCount === 3) {
    positions.push(center.offset(-offsetDir[0], -offsetDir[1], -offsetDir[2]));
    positions.push(center.clone());
    positions.push(center.offset(offsetDir[0], offsetDir[1], offsetDir[2]));
  } else if (blockCount === 4) {
    positions.push(center.offset(-offsetDir[0], -offsetDir[1], -offsetDir[2]));
    positions.push(center.clone());
    positions.push(center.offset(offsetDir[0], offsetDir[1], offsetDir[2]));
    const side = Math.random() < 0.5 ? -2 : 2;
    positions.push(center.offset(offsetDir[0] * side, offsetDir[1] * side, offsetDir[2] * side));
  } else {
    for (let i = -2; i <= 2; i++) {
      positions.push(center.offset(offsetDir[0] * i, offsetDir[1] * i, offsetDir[2] * i));
    }
  }

  return positions;
}

async function runBuilderRounds(bot, rcon, sharedBotRng, coordinator, episodeNum, center, stripDirection, otherBotName) {
  console.log(`[${bot.username}] 🏗️ Starting builder role for ${NUM_ROUNDS} rounds`);

  for (let round = 0; round < NUM_ROUNDS; round++) {
    console.log(`[${bot.username}] 🎯 Round ${round + 1}/${NUM_ROUNDS}`);

    const blockCount = [1, 2, 3, 4, 5][Math.floor(sharedBotRng() * 5)];
    const blockType = BLOCK_TYPES[Math.floor(sharedBotRng() * BLOCK_TYPES.length)];
    const positions = generateBlockPositions(center, blockCount, stripDirection);

    await ensureItemInHand(bot, blockType);
    await sleep(100);

    const placedPositions = [];
    for (const pos of positions) {
      const success = await placeAt(bot, pos, blockType, {
        useSneak: true,
        tries: PLACEMENT_RETRY_LIMIT,
        args: null,
      });

      if (success) {
        placedPositions.push(pos);
      }

      await sleep(BLOCK_PLACE_INTERVAL_MS);
    }

    await sleep(200);
    await lookAtBot(bot, otherBotName, 90);
    await sleep(500);

    coordinator.sendToOtherBot(
      `buildingComplete_${round}`,
      { positions: placedPositions, blockType },
      episodeNum,
      `builder finished round ${round + 1}`
    );

    await new Promise((resolve) => {
      coordinator.onceEvent(`miningComplete_${round}`, episodeNum, () => resolve());
    });

    await sleep(ROUND_DELAY_MS);
  }

  console.log(`[${bot.username}] 🏁 Builder completed all ${NUM_ROUNDS} rounds`);
}

async function clearBuildArea(bot, center, clearDirection) {
  console.log(`[${bot.username}] 🧹 Clearing 5 blocks in ${clearDirection} direction`);

  const positions = [];
  for (let i = -2; i <= 2; i++) {
    const pos = clearDirection === "x"
      ? center.offset(i, 0, 0)
      : center.offset(0, 0, i);
    positions.push(pos);
  }

  await ensureItemInHand(bot, "diamond_pickaxe");
  await sleep(100);

  for (const pos of positions) {
    const block = bot.blockAt(pos);
    if (block && block.name !== "air" && block.name !== "cave_air") {
      await bot.lookAt(pos.offset(0.5, 0.5, 0.5), false);
      await sleep(50);
      await digBlock(bot, pos);
      await sleep(BLOCK_BREAK_INTERVAL_MS);
    }
  }
}

async function runMinerRounds(bot, rcon, sharedBotRng, coordinator, episodeNum, center, stripDirection, otherBotName) {
  console.log(`[${bot.username}] ⛏️ Starting miner role for ${NUM_ROUNDS} rounds`);

  await ensureItemInHand(bot, "diamond_pickaxe");
  await sleep(100);

  for (let round = 0; round < NUM_ROUNDS; round++) {
    console.log(`[${bot.username}] 👀 Round ${round + 1}/${NUM_ROUNDS}: Watching builder...`);

    await lookAtBot(bot, otherBotName, 90);

    const roundData = await new Promise((resolve) => {
      coordinator.onceEvent(`buildingComplete_${round}`, episodeNum, (data) => resolve(data));
    });

    await sleep(ROUND_DELAY_MS);

    console.log(`[${bot.username}] ⛏️ Mining ${roundData.positions.length} block(s)...`);

    let minedCount = 0;
    for (const posData of roundData.positions) {
      const pos = new Vec3(posData.x, posData.y, posData.z);
      await bot.lookAt(pos.offset(0.5, 0.5, 0.5), false);
      await sleep(50);

      const success = await digBlock(bot, pos);
      if (success) {
        minedCount++;
      }

      await sleep(BLOCK_BREAK_INTERVAL_MS);
    }

    await sleep(200);
    await lookAtBot(bot, otherBotName, 90);
    await sleep(500);

    coordinator.sendToOtherBot(
      `miningComplete_${round}`,
      { minedCount },
      episodeNum,
      `miner finished round ${round + 1}`
    );

    await sleep(ROUND_DELAY_MS);
  }

  console.log(`[${bot.username}] 🏁 Miner completed all ${NUM_ROUNDS} rounds`);
}

function getOnPlaceAndMinePhaseFn(bot, rcon, sharedBotRng, coordinator, iterationID, episodeNum, episodeInstance, args) {
  return async function onPlaceAndMinePhase() {
    coordinator.sendToOtherBot(
      `placeAndMinePhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `placeAndMinePhase_${iterationID} beginning`
    );

    console.log(`[${bot.username}] 🚀 Starting PLACE-AND-MINE phase ${iterationID}`);

    const buildCenter = episodeInstance._buildCenter;
    const axisOfActivity = episodeInstance._axisOfActivity;
    const axisOfObservation = episodeInstance._axisOfObservation;
    const needsClearing = episodeInstance._needsClearing;
    const isBuilder = episodeInstance._isBuilder;

    console.log(`[${bot.username}] 🎭 I am the ${isBuilder ? "🏗️ BUILDER" : "⛏️ MINER"}`);
    console.log(`[${bot.username}] 📐 AxO=${axisOfObservation}, AxA=${axisOfActivity}`);

    let clearingStartPromise = null;
    let clearingCompletePromise = null;
    if (needsClearing && isBuilder) {
      clearingStartPromise = new Promise((resolve) => {
        coordinator.onceEvent(`clearingStart`, episodeNum, () => resolve());
      });
      clearingCompletePromise = new Promise((resolve) => {
        coordinator.onceEvent(`clearingComplete`, episodeNum, () => resolve());
      });
    }

    await lookAtBot(bot, args.other_bot_name, 90);
    await sleep(1000);

    if (needsClearing && !isBuilder) {
      console.log(`[${bot.username}] 🧹 Miner clearing observation axis...`);
      coordinator.sendToOtherBot(`clearingStart`, {}, episodeNum, `miner starting to clear`);
      await clearBuildArea(bot, buildCenter, axisOfObservation);
      await sleep(500);
      await lookAtBot(bot, args.other_bot_name, 90);
      await sleep(500);
      coordinator.sendToOtherBot(`clearingComplete`, {}, episodeNum, `miner finished clearing`);
    } else if (needsClearing && isBuilder) {
      await clearingStartPromise;
      await clearingCompletePromise;
      await sleep(500);
    }

    if (isBuilder) {
      await runBuilderRounds(bot, rcon, sharedBotRng, coordinator, episodeNum, buildCenter, axisOfActivity, args.other_bot_name);
    } else {
      await runMinerRounds(bot, rcon, sharedBotRng, coordinator, episodeNum, buildCenter, axisOfActivity, args.other_bot_name);
    }

    console.log(`[${bot.username}] ✅ PLACE-AND-MINE phase complete!`);

    coordinator.onceEvent(
      "stopPhase",
      episodeNum,
      episodeInstance.getOnStopPhaseFn(bot, rcon, sharedBotRng, coordinator, args.other_bot_name, episodeNum, args)
    );
    coordinator.sendToOtherBot("stopPhase", bot.entity.position.clone(), episodeNum, `placeAndMinePhase_${iterationID} end`);
  };
}

class PlaceAndMineEpisode extends BaseEpisode {
  static INIT_MIN_BOTS_DISTANCE = 4;
  static INIT_MAX_BOTS_DISTANCE = 4;
  static WORKS_IN_NON_FLAT_WORLD = true;

  async setupEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args) {
    console.log(`[${bot.username}] 🎬 Setting up place-and-mine episode...`);

    for (const blockType of BLOCK_TYPES) {
      await ensureBotHasEnough(bot, rcon, blockType, 64);
    }

    await unequipHand(bot);
    await sleep(500);

    await this.findGroundAndPositionBots(bot, rcon, sharedBotRng, coordinator, episodeNum, args);

    console.log(`[${bot.username}] ✅ Place-and-mine episode setup complete`);
  }

  async findGroundAndPositionBots(bot, rcon, sharedBotRng, coordinator, episodeNum, args) {
    const myPos = bot.entity.position.clone();
    let otherBotPosition = null;

    try {
      const otherEntity = bot.players[args.other_bot_name]?.entity;
      if (otherEntity) {
        otherBotPosition = otherEntity.position.clone();
      } else {
        throw new Error(`Could not find other bot entity: ${args.other_bot_name}`);
      }
    } catch (error) {
      console.error(`[${bot.username}] ❌ Error getting other bot position: ${error.message}`);
      throw error;
    }

    const midX = Math.floor((myPos.x + otherBotPosition.x) / 2);
    const midZ = Math.floor((myPos.z + otherBotPosition.z) / 2);

    const groundPos = land_pos(bot, midX, midZ);
    if (!groundPos) {
      throw new Error(`Could not find ground at midpoint (${midX}, ${midZ})`);
    }

    await new Promise((resolve) => {
      coordinator.onceEvent(`setupPositioningSync`, episodeNum, () => {
        coordinator.sendToOtherBot(`setupPositioningSync`, {}, episodeNum, `setup positioning sync response`);
        resolve();
      });
      coordinator.sendToOtherBot(`setupPositioningSync`, {}, episodeNum, `setup positioning sync request`);
    });

    const buildLocation = findBuildLocation(bot, groundPos, 15);
    if (!buildLocation) {
      throw new Error(`Could not find suitable build location`);
    }

    const buildCenter = buildLocation.center;
    const needsClearing = buildLocation.priority === 2;

    let axisOfObservation, axisOfActivity;
    if (buildLocation.priority === 0) {
      const useXAsObservation = sharedBotRng() < 0.5;
      axisOfObservation = useXAsObservation ? "x" : "z";
      axisOfActivity = useXAsObservation ? "z" : "x";
    } else if (buildLocation.priority === 2) {
      if (buildLocation.hasXAxis) {
        axisOfObservation = "z";
        axisOfActivity = "x";
      } else {
        axisOfObservation = "x";
        axisOfActivity = "z";
      }
    }

    const side = sharedBotRng() < 0.5 ? -1 : 1;
    const isBuilder = decidePrimaryBot(bot, sharedBotRng, args);
    const builderOffset = side * DISTANCE_FROM_CENTER;
    const minerOffset = -side * DISTANCE_FROM_CENTER;

    const builderPos = axisOfObservation === "x"
      ? buildCenter.offset(builderOffset, 0, 0)
      : buildCenter.offset(0, 0, builderOffset);

    const minerPos = axisOfObservation === "x"
      ? buildCenter.offset(minerOffset, 0, 0)
      : buildCenter.offset(0, 0, minerOffset);

    const targetPos = isBuilder ? builderPos : minerPos;

    await rconTp(rcon, bot.username, targetPos.x, targetPos.y, targetPos.z);
    await sleep(1000);

    this._buildCenter = buildCenter;
    this._axisOfActivity = axisOfActivity;
    this._axisOfObservation = axisOfObservation;
    this._needsClearing = needsClearing;
    this._isBuilder = isBuilder;
  }

  async entryPoint(bot, rcon, sharedBotRng, coordinator, iterationID, episodeNum, args) {
    coordinator.onceEvent(
      `placeAndMinePhase_${iterationID}`,
      episodeNum,
      getOnPlaceAndMinePhaseFn(bot, rcon, sharedBotRng, coordinator, iterationID, episodeNum, this, args)
    );
    coordinator.sendToOtherBot(`placeAndMinePhase_${iterationID}`, bot.entity.position.clone(), episodeNum, "entryPoint end");
  }

  async tearDownEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args) {
    await unequipHand(bot);
  }
}

module.exports = {
  PlaceAndMineEpisode,
  getOnPlaceAndMinePhaseFn,
  BLOCK_TYPES,
  NUM_ROUNDS,
};
