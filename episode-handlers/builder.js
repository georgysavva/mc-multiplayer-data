// builder.js - Robust block placement utility for Minecraft bots
const { Vec3 } = require("vec3");

// Cardinal directions for finding reference blocks (faces to click)
// Ordered by preference: Top face first (easiest), then horizontals, then bottom
const CARDINALS = [
  new Vec3(0, 1, 0), // +Y (top) - PREFERRED: easiest to place on
  new Vec3(-1, 0, 0), // -X (west)
  new Vec3(1, 0, 0), // +X (east)
  new Vec3(0, 0, -1), // -Z (north)
  new Vec3(0, 0, 1), // +Z (south)
  new Vec3(0, -1, 0), // -Y (bottom) - LAST: hardest to place on
];

/**
 * Check if a block is air or air-like (passable)
 * @param {Block} block - Block to check
 * @returns {boolean} True if air-like
 */
function isAirLike(block) {
  return !block || block.name === "air" || block.boundingBox === "empty";
}

/**
 * Check if a position is within reach
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} pos - Position to check
 * @param {number} max - Maximum reach distance
 * @returns {boolean} True if in reach
 */
function inReach(bot, pos, max = 4.5) {
  return bot.entity.position.distanceTo(pos.offset(0.5, 0.5, 0.5)) <= max;
}

/**
 * Calculate a score for how good a face is for placement
 * Considers bot's view direction, face orientation, and accessibility
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} faceVec - Face vector (normal direction)
 * @param {Vec3} refBlockPos - Position of reference block
 * @returns {number} Score from 0-100 (higher is better)
 */
function scoreFace(bot, faceVec, refBlockPos) {
  let score = 50; // Base score

  // Get bot's view direction (normalized)
  const yaw = bot.entity.yaw;
  const pitch = bot.entity.pitch;
  const viewDir = new Vec3(
    -Math.sin(yaw) * Math.cos(pitch),
    -Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  );

  // Calculate dot product between view direction and face normal
  // Dot product: 1 = facing directly, 0 = perpendicular, -1 = facing away
  const dotProduct =
    viewDir.x * faceVec.x + viewDir.y * faceVec.y + viewDir.z * faceVec.z;

  // Bonus for faces the bot is already looking at (0 to +30 points)
  if (dotProduct > 0) {
    score += dotProduct * 30;
  } else {
    // Penalty for faces behind the bot (-20 to 0 points)
    score += dotProduct * 20;
  }

  // Bonus for horizontal faces (+10 points) - easier to reach and see
  if (faceVec.y === 0) {
    score += 10;
  }

  // Extra bonus for top face (+15 points) - most natural placement
  if (faceVec.y === 1) {
    score += 15;
  }

  // Penalty for bottom face (-10 points) - hardest to place on
  if (faceVec.y === -1) {
    score -= 10;
  }

  // Bonus for closer blocks (+0 to +10 points based on distance)
  const distance = bot.entity.position.distanceTo(refBlockPos);
  const maxReach = bot.game.gameMode === 1 ? 6 : 4.5;
  if (distance <= maxReach) {
    score += (1 - distance / maxReach) * 10;
  }

  // Clamp score to 0-100 range
  return Math.max(0, Math.min(100, score));
}

/**
 * Find the best reference block and face for placing at targetPos
 * Enhanced version with visibility checks and scoring
 * Returns all viable candidates for fallback support
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPos - Target position to place block
 * @param {Object} options - Options {returnAll: boolean, minScore: number}
 * @returns {Object|Array|null} Best candidate, all candidates array, or null
 */
function findBestPlaceReference(bot, targetPos, options = {}) {
  const { returnAll = false, minScore = 0 } = options;
  const candidates = [];

  // Validation: Check if targetPos is valid
  if (!targetPos || typeof targetPos.x !== 'number' || typeof targetPos.y !== 'number' || typeof targetPos.z !== 'number') {
    console.warn(`[${bot.username}] ⚠️ Invalid target position:`, targetPos);
    return returnAll ? [] : null;
  }

  // Try all 6 cardinal directions
  for (const face of CARDINALS) {
    try {
      const refPos = targetPos.plus(face); // Position of block we'd click on
      const refBlock = bot.blockAt(refPos);

      // Skip if no block exists at this position
      if (!refBlock) continue;

      // Only click on solid blocks (not air, not liquids, not transparent)
      if (refBlock.boundingBox !== "block") continue;
      if (refBlock.material === "noteblock") continue; // Skip note blocks (can be problematic)

      // Check if bot can see this block (basic visibility check)
      if (!bot.canSeeBlock(refBlock)) continue;

      // Face vector is the opposite of the offset from ref to target
      const faceVec = new Vec3(-face.x, -face.y, -face.z);

      // Calculate face center point for detailed checks
      const faceCenter = refBlock.position.offset(
        0.5 + faceVec.x * 0.5,
        0.5 + faceVec.y * 0.5,
        0.5 + faceVec.z * 0.5
      );

      // Check if the face itself is obstructed by another block
      // (e.g., if there's a block between the reference block and target)
      const obstructionPos = refPos.plus(faceVec);
      const obstructionBlock = bot.blockAt(obstructionPos);
      if (
        obstructionBlock &&
        obstructionBlock.boundingBox === "block" &&
        !obstructionPos.equals(targetPos)
      ) {
        // Face is blocked by another solid block
        continue;
      }

      // Calculate score for this face
      const score = scoreFace(bot, faceVec, refBlock.position);

      // Only include candidates above minimum score threshold
      if (score >= minScore) {
        candidates.push({
          refBlock,
          faceVec,
          score,
          distance: bot.entity.position.distanceTo(refBlock.position),
        });
      }
    } catch (error) {
      // Gracefully handle errors for individual faces
      console.warn(`[${bot.username}] ⚠️ Error checking face ${face}: ${error.message}`);
      continue;
    }
  }

  // Sort candidates by score (highest first)
  candidates.sort((a, b) => b.score - a.score);

  // Return all candidates if requested (for fallback support)
  if (returnAll) {
    return candidates;
  }

  // Return the best candidate, or null if none found
  if (candidates.length > 0) {
    const best = candidates[0];
    console.log(
      `[${bot.username}] 🎯 Best face: score=${best.score.toFixed(1)}, ` +
        `vec=(${best.faceVec.x},${best.faceVec.y},${best.faceVec.z}), ` +
        `dist=${best.distance.toFixed(1)} ` +
        `(${candidates.length} candidates)`
    );
    return { refBlock: best.refBlock, faceVec: best.faceVec, score: best.score, alternatives: candidates.length - 1 };
  }

  return null;
}

