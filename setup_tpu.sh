sudo usermod -aG docker $USER
newgrp docker
docker ps

sudo apt-get install docker-compose-plugin
git clone https://github.com/georgysavva/mc-multiplayer-data.git
cd mc-multiplayer-data
pip install -r requirements-docker.txt