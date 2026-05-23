set -e

# 1) Scaffold Vite React TS (safe if already initialized: skips if package.json exists)
if [ ! -f package.json ]; then
  npm create vite@latest . -- --template react-ts
fi

# 2) Install dependencies
npm install
npm install electron electron-builder three papaparse xlsx ffmpeg-static
npm install -D @types/node concurrently wait-on

# 3) Create folders
mkdir -p electron .github/workflows

# 4) Write Electron main
cat > electron/main.js <<'EOF'
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
EOF

# 5) Write preload
cat > electron/preload.js <<'EOF'
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('studio', { ping: () => 'pong' });
EOF

# 6) Replace App.tsx
cat > src/App.tsx <<'EOF'
import './App.css'

function App() {
  return (
    <div style={{ minHeight: '100vh', background: '#0b1020', color: '#fff', padding: 24 }}>
      <h1>DataDream Studio</h1>
      <p>Import a dataset and an audio file to begin.</p>
      <p>Baseline build is ready. Next step: full audio-reactive visuals UI.</p>
    </div>
  )
}

export default App
EOF

# 7) Ensure Vite outDir for Electron packaged load
cat > vite.config.ts <<'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/renderer' }
})
EOF

# 8) Patch package.json scripts/build config
node - <<'EOF'
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));

p.name = 'datadream-studio';
p.version = p.version || '0.1.0';
p.description = 'Offline macOS app for data-driven audio-reactive visuals';
p.main = 'electron/main.js';
p.author = 'DataDream Studio';
p.license = p.license || 'MIT';

p.scripts = {
  ...(p.scripts || {}),
  dev: "concurrently \"vite\" \"wait-on tcp:5173 && electron .\"",
  build: "vite build",
  start: "electron .",
  "dist:mac": "npm run build && electron-builder --mac dmg"
};

p.build = {
  appId: "com.datadream.studio",
  productName: "DataDream Studio",
  files: [
    "dist/**/*",
    "electron/**/*",
    "node_modules/ffmpeg-static/**/*",
    "package.json"
  ],
  mac: {
    target: ["dmg"],
    category: "public.app-category.graphics-design",
    artifactName: "${productName}-${version}-${arch}.${ext}"
  },
  dmg: {
    title: "DataDream Studio Installer"
  }
};

fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
EOF

# 9) Add GitHub Actions macOS DMG build workflow
cat > .github/workflows/build-macos-dmg.yml <<'EOF'
name: Build macOS DMG

on:
  workflow_dispatch:
  push:
    branches: [main]

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install

      - name: Build app
        run: npm run build

      - name: Build DMG
        run: npm run dist:mac

      - name: Upload DMG artifacts
        uses: actions/upload-artifact@v4
        with:
          name: datadream-macos-dmg
          path: |
            dist/*.dmg
            dist/*.zip
            release/*.dmg
            release/*.zip
          if-no-files-found: warn
EOF

# 10) Quick sanity check
npm run build

# 11) Commit and push
git add .
git commit -m "Bootstrap DataDream Studio baseline with Electron and macOS DMG workflow" || true
git push origin main

echo "DONE: Go to GitHub -> Actions -> Build macOS DMG -> Run workflow"
