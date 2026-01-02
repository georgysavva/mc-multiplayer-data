// structureEval.js - Independent structure building and evaluation episode
const { Vec3 } = require("vec3");
const {
  initializePathfinder,
  stopPathfinder,
  gotoWithTimeout,
  lookAtSmooth,
  sneak,
} = require("../../utils/movement");
const { placeAt, findPlaceReference, ensureItemInHand } = require("../../utils/building");
const { BaseEpisode } = require("../base-episode");
const { pickRandom } = require("../../utils/coordination");
const { ensureBotHasEnough, unequipHand } = require("../../utils/items");
const { GoalNear } = require("mineflayer-pathfinder").goals;

// Constants for building behavior
const ALL_STRUCTURE_TYPES = ["wall_2x2", "wall_4x1", "tower_2x1"];

// Dynamic timing functions based on block count
const getInitialEyeContactTicks = (blockCount) => {
  if (blockCount === 2) return 4;    // tower: 1.0 seconds (20 ticks)
  if (blockCount === 4) return 4;    // wall: 0.75 seconds (15 ticks) - REDUCED
  return 4; // Default: 1.0 seconds (20 ticks)
};

const getBlockPlaceDelayTicks = (blockCount) => {
  if (blockCount === 2) return 4;    // tower: 0.55 seconds (15 ticks)
  if (blockCount === 4) return 4;    // wall: 0.6 seconds (12 ticks) - REDUCED
  return 4; // Default: 0.55 seconds (15 ticks)
};

const getBuilderAdmireTicks = (blockCount) => {
  if (blockCount === 2) return 4;    // tower: 1.0 seconds (20 ticks)
  if (blockCount === 4) return 4;    // wall: 0.55 seconds (15 ticks) - REDUCED
  return 4; // Default: 1.0 seconds (20 ticks)
};

const BUILD_BLOCK_TYPES = ["stone"]; // Only stone blocks for building
const EPISODE_MIN_TICKS = 300;
const PLACEMENT_STANDOFF_BLOCKS = 1; // Stand 2 blocks away from the structure while placing
const ADJACENT_GOAL_RADIUS = 1.0; // Relaxed tolerance to avoid micro-jitter at the target point

/**
 * Generate positions for a simple wall structure
 * @param {Vec3} startPos - Starting position
 * @param {number} length - Length of wall
 * @param {number} height - Height of wall
 * @param {string} direction - 'x' or 'z' axis
 * @returns {Array<Vec3>} Array of positions
 */
function generateWallPositions(startPos, length, height, direction = "x") {
  const positions = [];
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < length; i++) {
      if (direction === "x") {
        positions.push(startPos.offset(i, y, 0));
      } else {
        positions.push(startPos.offset(0, y, i));
      }
    }
  }
  return positions;
}

/**
 * Generate positions for a tower structure
 * @param {Vec3} basePos - Base position
 * @param {number} height - Height of tower
 * @returns {Array<Vec3>} Array of positions
 */
function generateTowerPositions(basePos, height) {
  const positions = [];
  for (let y = 0; y < height; y++) {
    positions.push(basePos.offset(0, y, 0));
  }
  return positions;
}

/**
 * Generate positions for a platform structure
 * @param {Vec3} startPos - Starting corner position
 * @param {number} width - Width (X axis)
 * @param {number} depth - Depth (Z axis)
 * @returns {Array<Vec3>} Array of positions
 */
function generatePlatformPositions(startPos, width, depth) {
  const positions = [];
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < depth; z++) {
      positions.push(startPos.offset(x, 0, z));
    }
  }
  return positions;
}

/**
 * Calculate the center position of a structure for lookAtSmooth
 * @param {string} structureType - Type of structure
 * @param {Vec3} basePos - Base position of structure
 * @param {number} height - Height of structure
 * @param {number} length - Length of structure (for wall)
 * @param {number} width - Width of structure (for platform)
 * @returns {Vec3} Center position to look at
 */
