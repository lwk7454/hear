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

# Copy built artifacts and configuration
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./package.json
COPY --from=builder /app/packages/db ./../../packages/db
COPY --from=builder /app/package.json ../../package.json
COPY --from=builder /app/pnpm-lock.yaml ../../pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ../../pnpm-workspace.yaml

# Install production dependencies and generate prisma client
RUN npm install -g pnpm && \
    pnpm install --prod && \
    pnpm --filter db run generate

EXPOSE 8000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
