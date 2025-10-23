const Vec3 = require("vec3").Vec3;
const { Movements, GoalFollow, GoalNear } = require('../utils/bot-factory');
const { 
  stopAll, 
  lookAtBot,
  sleep,
  initializePathfinder,
  stopPathfinder
} = require('../utils/movement');
const Rcon = require('rcon-client').Rcon;

// Constants for PVP behavior
const PVP_DURATION_MS = 10000;           // 10 seconds of combat
const ATTACK_COOLDOWN_MS = 500;          // 0.5s between attacks
const MELEE_RANGE = 3;                   // Attack range in blocks
const APPROACH_DISTANCE = 2;             // Pathfinder target distance
const COMBAT_LOOP_INTERVAL_MS = 100;     // Combat loop update rate
const MIN_SPAWN_DISTANCE = 8;            // Minimum distance between bots at spawn
const MAX_SPAWN_DISTANCE = 15;           // Maximum distance between bots at spawn
const INITIAL_EYE_CONTACT_MS = 500;      // Initial look duration
const RECORDING_DELAY_MS = 500;          // Recording stabilization delay

// Available sword types (will pick randomly)
const SWORD_TYPES = ['stone_sword']; // Default to stone sword only to avoid timeout issues

/**
 * Equip a sword using RCON give command
 * @param {Bot} bot - Mineflayer bot instance
 * @param {string} swordName - Name of sword to equip (default: 'stone_sword')
 * @param {number} hotbarIndex - Hotbar slot index 0-8 (default: 0)
 * @param {Object} args - Configuration arguments with rcon settings
 * @returns {Promise<string>} Name of equipped sword
 */
async function equipSwordCreative(bot, swordName = 'stone_sword', hotbarIndex = 0, args) {
  console.log(`[${bot.username}] 🗡️ Equipping ${swordName}...`);
  
  // Log current gamemode for debugging
  console.log(`[${bot.username}] 🎮 Current gameMode: ${bot.game.gameMode}`);

  const mcData = require('minecraft-data')(bot.version);
  const Item = require('prismarine-item')(bot.version);

  // DEBUG: Log what's actually available in mcData
  console.log(`[${bot.username}] 🔍 DEBUG: Looking for '${swordName}' in mcData.itemsByName`);
  const allSwordItems = Object.keys(mcData.itemsByName).filter(name => name.includes('sword'));
  console.log(`[${bot.username}] 🔍 DEBUG: Available sword items in mcData:`, allSwordItems);
  
  // Try to find the item with the given name
  let id = mcData.itemsByName[swordName]?.id;
  console.log(`[${bot.username}] 🔍 DEBUG: mcData.itemsByName['${swordName}'] = ${id ? `id: ${id}` : 'NOT FOUND'}`);
  
  // If not found, try with minecraft: namespace
  if (!id) {
    const namespacedName = `minecraft:${swordName}`;
    id = mcData.itemsByName[namespacedName]?.id;
    console.log(`[${bot.username}] 🔍 DEBUG: Trying with namespace: mcData.itemsByName['${namespacedName}'] = ${id ? `id: ${id}` : 'NOT FOUND'}`);
  }
  
  if (!id) {
    throw new Error(`Unknown sword: ${swordName} (tried both '${swordName}' and 'minecraft:${swordName}')`);
  }

  // Use RCON to give the sword (more reliable than creative API)
  console.log(`[${bot.username}] 📡 Using RCON to give sword...`);
  const rcon = await Rcon.connect({
    host: args.rcon_host,
    port: args.rcon_port,
    password: args.rcon_password,
  });
  
  // Use Minecraft's official format: give <player> minecraft:item_name
  const giveCommand = `give ${bot.username} minecraft:${swordName}`;
  console.log(`[${bot.username}] 📡 Executing: ${giveCommand}`);
  const rconResponse = await rcon.send(giveCommand);
  console.log(`[${bot.username}] 📡 RCON response: ${rconResponse}`);
  await rcon.end();
  
  // Wait for the item to appear in inventory
  console.log(`[${bot.username}] ⏳ Waiting for sword to appear in inventory...`);
  await sleep(500);
  
  // Find the sword in inventory
  const sword = bot.inventory.items().find(i => i.type === id);
  if (!sword) {
    console.log(`[${bot.username}] ⚠️ Sword not found in inventory after RCON give`);
    throw new Error(`Sword not found in inventory after RCON give`);
  }
  
  console.log(`[${bot.username}] ✅ Found sword in inventory: ${sword.name}`);
  
  // Equip the sword to hand
  await bot.equip(sword, 'hand');
  console.log(`[${bot.username}] 🎯 Equipped sword to hand`);
  
  // Set the quickbar slot to make it active (needed for viewer to show it)
  bot.setQuickBarSlot(hotbarIndex);
  console.log(`[${bot.username}] 🎯 Set quickbar slot to ${hotbarIndex}`);
  
  // Wait a moment for the item to sync
  await sleep(300);
  
  // Verify the item is actually equipped
  const heldItem = bot.heldItem;
  console.log(`[${bot.username}] 🔍 DEBUG: After equip, heldItem =`, heldItem ? `${heldItem.name} (type: ${heldItem.type})` : 'null');
  
  if (heldItem && heldItem.type === id) {
    console.log(`[${bot.username}] ✅ Successfully equipped ${swordName}`);
    return swordName;
  } else {
    console.log(`[${bot.username}] ⚠️ Sword not in hand after equip. Held item: ${heldItem ? heldItem.name : 'nothing'}`);
    throw new Error(`Failed to equip ${swordName} - verification failed`);
  }
}

