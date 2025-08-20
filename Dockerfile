FROM node:22

RUN apt-get update && apt-get install -y --no-install-recommends \
    git build-essential python3 python-is-python3 pkg-config \
    libx11-dev libxi-dev libxext-dev \
    libgl1-mesa-dev libglu1-mesa-dev libegl1-mesa-dev libgles2-mesa-dev \
    libxrandr-dev libxinerama-dev libxcursor-dev \
  && rm -rf /var/lib/apt/lists/*

# Helps some node-gyp flows, though the shim above is the key
ENV PYTHON=/usr/bin/python3

WORKDIR /usr/src/app

# Install dependencies first to leverage Docker layer caching
COPY package.json ./
RUN npm install 

# Copy the bot script
COPY sender.js ./


CMD ["node", "sender.js"]
