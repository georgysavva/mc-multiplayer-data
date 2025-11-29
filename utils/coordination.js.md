# coordination.js Documentation

## Overview

`coordination.js` provides inter-bot communication infrastructure for synchronized multi-bot episodes. This module implements a TCP socket-based coordination system that enables bots to exchange messages, synchronize actions, and coordinate complex behaviors across distributed bot instances.

## Core Classes and Functions

### BotCoordinator Class

The main coordination engine that manages TCP connections and event routing between bot instances.

#### Constructor Parameters
```javascript
new BotCoordinator(botName, coordPort, otherCoordHost, otherCoordPort)
```

- `botName` - This bot's identifier
- `coordPort` - Port for this bot's server
- `otherCoordHost` - Hostname/IP of other bot
- `otherCoordPort` - Port of other bot's server

#### Connection Architecture

Each bot runs both a **server** and a **client**:
- **Server**: Listens for connections from the other bot
- **Client**: Connects to the other bot's server
- **Full Duplex**: Both directions of communication available

### Connection Setup

#### setupConnections()
Establishes both server and client connections simultaneously.

**Process:**
1. Starts TCP server on `coordPort`
2. Initiates client connection to other bot
3. Waits for both connections to be established
4. Returns readiness status

**Connection States:**
- Server: Waiting for other bot to connect
- Client: Attempting connection with auto-retry
- Both: Established and ready for communication

## Message Protocol

### Event System

Messages are sent as JSON objects over TCP with newline separation:

```json
{
  "eventName": "episode_0_walkPhase",
  "eventParams": {
    "position": {"x": 100, "y": 64, "z": 200},
    "action": "start"
  }
}
```

### Event Naming Convention

Events are prefixed with episode number for isolation:
```javascript
getEventName("walkPhase", 0) // → "episode_0_walkPhase"
```

## Communication Methods

### sendToOtherBot(eventName, eventParams, episodeNum, location)
Sends a message to the other bot via the client connection.

**Parameters:**
- `eventName` - Base event name (will be prefixed)
- `eventParams` - Data payload object
- `episodeNum` - Episode number for event isolation
- `location` - Debug string for logging

**Message Flow:**
1. Prefix event name with episode number
2. JSON serialize message
3. Send via TCP client connection
4. Log transmission for debugging

### onceEvent(eventName, episodeNum, handler)
Registers a one-time event listener with execution tracking.

**Features:**
- Automatic event name prefixing
- Unique event ID assignment
- Execution state tracking
- Async handler support
- Automatic cleanup after execution

**Execution Tracking:**
- Prevents race conditions in multi-phase episodes
- Enables waiting for all events to complete
- Provides debugging visibility into event processing

## Synchronization Utilities

### waitForAllPhasesToFinish()
Blocks until all registered event handlers have completed execution.

**Timeout Protection:** 60-second maximum wait time

**Use Case:** Ensures episode phases complete before proceeding

### syncBots(episodeNum)
Synchronizes both bots at a specific point in execution.

**Mechanism:**
1. Register listener for sync event
2. Send sync event to other bot
3. Both bots wait for mutual confirmation
4. Resolve promise when sync complete

## Utility Functions

### decidePrimaryBot(bot, sharedBotRng, args)
Deterministically selects which bot should be "primary" for coordination.

**Algorithm:**
1. Sort bot names alphabetically
2. Use shared RNG to pick from sorted array
3. Return true if current bot is selected

**Purpose:** Consistent primary/secondary role assignment

### pickRandom(array, sharedBotRng)
Selects random item from array using shared RNG for determinism.

**Implementation:**
```javascript
const sortedArray = array.slice().sort(); // Deterministic ordering
return sortedArray[Math.floor(sharedBotRng() * sortedArray.length)];
```

### rconTp(rcon, name, x, y, z)
Teleports a player using RCON commands.

**RCON Command:** `tp <name> <x> <y> <z>`

**Returns:** RCON response string

## Network Architecture

### TCP Socket Management

