const Vec3 = require("vec3").Vec3;
const { 
  stopAll, 
  sleep
} = require('../utils/movement');

// Constants for the block placing episode
const PLACE_BLOCK_DURATION_MS = 2000; // 2 seconds to complete block placement

/**
 * Manually inject a place_block action into the action tracking system
 * @param {Bot} bot - Mineflayer bot instance
 */
function injectPlaceBlockAction(bot) {
  try {
    // Inject the action by emitting to the viewer's action tracking system
    console.log(`[${bot.username}] 📝 Injecting place_block action into tracking system`);
    
    // Method 1: Try to emit action through bot events
    if (bot.viewer) {
      bot.viewer.emit('action', { 
        place_block: true,
        timestamp: Date.now() 
      });
      console.log(`[${bot.username}] ✅ Injected action via bot.viewer.emit`);
    }
    
    // Method 2: Try emitting through bot itself
    bot.emit('actionPerformed', {
      type: 'place_block',
      value: true,
      timestamp: Date.now()
    });
    console.log(`[${bot.username}] ✅ Injected action via bot.emit`);
    
    // Method 3: Set a flag on the bot for external tracking
    if (!bot.customActions) {
      bot.customActions = [];
    }
    bot.customActions.push({
      type: 'place_block',
      value: true,
      timestamp: Date.now(),
      frame: bot.viewer ? bot.viewer.frameCount : -1
    });
    console.log(`[${bot.username}] ✅ Added action to bot.customActions array`);
    
  } catch (error) {
    console.log(`[${bot.username}] ⚠️ Failed to inject place_block action: ${error.message}`);
  }
}

/**
 * Get place block phase handler function
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} iterationID - Iteration ID
 * @param {string} otherBotName - Other bot name
 * @param {number} episodeNum - Episode number
 * @param {Function} getOnStopPhaseFn - Stop phase function getter
 * @param {Object} args - Configuration arguments
 * @returns {Function} Place block phase handler
 */
