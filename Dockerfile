FROM node:22

# OS deps for node-gyp + node-canvas + headless WebGL
RUN apt-get update && apt-get install -y --no-install-recommends \
    git build-essential python3 python3-pip python3-venv python-is-python3 pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    libx11-dev libxi-dev libxext-dev libxrandr-dev libxinerama-dev libxcursor-dev \
    # GL dev headers
    libgl1-mesa-dev libglu1-mesa-dev libegl1-mesa-dev libgles2-mesa-dev \
    # GL runtime (llvmpipe/DRI/EGL/GBM/OSMesa)
    libgl1-mesa-dri libegl1 libgles2 libgbm1 libosmesa6 \
    # Xvfb + diagnostics
    xvfb x11-utils mesa-utils \
  && rm -rf /var/lib/apt/lists/*

# Force software Mesa (llvmpipe) and sensible GL versions
ENV LIBGL_ALWAYS_SOFTWARE=1
ENV GALLIUM_DRIVER=llvmpipe
ENV MESA_GL_VERSION_OVERRIDE=3.3
ENV MESA_GLSL_VERSION_OVERRIDE=330

# (Optional) library lookup hints
ENV LIBGL_DRIVERS_PATH=/usr/lib/x86_64-linux-gnu/dri
ENV LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/lib/aarch64-linux-gnu:/usr/lib/x86_64-linux-gnu
ENV PKG_CONFIG_PATH="/usr/lib/aarch64-linux-gnu/pkgconfig:/usr/lib/pkgconfig:/usr/share/pkgconfig"


# Helps some node-gyp flows, though the shim above is the key
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

WORKDIR /usr/src/app

# Install dependencies first to leverage Docker layer caching
COPY package.json ./
RUN npm install 
COPY requirements.txt ./
RUN python -m pip install --upgrade pip setuptools wheel && \
    python -m pip install --no-cache-dir -r requirements.txt

# Copy the bot script
COPY . ./


CMD ["xvfb-run", "--auto-servernum", "--server-args=-screen 0 1280x720x24 -ac +extension GLX +render -noreset", "python3", "run.py", "--name", "Bot", "--target", "village", "--output_path", "/output"]
