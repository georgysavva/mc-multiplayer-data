# EGL Headless GPU Rendering Requirements

This document describes the requirements and debugging procedures for running Minecraft with GPU-accelerated headless rendering using EGL and VirtualGL inside Docker containers.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Host Machine                              │
│  ┌─────────────┐  ┌─────────────┐                               │
│  │  RTX 4090   │  │  RTX 4090   │   NVIDIA Driver 580.95+       │
│  │   GPU 0     │  │   GPU 1     │   NVIDIA Container Toolkit    │
│  └──────┬──────┘  └──────┬──────┘                               │
│         │                │                                       │
│         └────────┬───────┘                                       │
│                  │                                               │
│  ┌───────────────▼───────────────┐                              │
│  │     Docker + nvidia runtime    │                              │
│  └───────────────┬───────────────┘                              │
│                  │                                               │
│  ┌───────────────▼───────────────────────────────────────────┐  │
│  │              Camera Container (per instance)               │  │
│  │  ┌─────────┐  ┌──────────────┐  ┌─────────────────────┐   │  │
│  │  │  Xvfb   │◄─┤  VirtualGL   │◄─┤  Minecraft (LWJGL)  │   │  │
│  │  │ :99     │  │  (EGL mode)  │  │  OpenGL rendering   │   │  │
│  │  └────┬────┘  └──────────────┘  └─────────────────────┘   │  │
│  │       │                                                    │  │
│  │  ┌────▼────┐  ┌──────────────┐                            │  │
│  │  │ x11grab │──► ffmpeg NVENC │──► .mp4 video              │  │
│  │  └─────────┘  └──────────────┘                            │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Host Requirements

### 1. NVIDIA Driver

Minimum version: 525.x (for CUDA 12.x support)

```bash
# Check driver version
nvidia-smi --query-gpu=driver_version --format=csv,noheader
```

### 2. NVIDIA Container Toolkit

Required for GPU passthrough to Docker containers.

```bash
# Install (one-time setup)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Configure Docker to use nvidia runtime
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### 3. Docker with NVIDIA Runtime

Verify the nvidia runtime is registered:

```bash
docker info | grep -i runtime
# Should show: Runtimes: io.containerd.runc.v2 nvidia runc
```

## Verification Commands

### Step 1: Verify Host GPU Access

```bash
nvidia-smi
```

Expected: Shows your GPU(s) with driver version and CUDA version.

### Step 2: Verify Docker GPU Access

```bash
docker run --rm --gpus all nvidia/cuda:12.3.2-base-ubuntu22.04 nvidia-smi
```

Expected: Same output as host `nvidia-smi`, showing GPUs accessible inside container.

## Usage with Orchestration

The GPU rendering is managed through `generate_compose.py` and `orchestrate.py`. You do NOT run Docker commands manually.

### Generate Compose Files with GPU Enabled

```bash
python3 generate_compose.py \
  --enable_gpu 1 \
  --gpu_count 2 \
  --gpu_mode egl \
  --data_dir /abs/path/to/data \
  --output_dir /abs/path/to/output \
  --camera_output_alpha_base /abs/path/to/camera_alpha \
  --camera_output_bravo_base /abs/path/to/camera_bravo \
  # ... other options
```

Key GPU flags:
- `--enable_gpu 1` - Enable GPU rendering for camera containers
- `--gpu_count 2` - Number of GPUs to distribute instances across (round-robin)
- `--gpu_mode egl` - Use EGL headless rendering (recommended)

### Start with Orchestrate

```bash
# Start all instances (--build automatically builds GPU image from Dockerfile.gpu)
python3 orchestrate.py start --build --logs-dir /path/to/logs

# Check status
python3 orchestrate.py status --logs-dir /path/to/logs

# View logs
python3 orchestrate.py logs --tail 50 --logs-dir /path/to/logs

