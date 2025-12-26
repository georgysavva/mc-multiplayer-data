// structureNoPlaceEval.js - Debug variant of structure eval that does NOT place blocks
// This episode performs all the same movements, looking, and timing as structureEval,
// but skips the actual block placement. Useful for debugging movement/camera behavior.

const { Vec3 } = require("vec3");
const {
  initializePathfinder,
  stopPathfinder,
  gotoWithTimeout,
  lookAtSmooth,
  sneak,
} = require("../../utils/movement");
const { findPlaceReference, ensureItemInHand } = require("../../utils/building");
const { BaseEpisode } = require("../base-episode");
const { ensureBotHasEnough, unequipHand } = require("../../utils/items");
const { GoalNear } = require("mineflayer-pathfinder").goals;

// Import shared functions and constants from structureEval.js
const {
  generateWallPositions,
  generateTowerPositions,
  generatePlatformPositions,
  getStructureCenterForViewing,
  // Constants
  ALL_STRUCTURE_TYPES,
  BUILD_BLOCK_TYPES,
  EPISODE_MIN_TICKS,
  PLACEMENT_STANDOFF_BLOCKS,
  ADJACENT_GOAL_RADIUS,
  CARDINALS,
  // Timing functions
  getInitialEyeContactTicks,
  getBlockPlaceDelayTicks,
  getBuilderAdmireTicks,
  // Local helper functions
  isAirLikeLocal,
  inReachLocal,
  faceCenterOf,
  hasLineOfSightToFaceLocal,
  findVisibleReachablePlaceReferenceLocal,
} = require("./structureEval");

/**
 * NO-OP version of tryPlaceAtUsingLocal
 * Does everything EXCEPT actually placing the block:
 * - Equips item in hand
 * - Sneaks if needed
 * - Waits the same delays
 * - Always returns true (simulating successful placement)
 */
async function tryPlaceAtNoOp(bot, targetPos, itemName, refBlock, faceVec, options = {}) {
  const { useSneak = true, tries = 2, args = null } = options;
  
  // Skip if already a block there (same check as original)
  if (!isAirLikeLocal(bot.blockAt(targetPos))) return true;
  
  await ensureItemInHand(bot, itemName, args);
  const sneakWas = bot.getControlState("sneak");
  if (useSneak) bot.setControlState("sneak", true);
  
  try {
    for (let i = 0; i < tries; i++) {
      if (!inReachLocal(bot, refBlock.position)) return false;
      
      // NO-OP: Skip bot.placeBlock() - just wait the same amount of time
      console.log(`[${bot.username}] 🔇 NO-PLACE: Would place block at ${targetPos} (attempt ${i + 1}/${tries})`);
      await bot.waitForTicks(4); // Same delay as original on retry
      
      // Simulate successful placement after first attempt
      return true;
    }
    return true; // Always return success in no-op mode
  } finally {
    if (useSneak && !sneakWas) bot.setControlState("sneak", false);
  }
}

/**
 * NO-OP version of placeMultipleWithDelay
 * Performs all the same movement and looking behavior, but skips actual block placement
 */
