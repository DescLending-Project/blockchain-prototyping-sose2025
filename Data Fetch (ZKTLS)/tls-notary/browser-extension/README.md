# TLS Notary Extension

A browser extension for TLS notary functionality. This extension allows you to capture and verify TLS connections, providing cryptographic proofs of the data exchanged. It integrates with the TLS Notary protocol to enable secure and verifiable data capture from web sources.

## Overview

The TLS Notary Extension enables users to:
- Capture HTTPS requests and responses
- Generate cryptographic proofs of the captured data
- Verify the authenticity of the data using the TLS Notary protocol
- Store and manage proofs for later verification

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v16 or higher)
- [npm](https://www.npmjs.com/) (usually comes with Node.js)
- Google Chrome browser (v88 or higher)

## Installation

1. Clone the repository (if you haven't already)
2. Navigate to the browser-extension directory
3. Install dependencies:

```bash
npm install
```

## Building the Extension
**IMPORTANT**: First, you need to build `shared` module of this repository

To build the extension, run:

```bash
npm run build
```

This will:
1. Clean the `dist` directory
2. Compile TypeScript files
3. Copy necessary assets to the `dist` directory
4. Generate the extension bundle in the `dist` directory

## Loading the Extension in Chrome

1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top-right corner
4. Click "Load unpacked"
5. Select the `dist` directory from your project folder
6. The TLS Notary Extension should now appear in your extensions list

If you make changes to the extension and rebuild it, you'll need to reload the extension in Chrome:
1. Go back to `chrome://extensions/`
2. Find the TLS Notary Extension
3. Click the refresh icon

## Usage

1. Click on the TLS Notary Extension icon in your browser toolbar to open the popup
2. In the "Capture" tab:
   - Enter the URL you want to capture
   - Select the HTTP method
   - Add any required headers
   - Enter a request body (for POST/PUT requests)
   - Click "Capture Request"
3. View your captured requests in the "Proofs" tab
4. Click on a proof to view details and verify it

## Troubleshooting

- If the extension doesn't load, check the console in Chrome DevTools for any errors
- Make sure all required files are properly copied to the `dist` directory
- If you encounter WASM-related issues, ensure that the `tlsn_wasm.js` and `tlsn_wasm_bg.wasm` files are correctly copied to the root of the `dist` directory

## Development

The extension is built using:
- TypeScript for type-safe JavaScript
- Webpack for bundling
- Chrome Extension Manifest V3

Key files:
- `src/popup/index.ts`: Main entry point for the popup UI
- `public/manifest.json`: Extension manifest file
- `webpack/webpack.config.js`: Webpack configuration