/**
 * Find a reference block + face vector to place at targetPos
 * DEPRECATED: Use findBestPlaceReference() instead
 * Kept for backward compatibility
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPos - Target position to place block
 * @returns {Object|null} {refBlock, faceVec} or null if no valid reference
 */
function findPlaceReference(bot, targetPos) {
  const result = findBestPlaceReference(bot, targetPos);
  if (result) {
    return { refBlock: result.refBlock, faceVec: result.faceVec };
  }
  return null;
}

/**
 * Perform a raycast from one position to another to check for obstructions
 * Steps through the ray in small increments and checks for solid blocks
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} fromPos - Starting position (usually bot's eye position)
 * @param {Vec3} toPos - Target position (usually face center)
 * @returns {Object} {clear: boolean, obstruction: Vec3|null}
 */
function raycastToPosition(bot, fromPos, toPos) {
  const direction = toPos.minus(fromPos);
  const distance = direction.norm();
  
  if (distance === 0) {
    return { clear: true, obstruction: null };
  }

  const normalized = direction.scaled(1 / distance);
  const stepSize = 0.1; // Check every 0.1 blocks
  const steps = Math.ceil(distance / stepSize);

  for (let i = 1; i < steps; i++) {
    const checkPos = fromPos.plus(normalized.scaled(i * stepSize));
    const block = bot.blockAt(checkPos.floored());

    // Check if there's a solid block obstructing the path
    if (block && block.boundingBox === "block") {
      // Make sure it's not the target block itself
      const flooredCheck = checkPos.floored();
      const flooredTo = toPos.floored();
      if (!flooredCheck.equals(flooredTo)) {
        return { clear: false, obstruction: flooredCheck };
      }
    }
  }

  return { clear: true, obstruction: null };
}

/**
 * Check if a target position is completely obstructed (all faces blocked)
 * Used to detect if a block is enclosed and cannot be placed
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPos - Position to check
 * @returns {boolean} True if all 6 faces are blocked by solid blocks
 */
function isBlockObstructed(bot, targetPos) {
  let blockedFaces = 0;

  for (const face of CARDINALS) {
    const adjacentPos = targetPos.plus(face);
    const adjacentBlock = bot.blockAt(adjacentPos);

    // If there's a solid block on this face, it's blocked
    if (adjacentBlock && adjacentBlock.boundingBox === "block") {
      blockedFaces++;
    }
  }

  // If all 6 faces are blocked, the position is completely obstructed
  return blockedFaces === 6;
}

/**
 * Check if the bot can see a specific face of a reference block
 * Performs detailed line-of-sight validation using raycast
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Block} refBlock - Reference block to check
 * @param {Vec3} faceVec - Face vector (normal direction of the face)
 * @returns {boolean} True if bot has clear line of sight to the face
 */
function canSeeFace(bot, refBlock, faceVec) {
  // Calculate the center point of the face we want to click
  const faceCenter = refBlock.position.offset(
    0.5 + faceVec.x * 0.5,
    0.5 + faceVec.y * 0.5,
    0.5 + faceVec.z * 0.5
  );

  // Get bot's eye position (eyes are at 90% of entity height)
  const eyePos = bot.entity.position.offset(0, bot.entity.height * 0.9, 0);

  // First check: Can bot see the block at all? (fast check)
  if (!bot.canSeeBlock(refBlock)) {
    return false;
  }

  // Second check: Raycast from eye to face center (detailed check)
  const raycast = raycastToPosition(bot, eyePos, faceCenter);
  if (!raycast.clear) {
    // Something is blocking the line of sight
    return false;
  }

  // Third check: Make sure the face isn't pointing away from the bot
  // (We shouldn't be able to "see" the back of a block)
  const toFace = faceCenter.minus(eyePos).normalize();
  const dotProduct = toFace.x * faceVec.x + toFace.y * faceVec.y + toFace.z * faceVec.z;
  
  // If dot product is positive, we're looking at the back of the face
  // (face normal points away from us)
  if (dotProduct > 0.1) {
    return false;
  }

  return true;
}

/**
 * Check if a position is safe for the bot to stand
 * Validates ground support, no obstructions, and reasonable distance
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} position - Position to check
 * @param {Vec3} targetPos - Target block position (for distance check)
 * @returns {boolean} True if position is safe
 */
function isPositionSafe(bot, position, targetPos) {
  const flooredPos = position.floored();
  
  // Check 1: Position must be within reasonable distance (not too far)
  const maxDistance = bot.game.gameMode === 1 ? 6 : 4.5;
  if (position.distanceTo(targetPos) > maxDistance) {
    return false;
  }

  // Check 2: Block at position should be air (not inside a block)
  const blockAtPos = bot.blockAt(flooredPos);
  if (blockAtPos && blockAtPos.boundingBox === "block") {
    return false;
  }

  // Check 3: Block above should also be air (enough headroom)
  const blockAbove = bot.blockAt(flooredPos.offset(0, 1, 0));
  if (blockAbove && blockAbove.boundingBox === "block") {
    return false;
  }

  // Check 4: Must have solid ground below (or be on existing structure)
  const groundPos = flooredPos.offset(0, -1, 0);
  const groundBlock = bot.blockAt(groundPos);
  if (!groundBlock || groundBlock.boundingBox !== "block") {
    return false;
  }

  return true;
}

