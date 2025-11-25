// building.js - Utilities for collaborative house building episodes
const { Vec3 } = require("vec3");
const { sleep } = require("./helpers");
const { placeAt } = require("../episode-handlers/builder");
const { digWithTimeout } = require("./movement");

// Track scaffolds for cleanup
const scaffoldBlocks = [];

/**
 * Generate a 5x5 house blueprint with flat roof
 * Local coordinate frame: origin at south-west corner, +X=east, +Z=south, +Y=up
 * @param {Object} options - Configuration options
 * @param {Object} options.materials - Material overrides
 * @returns {Array<Object>} Array of {x, y, z, block, phase, data}
 */
function makeHouseBlueprint5x5(options = {}) {
  const materials = {
    floor: "cobblestone",
    walls: "cobblestone",
    door: "oak_door",
    windows: "glass_pane",
    roof: "cobblestone",
    ...options.materials,
  };

  const blueprint = [];

  // PHASE 1: FLOOR (y=0, 5x5 grid)
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) {
      blueprint.push({
        x,
        y: 0,
        z,
        block: materials.floor,
        phase: "floor",
        data: null,
      });
    }
  }

  // PHASE 2: WALLS (y=1 to y=3, hollow ring)
  // Door will be at (x=2, z=0) so we skip those positions
  for (let y = 1; y <= 3; y++) {
    // South wall (z=0) - skip door positions
    for (let x = 0; x < 5; x++) {
      if (!(x === 2 && (y === 1 || y === 2))) {
        blueprint.push({
          x,
          y,
          z: 0,
          block: materials.walls,
          phase: "walls",
          data: null,
        });
      }
    }

    // North wall (z=4)
    for (let x = 0; x < 5; x++) {
      blueprint.push({
        x,
        y,
        z: 4,
        block: materials.walls,
        phase: "walls",
        data: null,
      });
    }

    // West wall (x=0, skip corners already done)
    for (let z = 1; z < 4; z++) {
      blueprint.push({
        x: 0,
        y,
        z,
        block: materials.walls,
        phase: "walls",
        data: null,
      });
    }

    // East wall (x=4, skip corners already done)
    for (let z = 1; z < 4; z++) {
      blueprint.push({
        x: 4,
        y,
        z,
        block: materials.walls,
        phase: "walls",
        data: null,
      });
    }
  }

  // PHASE 3: DOOR (south wall, centered at x=2, z=0)
  blueprint.push({
    x: 2,
    y: 1,
    z: 0,
    block: materials.door,
    phase: "door",
    data: { half: "lower", facing: "south" },
  });
  blueprint.push({
    x: 2,
    y: 2,
    z: 0,
    block: materials.door,
    phase: "door",
    data: { half: "upper", facing: "south" },
  });

  // PHASE 4: WINDOWS (glass panes at y=2)
  // South windows flanking door
  blueprint.push({
    x: 1,
    y: 2,
    z: 0,
    block: materials.windows,
    phase: "windows",
    data: null,
  });
  blueprint.push({
    x: 3,
    y: 2,
    z: 0,
    block: materials.windows,
    phase: "windows",
    data: null,
  });
  // West window
  blueprint.push({
    x: 0,
    y: 2,
    z: 2,
    block: materials.windows,
    phase: "windows",
    data: null,
  });
  // East window
  blueprint.push({
    x: 4,
    y: 2,
    z: 2,
    block: materials.windows,
    phase: "windows",
    data: null,
  });

  // PHASE 5: ROOF (flat roof at y=4, 5x5 grid)
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) {
      blueprint.push({
        x,
        y: 4,
        z,
        block: materials.roof,
        phase: "roof",
        data: null,
      });
    }
  }

  return blueprint;
}

/**
 * Rotate local coordinates to world coordinates
 * @param {Object} local - Local position {x, y, z}
 * @param {Vec3} origin - World origin position
 * @param {number} orientation - Rotation in degrees (0, 90, 180, 270)
 * @returns {Vec3} World position
 */
