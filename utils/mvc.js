const Vec3 = require("vec3").Vec3;
const { horizontalDistanceTo, lookAtSmooth } = require('./movement');

/**
 * Mutual-Visibility Controller (MVC) - Core component for maintaining partner visibility
 * 
 * This module implements the FOV constraint system, distance buffer management,
 * and line-of-sight probing as specified in the comprehensive proposal.
 * 
 * Key Functions:
 * - FOV Constraint: ensure angle(self.viewDir, partner.pos - self.pos) < FOV_MAX
 * - Distance Buffer: maintain dist(self, partner) ∈ [D_MIN, D_MAX]
 * - LoS Probing: raycast visibility checks (optional for Phase I)
 */

// Default MVC configuration parameters
const DEFAULT_MVC_CONFIG = {
  fov_max_deg: 85,           // Maximum FOV angle in degrees
  d_min: 2.0,                // Minimum distance buffer (blocks)
  d_max: 8.0,                // Maximum distance buffer (blocks)
  enable_los_check: false,   // Enable line-of-sight raycast checks (Phase II)
  correction_strength: 0.5,  // Strength of MVC corrections (0.0 - 1.0)
  tick_interval_ms: 200,     // How often to run MVC checks
  debug_logging: true        // Enable debug logging
};

/**
 * Calculate the angle between bot's view direction and partner position
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} partnerPos - Partner's position
 * @returns {number} Angle in degrees between view direction and partner
 */
function calculateFOVAngle(bot, partnerPos) {
  const botPos = bot.entity.position;
  const botYaw = bot.entity.yaw;
  const botPitch = bot.entity.pitch;
  
  // Calculate bot's view direction vector from yaw/pitch
  const viewDir = new Vec3(
    -Math.sin(botYaw) * Math.cos(botPitch),
    -Math.sin(botPitch),
    -Math.cos(botYaw) * Math.cos(botPitch)
  );
  
  // Calculate vector from bot to partner
  const partnerVector = new Vec3(
    partnerPos.x - botPos.x,
    partnerPos.y - botPos.y,
    partnerPos.z - botPos.z
  );
  
  // Calculate angle using dot product formula: cos(θ) = (a·b) / (|a||b|)
  const dotProduct = viewDir.x * partnerVector.x + 
                    viewDir.y * partnerVector.y + 
                    viewDir.z * partnerVector.z;
  
  const viewDirMagnitude = Math.sqrt(viewDir.x * viewDir.x + 
                                   viewDir.y * viewDir.y + 
                                   viewDir.z * viewDir.z);
  
  const partnerVectorMagnitude = Math.sqrt(partnerVector.x * partnerVector.x + 
                                         partnerVector.y * partnerVector.y + 
                                         partnerVector.z * partnerVector.z);
  
  // Avoid division by zero
  if (viewDirMagnitude === 0 || partnerVectorMagnitude === 0) {
    return 180; // Maximum angle if vectors are invalid
  }
  
  const cosAngle = dotProduct / (viewDirMagnitude * partnerVectorMagnitude);
  
  // Clamp cosAngle to [-1, 1] to avoid Math.acos domain errors
  const clampedCosAngle = Math.max(-1, Math.min(1, cosAngle));
  
  // Convert from radians to degrees
  const angleRadians = Math.acos(clampedCosAngle);
  const angleDegrees = angleRadians * (180 / Math.PI);
  
  return angleDegrees;
}

/**
 * Perform line-of-sight check between bot and partner (raycast)
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} partnerPos - Partner's position
 * @returns {boolean} True if line of sight is clear
 */
function checkLineOfSight(bot, partnerPos) {
  // For Phase I (flat terrain), assume LoS is always clear
  // Phase II will implement proper raycast with bot.world.raycast()
  return true;
  
  // TODO Phase II: Implement proper raycast
  // const start = bot.entity.position.offset(0, bot.entity.height * 0.9, 0); // Eye level
  // const end = partnerPos.offset(0, 1.6, 0); // Partner eye level
  // const raycast = bot.world.raycast(start, end.minus(start).normalize(), end.distanceTo(start));
  // return raycast === null; // No block intersection means clear LoS
}

/**
 * Calculate MVC corrections based on current bot and partner state
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} partnerPos - Partner's current position
 * @param {Object} config - MVC configuration options
 * @returns {Object} MVC state and correction suggestions
 */
