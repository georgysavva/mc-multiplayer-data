const Vec3 = require("vec3").Vec3;
const { Movements, GoalNear } = require('../utils/bot-factory');
const { 
  stopAll, 
  lookAtBot,
  lookAtSmooth, 
  sleep,
  horizontalDistanceTo,
  initializePathfinder,
  stopPathfinder
} = require('../utils/movement');
const { tickMVC, createMVC } = require('../utils/mvc');
const { getOrbitConfig } = require('../config/orbit-config');

// Get orbit-specific configuration
const orbitConfig = getOrbitConfig();

// MVC Configuration for orbit episode
const ORBIT_MVC_CONFIG = {
  fov_max_deg: orbitConfig.fov_max,           // Slightly larger FOV for orbit movement
  d_min: orbitConfig.d_min,                // Minimum distance (closer than orbit radius)
  d_max: orbitConfig.d_max,                // Maximum distance (further than orbit radius)
  enable_los_check: false,   // Phase I - flat terrain
  correction_strength: orbitConfig.correction_strength,  // Gentle corrections during orbit
  debug_logging: true
};

/**
 * Make both bots orbit around their shared midpoint with pathfinder, eye contact, and MVC
 * @param {Bot} bot - Mineflayer bot instance
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {string} otherBotName - Name of the other bot
 * @param {Vec3} sharedMidpoint - Shared orbit center between both bots
 * @param {number} durationMs - Duration to orbit in milliseconds
 */
async function orbitAroundSharedMidpoint(bot, coordinator, otherBotName, sharedMidpoint, durationMs) {
  console.log(`[${bot.username}] Starting ${durationMs/1000}s MVC-enhanced pathfinder orbit around shared midpoint (${sharedMidpoint.x.toFixed(1)}, ${sharedMidpoint.y.toFixed(1)}, ${sharedMidpoint.z.toFixed(1)})`);
  
  // Initialize pathfinder with optimal settings for orbiting
  initializePathfinder(bot, {
    allowSprinting: true,
    allowParkour: true,
    canDig: false,
    allowEntityDetection: true
  });
  
  // Create MVC instance for this episode
  const mvc = createMVC(ORBIT_MVC_CONFIG);
  
  console.log(`[${bot.username}] Pathfinder and MVC initialized for orbit`);
  
  const startTime = Date.now();
  let lastEyeContactUpdate = 0;
  let lastMVCUpdate = 0;
  
  // Calculate starting angle based on bot's current position relative to midpoint
  const startPos = bot.entity.position;
  const initialDx = startPos.x - sharedMidpoint.x;
  const initialDz = startPos.z - sharedMidpoint.z;
  let angle = Math.atan2(initialDz, initialDx); // Starting angle
  
  console.log(`[${bot.username}] Starting orbit angle: ${(angle * 180/Math.PI).toFixed(1)}°`);
  
  // MVC state tracking for metadata
  let mvcMetadata = {
    partner_in_fov: true,
    fov_angle_deg: 0,
    distance_to_partner: 0,
    mvc_corrections_applied: 0
  };
  
  try {
    while (Date.now() - startTime < durationMs) {
      const now = Date.now();
      
      // Calculate target position on the circle around shared midpoint
      const targetX = sharedMidpoint.x + orbitConfig.radius * Math.cos(angle);
      const targetZ = sharedMidpoint.z + orbitConfig.radius * Math.sin(angle);
      const targetPos = new Vec3(targetX, sharedMidpoint.y, targetZ);
      
      // Use pathfinder to move to orbit position
      bot.pathfinder.setGoal(new GoalNear(targetPos.x, targetPos.y, targetPos.z, 1.0));
      
      console.log(`[${bot.username}] Orbit target: (${targetX.toFixed(2)}, ${targetZ.toFixed(2)}) angle: ${(angle * 180/Math.PI).toFixed(1)}°`);
      
      // Get other bot's position for MVC
      const otherBot = bot.players[otherBotName];
      if (otherBot && otherBot.entity) {
        const otherBotPos = otherBot.entity.position;
        
        // Run MVC tick every update interval
        if (now - lastMVCUpdate > orbitConfig.update_interval) {
          try {
            const mvcResult = await mvc.tick(bot, otherBotPos);
            
            // Update metadata with MVC state
            mvcMetadata = {
              ...mvcMetadata,
              ...mvcResult.mvcState
            };
            
            if (mvcResult.appliedCorrections.lookedAt || 
                mvcResult.appliedCorrections.movedRight) {
              mvcMetadata.mvc_corrections_applied++;
              console.log(`[${bot.username}] MVC applied corrections during orbit: lookAt=${mvcResult.appliedCorrections.lookedAt}, moveRight=${mvcResult.appliedCorrections.movedRight}`);
            }
            
            lastMVCUpdate = now;
          } catch (error) {
            console.error(`[${bot.username}] MVC error during orbit:`, error);
          }
        }
        
        // Maintain eye contact with other bot (less frequent than MVC to avoid conflicts)
        if (now - lastEyeContactUpdate > orbitConfig.eye_contact_interval) {
          // Only do manual eye contact if MVC didn't just correct it
          if (now - lastMVCUpdate > 100) {
            await lookAtBot(bot, otherBotName, orbitConfig.camera_speed);
            console.log(`[${bot.username}] Manual eye contact with ${otherBotName} while orbiting`);
          }
          lastEyeContactUpdate = now;
        }
      } else {
        console.log(`[${bot.username}] Cannot see ${otherBotName} for MVC/eye contact`);
      }
      
      // Advance angle for next orbit position
      angle += orbitConfig.speed;
      if (angle > 2 * Math.PI) {
        angle -= 2 * Math.PI; // Keep angle in [0, 2π] range
      }
      
      await sleep(orbitConfig.update_interval);
    }
  } finally {
    // Clean up pathfinder
    stopPathfinder(bot);
    
    // Log MVC statistics
    console.log(`[${bot.username}] MVC-enhanced orbit complete! Stats:`, {
      final_partner_in_fov: mvcMetadata.partner_in_fov,
      final_fov_angle: mvcMetadata.fov_angle_deg.toFixed(1),
      final_distance: mvcMetadata.distance_to_partner.toFixed(2),
      total_corrections: mvcMetadata.mvc_corrections_applied
    });
  }
}

