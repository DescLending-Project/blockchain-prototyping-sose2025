# Build stage: Compile TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Debug: List directory contents to verify files are copied
RUN ls -la

# Copy package files and install dependencies with improved error handling
COPY package.json package-lock.json* ./
RUN echo "Installing npm dependencies..." && \
    npm config list && \
    npm ci --verbose || (echo "npm ci failed" && exit 1)

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript to JavaScript
RUN npm run build

# Production stage: Create minimal runtime image
FROM node:20-alpine AS runtime

# Install curl for health checks
RUN apk add --no-cache curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs nodeuser

WORKDIR /app

# Copy only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist/ ./dist/

# Use non-root user
USER nodeuser

# Expose the service port
EXPOSE 8081

# Start the service
CMD ["node", "dist/index.js"]