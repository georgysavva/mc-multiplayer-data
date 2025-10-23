const Vec3 = require("vec3").Vec3;
const { Movements, GoalNear } = require('../utils/bot-factory');
const { 
  stopAll, 
  lookAtBot,
  sleep,
  initializePathfinder,
  stopPathfinder
} = require('../utils/movement');

// Constants for orbit behavior
const ORBIT_DURATION_MS = 25000; // 25 seconds of orbiting
const NUM_CHECKPOINTS = 12; // 12 checkpoints around the circle (30° apart)
const CHECKPOINT_REACH_DISTANCE = 1.5; // How close to get to checkpoint (blocks)
const LOOK_WAIT_MS = 0; // No wait before/after looking (removed for fluid motion)
const RECORDING_DELAY_MS = 500; // Reduced from 2000ms - enough for recording to stabilize
const INITIAL_EYE_CONTACT_MS = 300; // Reduced from 1000ms - enough to capture the moment
const CHECKPOINT_POLL_MS = 50; // Reduced from 100ms - faster response time

/**
 * Calculate checkpoints around a circle
 * @param {Vec3} center - Center point of the circle
 * @param {number} radius - Radius of the circle
 * @param {number} numPoints - Number of checkpoints to generate
 * @returns {Array<Vec3>} Array of checkpoint positions
 */
function generateCircleCheckpoints(center, radius, numPoints) {
  const checkpoints = [];
  const angleStep = (2 * Math.PI) / numPoints; // Radians between each checkpoint
  
  for (let i = 0; i < numPoints; i++) {
    const angle = i * angleStep;
    const x = center.x + radius * Math.cos(angle);
    const z = center.z + radius * Math.sin(angle);
    checkpoints.push(new Vec3(x, center.y, z));
  }
  
  return checkpoints;
}

/**
 * Wait until bot reaches a checkpoint or timeout
 * @param {Bot} bot - Mineflayer bot instance
 * @param {Vec3} checkpoint - Target checkpoint position
 * @param {number} maxWaitMs - Maximum time to wait (milliseconds)
 * @returns {Promise<boolean>} True if reached, false if timeout
 */
async function waitUntilReachedCheckpoint(bot, checkpoint, maxWaitMs = 10000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const currentPos = bot.entity.position;
    const distance = currentPos.distanceTo(checkpoint);
    
    if (distance <= CHECKPOINT_REACH_DISTANCE) {
      console.log(`[${bot.username}] Reached checkpoint at (${checkpoint.x.toFixed(1)}, ${checkpoint.y.toFixed(1)}, ${checkpoint.z.toFixed(1)})`);
      return true;
    }
    
    await sleep(CHECKPOINT_POLL_MS); // Check every 50ms
  }
  
  console.log(`[${bot.username}] Timeout waiting for checkpoint`);
  return false;
}

/**
 * Make both bots orbit around their shared midpoint using checkpoints
 * @param {Bot} bot - Mineflayer bot instance
 * @param {BotCoordinator} coordinator - Bot coordinator instance
 * @param {string} otherBotName - Name of the other bot
 * @param {Vec3} sharedMidpoint - Shared orbit center between both bots
 * @param {number} radius - Orbit radius
 * @param {number} durationMs - Duration to orbit in milliseconds
 */
