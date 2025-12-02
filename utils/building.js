// building.js - Utilities for collaborative house building episodes
const { Vec3 } = require("vec3");
const { sleep } = require("./helpers");
const { placeAt } = require("../episode-handlers/builder");
const { digWithTimeout, gotoWithTimeout } = require("./movement");
const { GoalNear } = require("./bot-factory"); // Import GoalNear

// Track scaffolds for cleanup
const scaffoldBlocks = [];

/**
 * Calculate placement order for floor blocks (edge-to-center spiral)
 * Strategy: Place perimeter first, then work inward layer by layer
 * This ensures bots never stand on unplaced blocks
 * @param {number} width - Width of floor (default 5)
 * @param {number} depth - Depth of floor (default 5)
 * @returns {Array<{x: number, z: number, order: number}>} Ordered positions
 */
function calculateFloorPlacementOrder(width = 5, depth = 5) {
  const positions = [];
  let order = 0;
  
  // Work from outside edge inward (layer by layer)
  let minX = 0, maxX = width - 1;
  let minZ = 0, maxZ = depth - 1;
  
  while (minX <= maxX && minZ <= maxZ) {
    // Top edge (left to right)
    for (let x = minX; x <= maxX; x++) {
      positions.push({ x, z: minZ, order: order++ });
    }
    minZ++;
    
    // Right edge (top to bottom)
    for (let z = minZ; z <= maxZ; z++) {
      positions.push({ x: maxX, z, order: order++ });
    }
    maxX--;
    
    // Bottom edge (right to left)
    if (minZ <= maxZ) {
      for (let x = maxX; x >= minX; x--) {
        positions.push({ x, z: maxZ, order: order++ });
      }
      maxZ--;
    }
    
    // Left edge (bottom to top)
    if (minX <= maxX) {
      for (let z = maxZ; z >= minZ; z--) {
        positions.push({ x: minX, z, order: order++ });
      }
      minX++;
    }
  }
  
  return positions;
}

/**
 * Helper: Get perimeter position for clockwise ordering
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {number} Position along perimeter
 */
function getPerimeterPosition(x, z) {
  // South wall (z=0): positions 0-4
  if (z === 0) return x;
  // East wall (x=4): positions 5-8
  if (x === 4) return 5 + (z - 1);
  // North wall (z=4): positions 9-12
  if (z === 4) return 9 + (4 - x);
  // West wall (x=0): positions 13-15
  if (x === 0) return 13 + (4 - z - 1);
  return 999; // Should never happen
}

/**
 * Calculate placement order for wall blocks
 * Strategy: Bottom-up, corners first, then edges
 * @param {Array<{x: number, y: number, z: number}>} wallBlocks - Wall block positions
 * @returns {Map<string, number>} Map of "x,y,z" -> order
 */
function calculateWallPlacementOrder(wallBlocks) {
  const orderMap = new Map();
  let order = 0;
  
  // Group by Y level (bottom to top)
  const byLevel = {};
  for (const block of wallBlocks) {
    const key = block.y;
    if (!byLevel[key]) byLevel[key] = [];
    byLevel[key].push(block);
  }
  
  // Process each level
  const levels = Object.keys(byLevel).map(Number).sort((a, b) => a - b);
  
  for (const y of levels) {
    const levelBlocks = byLevel[y];
    
    // Sort by distance from corners (corners first)
    // Corners are at (0,0), (4,0), (0,4), (4,4)
    const sorted = levelBlocks.slice().sort((a, b) => {
      const isCornerA = (a.x === 0 || a.x === 4) && (a.z === 0 || a.z === 4);
      const isCornerB = (b.x === 0 || b.x === 4) && (b.z === 0 || b.z === 4);
      
      if (isCornerA && !isCornerB) return -1;
      if (!isCornerA && isCornerB) return 1;
      
      // Then by perimeter position (clockwise from south-west)
      const perimeterA = getPerimeterPosition(a.x, a.z);
      const perimeterB = getPerimeterPosition(b.x, b.z);
      return perimeterA - perimeterB;
    });
    
    // Assign orders
    for (const block of sorted) {
      orderMap.set(`${block.x},${block.y},${block.z}`, order++);
    }
  }
  
  return orderMap;
}

