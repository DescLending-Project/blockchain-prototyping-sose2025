# TLS Notary Local Proxy Server

A WebSocket-based proxy server for TLS Notary that facilitates secure communication between the browser extension and target websites. This server acts as an intermediary for TLS connections, enabling the notarization process.

## Overview

The TLS Notary Local Proxy Server:
- Establishes secure WebSocket connections
- Handles TLS session management
- Facilitates the notarization process
- Provides an API for the browser extension to interact with

## Docker Image

The server is available as a Docker image for easy deployment and isolation.

### Building the Docker Image

To build the Docker image locally:

```bash
docker build -t tls-notary-proxy .
```

### Running the Docker Container

To run the container:

```bash
docker run -p 8090:8090 -p 8091:8091 tls-notary-proxy
```

This will start the proxy server and expose it on port 8080 on your host machine.

### Environment Variables

The following environment variables can be configured:

| Variable | Description                          | Default         |
|----------|--------------------------------------|-----------------|
| PORT | The port on which the server listens | 8090            |
| SOCKET_PORT | The port on which sockets created    | 8091            |
| CORS_ORIGIN | CORS origin setting                  | * (all origins) |
| WEB_SOCKET_HOST | WebSocket host                       | localhost       |

Example with custom configuration:

```bash
docker run -p 9000:9000 -p 9001:9001 \
  -e PORT=9000 \
  -e SOCKET_PORT=9001 \
  -e CORS_ORIGIN=https://example.com \
  -e WEB_SOCKET_HOST=proxy.example.com \
  tls-notary-proxy
```
