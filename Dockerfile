FROM oven/bun:1.2

# Metadata labels
LABEL org.opencontainers.image.title="Earth Farm Bot"
LABEL org.opencontainers.image.description="Discord farming game bot"
LABEL org.opencontainers.image.source="https://github.com/your-repo/earth-farm"

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install fontconfig for canvas image generation (prevents font warnings)
RUN apt-get update && apt-get install -y \
    fontconfig \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first (better layer caching)
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install --production

# Copy source code
COPY . .

# Create non-root user and set ownership
RUN chown -R bun:bun /app

# Switch to non-root user (security best practice)
USER bun

# Start the bot
CMD ["bun", "run", "bot"]