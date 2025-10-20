/**
 * Bridge builder task configuration
 * @returns {Object} Bridge builder-specific configuration
 */
function getBridgeBuilderConfig() {
  return {
    build_duration_ms: parseInt(process.env.BRIDGE_BUILD_DURATION_MS) || 20000,
    length: parseInt(process.env.BRIDGE_LENGTH) || 8,
    block_place_interval: parseInt(process.env.BRIDGE_BLOCK_PLACE_INTERVAL) || 2000,
    eye_contact_duration: parseInt(process.env.BRIDGE_EYE_CONTACT_DURATION) || 1000,
    coordination_check_interval: parseInt(process.env.BRIDGE_COORDINATION_CHECK_INTERVAL) || 500,
    fov_max: parseInt(process.env.BRIDGE_FOV_MAX) || 120,
    d_min: parseFloat(process.env.BRIDGE_D_MIN) || 2.0,
    d_max: parseFloat(process.env.BRIDGE_D_MAX) || 10.0,
    correction_strength: parseFloat(process.env.BRIDGE_CORRECTION_STRENGTH) || 0.3,
  };
}

module.exports = {
  getBridgeBuilderConfig
};
