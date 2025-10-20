/**
 * Orbit task configuration
 * @returns {Object} Orbit-specific configuration
 */
function getOrbitConfig() {
  return {
    duration_ms: parseInt(process.env.ORBIT_DURATION_MS) || 15000,
    update_interval: parseInt(process.env.ORBIT_UPDATE_INTERVAL) || 200,
    radius: parseFloat(process.env.ORBIT_RADIUS) || 5.0,
    speed: parseFloat(process.env.ORBIT_SPEED) || 0.10,
    camera_speed: parseInt(process.env.ORBIT_CAMERA_SPEED) || 90,
    eye_contact_interval: parseInt(process.env.ORBIT_EYE_CONTACT_INTERVAL) || 500,
    fov_max: parseInt(process.env.ORBIT_FOV_MAX) || 90,
    d_min: parseFloat(process.env.ORBIT_D_MIN) || 3.0,
    d_max: parseFloat(process.env.ORBIT_D_MAX) || 8.0,
    correction_strength: parseFloat(process.env.ORBIT_CORRECTION_STRENGTH) || 0.3,
  };
}

module.exports = {
  getOrbitConfig
};
