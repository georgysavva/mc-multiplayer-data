const { Rcon } = require("rcon-client");
const net = require("net");
const EventEmitter = require("events");

function decidePrimaryBot(bot, sharedBotRng, args) {
  // Build a sorted array of both bot names
  const bots = [bot.username, args.other_bot_name].sort();
  // Draw a random index (0 or 1)
  const chosenIndex = Math.floor(sharedBotRng() * bots.length);
  // Return true if this bot's name matches the chosen index's name
  return bot.username === bots[chosenIndex];
}
/**
 * RCON teleportation function
 * @param {string} name - Player name
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} z - Z coordinate
 * @returns {Promise<string>} RCON response
 */
async function rconTp(rcon, name, x, y, z) {
  const res = await rcon.send(`tp ${name} ${x} ${y} ${z}`);
  return res;
}

/**
 * Bot coordination class for inter-bot communication via TCP sockets
 */
class BotCoordinator extends EventEmitter {
  constructor(botName, coordPort, otherCoordHost, otherCoordPort) {
    super();
    this.botName = botName;
    this.coordPort = coordPort;
    this.otherCoordHost = otherCoordHost;
    this.otherCoordPort = otherCoordPort;
    this.clientConnection = null;
    this.server = null;
  }

  async setupConnections() {
    console.log(`[${this.botName}] Setting up connections...`);

    // Set up server and client connections in parallel and wait for both to be ready
    const [serverReady, clientReady] = await Promise.all([
      this.setupServer(),
      this.setupClient(),
    ]);

    console.log(
      `[${this.botName}] All connections established - server ready: ${serverReady}, client ready: ${clientReady}`
    );
    return { serverReady, clientReady };
  }

  setupServer() {
    return new Promise((resolve) => {
      this.server = net.createServer((socket) => {
        console.log(`[${this.botName} Server] Other bot connected`);
        let buffer = "";

        socket.on("data", (data) => {
          buffer += data.toString();
          let lines = buffer.split("\n");

          // Keep the last incomplete line in the buffer
          buffer = lines.pop();

          // Process each complete line
          lines.forEach((line) => {
            if (line.trim()) {
              try {
                const message = JSON.parse(line);
                const listenerCount = this.listenerCount(message.eventName);
                if (listenerCount > 0) {
                  console.log(
                    `[${this.botName} Server] Received: ${message.eventName} (${listenerCount} listeners) - emitting`
                  );
                  this.emit(message.eventName, message.eventParams);
                } else {
                  console.log(
                    `[${this.botName} Server] Received: ${message.eventName} (no listeners)`
                  );
                }
              } catch (err) {
                console.error(
                  `[${
                    this.botName
                  } Server] Parse error: ${err}, message: ${data.toString()}`
                );
                console.error(
                  `[${this.botName} Server] Problematic line:`,
                  line
                );
              }
            }
          });
        });
        socket.on("close", () => {
          console.log(`[${this.botName} Server] Other bot disconnected`);
        });

        // Resolve when the other bot connects to our server
        resolve(true);
      });

      this.server.listen(this.coordPort, () => {
        console.log(
          `[${this.botName} Server] Listening on port ${this.coordPort}, waiting for other bot to connect...`
        );
      });
    });
  }

  setupClient() {
    return new Promise((resolve) => {
      const attemptConnection = () => {
        this.clientConnection = net.createConnection(
          { host: this.otherCoordHost, port: this.otherCoordPort },
          () => {
            console.log(
              `[${this.botName} Client] Connected to other bot's server at ${this.otherCoordHost}:${this.otherCoordPort}`
            );
            resolve(true);
          }
        );

        this.clientConnection.on("error", (err) => {
          console.log(
            `[${this.botName} Client] Connection failed, retrying in 2s:`,
            err.message
          );
          setTimeout(attemptConnection, 2000);
        });

        this.clientConnection.on("close", () => {
          console.log(`[${this.botName} Client] Disconnected from other bot`);
          this.clientConnection = null;
          setTimeout(attemptConnection, 2000); // Auto-reconnect
        });
      };

      attemptConnection();
    });
  }

  sendToOtherBot(eventName, eventParams, location) {
    if (this.clientConnection) {
      const message = JSON.stringify({ eventName, eventParams });
      console.log(
        `[sendToOtherBot] ${location}: Sending ${eventName} via client connection`
      );
      this.clientConnection.write(message + "\n");
    } else {
      console.log(
        `[sendToOtherBot] ${location}: No client connection available for ${eventName}`
      );
    }
  }

  onceEvent(eventName, handler) {
    this.once(eventName, handler);
  }
}

module.exports = {
  rconTp,
  BotCoordinator,
  decidePrimaryBot,
};
