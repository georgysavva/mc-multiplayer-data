// builder.js - Robust block placement utility for Minecraft bots
const { Vec3 } = require('vec3');

// Cardinal directions for finding reference blocks (faces to click)
const CARDINALS = [
  new Vec3( 1, 0, 0),  // +X (east)
  new Vec3(-1, 0, 0),  // -X (west)
  new Vec3( 0, 0, 1),  // +Z (south)
  new Vec3( 0, 0,-1),  // -Z (north)
  new Vec3( 0, 1, 0),  // +Y (top)
  new Vec3( 0,-1, 0)   // -Y (bottom)
];

/**
 * Check if a block is air or air-like (passable)
 * @param {Block} block - Block to check
 * @returns {boolean} True if air-like
 */
function isAirLike(block) {
  return !block || block.name === 'air' || block.boundingBox === 'empty';
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
 * Ensure an item is equipped in hand
 * @param {Bot} bot - Mineflayer bot instance
 * @param {string} itemName - Name of item to equip
 * @param {Object} args - Configuration arguments with rcon settings (optional)
 * @returns {Promise<number>} Item ID
 */
async function ensureItemInHand(bot, itemName, args = null) {
  const mcData = require('minecraft-data')(bot.version);
  const target = mcData.itemsByName[itemName];
  if (!target) throw new Error(`Unknown item: ${itemName}`);
  const id = target.id;

  // Check if already in inventory
  let item = bot.inventory.items().find(i => i.type === id);
  
  // If not found, try to get it
  if (!item) {
    if (bot.game.gameMode === 1) {
      // Creative mode: spawn it directly
      const Item = require('prismarine-item')(bot.version);
      await bot.creative.setInventorySlot(36, new Item(id, 64));
      item = bot.inventory.slots[36];
    } else if (args && args.rcon_host) {
      // Survival mode: use RCON to give items
      console.log(`[${bot.username}] 📦 Giving ${itemName} via RCON...`);
      const { Rcon } = require('rcon-client');
      const rcon = await Rcon.connect({
        host: args.rcon_host,
        port: args.rcon_port,
        password: args.rcon_password,
      });
      await rcon.send(`give ${bot.username} ${itemName} 64`);
      await rcon.end();
      
      // Wait for item to arrive
      await new Promise(resolve => {
        const checkItem = () => {
          const found = bot.inventory.items().find(i => i.type === id);
          if (found) {
            item = found;
            resolve();
          } else {
            setTimeout(checkItem, 100);
          }
        };
        checkItem();
      });
    }
  }
  
  if (!item) throw new Error(`Item ${itemName} not in inventory`);

  await bot.equip(id, 'hand');
  return id;
}

/**
 * Compute a reference block + face vector to place at targetPos
 * Tries all 6 faces; prefers horizontal faces first
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPos - Target position to place block
 * @returns {Object|null} {refBlock, faceVec} or null if no valid reference
 */
function findPlaceReference(bot, targetPos) {
  for (const face of CARDINALS) {
    const refPos = targetPos.plus(face); // block we click on
    const refBlock = bot.blockAt(refPos);
    if (!refBlock) continue;
    
    // Only click on solid blocks
    if (refBlock.boundingBox !== 'block' || refBlock.material === 'noteblock') continue;
    
    // Face vector is the *opposite* of the offset from ref to target
    const faceVec = new Vec3(-face.x, -face.y, -face.z);
    return { refBlock, faceVec };
  }
  return null;
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
  const lookAtPos = refBlock.position.offset(
    0.5 + faceVec.x * 0.5, 
    0.5 + faceVec.y * 0.5, 
    0.5 + faceVec.z * 0.5
  );

  for (let i = 0; i < maxTries; i++) {
    // Try to look at the face
    try { 
      await bot.lookAt(lookAtPos, true); 
    } catch (e) {
      // Ignore look errors
    }
    
    const maxReach = bot.game.gameMode === 1 ? 6 : 4.5;
    if (inReach(bot, refBlock.position, maxReach)) return true;

    // Nudge closer using pathfinder if available
    if (bot.pathfinder) {
      const { GoalNear } = require('mineflayer-pathfinder').goals;
      const p = refBlock.position;
      bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 2), true);
      await new Promise(res => setTimeout(res, 350));
    } else {
      // Simple wait if no pathfinder
      await new Promise(res => setTimeout(res, 200));
    }
  }
  
  return inReach(bot, refBlock.position, 5);
}

