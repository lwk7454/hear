FROM node:22-slim AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace configuration
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/db/package.json ./packages/db/

# Install dependencies
RUN pnpm install --filter server...

# Copy source code
COPY apps/server ./apps/server
COPY packages/db ./packages/db

# Generate Prisma client
RUN pnpm --filter db run generate

# Build the server
RUN pnpm --filter server run build

FROM node:22-slim

WORKDIR /app

# Install ffmpeg for audio processing
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./package.json
COPY --from=builder /app/packages/db ./packages/db

EXPOSE 8000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
