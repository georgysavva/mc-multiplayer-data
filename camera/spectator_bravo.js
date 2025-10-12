import { Rcon } from 'rcon-client';

const {
  RCON_HOST = '127.0.0.1',
  RCON_PORT = '25575',
  RCON_PASSWORD = 'research',
  BOT_NAME = 'Bravo',
  CAMERA_NAME = 'CameraBravo',
  SPECTATE_COMMAND = 'spectate',
  RETRIES = '15',
} = process.env;

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
      if (players.has(BOT_NAME) && players.has(CAMERA_NAME)) {
        console.log('[spectator] Both players present');
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

async function applySpectator() {
  try {
    await useRcon(async (rcon) => {
      const gm = await rcon.send(`gamemode spectator ${CAMERA_NAME}`);
      console.log('[spectator] gamemode response:', gm?.trim());

      const spectateCommand = `${SPECTATE_COMMAND} ${BOT_NAME} ${CAMERA_NAME}`;
      const spectate = await rcon.send(spectateCommand);
      console.log('[spectator] spectate response:', spectate?.trim());

      const acceptCommand = `execute as ${CAMERA_NAME} run spectate accept ${BOT_NAME}`;
      try {
        const accept = await rcon.send(acceptCommand);
        console.log('[spectator] accept response:', accept?.trim());
      } catch (err) {
        console.warn('[spectator] accept command failed:', err?.message || err);
      }
    });
    console.log('[spectator] spectator commands issued');
  } catch (err) {
    console.error('[spectator] Failed to issue spectator commands:', err?.message || err);
  }
}

async function main() {
  console.log('[spectator] waiting for server players');
  const ready = await waitForPlayers();
  if (!ready) {
    process.exit(1);
  }
  await applySpectator();
  process.exit(0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
