# Motionbus GTFS-RT Live Map (Cyprus)

Live bus map built with Vite + React + MapLibre, backed by a Node/Express proxy for GTFS-Realtime.

## Prerequisites

- Node.js >= 18
- npm (bundled with Node)

## Install

```sh
npm install
npm --prefix server install
```

Or run the combined script:

```sh
npm run install:all
```

## Run (dev)

```sh
npm run dev:all
```

This starts:
- Vite dev server at `http://localhost:5173`
- GTFS-RT proxy at `http://localhost:5174/gtfsrt/vehicle-positions`

## Environment

The proxy supports a production feed URL via `FEED_URL`.

```sh
FEED_URL="http://20.19.98.194:8328/Api/api/gtfs-realtime"
```

## Troubleshooting

- **Ports already in use**: Ensure nothing else is using `5173` or `5174`, or change the ports before running.
- **CORS or fetch errors**: Confirm the proxy is running and the frontend is calling `http://localhost:5174/gtfsrt/vehicle-positions`.
- **Install issues**: Remove `node_modules` and reinstall using `npm run install:all`.