function getOnPlaceBlockPhaseFn(
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
    console.log(`[${bot.username}] 🎬 PLACE BLOCK EPISODE STARTING - Episode ${episodeNum}, Iteration ${iterationID}`);
    console.log(`[${bot.username}] 🕐 Episode start time: ${new Date(startTime).toISOString()}`);
    
    coordinator.sendToOtherBot(
      `placeBlockPhase_${iterationID}`,
      bot.entity.position.clone(),
      `placeBlockPhase_${iterationID} beginning`
    );

    console.log(`[${bot.username}] 🚀 Starting place block phase ${iterationID}`);
    console.log(`[${bot.username}] 📍 Current position: ${bot.entity.position.x.toFixed(2)}, ${bot.entity.position.y.toFixed(2)}, ${bot.entity.position.z.toFixed(2)}`);
    console.log(`[${bot.username}] 📍 Passed other bot position: ${otherBotPosition.x.toFixed(2)}, ${otherBotPosition.y.toFixed(2)}, ${otherBotPosition.z.toFixed(2)}`);
    
    // STEP 1: Bots spawn (already done by teleport phase)
    console.log(`[${bot.username}] ✅ STEP 1: Bot spawned`);
    
    // Get the real-time other bot position using mineflayer API
    let actualOtherBotPosition = null;
    
    try {
      // Find the other bot in the world
      console.log(`[${bot.username}] 🔍 Searching for other bot using mineflayer API...`);
      console.log(`[${bot.username}] 👥 Available players: ${Object.keys(bot.players).join(', ')}`);
      console.log(`[${bot.username}] 🤖 My username: ${bot.username}`);
      console.log(`[${bot.username}] 🎯 Looking for bot: ${otherBotName}`);
      
      // Find other bot in players list
      const otherPlayer = bot.players[otherBotName];
      if (otherPlayer && otherPlayer.entity) {
        actualOtherBotPosition = otherPlayer.entity.position.clone();
        console.log(`[${bot.username}] ✅ Found other bot entity at: ${actualOtherBotPosition.x.toFixed(2)}, ${actualOtherBotPosition.y.toFixed(2)}, ${actualOtherBotPosition.z.toFixed(2)}`);
      } else {
        console.log(`[${bot.username}] ❌ Other bot not found in players list, using passed position`);
        actualOtherBotPosition = otherBotPosition.clone();
      }
      
    } catch (findError) {
      console.log(`[${bot.username}] ⚠️ Error finding other bot: ${findError.message}, using passed position`);
      actualOtherBotPosition = otherBotPosition.clone();
    }
    
    // STEP 2: Both bots look at each other
    console.log(`[${bot.username}] 👀 STEP 2: Looking at other bot...`);
    try {
      // Calculate look position - aim for the other bot's head level
      const lookTarget = actualOtherBotPosition.clone();
      lookTarget.y += 1.6; // Bot eye level height
      
      console.log(`[${bot.username}] 🎯 Looking at target: ${lookTarget.x.toFixed(2)}, ${lookTarget.y.toFixed(2)}, ${lookTarget.z.toFixed(2)}`);
      
      // Look at the other bot
      await bot.lookAt(lookTarget, false);
      console.log(`[${bot.username}] ✅ Successfully looked at other bot`);
      
      // Hold eye contact for a moment
      await sleep(1500);
      console.log(`[${bot.username}] 👁️ Maintaining eye contact for 1.5 seconds`);
      
    } catch (lookError) {
      console.log(`[${bot.username}] ⚠️ Failed to look at other bot: ${lookError.message}`);
    }
    
    // STEP 3: Both bots jump once
    console.log(`[${bot.username}] 🦘 STEP 3: Jumping once...`);
    try {
      bot.setControlState('jump', true);
      console.log(`[${bot.username}] ⬆️ Jump initiated!`);
      await sleep(100); // Jump duration
      bot.setControlState('jump', false);
      console.log(`[${bot.username}] ⬇️ Jump completed`);
      await sleep(100); // Wait for landing
    } catch (jumpError) {
      console.log(`[${bot.username}] ⚠️ Failed to jump: ${jumpError.message}`);
      bot.setControlState('jump', false);
    }
    
    // STEP 4: Both bots equip dirt blocks
    console.log(`[${bot.username}] 🧱 STEP 4: Equipping dirt blocks...`);
    try {
      // First, ensure bot has blocks in inventory (creative mode setup)
      if (bot.player.gamemode === 1) { // Creative mode
        console.log(`[${bot.username}] 🎒 Setting up inventory for block placement...`);
        try {
          await bot.creative.setInventorySlot(36, { type: bot.registry.itemsByName.dirt.id, count: 64 });
          console.log(`[${bot.username}] ✅ Added 64 dirt blocks to inventory`);
        } catch (creativeError) {
          console.log(`[${bot.username}] ⚠️ Creative inventory failed, trying /give command`);
          bot.chat(`/give @s minecraft:dirt 64`);
          await sleep(100);
        }
      }
      
      // Equip dirt blocks
      const dirtId = bot.registry.itemsByName?.dirt?.id;
      if (dirtId) {
        let dirtItem = bot.inventory.items().find(i => i.type === dirtId);
        if (!dirtItem) {
          await sleep(200); // allow time for /give or inventory update
          dirtItem = bot.inventory.items().find(i => i.type === dirtId);
        }
        if (dirtItem) {
          await bot.equip(dirtItem, 'hand');
          console.log(`[${bot.username}] ✅ Equipped dirt blocks`);
        } else {
          console.log(`[${bot.username}] ❌ No dirt blocks available`);
          return;
        }
      } else {
        console.log(`[${bot.username}] ❌ Dirt item ID not found`);
        return;
      }
      
      await sleep(100); // Brief pause after equipping
      
    } catch (equipError) {
      console.log(`[${bot.username}] ❌ Failed to equip dirt: ${equipError.message}`);
      return;
    }
    
    // STEP 5: Both bots look down at the ground
    console.log(`[${bot.username}] 👣 STEP 5: Looking down at the ground...`);
    try {
      // Keep current yaw, pitch down (negative pitch looks down)
      await bot.look(bot.entity.yaw, -1.45, true); // -1.45 radians is almost straight down
      console.log(`[${bot.username}] ✅ Looking down at ground`);
      await sleep(1000); // Hold the look down position
    } catch (lookDownError) {
      console.log(`[${bot.username}] ⚠️ Failed to look down: ${lookDownError.message}`);
    }
    
    // STEP 6: Both bots place block in front, then jump onto it
    console.log(`[${bot.username}] 🚀 STEP 6: Place block in front and jump onto it...`);
    
    try {
      // Verify dirt is still equipped
      const heldItem = bot.heldItem;
      if (!heldItem || heldItem.name !== 'dirt') {
        console.log(`[${bot.username}] ⚠️ Dirt not in hand! Held item: ${heldItem ? heldItem.name : 'nothing'}`);
        // Try to re-equip
        const dirtId = bot.registry.itemsByName?.dirt?.id;
        if (dirtId) {
          const dirtItem = bot.inventory.items().find(i => i.type === dirtId);
          if (dirtItem) {
            await bot.equip(dirtItem, 'hand');
            console.log(`[${bot.username}] ✅ Re-equipped dirt blocks`);
            await sleep(300);
          } else {
            console.log(`[${bot.username}] ❌ No dirt in inventory!`);
            return;
          }
        }
      } else {
        console.log(`[${bot.username}] ✅ Verified dirt is equipped: ${heldItem.name}`);
      }
      
      // Get current position
      const startPos = bot.entity.position.clone();
      console.log(`[${bot.username}] 📍 Starting position: ${startPos.x.toFixed(2)}, ${startPos.y.toFixed(2)}, ${startPos.z.toFixed(2)}`);
      
      // Calculate position 1 block in front based on yaw
      const yaw = bot.entity.yaw;
      const offsetX = -Math.sin(yaw);
      const offsetZ = -Math.cos(yaw);
      
      const targetGroundPos = new Vec3(
        Math.floor(startPos.x + offsetX),
        Math.floor(startPos.y) - 1,
        Math.floor(startPos.z + offsetZ)
      );
      
      console.log(`[${bot.username}] 🎯 Target ground position (1 block ahead): ${targetGroundPos.x}, ${targetGroundPos.y}, ${targetGroundPos.z}`);
      console.log(`[${bot.username}] 🧭 Bot yaw: ${yaw.toFixed(2)}`);
      
      // Get the ground block
      const groundBlock = bot.blockAt(targetGroundPos);
      if (groundBlock && groundBlock.name !== 'air') {
        console.log(`[${bot.username}] 🔍 Found ground block: ${groundBlock.name}`);
        
        // Check if space above ground is empty (where we'll place the dirt)
        const blockAbove = bot.blockAt(groundBlock.position.offset(0, 1, 0));
        console.log(`[${bot.username}] 🔍 Block above ground: ${blockAbove ? blockAbove.name : 'null'}`);
        
        if (blockAbove && blockAbove.name === 'air') {
          // INJECT ACTION BEFORE PLACEMENT
          console.log(`[${bot.username}] 🎬 Injecting place_block action...`);
          injectPlaceBlockAction(bot);
          
          // Place block on top of the ground (1 block in front)
          console.log(`[${bot.username}] 🔨 Placing dirt block in front...`);
          await bot.placeBlock(groundBlock, new Vec3(0, 1, 0));
          console.log(`[${bot.username}] ✅ Successfully placed dirt block!`);
          
          // INJECT ACTION AFTER PLACEMENT
          injectPlaceBlockAction(bot);
          
          // Wait a moment for the block to appear in the world
          await sleep(500);
          
          // Now the bot should be standing on the newly placed block
          // Jump to celebrate!
          console.log(`[${bot.username}] 🦘 Jumping forward onto placed block...`);
          bot.setControlState('forward', true);
          bot.setControlState('jump', true);
          await sleep(400);
          bot.setControlState('jump', false);
          await sleep(200);
          bot.setControlState('forward', false);
          
          // Wait for landing
          await sleep(500);
          
          const endPos = bot.entity.position.clone();
          console.log(`[${bot.username}] 🏁 Final position: ${endPos.x.toFixed(2)}, ${endPos.y.toFixed(2)}, ${endPos.z.toFixed(2)}`);
          console.log(`[${bot.username}] 📊 Position change: X=${(endPos.x - startPos.x).toFixed(2)}, Y=${(endPos.y - startPos.y).toFixed(2)}, Z=${(endPos.z - startPos.z).toFixed(2)}`);
          
        } else {
          console.log(`[${bot.username}] ❌ Cannot place block - space is occupied by: ${blockAbove ? blockAbove.name : 'null'}`);
        }
        
      } else {
        console.log(`[${bot.username}] ❌ No ground block found (block is: ${groundBlock ? groundBlock.name : 'null'})`);
      }
      
    } catch (error) {
      console.log(`[${bot.username}] ❌ Error in place and jump sequence: ${error.message}`);
      console.log(`[${bot.username}] 📋 Error stack: ${error.stack}`);
      // Make sure to stop movement in case of error
      bot.setControlState('jump', false);
      bot.setControlState('forward', false);
    }
    
    // STEP 7: Both bots look at each other again
    console.log(`[${bot.username}] 👀 STEP 7: Looking at other bot again...`);
    try {
      let targetPos = null;
      const otherPlayer2 = bot.players[otherBotName];
      if (otherPlayer2 && otherPlayer2.entity) {
        targetPos = otherPlayer2.entity.position.clone();
      } else if (actualOtherBotPosition) {
        targetPos = actualOtherBotPosition.clone();
      }
      if (targetPos) {
        const lookTarget3 = targetPos.clone();
        lookTarget3.y += 1.6;
        await bot.lookAt(lookTarget3, false);
        console.log(`[${bot.username}] ✅ Looked at other bot again`);
        await sleep(1500); // Hold eye contact
      }
    } catch (finalLookError) {
      console.log(`[${bot.username}] ⚠️ Failed final look: ${finalLookError.message}`);
    }
    
    // STEP 8: Episode ends
    console.log(`[${bot.username}] 🎬 STEP 8: Episode ending...`);
    
    // Wait a moment for the action to complete and be recorded
    console.log(`[${bot.username}] ⏳ Waiting ${PLACE_BLOCK_DURATION_MS}ms for action to complete and be recorded...`);
    await sleep(PLACE_BLOCK_DURATION_MS);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`[${bot.username}] 🏁 Place block episode completed in ${duration}ms`);
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
      `placeBlockPhase_${iterationID} end`
    );
    
    console.log(`[${bot.username}] ✅ Place block phase ${iterationID} transition complete`);
  };
}

module.exports = {
  getOnPlaceBlockPhaseFn
};
