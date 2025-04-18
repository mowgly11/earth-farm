FROM oven/bun:1.2

WORKDIR /app

COPY package*.json ./

RUN bun install

COPY . .

CMD ["bun", "run", "bot"]