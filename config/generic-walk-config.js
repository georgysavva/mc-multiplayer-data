/**
 * Generic walk task configuration
 * @returns {Object} Generic walk-specific configuration
 */
function getGenericWalkConfig() {
  return {
    min_run_actions: parseInt(process.env.GENERIC_MIN_RUN_ACTIONS) || 3,
    max_run_actions: parseInt(process.env.GENERIC_MAX_RUN_ACTIONS) || 5,
  };
}

module.exports = {
  getGenericWalkConfig
};