function calculateMVCCorrections(bot, partnerPos, config = {}) {
  const mvcConfig = { ...DEFAULT_MVC_CONFIG, ...config };
  
  const botPos = bot.entity.position;
  const distance = horizontalDistanceTo(botPos, partnerPos);
  const fovAngle = calculateFOVAngle(bot, partnerPos);
  const losOk = mvcConfig.enable_los_check ? checkLineOfSight(bot, partnerPos) : true;
  
  // Determine constraint violations
  const partnerInFOV = fovAngle <= mvcConfig.fov_max_deg;
  const distanceOk = distance >= mvcConfig.d_min && distance <= mvcConfig.d_max;
  const tooClose = distance < mvcConfig.d_min;
  const tooFar = distance > mvcConfig.d_max;
  
  // Calculate correction suggestions
  const corrections = {
    shouldLookAt: !partnerInFOV || !losOk,
    shouldMoveRight: tooClose,
    shouldMoveLeft: false, // Alternative to moveRight
    shouldMoveCloser: tooFar,
    shouldReduceSpeed: tooFar,
    correctionStrength: mvcConfig.correction_strength
  };
  
  // MVC state for metadata logging
  const mvcState = {
    partner_in_fov: partnerInFOV,
    fov_angle_deg: fovAngle,
    distance_to_partner: distance,
    distance_ok: distanceOk,
    los_ok: losOk,
    too_close: tooClose,
    too_far: tooFar,
    mvc_active: corrections.shouldLookAt || corrections.shouldMoveRight || corrections.shouldMoveCloser
  };
  
  if (mvcConfig.debug_logging && mvcState.mvc_active) {
    console.log(`[${bot.username}] MVC: FOV=${fovAngle.toFixed(1)}° (${partnerInFOV ? 'OK' : 'VIOLATION'}), ` +
                `Dist=${distance.toFixed(2)} (${distanceOk ? 'OK' : tooClose ? 'TOO_CLOSE' : 'TOO_FAR'})`);
  }
  
  return { mvcState, corrections };
}

/**
 * Execute MVC tick - main function called every update cycle
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} partnerPos - Partner's current position
 * @param {Object} config - MVC configuration options
 * @returns {Object} MVC state and applied corrections
 */
async function tickMVC(bot, partnerPos, config = {}) {
  const { mvcState, corrections } = calculateMVCCorrections(bot, partnerPos, config);
  
  // Apply corrections based on suggestions
  const appliedCorrections = {
    lookedAt: false,
    movedRight: false,
    reducedSpeed: false
  };
  
  // FOV Constraint: Look at partner if not in FOV
  if (corrections.shouldLookAt) {
    try {
      await lookAtSmooth(bot, partnerPos, 180); // Fast correction
      appliedCorrections.lookedAt = true;
      if (config.debug_logging) {
        console.log(`[${bot.username}] MVC: Applied lookAt correction`);
      }
    } catch (error) {
      console.error(`[${bot.username}] MVC lookAt error:`, error);
    }
  }
  
  // Distance Buffer: Move right if too close
  if (corrections.shouldMoveRight) {
    bot.setControlState('right', true);
    setTimeout(() => bot.setControlState('right', false), 100); // Brief lateral movement
    appliedCorrections.movedRight = true;
    if (config.debug_logging) {
      console.log(`[${bot.username}] MVC: Applied moveRight correction`);
    }
  }
  
  // Distance Buffer: Reduce speed if too far (handled by episode logic)
  if (corrections.shouldReduceSpeed) {
    appliedCorrections.reducedSpeed = true;
    // Note: Speed reduction is handled by the episode, not MVC directly
  }
  
  return {
    mvcState,
    corrections,
    appliedCorrections
  };
}

/**
 * Create MVC instance with configuration
 * @param {Object} config - MVC configuration options
 * @returns {Object} MVC instance with bound configuration
 */
function createMVC(config = {}) {
  const mvcConfig = { ...DEFAULT_MVC_CONFIG, ...config };
  
  return {
    config: mvcConfig,
    tick: async (bot, partnerPos) => tickMVC(bot, partnerPos, mvcConfig),
    calculateCorrections: (bot, partnerPos) => calculateMVCCorrections(bot, partnerPos, mvcConfig),
    calculateFOVAngle: (bot, partnerPos) => calculateFOVAngle(bot, partnerPos),
    checkLineOfSight: (bot, partnerPos) => checkLineOfSight(bot, partnerPos)
  };
}

module.exports = {
  // Main MVC functions
  tickMVC,
  calculateMVCCorrections,
  createMVC,
  
  // Utility functions
  calculateFOVAngle,
  checkLineOfSight,
  
  // Configuration
  DEFAULT_MVC_CONFIG
};
