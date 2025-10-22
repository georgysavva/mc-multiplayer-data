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
    
    // Strategic delay to ensure recording has fully started and stabilized
    const recordingDelay = 2000; // 2 seconds
    console.log(`[${bot.username}] ⏳ Waiting ${recordingDelay}ms for recording to stabilize...`);
    await sleep(recordingDelay);
    
    // PHASE 1: Look at each other first
    console.log(`[${bot.username}] 👀 PHASE 1: Looking at other bot for eye contact...`);
    
    // Get the real-time other bot position using mineflayer API
    let actualOtherBotPosition = null;
    let otherBotEntity = null;
    
    try {
      // Find the other bot in the world
      console.log(`[${bot.username}] � Searching for other bot using mineflayer API...`);
      console.log(`[${bot.username}] 👥 Available players: ${Object.keys(bot.players).join(', ')}`);
      console.log(`[${bot.username}] 🤖 My username: ${bot.username}`);
      console.log(`[${bot.username}] 🎯 Looking for bot: ${otherBotName}`);
      
      // Find other bot in players list
      const otherPlayer = bot.players[otherBotName];
      if (otherPlayer && otherPlayer.entity) {
        otherBotEntity = otherPlayer.entity;
        actualOtherBotPosition = otherBotEntity.position.clone();
        console.log(`[${bot.username}] ✅ Found other bot entity at: ${actualOtherBotPosition.x.toFixed(2)}, ${actualOtherBotPosition.y.toFixed(2)}, ${actualOtherBotPosition.z.toFixed(2)}`);
      } else {
        console.log(`[${bot.username}] ❌ Other bot not found in players list, using passed position`);
        actualOtherBotPosition = otherBotPosition.clone();
      }
      
    } catch (findError) {
      console.log(`[${bot.username}] ⚠️ Error finding other bot: ${findError.message}, using passed position`);
      actualOtherBotPosition = otherBotPosition.clone();
    }
    
    try {
      // Calculate look position - aim for the other bot's head level
      const lookTarget = actualOtherBotPosition.clone();
      lookTarget.y += 1.6; // Bot eye level height
      
      console.log(`[${bot.username}] 🎯 Looking at target: ${lookTarget.x.toFixed(2)}, ${lookTarget.y.toFixed(2)}, ${lookTarget.z.toFixed(2)}`);
      
      // Calculate distance to other bot
      const myPosition = bot.entity.position;
      const distance = myPosition.distanceTo(actualOtherBotPosition);
      console.log(`[${bot.username}] 📏 Distance to other bot: ${distance.toFixed(2)} blocks`);
      
      // Look at the other bot
      await bot.lookAt(lookTarget);
      console.log(`[${bot.username}] ✅ Successfully looked at other bot`);
      
      // Hold eye contact for a moment
      await sleep(1500);
      console.log(`[${bot.username}] 👁️ Maintaining eye contact for 1.5 seconds`);
      
    } catch (lookError) {
      console.log(`[${bot.username}] ⚠️ Failed to look at other bot: ${lookError.message}`);
    }
    
    // PHASE 2: Brief acknowledgment (look down then back up)
    console.log(`[${bot.username}] 👋 PHASE 2: Brief acknowledgment gesture...`);
    try {
      // Look down briefly
      await bot.look(0, Math.PI / 4); // Look down 45 degrees
      console.log(`[${bot.username}] 📉 Looking down briefly`);
      await sleep(500);
      
      // Look back at other bot using real position
      if (actualOtherBotPosition) {
        const lookTarget2 = actualOtherBotPosition.clone();
        lookTarget2.y += 1.6;
        await bot.lookAt(lookTarget2);
        console.log(`[${bot.username}] 📈 Looking back at other bot`);
      }
      await sleep(500);
      
    } catch (gestureError) {
      console.log(`[${bot.username}] ⚠️ Failed acknowledgment gesture: ${gestureError.message}`);
    }
    
    // PHASE 3: Jump and place block underneath
    console.log(`[${bot.username}] 🚀 PHASE 3: Jump and place block underneath...`);
    
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
          await sleep(500);
        }
      }
      
      // Equip dirt blocks
      const dirt = bot.inventory.findInventoryItem('dirt');
      if (dirt) {
        await bot.equip(dirt, 'hand');
        console.log(`[${bot.username}] 🧱 Equipped dirt blocks`);
      } else {
        console.log(`[${bot.username}] ❌ No dirt blocks available`);
        return;
      }
      
      // Get current position for reference
      const startPos = bot.entity.position.clone();
      console.log(`[${bot.username}] 📍 Starting position: ${startPos.x.toFixed(2)}, ${startPos.y.toFixed(2)}, ${startPos.z.toFixed(2)}`);
      
      // JUMP AND PLACE SEQUENCE
      console.log(`[${bot.username}] 🦘 Starting jump sequence...`);
      
      // Start jumping
      bot.setControlState('jump', true);
      console.log(`[${bot.username}] ⬆️ Jump initiated!`);
      
      // Wait a moment to get some air time
      await sleep(200);
      
      // While in air, place block underneath
      try {
        const currentPos = bot.entity.position;
        console.log(`[${bot.username}] 🌟 In air at: ${currentPos.x.toFixed(2)}, ${currentPos.y.toFixed(2)}, ${currentPos.z.toFixed(2)}`);
        
        // Calculate block position underneath
        const blockPos = new Vec3(
          Math.floor(currentPos.x),
          Math.floor(currentPos.y) - 1, // One block below current position
          Math.floor(currentPos.z)
        );
        
        console.log(`[${bot.username}] 🎯 Attempting to place block at: ${blockPos.x}, ${blockPos.y}, ${blockPos.z}`);
        
        // Find block to place against (should be the ground or existing block)
        const targetBlock = bot.blockAt(blockPos);
        if (targetBlock && targetBlock.name !== 'air') {
          console.log(`[${bot.username}] 🔍 Found target block: ${targetBlock.name} at ${targetBlock.position.x}, ${targetBlock.position.y}, ${targetBlock.position.z}`);
          
          // INJECT ACTION BEFORE PLACEMENT
          console.log(`[${bot.username}] 🎬 Injecting place_block action...`);
          injectPlaceBlockAction(bot);
          
          // Place block on top of the target
          await bot.placeBlock(targetBlock, new Vec3(0, 1, 0));
          console.log(`[${bot.username}] ✅ Successfully placed block while jumping!`);
          
          // INJECT ACTION AFTER PLACEMENT
          injectPlaceBlockAction(bot);
          
        } else {
          console.log(`[${bot.username}] ❌ No suitable target block found for placement`);
        }
        
      } catch (placeError) {
        console.log(`[${bot.username}] ⚠️ Failed to place block while jumping: ${placeError.message}`);
      }
      
      // Continue jumping for a bit more
      await sleep(300);
      
      // Stop jumping
      bot.setControlState('jump', false);
      console.log(`[${bot.username}] ⬇️ Jump completed, landing...`);
      
      // Wait for landing
      await sleep(1000);
      
      const endPos = bot.entity.position.clone();
      console.log(`[${bot.username}] 🏁 Landed at: ${endPos.x.toFixed(2)}, ${endPos.y.toFixed(2)}, ${endPos.z.toFixed(2)}`);
      
      // Optional: Do a second jump for more action
      console.log(`[${bot.username}] � Second jump for extra action...`);
      bot.setControlState('jump', true);
      await sleep(100);
      
      // Try to place another block
      try {
        const currentPos2 = bot.entity.position;
        const blockPos2 = new Vec3(
          Math.floor(currentPos2.x) + 1, // Offset to the side
          Math.floor(currentPos2.y) - 1,
          Math.floor(currentPos2.z)
        );
        
        const targetBlock2 = bot.blockAt(blockPos2);
        if (targetBlock2 && targetBlock2.name !== 'air') {
          injectPlaceBlockAction(bot);
          await bot.placeBlock(targetBlock2, new Vec3(0, 1, 0));
          console.log(`[${bot.username}] ✅ Placed second block!`);
          injectPlaceBlockAction(bot);
        }
      } catch (secondPlaceError) {
        console.log(`[${bot.username}] ⚠️ Second block placement failed: ${secondPlaceError.message}`);
      }
      
      await sleep(200);
      bot.setControlState('jump', false);
      console.log(`[${bot.username}] 🎉 Jump and place sequence completed!`);
      
    } catch (error) {
      console.log(`[${bot.username}] ❌ Error in jump and place sequence: ${error.message}`);
      // Make sure to stop jumping in case of error
      bot.setControlState('jump', false);
    }
    
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
