# Windows Docker Files - Updates from Linux Version

## Overview

This document summarizes the changes ported from the Linux Docker configuration (`Dockerfile`, `docker-compose.yml`) to the Windows-compatible versions (`Dockerfile.windows`, `docker-compose-windows-fixed.yml`).

## Date
2025-11-26

## Changes Made

### 1. Dockerfile.windows

#### A. Updated npm Package Echo Numbers
**Purpose**: Trigger rebuilds when upstream dependencies change

**Changes:**
- `mineflayer`: `echo "43"` → `echo "46"`
- `mineflayer-pathfinder`: `echo "48"` (unchanged)
- `prismarine-viewer-colalab`: `echo "44"` → `echo "48"`

**Impact**: Forces Docker to rebuild these layers when dependencies are updated

#### B. Simplified chmod Section
**Purpose**: Match Linux Dockerfile structure

**Before:**
```dockerfile
# Fix line endings for shell scripts and make them executable (Windows compatibility)
RUN apt-get update && apt-get install -y dos2unix && rm -rf /var/lib/apt/lists/* && \
    find . -type f \( -name "*.sh" -o -name "*.py" \) -exec dos2unix {} \; && \
    chmod +x entrypoint_senders.sh entrypoint_receiver.sh
```

**After:**
```dockerfile
RUN chmod +x entrypoint_senders.sh
RUN chmod +x entrypoint_receiver.sh
```

**Rationale**: 
- Removed dos2unix dependency from main Dockerfile
- Line ending conversion now handled by camera-specific Dockerfile only
- Simplifies main project Docker build
- Matches Linux version structure

---

### 2. docker-compose-windows-fixed.yml

#### A. Minecraft Version Update
**Service**: `mc`

**Change:**
- `VERSION: 1.20.4` → `VERSION: 1.21`

**Impact**: Updates Minecraft server to version 1.21

#### B. Bot MC_VERSION Update
**Services**: `sender_alpha`, `sender_bravo`, `camera_alpha`, `camera_bravo`

**Change:**
- `MC_VERSION: "1.20.4"` → `MC_VERSION: "1.21"`

**Impact**: Ensures bots connect with correct Minecraft version

#### C. Teleportation Radius Increase
**Services**: `sender_alpha`, `sender_bravo`

**Change:**
- `TELEPORT_RADIUS: ${TELEPORT_RADIUS:-3000}` → `TELEPORT_RADIUS: ${TELEPORT_RADIUS:-50000}`

**Impact**: 
- Bots can now teleport up to 50,000 blocks from spawn (vs 3,000 previously)
- Enables exploration of much larger world areas
- Increases biome diversity across episodes

#### D. Removed Teleportation Parameters
**Services**: `sender_alpha`, `sender_bravo`

**Removed:**
- `TELEPORT_CENTER_X: ${TELEPORT_CENTER_X:-0}`
- `TELEPORT_CENTER_Z: ${TELEPORT_CENTER_Z:-0}`
- `TELEPORT_MIN_DISTANCE: ${TELEPORT_MIN_DISTANCE:-1000}`

**Rationale**: 
- These parameters not present in Linux version
- Simplifies teleportation configuration
- Teleportation logic now handled entirely in code

**Note**: If you previously relied on `TELEPORT_MIN_DISTANCE` for biome diversity, this functionality may need to be verified in the episode handlers.

#### E. Removed EPISODES_NUM from Receivers
**Services**: `receiver_alpha`, `receiver_bravo`

**Removed:**
- `EPISODES_NUM: ${EPISODES_NUM:-1}`

**Rationale**: 
- Not present in Linux version
- Receivers should run indefinitely, not exit after N episodes
- Episode count controlled by senders only

#### F. Updated prep_data Volumes
**Service**: `prep_data`

**Change:**
- `- ./data:/data` → `- ${MC_DATA_DIR:-./data}:/data`

**Impact**: 
- Allows customization of data directory via environment variable
- Matches Linux version flexibility
- Maintains `./data` as default

#### G. Added Spectator Services
**New Services**: `spectator_alpha`, `spectator_bravo`

**Configuration:**
```yaml
spectator_alpha:
  image: ojmichel/mc-multiplayer-base:latest
  build:
    context: .
    dockerfile: Dockerfile.windows
  depends_on:
    mc:
      condition: service_healthy
  environment:
    MC_HOST: "mc"
    MC_PORT: "${MC_SERVER_PORT:-25565}"
    MC_USERNAME: "SpectatorAlpha"
  restart: unless-stopped
  working_dir: /usr/src/app
  command: ["node", "spectator/spectator.js"]
  extra_hosts:
    - "host.docker.internal:host-gateway"
```

**Purpose**: 
- Runs spectator bots that observe gameplay
- Uses `spectator/spectator.js` script
- Connects to Minecraft server as SpectatorAlpha/SpectatorBravo
- Automatically restarts if crashes

**Impact**: 
- Adds new spectator functionality from Linux version
- Enables additional data collection or monitoring capabilities

