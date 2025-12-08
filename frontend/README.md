# Sourcify Monitor Frontend

A browser-based frontend for submitting contract verification to Sourcify using Vite.

## Features

- Submit contract verification to Sourcify from the browser
- Fetch contract bytecode from Nexus API
- Extract metadata hash from bytecode
- Fetch contract sources from IPFS
- Real-time logging and status updates
- Modern, responsive UI

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser to the URL shown in the terminal (usually `http://localhost:5173`)

## Usage

1. Enter the Chain ID (e.g., `23295` for testnet, `23294` for mainnet)
2. Enter the contract address (e.g., `0xD2ee7104bD3c482f032a278EE8424A8f6FeD3313`)
3. Click "Submit to Sourcify"
4. Watch the logs as the contract is processed and submitted

## Build

To build for production:

```bash
npm run build
```

The built files will be in the `dist` directory.

## Preview Production Build

```bash
npm run preview
```