async function placeMultipleWithDelayNoPlace(bot, positions, itemName, options = {}) {
  const { delayTicks = 0 } = options;
  
  // Sort positions: bottom-up (Y), then far-to-near, then left-to-right (same as original)
  const botPos = bot.entity.position;
  const sorted = positions.slice().sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    const distA = botPos.distanceTo(a);
    const distB = botPos.distanceTo(b);
    if (Math.abs(distA - distB) > 0.5) return distB - distA;
    return a.x - b.x;
  });

  let success = 0;
  let failed = 0;

  // Override bot.lookAt to prevent camera movement during placement (same as original)
  const LOOK_SETTLE_DELAY_TICKS = 18;
  let allowLookAt = true;
  const originalLookAt = bot.lookAt.bind(bot);
  bot.lookAt = async function(position, forceLook) {
    if (allowLookAt) {
      await originalLookAt(position, false);
      await bot.waitForTicks(LOOK_SETTLE_DELAY_TICKS);
    }
  };

  try {
    initializePathfinder(bot, {
      allowSprinting: false,
      allowParkour: false,
      canDig: false,
      allowEntityDetection: true,
    });

    let blockIndex = 0;
    for (const pos of sorted) {
      blockIndex++;
      
      try {
        const currentBotPos = bot.entity.position.clone();
        const adjacentPos = pos.clone();

        // Determine wall direction (same logic as original)
        const firstPos = sorted[0];
        const lastPos = sorted[sorted.length - 1];
        const isXAxis = Math.abs(lastPos.x - firstPos.x) > Math.abs(lastPos.z - firstPos.z);
        
        if (isXAxis) {
          adjacentPos.z -= PLACEMENT_STANDOFF_BLOCKS;
          adjacentPos.x += -1;
        } else {
          adjacentPos.x -= PLACEMENT_STANDOFF_BLOCKS;
          adjacentPos.z += -1;
        }
        
        // Skip adjacent movement for 4th block in 4-block structures (same as original)
        const skip4BlockMovement = (blockIndex === 4 && sorted.length === 4);
        
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
          console.log(`[${bot.username}] 🛑 FORCED NO-MOVE: Skipping adjacent movement for 4th block at ${pos}`);
        }

        // Force 4th block reference logic (same as original)
        let forcedReference = null;
        if (blockIndex === 4 && sorted.length === 4) {
          const belowPos = pos.offset(0, -1, 0);
          const belowBlock = bot.blockAt(belowPos);
          if (belowBlock && belowBlock.boundingBox === "block") {
            forcedReference = {
              refBlock: belowBlock,
              faceVec: new Vec3(0, 1, 0)
            };
            console.log(`[${bot.username}] 🎯 FORCED: 4th block will use TOP face of block below at ${belowPos}`);
          }
        }
        
        const visibleRef = forcedReference || findVisibleReachablePlaceReferenceLocal(bot, pos);
        const placeReference = visibleRef || findPlaceReference(bot, pos);
        
        if (placeReference) {
          const { refBlock, faceVec } = placeReference;
          
          const lookAtFacePos = refBlock.position.offset(
            0.5 + faceVec.x * 0.5,
            0.5 + faceVec.y * 0.5,
            0.5 + faceVec.z * 0.5
          );
          
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

        // Disable lookAt during "placement" (same pattern as original)
        allowLookAt = false;
        
        // NO-OP PLACEMENT: Use tryPlaceAtNoOp instead of real placement
        let placed;
        if (visibleRef) {
          placed = await tryPlaceAtNoOp(bot, pos, itemName, visibleRef.refBlock, visibleRef.faceVec, options);
          // Skip the fallback to placeAt since we're in no-op mode
        } else {
          // Even without visible ref, simulate success in no-op mode
          console.log(`[${bot.username}] 🔇 NO-PLACE: Would attempt fallback placement at ${pos}`);
          placed = true;
        }
        
        if (placed) {
          success++;
          console.log(`[${bot.username}] ✅ [NO-PLACE] Simulated block at ${pos}`);
        } else {
          failed++;
          console.log(`[${bot.username}] ❌ [NO-PLACE] Failed to simulate at ${pos}`);
        }
      } catch (error) {
        failed++;
        console.log(`[${bot.username}] ❌ Error at ${pos}: ${error.message}`);
      }
      
      if (delayTicks > 0) {
        await bot.waitForTicks(delayTicks);
      }
    }
  } finally {
    bot.lookAt = originalLookAt;
    stopPathfinder(bot);
  }

  return { success, failed, placed: success };
}

/**
 * NO-OP version of buildStructure
 * Performs all movement and looking, but doesn't place blocks
 */
async function buildStructureNoPlace(bot, positions, blockType, args) {
  console.log(`[${bot.username}] 🏗️ [NO-PLACE] Starting to simulate building ${positions.length} blocks...`);

  initializePathfinder(bot, {
    allowSprinting: false,
    allowParkour: true,
    canDig: true,
    allowEntityDetection: true,
  });

  try {
    const result = await placeMultipleWithDelayNoPlace(bot, positions, blockType, {
      useSneak: true,
      tries: 5,
      args: args,
      delayTicks: getBlockPlaceDelayTicks(positions.length),
    });

    console.log(`[${bot.username}] 🏁 [NO-PLACE] Build simulation complete!`);
    console.log(`[${bot.username}]    Success: ${result.success}/${positions.length}`);
    console.log(`[${bot.username}]    Failed: ${result.failed}/${positions.length}`);

    return result;
  } finally {
    stopPathfinder(bot);
  }
}

/**
 * Get the phase function for structure no-place eval episodes
 * This is nearly identical to the original, but calls buildStructureNoPlace instead
 */
function getOnStructureNoPlaceEvalPhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  iterationID,
  episodeNum,
  episodeInstance,
  args
) {
  return async function onStructureNoPlaceEvalPhase(otherBotPosition) {
    coordinator.sendToOtherBot(
      `structureNoPlaceEvalPhase_${iterationID}`,
      bot.entity.position.clone(),
      episodeNum,
      `structureNoPlaceEvalPhase_${iterationID} beginning`
    );

    console.log(`[${bot.username}] 🚀 [NO-PLACE] Starting STRUCTURE NO-PLACE EVAL phase ${iterationID}`);

    const initialSpawnPos = bot.entity.position.clone();
    console.log(`[${bot.username}] 📍 Spawn position: ${initialSpawnPos.toString()}`);
    
    let startTick = null;

    console.log(`[${bot.username}] ✅ STEP 1: Bot spawned`);

    // Role assignment (same as original)
    const roleAssignmentModes = ["alpha_builds", "bravo_builds"];
    const selectedRoleMode = roleAssignmentModes[Math.floor(sharedBotRng() * roleAssignmentModes.length)];
    
    let isBuilder;
    if (selectedRoleMode === "alpha_builds") {
      isBuilder = bot.username < args.other_bot_name;
    } else {
      isBuilder = bot.username >= args.other_bot_name;
    }
    
    const role = isBuilder ? "BUILDER" : "OBSERVER";
    
    console.log(`[${bot.username}] 🎭 Role mode: ${selectedRoleMode}, Role: ${role}`);
    
    const builderSpawnPos = isBuilder 
      ? initialSpawnPos.floored() 
      : new Vec3(otherBotPosition.x, otherBotPosition.y, otherBotPosition.z).floored();
    
    // Builder equips stone (same as original)
    if (isBuilder) {
      console.log(`[${bot.username}] 🔧 STEP 1b-pre: Equipping stone in hand...`);
      try {
        const stoneItem = bot.inventory.items().find(item => item.name === "stone");
        if (stoneItem) {
          await bot.equip(stoneItem, "hand");
          console.log(`[${bot.username}] ✅ Equipped stone in hand`);
        } else {
          console.log(`[${bot.username}] ⚠️ No stone found in inventory`);
        }
      } catch (equipError) {
        console.log(`[${bot.username}] ⚠️ Could not equip stone: ${equipError.message}`);
      }
      await bot.waitForTicks(15);
    }
    
    // Builder sneaks (same as original)
    if (isBuilder) {
      console.log(`[${bot.username}] STEP 1b-sneak: Sneaking...`);
      await sneak(bot);
      startTick = bot.time.age;
      console.log(`[${bot.username}] ✅ Sneak complete, startTick: ${startTick}`);
    } else {
      console.log(`[${bot.username}] STEP 1b-sneak: Remaining stationary (observer role)`);
      await bot.waitForTicks(15);
    }

    await bot.waitForTicks(10);

    // Initial eye contact (same as original)
    if (isBuilder) {
      console.log(`[${bot.username}] 👀 STEP 2: Making eye contact with ${args.other_bot_name}...`);
      try {
        const otherEntity = bot.players[args.other_bot_name]?.entity;
        if (otherEntity) {
          const targetPos = otherEntity.position.offset(0, otherEntity.height, 0);
          await bot.lookAt(targetPos);
          await bot.waitForTicks(getInitialEyeContactTicks(ALL_STRUCTURE_TYPES.length));
        }
      } catch (lookError) {
        console.log(`[${bot.username}] ⚠️ Could not look at other bot: ${lookError.message}`);
      }
    } else {
      console.log(`[${bot.username}] 🧍 STEP 2: Remaining stationary (observer role)...`);
      await bot.waitForTicks(getInitialEyeContactTicks(ALL_STRUCTURE_TYPES.length));
    }

    // Plan structure (same as original)
    console.log(`[${bot.username}] 📐 STEP 3: Planning structure...`);
    
    const structureType = ALL_STRUCTURE_TYPES[Math.floor(sharedBotRng() * ALL_STRUCTURE_TYPES.length)];
    const blockType = BUILD_BLOCK_TYPES[Math.floor(sharedBotRng() * BUILD_BLOCK_TYPES.length)];
    
    console.log(`[${bot.username}] 🎲 Randomly selected: ${structureType} with ${blockType}`);
    
    const botPos = builderSpawnPos.floored();
    let positions = [];
    let structureBasePos = null;
    let structureHeight = null;
    let structureLength = null;
    let structureWidth = 1;

    if (structureType === "platform_2x2") {
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

    console.log(`[${bot.username}] 📋 ${isBuilder ? 'Simulating build of' : 'Observing'} ${positions.length} blocks with ${blockType}`);

    // Build structure - USE NO-PLACE VERSION
    let buildResult = { placed: 0, failed: 0 };
    
    if (isBuilder) {
      console.log(`[${bot.username}] 🏗️ STEP 4: [NO-PLACE] Simulating structure build...`);
      buildResult = await buildStructureNoPlace(bot, positions, blockType, args);
    } else {
      console.log(`[${bot.username}] 🧍 STEP 4: Remaining stationary (observer role)...`);
      const totalWatchTime = positions.length * getBlockPlaceDelayTicks(positions.length);
      await bot.waitForTicks(totalWatchTime);
      console.log(`[${bot.username}] ✅ Finished waiting (stationary)`);
    }

    // Move to front of structure (same as original)
    console.log(`[${bot.username}] 🚶 STEP 5: Moving to front of structure (axially aligned)...`);
    try {
      initializePathfinder(bot, {
        allowSprinting: true,
        allowParkour: true,
        canDig: false,
        allowEntityDetection: true,
      });

      const actualStructureBasePos = builderSpawnPos.offset(1, 0, 0);
      const FRONT_DISTANCE = 6;
      const actualStructureCenterX = actualStructureBasePos.x + (structureLength) / 2;
      const frontZ = actualStructureBasePos.z - FRONT_DISTANCE;
      
      const sideOffset = isBuilder ? 1 : -1;
      const targetX = actualStructureCenterX + sideOffset;
      const targetZ = frontZ;
      
      console.log(`[${bot.username}] 📐 Structure center X: ${actualStructureCenterX.toFixed(1)}, moving to front position (${targetX.toFixed(1)}, ${targetZ.toFixed(1)})`);

      const frontGoal = new GoalNear(
        targetX,
        bot.entity.position.y,
        targetZ,
        1
      );
      await gotoWithTimeout(bot, frontGoal, { timeoutTicks: 200 });
      console.log(`[${bot.username}] ✅ Moved to front of structure (axially aligned)`);
      
      const viewPosition = getStructureCenterForViewing(structureType, actualStructureBasePos, structureHeight, structureLength, structureWidth);
      
      if (viewPosition) {
        console.log(`[${bot.username}] 👁️ Looking at structure from front...`);
        await lookAtSmooth(bot, viewPosition, 90, { randomized: false, useEasing: false });
        await bot.waitForTicks(getBuilderAdmireTicks(positions.length));
        console.log(`[${bot.username}] ✅ Admired structure from front position`);
      }
    } catch (pathError) {
      console.log(`[${bot.username}] ⚠️ Could not move to front: ${pathError.message}`);
    } finally {
      stopPathfinder(bot);
    }

    // Wait for minimum ticks (same as original)
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

    console.log(`[${bot.username}] ✅ [NO-PLACE] STRUCTURE NO-PLACE EVAL phase complete!`);

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
      `structureNoPlaceEvalPhase_${iterationID} end`
    );

    return buildResult;
  };
}

/**
 * StructureNoPlaceEvalEpisode - Debug variant that does NOT place blocks
 * Useful for testing movement and camera behavior without modifying the world
 */
class StructureNoPlaceEvalEpisode extends BaseEpisode {
  static INIT_MIN_BOTS_DISTANCE = 6;
  static INIT_MAX_BOTS_DISTANCE = 6;
  static WORKS_IN_NON_FLAT_WORLD = true;

  constructor(sharedBotRng) {
    super();
  }

  async setupEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args, botPosition, otherBotPosition) {
    // Still give the bot items so it can equip them (for visual authenticity)
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
      `structureNoPlaceEvalPhase_${iterationID}`,
      episodeNum,
      getOnStructureNoPlaceEvalPhaseFn(
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
      `structureNoPlaceEvalPhase_${iterationID}`,
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
    // Nothing to clean up since no blocks were placed
  }
}

module.exports = {
  buildStructureNoPlace,
  placeMultipleWithDelayNoPlace,
  tryPlaceAtNoOp,
  getOnStructureNoPlaceEvalPhaseFn,
  StructureNoPlaceEvalEpisode,
};