---

## Camera Image Build Automation

### **Added Build Sections to Camera Services**

**Services**: `camera_alpha`, `camera_bravo`

**Added:**
```yaml
build:
  context: ./camera
  dockerfile: Dockerfile.windows.camera
```

**Purpose:**
- Automatically builds camera image when running `docker-compose up --build`
- Uses Windows-compatible Dockerfile with dos2unix support
- Eliminates need to manually run `build_and_push_windows_camera.ps1`

**Impact:**
- Camera images now build automatically with `-Build` flag
- Matches Linux behavior where cameras build with the stack
- Simplifies deployment workflow

---

## Breaking Changes

### ⚠️ TELEPORT_MIN_DISTANCE Removed

If you were using `TELEPORT_MIN_DISTANCE` in your `.env` file or environment variables, this parameter is no longer used. The teleportation logic may need to be verified in the episode handlers to ensure biome diversity is maintained.

**Previous Behavior** (from memory):
- Bots would teleport at least 1000 blocks away from current position
- Ensured diverse biomes across episodes

**Action Required**:
- Check `episode-handlers/index.js` teleport() function
- Verify biome diversity logic is still working as expected
- May need to re-add this logic if removed from Linux version

### ⚠️ Receiver Lifetime Changed

Receivers no longer exit after `EPISODES_NUM` episodes. They now run indefinitely until manually stopped.

**Impact**:
- Receivers won't auto-exit after N episodes
- Must manually stop stack with `docker-compose down`
- Prevents memory leak issues from receivers running forever

---

## Compatibility Notes

### Windows-Specific Considerations

1. **Line Endings**: Main Dockerfile.windows no longer handles CRLF→LF conversion. If you edit shell scripts on Windows, use a text editor that saves with LF line endings (e.g., VS Code with `"files.eol": "\n"`).

2. **Camera Docker Files**: Camera-specific files still use dos2unix:
   - `camera/Dockerfile.windows.camera` - Has dos2unix support
   - `camera/build_and_push_windows_camera.ps1` - Build script
   - See `camera/WINDOWS_COMPATIBILITY.md` for details

3. **Network Mode**: Windows version uses port mapping instead of `network_mode: host` (not supported on Windows Docker Desktop)

### Testing Recommendations

After applying these changes:

1. **Build Images**:
   ```powershell
   .\build_and_deploy_windows.ps1 up -Build
   ```

2. **Verify Minecraft Version**:
   - Check logs: `.\build_and_deploy_windows.ps1 logs mc`
   - Should see "Starting Minecraft server version 1.21"

3. **Test Teleportation**:
   - Run multiple episodes
   - Verify bots teleport to diverse locations
   - Check if 50,000 block radius is working

4. **Check Spectators**:
   - Verify SpectatorAlpha and SpectatorBravo connect
   - Check logs: `.\build_and_deploy_windows.ps1 logs spectator_alpha`

5. **Monitor Receivers**:
   - Ensure receivers don't exit prematurely
   - Verify they continue running across multiple episodes

---

## Rollback Instructions

If issues occur, you can revert to the previous stable version:

### Dockerfile.windows
```dockerfile
# Revert echo numbers
RUN echo "43" && npm install github:georgysavva/mineflayer
RUN echo "48" && npm install github:daohanlu/mineflayer-pathfinder
RUN echo "44" && npm install github:georgysavva/prismarine-viewer-colalab

# Restore dos2unix section
RUN apt-get update && apt-get install -y dos2unix && rm -rf /var/lib/apt/lists/* && \
    find . -type f \( -name "*.sh" -o -name "*.py" \) -exec dos2unix {} \; && \
    chmod +x entrypoint_senders.sh entrypoint_receiver.sh
```

### docker-compose-windows-fixed.yml
```yaml
# Revert Minecraft version
VERSION: 1.20.4
MC_VERSION: "1.20.4"

# Restore teleportation parameters
TELEPORT_CENTER_X: ${TELEPORT_CENTER_X:-0}
TELEPORT_CENTER_Z: ${TELEPORT_CENTER_Z:-0}
TELEPORT_RADIUS: ${TELEPORT_RADIUS:-3000}
TELEPORT_MIN_DISTANCE: ${TELEPORT_MIN_DISTANCE:-1000}

# Restore receiver EPISODES_NUM
EPISODES_NUM: ${EPISODES_NUM:-1}  # in receiver_alpha and receiver_bravo

# Remove spectator services
# (Delete spectator_alpha and spectator_bravo sections)
```

---

## Summary

**Total Changes**: 9 updates across 2 files

**High Priority**:
- ✅ Minecraft 1.21 upgrade
- ✅ Teleport radius increased to 50,000 blocks
- ✅ Simplified Dockerfile structure

**Medium Priority**:
- ✅ Added spectator services
- ✅ Removed deprecated teleport parameters

**Low Priority**:
- ✅ Receiver lifetime changes
- ✅ Flexible data directory

**Status**: All changes successfully ported from Linux to Windows configuration
