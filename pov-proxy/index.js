// Minimal Minecraft POV proxy
// - First downstream whose username matches BOT_NAME is the "bot"
// - Second downstream (usually CAMERA_NAME) is the "viewer"
// - One upstream connection to the real server (host:port)
// - All upstream->downstream packets are duplicated to bot + viewer
// - Only bot->upstream packets are forwarded; viewer->upstream are ignored

const mc = require("minecraft-protocol");

const VERSION = process.env.MC_VERSION || "1.20.4";
// New: separate ports for bot and viewer. Defaults keep backward compatibility.
const BOT_PROXY_PORT = Number(
  process.env.BOT_PROXY_PORT || process.env.PROXY_PORT || 25570
);
const VIEWER_PROXY_PORT = Number(
  process.env.VIEWER_PROXY_PORT || BOT_PROXY_PORT + 1
);
const UPSTREAM_HOST = process.env.UPSTREAM_HOST || "127.0.0.1";
const UPSTREAM_PORT = Number(process.env.UPSTREAM_PORT || 25565);

// Optional names help the proxy auto-assign roles. If not set, first = bot, second = viewer.
const BOT_NAME = process.env.BOT_NAME || null;
const VIEWER_NAME = process.env.CAMERA_NAME || null;

// If true, the proxy waits for BOTH bot and viewer before connecting upstream.
// If false, it starts as soon as the bot connects (viewer can join later but may desync).
const REQUIRE_VIEWER_BEFORE_START =
  String(process.env.REQUIRE_VIEWER || "0") === "1";

let botClient = null; // downstream: mineflayer
let viewClient = null; // downstream: official client
let upstream = null; // upstream: real server connection
let started = false;

function log(...args) {
  console.log("[POV-PROXY]", ...args);
}

function wrapClientWrite(client, label) {
  if (!client || client.__writeWrapped) return;
  const originalWrite = client.write && client.write.bind(client);
  if (!originalWrite) return;
  client.write = (packetName, packetData) => {
    try {
      log(`[${label}] write ->`, packetName, packetData);
    } catch (_) {}
    return originalWrite(packetName, packetData);
  };
  client.__writeWrapped = true;
}

// Two thin servers to distinguish roles by port instead of username
const botServer = mc.createServer({
  "online-mode": false,
  version: VERSION,
  port: BOT_PROXY_PORT,
  host: "0.0.0.0",
});
const viewerServer = mc.createServer({
  "online-mode": false,
  version: VERSION,
  port: VIEWER_PROXY_PORT,
  host: "0.0.0.0",
});

function endAll(reason) {
  if (upstream) {
    upstream.end(reason);
    upstream = null;
  }
  if (botClient) {
    botClient.end(reason);
    botClient = null;
  }
  if (viewClient) {
    viewClient.end(reason);
    viewClient = null;
  }
  started = false;
  log("Closed all:", reason);
}

function describe(c) {
  return c ? `${c.username} [${c.remoteAddress || "??"}]` : "none";
}

