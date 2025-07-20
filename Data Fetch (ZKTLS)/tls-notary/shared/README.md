# TLS Notary Shared Library

A shared library providing common functionality for TLS Notary projects. This module contains reusable code, services, and utilities that are used across the TLS Notary ecosystem.

## Overview

The TLS Notary Shared Library:
- Provides core TLS Notary services and interfaces
- Implements common utilities for TLS session management
- Offers shared types and configurations
- Enables consistent functionality across different TLS Notary components

## Components

The shared library includes several key components:

### Services

- `ITLSNotaryService`: Interface for TLS Notary service implementation
- `MockTLSNotaryService`: Mock implementation for testing
- `TunnelService`: Service for establishing secure tunnels

### Utilities

- Common utility functions for handling TLS sessions
- Helper functions for cryptographic operations
- Shared configuration management

## Installation

To install the shared library in a TLS Notary project:

```bash
npm install
```

## Usage

The shared library is used as a dependency in other TLS Notary projects. Import the required components:

```typescript
import { ITLSNotaryService } from 'tls-notary-shared/services/ITLSNotaryService';
import { config } from 'tls-notary-shared/config';
```

## Building

To build the shared library:

```bash
npm run build
```

This will compile the TypeScript files and copy necessary assets to the `dist` directory.