function getStructureCenterForViewing(structureType, basePos, height, length = 1, width = 1) {
  // All structures are built along X axis with constant Z (Z offset = 0)
  if (structureType === "tower_2x1") {
    // Tower: single column of blocks at basePos.x
    return basePos.offset(length / 2, 0, 0);
  } else if (structureType === "wall_2x2" || structureType === "wall_4x1") {
    // Wall: blocks span from basePos.x to basePos.x + (length - 1)
    return basePos.offset(length / 2, 0, 0);
  } else if (structureType === "platform_2x2") {
    // Platform: blocks span both X and Z axes
    return basePos.offset(width / 2, 0, width / 2);
  }
  return basePos.offset(0, 0, 0);
}

// ========== Local helpers for face selection, LOS, and fast placement (episode-scoped) ==========
const CARDINALS = [
  new Vec3(1, 0, 0), // +X (east)
  new Vec3(-1, 0, 0), // -X (west)
  new Vec3(0, 0, 1), // +Z (south)
  new Vec3(0, 0, -1), // -Z (north)
  new Vec3(0, 1, 0), // +Y (up)
  new Vec3(0, -1, 0), // -Y (down)
];

function isAirLikeLocal(block) {
  return !block || block.name === "air" || block.boundingBox === "empty";
}

function reachMax(bot) {
  return bot.game && bot.game.gameMode === 1 ? 6 : 4.5;
}

function inReachLocal(bot, pos, max = reachMax(bot)) {
  const center = pos.offset(0.5, 0.5, 0.5);
  return bot.entity.position.distanceTo(center) <= max;
}

function faceCenterOf(refBlock, faceVec) {
  return refBlock.position.offset(
    0.5 + faceVec.x * 0.5,
    0.5 + faceVec.y * 0.5,
    0.5 + faceVec.z * 0.5
  );
}

function hasLineOfSightToFaceLocal(bot, refBlock, faceVec) {
  try {
    const eye = bot.entity.position.offset(0, (bot.entity.height ?? 1.62), 0);
    const faceCenter = faceCenterOf(refBlock, faceVec);
    const dx = faceCenter.x - eye.x;
    const dy = faceCenter.y - eye.y;
    const dz = faceCenter.z - eye.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    const step = 0.2; // blocks per step
    const steps = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = eye.x + dx * t;
      const py = eye.y + dy * t;
      const pz = eye.z + dz * t;
      const bpos = new Vec3(Math.floor(px), Math.floor(py), Math.floor(pz));
      if (bpos.equals(refBlock.position)) continue; // ignore the face's own block
      const b = bot.blockAt(bpos);
      if (b && b.boundingBox === "block") return false; // obstructed
    }
    return true;
  } catch (_) {
    return true; // be permissive on error
  }
}

function findVisibleReachablePlaceReferenceLocal(bot, targetPos) {
  for (const face of CARDINALS) {
    const refPos = targetPos.plus(face);
    const refBlock = bot.blockAt(refPos);
    if (!refBlock) continue;
    if (refBlock.boundingBox !== "block" || refBlock.material === "noteblock") continue;
    const faceVec = new Vec3(-face.x, -face.y, -face.z);
    if (!inReachLocal(bot, refBlock.position)) continue;
    if (!hasLineOfSightToFaceLocal(bot, refBlock, faceVec)) continue;
    return { refBlock, faceVec };
  }
  return null;
}

async function tryPlaceAtUsingLocal(bot, targetPos, itemName, refBlock, faceVec, options = {}) {
  const { useSneak = true, tries = 2, args = null } = options;
  // early exit if already placed
  if (!isAirLikeLocal(bot.blockAt(targetPos))) return true;
  await ensureItemInHand(bot, itemName, args);
  const sneakWas = bot.getControlState("sneak");
  if (useSneak) bot.setControlState("sneak", true);
  try {
    for (let i = 0; i < tries; i++) {
      if (!inReachLocal(bot, refBlock.position)) return false; // let caller fallback
      try {
        await bot.placeBlock(refBlock, faceVec);
      } catch (e) {
        await bot.waitForTicks(4);
        continue;
      }
      const placed = !isAirLikeLocal(bot.blockAt(targetPos));
      if (placed) return true;
      await bot.waitForTicks(4);
    }
    return !isAirLikeLocal(bot.blockAt(targetPos));
  } finally {
    if (useSneak && !sneakWas) bot.setControlState("sneak", false);
  }
}

