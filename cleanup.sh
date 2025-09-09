#!/bin/bash

# Emergency cleanup script to stop all Docker containers and clean up resources
# Use this if the orchestration script fails or you need to quickly stop everything

echo "🧹 Emergency cleanup: Stopping all Docker containers..."

# Stop all running containers
echo "Stopping all containers..."
docker stop $(docker ps -q) 2>/dev/null || echo "No running containers to stop"

# Remove all stopped containers
echo "Removing stopped containers..."
docker container prune -f

# Remove unused networks
echo "Removing unused networks..."
docker network prune -f

# Remove unused volumes (be careful with this!)
read -p "Do you want to remove unused volumes? This will delete data! (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Removing unused volumes..."
    docker volume prune -f
else
    echo "Skipping volume cleanup"
fi

# Show remaining containers and volumes
echo "Remaining containers:"
docker ps -a

echo "Remaining volumes:"
docker volume ls

echo "🎉 Cleanup complete!"