/**
 * Get orbit phase handler function
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Function} sharedBotRng - Shared random number generator
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {number} iterationID - Iteration ID
 * @param {string} otherBotName - Other bot name
 * @param {number} episodeNum - Episode number
 * @param {Function} getOnStopPhaseFn - Stop phase function getter
 * @param {Object} args - Configuration arguments
 * @returns {Function} Orbit phase handler
 */
function getOnOrbitPhaseFn(
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
    coordinator.sendToOtherBot(
      `orbitPhase_${iterationID}`,
      bot.entity.position.clone(),
      `orbitPhase_${iterationID} beginning`
    );

    console.log(`[${bot.username}] Starting pathfinder orbit phase ${iterationID}`);
    
    // Calculate shared midpoint between both bots
    const myPosition = bot.entity.position;
    const otherPosition = otherBotPosition; // Received from coordination
    
    const sharedMidpoint = new Vec3(
      Math.round((myPosition.x + otherPosition.x) / 2),
      Math.round((myPosition.y + otherPosition.y) / 2), 
      Math.round((myPosition.z + otherPosition.z) / 2)
    );
    
    console.log(`[${bot.username}] Shared midpoint calculated: (${sharedMidpoint.x}, ${sharedMidpoint.y}, ${sharedMidpoint.z})`);
    console.log(`[${bot.username}] My position: (${myPosition.x.toFixed(1)}, ${myPosition.y.toFixed(1)}, ${myPosition.z.toFixed(1)})`);
    console.log(`[${bot.username}] ${otherBotName} position: (${otherPosition.x.toFixed(1)}, ${otherPosition.y.toFixed(1)}, ${otherPosition.z.toFixed(1)})`);
    
    // Execute the orbit behavior using pathfinder around shared midpoint
    await orbitAroundSharedMidpoint(bot, coordinator, otherBotName, sharedMidpoint, orbitConfig.duration_ms);
    
    // Transition to stop phase
    coordinator.onceEvent(
      "stopPhase",
      getOnStopPhaseFn(bot, sharedBotRng, coordinator, otherBotName)
    );
    coordinator.sendToOtherBot(
      "stopPhase",
      bot.entity.position.clone(),
      `orbitPhase_${iterationID} end`
    );
  };
}

module.exports = {
  orbitAroundSharedMidpoint,
  getOnOrbitPhaseFn
};