/**
 * Calculate the optimal position for the bot to stand when placing a block
 * Considers face direction, distance, and viewing angle
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Block} refBlock - Reference block to place on
 * @param {Vec3} faceVec - Face vector
 * @param {Vec3} targetPos - Target position where block will be placed
 * @returns {Object} {position: Vec3, yaw: number, pitch: number}
 */
function calculateOptimalPosition(bot, refBlock, faceVec, targetPos) {
  // Calculate face center
  const faceCenter = refBlock.position.offset(
    0.5 + faceVec.x * 0.5,
    0.5 + faceVec.y * 0.5,
    0.5 + faceVec.z * 0.5
  );

  // Ideal distance: 2.5-3.5 blocks away from the face
  const idealDistance = 3.0;
  
  // Calculate direction away from the face (opposite of face normal)
  // We want to stand back from the face, not on top of it
  const awayFromFace = new Vec3(-faceVec.x, 0, -faceVec.z); // Keep Y=0 for horizontal movement
  
  // If face is horizontal (top or bottom), use different logic
  if (faceVec.y !== 0) {
    // For top/bottom faces, stand to the side
    // Use the direction from target to bot's current position
    const currentDir = bot.entity.position.minus(targetPos);
    awayFromFace.x = currentDir.x;
    awayFromFace.z = currentDir.z;
  }
  
  // Normalize the direction
  const horizontalDist = Math.sqrt(awayFromFace.x * awayFromFace.x + awayFromFace.z * awayFromFace.z);
  if (horizontalDist > 0.001) {
    awayFromFace.x /= horizontalDist;
    awayFromFace.z /= horizontalDist;
  } else {
    // Fallback: use bot's current direction
    awayFromFace.x = -Math.sin(bot.entity.yaw);
    awayFromFace.z = -Math.cos(bot.entity.yaw);
  }

  // Calculate optimal standing position
  const optimalPos = faceCenter.offset(
    awayFromFace.x * idealDistance,
    0, // Keep at same Y level initially
    awayFromFace.z * idealDistance
  );

  // Adjust Y to ground level
  const groundY = Math.floor(optimalPos.y);
  optimalPos.y = groundY;

  // Calculate yaw and pitch to look at face center
  const dx = faceCenter.x - optimalPos.x;
  const dy = faceCenter.y - (optimalPos.y + bot.entity.height * 0.9); // Eye level
  const dz = faceCenter.z - optimalPos.z;
  
  const yaw = Math.atan2(-dx, -dz);
  const groundDistance = Math.sqrt(dx * dx + dz * dz);
  const pitch = Math.atan2(dy, groundDistance);

  return {
    position: optimalPos,
    yaw: yaw,
    pitch: pitch
  };
}

/**
 * Move the bot to an optimal position for placing a block
 * Uses pathfinder to navigate and validates line of sight after movement
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Block} refBlock - Reference block to place on
 * @param {Vec3} faceVec - Face vector
 * @param {Vec3} targetPos - Target position where block will be placed
 * @param {number} timeoutMs - Timeout for pathfinding (default: 5000ms)
 * @returns {Promise<Object>} {success: boolean, position: Vec3, reason: string}
 */
async function moveToPlacementPosition(bot, refBlock, faceVec, targetPos, timeoutMs = 5000) {
  // Calculate optimal position
  const optimal = calculateOptimalPosition(bot, refBlock, faceVec, targetPos);
  
  // Check if bot is already in a good position
  const currentDist = bot.entity.position.distanceTo(refBlock.position);
  const maxReach = bot.game.gameMode === 1 ? 6 : 4.5;
  
  if (currentDist <= maxReach && canSeeFace(bot, refBlock, faceVec)) {
    // Already in good position
    return {
      success: true,
      position: bot.entity.position.clone(),
      reason: "Already in optimal position"
    };
  }

  // Check if optimal position is safe
  if (!isPositionSafe(bot, optimal.position, targetPos)) {
    // Try alternative positions in a circle around the target
    const angles = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2];
    for (const angle of angles) {
      const altX = optimal.position.x * Math.cos(angle) - optimal.position.z * Math.sin(angle);
      const altZ = optimal.position.x * Math.sin(angle) + optimal.position.z * Math.cos(angle);
      const altPos = new Vec3(altX, optimal.position.y, altZ);
      
      if (isPositionSafe(bot, altPos, targetPos)) {
        optimal.position = altPos;
        break;
      }
    }
  }

  // Use pathfinder to move to position
  if (!bot.pathfinder) {
    return {
      success: false,
      position: bot.entity.position.clone(),
      reason: "Pathfinder not initialized"
    };
  }

  try {
    const { goals } = require("mineflayer-pathfinder");
    const goal = new goals.GoalNear(
      optimal.position.x,
      optimal.position.y,
      optimal.position.z,
      2 // Accept within 2 blocks
    );

    bot.pathfinder.setGoal(goal, true);
    
    // Wait for movement to complete or timeout
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        bot.pathfinder.setGoal(null);
        resolve();
      }, timeoutMs);

      const checkGoal = () => {
        if (!bot.pathfinder.isMoving()) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkGoal, 100);
        }
      };
      checkGoal();
    });

    // Verify we can still see the face after movement
    if (canSeeFace(bot, refBlock, faceVec)) {
      return {
        success: true,
        position: bot.entity.position.clone(),
        reason: "Moved to optimal position"
      };
    } else {
      return {
        success: false,
        position: bot.entity.position.clone(),
        reason: "Lost line of sight after movement"
      };
    }
  } catch (error) {
    return {
      success: false,
      position: bot.entity.position.clone(),
      reason: `Pathfinding error: ${error.message}`
    };
  }
}

