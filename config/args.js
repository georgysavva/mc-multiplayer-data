/**
 * Parse global configuration from environment variables
 * @returns {Object} Global configuration object
 */
function parseArgs() {
  return {
    // Server connection
    host: process.env.MC_HOST || "127.0.0.1",
    port: parseInt(process.env.MC_PORT) || 25565,
    rcon_host: process.env.RCON_HOST || "127.0.0.1",
    rcon_port: parseInt(process.env.RCON_PORT) || 25575,
    rcon_password: process.env.RCON_PASSWORD || "research",
    
    // Receiver connection
    receiver_host: process.env.RECEIVER_HOST || "127.0.0.1",
    receiver_port: parseInt(process.env.RECEIVER_PORT) || 8091,
    
    // Bot configuration
    bot_name: process.env.BOT_NAME || "Alpha",
    other_bot_name: process.env.OTHER_BOT_NAME || "Bravo",
    color: process.env.COLOR || "red",
    
    // Coordination
    coord_port: parseInt(process.env.COORD_PORT) || 8093,
    other_coord_host: process.env.OTHER_COORD_HOST || "127.0.0.1",
    other_coord_port: parseInt(process.env.OTHER_COORD_PORT) || 8094,
    
    // Episode configuration
    bot_rng_seed: process.env.BOT_RNG_SEED || "12345",
    episodes_num: parseInt(process.env.EPISODES_NUM) || 1,
    start_episode_id: parseInt(process.env.EPISODE_START_ID) || 0,
    run_id: parseInt(process.env.RUN_ID) || 1,
    episode_category: process.env.EPISODE_CATEGORY, // REQUIRED - no default
    
    // Episode behavior
    iterations_num_per_episode: parseInt(process.env.ITERATIONS_NUM_PER_EPISODE) || 5,
    bootstrap_wait_time: parseInt(process.env.BOOTSTRAP_WAIT_TIME) || 20,
    
    // Camera configuration
    camera_ready_retries: parseInt(process.env.CAMERA_READY_RETRIES) || 30,
    camera_ready_check_interval: parseInt(process.env.CAMERA_READY_CHECK_INTERVAL) || 2000,
    
    // Teleportation
    teleport_center_x: parseInt(process.env.TELEPORT_CENTER_X) || 0,
    teleport_center_z: parseInt(process.env.TELEPORT_CENTER_Z) || 0,
    teleport_radius: parseInt(process.env.TELEPORT_RADIUS) || 500,
    
    // Movement
    walk_timeout: parseInt(process.env.WALK_TIMEOUT) || 5,
    
    // Minecraft version
    mc_version: process.env.MC_VERSION || "1.20.4",
  };
}

module.exports = {
  parseArgs
};
