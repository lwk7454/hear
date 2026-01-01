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

# Runner stage
FROM node:22-slim

WORKDIR /app

# Install ffmpeg for audio processing
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# Copy workspace configuration and packages needed for production
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/server/src ./apps/server/src
COPY --from=builder /app/packages/db ./packages/db

# Install production dependencies and generate prisma client
RUN pnpm install --prod --filter server... && \
    pnpm --filter db run generate

WORKDIR /app/apps/server

EXPOSE 8000

ENV NODE_ENV=production

CMD ["npx", "tsx", "src/index.ts"]
