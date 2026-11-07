FROM node:22

RUN apt-get update && apt-get install -y --no-install-recommends \
    git build-essential python3 python3-pip python3-venv python-is-python3 pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    libx11-dev libxi-dev libxext-dev libxrandr-dev libxinerama-dev libxcursor-dev \
    libgl1-mesa-dev libglu1-mesa-dev libegl1-mesa-dev libgles2-mesa-dev \
    libgl1-mesa-dri libegl1 libgles2 libgbm1 libosmesa6 \
    xvfb xauth x11-utils mesa-utils \
    ffmpeg \
  && rm -rf /var/lib/apt/lists/*

ENV DISPLAY=:99
ENV LIBGL_ALWAYS_SOFTWARE=1
ENV GALLIUM_DRIVER=llvmpipe
ENV MESA_GL_VERSION_OVERRIDE=3.3
ENV MESA_GLSL_VERSION_OVERRIDE=330
# (Optional) library lookup hints
ENV LIBGL_DRIVERS_PATH=/usr/lib/x86_64-linux-gnu/dri
ENV LD_LIBRARY_PATH=/usr/lib/aarch64-linux-gnu:/usr/lib/x86_64-linux-gnu
ENV PKG_CONFIG_PATH="/usr/lib/aarch64-linux-gnu/pkgconfig:/usr/lib/pkgconfig:/usr/share/pkgconfig"


# Helps some node-gyp flows, though the shim above is the key
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

WORKDIR /usr/src/app

# Install dependencies first to leverage Docker layer caching
COPY requirements-docker.txt ./
RUN python -m pip install --upgrade pip setuptools wheel && \
    python -m pip install --no-cache-dir -r requirements-docker.txt
COPY package.json ./
RUN npm install 
RUN npm i rcon-client
# These echo numbers are needed to trigger a rebuild of this image in the case a downstream dependency has changed.
RUN echo "52" && npm install github:georgysavva/mineflayer
RUN echo "52" && npm install github:daohanlu/mineflayer-pathfinder
# Install the viewer from a local clone instead of github: so we can pin webpack.
# Its prepare script floats on webpack ^5, and webpack 5.109.0 (2026-07-23)
# breaks the browser-bundle build with resolver ENOENT errors; git deps build in
# an isolated temp dir where no override from this package.json can reach them.
RUN echo "53" && git clone --depth 1 https://github.com/georgysavva/prismarine-viewer-colalab /opt/prismarine-viewer-colalab \
  && cd /opt/prismarine-viewer-colalab \
  && npm pkg set devDependencies.webpack=5.108.4 \
  && npm install \
  && cd /usr/src/app \
  && npm install /opt/prismarine-viewer-colalab
RUN echo "51" && npm install --save-exact minecraft-data@3.105.0
RUN npm install --save mineflayer-pvp
RUN npm install --save mineflayer-tool
RUN set -eux; \
  PKG_DIR="node_modules/prismarine-viewer-colalab"; \
  mkdir -p "$PKG_DIR/public/textures/1.16.4/entity"; \
  cp -r "$PKG_DIR/assets/skins" "$PKG_DIR/public/textures/1.16.4/entity/"
# Copy the bot script
COPY . ./
# Use a deterministic display


RUN chmod +x entrypoint_senders.sh
RUN chmod +x entrypoint_receiver.sh

CMD ["./entrypoint_sender.sh"]
