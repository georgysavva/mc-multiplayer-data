// Bare TCP POV proxy
// - First downstream to connect is the "bot"
// - Second downstream is the "viewer"
// - One upstream TCP connection to the real server (host:port)
// - All upstream->downstream bytes are duplicated to bot + viewer
// - Only bot->upstream bytes are forwarded; viewer->upstream are ignored
// - If bot sends before upstream is ready, buffer and flush on connect

const net = require("net");

const BOT_PROXY_PORT = Number(
  process.env.BOT_PROXY_PORT || process.env.PROXY_PORT || 25570
);
const VIEWER_PROXY_PORT = Number(
  process.env.VIEWER_PROXY_PORT || BOT_PROXY_PORT + 1
);
const UPSTREAM_HOST = process.env.UPSTREAM_HOST || "127.0.0.1";
const UPSTREAM_PORT = Number(process.env.UPSTREAM_PORT || 25565);
let REQUIRE_VIEWER = ["1", "true", "yes"].includes(
  String(process.env.REQUIRE_VIEWER || "0").toLowerCase()
);
REQUIRE_VIEWER = false;

let botSocket = null; // downstream: mineflayer/real client acting as the bot
let viewerSocket = null; // downstream: spectator/viewer client
let upstreamSocket = null; // upstream: real server connection
let upstreamReady = false;

// Buffer for bot data while upstream is not yet connected/ready
let botPendingChunks = [];

// Backpressure tracking for fanout writes
let botBackpressure = false;
let viewerBackpressure = false;

function log(...args) {
  console.log("[TCP-POV-PROXY]", ...args);
}

function describeSocket(s) {
  if (!s) return "<none>";
  try {
    const addr = s.remoteAddress || "?";
    const port = s.remotePort || "?";
    return `${addr}:${port}`;
  } catch (_) {
    return "<socket>";
  }
}

function endAll(reason) {
  safeEnd(upstreamSocket, `UPSTREAM end: ${reason}`);
  upstreamSocket = null;
  upstreamReady = false;

  safeEnd(botSocket, `BOT end: ${reason}`);
  botSocket = null;

  safeEnd(viewerSocket, `VIEWER end: ${reason}`);
  viewerSocket = null;

  botPendingChunks = [];
  botBackpressure = false;
  viewerBackpressure = false;
  log("Closed all:", reason);
}

function safeEnd(sock, reason) {
  if (!sock) return;
  try {
    sock.end();
  } catch (_) {}
  try {
    sock.destroy();
  } catch (_) {}
  if (reason) log(reason);
}

