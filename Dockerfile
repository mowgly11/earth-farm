FROM oven/bun:1.2

WORKDIR /app

# Install fontconfig for canvas image generation (prevents font warnings)
RUN apt-get update && apt-get install -y \
    fontconfig \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN bun install

COPY . .

CMD ["bun", "run", "bot"]