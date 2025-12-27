# Motionbus GTFS-RT Live Map (Cyprus)

Live bus map built with Vite + React + MapLibre, backed by a small Node proxy for GTFS-Realtime.

## Install

```sh
npm install
npm --prefix server install
```

## Run (dev)

```sh
npm run dev:all
```

This starts:
- Vite dev server at `http://localhost:5173`
- GTFS-RT proxy at `http://localhost:5174/gtfsrt/vehicle-positions`