#### Server Side
- Creates TCP server on specified port
- Accepts single client connection from other bot
- Processes incoming JSON messages line by line
- Emits events to registered listeners
- Handles connection lifecycle (connect/disconnect)

#### Client Side
- Initiates connection to other bot's server
- Auto-reconnects on failure (2-second intervals)
- Buffers outgoing messages
- Maintains persistent connection

### Message Processing

#### Incoming Messages
```javascript
// Buffer management for partial messages
socket.on("data", (data) => {
  buffer += data.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop(); // Keep incomplete line
  
  lines.forEach(line => {
    if (line.trim()) {
      const message = JSON.parse(line);
      this.emit(message.eventName, message.eventParams);
    }
  });
});
```

#### Error Handling
- JSON parse errors logged with context
- Connection failures trigger auto-retry
- Disconnections initiate reconnection attempts
- Listener validation prevents silent failures

## Integration Patterns

### Episode Handler Integration
```javascript
// In episode handler
coordinator.onceEvent("walkPhase", episodeNum, async (otherBotData) => {
  // Execute phase logic
  await performWalkPhase(bot, otherBotData);
  
  // Signal completion to other bot
  coordinator.sendToOtherBot("stopPhase", bot.position, episodeNum, "walk complete");
});
```

### Phase Synchronization
```javascript
// Wait for all handlers to finish before episode cleanup
await coordinator.waitForAllPhasesToFinish();

// Safe to proceed with episode teardown
```

### Bot Role Assignment
```javascript
// Deterministic primary selection
const isPrimary = decidePrimaryBot(bot, sharedBotRng, args);
if (isPrimary) {
  // Primary bot logic
  coordinator.sendToOtherBot("startPhase", data, episodeNum, "primary init");
} else {
  // Secondary bot waits for primary
  coordinator.onceEvent("startPhase", episodeNum, handler);
}
```

## Performance Characteristics

### Resource Usage
- **Network**: Persistent TCP connections (minimal overhead)
- **Memory**: Event listener storage + execution tracking
- **CPU**: JSON parsing, event routing, connection management

### Scalability
- Designed for 2-bot coordination (not N bots)
- Single client connection per coordinator
- Event-based architecture prevents blocking

## Error Recovery

### Connection Failures
- **Client**: Auto-reconnect every 2 seconds
- **Server**: Accepts new connections on failure
- **Messages**: Lost during disconnection (not queued)

### Event Processing
- **Parse Errors**: Logged, processing continues
- **Handler Errors**: Caught, event marked complete
- **Timeout Protection**: Prevents infinite waiting

## Usage Examples

### Basic Setup
```javascript
const coordinator = new BotCoordinator(
  "Alpha",        // bot name
  3001,          // our port
  "localhost",    // other bot host
  3002           // other bot port
);

await coordinator.setupConnections();
```

### Event Communication
```javascript
// Send position update
coordinator.sendToOtherBot(
  "positionUpdate", 
  { x: 100, y: 64, z: 200 }, 
  episodeNum, 
  "movement phase"
);

// Receive and handle
coordinator.onceEvent("positionUpdate", episodeNum, async (data) => {
  console.log("Other bot at:", data);
  // Respond to position update
});
```

### Synchronization
```javascript
// Synchronize episode start
await coordinator.syncBots(episodeNum);
console.log("Both bots ready to proceed");
```

## Technical Implementation Details

### Event Isolation
- Episode number prefixing prevents cross-episode interference
- Unique event IDs prevent handler conflicts
- Execution tracking enables proper cleanup

### Message Ordering
- TCP guarantees message ordering
- Line-based parsing ensures complete messages
- Buffer management handles partial receives

### Connection Resilience
- Auto-reconnection on failures
- Graceful degradation during outages
- Detailed logging for debugging

## Future Enhancements

### Potential Features
- **Multi-Bot Support**: Extend beyond 2 bots
- **Message Queuing**: Buffer messages during disconnection
- **Encryption**: Secure inter-bot communication
- **Health Monitoring**: Connection quality metrics
- **Broadcast Messaging**: One-to-many event distribution
