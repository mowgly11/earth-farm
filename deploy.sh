#!/bin/bash

echo "🚀 Pulling latest code from GitHub..."
git pull origin master

echo "🐳 Building Docker image..."
docker build -t earth-image .

echo "🧼 Removing old container (if exists)..."
docker rm -f earth-main-process 2>/dev/null || echo "No existing container to remove."

echo "📦 Starting new container..."
docker run -d --env-file .env --name earth-main-process earth-image

echo "✅ Deployment complete!"
