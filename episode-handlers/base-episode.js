const { MIN_BOTS_DISTANCE, MAX_BOTS_DISTANCE } = require("../utils/constants");

/**
 * BaseEpisode provides a common lifecycle for episodes.
 * Subclasses should override execute().
 */
class BaseEpisode {
  static INIT_MIN_BOTS_DISTANCE = MIN_BOTS_DISTANCE;
  static INIT_MAX_BOTS_DISTANCE = MAX_BOTS_DISTANCE;

  /**
   * Optional setup hook. No-op by default.
   * @returns {Promise<void>}
   */
  async setupEpisode(
    bot,
    rcon,
    sharedBotRng,
    coordinator,
    episodeNum,
    runId,
    args
  ) {}

  /**
   * Main episode logic. Must be implemented by subclasses.
   * @returns {Promise<any>}
   */
  async entryPoint(
    bot,
    sharedBotRng,
    coordinator,
    iterationID,
    episodeNum,
    getOnStopPhaseFn,
    args
  ) {
    throw new Error("entryPoint() must be implemented by subclass");
  }

  /**
   * Optional teardown hook. No-op by default.
   * @returns {Promise<void>}
   */
  async tearDownEpisode(
    bot,
    rcon,
    sharedBotRng,
    coordinator,
    episodeNum,
    runId,
    args
  ) {}
}

module.exports = { BaseEpisode };
