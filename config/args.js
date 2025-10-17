const minimist = require("minimist");

/**
 * Parse command line arguments with default values
 * @returns {Object} Parsed arguments object
 */
function parseArgs() {
  return minimist(process.argv.slice(2), {
    default: {
      host: "127.0.0.1",
      port: 25565,
      rcon_host: "127.0.0.1",
      rcon_port: 25575,
      receiver_host: "127.0.0.1",
      receiver_port: 8091,
      bot_name: "Alpha",
      other_bot_name: "Bravo",
      coord_port: 8093,
      other_coord_host: "127.0.0.1",
      other_coord_port: 8094,
      iterations_num_per_episode: 3,
      bot_rng_seed: "12345",
      episodes_num: 1,
      start_episode_id: 0,
      run_id: 1,
      color: "red", // default color name
      bootstrap_wait_time: 0,
      teleport_center_x: 0,
      teleport_center_z: 0,
      teleport_radius: 500,
      walk_timeout: 5, // walk timeout in seconds
      mc_version: process.env.MC_VERSION || "1.20.4",
    },
  });
}

module.exports = {
  parseArgs
};
