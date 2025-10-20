/**
 * Straight line task configuration
 * @returns {Object} Straight line-specific configuration
 */
function getStraightLineConfig() {
  return {
    walk_distance: parseInt(process.env.STRAIGHT_WALK_DISTANCE) || 8,
    look_update_interval: parseInt(process.env.STRAIGHT_LOOK_UPDATE_INTERVAL) || 50,
    camera_speed: parseInt(process.env.STRAIGHT_CAMERA_SPEED) || 180,
  };
}

module.exports = {
  getStraightLineConfig
};