/**
 * Set player gamemode via RCON
 * @param {string} playerName - Player name
 * @param {string} gamemode - Gamemode (creative, survival, etc.)
 * @param {Object} args - Configuration arguments with rcon settings
 * @returns {Promise<string>} RCON response
 */
async function rconGamemode(playerName, gamemode, args) {
  const rcon = await Rcon.connect({
    host: args.rcon_host,
    port: args.rcon_port,
    password: args.rcon_password,
  });
  const res = await rcon.send(`gamemode ${gamemode} ${playerName}`);
  await rcon.end();
  return res;
}

/**
 * Execute a generic RCON command
 * @param {string} command - RCON command to execute
 * @param {Object} args - Configuration arguments with rcon settings
 * @returns {Promise<string>} RCON response
 */
async function rconCommand(command, args) {
  const rcon = await Rcon.connect({
    host: args.rcon_host,
    port: args.rcon_port,
    password: args.rcon_password,
  });
  const res = await rcon.send(command);
  await rcon.end();
  return res;
}

/**
 * Equip a random sword from available types
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Object} args - Configuration arguments with rcon settings
 * @returns {Promise<string>} Name of equipped sword
 */
async function equipRandomSword(bot, args) {
  console.log(`[${bot.username}] 🗡️ Searching for sword in inventory...`);
  
  // Pick a random sword type
  const swordType = SWORD_TYPES[Math.floor(Math.random() * SWORD_TYPES.length)];
  console.log(`[${bot.username}] 🎲 Selected ${swordType} for combat`);
  
  try {
    // Use RCON to give and equip the sword
    return await equipSwordCreative(bot, swordType, 0, args);
  } catch (error) {
    console.log(`[${bot.username}] ❌ Error equipping sword: ${error.message}`);
    console.log(`[${bot.username}] ❌ No sword could be equipped`);
    return null;
  }
}

/**
 * Main PVP combat loop
 * @param {Bot} bot - Mineflayer bot instance
 * @param {string} targetBotName - Name of target bot
 * @param {number} durationMs - Combat duration in milliseconds
 */
