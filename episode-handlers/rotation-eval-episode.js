const { lookAtSmooth, sneak, lookSmooth } = require("../utils/movement");
const { BaseEpisode } = require("./base-episode");
const { Vec3 } = require("vec3");

// const {
//   DEFAULT_CAMERA_SPEED_DEGREES_PER_SEC,
// } = require("../utils/constants");
const THIS_CAMERA_SPEED_DEGREES_PER_SEC = 30;
const EPISODE_MIN_TICKS = 300;

function getOnRotatePhaseFn(
  bot,
  rcon,
  sharedBotRng,
  coordinator,
  episodeNum,
  episodeInstance,
  args
) {
  return async (otherBotPosition) => {
    coordinator.sendToOtherBot(
      "rotatePhase",
      bot.entity.position.clone(),
      episodeNum,
      "rotatePhase beginning"
    );

    // Determine which rotation method to use based on episode number
    // Episodes 0-5: lookAtSmooth/lookSmooth
    // Episodes 6-11: bot.lookAt/bot.look without easing
    // Episodes 12+: bot.lookAt/bot.look with easing
    const rotationMethod = episodeNum < 6 ? 'smooth' : (episodeNum < 12 ? 'bot_look_no_easing' : 'bot_look_with_easing');
    const useBotLookMethod = episodeNum >= 6;
    const useEasing = episodeNum >= 12;

    // Look at the other bot smoothly at the start of the phase
    if (useBotLookMethod) {
      // bot.lookAt requires a Vec3 object with a .minus method
      const targetVec3 = new Vec3(otherBotPosition.x, otherBotPosition.y + bot.entity.eyeHeight, otherBotPosition.z);
      await bot.lookAt(targetVec3, false, THIS_CAMERA_SPEED_DEGREES_PER_SEC, THIS_CAMERA_SPEED_DEGREES_PER_SEC, useEasing);
    } else {
      await lookAtSmooth(bot, otherBotPosition, THIS_CAMERA_SPEED_DEGREES_PER_SEC);
    }

    // Determine which bot rotates and by how much based on episodeNum % 6
    // 0: Alpha +45, 1: Alpha -45, 2: Alpha 180
    // 3: Bravo +45, 4: Bravo -45, 5: Bravo 180
    const caseNum = episodeNum % 6;
    const alphaShouldRotate = caseNum < 3;
    const bravoShouldRotate = caseNum >= 3;
    
    const rotationAngles = [40, -40, 180, 40, -40, 180];
    const rotationDegrees = rotationAngles[caseNum];
    
    const shouldThisBotRotate = 
      (bot.username < args.other_bot_name && alphaShouldRotate) ||
      (bot.username > args.other_bot_name && bravoShouldRotate);
    
    // Determine which bot name is chosen to rotate
    const botChosen = alphaShouldRotate
      ? (bot.username < args.other_bot_name ? bot.username : args.other_bot_name)
      : (bot.username > args.other_bot_name ? bot.username : args.other_bot_name);
    
    // Store eval metadata
    episodeInstance._evalMetadata = {
      bots_chosen: [botChosen],
      rotation_degrees: rotationDegrees,
      camera_speed_degrees_per_sec: THIS_CAMERA_SPEED_DEGREES_PER_SEC,
      case_num: caseNum,
      rotation_method: rotationMethod,
    };

    const methodDescription = rotationMethod === 'smooth' 
      ? 'lookSmooth' 
      : (rotationMethod === 'bot_look_no_easing' 
        ? 'bot.look/lookAt without easing' 
        : 'bot.look/lookAt with easing');

    console.log(
      `[${bot.username}] Episode ${episodeNum} case ${caseNum}: will ${
        shouldThisBotRotate ? `rotate ${rotationDegrees} degrees` : "stay still"
      } (using ${methodDescription})`
    );

    if (shouldThisBotRotate) {
      // Sneak to signal evaluation start
      await sneak(bot);
      // Record tick number
      const startTick = bot.time.age;
      
      // Calculate target position for the rotation
      const originalYaw = bot.entity.yaw;
      const originalPitch = bot.entity.pitch;
      const newYaw = originalYaw + (rotationDegrees * Math.PI / 180);
      
      console.log(`[${bot.username}] Rotating from ${(originalYaw * 180 / Math.PI).toFixed(1)}° to ${(newYaw * 180 / Math.PI).toFixed(1)}°`);
      
      if (useBotLookMethod) {
        await bot.look(newYaw, originalPitch, false, THIS_CAMERA_SPEED_DEGREES_PER_SEC, THIS_CAMERA_SPEED_DEGREES_PER_SEC, useEasing);
      } else {
        await lookSmooth(bot, newYaw, originalPitch, THIS_CAMERA_SPEED_DEGREES_PER_SEC);
      }
      
      // Record tick number
      const endTick = bot.time.age;
      const remainingTicks = EPISODE_MIN_TICKS - (endTick - startTick);
      if (remainingTicks > 0) {
        console.log(`[${bot.username}] Waiting ${remainingTicks} more ticks to reach ${EPISODE_MIN_TICKS} total ticks`);
        await bot.waitForTicks(remainingTicks);
      } else {
        console.log(`[${bot.username}] Already passed ${EPISODE_MIN_TICKS} ticks (elapsed: ${endTick - startTick})`);
      }
    }

    // Setup stop phase
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
      "rotatePhase end"
    );
  };
}

class RotationEvalEpisode extends BaseEpisode {
  static WORKS_IN_NON_FLAT_WORLD = true;
  static INIT_MIN_BOTS_DISTANCE = 10;
  static INIT_MAX_BOTS_DISTANCE = 12;

  async setupEpisode(bot, rcon, sharedBotRng, coordinator, episodeNum, args) {
    // optional setup
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
      "rotatePhase",
      episodeNum,
      getOnRotatePhaseFn(
        bot,
        rcon,
        sharedBotRng,
        coordinator,
        episodeNum,
        this,
        args
      )
    );
    coordinator.sendToOtherBot(
      "rotatePhase",
      bot.entity.position.clone(),
      episodeNum,
      "teleportPhase end"
    );
  }
}

module.exports = {
  getOnRotatePhaseFn,
  RotationEvalEpisode,
};