/**
 * Calculate placement order for roof blocks
 * Strategy: Similar to floor (edge-to-center) but bots are below
 * @param {number} width - Width of roof (default 5)
 * @param {number} depth - Depth of roof (default 5)
 * @returns {Array<{x: number, z: number, order: number}>} Ordered positions
 */
function calculateRoofPlacementOrder(width = 5, depth = 5) {
  // Roof can use same strategy as floor since bots are below
  // But we might want to place from edges inward for stability
  return calculateFloorPlacementOrder(width, depth);
}

/**
 * Generate a 5x5 house blueprint with flat roof
 * Local coordinate frame: origin at south-west corner, +X=east, +Z=south, +Y=up
 * @param {Object} options - Configuration options
 * @param {Object} options.materials - Material overrides
 * @returns {Array<Object>} Array of {x, y, z, block, phase, placementOrder, data}
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

  // PHASE 1: FLOOR (y=0, 5x5 grid) with edge-to-center placement order
  const floorOrder = calculateFloorPlacementOrder(5, 5);
  const floorOrderMap = new Map();
  for (const pos of floorOrder) {
    floorOrderMap.set(`${pos.x},${pos.z}`, pos.order);
  }
  
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) {
      const placementOrder = floorOrderMap.get(`${x},${z}`);
      blueprint.push({
        x,
        y: 0,
        z,
        block: materials.floor,
        phase: "floor",
        placementOrder: placementOrder !== undefined ? placementOrder : 999,
        data: null,
      });
    }
  }

  // PHASE 2: WALLS (y=1 to y=3, hollow ring)
  // Collect all wall blocks first, then assign orders
  const wallBlocks = [];
  
  // Entrance will be at (x=2, z=0, y=1 and y=2) - 1 wide × 2 tall opening
  for (let y = 1; y <= 3; y++) {
    // South wall (z=0) - skip entrance position (2 blocks tall)
    for (let x = 0; x < 5; x++) {
      if (!(x === 2 && (y === 1 || y === 2))) {  // Skip entrance at y=1 and y=2
        wallBlocks.push({ x, y, z: 0 });
      }
    }

    // North wall (z=4)
    for (let x = 0; x < 5; x++) {
      wallBlocks.push({ x, y, z: 4 });
    }

    // West wall (x=0, skip corners already done)
    for (let z = 1; z < 4; z++) {
      wallBlocks.push({ x: 0, y, z });
    }

    // East wall (x=4, skip corners already done)
    for (let z = 1; z < 4; z++) {
      wallBlocks.push({ x: 4, y, z });
    }
  }
  
  // Calculate wall placement order
  const wallOrderMap = calculateWallPlacementOrder(wallBlocks);
  
  // Add walls to blueprint with placement order
  for (const wall of wallBlocks) {
    const orderKey = `${wall.x},${wall.y},${wall.z}`;
    const placementOrder = wallOrderMap.get(orderKey);
    blueprint.push({
      x: wall.x,
      y: wall.y,
      z: wall.z,
      block: materials.walls,
      phase: "walls",
      placementOrder: placementOrder !== undefined ? placementOrder : 999,
      data: null,
    });
  }

  // PHASE 3: ENTRANCE - 1 block wide × 2 blocks tall opening (no door)
  // Entrance is at (x=2, z=0, y=1 and y=2)
  // No door blocks placed, creating an open entrance

  // PHASE 4: WINDOWS (glass panes at y=2)
  // Windows can be placed in any order after walls
  let windowOrder = 0;
  
  // South windows flanking door
  blueprint.push({
    x: 1,
    y: 2,
    z: 0,
    block: materials.windows,
    phase: "windows",
    placementOrder: windowOrder++,
    data: null,
  });
  blueprint.push({
    x: 3,
    y: 2,
    z: 0,
    block: materials.windows,
    phase: "windows",
    placementOrder: windowOrder++,
    data: null,
  });
  // West window
  blueprint.push({
    x: 0,
    y: 2,
    z: 2,
    block: materials.windows,
    phase: "windows",
    placementOrder: windowOrder++,
    data: null,
  });
  // East window
  blueprint.push({
    x: 4,
    y: 2,
    z: 2,
    block: materials.windows,
    phase: "windows",
    placementOrder: windowOrder++,
    data: null,
  });

  // PHASE 5: ROOF (flat roof at y=4, 5x5 grid) with edge-to-center order
  const roofOrder = calculateRoofPlacementOrder(5, 5);
  const roofOrderMap = new Map();
  for (const pos of roofOrder) {
    roofOrderMap.set(`${pos.x},${pos.z}`, pos.order);
  }
  
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) {
      const placementOrder = roofOrderMap.get(`${x},${z}`);
      blueprint.push({
        x,
        y: 4,
        z,
        block: materials.roof,
        phase: "roof",
        placementOrder: placementOrder !== undefined ? placementOrder : 999,
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

  console.log(
    `[${bot.username}] 📦 Receiving building materials...`
  );

  for (const [blockName, count] of Object.entries(materials)) {
    if (count > 0) {
      const cmd = `/give ${bot.username} ${blockName} ${count}`;
      await rcon.send(cmd);
      console.log(
        `[${bot.username}]    ${count}x ${blockName}`
      );
      await sleep(500); // Increased delay for inventory sync
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
  const { args = null, delayMs = 300, shouldAbort = () => false } = options;

  if (targets.length === 0) {
    console.log(`[${bot.username}] No blocks assigned in this phase`);
    return { success: 0, failed: 0, aborted: false };
  }

  console.log(
    `[${bot.username}] 🏗️ Building ${targets.length} blocks in phase...`
  );

  const blockType = targets[0].block;
  const phaseName = targets[0].phase;

  console.log(`[${bot.username}] 📦 Block type: ${blockType}, Phase: ${phaseName}`);

  const abortIfRequested = (context) => {
    try {
      if (shouldAbort()) {
        console.log(
          `[${bot.username}] 🛑 Abort requested during ${context} (${phaseName} phase)`
        );
        return true;
      }
    } catch (abortError) {
      console.warn(
        `[${bot.username}] ⚠️ Error while checking abort signal: ${abortError.message}`
      );
    }
    return false;
  };

  if (abortIfRequested("phase initialization")) {
    return { success: 0, failed: 0, aborted: true };
  }

  // Sort positions: Use placementOrder if available, otherwise fallback to Y-level then distance
  const botPos = bot.entity.position;
  const sorted = targets.slice().sort((a, b) => {
    // Primary sort: placementOrder (if both have it)
    if (a.placementOrder !== undefined && b.placementOrder !== undefined) {
      return a.placementOrder - b.placementOrder;
    }
    
    // Fallback sort: Y-level (bottom-up), then distance (near-to-far)
    if (a.worldPos.y !== b.worldPos.y) return a.worldPos.y - b.worldPos.y;
    const distA = botPos.distanceTo(a.worldPos);
    const distB = botPos.distanceTo(b.worldPos);
    return distA - distB;
  });

  let success = 0;
  let failed = 0;

  console.log(`[${bot.username}] 🔨 Starting block placement loop...`);

  for (let i = 0; i < sorted.length; i++) {
    if (abortIfRequested(`preparing block ${i + 1}/${sorted.length}`)) {
      return { success, failed, aborted: true };
    }

    const target = sorted[i];
    const pos = target.worldPos;
    let attemptCount = 0;
    const MAX_ATTEMPTS = 3; // attempt 1 = normal, attempt 2 = cardinal reposition, attempt 3 = jump-and-place
    let placed = false;

    while (attemptCount < MAX_ATTEMPTS && !placed) {
      if (abortIfRequested(`attempt ${attemptCount + 1} for block ${i + 1}/${sorted.length}`)) {
        return { success, failed, aborted: true };
      }

      try {
        // Check if block already placed
        const existingBlock = bot.blockAt(pos);
        if (existingBlock && existingBlock.name !== "air") {
          // Check if it's already the CORRECT block type we want to place
          const isCorrectBlock = existingBlock.name === blockType;
          
          if (isCorrectBlock) {
            console.log(
              `[${bot.username}] ✅ Correct block (${blockType}) already exists at (${pos.x}, ${pos.y}, ${pos.z})`
            );
            success++;
            placed = true;
            break;
          } else {
            // Wrong block (terrain/obstacle) - need to clear it first
            console.log(
              `[${bot.username}] ⛏️ Clearing ${existingBlock.name} at (${pos.x}, ${pos.y}, ${pos.z}) to place ${blockType}`
            );
            
            try {
              await digWithTimeout(bot, existingBlock, { timeoutMs: 5000 });
              await sleep(200); // Let block break settle
              console.log(
                `[${bot.username}] ✅ Cleared ${existingBlock.name}, ready to place ${blockType}`
              );
            } catch (digError) {
              console.log(
                `[${bot.username}] ⚠️ Failed to clear block: ${digError.message}, will attempt placement anyway`
              );
              // Continue anyway - placement might still work or we'll retry
            }
          }
        }
        
        // Auto-scaffold if no reference block
        if (!hasAdjacentSolidBlock(bot, pos)) {
          console.log(
            `[${bot.username}] 🧱 No reference block at (${pos.x}, ${pos.y}, ${pos.z}), scaffolding...`
          );
          await placeScaffold(bot, pos, args);
          await sleep(200); // Let scaffold settle
        }

        // ATTEMPT 3 ONLY: Jump-and-place as final fallback
        if (attemptCount === 2 && !placed) {
          console.log(
            `[${bot.username}] 🦘 Attempt 3: Using jump-and-place as final fallback...`
          );
          
          // Move close to target (try to get on top or adjacent)
          const targetAbove = new Vec3(pos.x + 0.5, pos.y, pos.z + 0.5); // Center of target block
          const currentPos = bot.entity.position;
          const distToTarget = currentPos.distanceTo(targetAbove);
          
          if (distToTarget > 2) {
            console.log(
              `[${bot.username}] 🚶 Moving closer to target for jump-and-place...`
            );
            bot.pathfinder.setGoal(new GoalNear(targetAbove.x, targetAbove.y, targetAbove.z, 1));
            await sleep(Math.min(distToTarget * 500, 3000));
            bot.pathfinder.setGoal(null);
            await sleep(300);
          }
          
          try {
            bot.setControlState('jump', true);
            await sleep(100); // Brief moment to start jump
            
            // Attempt placement while jumping
            placed = await placeAt(bot, pos, blockType, {
              useSneak: false, // Don't sneak while jumping
              tries: 3,
              args: args,
            });
            
            bot.setControlState('jump', false);
            await sleep(200); // Let bot land
            
            if (placed) {
              console.log(
                `[${bot.username}] ✅ Successfully placed block while jumping!`
              );
              success++;
            } else {
              // Jump placement failed - need to reposition
              console.log(
                `[${bot.username}] ⚠️ Jump placement failed, will reposition...`
              );
              attemptCount++;
              if (attemptCount < MAX_ATTEMPTS) {
                await sleep(300);
                continue; // Skip to next iteration with repositioning
              } else {
                failed++;
                break;
              }
            }
          } catch (jumpError) {
            console.log(
              `[${bot.username}] ⚠️ Jump placement error: ${jumpError.message}, will reposition...`
            );
            attemptCount++;
            if (attemptCount < MAX_ATTEMPTS) {
              await sleep(300);
              continue;
            } else {
              failed++;
              break;
            }
          }
          
          // If placed successfully via jump, continue to next block
          if (placed) {
            continue;
          }
        }

        // Pathfind near target (reposition on retry attempts)
        const distance = bot.entity.position.distanceTo(pos);
        const shouldReposition = attemptCount > 0 || distance > 4;
        
        if (shouldReposition) {
          if (attemptCount > 0) {
            console.log(
              `[${bot.username}] 🔄 Attempt ${attemptCount + 1}/${MAX_ATTEMPTS}: Repositioning for block ${i + 1}/${sorted.length}`
            );
          } else {
            console.log(
              `[${bot.username}] 🚶 Pathfinding to block ${i + 1}/${sorted.length}, distance: ${distance.toFixed(1)}`
            );
          }

          // On retry attempts, move to cardinally adjacent positions
          if (attemptCount > 0) {
            // Define 4 cardinal positions adjacent to the target block
            const cardinalPositions = [
              { x: pos.x + 1, y: pos.y, z: pos.z, dir: "East" },   // East
              { x: pos.x - 1, y: pos.y, z: pos.z, dir: "West" },   // West
              { x: pos.x, y: pos.y, z: pos.z + 1, dir: "South" },  // South
              { x: pos.x, y: pos.y, z: pos.z - 1, dir: "North" },  // North
            ];
            
            // Find the closest cardinal position to bot's current location
            const currentBotPos = bot.entity.position;
            let closestCardinal = cardinalPositions[0];
            let minDistance = currentBotPos.distanceTo(new Vec3(closestCardinal.x, closestCardinal.y, closestCardinal.z));
            
            for (const cardPos of cardinalPositions) {
              const cardVec = new Vec3(cardPos.x, cardPos.y, cardPos.z);
              const dist = currentBotPos.distanceTo(cardVec);
              if (dist < minDistance) {
                minDistance = dist;
                closestCardinal = cardPos;
              }
            }
            
            console.log(
              `[${bot.username}] 🧭 Moving to cardinal position ${closestCardinal.dir} of target: (${closestCardinal.x}, ${closestCardinal.y}, ${closestCardinal.z})`
            );
            
            // Move to exact cardinal position (range 0 = stand exactly there)
            await gotoWithTimeout(bot, new GoalNear(closestCardinal.x, closestCardinal.y, closestCardinal.z, 0), { timeoutMs: 8000 });
            
            // Extra settling time after repositioning
            await sleep(500);
          } else {
            // First attempt: normal approach (distance 3)
            bot.pathfinder.setGoal(new GoalNear(pos.x, pos.y, pos.z, 3));
            await sleep(Math.min(distance * 500, 5000));
            bot.pathfinder.setGoal(null);
          }
        }

        // CHECK: Is bot colliding with target block hitbox?
        // If yes, skip regular placement and go straight to repositioning
        if (attemptCount === 0 && isBotCollidingWithBlock(bot, pos)) {
          console.log(
            `[${bot.username}] ⚠️ Bot is colliding with target block at (${pos.x}, ${pos.y}, ${pos.z}), skipping regular placement and repositioning...`
          );
          attemptCount++;
          await sleep(300);
          continue; // Skip to next iteration which will do cardinal repositioning
        }

        // STEP 1: Try normal placement
        placed = await placeAt(bot, pos, blockType, {
          useSneak: false,
          tries: 1,
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
          // Normal placement failed - increment attempt and retry with repositioning
          attemptCount++;
          if (attemptCount < MAX_ATTEMPTS) {
            console.log(
              `[${bot.username}] ⚠️ Failed attempt ${attemptCount}/${MAX_ATTEMPTS} at (${pos.x}, ${pos.y}, ${pos.z}), will reposition...`
            );
            await sleep(300); // Brief pause before retry
          } else {
            failed++;
            console.log(
              `[${bot.username}] ❌ Failed all ${MAX_ATTEMPTS} attempts at (${pos.x}, ${pos.y}, ${pos.z})`
            );
          }
        }
      } catch (error) {
        attemptCount++;
        if (attemptCount < MAX_ATTEMPTS) {
          console.log(
            `[${bot.username}] ⚠️ Error on attempt ${attemptCount}/${MAX_ATTEMPTS} at (${pos.x}, ${pos.y}, ${pos.z}): ${error.message}, retrying...`
          );
          await sleep(300);
        } else {
          failed++;
          console.log(
            `[${bot.username}] ❌ Error after ${MAX_ATTEMPTS} attempts at (${pos.x}, ${pos.y}, ${pos.z}): ${error.message}`
          );
        }
      }
    }

    if (delayMs > 0 && i < sorted.length - 1) {
      await sleep(delayMs);
      if (abortIfRequested(`post-delay after block ${i + 1}/${sorted.length}`)) {
        return { success, failed, aborted: true };
      }
    }
  }

  console.log(`[${bot.username}] ✅ Placement loop complete`);
  console.log(`[${bot.username}]    ✅ Success: ${success}/${targets.length}`);
  console.log(`[${bot.username}]    ❌ Failed: ${failed}/${targets.length}`);

  return { success, failed, aborted: false };
}

/**
 * Check if bot's hitbox overlaps with target block position
 * Bot hitbox: 0.6 wide × 1.8 tall, centered at bot position
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPos - Target block position
 * @returns {boolean} True if bot is standing on/inside target block
 */
