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


## Deploying purely on Vercel

You do **not** need to run `npm install` or `npm run build` on your Mac to deploy the web version. Push this repository to GitHub, import the repository in Vercel, and let Vercel run the install and build in its cloud builder.

This repo includes `vercel.json` so Vercel uses the Vite preset, installs only the dependencies needed for the web build, runs `npm run build:web`, and serves the generated `dist` folder. The rewrite sends unmatched browser paths back to `index.html` so the client app can render instead of returning a platform 404.

Recommended Vercel project settings if you prefer the dashboard UI:

- Framework Preset: `Vite`
- Install Command: `npm install --include=dev --omit=optional`
- Build Command: `npm run build:web`
- Output Directory: `dist`

Desktop-only Electron packages are marked as optional dependencies so Vercel can skip them during the web build while local desktop packaging can still install them when needed.
