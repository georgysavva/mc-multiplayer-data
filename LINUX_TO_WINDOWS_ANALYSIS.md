# Linux to Windows Docker Setup - Deep Dive Analysis

## Executive Summary

After analyzing the Linux `run_stack.sh` and `docker-compose.yml`, I've identified **critical differences** between the Linux and Windows setups that need to be ported over.

---

## 🔍 Linux Execution Flow (`run_stack.sh up`)

### **Phase 1: Initialization**
1. Load `.env` file if exists
2. Ensure Docker/docker-compose available
3. Create required directories:
   - `output/`
   - `camera/data_alpha/`
   - `camera/data_bravo/`
   - `camera/output_alpha/`
   - `camera/output_bravo/`
   - `logs/`

### **Phase 2: Stack Management**
1. Check for existing stack → Stop if running
2. **Build or Pull** images based on `--build` flag:
   - `--build` → `docker-compose build` (builds all images with build sections)
   - No flag → `docker-compose pull` (pulls from Docker Hub)
3. Start stack: `docker-compose up -d`

### **Phase 3: Log Capture**
Captures logs for these services in background:
- `prep_data`
- `mc`
- `sender_alpha`
- `sender_bravo`
- `receiver_alpha`
- `receiver_bravo`
- `camera_alpha`
- `camera_bravo`
- `episode_starter`

Each service logs to: `logs/<service>.log`

### **Phase 4: Wait for Completion**
```bash
docker-compose wait sender_alpha sender_bravo
```
**KEY**: Script **blocks** until both senders exit (episodes complete)

### **Phase 5: Shutdown**
1. Stop log capture
2. `docker-compose down`

### **Phase 6: Post-Processing**
1. **Process recordings** for each bot:
   ```bash
   python3 postprocess/process_recordings.py \
     --bot Alpha \
     --actions-dir output \
     --camera-prefix camera \
     --output-dir output
   ```
2. **Optional alignment** (if `--align` flag):
   ```bash
   python3 video-post-processing-utils/batch_process_all.py \
     --output-dir output
   ```

---

## 📊 Linux Service Architecture (`docker-compose.yml`)

### **Service Dependency Tree**

```
prep_data (runs once, exits)
    ↓
mc (Minecraft server - stays running)
    ↓
├─ sender_alpha ────────┐
│   ↓                   │
│   receiver_alpha      │
│                       │
├─ sender_bravo ────────┤
│   ↓                   │
│   receiver_bravo      │
│                       │
├─ camera_alpha ────────┤
│   ↓                   │
│   episode_starter ────┘
│                       
├─ camera_bravo         
│                       
├─ spectator_alpha      
│                       
└─ spectator_bravo      
```

### **Service Breakdown**

| Service | Image | Purpose | Network | Build? |
|---------|-------|---------|---------|--------|
| `prep_data` | busybox | Copy plugins/skins to data dir | default | No |
| `mc` | itzg/minecraft-server | Minecraft 1.21 server | **host** | No |
| `sender_alpha` | ojmichel/mc-multiplayer-base | Bot Alpha (runs episodes) | default | **Yes** |
| `sender_bravo` | ojmichel/mc-multiplayer-base | Bot Bravo (runs episodes) | default | **Yes** |
| `receiver_alpha` | ojmichel/mc-multiplayer-base | Receives Alpha data | default | No |
| `receiver_bravo` | ojmichel/mc-multiplayer-base | Receives Bravo data | default | No |
| `camera_alpha` | ojmichel/mineflayer-spectator-client | Records Alpha POV | **host** | **Yes** |
| `camera_bravo` | ojmichel/mineflayer-spectator-client | Records Bravo POV | **host** | **Yes** |
| `episode_starter` | node:20 | Waits for players, starts episodes | **host** | No |
| `spectator_alpha` | ojmichel/mc-multiplayer-base | Spectator bot for Alpha | default | **Yes** |
| `spectator_bravo` | ojmichel/mc-multiplayer-base | Spectator bot for Bravo | default | **Yes** |
| `script` | ojmichel/mc-multiplayer-base | Utility container (sleep infinity) | default | No |

---

## 🔑 Key Linux Features

### **1. Network Mode: `host`**
**Services using `network_mode: host`:**
- `mc` (Minecraft server)
- `camera_alpha`
- `camera_bravo`
- `episode_starter`

**Why?**
- Direct access to `localhost` / `127.0.0.1`
- Avoids network issues on certain machines
- Cameras can connect to MC server without port mapping

**Windows Equivalent:**
- Windows Docker Desktop **doesn't support** `network_mode: host`
- Must use port mapping + `host.docker.internal`

### **2. Build Sections**
**Services with build sections:**
```yaml
sender_alpha:
  build:
    context: .
    dockerfile: Dockerfile

camera_alpha:
  build:
    context: ./camera
    dockerfile: Dockerfile

spectator_alpha:
  build:
    context: .
    dockerfile: Dockerfile
```

**Impact:**
- `docker-compose build` builds these images automatically
- No need to manually build images before running

### **3. No `camera_*_follow` Services**
**Linux does NOT have:**
- `camera_alpha_follow`
- `camera_bravo_follow`

**Camera following is handled internally** by the camera image itself (via `launch_minecraft.py` or episode handlers).

### **4. Episode Starter**
**Purpose**: Waits for all required players to join, then sends RCON command to start episode

**Environment:**
```yaml
EPISODE_START_RETRIES: "300"  # 300 retries (vs 60 in Windows)
EPISODE_REQUIRED_PLAYERS: "Alpha,CameraAlpha,Bravo,CameraBravo"
EPISODE_START_COMMAND: "episode start Alpha CameraAlpha technoblade.png Bravo CameraBravo test.png"
```

