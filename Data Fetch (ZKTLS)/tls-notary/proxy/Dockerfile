# Stage 1: Build Stage
FROM node:20-slim AS build

WORKDIR /app

# Install curl to download wstcp later
RUN apt-get update && apt-get install -y curl && apt-get clean

# Install dev dependencies for building
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the TypeScript code
RUN npx tsc

# Stage 2: Runtime Stage
FROM node:20-slim AS runtime

WORKDIR /app

# Install curl and download wstcp
RUN apt-get update && apt-get install -y curl && apt-get clean
RUN curl -Lo /usr/local/bin/wstcp https://github.com/jedisct1/wstcp/releases/download/v0.0.4/wstcp-x86_64-linux \
    && chmod +x /usr/local/bin/wstcp

# Only install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled JavaScript from build stage
COPY --from=build /app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/index.js"]
