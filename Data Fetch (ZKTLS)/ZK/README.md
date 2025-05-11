# TLSNotary Demo

This project demonstrates how to use TLSNotary to notarize TLS requests and verify the proofs.

## Overview

The demo fetches data from an OpenBanking API, notarizes the TLS request using TLSNotary, and verifies the proof. It provides both a React-based user interface and standalone functions for programmatic use.

## Standalone Functions

In addition to the React UI, this project provides standalone functions that can be used to generate and verify proofs programmatically.

### Using the Standalone Functions

The `generateProof` and `verifyProof` functions are available in the `src/generateProof.ts` file. These functions can be imported and used in your own code (works only for browser mode, not for nodejs)

## Configuration

The standalone functions use the same configuration as the UI:

- Server URL: `https://openbanking-api-826260723607.europe-west3.run.app/users/aaa/credit-score`
- Notary Server: `https://notary.pse.dev/v0.1.0-alpha.10`
- WebSocket Proxy: `ws://localhost:55688`

## Running the UI Demo

To run the UI demo:

```bash
npm install
./run_proxy.sh
npm run dev
```

Then open your browser to the URL shown in the console (usually http://localhost:8080).

> 🔴 **IMPORTANT**: Doesn't work in Safari. Use Google Chrome browser.