function tryConnectUpstream() {
  if (upstreamSocket) return;
  if (!botSocket) return; // require bot first always
  if (REQUIRE_VIEWER && !viewerSocket) return;

  log("Connecting upstream to", `${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
  upstreamSocket = net.createConnection(
    { host: UPSTREAM_HOST, port: UPSTREAM_PORT },
    () => {
      upstreamReady = true;
      log("Upstream connected.");
      flushBotPending();
    }
  );

  upstreamSocket.on("data", (chunk) => {
    // Fan out upstream -> bot + viewer
    let needPause = false;

    if (botSocket && !botSocket.destroyed) {
      const ok = botSocket.write(chunk);
      if (!ok) {
        botBackpressure = true;
        needPause = true;
      }
    }
    if (viewerSocket && !viewerSocket.destroyed) {
      const ok = viewerSocket.write(chunk);
      if (!ok) {
        viewerBackpressure = true;
        needPause = true;
      }
    }

    if (needPause && upstreamSocket && !upstreamSocket.destroyed) {
      upstreamSocket.pause();
      log("Paused upstream due to downstream backpressure.");
    }
  });

  upstreamSocket.on("end", () => {
    log("Upstream ended");
    endAll("upstream end");
  });
  upstreamSocket.on("error", (err) => {
    log("Upstream error:", err && err.message);
    endAll("upstream error");
  });
  upstreamSocket.on("close", () => {
    log("Upstream closed");
    endAll("upstream close");
  });
}

function flushBotPending() {
  if (!upstreamReady || !upstreamSocket || upstreamSocket.destroyed) return;

  while (botPendingChunks.length > 0) {
    const chunk = botPendingChunks[0];
    const ok = upstreamSocket.write(chunk);
    if (!ok) {
      // Wait for upstream drain, then continue flushing
      upstreamSocket.once("drain", flushBotPending);
      return;
    }
    botPendingChunks.shift();
  }
}

function handleBotData(chunk) {
  if (!upstreamReady) {
    botPendingChunks.push(chunk);
    tryConnectUpstream();
    return;
  }
  if (!upstreamSocket || upstreamSocket.destroyed) {
    botPendingChunks.push(chunk);
    tryConnectUpstream();
    return;
  }
  const ok = upstreamSocket.write(chunk);
  if (!ok) {
    // backpressure on upstream, source (bot) should pause until drain
    if (botSocket && !botSocket.destroyed) {
      botSocket.pause();
      upstreamSocket.once("drain", () => {
        if (botSocket && !botSocket.destroyed) botSocket.resume();
      });
    }
  }
}

function wireDownstream(socket, role) {
  socket.on("end", () => {
    log(`${role} ended:`, describeSocket(socket));
    if (role === "bot") {
      endAll("bot end");
    } else if (role === "viewer") {
      // viewer can disconnect independently
      viewerSocket = null;
      viewerBackpressure = false;
    }
  });
  socket.on("error", (err) => {
    log(`${role} error:`, err && err.message);
    if (role === "bot") endAll("bot error");
  });
  socket.on("close", () => {
    log(`${role} closed:`, describeSocket(socket));
    if (role === "bot") endAll("bot close");
  });

  if (role === "bot") {
    socket.on("data", handleBotData);
  } else if (role === "viewer") {
    socket.on("data", () => {
      // Intentionally ignored
    });
  }

  // Handle backpressure drains to resume upstream reading when applicable
  socket.on("drain", () => {
    if (role === "bot") botBackpressure = false;
    if (role === "viewer") viewerBackpressure = false;
    if (
      upstreamSocket &&
      !upstreamSocket.destroyed &&
      (botBackpressure || viewerBackpressure)
    ) {
      // still waiting for the other side to drain
      return;
    }
    if (upstreamSocket && !upstreamSocket.destroyed) {
      upstreamSocket.resume();
      // If we had buffered bot chunks prior to connect, ensure they flush
      flushBotPending();
    }
  });
}

// Separate servers: one for bot, one for viewer
const botServer = net.createServer((socket) => {
  if (botSocket) {
    log("Rejecting extra bot:", describeSocket(socket));
    safeEnd(socket, "extra bot rejected");
    return;
  }
  botSocket = socket;
  log("BOT connected:", describeSocket(botSocket));
  wireDownstream(botSocket, "bot");
  tryConnectUpstream();
});

const viewerServer = net.createServer((socket) => {
  if (viewerSocket) {
    log("Rejecting extra viewer:", describeSocket(socket));
    safeEnd(socket, "extra viewer rejected");
    return;
  }
  viewerSocket = socket;
  log("VIEWER connected:", describeSocket(viewerSocket));
  wireDownstream(viewerSocket, "viewer");
  // Do not require viewer for upstream unless explicitly requested
  tryConnectUpstream();
});

botServer.on("error", (err) => {
  log("Bot server error:", err && err.message);
});
viewerServer.on("error", (err) => {
  log("Viewer server error:", err && err.message);
});

botServer.listen(BOT_PROXY_PORT, "0.0.0.0", () => {
  log(
    `Bot port listening on 0.0.0.0:${BOT_PROXY_PORT}, upstream ${UPSTREAM_HOST}:${UPSTREAM_PORT}, require_viewer=${REQUIRE_VIEWER}`
  );
});
viewerServer.listen(VIEWER_PROXY_PORT, "0.0.0.0", () => {
  log(
    `Viewer port listening on 0.0.0.0:${VIEWER_PROXY_PORT}, upstream ${UPSTREAM_HOST}:${UPSTREAM_PORT}, require_viewer=${REQUIRE_VIEWER}`
  );
});
