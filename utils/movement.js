const Vec3 = require("vec3").Vec3;

/**
 * Basic Movement Building Blocks for Mineflayer Bots
 * These functions provide consistent, deterministic movement primitives
 * that can be used across all episodes.
 */

// Import pathfinder components correctly according to official README
const {
  Movements,
  GoalNear,
  GoalNearXZ,
  GoalBlock,
  GoalFollow,
} = require("./bot-factory");

// ============================================================================
// BASIC CONTROL FUNCTIONS
// ============================================================================

/**
 * Stop all bot movement and actions
 * @param {Bot} bot - Mineflayer bot instance
 */
function stopAll(bot) {
  // Stop pathfinder if available
  if (bot.pathfinder && typeof bot.pathfinder.stop === "function") {
    bot.pathfinder.stop();
  }

  // Stop all manual controls
  for (const control of [
    "forward",
    "back",
    "left",
    "right",
    "jump",
    "sprint",
    "sneak",
  ]) {
    bot.setControlState(control, false);
  }
}

/**
 * Set multiple movement controls at once
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Object} controls - Object with control states {forward: true, sprint: true, etc.}
 */
function setControls(bot, controls) {
  for (const [control, state] of Object.entries(controls)) {
    bot.setControlState(control, state);
  }
}

/**
 * Enable sprint mode
 * @param {Bot} bot - Mineflayer bot instance
 */
function enableSprint(bot) {
  bot.setControlState("sprint", true);
}

/**
 * Disable sprint mode
 * @param {Bot} bot - Mineflayer bot instance
 */
function disableSprint(bot) {
  bot.setControlState("sprint", false);
}

// ============================================================================
// PATHFINDER SETUP AND CONFIGURATION
// ============================================================================

/**
 * Initialize pathfinder with optimal settings for bot movement
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Object} options - Pathfinder configuration options
 */
function initializePathfinder(bot, options = {}) {
  const movements = new Movements(bot);

  // Configure movement settings - enable all features by default
  movements.allowSprinting = options.allowSprinting !== false; // Default: true
  movements.allowParkour = options.allowParkour !== false; // Default: true
  movements.canDig = options.canDig !== false; // Default: true (allow digging)
  movements.canPlaceOn = options.canPlaceOn !== false; // Default: true (allow placing)
  movements.allowFreeMotion = options.allowFreeMotion || false; // Default: false
  movements.allowEntityDetection = options.allowEntityDetection !== false; // Default: true

  // Set pathfinder movements
  bot.pathfinder.setMovements(movements);

  console.log(`[${bot.username}] Pathfinder initialized with settings:`, {
    sprint: movements.allowSprinting,
    parkour: movements.allowParkour,
    dig: movements.canDig,
    placeBlocks: movements.canPlaceOn,
    entityDetection: movements.allowEntityDetection,
  });

  return movements;
}

/**
 * Stop pathfinder and clear current goal
 * @param {Bot} bot - Mineflayer bot instance
 */
function stopPathfinder(bot) {
  if (bot.pathfinder) {
    bot.pathfinder.stop();
  }
}

// ============================================================================
// DIRECTIONAL MOVEMENT FUNCTIONS
// ============================================================================

/**
 * Move in a specific direction
 * @param {Bot} bot - Mineflayer bot instance
 * @param {string} direction - Direction to move ("forward", "back", "left", "right")
 * @param {boolean} sprint - Whether to sprint while moving
 */
function moveDirection(bot, direction, sprint = false) {
  stopAll(bot);
  bot.setControlState(direction, true);
  if (sprint) {
    bot.setControlState("sprint", true);
  }
}

/**
 * Move toward a target position using directional controls
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPosition - Target position to move toward
 * @param {boolean} sprint - Whether to sprint while moving
 * @param {number} threshold - Distance threshold to consider "reached" (default: 0.5)
 * @returns {string} The primary direction being moved
 */
function moveToward(bot, targetPosition, sprint = false, threshold = 0.5) {
  const currentPos = bot.entity.position;
  const dx = targetPosition.x - currentPos.x;
  const dz = targetPosition.z - currentPos.z;
  const distance = Math.sqrt(dx * dx + dz * dz);

  // If we're close enough, stop moving
  if (distance <= threshold) {
    stopAll(bot);
    return "stopped";
  }

  // Clear all movement first
  stopAll(bot);

  // Determine primary movement direction
  let primaryDirection;
  if (Math.abs(dz) > Math.abs(dx)) {
    // Primarily north/south movement
    if (dz < 0) {
      bot.setControlState("forward", true); // Move north (negative Z)
      primaryDirection = "forward";
    } else {
      bot.setControlState("back", true); // Move south (positive Z)
      primaryDirection = "back";
    }
  } else {
    // Primarily east/west movement
    if (dx > 0) {
      bot.setControlState("right", true); // Move east (positive X)
      primaryDirection = "right";
    } else {
      bot.setControlState("left", true); // Move west (negative X)
      primaryDirection = "left";
    }
  }

  // Enable sprinting if requested
  if (sprint) {
    bot.setControlState("sprint", true);
  }

  return primaryDirection;
}