function rotateLocalToWorld(local, origin, orientation) {
  let rx = local.x;
  let rz = local.z;

  // Rotate around Y axis
  switch (orientation) {
    case 90:
      [rx, rz] = [-local.z, local.x];
      break;
    case 180:
      [rx, rz] = [-local.x, -local.z];
      break;
    case 270:
      [rx, rz] = [local.z, -local.x];
      break;
    default: // 0 degrees
      break;
  }

  return new Vec3(origin.x + rx, origin.y + local.y, origin.z + rz);
}

/**
 * Split work between two bots by X-axis
 * Alpha builds west half + center (x ≤ 2), Bravo builds east half (x ≥ 3)
 * @param {Array<Object>} targets - Array of block targets
 * @param {string} alphaBotName - Name of alpha bot
 * @param {string} bravoBotName - Name of bravo bot
 * @returns {Object} {alphaTargets, bravoTargets}
 */
function splitWorkByXAxis(targets, alphaBotName, bravoBotName) {
  const alphaTargets = [];
  const bravoTargets = [];

  for (const target of targets) {
    if (target.x <= 2) {
      alphaTargets.push({ ...target, assignedTo: alphaBotName });
    } else {
      bravoTargets.push({ ...target, assignedTo: bravoBotName });
    }
  }

  console.log(
    `[splitWork] Alpha: ${alphaTargets.length} blocks (x ≤ 2, west + center)`
  );
  console.log(
    `[splitWork] Bravo: ${bravoTargets.length} blocks (x ≥ 3, east)`
  );

  return { alphaTargets, bravoTargets };
}

/**
 * Ensure bot has required blocks in inventory via RCON /give
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Object} rcon - RCON client
 * @param {Object} materials - Material counts {blockName: count}
 * @returns {Promise<void>}
 */
async function ensureBlocks(bot, rcon, materials) {
  if (!rcon) {
    console.log(`[${bot.username}] No RCON, skipping block distribution`);
    return;
  }

  console.log(`[${bot.username}] 📦 Receiving building materials...`);

  for (const [blockName, count] of Object.entries(materials)) {
    if (count > 0) {
      const cmd = `/give ${bot.username} ${blockName} ${count}`;
      await rcon.send(cmd);
      console.log(`[${bot.username}]    ${count}x ${blockName}`);
      await sleep(100);
    }
  }
}

/**
 * Calculate material counts from blueprint
 * @param {Array<Object>} blueprint - Blueprint array
 * @returns {Object} Material counts {blockName: count}
 */
function calculateMaterialCounts(blueprint) {
  const counts = {};
  for (const target of blueprint) {
    counts[target.block] = (counts[target.block] || 0) + 1;
  }
  return counts;
}

/**
 * Check if there's an adjacent solid block for placement reference
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} pos - Target position
 * @returns {boolean} True if reference block exists
 */
function hasAdjacentSolidBlock(bot, pos) {
  const offsets = [
    new Vec3(0, -1, 0), // Below (preferred)
    new Vec3(1, 0, 0),  // East
    new Vec3(-1, 0, 0), // West
    new Vec3(0, 0, 1),  // South
    new Vec3(0, 0, -1), // North
    new Vec3(0, 1, 0),  // Above
  ];

  for (const offset of offsets) {
    const checkPos = pos.plus(offset);
    const block = bot.blockAt(checkPos);
    if (block && block.name !== "air" && block.boundingBox === "block") {
      return true;
    }
  }

  return false;
}

/**
 * Place scaffold block to support target placement
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPos - Target position that needs support
 * @param {Object} args - Episode args (for RCON)
 * @returns {Promise<boolean>} True if scaffold placed
 */
