FROM node:20-slim

# Install dependencies for building Rust applications
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Rust and Cargo
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install wstcp using Cargo
RUN cargo install wstcp

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Environment variables with defaults
ENV PORT=8090
ENV SOCKET_PORT=8091
ENV CORS_ORIGIN=*
ENV WEB_SOCKET_HOST=127.0.0.1
ENV RUST_BACKTRACE=1

# Expose the port
EXPOSE $PORT
EXPOSE $SOCKET_PORT

# Start the server
CMD ["npm", "run", "serve"]