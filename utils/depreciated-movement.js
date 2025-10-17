const Vec3 = require("vec3").Vec3;
const { sleep, rand, choice } = require('./helpers');
const {
  MIN_WALK_DISTANCE,
  MAX_WALK_DISTANCE,
  JUMP_PROBABILITY,
  MIN_JUMP_DURATION_SEC,
  MAX_JUMP_DURATION_SEC,
  MIN_RUN_ACTIONS,
  MAX_RUN_ACTIONS,
  MIN_SLEEP_BETWEEN_ACTIONS_SEC,
  MAX_SLEEP_BETWEEN_ACTIONS_SEC,
  LANDABLE_BLOCKS
} = require('./constants');

/**
 * Stop all bot movement controls
 * @param {Bot} bot - Mineflayer bot instance
 */
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

/**
 * Generate random position within range around bot
 * @param {Bot} bot - Mineflayer bot instance
 * @param {number} range - Range to search within
 * @returns {Vec3} Random valid position
 */
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
    
    const landable = new Set();
    LANDABLE_BLOCKS.forEach(blockName => {
      if (bot.registry.blocksByName[blockName]) {
        landable.add(bot.registry.blocksByName[blockName].id);
      }
    });
    
    if (pos !== null) {
      const block = bot.blockAt(pos);
      const blockunder = bot.blockAt(pos.offset(0, -1, 0));
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

/**
 * Smoothly rotate bot camera to look at target position
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPosition - Position to look at
 * @param {number} degreesPerSecond - Rotation speed
 */
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

  console.log(
    `[${bot.username}] Looking at (${targetPosition.x.toFixed(
      2
    )}, ${targetPosition.y.toFixed(2)}, ${targetPosition.z.toFixed(
      2
    )}) at ${degreesPerSecond}°/s over ${(totalTimeMs / 1000).toFixed(2)}s`
  );

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
 * Walk in random direction for specified distance and return to start
 * @param {Bot} bot - Mineflayer bot instance
 * @param {number} distance - Distance to walk
 * @param {Object} args - Configuration arguments with walk_timeout
 */
async function walk(bot, distance, args) {
  const startPos = bot.entity.position.clone();
  const dir = choice(["forward", "back", "left", "right"]);
  const walkTimeoutMs = args.walk_timeout * 1000; // Convert to milliseconds

  // Define the reverse direction
  const reverseDir = {
    forward: "back",
    back: "forward",
    left: "right",
    right: "left",
  };

  console.log(
    `[${
      bot.username
    }] Walking ${dir} for ${distance} blocks from position (${startPos.x.toFixed(
      2
    )}, ${startPos.y.toFixed(2)}, ${startPos.z.toFixed(2)}) with ${
      args.walk_timeout
    }s timeout`
  );

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

  // Now return to the starting position by walking in the reverse direction
  console.log(
    `[${bot.username}] Returning to starting position by walking ${reverseDir[dir]}`
  );

  bot.setControlState(reverseDir[dir], true);

  const returnStartTime = Date.now();
  try {
    // Walk back until we're close to the starting position
    while (bot.entity.position.distanceTo(startPos) > 1.0) {
      // Check for timeout
      if (Date.now() - returnStartTime > walkTimeoutMs) {
        console.log(
          `[${bot.username}] Walk timeout (${args.walk_timeout}s) reached while returning via ${reverseDir[dir]}`
        );
        break;
      }
      await sleep(50); // Check position every 50ms
    }
  } finally {
    bot.setControlState(reverseDir[dir], false);
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
}

/**
 * Execute multiple walk actions with random sleep intervals
 * @param {Bot} bot - Mineflayer bot instance
 * @param {number} actionCount - Number of actions to perform
 * @param {Object} args - Configuration arguments
 */
async function run(bot, actionCount, args) {
  const actions = [() => walk(bot, rand(MIN_WALK_DISTANCE, MAX_WALK_DISTANCE), args)];

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

module.exports = {
  stopAll,
  land_pos,
  random_pos,
  jump,
  lookAtSmooth,
  walk,
  run
};