/**
 * Prepare the bot for block placement with natural-looking behavior
 * Looks at the target face, validates reach and sight line
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Block} refBlock - Reference block to place on
 * @param {Vec3} faceVec - Face vector
 * @param {number} delayMs - Delay after looking (default: 250ms)
 * @returns {Promise<Object>} {ready: boolean, reason: string}
 */
async function prepareForPlacement(bot, refBlock, faceVec, delayMs = 500) {
  // Calculate face center point
  const faceCenter = refBlock.position.offset(
    0.5 + faceVec.x * 0.5,
    0.5 + faceVec.y * 0.5,
    0.5 + faceVec.z * 0.5
  );

  // Debug: Log camera at start
  console.log(`[${bot.username}] 📷 [PREP-START] yaw=${(bot.entity.yaw * 180 / Math.PI).toFixed(1)}°, pitch=${(bot.entity.pitch * 180 / Math.PI).toFixed(1)}°`);

  // Disable pathfinder auto-look temporarily to prevent interference
  const pathfinderEnableLook = bot.pathfinder ? bot.pathfinder.enableLook : null;
  if (bot.pathfinder) {
    bot.pathfinder.enableLook = false;
  }

  try {
    // Slowly turn to face the target (force=false for smooth turn)
    try {
      await bot.lookAt(faceCenter, false);
    } catch (lookError) {
      // If smooth look fails, try forced look
      try {
        await bot.lookAt(faceCenter, false);
      } catch (forcedLookError) {
        return {
          ready: false,
          reason: `Cannot look at target: ${forcedLookError.message}`
        };
      }
    }

    // Debug: Log camera after lookAt
    console.log(`[${bot.username}] 📷 [PREP-AFTER-LOOK] yaw=${(bot.entity.yaw * 180 / Math.PI).toFixed(1)}°, pitch=${(bot.entity.pitch * 180 / Math.PI).toFixed(1)}°`);

    // Natural pause after looking (makes movement more human-like)
    if (delayMs > 0) {
      await new Promise((res) => setTimeout(res, delayMs));
    }

    // Debug: Log camera after delay
    console.log(`[${bot.username}] 📷 [PREP-AFTER-DELAY] yaw=${(bot.entity.yaw * 180 / Math.PI).toFixed(1)}°, pitch=${(bot.entity.pitch * 180 / Math.PI).toFixed(1)}°`);

    // Verify bot is still in reach
    const maxReach = bot.game.gameMode === 1 ? 6 : 4.5;
    if (!inReach(bot, refBlock.position, maxReach)) {
      return {
        ready: false,
        reason: "Target out of reach after looking"
      };
    }

    // Verify sight line is still clear
    if (!canSeeFace(bot, refBlock, faceVec)) {
      return {
        ready: false,
        reason: "Lost line of sight after looking"
      };
    }

    return {
      ready: true,
      reason: "Ready for placement"
    };
  } finally {
    // Restore pathfinder enableLook setting
    if (bot.pathfinder && pathfinderEnableLook !== null) {
      bot.pathfinder.enableLook = pathfinderEnableLook;
    }
  }
}

/**
 * Ensure an item is equipped in hand
 * @param {Bot} bot - Mineflayer bot instance
 * @param {string} itemName - Name of item to equip
 * @param {Object} args - Configuration arguments with rcon settings (optional)
 * @returns {Promise<number>} Item ID
 */
async function ensureItemInHand(bot, itemName, args = null) {
  const mcData = require("minecraft-data")(bot.version);
  const target = mcData.itemsByName[itemName];
  if (!target) throw new Error(`Unknown item: ${itemName}`);
  const id = target.id;

  // Check if already in inventory
  let item = bot.inventory.items().find((i) => i.type === id);

  // If not found, try to get it
  if (!item) {
    if (bot.game.gameMode === 1) {
      // Creative mode: spawn it directly
      const Item = require("prismarine-item")(bot.version);
      await bot.creative.setInventorySlot(36, new Item(id, 64));
      item = bot.inventory.slots[36];
    } else if (args && args.rcon_host) {
      // Survival mode: use RCON to give items
      console.log(`[${bot.username}] 📦 Giving ${itemName} via RCON...`);
      const { Rcon } = require("rcon-client");
      const rcon = await Rcon.connect({
        host: args.rcon_host,
        port: args.rcon_port,
        password: args.rcon_password,
      });
      await rcon.send(`give ${bot.username} ${itemName} 64`);
      await rcon.end();

      // Wait for item to arrive
      await new Promise((resolve, reject) => {
        const maxAttempts = 50;
        let attempts = 0;
        const checkItem = () => {
          attempts += 1;
          const found = bot.inventory.items().find((i) => i.type === id);
          if (found) {
            item = found;
            resolve();
            return;
          }
          if (attempts >= maxAttempts) {
            reject(
              new Error(
                `Item ${itemName} not received after ${maxAttempts} attempts`
              )
            );
            return;
          }
          setTimeout(checkItem, 200);
        };
        checkItem();
      });
    }
  }

  if (!item) throw new Error(`Item ${itemName} not in inventory`);

  await bot.equip(id, "hand");
  return id;
}

/**
 * Move close enough to place if needed
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Block} refBlock - Reference block to click
 * @param {Vec3} faceVec - Face vector
 * @param {number} maxTries - Maximum attempts
 * @returns {Promise<boolean>} True if in reach
 */