# Stop all instances
python3 orchestrate.py stop
```

The `--build` flag triggers Docker to build images as needed, including the GPU camera image from `camera/Dockerfile.gpu` when `--enable_gpu 1` is set in `generate_compose.py`.

### Step 3: Verify GPU is Working (after start)

Once instances are running, verify GPU rendering in the logs:

```bash
# Check camera logs for GPU detection
grep -E "(GPU|EGL|NVENC)" /path/to/logs/docker-compose-000/camera_alpha_instance_0.log | head -10
```

Expected output:
```
[client] GPU rendering mode: egl
[client] GPU status:
NVIDIA GeForce RTX 4090, 24564 MiB, 20850 MiB
[client] Using EGL headless GPU rendering
[client] Launching Minecraft with VirtualGL (GPU acceleration)
[client] Using NVENC hardware encoding
```

## Debugging GPU Rendering

### Check Camera Container Logs

After starting with `orchestrate.py`, check the camera logs:

```bash
# Find camera logs
ls /path/to/logs/docker-compose-000/camera_*.log

# Check for GPU detection
grep -E "(GPU|EGL|NVENC|VirtualGL)" /path/to/logs/docker-compose-000/camera_alpha_instance_0.log
```

Expected output showing GPU is working:
```
[client] GPU rendering mode: egl
[client] GPU status:
NVIDIA GeForce RTX 4090, 24564 MiB, 20850 MiB
[client] Using EGL headless GPU rendering
[client] Launching Minecraft with VirtualGL (GPU acceleration)
[client] Using NVENC hardware encoding
```

### Check Video Encoding

Look for NVENC in the ffmpeg output within camera logs:

```bash
grep -i "encoder" /path/to/logs/docker-compose-000/camera_alpha_instance_0.log
```

Expected:
```
encoder         : Lavc58.134.100 h264_nvenc
```

If you see `libx264` instead, NVENC is not being used (fallback to CPU encoding).

### Common Issues

#### Issue: "could not select device driver"

```
docker: Error response from daemon: could not select device driver "" with capabilities: [[gpu]]
```

**Solution**: Configure Docker nvidia runtime:
```bash
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

#### Issue: "Cannot load libnvidia-encode.so.1"

NVENC library not accessible in container.

**Solution**: Ensure container has GPU access via compose config:
```yaml
runtime: nvidia
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          device_ids: ["0"]
          capabilities: ["gpu"]
```

#### Issue: Camera logs show "llvmpipe" or "Mesa/X.org"

VirtualGL is not routing OpenGL to the GPU.

**Check**: Ensure `GPU_MODE=egl` is set and VirtualGL is being used:
```bash
grep -E "(vglrun|VGL_DISPLAY|GPU_MODE)" /path/to/logs/docker-compose-000/camera_alpha_instance_0.log
```

#### Issue: Low FPS in recordings

**Check GPU utilization** while instances are running:
```bash
watch -n 1 nvidia-smi
```

If GPU utilization is low but CPU is high, VirtualGL may not be working correctly.

## GPU Mode Options

| Mode | Description | Use Case |
|------|-------------|----------|
| `egl` | EGL headless rendering (no X server needed) | **Recommended** for servers |
| `x11` | Uses host X server | When EGL doesn't work |
| `auto` | Try EGL, fallback to X11 | Automatic detection |

## Files Reference

| File | Purpose |
|------|---------|
| `camera/Dockerfile.gpu` | GPU-enabled camera container image |
| `camera/entrypoint_gpu.sh` | Startup script with VirtualGL and NVENC |
| `generate_compose.py` | Generates docker-compose with GPU config |
| `orchestrate.py` | Manages container lifecycle |

## Performance Expectations

With 2x RTX 4090 and GPU rendering enabled:

| Metric | CPU (OSMesa) | GPU (EGL + NVENC) |
|--------|--------------|-------------------|
| Minecraft FPS | ~10-20 | 60+ |
| Video Encoding | CPU (libx264) | GPU (h264_nvenc) |
| Parallel Instances | Limited by CPU | Limited by VRAM (~4-8 per GPU) |
| VRAM per Instance | N/A | ~2-3 GB |