/**
 * Robust place at exact target (x,y,z) with itemName
 * Auto-finds a reference face, ensures reach/LOS, sneaks if needed, retries
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} targetPos - Target position to place block
 * @param {string} itemName - Name of block/item to place
 * @param {Object} options - Options {useSneak, tries, args}
 * @returns {Promise<boolean>} True if successfully placed
 */
async function placeAt(bot, targetPos, itemName, { useSneak = true, tries = 5, args = null } = {}) {
  // Preconditions: check if already placed
  const airNow = isAirLike(bot.blockAt(targetPos));
  if (!airNow) return true; // already placed

  await ensureItemInHand(bot, itemName, args);

  // Find a face to click
  let plan = findPlaceReference(bot, targetPos);
  if (!plan) throw new Error(`No reference block to place at ${targetPos}`);

  const sneakWas = bot.getControlState('sneak');
  if (useSneak) bot.setControlState('sneak', true);

  try {
    for (let i = 0; i < tries; i++) {
      const { refBlock, faceVec } = plan;
      const ok = await ensureReachAndSight(bot, refBlock, faceVec, 2);
      
      if (!ok) {
        // Try a different face before giving up
        plan = findPlaceReference(bot, targetPos);
        if (!plan) continue;
      }

      try {
        await bot.placeBlock(refBlock, faceVec);
      } catch (e) {
        // If failed, try other faces once
        plan = findPlaceReference(bot, targetPos);
        await new Promise(res => setTimeout(res, 120));
        continue;
      }

      // Confirm world state
      const placed = !isAirLike(bot.blockAt(targetPos));
      if (placed) return true;

      await new Promise(res => setTimeout(res, 80));
    }
    
    return !isAirLike(bot.blockAt(targetPos));
  } finally {
    if (useSneak && !sneakWas) bot.setControlState('sneak', false);
  }
}

/**
 * Place multiple blocks in a deterministic order (bottom-up, near-to-far)
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Array<Vec3>} positions - Array of positions to place blocks
 * @param {string} itemName - Name of block/item to place
 * @param {Object} options - Options for placement
 * @returns {Promise<Object>} {success: number, failed: number}
 */
async function placeMultiple(bot, positions, itemName, options = {}) {
  // Sort positions: bottom-up (Y), then near-to-far, then left-to-right
  const botPos = bot.entity.position;
  const sorted = positions.slice().sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y; // Bottom first
    const distA = botPos.distanceTo(a);
    const distB = botPos.distanceTo(b);
    if (Math.abs(distA - distB) > 0.5) return distA - distB; // Near first
    return a.x - b.x; // Left to right
  });

  let success = 0;
  let failed = 0;

  for (const pos of sorted) {
    try {
      const placed = await placeAt(bot, pos, itemName, options);
      if (placed) {
        success++;
        console.log(`[${bot.username}] ✅ Placed block at ${pos}`);
      } else {
        failed++;
        console.log(`[${bot.username}] ❌ Failed to place at ${pos}`);
      }
    } catch (error) {
      failed++;
      console.log(`[${bot.username}] ❌ Error placing at ${pos}: ${error.message}`);
    }
  }

  return { success, failed };
}

module.exports = {
  placeAt,
  placeMultiple,
  isAirLike,
  inReach,
  ensureItemInHand,
  findPlaceReference,
  ensureReachAndSight,
  CARDINALS
};
