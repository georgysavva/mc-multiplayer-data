# Windows Compatibility for Camera Docker Images

## Overview

This directory contains Windows-compatible versions of the camera Docker files to work with Docker Desktop on Windows.

## Problem

The original camera Docker setup uses Linux shell scripts (`entrypoint.sh`, `build_and_push.sh`) that may have Windows line endings (CRLF) when edited on Windows. This causes issues when running in Linux containers.

## Solution

### 1. Dockerfile.windows

A Windows-compatible Dockerfile that:
- Includes `dos2unix` package to convert line endings
- Automatically converts `entrypoint.sh` from CRLF to LF before execution
- Maintains all original functionality from `Dockerfile`

**Key Changes:**
```dockerfile
# Install dos2unix for Windows compatibility
RUN apt-get install -y --no-install-recommends \
    ...
    dos2unix \
    ...

# Fix line endings for Windows compatibility and make executable
RUN dos2unix /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh
```

### 2. build_and_push_windows.ps1

A PowerShell script for Windows that:
- Replaces the bash script `build_and_push.sh`
- Uses `Dockerfile.windows` instead of `Dockerfile`
- Provides colored output and error handling
- Creates timestamped tags for versioning

**Usage:**
```powershell
cd camera
.\build_and_push_windows.ps1
```

## Files

| Original File | Windows Version | Purpose |
|--------------|-----------------|---------|
| `Dockerfile` | `Dockerfile.windows` | Docker image with dos2unix support |
| `build_and_push.sh` | `build_and_push_windows.ps1` | Build and push script |
| `entrypoint.sh` | *(same file)* | Automatically converted by Dockerfile.windows |

## Integration with docker-compose-windows-fixed.yml

The `docker-compose-windows-fixed.yml` file already references the correct image:

```yaml
camera_alpha:
  image: ojmichel/mineflayer-spectator-client:latest
  # ... rest of config
```

After building with `build_and_push_windows.ps1`, the image will be compatible with Windows Docker Desktop.

## Workflow

### For Local Development (Windows)

1. **Build the Windows-compatible camera image:**
   ```powershell
   cd camera
   .\build_and_push_windows.ps1
   ```

2. **Run the full stack:**
   ```powershell
   cd ..
   .\build_and_deploy_windows.ps1
   ```

### For Production/CI (Linux)

Use the original files:
```bash
cd camera
./build_and_push.sh
```

## Why dos2unix?

When you edit shell scripts on Windows, they get CRLF line endings (`\r\n`). Linux expects LF line endings (`\n`). Without conversion:

```
❌ /bin/sh: bad interpreter: No such file or directory
❌ /app/entrypoint.sh: line 2: $'\r': command not found
```

With `dos2unix`, the script is automatically fixed during Docker build.

## Technical Details

### Line Ending Conversion

The Dockerfile handles line ending conversion automatically:

1. Files are copied from Windows host (may have CRLF)
2. `dos2unix` converts CRLF → LF
3. Script becomes executable with correct line endings
4. Container runs without errors

### No Changes to entrypoint.sh

The `entrypoint.sh` file itself doesn't need modification. The Dockerfile handles the conversion automatically, so the same script works on both Windows and Linux.

## Troubleshooting

### Build fails with "dos2unix: command not found"

Make sure you're using `Dockerfile.windows`, not `Dockerfile`:

```powershell
docker build -f Dockerfile.windows -t ojmichel/mineflayer-spectator-client:latest .
```

### Script still fails with line ending errors

If you manually edited files after the Docker build, rebuild the image:

```powershell
.\build_and_push_windows.ps1
```

### Permission denied errors

The Dockerfile sets execute permissions after dos2unix:

```dockerfile
RUN dos2unix /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh
```

If issues persist, check that the COPY command succeeded.

## Maintenance

When updating camera scripts:

1. Edit `entrypoint.sh` or `launch_minecraft.py` as needed
2. Rebuild using `build_and_push_windows.ps1` on Windows
3. Or rebuild using `build_and_push.sh` on Linux
4. Both will produce compatible images

The dos2unix conversion is idempotent - it's safe to run on files that already have LF endings.
