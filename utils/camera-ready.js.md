# camera-ready.js Documentation

## Overview

`camera-ready.js` provides utilities for managing camera clients in the data collection system. This module handles RCON communication, player list monitoring, and synchronization of camera clients (CameraAlpha and CameraBravo) that join the Minecraft server for video recording purposes.

## Core Functions

### RCON Connection Management

#### connectRcon(host, port, password)
Establishes a connection to the Minecraft server's RCON interface.

**Parameters:**
- `host` - RCON server hostname/IP
- `port` - RCON server port
- `password` - RCON authentication password

**Returns:** `Promise<Rcon>` - Connected RCON client instance

#### useRcon(host, port, password, task)
Manages RCON connection lifecycle with automatic cleanup.

**Parameters:**
- `host` - RCON server hostname/IP
- `port` - RCON server port
- `password` - RCON authentication password
- `task` - Async function that receives the RCON connection

**Returns:** Result from the task function

**Connection Lifecycle:**
1. Establishes RCON connection
2. Executes user task function
3. Automatically closes connection in finally block
4. Handles connection closure errors gracefully

### Player List Processing

#### extractPlayers(listResponse)
Parses Minecraft server player list from RCON `/list` command response.

**Parameter:** `listResponse` - Raw response string from `/list` command

**Returns:** `Set<string>` - Set of player names currently online

**Parsing Logic:**
```javascript
// Input: "There are 3 of a max of 20 players online: CameraAlpha, CameraBravo, Steve"
// Output: Set {"CameraAlpha", "CameraBravo", "Steve"}
```

**Regex Pattern:** `/:\s*(.*)$/` - Extracts everything after the colon

### Camera Synchronization

#### waitForCameras(rconHost, rconPort, rconPassword, maxRetries, checkInterval)
Waits for both camera clients to join the Minecraft server.

**Parameters:**
- `rconHost` - RCON server hostname
- `rconPort` - RCON server port
- `rconPassword` - RCON authentication password
- `maxRetries` - Maximum polling attempts
- `checkInterval` - Milliseconds between checks

**Returns:** `Promise<boolean>` - `true` if both cameras found, `false` on timeout

**Camera Names:** `['CameraAlpha', 'CameraBravo']`

## Workflow Integration

### Data Collection Pipeline
This utility is part of the broader data collection system:

1. **Episode Execution**: Bots perform coordinated behaviors
2. **Camera Synchronization**: `waitForCameras()` ensures cameras are ready
3. **Video Recording**: Cameras capture synchronized footage
4. **Data Processing**: Videos and metadata are processed together

### Typical Usage Pattern
```javascript
// Wait for camera clients before starting data collection
const camerasReady = await waitForCameras(
  'localhost',    // RCON host
  25575,         // RCON port
  'password',     // RCON password
  30,            // Max retries (30 seconds at 1s intervals)
  1000           // Check every 1 second
);

if (!camerasReady) {
  console.error('Camera synchronization failed');
  process.exit(1);
}

// Proceed with episode execution knowing cameras are recording
```

## Technical Implementation

### RCON Communication
- Uses `rcon-client` library for Minecraft RCON protocol
- Implements connection pooling with automatic cleanup
- Handles connection errors gracefully
- Supports both one-off commands and session-based operations

### Player Detection
- Polls server player list via `/list` command
- Parses comma-separated player names
- Handles various response formats
- Case-sensitive name matching

### Synchronization Logic
```javascript
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  // Query current players
  const players = await getCurrentPlayers();
  
  // Check camera presence
  const foundCameras = cameraNames.filter(name => players.has(name));
  
  // Success condition
  if (foundCameras.length === cameraNames.length) {
    return true;
  }
  
  // Continue polling (with delay)
  await sleep(checkInterval);
}
```

## Error Handling

### Connection Failures
- RCON connection errors are logged but don't crash the process
- Automatic retry logic for transient failures
- Connection cleanup even on errors

### Parsing Errors
- Malformed `/list` responses handled gracefully
- Empty or invalid player lists return empty sets
- Regex matching is robust against format variations

### Timeout Handling
- Configurable retry limits prevent infinite waiting
- Clear error messages on timeout
- Returns boolean status for programmatic handling

## Integration Points

### Data Collection System
- Used by `orchestrate.py` for camera readiness checks
- Coordinates with `receiver.py` instances for data capture
- Ensures synchronized video recording across episodes

### Docker Integration
- Works with docker-compose service networking
- RCON connectivity to Minecraft server container
- Environment variable configuration support

## Usage Examples

### Basic Camera Waiting
```javascript
const { waitForCameras } = require('./utils/camera-ready');

// Wait up to 60 seconds for cameras
const ready = await waitForCameras(
  process.env.RCON_HOST || 'localhost',
  process.env.RCON_PORT || 25575,
  process.env.RCON_PASSWORD || 'minecraft',
  60,   // 60 attempts
  1000  // 1 second intervals
);

if (ready) {
  console.log('Cameras ready, starting episode');
} else {
  console.error('Camera timeout, aborting');
}
```

### RCON Command Execution
```javascript
const { useRcon } = require('./utils/camera-ready');

// Execute a single RCON command
const response = await useRcon('localhost', 25575, 'password', async (rcon) => {
  return await rcon.send('time set day');
});

console.log('Time set response:', response);
```

### Player List Monitoring
```javascript
const { useRcon, extractPlayers } = require('./utils/camera-ready');

// Get current player list
const listResponse = await useRcon('localhost', 25575, 'password', 
  (rcon) => rcon.send('list')
);

const players = extractPlayers(listResponse);
console.log('Online players:', Array.from(players));
```

## Performance Considerations

### Resource Usage
- **Network**: Minimal RCON polling overhead
- **CPU**: Lightweight string processing
- **Memory**: Small data structures for player tracking

### Optimization Tips
- Configure appropriate retry limits for deployment environment
- Adjust check intervals based on camera startup time
- Use environment variables for configuration
- Monitor RCON connection stability

## Dependencies

### Required Packages
- `rcon-client` - Minecraft RCON protocol implementation

### System Requirements
- Access to Minecraft server RCON interface
- Camera clients configured to join with specific names
- Network connectivity between orchestrator and server

## Future Enhancements

### Potential Features
- **Multiple Camera Support**: Support for N camera clients
- **Health Monitoring**: Camera connection health checks
- **Dynamic Names**: Configurable camera naming schemes
- **Parallel Waiting**: Non-blocking camera synchronization
- **Status Callbacks**: Progress reporting during waiting
