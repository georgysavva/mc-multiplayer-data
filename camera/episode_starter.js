import { Rcon } from 'rcon-client';
import { readFileSync, existsSync } from 'fs';

const {
  RCON_HOST = '127.0.0.1',
  RCON_PORT = '25575',
  RCON_PASSWORD = 'research',
  EPISODE_REQUIRED_PLAYERS = '',
  EPISODE_START_COMMAND = 'episode start',
  EPISODE_START_RETRIES = '15',
  EPISODE_PLAYER_CHECK_INTERVAL_MS = '2000',
  // Demo mode camera configuration
  DEMO_CAMERA_POSITIONS_FILE = '',
  DEMO_CAMERA_NAME = 'CameraDemo',
  EPISODE_START_ID = '0',
} = process.env;

const requiredPlayers = parsePlayers(EPISODE_REQUIRED_PLAYERS);
const maxAttempts = Number(EPISODE_START_RETRIES);
const retryDelayMs = Number(EPISODE_PLAYER_CHECK_INTERVAL_MS) || 2000;
const episodeStartId = Number(EPISODE_START_ID) || 0;

// Load demo camera positions if configured
let demoCameraPositions = [];
if (DEMO_CAMERA_POSITIONS_FILE && existsSync(DEMO_CAMERA_POSITIONS_FILE)) {
  try {
    const content = readFileSync(DEMO_CAMERA_POSITIONS_FILE, 'utf-8');
    demoCameraPositions = JSON.parse(content);
    console.log(`[episode-starter] Loaded ${demoCameraPositions.length} demo camera positions from ${DEMO_CAMERA_POSITIONS_FILE}`);
  } catch (err) {
    console.warn(`[episode-starter] Failed to load demo camera positions: ${err.message}`);
  }
}

async function connect() {
  return Rcon.connect({
    host: RCON_HOST,
    port: Number(RCON_PORT),
    password: RCON_PASSWORD,
  });
}

async function useRcon(task) {
  const rcon = await connect();
  try {
    return await task(rcon);
  } finally {
    try {
      await rcon.end();
    } catch (err) {
      console.warn('[episode-starter] failed to close RCON connection:', err?.message || err);
    }
  }
}

async function waitForPlayers() {
  if (requiredPlayers.length === 0) {
    console.log('[episode-starter] No required players configured; continuing immediately');
    return true;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const list = await useRcon((rcon) => rcon.send('list'));
      const players = extractPlayers(list);
      if (requiredPlayers.every((name) => players.has(name))) {
        console.log('[episode-starter] Required players present:', requiredPlayers.join(', '));
        return true;
      }
      console.log(
        `[episode-starter] Waiting for players (attempt ${attempt}/${maxAttempts}): ${Array.from(players).join(', ')}`
      );
    } catch (err) {
      console.warn('[episode-starter] Failed to query player list:', err?.message || err);
    }
    await sleep(retryDelayMs);
  }
  console.error('[episode-starter] Players never appeared; giving up');
  return false;
}

function extractPlayers(listResponse) {
  const players = new Set();
  const match = listResponse.match(/: (.*)$/);
  if (!match) {
    return players;
  }
  const namesSection = match[1].trim();
  if (!namesSection) {
    return players;
  }
  for (const name of namesSection.split(',').map((n) => n.trim())) {
    if (name) {
      players.add(name);
    }
  }
  return players;
}

async function triggerCommand() {
  let command = EPISODE_START_COMMAND.trim();
  if (!command) {
    console.log('[episode-starter] No command configured; nothing to send');
    return;
  }

  // Append demo camera args if positions are configured
  // Format: demoCamera <name> <spawnX> <spawnY> <spawnZ> <camX> <camY> <camZ> <yaw> <pitch>
  // yaw comes before pitch to match Minecraft's /tp command format
  if (demoCameraPositions.length > 0) {
    const posIndex = episodeStartId % demoCameraPositions.length;
    const entry = demoCameraPositions[posIndex];
    const spawn = entry.spawn;
    const cam = entry.camera;
    const demoCameraArgs = `demoCamera ${DEMO_CAMERA_NAME} ${spawn.x} ${spawn.y} ${spawn.z} ${cam.x} ${cam.y} ${cam.z} ${cam.yaw} ${cam.pitch}`;
    command = `${command} ${demoCameraArgs}`;
    console.log(`[episode-starter] Using position ${posIndex}: spawn=(${spawn.x}, ${spawn.y}, ${spawn.z}), camera=(${cam.x}, ${cam.y}, ${cam.z}) yaw=${cam.yaw} pitch=${cam.pitch}`);
  }

  try {
    const response = await useRcon((rcon) => rcon.send(command));
    console.log('[episode-starter] command response:', response?.trim());
  } catch (err) {
    console.error('[episode-starter] Failed to issue command:', err?.message || err);
  }
}

async function main() {
  console.log('[episode-starter] waiting for server players');
  const ready = await waitForPlayers();
  if (!ready) {
    process.exit(1);
  }
  await triggerCommand();
  process.exit(0);
}

function parsePlayers(rawList) {
  return Array.from(
    new Set(
      (rawList || '')
        .split(/[, ]+/)
        .map((name) => name.trim())
        .filter(Boolean)
    )
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