async function placeScaffold(bot, targetPos, args) {
  const scaffoldPos = targetPos.offset(0, -1, 0); // Place below
  const scaffoldBlock = bot.blockAt(scaffoldPos);

  // Check if already solid
  if (scaffoldBlock && scaffoldBlock.name !== "air") {
    return false;
  }

  console.log(
    `[${bot.username}] 🧱 Placing scaffold at (${scaffoldPos.x}, ${scaffoldPos.y}, ${scaffoldPos.z})`
  );

  try {
    const placed = await placeAt(bot, scaffoldPos, "cobblestone", {
      useSneak: true,
      tries: 3,
      args: args,
    });

    if (placed) {
      scaffoldBlocks.push(scaffoldPos.clone());
      return true;
    }
  } catch (error) {
    console.log(
      `[${bot.username}] ⚠️ Scaffold placement failed: ${error.message}`
    );
  }

  return false;
}

/**
 * Build a phase of blocks for one bot with auto-scaffolding
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Array<Object>} targets - Array of block targets with worldPos
 * @param {Object} options - Options {args, delayMs}
 * @returns {Promise<Object>} Build statistics {success, failed}
 */
async function buildPhase(bot, targets, options = {}) {
  const { args = null, delayMs = 300 } = options;

  if (targets.length === 0) {
    console.log(`[${bot.username}] No blocks assigned in this phase`);
    return { success: 0, failed: 0 };
  }

  console.log(
    `[${bot.username}] 🏗️ Building ${targets.length} blocks in phase...`
  );

  const blockType = targets[0].block;
  const phaseName = targets[0].phase;

  console.log(`[${bot.username}] 📦 Block type: ${blockType}, Phase: ${phaseName}`);

  // Sort positions: bottom-up (Y), then near-to-far
  const botPos = bot.entity.position;
  const sorted = targets.slice().sort((a, b) => {
    if (a.worldPos.y !== b.worldPos.y) return a.worldPos.y - b.worldPos.y;
    const distA = botPos.distanceTo(a.worldPos);
    const distB = botPos.distanceTo(a.worldPos);
    return distA - distB;
  });

  let success = 0;
  let failed = 0;

  const { GoalNear } = require("mineflayer-pathfinder").goals;

  console.log(`[${bot.username}] 🔨 Starting block placement loop...`);

  for (let i = 0; i < sorted.length; i++) {
    const target = sorted[i];
    const pos = target.worldPos;

    try {
      // Check if block already placed
      const existingBlock = bot.blockAt(pos);
      if (existingBlock && existingBlock.name !== "air") {
        console.log(
          `[${bot.username}] ⏭️ Block already exists at (${pos.x}, ${pos.y}, ${pos.z})`
        );
        success++;
        continue;
      }

      // Auto-scaffold if no reference block
      if (!hasAdjacentSolidBlock(bot, pos)) {
        console.log(
          `[${bot.username}] 🧱 No reference block at (${pos.x}, ${pos.y}, ${pos.z}), scaffolding...`
        );
        await placeScaffold(bot, pos, args);
        await sleep(200); // Let scaffold settle
      }

      // Pathfind near target
      const distance = bot.entity.position.distanceTo(pos);
      if (distance > 4) {
        console.log(
          `[${bot.username}] 🚶 Pathfinding to block ${i + 1}/${sorted.length}, distance: ${distance.toFixed(1)}`
        );

        bot.pathfinder.setGoal(new GoalNear(pos.x, pos.y, pos.z, 3));
        await sleep(Math.min(distance * 500, 5000));
        bot.pathfinder.setGoal(null);
      }

      // Place block
      const placed = await placeAt(bot, pos, blockType, {
        useSneak: true,
        tries: 5,
        args: args,
      });

      if (placed) {
        success++;
        if ((i + 1) % 5 === 0 || i === sorted.length - 1) {
          console.log(
            `[${bot.username}] ✅ Progress: ${success}/${sorted.length} blocks placed`
          );
        }
      } else {
        failed++;
        console.log(
          `[${bot.username}] ❌ Failed to place at (${pos.x}, ${pos.y}, ${pos.z})`
        );
      }
    } catch (error) {
      failed++;
      console.log(
        `[${bot.username}] ❌ Error placing at (${pos.x}, ${pos.y}, ${pos.z}): ${error.message}`
      );
    }

    if (delayMs > 0 && i < sorted.length - 1) {
      await sleep(delayMs);
    }
  }

  console.log(`[${bot.username}] ✅ Placement loop complete`);
  console.log(`[${bot.username}]    ✅ Success: ${success}/${targets.length}`);
  console.log(`[${bot.username}]    ❌ Failed: ${failed}/${targets.length}`);

  return { success, failed };
}