function isBotCollidingWithBlock(bot, targetPos) {
  const botPos = bot.entity.position;
  const BOT_WIDTH = 0.6; // Minecraft bot width
  const BOT_HEIGHT = 1.8; // Minecraft bot height
  
  // Bot's AABB (Axis-Aligned Bounding Box)
  // Bot position is at feet, center of the horizontal plane
  const botMinX = botPos.x - BOT_WIDTH / 2;
  const botMaxX = botPos.x + BOT_WIDTH / 2;
  const botMinY = botPos.y;
  const botMaxY = botPos.y + BOT_HEIGHT;
  const botMinZ = botPos.z - BOT_WIDTH / 2;
  const botMaxZ = botPos.z + BOT_WIDTH / 2;
  
  // Target block AABB (1×1×1 cube)
  const blockMinX = targetPos.x;
  const blockMaxX = targetPos.x + 1;
  const blockMinY = targetPos.y;
  const blockMaxY = targetPos.y + 1;
  const blockMinZ = targetPos.z;
  const blockMaxZ = targetPos.z + 1;
  
  // Check for AABB overlap (intersection)
  const overlapX = botMaxX > blockMinX && botMinX < blockMaxX;
  const overlapY = botMaxY > blockMinY && botMinY < blockMaxY;
  const overlapZ = botMaxZ > blockMinZ && botMinZ < blockMaxZ;
  
  return overlapX && overlapY && overlapZ;
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

  const { GoalNear } = require("mineflayer-pathfinder").goals;

  // Step 0: If bot is elevated (on roof), jump down to ground level
  const botY = bot.entity.position.y;
  const doorY = doorWorldPos.y;

  if (botY > doorY + 1.5) {
    console.log(
      `[${bot.username}] 🪂 Bot is on roof, jumping down to ground...`
    );
    
    // Just pathfind to door - pathfinder will jump down automatically
    bot.pathfinder.setGoal(new GoalNear(doorWorldPos.x, doorY, doorWorldPos.z, 3));
    await sleep(5000); // Time for jumping down
    bot.pathfinder.setGoal(null);
    await sleep(1000); // Stabilize after landing
    
    console.log(`[${bot.username}] ✅ Reached ground level`);
  }

  console.log(`[${bot.username}] 🚪 Exiting through door...`);

  // Step 1: Pathfind through door
  bot.pathfinder.setGoal(new GoalNear(doorWorldPos.x, doorWorldPos.y, doorWorldPos.z, 1));
  await sleep(3000);
  bot.pathfinder.setGoal(null);

  // Step 2: Pick a shared random position around the house, with bots standing side by side
  // Generate random angle (0-360°) and distance (10-20 blocks) - SHARED between both bots
  const houseCenter = doorWorldPos.offset(2, 0, 2); // Center of 5x5 house at ground level
  
  // Use a deterministic random based on house position so both bots get same angle
  const seed = houseCenter.x + houseCenter.z * 1000;
  const seededRandom = Math.abs(Math.sin(seed));
  const randomAngle = seededRandom * 2 * Math.PI; // Random angle in radians (shared)
  const randomDistance = 12 + (Math.abs(Math.sin(seed * 2)) * 8); // Random distance 12-20 blocks (shared)
  
  // Calculate base position using polar coordinates
  const baseOffsetX = Math.cos(randomAngle) * randomDistance;
  const baseOffsetZ = Math.sin(randomAngle) * randomDistance;
  
  // Calculate perpendicular offset for side-by-side positioning (3 blocks apart)
  // Perpendicular angle is 90° offset from viewing angle
  const perpAngle = randomAngle + Math.PI / 2;
  const sideOffset = bot.username.includes('Alpha') ? -1.5 : 1.5; // Alpha left, Bravo right
  const sideOffsetX = Math.cos(perpAngle) * sideOffset;
  const sideOffsetZ = Math.sin(perpAngle) * sideOffset;
  
  const lookFromPos = houseCenter.offset(baseOffsetX + sideOffsetX, 0, baseOffsetZ + sideOffsetZ);

  console.log(
    `[${bot.username}] 🚶 Moving to admire position (angle: ${(randomAngle * 180 / Math.PI).toFixed(0)}°, distance: ${randomDistance.toFixed(1)} blocks, side: ${bot.username.includes('Alpha') ? 'left' : 'right'})...`
  );
  bot.pathfinder.setGoal(new GoalNear(lookFromPos.x, lookFromPos.y, lookFromPos.z, 1));
  await sleep(5000); // Extra time for potentially longer paths
  bot.pathfinder.setGoal(null);

  // Step 3: Look at house center
  const houseCenterLookTarget = houseCenter.offset(0, 2, 0); // Look at middle height of house
  console.log(
    `[${bot.username}] 👀 Looking at house together...`
  );
  await bot.lookAt(houseCenterLookTarget, false);
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
  calculateFloorPlacementOrder,
  getPerimeterPosition,
  calculateWallPlacementOrder,
  calculateRoofPlacementOrder,
  isBotCollidingWithBlock,
};
