# Verifiable Data Fetching with TLS Notary

This project demonstrates a method for securely fetching data using **TLS Notary** for verifiability, with support for Zero-Knowledge Proofs to maintain data privacy.

## Overview

TLS Notary enables secure and verifiable data fetching from web sources, providing cryptographic proofs that the data was received from a specific source without modification. This implementation includes Zero-Knowledge Proof capabilities for selective disclosure of sensitive information.

**Key Features:**
- Ensures the integrity and authenticity of fetched data
- Leverages TLS Notary to provide cryptographic proof for the data received
- Supports Zero-Knowledge Proofs for privacy-preserving verification
- Useful for applications requiring trustless proof of data origin

## Project Structure

This repository contains several subprojects that work together:

### [Browser Extension](./browser-extension)
A Chrome extension that allows users to capture and verify TLS connections, providing a user-friendly interface for the TLS Notary protocol.

### [Server](./server)
A WebSocket-based proxy server that facilitates secure communication between the browser extension and target websites.

### [Shared Library](./shared)
A shared library providing common functionality, services, and utilities used across the TLS Notary ecosystem.

### [ZK Module](./ZK)
A demonstration of TLS Notary with Zero-Knowledge Proofs, showing how to notarize TLS requests and verify proofs without revealing sensitive data.

## Getting Started

Each subproject has its own README with specific instructions. To get started with the complete system:

1. Set up the shared library first
2. Deploy the server component
3. Install the browser extension
4. Run the ZK demo to see the complete flow

See individual subproject READMEs for detailed instructions.