/**
 * Cleanup scaffold blocks after building
 * @param {Bot} bot - Mineflayer bot instance
 * @returns {Promise<void>}
 */
async function cleanupScaffolds(bot) {
  if (scaffoldBlocks.length === 0) {
    console.log(`[${bot.username}] No scaffolds to clean up`);
    return;
  }

  console.log(
    `[${bot.username}] 🧹 Cleaning up ${scaffoldBlocks.length} scaffold blocks...`
  );

  for (const pos of scaffoldBlocks) {
    try {
      const block = bot.blockAt(pos);
      if (block && block.name === "cobblestone") {
        await digWithTimeout(bot, block, { timeoutMs: 5000 });
        await sleep(200);
      }
    } catch (error) {
      console.log(
        `[${bot.username}] ⚠️ Failed to remove scaffold at (${pos.x}, ${pos.y}, ${pos.z}): ${error.message}`
      );
    }
  }

  scaffoldBlocks.length = 0; // Clear array
  console.log(`[${bot.username}] ✅ Scaffold cleanup complete`);
}

/**
 * Both bots exit through door and admire the house
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} doorWorldPos - World position of door
 * @param {number} orientation - House orientation (0, 90, 180, 270)
 * @param {Object} options - Options {backOff: distance}
 * @returns {Promise<void>}
 */
async function admireHouse(bot, doorWorldPos, orientation, options = {}) {
  const { backOff = 7 } = options;

  console.log(`[${bot.username}] 🚪 Exiting through door...`);

  const { GoalNear } = require("mineflayer-pathfinder").goals;

  // Step 1: Pathfind through door
  bot.pathfinder.setGoal(new GoalNear(doorWorldPos.x, doorWorldPos.y, doorWorldPos.z, 1));
  await sleep(3000);
  bot.pathfinder.setGoal(null);

  // Step 2: Calculate lookFrom position based on orientation
  let lookFromPos;
  switch (orientation) {
    case 0: // South-facing door, back up south (+Z)
      lookFromPos = doorWorldPos.offset(0, 0, backOff);
      break;
    case 90: // West-facing door, back up west (-X)
      lookFromPos = doorWorldPos.offset(-backOff, 0, 0);
      break;
    case 180: // North-facing door, back up north (-Z)
      lookFromPos = doorWorldPos.offset(0, 0, -backOff);
      break;
    case 270: // East-facing door, back up east (+X)
      lookFromPos = doorWorldPos.offset(backOff, 0, 0);
      break;
    default:
      lookFromPos = doorWorldPos.offset(0, 0, backOff);
  }

  console.log(`[${bot.username}] 🚶 Backing up to admire position...`);
  bot.pathfinder.setGoal(new GoalNear(lookFromPos.x, lookFromPos.y, lookFromPos.z, 2));
  await sleep(4000);
  bot.pathfinder.setGoal(null);

  // Step 3: Look at house center
  const houseCenter = doorWorldPos.offset(2, 2, 2); // Center of 5x5 house
  console.log(`[${bot.username}] 👀 Looking at house...`);
  await bot.lookAt(houseCenter, false);
  await sleep(2000);

  console.log(`[${bot.username}] ✅ Admire sequence complete`);
}

module.exports = {
  makeHouseBlueprint5x5,
  rotateLocalToWorld,
  splitWorkByXAxis,
  ensureBlocks,
  calculateMaterialCounts,
  buildPhase,
  cleanupScaffolds,
  admireHouse,
};
