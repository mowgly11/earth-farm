#!/bin/bash
# Earth Farm Bot - Deployment Script
# Builds with versioned image tag and cleans up old images

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Generate version tag (timestamp + short git hash if available)
if command -v git &> /dev/null && git rev-parse --git-dir &> /dev/null; then
    GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    TAG="$(date +%Y%m%d-%H%M)-${GIT_HASH}"
else
    TAG="$(date +%Y%m%d-%H%M%S)"
fi

echo -e "${YELLOW}╔══════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║    Earth Farm Bot - Deploy Script    ║${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════╝${NC}"
echo ""

# Pull latest code
echo -e "${YELLOW}Step 1/5:${NC} Pulling latest code..."
git pull origin master || echo "Git pull skipped or failed"
echo ""

# Export TAG for docker-compose
export TAG
echo -e "� Building image with tag: ${GREEN}earth-farm:${TAG}${NC}"
echo ""

# Build new image with version tag
echo -e "${YELLOW}Step 2/5:${NC} Building new image..."
docker compose build --no-cache

# Also tag as latest for convenience
echo -e "${YELLOW}Step 3/5:${NC} Tagging as latest..."
docker tag "earth-farm:${TAG}" "earth-farm:latest" 2>/dev/null || true

# Stop old container and start new
echo -e "${YELLOW}Step 4/5:${NC} Restarting container..."
docker compose down 2>/dev/null || true
export TAG=latest  # Use latest for running
docker compose up -d

# Clean up old/dangling images
echo -e "${YELLOW}Step 5/5:${NC} Cleaning up old images..."
echo ""

# Prune dangling images
docker image prune -f

# Show current images
echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo -e "Built image: ${GREEN}earth-farm:${TAG}${NC}"
echo -e "Container: ${GREEN}earth-main-process${NC}"
echo ""
echo -e "${YELLOW}Current images:${NC}"
docker images earth-farm --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}\t{{.Size}}"
echo ""
echo -e "View logs: ${GREEN}docker logs -f earth-main-process${NC}"