/**
 * Move away from a position (opposite direction)
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} avoidPosition - Position to move away from
 * @param {boolean} sprint - Whether to sprint while moving
 * @returns {string} The primary direction being moved
 */
function moveAway(bot, avoidPosition, sprint = false) {
  const currentPos = bot.entity.position;
  const dx = currentPos.x - avoidPosition.x; // Reversed for moving away
  const dz = currentPos.z - avoidPosition.z; // Reversed for moving away

  // Create a target position that's away from the avoid position
  const escapeTarget = new Vec3(
    currentPos.x + (dx > 0 ? 5 : -5), // Move 5 blocks in escape direction
    currentPos.y,
    currentPos.z + (dz > 0 ? 5 : -5)
  );

  return moveToward(bot, escapeTarget, sprint);
}

// ============================================================================
// CAMERA AND LOOKING FUNCTIONS
// ============================================================================

/**
 * Smoothly rotate bot camera to look at target position
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPosition - Position to look at
 * @param {number} degreesPerSecond - Rotation speed in degrees per second
 */
async function lookAtSmooth(bot, targetPosition, degreesPerSecond = 90) {
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

/**
 * Look at another bot by name
 * @param {Bot} bot - Mineflayer bot instance
 * @param {string} targetBotName - Name of the bot to look at
 * @param {number} degreesPerSecond - Rotation speed in degrees per second
 */
async function lookAtBot(bot, targetBotName, degreesPerSecond = 90) {
  const targetBot = bot.players[targetBotName];
  if (targetBot && targetBot.entity) {
    await lookAtSmooth(bot, targetBot.entity.position, degreesPerSecond);
  } else {
    console.log(
      `[${bot.username}] Cannot find bot ${targetBotName} to look at`
    );
  }
}

/**
 * Look in a specific direction (yaw only)
 * @param {Bot} bot - Mineflayer bot instance
 * @param {number} yawRadians - Yaw angle in radians
 * @param {number} pitchRadians - Pitch angle in radians (default: 0)
 */
function lookDirection(bot, yawRadians, pitchRadians = 0) {
  bot.look(yawRadians, pitchRadians, true);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Find suitable landing position at given coordinates
 * @param {Bot} bot - Mineflayer bot instance
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {Vec3|null} Landing position or null if not found
 */
function land_pos(bot, x, z) {
  const pos = new Vec3(x, 64, z);
  let block = bot.blockAt(pos);

  if (block === null) {
    // unloaded chunk
    return null;
  }
  
  // Define unsafe blocks (water, lava, air, leaves, etc.)
  const unsafeBlocks = new Set([
    bot.registry.blocksByName.air?.id,
    bot.registry.blocksByName.water?.id,
    bot.registry.blocksByName.lava?.id,
    bot.registry.blocksByName.flowing_water?.id,
    bot.registry.blocksByName.flowing_lava?.id,
    bot.registry.blocksByName.cave_air?.id,
    bot.registry.blocksByName.void_air?.id,
    // Tree leaves - all variants
    bot.registry.blocksByName.oak_leaves?.id,
    bot.registry.blocksByName.spruce_leaves?.id,
    bot.registry.blocksByName.birch_leaves?.id,
    bot.registry.blocksByName.jungle_leaves?.id,
    bot.registry.blocksByName.acacia_leaves?.id,
    bot.registry.blocksByName.dark_oak_leaves?.id,
    bot.registry.blocksByName.mangrove_leaves?.id,
    bot.registry.blocksByName.cherry_leaves?.id,
    bot.registry.blocksByName.azalea_leaves?.id,
    bot.registry.blocksByName.flowering_azalea_leaves?.id,
  ].filter(id => id !== undefined));
  
  let dy = 0;
  
  // If starting position is inside a block, move up to find air
  while (block && !unsafeBlocks.has(block.type) && block.type !== bot.registry.blocksByName.air.id) {
    dy++;
    if (dy > 100) return null; // Safety limit
    block = bot.blockAt(pos.offset(0, dy, 0));
    if (block && block.type === bot.registry.blocksByName.air.id) {
      // Found air above, check if block below is safe
      const blockBelow = bot.blockAt(pos.offset(0, dy - 1, 0));
      if (blockBelow && !unsafeBlocks.has(blockBelow.type)) {
        return pos.offset(0, dy - 1, 0);
      }
    }
  }
  
  // Move down to find solid ground
  dy = 0;
  block = bot.blockAt(pos);
  while (block && (unsafeBlocks.has(block.type) || block.type === bot.registry.blocksByName.air.id)) {
    dy--;
    if (dy < -100) return null; // Safety limit (don't go below Y=-36 in 1.20.4)
    block = bot.blockAt(pos.offset(0, dy, 0));
    if (block && !unsafeBlocks.has(block.type) && block.type !== bot.registry.blocksByName.air.id) {
      // Found solid ground, check if there's air above it for the bot to stand
      const blockAbove = bot.blockAt(pos.offset(0, dy + 1, 0));
      const blockAbove2 = bot.blockAt(pos.offset(0, dy + 2, 0));
      const blockAbove3 = bot.blockAt(pos.offset(0, dy + 3, 0));
      
      // Ensure 3 blocks of air above for bot to stand (NOT water, lava, or leaves)
      if (blockAbove && blockAbove2 && blockAbove3 &&
          blockAbove.type === bot.registry.blocksByName.air.id &&
          blockAbove2.type === bot.registry.blocksByName.air.id &&
          blockAbove3.type === bot.registry.blocksByName.air.id) {
        return pos.offset(0, dy, 0);
      }
    }
  }
  
  return null;
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after the specified time
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate distance between two positions
 * @param {Vec3} pos1 - First position
 * @param {Vec3} pos2 - Second position
 * @returns {number} Distance between positions
 */
function distanceTo(pos1, pos2) {
  const dx = pos2.x - pos1.x;
  const dy = pos2.y - pos1.y;
  const dz = pos2.z - pos1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate 2D horizontal distance between two positions (ignoring Y)
 * @param {Vec3} pos1 - First position
 * @param {Vec3} pos2 - Second position
 * @returns {number} Horizontal distance between positions
 */
function horizontalDistanceTo(pos1, pos2) {
  const dx = pos2.x - pos1.x;
  const dz = pos2.z - pos1.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Get the direction vector from one position to another
 * @param {Vec3} fromPos - Starting position
 * @param {Vec3} toPos - Target position
 * @returns {Object} Normalized direction vector {x, z, distance}
 */
function getDirectionTo(fromPos, toPos) {
  const dx = toPos.x - fromPos.x;
  const dz = toPos.z - fromPos.z;
  const distance = Math.sqrt(dx * dx + dz * dz);

  if (distance === 0) {
    return { x: 0, z: 0, distance: 0 };
  }

  return {
    x: dx / distance,
    z: dz / distance,
    distance: distance,
  };
}

/**
 * Check if bot is close to a target position
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPosition - Target position to check
 * @param {number} threshold - Distance threshold (default: 1.0)
 * @returns {boolean} True if bot is within threshold distance
 */
function isNearPosition(bot, targetPosition, threshold = 1.0) {
  return horizontalDistanceTo(bot.entity.position, targetPosition) <= threshold;
}

/**
 * Check if bot is close to another bot
 * @param {Bot} bot - Mineflayer bot instance
 * @param {string} targetBotName - Name of the target bot
 * @param {number} threshold - Distance threshold (default: 1.0)
 * @returns {boolean} True if bots are within threshold distance
 */
function isNearBot(bot, targetBotName, threshold = 1.0) {
  const targetBot = bot.players[targetBotName];
  if (targetBot && targetBot.entity) {
    return (
      horizontalDistanceTo(bot.entity.position, targetBot.entity.position) <=
      threshold
    );
  }
  return false;
}

/**
 * Make bot jump for specified duration
 * @param {Bot} bot - Mineflayer bot instance
 * @param {number} durationMs - Duration in milliseconds
 */
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

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Basic controls
  stopAll,
  setControls,
  enableSprint,
  disableSprint,

  // Pathfinder setup and configuration
  initializePathfinder,
  stopPathfinder,

  // Directional movement
  moveDirection,
  moveToward,
  moveAway,

  // Camera and looking
  lookAtSmooth,
  lookSmooth,
  lookAtBot,
  lookDirection,

  // Utilities
  sleep,
  distanceTo,
  horizontalDistanceTo,
  getDirectionTo,
  isNearPosition,
  isNearBot,
  land_pos,
  jump,
};