async function ensureReachAndSight(bot, refBlock, faceVec, maxTries = 3) {
  // NOTE: Camera aiming is already done by prepareForPlacement()
  // We only need to verify reach, not re-aim the camera
  
  for (let i = 0; i < maxTries; i++) {
    const maxReach = bot.game.gameMode === 1 ? 6 : 4.5;
    if (inReach(bot, refBlock.position, maxReach)) return true;

    // Nudge closer using pathfinder if available
    if (bot.pathfinder) {
      const { GoalNear } = require("mineflayer-pathfinder").goals;
      const p = refBlock.position;
      bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 2), true);
      await new Promise((res) => setTimeout(res, 350));
    } else {
      // Simple wait if no pathfinder
      await new Promise((res) => setTimeout(res, 200));
    }
  }

  return inReach(bot, refBlock.position, 5);
}

/**
 * Robust place at exact target (x,y,z) with itemName
 * Auto-finds a reference face, ensures reach/LOS, sneaks if needed, retries
 * Enhanced with pre-placement ritual for human-like behavior
 * Phase 7: Added fallback mechanisms, validation, and graceful error handling
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPos - Target position to place block
 * @param {string} itemName - Name of block/item to place
 * @param {Object} options - Options for placement {useSneak, tries, args, prePlacementDelay, maxRetries}
 * @returns {Promise<boolean>} True if successfully placed
 */
async function placeAt(
  bot,
  targetPos,
  itemName,
  { useSneak = false, tries = 5, args = null, prePlacementDelay = 150, maxRetries = 10 } = {}
) {
  // Phase 7: Validation - Check if bot is in valid state
  if (!bot || !bot.entity) {
    console.error(`[${bot?.username || 'Unknown'}] ❌ Bot not in valid state`);
    return false;
  }

  // Preconditions: check if already placed
  const airNow = isAirLike(bot.blockAt(targetPos));
  if (!airNow) return true; // already placed

  // Phase 7: Validate item availability
  try {
    await ensureItemInHand(bot, itemName, args);
  } catch (error) {
    console.error(`[${bot.username}] ❌ Cannot equip ${itemName}: ${error.message}`);
    return false;
  }

  // Phase 7: Get all viable face candidates for fallback support
  const allCandidates = findBestPlaceReference(bot, targetPos, { returnAll: true, minScore: 20 });
  if (!allCandidates || allCandidates.length === 0) {
    console.error(`[${bot.username}] ❌ No valid faces found for ${targetPos}`);
    return false;
  }

  console.log(`[${bot.username}] 📋 Found ${allCandidates.length} viable face(s) for placement`);

  const sneakWas = bot.getControlState("sneak");
  if (useSneak) bot.setControlState("sneak", true);

  try {
    let candidateIndex = 0;
    let totalAttempts = 0;
    const maxTotalAttempts = Math.min(maxRetries, allCandidates.length * tries);

    // Phase 7: Try each candidate face with retries
    while (candidateIndex < allCandidates.length && totalAttempts < maxTotalAttempts) {
      const candidate = allCandidates[candidateIndex];
      const { refBlock, faceVec, score } = candidate;
      
      console.log(
        `[${bot.username}] 🎯 Trying face ${candidateIndex + 1}/${allCandidates.length} ` +
        `(score: ${score.toFixed(1)}, attempt: ${totalAttempts + 1}/${maxTotalAttempts})`
      );

      for (let i = 0; i < tries && totalAttempts < maxTotalAttempts; i++) {
        totalAttempts++;
        
        // Pre-placement ritual: look at target and validate
        const preparation = await prepareForPlacement(bot, refBlock, faceVec, prePlacementDelay);
        
        if (!preparation.ready) {
          console.log(`[${bot.username}] ⚠️ Not ready: ${preparation.reason}`);
          break; // Move to next candidate
        }

        // Verify reach one more time before placing
        const ok = await ensureReachAndSight(bot, refBlock, faceVec, 1);
        if (!ok) {
          console.log(`[${bot.username}] ⚠️ Lost reach/sight`);
          break; // Move to next candidate
        }

        // Attempt placement
        try {
          // Debug: Log camera before placement
          console.log(`[${bot.username}] 📷 [BEFORE-PLACE] yaw=${(bot.entity.yaw * 180 / Math.PI).toFixed(1)}°, pitch=${(bot.entity.pitch * 180 / Math.PI).toFixed(1)}°`);
          
          // Temporarily disable lookAt to prevent placeBlock's internal lookAt from snapping camera
          const originalLookAt = bot.lookAt;
          bot.lookAt = async () => {}; // No-op
          
          try {
            await bot.placeBlock(refBlock, faceVec);
          } finally {
            // Restore original lookAt
            bot.lookAt = originalLookAt;
          }
          
          // Debug: Log camera immediately after placement
          console.log(`[${bot.username}] 📷 [AFTER-PLACE] yaw=${(bot.entity.yaw * 180 / Math.PI).toFixed(1)}°, pitch=${(bot.entity.pitch * 180 / Math.PI).toFixed(1)}°`);
          
          // Wait 500ms after placement without moving camera
          await new Promise((res) => setTimeout(res, 500));
          
          // Debug: Log camera after wait
          console.log(`[${bot.username}] 📷 [AFTER-WAIT] yaw=${(bot.entity.yaw * 180 / Math.PI).toFixed(1)}°, pitch=${(bot.entity.pitch * 180 / Math.PI).toFixed(1)}°`);
        } catch (e) {
          console.log(`[${bot.username}] ⚠️ Placement failed: ${e.message}`);
          await new Promise((res) => setTimeout(res, 120));
          continue; // Retry same face
        }

        // Confirm world state - verify block was actually placed
        await new Promise((res) => setTimeout(res, 50)); // Brief wait for world update
        const placed = !isAirLike(bot.blockAt(targetPos));
        
        if (placed) {
          const placedBlock = bot.blockAt(targetPos);
          console.log(
            `[${bot.username}] ✅ Successfully placed ${placedBlock?.name || itemName} at ${targetPos} ` +
            `(face ${candidateIndex + 1}, attempt ${totalAttempts})`
          );
          // Debug: Log camera when returning success
          console.log(`[${bot.username}] 📷 [RETURN-SUCCESS] yaw=${(bot.entity.yaw * 180 / Math.PI).toFixed(1)}°, pitch=${(bot.entity.pitch * 180 / Math.PI).toFixed(1)}°`);
          return true;
        }

        console.log(`[${bot.username}] ⚠️ Block not confirmed, retrying...`);
        await new Promise((res) => setTimeout(res, 80));
      }

      // Move to next candidate face
      candidateIndex++;
    }

    // Phase 7: All fallback attempts exhausted
    console.error(
      `[${bot.username}] ❌ Failed to place block at ${targetPos} after ${totalAttempts} attempts ` +
      `across ${candidateIndex} face(s)`
    );
    return false;
  } catch (error) {
    // Phase 7: Graceful error handling
    console.error(`[${bot.username}] ❌ Unexpected error in placeAt: ${error.message}`);
    return false;
  } finally {
    if (useSneak && !sneakWas) bot.setControlState("sneak", false);
  }
}