async function orbitAroundSharedMidpoint(bot, coordinator, otherBotName, sharedMidpoint, radius, durationMs) {
  console.log(`[${bot.username}] Starting checkpoint-based orbit around midpoint (${sharedMidpoint.x.toFixed(1)}, ${sharedMidpoint.y.toFixed(1)}, ${sharedMidpoint.z.toFixed(1)})`);
  console.log(`[${bot.username}] Orbit radius: ${radius.toFixed(2)} blocks, ${NUM_CHECKPOINTS} checkpoints, ${durationMs/1000}s duration`);
  
  // Initialize pathfinder
  initializePathfinder(bot, {
    allowSprinting: false,
    allowParkour: false,
    canDig: false,
    allowEntityDetection: true
  });
  
  console.log(`[${bot.username}] Pathfinder initialized for orbit`);
  
  // Generate checkpoints around the circle
  const checkpoints = generateCircleCheckpoints(sharedMidpoint, radius, NUM_CHECKPOINTS);
  console.log(`[${bot.username}] Generated ${checkpoints.length} checkpoints around circle`);
  
  // Determine starting checkpoint based on bot name (opposite sides)
  // Alpha starts at checkpoint 0, Bravo starts at checkpoint 6 (180° apart)
  let currentCheckpointIndex;
  if (bot.username.toLowerCase().includes('alpha')) {
    currentCheckpointIndex = 0;
    console.log(`[${bot.username}] Alpha bot starting at checkpoint 0 (0°)`);
  } else if (bot.username.toLowerCase().includes('bravo')) {
    currentCheckpointIndex = 6; // NUM_CHECKPOINTS / 2 = 6 (opposite side)
    console.log(`[${bot.username}] Bravo bot starting at checkpoint 6 (180°)`);
  } else {
    // Fallback for other bot names
    currentCheckpointIndex = 0;
    console.log(`[${bot.username}] Unknown bot name, defaulting to checkpoint 0`);
  }
  
  const startTime = Date.now();
  let checkpointsVisited = 0;
  
  try {
    while (Date.now() - startTime < durationMs) {
      const checkpoint = checkpoints[currentCheckpointIndex];
      
      console.log(`[${bot.username}] Moving to checkpoint ${currentCheckpointIndex}/${NUM_CHECKPOINTS - 1} at (${checkpoint.x.toFixed(1)}, ${checkpoint.z.toFixed(1)})`);
      
      // Move to checkpoint using pathfinder
      bot.pathfinder.setGoal(new GoalNear(checkpoint.x, checkpoint.y, checkpoint.z, CHECKPOINT_REACH_DISTANCE));
      
      // Wait until checkpoint is reached or timeout
      const reached = await waitUntilReachedCheckpoint(bot, checkpoint, 8000);
      
      if (reached) {
        checkpointsVisited++;
        
        // Stop movement
        stopPathfinder(bot);
        console.log(`[${bot.username}] 🛑 Stopped at checkpoint ${currentCheckpointIndex}`);
        
        // Look at other bot
        console.log(`[${bot.username}] 👀 Looking at ${otherBotName}...`);
        try {
          await lookAtBot(bot, otherBotName, 180);
          console.log(`[${bot.username}] ✅ Eye contact established with ${otherBotName}`);
        } catch (lookError) {
          console.log(`[${bot.username}] ⚠️ Failed to look at ${otherBotName}: ${lookError.message}`);
        }
        
        // Move to next checkpoint (clockwise)
        currentCheckpointIndex = (currentCheckpointIndex + 1) % NUM_CHECKPOINTS;
        
        // Set next goal IMMEDIATELY to avoid idle time
        const nextCheckpoint = checkpoints[currentCheckpointIndex];
        bot.pathfinder.setGoal(new GoalNear(nextCheckpoint.x, nextCheckpoint.y, nextCheckpoint.z, CHECKPOINT_REACH_DISTANCE));
        console.log(`[${bot.username}] 🚀 Moving to next checkpoint ${currentCheckpointIndex}`);
      } else {
        console.log(`[${bot.username}] ⚠️ Skipping to next checkpoint due to timeout`);
        currentCheckpointIndex = (currentCheckpointIndex + 1) % NUM_CHECKPOINTS;
      }
      
      // Check if time is up
      if (Date.now() - startTime >= durationMs) {
        console.log(`[${bot.username}] Orbit duration complete`);
        break;
      }
    }
  } finally {
    // Clean up pathfinder
    stopPathfinder(bot);
    
    // Log statistics
    const duration = Date.now() - startTime;
    console.log(`[${bot.username}] Orbit complete! Stats:`);
    console.log(`[${bot.username}]    Duration: ${(duration/1000).toFixed(1)}s`);
    console.log(`[${bot.username}]    Checkpoints visited: ${checkpointsVisited}`);
    console.log(`[${bot.username}]    Average time per checkpoint: ${checkpointsVisited > 0 ? (duration/checkpointsVisited/1000).toFixed(1) : 'N/A'}s`);
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
    const startTime = Date.now();
    console.log(`[${bot.username}] ORBIT EPISODE STARTING - Episode ${episodeNum}, Iteration ${iterationID}`);
    console.log(`[${bot.username}] Episode start time: ${new Date(startTime).toISOString()}`);
    
    coordinator.sendToOtherBot(
      `orbitPhase_${iterationID}`,
      bot.entity.position.clone(),
      `orbitPhase_${iterationID} beginning`
    );

    console.log(`[${bot.username}] Starting orbit phase ${iterationID}`);
    
    // STEP 1: Bots spawn (already done by teleport phase)
    console.log(`[${bot.username}] STEP 1: Bot spawned`);
    
    // Strategic delay to ensure recording has fully started
    const recordingDelay = RECORDING_DELAY_MS; // 500ms
    console.log(`[${bot.username}] Waiting ${recordingDelay}ms for recording to stabilize...`);
    await sleep(recordingDelay);
    
    // STEP 2: Both bots look at each other
    console.log(`[${bot.username}] STEP 2: Looking at other bot...`);
    try {
      await lookAtBot(bot, otherBotName, 180);
      console.log(`[${bot.username}] Initial eye contact established with ${otherBotName}`);
      await sleep(INITIAL_EYE_CONTACT_MS); // Hold eye contact for 300ms
    } catch (lookError) {
      console.log(`[${bot.username}] Failed initial look: ${lookError.message}`);
    }
    
    // STEP 3: Get coordinates
    const myPosition = bot.entity.position.clone();
    const otherPosition = otherBotPosition; // Received from coordination
    
    console.log(`[${bot.username}] STEP 3: Got coordinates`);
    console.log(`[${bot.username}]    My position: (${myPosition.x.toFixed(1)}, ${myPosition.y.toFixed(1)}, ${myPosition.z.toFixed(1)})`);
    console.log(`[${bot.username}]    ${otherBotName} position: (${otherPosition.x.toFixed(1)}, ${otherPosition.y.toFixed(1)}, ${otherPosition.z.toFixed(1)})`);
    
    // STEP 4: Calculate shared midpoint between both bots
    const sharedMidpoint = new Vec3(
      (myPosition.x + otherPosition.x) / 2,
      (myPosition.y + otherPosition.y) / 2, 
      (myPosition.z + otherPosition.z) / 2
    );
    
    console.log(`[${bot.username}] STEP 4: Calculated shared midpoint: (${sharedMidpoint.x.toFixed(1)}, ${sharedMidpoint.y.toFixed(1)}, ${sharedMidpoint.z.toFixed(1)})`);
    
    // STEP 5 & 6: Calculate orbit radius and generate checkpoints
    const initialDistance = myPosition.distanceTo(otherPosition);
    const orbitRadius = initialDistance / 2;
    
    console.log(`[${bot.username}] STEP 5: Initial distance between bots: ${initialDistance.toFixed(2)} blocks`);
    console.log(`[${bot.username}] STEP 6: Calculated orbit radius: ${orbitRadius.toFixed(2)} blocks`);
    console.log(`[${bot.username}] Generating ${NUM_CHECKPOINTS} checkpoints around circle...`);
    
    // STEP 7-9: Execute the orbit behavior using checkpoints
    console.log(`[${bot.username}] STEP 7-9: Beginning checkpoint-based orbit...`);
    await orbitAroundSharedMidpoint(bot, coordinator, otherBotName, sharedMidpoint, orbitRadius, ORBIT_DURATION_MS);
    
    // STEP 10: Episode ends
    console.log(`[${bot.username}] STEP 10: Episode ending...`);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`[${bot.username}] Orbit episode completed in ${duration}ms`);
    console.log(`[${bot.username}] Episode end time: ${new Date(endTime).toISOString()}`);
    
    // Transition to stop phase
    console.log(`[${bot.username}] Transitioning to stop phase...`);
    coordinator.onceEvent(
      "stopPhase",
      getOnStopPhaseFn(bot, sharedBotRng, coordinator, otherBotName)
    );
    coordinator.sendToOtherBot(
      "stopPhase",
      bot.entity.position.clone(),
      `orbitPhase_${iterationID} end`
    );
    
    console.log(`[${bot.username}] Orbit phase ${iterationID} transition complete`);
  };
}

module.exports = {
  orbitAroundSharedMidpoint,
  getOnOrbitPhaseFn
};
