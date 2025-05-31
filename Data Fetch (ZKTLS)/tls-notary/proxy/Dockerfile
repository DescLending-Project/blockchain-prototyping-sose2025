# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm install --production

# Copy rest of the app
COPY . .

# Build TypeScript to JavaScript
RUN npm install -g typescript && tsc

# Expose desired port (e.g., 8080)
EXPOSE 8080

# Set the entrypoint (adjust if needed)
CMD ["node", "dist/index.js"]
