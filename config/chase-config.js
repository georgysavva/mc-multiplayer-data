/**
 * Chase task configuration
 * @returns {Object} Chase-specific configuration
 */
function getChaseConfig() {
  return {
    duration_ms: parseInt(process.env.CHASE_DURATION_MS) || 10000,
    position_update_interval: parseInt(process.env.CHASE_POSITION_UPDATE_INTERVAL) || 500,
    min_distance: parseFloat(process.env.CHASE_MIN_DISTANCE) || 3.0,
    escape_distance: parseFloat(process.env.CHASE_ESCAPE_DISTANCE) || 8.0,
    direction_change_interval: parseInt(process.env.CHASE_DIRECTION_CHANGE_INTERVAL) || 4000,
    camera_speed: parseInt(process.env.CHASE_CAMERA_SPEED) || 90,
  };
}

module.exports = {
  getChaseConfig
};
