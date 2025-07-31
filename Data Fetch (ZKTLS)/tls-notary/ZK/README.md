# TLSNotary Demo with Zero-Knowledge Proofs

This project demonstrates how to use TLSNotary with Zero-Knowledge Proofs to notarize TLS requests and verify the proofs without revealing sensitive data.

## Overview

The ZK module provides a comprehensive demonstration of TLSNotary's capabilities with Zero-Knowledge Proofs. It:
- Fetches data from an OpenBanking API
- Notarizes the TLS request using TLSNotary
- Generates Zero-Knowledge Proofs for selective disclosure
- Verifies the proof while maintaining data privacy
- Provides a React-based user interface

## Configuration

- Server URL: `https://openbanking-api-826260723607.europe-west3.run.app/users/aaa/credit-score`
- Notary Server: `https://notary.pse.dev/v0.1.0-alpha.10`

## Running the UI Demo

To run the UI demo:

```bash
npm install
npm run dev
```

Then open your browser to the URL shown in the console (usually http://localhost:8080).

> 🔴 **IMPORTANT**: Doesn't work in Safari. Use Google Chrome browser.