/**
 * MVC test task configuration
 * @returns {Object} MVC test-specific configuration
 */
function getMVCTestConfig() {
  return {
    duration_ms: parseInt(process.env.MVC_TEST_DURATION_MS) || 10000,
    update_interval: parseInt(process.env.MVC_TEST_UPDATE_INTERVAL) || 200,
    random_movement_interval: parseInt(process.env.MVC_TEST_RANDOM_MOVEMENT_INTERVAL) || 2000,
    fov_max: parseInt(process.env.MVC_TEST_FOV_MAX) || 70,
    d_min: parseFloat(process.env.MVC_TEST_D_MIN) || 2.5,
    d_max: parseFloat(process.env.MVC_TEST_D_MAX) || 6.0,
    correction_strength: parseFloat(process.env.MVC_TEST_CORRECTION_STRENGTH) || 0.8,
  };
}

module.exports = {
  getMVCTestConfig
};
