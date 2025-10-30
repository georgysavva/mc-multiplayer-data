import { Rcon } from 'rcon-client';

const {
  RCON_HOST = '127.0.0.1',
  RCON_PORT = '25575',
  RCON_PASSWORD = 'research',
  BOT_NAME = 'Alpha',
  CAMERA_NAME = 'CameraAlpha',
  REQUIRED_PLAYERS = '',
  EPISODE_COMMAND = 'episode start 1_technoblade.png 1_technoblade.png',
  SKIN = '',
  RETRIES = '15',
} = process.env;

const requiredPlayers = parsePlayers(REQUIRED_PLAYERS, BOT_NAME, CAMERA_NAME);
const maxAttempts = Number(RETRIES);
const retryDelayMs = 2000;

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
      console.warn('[spectator] failed to close RCON connection:', err?.message || err);
    }
  }
}

async function waitForPlayers() {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const list = await useRcon((rcon) => rcon.send('list'));
      const players = extractPlayers(list);
      if (requiredPlayers.every((name) => players.has(name))) {
        console.log('[spectator] Required players present:', requiredPlayers.join(', '));
        return true;
      }
      console.log(
        `[spectator] Waiting for players (attempt ${attempt}/${maxAttempts}): ${Array.from(players).join(', ')}`
      );
    } catch (err) {
      console.warn('[spectator] Failed to query player list:', err?.message || err);
    }
    await sleep(retryDelayMs);
  }
  console.error('[spectator] Players never appeared; giving up');
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

async function triggerEpisode() {
  const episodeArgs = EPISODE_COMMAND;
  try {
    const response = await useRcon((rcon) => rcon.send(episodeArgs));
    console.log('[spectator] episode command response:', response?.trim());
  } catch (err) {
    console.error('[spectator] Failed to issue episode command:', err?.message || err);
  }
}

async function main() {
  console.log('[spectator] waiting for server players');
  const ready = await waitForPlayers();
  if (!ready) {
    process.exit(1);
  }
  await triggerEpisode();
  process.exit(0);
}

function parsePlayers(rawList, defaultA, defaultB) {
  const provided = (rawList || '')
    .split(/[, ]+/)
    .map((name) => name.trim())
    .filter(Boolean);
  if (provided.length > 0) {
    return provided;
  }
  return Array.from(new Set([defaultA, defaultB].filter(Boolean)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
