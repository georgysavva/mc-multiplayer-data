FROM python:3.11-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    HOME=/root \
    LIBGL_ALWAYS_SOFTWARE=1 \
    MESA_GL_VERSION_OVERRIDE=3.3 \
    JAVA_BIN=/usr/lib/jvm/java-17-openjdk-amd64/bin/java

# Configure APT for better network reliability
RUN printf '%s\n' \
      'Acquire::Retries "5";' \
      'Acquire::By-Hash "yes";' \
      'Acquire::http::Pipeline-Depth "0";' \
      'Acquire::http::No-Cache "true";' \
      'Acquire::https::No-Cache "true";' \
      > /etc/apt/apt.conf.d/99network-tuning

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        openjdk-17-jre-headless \
        xvfb \
        x11vnc \
        fluxbox \
        novnc \
        websockify \
        ffmpeg \
        curl \
        ca-certificates \
        fonts-dejavu-core \
        libgl1-mesa-dri \
        libgl1-mesa-glx \
        libxi6 \
        libxrender1 \
        libxtst6 \
        libxrandr2 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir \
    minecraft-launcher-lib==6.5 \
    requests==2.31.0

WORKDIR /app

# Copy application scripts
COPY entrypoint.sh /app/entrypoint.sh
COPY launch_minecraft.py /app/launch_minecraft.py

RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]