/**
 * Place multiple blocks with delay between each placement (custom version for structureEval)
 * This version overrides the lookAt behavior to use smooth looking instead of instant snap
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Array<Vec3>} positions - Array of positions to place blocks
 * @param {string} itemName - Name of block/item to place
 * @param {Object} options - Options for placement
 * @returns {Promise<Object>} {success: number, failed: number, placed: number}
 */
async function placeMultipleWithDelay(bot, positions, itemName, options = {}) {
  const { delayTicks = 0 } = options;
  
  // Sort positions: bottom-up (Y), then far-to-near, then left-to-right
  // FAR-TO-NEAR ensures blocks are placed from furthest to closest,
  // preventing blocks from being placed through other unplaced blocks
  const botPos = bot.entity.position;
  const sorted = positions.slice().sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y; // Bottom first
    const distA = botPos.distanceTo(a);
    const distB = botPos.distanceTo(b);
    if (Math.abs(distA - distB) > 0.5) return distB - distA; // FAR first (reversed)
    return a.x - b.x; // Left to right
  });

  let success = 0;
  let failed = 0;

  // Override bot.lookAt to prevent camera movement during placeAt internal retries
  // We'll manually control when the bot looks (before each placement)
  const LOOK_SETTLE_DELAY_TICKS = 18; // Time to wait for smooth camera rotation to complete
  let allowLookAt = true; // Flag to control when lookAt is allowed
  const originalLookAt = bot.lookAt.bind(bot);
  bot.lookAt = async function(position, forceLook) {
    // Only allow lookAt when explicitly enabled
    if (allowLookAt) {
      // Use smooth looking and wait for it to settle
      await originalLookAt(position, false);
      await bot.waitForTicks(LOOK_SETTLE_DELAY_TICKS); // 500ms / 20 ticks/second
    }
    // When disabled: do nothing, maintain current camera angle
    // This prevents placeAt's internal retry logic from moving the camera
  };

  try {
    // Initialize pathfinder for movement
    initializePathfinder(bot, {
      allowSprinting: false,
      allowParkour: false,
      canDig: false,
      allowEntityDetection: true,
    });

    let blockIndex = 0; // Track which block we're placing
    for (const pos of sorted) {
      blockIndex++;
      
      try {
        // Move bot to stand ADJACENT to the block position before placing
        // This creates natural "walking along while building" behavior
        const currentBotPos = bot.entity.position.clone();
        
        // Calculate adjacent position with a diagonal stance (never exactly parallel)
        // For X-axis walls: move 2 blocks to the south (Z-) AND 1 block west (X-)
        // For Z-axis walls (and towers): move 2 blocks to the west (X-) AND 1 block north (Z-)
        // This diagonal offset makes at least two side faces and often the top visible at ground level.
        const adjacentPos = pos.clone();

        // Determine wall direction by checking if positions vary in X or Z
        const firstPos = sorted[0];
        const lastPos = sorted[sorted.length - 1];
        const isXAxis = Math.abs(lastPos.x - firstPos.x) > Math.abs(lastPos.z - firstPos.z);
        
        if (isXAxis) {
          // Side offset along Z-, and along-wall offset west (X-)
          adjacentPos.z -= PLACEMENT_STANDOFF_BLOCKS; // 2 blocks south
          adjacentPos.x += -1; // 1 block west (diagonal)
        } else {
          // Side offset along X-, and along-wall offset north (Z-)
          adjacentPos.x -= PLACEMENT_STANDOFF_BLOCKS; // 2 blocks west
          adjacentPos.z += -1; // 1 block north (diagonal)
        }
        
        // HARD-CODED ENFORCEMENT: Skip adjacent movement for 4th block in 4-block structures
        const skip4BlockMovement = (blockIndex === 4 && sorted.length === 4);
        
        // Move to adjacent position if not already there and skip4BlockMovement is false
        const distanceToAdjacent = currentBotPos.distanceTo(adjacentPos);
        if (distanceToAdjacent > ADJACENT_GOAL_RADIUS && !skip4BlockMovement) {
          console.log(`[${bot.username}] 🚶 Moving to adjacent position (${adjacentPos.x.toFixed(1)}, ${adjacentPos.y}, ${adjacentPos.z.toFixed(1)}) before placing at ${pos}`);
          const adjacentGoal = new GoalNear(
            adjacentPos.x,
            adjacentPos.y,
            adjacentPos.z,
            ADJACENT_GOAL_RADIUS
          );
          
          try {
            await gotoWithTimeout(bot, adjacentGoal, { timeoutTicks: 60 });
          } catch (moveError) {
            console.log(`[${bot.username}] ⚠️ Could not move to adjacent position: ${moveError.message}`);
          }
        } else if (skip4BlockMovement) {
          console.log(`[${bot.username}] � FORCED NO-MOVE: Skipping adjacent movement for 4th block at ${pos}`);
        }

        // HARD-CODED FIX: Force 4th block to use the block directly below (top face)
        let forcedReference = null;
        if (blockIndex === 4 && sorted.length === 4) {
          // This is the 4th block in a 4-block structure (2x2 wall or 4x1 wall)
          const belowPos = pos.offset(0, -1, 0);
          const belowBlock = bot.blockAt(belowPos);
          if (belowBlock && belowBlock.boundingBox === "block") {
            forcedReference = {
              refBlock: belowBlock,
              faceVec: new Vec3(0, 1, 0) // Click the TOP face
            };
            console.log(`[${bot.username}] 🎯 FORCED: 4th block will use TOP face of block below at ${belowPos}`);
          }
        }
        
        // Use forced reference if available, otherwise use normal logic
        const visibleRef = forcedReference || findVisibleReachablePlaceReferenceLocal(bot, pos);
        // Fallback reference if none visible from here (may trigger pathfinder later)
        const placeReference = visibleRef || findPlaceReference(bot, pos);
        if (placeReference) {
          const { refBlock, faceVec } = placeReference;
          
          // Calculate the specific face position to look at (not the center)
          const lookAtFacePos = refBlock.position.offset(
            0.5 + faceVec.x * 0.5,
            0.5 + faceVec.y * 0.5,
            0.5 + faceVec.z * 0.5
          );
          
          // EXPLICITLY look at the reference block's face (where we'll click)
          // This also verifies line of sight - if lookAt fails, we don't have LOS
          allowLookAt = true;
          try {
            await bot.lookAt(lookAtFacePos);
            console.log(`[${bot.username}] 👁️ Looking at reference face at ${refBlock.position} (face: ${faceVec.x},${faceVec.y},${faceVec.z}) ${visibleRef ? "[visible+reachable]" : "[fallback]"}${skip4BlockMovement ? " [NO-MOVE]" : ""}`);
          } catch (lookError) {
            console.log(`[${bot.username}] ⚠️ Cannot look at reference block face - no line of sight: ${lookError.message}`);
          }
        } else {
          console.log(`[${bot.username}] ⚠️ No reference block found for position ${pos}`);
        }

        // Now disable lookAt during placeAt to prevent camera resetting
        allowLookAt = false;
        // If we have a visible+reachable face, place directly using it; else fallback to robust placeAt (may pathfind)
        let placed;
        if (visibleRef) {
          placed = await tryPlaceAtUsingLocal(bot, pos, itemName, visibleRef.refBlock, visibleRef.faceVec, options);
          if (!placed) {
            console.log(`[${bot.username}] 🔁 Visible+reachable face placement failed; falling back to robust placeAt (may pathfind)`);
            placed = await placeAt(bot, pos, itemName, options);
          }
        } else {
          placed = await placeAt(bot, pos, itemName, options);
        }
        
        if (placed) {
          success++;
          console.log(`[${bot.username}] ✅ Placed block at ${pos}`);
        } else {
          failed++;
          console.log(`[${bot.username}] ❌ Failed to place at ${pos}`);
        }
      } catch (error) {
        failed++;
        console.log(
          `[${bot.username}] ❌ Error placing at ${pos}: ${error.message}`
        );
      }
      
      // Add delay between blocks if specified
      if (delayTicks > 0) {
        await bot.waitForTicks(delayTicks);
      }
    }
  } finally {
    // Restore original lookAt behavior
    bot.lookAt = originalLookAt;
    stopPathfinder(bot);
  }

  return { success, failed, placed: success };
}