**Mounts:**
- `./camera/episode_starter.js` (NOT `./spectator/`)

---

## ⚠️ Critical Differences: Linux vs Windows

### **1. Network Configuration**

| Aspect | Linux | Windows |
|--------|-------|---------|
| MC server | `network_mode: host` | Port mapping `25565:25565` |
| Cameras | `network_mode: host` | Port mapping `5901:5901`, etc. |
| MC_HOST (senders) | `host.docker.internal` | `mc` (service name) |
| MC_HOST (cameras) | `127.0.0.1` | `mc` (service name) |
| RCON_HOST | `host.docker.internal` or `127.0.0.1` | `mc` (service name) |

### **2. Services**

| Service | Linux | Windows | Status |
|---------|-------|---------|--------|
| `prep_data` | ✅ | ✅ | Same |
| `mc` | ✅ | ✅ | Different network |
| `sender_alpha` | ✅ | ✅ | Different MC_HOST |
| `sender_bravo` | ✅ | ✅ | Different MC_HOST |
| `receiver_alpha` | ✅ | ✅ | Same |
| `receiver_bravo` | ✅ | ✅ | Same |
| `camera_alpha` | ✅ | ✅ | Different network |
| `camera_bravo` | ✅ | ✅ | Different network |
| `episode_starter` | ✅ | ✅ | Different network |
| `spectator_alpha` | ✅ | ✅ | Same |
| `spectator_bravo` | ✅ | ✅ | Same |
| `script` | ✅ | ❌ **MISSING** | Need to add |
| `camera_alpha_follow` | ❌ | ✅ **EXTRA** | Should remove |
| `camera_bravo_follow` | ❌ | ✅ **EXTRA** | Should remove |

### **3. Environment Variables**

**Linux has, Windows missing:**
- `EPISODE_START_RETRIES: "300"` (Windows has 60)

**Windows has, Linux missing:**
- None (Windows is a subset)

### **4. Volumes**

**Camera volumes:**
- Linux: Only mounts `data_alpha:/root` and `output_alpha:/output`
- Windows: **ALSO** mounts `entrypoint.sh` and `launch_minecraft.py` as read-only

**Why the difference?**
- Linux builds camera image with files baked in
- Windows mounts them for easier development (but this is wrong - should be baked in)

---

## 🚨 Issues Found in Windows Setup

### **Issue #1: Extra `camera_*_follow` Services**
**Problem**: Windows has `camera_alpha_follow` and `camera_bravo_follow` services that don't exist in Linux

**Root Cause**: These were added to Windows setup to handle camera following via `spectator.js`

**Solution**: **REMOVE** these services - camera following should be handled by the camera image itself

### **Issue #2: Wrong Volume Mounts for Cameras**
**Problem**: Windows mounts `entrypoint.sh` and `launch_minecraft.py` as volumes

**Linux:**
```yaml
volumes:
  - ./camera/data_alpha:/root
  - ./camera/output_alpha:/output
```

**Windows:**
```yaml
volumes:
  - ./camera/data_alpha:/root
  - ./camera/output_alpha:/output
  - ./camera/entrypoint.sh:/app/entrypoint.sh:ro  # WRONG!
  - ./camera/launch_minecraft.py:/app/launch_minecraft.py:ro  # WRONG!
```

**Solution**: Remove the script mounts - they should be baked into the image during build

### **Issue #3: Missing `script` Service**
**Problem**: Windows doesn't have the `script` utility service

**Purpose**: Provides a container with `sleep infinity` for debugging/manual commands

**Solution**: Add this service to Windows compose

### **Issue #4: EPISODE_START_RETRIES Too Low**
**Problem**: Windows has 60 retries, Linux has 300

**Impact**: Windows may timeout before all players join

**Solution**: Increase to 300

---

## 📋 Action Items for Windows Port

### **High Priority**

1. ✅ **Remove `camera_alpha_follow` and `camera_bravo_follow` services**
   - These don't exist in Linux
   - Camera following handled internally

2. ✅ **Remove camera script volume mounts**
   - Remove `./camera/entrypoint.sh:/app/entrypoint.sh:ro`
   - Remove `./camera/launch_minecraft.py:/app/launch_minecraft.py:ro`
   - Scripts should be baked into image

3. ✅ **Add `script` service**
   - Utility container for debugging

4. ✅ **Update EPISODE_START_RETRIES**
   - Change from 60 → 300

### **Medium Priority**

5. ⚠️ **Review network configuration**
   - Windows can't use `network_mode: host`
   - Current port mapping approach is correct
   - Verify `host.docker.internal` works for all services

6. ⚠️ **Verify MC_HOST settings**
   - Senders: Should use `host.docker.internal` (Linux does this)
   - Cameras: Should use service name `mc` (Windows does this)

### **Low Priority**

7. 📝 **Update build_and_deploy_windows.ps1**
   - Ensure it matches `run_stack.sh` flow
   - Add missing commands if any

---

## 🎯 Next Steps

1. **Apply fixes to `docker-compose-windows-fixed.yml`**
2. **Test the updated Windows setup**
3. **Verify camera following works without `_follow` services**
4. **Document any remaining differences**

---

## 📝 Notes

- Linux uses `network_mode: host` extensively - Windows can't do this
- Camera following in Linux is built into the camera image
- Windows setup had extra services that shouldn't exist
- Both setups should converge to same behavior with different network configs