/**
 * Place multiple blocks in a deterministic order (bottom-up, near-to-far)
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Array<Vec3>} positions - Array of positions to place blocks
 * @param {string} itemName - Name of block/item to place
 * @param {Object} options - Options for placement {useSneak, tries, args, delayMs, useBuildOrder, useSmartPositioning}
 * @returns {Promise<Object>} {success: number, failed: number, skipped: number}
 */
async function placeMultiple(bot, positions, itemName, options = {}) {
  const { 
    delayMs = 300,
    useBuildOrder = true,
    useSmartPositioning = false, // Disabled by default for performance
  } = options;
  
  console.log(`[${bot.username}] 🏗️ Starting to place ${positions.length} blocks...`);
  
  // Use intelligent build order if enabled
  const sorted = useBuildOrder 
    ? sortByBuildability(positions, bot)
    : positions.slice().sort((a, b) => {
        // Fallback: simple bottom-up, near-to-far sorting
        if (a.y !== b.y) return a.y - b.y;
        const distA = bot.entity.position.distanceTo(a);
        const distB = bot.entity.position.distanceTo(b);
        if (Math.abs(distA - distB) > 0.5) return distA - distB;
        return a.x - b.x;
      });

  let success = 0;
  let failed = 0;
  let skipped = 0;
  const placedSet = new Set(); // Track successfully placed blocks

  console.log(`[${bot.username}] 📋 Build order: ${useBuildOrder ? 'OPTIMIZED' : 'SIMPLE'}`);
  console.log(`[${bot.username}] 🎯 Smart positioning: ${useSmartPositioning ? 'ENABLED' : 'DISABLED'}`);

  for (let i = 0; i < sorted.length; i++) {
    const pos = sorted[i];
    const progress = `[${i + 1}/${sorted.length}]`;
    
    try {
      // Check if block already exists (might have been placed by another bot)
      const existingBlock = bot.blockAt(pos);
      if (existingBlock && existingBlock.boundingBox === "block") {
        console.log(`[${bot.username}] ${progress} ⏭️ Block already exists at ${pos}`);
        skipped++;
        placedSet.add(`${pos.x},${pos.y},${pos.z}`);
        continue;
      }

      // Optional: Smart positioning (move to optimal location before placing)
      if (useSmartPositioning) {
        const plan = findBestPlaceReference(bot, pos);
        if (plan) {
          const moveResult = await moveToPlacementPosition(
            bot, 
            plan.refBlock, 
            plan.faceVec, 
            pos,
            3000 // 3 second timeout
          );
          
          if (!moveResult.success) {
            console.log(
              `[${bot.username}] ${progress} ⚠️ Could not reach optimal position: ${moveResult.reason}`
            );
            // Continue anyway, placeAt will handle it
          }
        }
      }

      // Attempt to place the block
      const placed = await placeAt(bot, pos, itemName, options);
      
      if (placed) {
        success++;
        placedSet.add(`${pos.x},${pos.y},${pos.z}`);
        // placeAt already logs success
      } else {
        failed++;
        // placeAt already logs failure
      }
    } catch (error) {
      failed++;
      console.log(
        `[${bot.username}] ${progress} ❌ Error placing at ${pos}: ${error.message}`
      );
    }
    
    // Add delay between block placements for more human-like building
    if (delayMs > 0 && i < sorted.length - 1) {
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }

  // Summary
  console.log(`[${bot.username}] 🏁 Placement complete!`);
  console.log(`[${bot.username}]    ✅ Success: ${success}/${positions.length}`);
  console.log(`[${bot.username}]    ❌ Failed: ${failed}/${positions.length}`);
  console.log(`[${bot.username}]    ⏭️ Skipped: ${skipped}/${positions.length}`);

  return { success, failed, skipped };
}

/**
 * Fast block placement - no checks, just place immediately
 * Used during pillar jumping where we know the context
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Block} referenceBlock - Block to place on top of
 * @returns {Promise<boolean>} True if placement was attempted
 */
async function fastPlaceBlock(bot, referenceBlock) {
  try {
    const faceVector = new Vec3(0, 1, 0); // Top face
    await bot.placeBlock(referenceBlock, faceVector);
    return true;
  } catch (error) {
    // Don't log here - too noisy during spam attempts
    return false;
  }
}

/**
 * Build a tower by jumping and placing blocks directly underneath
 * Uses the classic Minecraft "pillar jumping" technique with configurable retry logic
 * @param {Bot} bot - Mineflayer bot instance
 * @param {number} towerHeight - Height of tower to build
 * @param {Object} args - Configuration arguments (for RCON if needed)
 * @param {Object} options - Optional configuration
 * @param {string} options.blockType - Type of block to place (default: 'oak_planks')
 * @param {boolean} options.enableRetry - Enable retry logic for failed placements (default: true)
 * @param {boolean} options.breakOnFailure - Break immediately on failure (default: false)
 * @param {number} options.maxPlaceAttempts - Max attempts to place each block (default: 10)
 * @param {number} options.settleDelayMs - Delay to settle after placing (default: 200)
 * @param {number} options.jumpDurationMs - How long to hold jump (default: 50)
 * @param {number} options.placeRetryDelayMs - Delay between place attempts (default: 20)
 * @returns {Promise<Object>} Build statistics {success, failed, heightGained}
 */
async function buildTowerUnderneath(bot, towerHeight, args, options = {}) {
  const {
    blockType = "oak_planks",
    enableRetry = true,
    breakOnFailure = false,
    maxPlaceAttempts = 10,
    settleDelayMs = 200,
    jumpDurationMs = 50,
    placeRetryDelayMs = 20,
  } = options;

  console.log(
    `[${bot.username}] 🗼 Starting tower build: ${towerHeight} blocks`
  );

  let success = 0;
  let failed = 0;

  // Ensure we have the blocks
  await ensureItemInHand(bot, blockType, args);

  // Get bot's starting position
  const startPos = bot.entity.position.clone();
  const startY = Math.floor(startPos.y);
  console.log(
    `[${bot.username}] 📍 Starting position: X=${startPos.x.toFixed(
      2
    )}, Y=${startPos.y.toFixed(2)}, Z=${startPos.z.toFixed(2)}`
  );

  // Look down ONCE before starting
  console.log(`[${bot.username}] 👇 Looking down once...`);
  await bot.look(bot.entity.yaw, -1.45, true);
  await new Promise((res) => setTimeout(res, 50));

  for (let i = 0; i < towerHeight; i++) {
    console.log(`[${bot.username}] ═══════════════════════════════════════`);
    console.log(`[${bot.username}] 🧱 Building block ${i + 1}/${towerHeight}`);

    // Get reference block (the block we're standing on)
    const currentPos = bot.entity.position.clone();
    const groundPos = new Vec3(
      Math.floor(currentPos.x),
      Math.floor(currentPos.y) - 1,
      Math.floor(currentPos.z)
    );
    const groundBlock = bot.blockAt(groundPos);

    if (!groundBlock || groundBlock.name === "air") {
      console.log(
        `[${bot.username}] ❌ No ground block at ${groundPos}`
      );
      failed++;
      if (breakOnFailure) break;
      continue;
    }

    console.log(
      `[${bot.username}] 📦 Reference block: ${groundBlock.name} at ${groundPos}`
    );

    // Target position (where the new block will be)
    const targetPos = groundPos.offset(0, 1, 0);

    // Jump and spam place attempts
    console.log(`[${bot.username}] 🦘 Jumping and spamming place...`);
    bot.setControlState("jump", true);

    // Spam place attempts immediately while jumping
    for (let attempt = 1; attempt <= maxPlaceAttempts; attempt++) {
      fastPlaceBlock(bot, groundBlock)
        .then(() =>
          console.log(`[${bot.username}] 🎯 Place fired on attempt ${attempt}`)
        )
        .catch(() => {});
      await new Promise((res) => setTimeout(res, placeRetryDelayMs));
    }
    await new Promise((res) => setTimeout(res, jumpDurationMs));
    bot.setControlState("jump", false);

    // Verify placement after jump completes
    await new Promise((res) => setTimeout(res, 50));
    const placedBlock = bot.blockAt(targetPos);
    if (placedBlock && placedBlock.name === blockType) {
      console.log(
        `[${bot.username}] ✅ Block ${i + 1} placed successfully: ${
          placedBlock.name
        } at ${targetPos}`
      );
      success++;
    } else {
      console.log(
        `[${bot.username}] ❌ Block ${i + 1} placement failed at ${targetPos}`
      );
      failed++;

      if (breakOnFailure) {
        console.log(`[${bot.username}] 🛑 Breaking on failure`);
        break;
      }

      if (!enableRetry) {
        console.log(`[${bot.username}] ⚠️ Continuing without retry...`);
        continue;
      }

      console.log(`[${bot.username}] ⚠️ Continuing despite failure...`);
    }

    // Settle on the new block
    console.log(`[${bot.username}] ⏳ Settling...`);
    await new Promise((res) => setTimeout(res, settleDelayMs + 100));

    // Verify height
    const newPos = bot.entity.position.clone();
    const newY = Math.floor(newPos.y);
    const heightGained = newY - startY;
    console.log(
      `[${bot.username}] 📏 New Y: ${newY} (gained ${heightGained} blocks, target: ${i + 1})`
    );

    // If we haven't gained height and retry is enabled, retry this block
    if (enableRetry && heightGained < i + 1) {
      console.log(
        `[${bot.username}] ⚠️ Height mismatch! Expected ${
          i + 1
        }, got ${heightGained}`
      );
      console.log(`[${bot.username}] 🔄 Retrying block ${i + 1}...`);

      // Get reference block again
      const retryCurrentPos = bot.entity.position.clone();
      const retryGroundPos = new Vec3(
        Math.floor(retryCurrentPos.x),
        Math.floor(retryCurrentPos.y) - 1,
        Math.floor(retryCurrentPos.z)
      );
      const retryGroundBlock = bot.blockAt(retryGroundPos);

      if (!retryGroundBlock || retryGroundBlock.name === "air") {
        console.log(
          `[${bot.username}] ❌ No ground block at ${retryGroundPos}`
        );
        failed++;
        if (breakOnFailure) break;
        continue;
      }

      // Look down again
      await bot.look(bot.entity.yaw, -1.45, true);
      await new Promise((res) => setTimeout(res, 50));

      // Try one more time
      bot.setControlState("jump", true);
      for (let retry = 1; retry <= maxPlaceAttempts; retry++) {
        fastPlaceBlock(bot, retryGroundBlock).catch(() => {});
        await new Promise((res) => setTimeout(res, placeRetryDelayMs));
      }
      await new Promise((res) => setTimeout(res, jumpDurationMs));
      bot.setControlState("jump", false);
      await new Promise((res) => setTimeout(res, settleDelayMs + 100));

      // Check again
      const retryPos = bot.entity.position.clone();
      const retryY = Math.floor(retryPos.y);
      const retryHeight = retryY - startY;
      console.log(
        `[${bot.username}] 📏 After retry - Y: ${retryY}, height: ${retryHeight}`
      );

      if (retryHeight < i + 1) {
        console.log(
          `[${bot.username}] ❌ Retry failed - ${
            breakOnFailure ? "aborting" : "continuing"
          }`
        );
        failed++;
        if (breakOnFailure) break;
      }
    }
  }

  const finalPos = bot.entity.position.clone();
  const finalY = Math.floor(finalPos.y);
  const totalHeight = finalY - startY;

  console.log(`[${bot.username}] ═══════════════════════════════════════`);
  console.log(`[${bot.username}] 🏁 Tower build complete!`);
  console.log(`[${bot.username}]    Blocks placed: ${success}/${towerHeight}`);
  console.log(`[${bot.username}]    Failed: ${failed}/${towerHeight}`);
  console.log(`[${bot.username}]    Height gained: ${totalHeight} blocks`);
  console.log(
    `[${bot.username}]    Final position: X=${finalPos.x.toFixed(
      2
    )}, Y=${finalPos.y.toFixed(2)}, Z=${finalPos.z.toFixed(2)}`
  );

  return { success, failed, heightGained: totalHeight };
}

/**
 * Check if a target position has adjacent support for placement
 * A block can only be placed if at least one adjacent block exists
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPos - Position to check for support
 * @param {Set<string>} placedBlocks - Set of already placed block positions (as "x,y,z" strings)
 * @returns {boolean} True if position has at least one adjacent solid block
 */
function hasAdjacentSupport(bot, targetPos, placedBlocks = new Set()) {
  // Special case: Ground level (Y <= 0) always has support from bedrock/ground
  if (targetPos.y <= 0) {
    return true;
  }

  // Check all 6 adjacent positions for solid blocks
  for (const face of CARDINALS) {
    const adjacentPos = targetPos.plus(face);
    const adjacentBlock = bot.blockAt(adjacentPos);
    
    // Check if there's a solid block in the world
    if (adjacentBlock && adjacentBlock.boundingBox === "block") {
      return true;
    }
    
    // Check if we've already placed a block at this position
    const posKey = `${adjacentPos.x},${adjacentPos.y},${adjacentPos.z}`;
    if (placedBlocks.has(posKey)) {
      return true;
    }
  }

  return false;
}

/**
 * Sort block positions by buildability
 * Ensures blocks are placed in a valid order with proper support
 * @param {Array<Vec3>} positions - Array of positions to sort
 * @param {Bot} bot - Mineflayer bot instance
 * @returns {Array<Vec3>} Sorted array of positions (buildable order)
 */
function sortByBuildability(positions, bot) {
  if (positions.length === 0) return [];

  const sorted = [];
  const remaining = positions.slice(); // Copy array
  const placedSet = new Set(); // Track placed positions
  let maxIterations = positions.length * 2; // Prevent infinite loops
  let iterations = 0;

  // Group positions by Y level for initial sorting
  remaining.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y; // Bottom to top
    // Within same Y level, sort by distance to bot
    const distA = bot.entity.position.distanceTo(a);
    const distB = bot.entity.position.distanceTo(b);
    return distA - distB;
  });

  // Build in order, ensuring each block has support
  while (remaining.length > 0 && iterations < maxIterations) {
    iterations++;
    let placedThisIteration = false;

    for (let i = remaining.length - 1; i >= 0; i--) {
      const pos = remaining[i];
      
      // Check if this position has adjacent support
      if (hasAdjacentSupport(bot, pos, placedSet)) {
        // This block can be placed now
        sorted.push(pos);
        placedSet.add(`${pos.x},${pos.y},${pos.z}`);
        remaining.splice(i, 1);
        placedThisIteration = true;
      }
    }

    // If we couldn't place any blocks this iteration, we have a problem
    if (!placedThisIteration && remaining.length > 0) {
      console.warn(
        `[sortByBuildability] Warning: ${remaining.length} blocks have no support. ` +
        `Adding them anyway to prevent deadlock.`
      );
      // Add remaining blocks in Y-order as fallback
      remaining.sort((a, b) => a.y - b.y);
      sorted.push(...remaining);
      break;
    }
  }

  return sorted;
}

module.exports = {
  placeAt,
  placeMultiple,
  isAirLike,
  inReach,
  ensureItemInHand,
  findPlaceReference,
  ensureReachAndSight,
  fastPlaceBlock,
  buildTowerUnderneath,
  CARDINALS,
  scoreFace,
  findBestPlaceReference,
  raycastToPosition,
  isBlockObstructed,
  canSeeFace,
  isPositionSafe,
  calculateOptimalPosition,
  moveToPlacementPosition,
  hasAdjacentSupport,
  sortByBuildability,
  prepareForPlacement,
};