async function pvpCombatLoop(bot, targetBotName, durationMs) {
  console.log(`[${bot.username}] ⚔️ Starting PVP combat loop for ${durationMs/1000}s`);
  
  // Initialize pathfinder for combat
  initializePathfinder(bot, {
    allowSprinting: true,   // Sprint to close distance
    allowParkour: false,    // Stable movement
    canDig: false,          // No terrain modification
    allowEntityDetection: true
  });
  
  console.log(`[${bot.username}] ✅ Pathfinder initialized for combat`);
  
  const startTime = Date.now();
  let lastAttackTime = 0;
  let totalAttacks = 0;
  let lastHealthLog = Date.now();
  
  try {
    while (Date.now() - startTime < durationMs) {
      // Get target entity using nearestEntity for more robust targeting
      const targetEntity = bot.nearestEntity((entity) => {
        // Find the specific target player by username
        return entity.type === 'player' && entity.username === targetBotName;
      });
      
      if (!targetEntity) {
        console.log(`[${bot.username}] ⚠️ Cannot find target ${targetBotName}`);
        await sleep(COMBAT_LOOP_INTERVAL_MS);
        continue;
      }
      
      const distance = bot.entity.position.distanceTo(targetEntity.position);
      
      // Update pathfinder to follow target
      bot.pathfinder.setGoal(new GoalFollow(targetEntity, APPROACH_DISTANCE), true);
      
      // Look at target during combat (aim at head height)
      try {
        const targetHeadPos = targetEntity.position.offset(0, targetEntity.height, 0);
        await bot.lookAt(targetHeadPos, true);
      } catch (lookError) {
        // Ignore look errors during combat
      }
      
      // Attack if in melee range and cooldown expired
      if (distance <= MELEE_RANGE) {
        const now = Date.now();
        if (now - lastAttackTime >= ATTACK_COOLDOWN_MS) {
          try {
            await bot.attack(targetEntity);
            totalAttacks++;
            lastAttackTime = now;
            console.log(`[${bot.username}] ⚔️ Attack #${totalAttacks} on ${targetBotName} (distance: ${distance.toFixed(2)} blocks)`);
          } catch (attackError) {
            console.log(`[${bot.username}] ⚠️ Attack failed: ${attackError.message}`);
          }
        }
      } else {
        // Log chase status occasionally
        if (Date.now() - lastHealthLog > 2000) {
          console.log(`[${bot.username}] 🏃 Chasing ${targetBotName} (distance: ${distance.toFixed(2)} blocks)`);
          lastHealthLog = Date.now();
        }
      }
      
      // Log health periodically
      if (Date.now() - lastHealthLog > 3000) {
        console.log(`[${bot.username}] ❤️ Health: ${bot.health}/20`);
        lastHealthLog = Date.now();
      }
      
      // Check if bot died (but continue episode)
      if (bot.health <= 0) {
        console.log(`[${bot.username}] 💀 Died in combat (continuing episode)`);
      }
      
      await sleep(COMBAT_LOOP_INTERVAL_MS);
    }
  } finally {
    // Clean up pathfinder
    stopPathfinder(bot);
    
    // Log combat statistics
    const duration = Date.now() - startTime;
    console.log(`[${bot.username}] 🏁 Combat complete! Stats:`);
    console.log(`[${bot.username}]    Duration: ${(duration/1000).toFixed(1)}s`);
    console.log(`[${bot.username}]    Total attacks: ${totalAttacks}`);
    console.log(`[${bot.username}]    Final health: ${bot.health}/20`);
    console.log(`[${bot.username}]    Attacks per second: ${(totalAttacks / (duration/1000)).toFixed(2)}`);
  }
}

/**
 * Get PVP phase handler function
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} iterationID - Iteration ID
 * @param {string} otherBotName - Other bot name
 * @param {number} episodeNum - Episode number
 * @param {Function} getOnStopPhaseFn - Stop phase function getter
 * @param {Object} args - Configuration arguments
 * @returns {Function} PVP phase handler
 */
