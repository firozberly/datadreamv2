# GRID/SIGNAL

GRID/SIGNAL is an offline-first data-driven audio visualizer. Drop in a CSV/XLS/XLSX dataset, add an audio track, and the app generates a deterministic brutalist identity that reacts to the track in real time.

## Core flow

1. Upload a dataset to seed the visual identity.
2. Upload an audio file to drive motion through the browser audio analyser.
3. Tune style, density, shape mix, rotation, reactivity, scale, glitch, trails, and palette.
4. Export short WebM clips from the in-browser canvas recorder, or screen-record longer sets with OBS/macOS recording.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