function tryStartUpstream() {
  if (started) return;
  if (!botClient) return;
  if (REQUIRE_VIEWER_BEFORE_START && !viewClient) return;

  log(
    "Connecting upstream to",
    `${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
    "as",
    botClient.username
  );
  upstream = mc.createClient({
    host: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    username: botClient.username, // the actual player on the real server
    version: VERSION,
    "online-mode": false,
  });

  // Log everything written to upstream
  wrapClientWrite(upstream, "UPSTREAM");

  // Forward BOT -> upstream (only once both sides are in PLAY state)
  botClient.on("packet", (data, meta) => {
    try {
      if (!upstream) {
        log("Skipping packet (upstream not connected):", meta, data);
        return;
      }
      // Do not forward downstream keep-alives; upstream is answered locally.
      if (meta && meta.name === "keep_alive") {
        botClient.write("keep_alive", data);
        return;
      }
      // Only forward PLAY-state packets upstream
      if (meta.state !== mc.states.PLAY) {
        log("Skipping non-play packet to upstream:", meta, data);
        return;
      }
      if (upstream.state !== mc.states.PLAY) {
        log("Skipping packet (upstream not in PLAY state):", meta, data);
        return;
      }
      // Optional: quiet logs; uncomment if needed for debugging
      // log("Forwarding packet to upstream:", meta.name, data);
      log("Forwarding packet to upstream:", meta, data);
      // upstream.write(meta.name, data);
    } catch (e) {
      log("BOT->UP error", meta, e.message);
    }
  });

  // DROP all VIEWER -> upstream (except allow client settings so UI works locally)
  if (viewClient) {
    viewClient.on("packet", (data, meta) => {
      // Accept a few harmless packets to keep the client happy (we still drop them)
      // e.g., client_settings, plugin_message, keep_alive, teleport_confirm, etc.
      // Intentionally no upstream forwarding here.
      log("Skipping packet (viewer -> upstream):", meta, data);
    });
  }

  // Fan out UPSTREAM -> BOT + VIEWER
  upstream.on("packet", (data, meta) => {
    try {
      // Handle special packets locally and do not forward between ends.
      if (meta && meta.name === "keep_alive") {
        // Reply to upstream ourselves to avoid relying on downstream.
        upstream.write("keep_alive", data);
        // Also deliver keep_alive to downstream clients so they keep their
        // own heartbeats alive with us (the proxy-as-server).
        return;
      }
      if (meta && meta.name === "compress") {
        // Sync compression thresholds across all links.
        const threshold =
          data && typeof data.threshold === "number"
            ? data.threshold
            : undefined;
        if (typeof threshold === "number") {
          upstream.compressionThreshold = threshold;
          if (botClient) botClient.compressionThreshold = threshold;
          if (viewClient) viewClient.compressionThreshold = threshold;
        }
        return; // do not forward compression packet
      }

      if (meta.state !== mc.states.PLAY) {
        log("Skipping non-play packet to downstream:", meta, data);
        return;
      }
      if (botClient.state !== mc.states.PLAY) {
        log("Skipping packet (bot not in PLAY state):", meta, data);
        return;
      }
      log("Forwarding packet to downstream:", meta, data);
      if (botClient) botClient.write(meta.name, data);
      if (viewClient) viewClient.write(meta.name, data);
    } catch (e) {
      log("UP->DN error", meta, e.message);
    }
  });

  // Logging and cleanup
  const safeEnd = (who, err) => {
    log(`${who} ended`, err ? err.message : "");
    endAll(`${who} ended`);
  };

  upstream.on("end", () => log("UPSTREAM ended"));
  upstream.on("error", (e) => safeEnd("UPSTREAM ERROR", e));
  botClient.on("end", () => safeEnd("BOT"));
  botClient.on("error", (e) => safeEnd("BOT ERROR", e));
  if (viewClient) {
    viewClient.on("end", () => log("VIEWER ended (bot continues)."));
    viewClient.on("error", (e) => log("VIEWER error:", e.message));
  }

  started = true;
  log("Upstream connected. Mirroring packets now.");
}

// Assign roles when clients log in — distinguished by which server they use
botServer.on("login", (client) => {
  client.on("error", (e) => log("BOT DS error", client.username, e.message));
  client.on("end", () => log("BOT DS end", client.username));

  if (botClient) {
    log("Rejecting extra bot:", client.username);
    client.end("Bot already connected.");
    return;
  }
  botClient = client;
  wrapClientWrite(botClient, "BOT");
  log("BOT connected:", describe(botClient));
  tryStartUpstream();
});

viewerServer.on("login", (client) => {
  client.on("error", (e) => log("VIEWER DS error", client.username, e.message));
  client.on("end", () => log("VIEWER DS end", client.username));

  if (viewClient) {
    log("Rejecting extra viewer:", client.username);
    client.end("Viewer already connected.");
    return;
  }
  viewClient = client;
  log("VIEWER connected:", describe(viewClient));

  tryStartUpstream();
});

botServer.on("listening", () => {
  log(`Bot port listening on 0.0.0.0:${BOT_PROXY_PORT} (version ${VERSION})`);
});
viewerServer.on("listening", () => {
  log(
    `Viewer port listening on 0.0.0.0:${VIEWER_PROXY_PORT} (version ${VERSION})`
  );
  log(
    `Bot name (for upstream identity): ${
      BOT_NAME || "<downstream username>"
    }, Viewer name: ${VIEWER_NAME || "<downstream username>"}`
  );
  log(`Require viewer before start: ${REQUIRE_VIEWER_BEFORE_START}`);
});
