# Viewer Episode Lifecycle Debug Analysis

## Problem Statement
The viewer (prismarine-viewer-colalab) continues sending frames to the receiver even after the episode has ended, preventing containers from stopping cleanly.

## Current Flow

### 1. Viewer Initialization (Once per bot spawn)
```javascript
// episode-handlers/index.js:264
mineflayerViewerhl(bot, {
  output: `${host}:${receiverPort}`,  // receiver_alpha:8090 or receiver_bravo:8090
  width: 640,
  height: 360,
  frames: 400,
  disableRendering: args.viewer_rendering_disabled,
  interval: 50,  // Send frame every 50ms (20 FPS)
});
```

**Key Point**: Viewer is initialized ONCE and reused for ALL episodes.

### 2. Episode Start
```javascript
// episode-handlers/index.js:437
console.log(`[${bot.username}] starting episode recording`);
bot.emit("startepisode", 0);
await sleep(1000);
```

**Expected**: Viewer listens for `startepisode` event and begins sending frames to receiver.

### 3. Episode End
```javascript
// episode-handlers/base-episode.js:79
console.log(`[${bot.username}] stops recording`);
bot.emit("endepisode");

// Wait for the connection to actually close
console.log(`[${bot.username}] waiting for episode to end...`);
await new Promise((resolve) => {
  bot.once("episodeended", resolve);
});
console.log(`[${bot.username}] episode ended, connection closed`);
```

**Expected**: 
1. Viewer listens for `endepisode` event
2. Viewer stops sending frames
3. Viewer closes connection to receiver
4. Viewer emits `episodeended` event
5. Episode handler continues

## Identified Issues

### Issue 1: Viewer May Not Be Listening to Events
The custom fork `prismarine-viewer-colalab` must implement:
- Event listener for `bot.emit("startepisode")`
- Event listener for `bot.emit("endepisode")`
- Emit `bot.emit("episodeended")` after closing connection

**Verification Needed**: Check if the viewer fork properly implements these event handlers.

### Issue 2: Connection Not Closing
If the viewer doesn't properly close the TCP connection to the receiver:
- Receiver stays in `recvall()` loop waiting for data
- Receiver never processes `pos_length == 0` (normal end condition)
- Episode hangs indefinitely

### Issue 3: Multiple Episodes Reusing Same Viewer
Since the viewer is initialized once and reused:
- First episode: `startepisode` → frames → `endepisode` ✅
- Second episode: `startepisode` → frames → `endepisode` ❓
- The viewer might not properly reset state between episodes

## Receiver Side Analysis

### Receiver Loop (receiver.py:246)
```python
while True:
    t0 = time.time()
    try:
        pos_length = recvint(conn)
    except Exception as e:
        pos_length = 0
    if pos_length == 0:
        print(f"recv 0 length, normal end. {id}")
        retcode = 0
        break  # Exit episode loop
```

**Key Point**: Receiver expects `pos_length == 0` to signal episode end.

### How Viewer Should Signal End
The viewer must:
1. Stop rendering loop
2. Send a final packet with `pos_length = 0` (4 bytes of zeros)
3. Close the TCP socket
4. Emit `episodeended` event

## Debugging Steps

### Step 1: Add Logging to Track Events
Add console logs to verify events are being emitted and received:

```javascript
// In episode-handlers/index.js, after viewer init:
bot.on("startepisode", (episodeId) => {
  console.log(`[${bot.username}] 🎬 startepisode event received by bot, episode ${episodeId}`);
});

bot.on("endepisode", () => {
  console.log(`[${bot.username}] 🛑 endepisode event received by bot`);
});

bot.on("episodeended", () => {
  console.log(`[${bot.username}] ✅ episodeended event received by bot`);
});
```

### Step 2: Check Viewer Source Code
The viewer fork is at: `github:georgysavva/prismarine-viewer-colalab`

Look for:
- `bot.on("startepisode", ...)` handler
- `bot.on("endepisode", ...)` handler  
- `bot.emit("episodeended")` call
- Socket close logic

### Step 3: Verify Receiver Gets End Signal
Add logging in receiver.py:

```python
# Before line 249
print(f"[{args.name}] Waiting for next frame...")
pos_length = recvint(conn)
print(f"[{args.name}] Received pos_length: {pos_length}")
```

### Step 4: Check for Timeout Issues
The receiver has no timeout on `conn.accept()` or `recvint()`:
- If viewer never sends end signal, receiver hangs forever
- Need to add timeout or ensure viewer always sends end signal

## Potential Solutions

### Solution 1: Add Timeout to Receiver
```python
# In receiver.py, set socket timeout
conn.settimeout(60)  # 60 second timeout

try:
    pos_length = recvint(conn)
except socket.timeout:
    print(f"[{args.name}] Socket timeout, assuming episode ended")
    pos_length = 0
```

### Solution 2: Verify Viewer Implements Episode Events
Check the viewer source code and ensure it:
1. Listens for `startepisode` and `endepisode`
2. Properly closes connection on `endepisode`
3. Emits `episodeended` after cleanup

### Solution 3: Add Viewer Reference and Manual Control
Store the viewer instance and manually control it:

```javascript
// Store viewer reference
const viewer = mineflayerViewerhl(bot, {...});

// In stopPhase handler, manually stop viewer
if (viewer && viewer.stop) {
  await viewer.stop();
}
```

### Solution 4: Reinitialize Viewer Per Episode
Instead of reusing one viewer for all episodes, create a new viewer for each episode:

```javascript
// Move viewer init into runSingleEpisode
async function runSingleEpisode(...) {
  const viewer = mineflayerViewerhl(bot, {
    output: `${host}:${receiverPort}`,
    ...
  });
  
  // ... episode logic ...
  
  // Clean up viewer
  if (viewer && viewer.close) {
    await viewer.close();
  }
}
```

## Immediate Action Items

1. ✅ **Check sender logs** for `startepisode`, `endepisode`, `episodeended` events
2. ✅ **Check receiver logs** for `recv 0 length` message
3. ⚠️ **Inspect viewer source code** at `node_modules/prismarine-viewer-colalab`
4. ⚠️ **Add debug logging** to track event flow
5. ⚠️ **Add timeout** to receiver as safety measure

## Expected Log Sequence (Working)

### Sender Log:
```
[Alpha] starting episode recording
[Alpha] 🎬 startepisode event received by bot, episode 0
[Alpha] stops recording
[Alpha] 🛑 endepisode event received by bot
[Alpha] waiting for episode to end...
[Alpha] ✅ episodeended event received by bot
[Alpha] episode ended, connection closed
```

### Receiver Log:
```
[Alpha] Socket connected 0
[Alpha] pos data: {"x":0,"y":64,"z":0,...}
[Alpha] pos data: {"x":0.1,"y":64,"z":0,...}
...
[Alpha] Received pos_length: 0
[Alpha] recv 0 length, normal end. 0
[Alpha] Processed episode 1/1
[Alpha] Completed all 1 episodes. Exiting.
```

## Next Steps

Run the stack and collect logs to identify where the flow breaks.