/**
 * Main building loop - bot builds assigned structure
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Array<Vec3>} positions - Positions to build at
 * @param {string} blockType - Type of block to place
 * @param {Object} args - Configuration arguments
 * @returns {Promise<Object>} Build statistics
 */
async function buildStructure(bot, positions, blockType, args) {
  console.log(
    `[${bot.username}] 🏗️ Starting to build ${positions.length} blocks...`
  );

  // Initialize pathfinder for movement
  initializePathfinder(bot, {
    allowSprinting: false,
    allowParkour: true,
    canDig: true,
    allowEntityDetection: true,
  });

  try {
    const result = await placeMultipleWithDelay(bot, positions, blockType, {
      useSneak: true,
      tries: 5,
      args: args,
      delayTicks: getBlockPlaceDelayTicks(positions.length), // Add delay between blocks
    });

    console.log(`[${bot.username}] 🏁 Build complete!`);
    console.log(
      `[${bot.username}]    Success: ${result.success}/${positions.length}`
    );
    console.log(
      `[${bot.username}]    Failed: ${result.failed}/${positions.length}`
    );

    return result;
  } finally {
    stopPathfinder(bot);
  }
}

/**
 * Get the phase function for structure eval episodes
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Object} rcon - RCON connection
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} iterationID - Iteration ID
 * @param {number} episodeNum - Episode number
 * @param {Object} episodeInstance - Episode instance
 * @param {Object} args - Configuration arguments
 * @returns {Function} Phase function
 */
function getOnStructureEvalPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  iterationID,
  episodeNum,
  episodeInstance,
  args
) {
  return async function onStructureEvalPhase(otherBotPosition) {
    coordinator.sendToOtherBot(
      `structureEvalPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `structureEvalPhase_${iterationID} beginning`
    );

    console.log(`[${bot.username}] 🚀 Starting STRUCTURE EVAL phase ${iterationID}`);

    // Save initial spawn position for later return
    const initialSpawnPos = bot.entity.position.clone();
    console.log(
      `[${bot.username}] 📍 Spawn position: ${initialSpawnPos.toString()}`
    );
    
    // Track start tick for minimum episode duration
    let startTick = null;

    // STEP 1: Bots spawn (already done by teleport phase)
    console.log(`[${bot.username}] ✅ STEP 1: Bot spawned`);

    // Determine role assignment using shared RNG for true 50/50 randomization
    // Both bots use the same random seed, so they agree on who is builder/observer
    const roleAssignmentModes = ["alpha_builds", "bravo_builds"];
    const selectedRoleMode = roleAssignmentModes[Math.floor(sharedBotRng() * roleAssignmentModes.length)];
    
    // Determine if this bot is the builder based on the randomly selected mode
    let isBuilder;
    if (selectedRoleMode === "alpha_builds") {
      isBuilder = bot.username < args.other_bot_name; // Alpha (lower name) builds
    } else {
      isBuilder = bot.username >= args.other_bot_name; // Bravo (higher name) builds
    }
    
    const role = isBuilder ? "BUILDER" : "OBSERVER";
    
    console.log(
      `[${bot.username}] 🎭 Role mode: ${selectedRoleMode}, Role: ${role}`
    );
    
    // Calculate builder's spawn position for structure location (both bots need this)
    // Builder uses their own spawn, observer uses the other bot's spawn position
    // Note: otherBotPosition is a plain object from coordinator, need to convert to Vec3
    const builderSpawnPos = isBuilder 
      ? initialSpawnPos.floored() 
      : new Vec3(otherBotPosition.x, otherBotPosition.y, otherBotPosition.z).floored();
    
    // STEP 1b-pre: Builder equips stone block in hand (before any movement or interactions)
    if (isBuilder) {
      console.log(
        `[${bot.username}] 🔧 STEP 1b-pre: Equipping stone in hand...`
      );
      try {
        // Find stone block in inventory
        const stoneItem = bot.inventory.items().find(item => item.name === "stone");
        if (stoneItem) {
          await bot.equip(stoneItem, "hand");
          console.log(`[${bot.username}] ✅ Equipped stone in hand`);
        } else {
          console.log(`[${bot.username}] ⚠️ No stone found in inventory`);
        }
      } catch (equipError) {
        console.log(
          `[${bot.username}] ⚠️ Could not equip stone: ${equipError.message}`
        );
      }
      await bot.waitForTicks(15); // Brief pause after equipping
    }
    
    // STEP 1b-sneak: Builder sneaks (acknowledgment gesture), Observer remains stationary
    if (isBuilder) {
      console.log(
        `[${bot.username}] STEP 1b-sneak: Sneaking...`
      );
      await sneak(bot);
      // Record tick number after sneak
      startTick = bot.time.age;
      console.log(`[${bot.username}] ✅ Sneak complete, startTick: ${startTick}`);
    } else {
      console.log(
        `[${bot.username}] STEP 1b-sneak: Remaining stationary (observer role)`
      );
      // Observer waits equivalent time but does nothing
      await bot.waitForTicks(15);
    }

    await bot.waitForTicks(10);

    // STEP 2: Initial eye contact (BUILDER only, observer remains stationary)
    if (isBuilder) {
      console.log(
        `[${bot.username}] 👀 STEP 2: Making eye contact with ${args.other_bot_name}...`
      );
      try {
        const otherEntity = bot.players[args.other_bot_name]?.entity;
        if (otherEntity) {
          const targetPos = otherEntity.position.offset(0, otherEntity.height, 0);
          await bot.lookAt(targetPos);
          await bot.waitForTicks(getInitialEyeContactTicks(ALL_STRUCTURE_TYPES.length));
        }
      } catch (lookError) {
        console.log(
          `[${bot.username}] ⚠️ Could not look at other bot: ${lookError.message}`
        );
      }
    } else {
      console.log(
        `[${bot.username}] 🧍 STEP 2: Remaining stationary (observer role)...`
      );
      await bot.waitForTicks(getInitialEyeContactTicks(ALL_STRUCTURE_TYPES.length));
    }

    // STEP 3: Determine build positions based on bot role
    console.log(
      `[${bot.username}] 📐 STEP 3: Planning structure...`
    );
    
    // Both bots use shared RNG to select the same structure type and block type
    const structureType = ALL_STRUCTURE_TYPES[Math.floor(sharedBotRng() * ALL_STRUCTURE_TYPES.length)];
    const blockType = BUILD_BLOCK_TYPES[Math.floor(sharedBotRng() * BUILD_BLOCK_TYPES.length)];
    
    console.log(
      `[${bot.username}] 🎲 Randomly selected: ${structureType} with ${blockType}`
    );
    
    // Record important episode metadata (like translation-eval-episode.js)
    const builderBotName = isBuilder ? bot.username : args.other_bot_name;
    const observerBotName = isBuilder ? args.other_bot_name : bot.username;
    episodeInstance._evalMetadata = {
      structure_type: structureType,
      block_type: blockType,
      builder_bot: builderBotName,
      observer_bot: observerBotName,
      role_assignment_mode: selectedRoleMode,
    };
    
    const botPos = builderSpawnPos.floored();
    let positions = [];
    let structureBasePos = null;
    let structureHeight = null;
    let structureLength = null; // as seen from the front, sideways length
    let structureWidth = 1; // in other words, depth

    if (structureType === "platform_2x2") {
      // NOTE: platform 2x2 is un-used right now
      const startPos = botPos.offset(1, 0, 0);
      const width = 2;
      const depth = 2;
      structureHeight = 1;
      structureWidth = width;
      positions = generatePlatformPositions(startPos, width, depth);
      structureBasePos = startPos;
    } else if (structureType === "wall_2x2") {
      const startPos = botPos.offset(1, 0, 0);
      const length = 2;
      const height = 2;
      structureHeight = height;
      structureLength = length;
      positions = generateWallPositions(startPos, length, height, "x");
      structureBasePos = startPos;
    } else if (structureType === "wall_4x1") {
      const startPos = botPos.offset(1, 0, 0);
      const length = 4;
      const height = 1;
      structureHeight = height;
      structureLength = length;
      positions = generateWallPositions(startPos, length, height, "x");
      structureBasePos = startPos;
    } else if (structureType === "tower_2x1") {
      const startPos = botPos.offset(1, 0, 0);
      const height = 2;
      structureHeight = height;
      structureLength = 1;
      positions = generateTowerPositions(startPos, height);
      structureBasePos = startPos;
    }

    console.log(
      `[${bot.username}] 📋 ${isBuilder ? 'Building' : 'Observing'} ${positions.length} blocks with ${blockType}`
    );

    // STEP 4: Build the structure (only builder builds, observer watches)
    let buildResult = { placed: 0, failed: 0 };
    
    if (isBuilder) {
      console.log(`[${bot.username}] 🏗️ STEP 4: Building structure...`);
      buildResult = await buildStructure(bot, positions, blockType, args);
    } else {
      console.log(`[${bot.username}] 🧍 STEP 4: Remaining stationary (observer role)...`);
      // Observer remains completely stationary - no looking, no movement
      const totalWatchTime = positions.length * getBlockPlaceDelayTicks(positions.length);
      await bot.waitForTicks(totalWatchTime);
      console.log(`[${bot.username}] ✅ Finished waiting (stationary)`);
    }

    // STEP 5: Both bots move to the front of the structure (axially aligned)
    // This ensures both bots view the structure from the front, not the side
    console.log(
      `[${bot.username}] 🚶 STEP 5: Moving to front of structure (axially aligned)...`
    );
    try {
      initializePathfinder(bot, {
        allowSprinting: true,
        allowParkour: true,
        canDig: false,
        allowEntityDetection: true,
      });

      // Calculate the actual structure base position based on builder's spawn
      // Structure is always built at builderSpawnPos.offset(1, 0, 0)
      const actualStructureBasePos = builderSpawnPos.offset(1, 0, 0);
      
      // For walls built along X axis, "front" is along the Z axis
      // We want both bots to be axially aligned with the structure's center X
      const FRONT_DISTANCE = 6; // Stand 4 blocks in front of the structure
      const actualStructureCenterX = actualStructureBasePos.x + (structureLength) / 2;
      const frontZ = actualStructureBasePos.z - FRONT_DISTANCE; // Front is in -Z direction
      
      // Both bots stand side by side, axially aligned with structure center
      // Offset along X so they don't overlap
      const sideOffset = isBuilder ? 1 : -1; // Builder to the right, observer to the left
      const targetX = actualStructureCenterX + sideOffset;
      const targetZ = frontZ;
      
      console.log(
        `[${bot.username}] 📐 Structure center X: ${actualStructureCenterX.toFixed(1)}, moving to front position (${targetX.toFixed(1)}, ${targetZ.toFixed(1)})`
      );

      // Move to front position (axially aligned with structure)
      const frontGoal = new GoalNear(
        targetX,
        bot.entity.position.y,
        targetZ,
        1 // Get within 1 block of the target position
      );
      await gotoWithTimeout(bot, frontGoal, { timeoutTicks: 200 });
      console.log(`[${bot.username}] ✅ Moved to front of structure (axially aligned)`);
      
      // Calculate the structure center for viewing (using actualStructureCenterX)
      const viewPosition = getStructureCenterForViewing(structureType, actualStructureBasePos, structureHeight, structureLength, structureWidth);
      
      // Look at the structure together
      if (viewPosition) {
        console.log(`[${bot.username}] 👁️ Looking at structure from front...`);
        await lookAtSmooth(bot, viewPosition, 90, { randomized: false, useEasing: false });
        await bot.waitForTicks(getBuilderAdmireTicks(positions.length));
        console.log(`[${bot.username}] ✅ Admired structure from front position`);
      }
    } catch (pathError) {
      console.log(
        `[${bot.username}] ⚠️ Could not move to front: ${pathError.message}`
      );
    } finally {
      stopPathfinder(bot);
    }

    // Wait for minimum ticks if needed (builder only)
    if (startTick !== null) {
      const endTick = bot.time.age;
      const remainingTicks = EPISODE_MIN_TICKS - (endTick - startTick);
      if (remainingTicks > 0) {
        console.log(`[${bot.username}] waiting ${remainingTicks} more ticks to reach ${EPISODE_MIN_TICKS} total ticks`);
        await bot.waitForTicks(remainingTicks);
      } else {
        console.log(`[${bot.username}] already passed ${EPISODE_MIN_TICKS} ticks (elapsed: ${endTick - startTick})`);
      }
    } else {
      console.log(`[${bot.username}] startTick is null, skipping minimum ticks check`);
    }

    console.log(`[${bot.username}] ✅ STRUCTURE EVAL phase complete!`);

    // Transition to stop phase
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
      `structureEvalPhase_${iterationID} end`
    );

    return buildResult;
  };
}

/**
 * StructureEvalEpisode - Episode class for independent structure building and evaluation
 */
class StructureEvalEpisode extends BaseEpisode {
  static INIT_MIN_BOTS_DISTANCE = 6;
  static INIT_MAX_BOTS_DISTANCE = 6;
  static WORKS_IN_NON_FLAT_WORLD = true;

  constructor(sharedBotRng) {
    super();
  }

  async setupEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args, botPosition, otherBotPosition) {
    for (const blockType of BUILD_BLOCK_TYPES) {
      await ensureBotHasEnough(bot, rcon, blockType, 64);
    }
    await unequipHand(bot);
    return {
      botPositionNew: botPosition,
      otherBotPositionNew: otherBotPosition,
    };
  }

  async entryPoint(
    bot,
    rcon,
    sharedBotRng,
    coordinator,
    iterationID,
    episodeNum,
    args
  ) {
    coordinator.onceEvent(
      `structureEvalPhase_${iterationID}`,
      episodeNum,
      getOnStructureEvalPhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        iterationID,
        episodeNum,
        this,
        args
      )
    );
    coordinator.sendToOtherBot(
      `structureEvalPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      "entryPoint end"
    );
  }

  async tearDownEpisode(
    bot,
    rcon,
    sharedBotRng,
    coordinator,
    episodeNum,
    args
  ) {
    // Clean up any remaining blocks from inventory
  }
}

module.exports = {
  // Main exports
  buildStructure,
  generateWallPositions,
  generateTowerPositions,
  generatePlatformPositions,
  getStructureCenterForViewing,
  getOnStructureEvalPhaseFn,
  placeMultipleWithDelay,
  StructureEvalEpisode,
  // Constants (for reuse in debug/no-place variant)
  ALL_STRUCTURE_TYPES,
  BUILD_BLOCK_TYPES,
  EPISODE_MIN_TICKS,
  PLACEMENT_STANDOFF_BLOCKS,
  ADJACENT_GOAL_RADIUS,
  CARDINALS,
  // Timing functions (for reuse in debug/no-place variant)
  getInitialEyeContactTicks,
  getBlockPlaceDelayTicks,
  getBuilderAdmireTicks,
  // Local helper functions (for reuse in debug/no-place variant)
  isAirLikeLocal,
  reachMax,
  inReachLocal,
  faceCenterOf,
  hasLineOfSightToFaceLocal,
  findVisibleReachablePlaceReferenceLocal,
};