function getOnPvpPhaseFn(
  bot,
  sharedBotRng,
  coordinator,
  iterationID,
  otherBotName,
  episodeNum,
  getOnStopPhaseFn,
  args
) {
  return async (otherBotPosition) => {
    const startTime = Date.now();
    console.log(`[${bot.username}] ⚔️ PVP EPISODE STARTING - Episode ${episodeNum}, Iteration ${iterationID}`);
    console.log(`[${bot.username}] 🕐 Episode start time: ${new Date(startTime).toISOString()}`);
    
    coordinator.sendToOtherBot(
      `pvpPhase_${iterationID}`,
      bot.entity.position.clone(),
      `pvpPhase_${iterationID} beginning`
    );

    console.log(`[${bot.username}] 🚀 Starting PVP phase ${iterationID}`);
    
    // STEP 1: Bots spawn (already done by teleport phase)
    console.log(`[${bot.username}] ✅ STEP 1: Bot spawned`);
    
    // Strategic delay to ensure recording has fully started
    console.log(`[${bot.username}] ⏳ Waiting ${RECORDING_DELAY_MS}ms for recording to stabilize...`);
    await sleep(RECORDING_DELAY_MS);
    
    // STEP 2: Both bots look at each other
    console.log(`[${bot.username}] 👀 STEP 2: Looking at other bot...`);
    try {
      await lookAtBot(bot, otherBotName, 180);
      console.log(`[${bot.username}] ✅ Initial eye contact established with ${otherBotName}`);
      await sleep(INITIAL_EYE_CONTACT_MS);
    } catch (lookError) {
      console.log(`[${bot.username}] ⚠️ Failed initial look: ${lookError.message}`);
    }
    
    // STEP 3: Get coordinates and check distance
    const myPosition = bot.entity.position.clone();
    const otherPosition = otherBotPosition;
    const initialDistance = myPosition.distanceTo(otherPosition);
    
    console.log(`[${bot.username}] 📍 STEP 3: Got coordinates`);
    console.log(`[${bot.username}]    My position: (${myPosition.x.toFixed(1)}, ${myPosition.y.toFixed(1)}, ${myPosition.z.toFixed(1)})`);
    console.log(`[${bot.username}]    ${otherBotName} position: (${otherPosition.x.toFixed(1)}, ${otherPosition.y.toFixed(1)}, ${otherPosition.z.toFixed(1)})`);
    console.log(`[${bot.username}]    Distance: ${initialDistance.toFixed(2)} blocks`);
    
    // Check if spawn distance is appropriate
    if (initialDistance < MIN_SPAWN_DISTANCE) {
      console.log(`[${bot.username}] ⚠️ Bots spawned too close (${initialDistance.toFixed(2)} < ${MIN_SPAWN_DISTANCE})`);
    } else if (initialDistance > MAX_SPAWN_DISTANCE) {
      console.log(`[${bot.username}] ⚠️ Bots spawned too far (${initialDistance.toFixed(2)} > ${MAX_SPAWN_DISTANCE})`);
    } else {
      console.log(`[${bot.username}] ✅ Spawn distance is appropriate`);
    }
    
    // STEP 4: Equip random sword
    console.log(`[${bot.username}] 🗡️ STEP 4: Equipping sword...`);
    const equippedSword = await equipRandomSword(bot, args);
    
    if (!equippedSword) {
      console.log(`[${bot.username}] ❌ Failed to equip sword - aborting PVP`);
      return;
    }
    
    await sleep(500); // Brief pause after equipping
    
    // STEP 5-7: Enter combat loop
    console.log(`[${bot.username}] ⚔️ STEP 5-7: Beginning PVP combat...`);
    await pvpCombatLoop(bot, otherBotName, PVP_DURATION_MS);
    
    // STEP 8: Episode ends
    console.log(`[${bot.username}] 🎬 STEP 8: PVP episode ending...`);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`[${bot.username}] 🏁 PVP episode completed in ${duration}ms`);
    console.log(`[${bot.username}] 🕐 Episode end time: ${new Date(endTime).toISOString()}`);
    
    // Transition to stop phase
    console.log(`[${bot.username}] 🔄 Transitioning to stop phase...`);
    coordinator.onceEvent(
      "stopPhase",
      getOnStopPhaseFn(bot, sharedBotRng, coordinator, otherBotName)
    );
    coordinator.sendToOtherBot(
      "stopPhase",
      bot.entity.position.clone(),
      `pvpPhase_${iterationID} end`
    );
    
    console.log(`[${bot.username}] ✅ PVP phase ${iterationID} transition complete`);
  };
}

module.exports = {
  pvpCombatLoop,
  equipRandomSword,
  equipSwordCreative,
  rconGamemode,
  rconCommand,
  getOnPvpPhaseFn
};
