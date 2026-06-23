## Photopti (Desktop)

A simple Electron desktop app for batch image optimization, mirroring the existing `cli-projects/photopti` tool. Drag-and-drop a folder or a set of images, configure options, and process them into an `Opti/` folder.

### Features
- Resize by width (px) or percentage
- JPEG quality control
- Optional sequential renaming (e.g., `photo-001.jpg`)
- Outputs to `Opti/` in the dropped folder (customizable)
- Supported formats: `.png, .jpg, .jpeg, .webp, .gif, .tiff, .bmp, .avif`

---

### Prerequisites
- Node.js 18+ and npm
- On macOS, Sharp may need Xcode Command Line Tools and system libraries. If `sharp` install fails, run:
  ```bash
  xcode-select --install || true
  ```

---

### Development
Run the app in development mode with hot reload re-run (manual refresh):
```bash
cd electron-apps/photopti
npm install
npm start
```
- Drag-and-drop either a single folder (recommended) or multiple image files from the same folder.
- Output defaults to `<dropped-folder>/Opti`. You can change the folder name in the UI.

Logo note: In development, the app loads the logo from `cli-projects/photopti/Logo/logo-200.png` in this repository. Keep that file in place.

---

### Packaging (Distributables)
This project uses `electron-builder` to create installable apps for macOS, Windows, and Linux.

1) Install dev dependency:
```bash
npm install --save-dev electron-builder
```

2) Add these fields to `package.json` (if not already present):
```json
{
  "name": "photopti-desktop",
  "productName": "Photopti",
  "version": "1.0.0",
  "homepage": "https://ampnet.media",
  "main": "main.js",
  "build": {
    "appId": "com.yourdomain.photopti",
    "files": [
      "main.js",
      "preload.js",
      "renderer/**/*"
    ],
    "mac": {
      "category": "public.app-category.photography",
      "target": ["dmg","zip"]
    },
    "win": {
      "target": ["nsis","zip"]
    },
    "linux": {
      "target": ["AppImage","deb","tar.gz"],
      "category": "Graphics",
      "maintainer": "ampnet media <hello@ampnet.media>"
    }
  },
  "author": {
    "name": "ampnet media",
    "email": "hello@ampnet.media",
    "url": "https://ampnet.media"
  },
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder -mwl",
    "dist:mac": "electron-builder --mac",
    "lint": "node scripts/check-syntax.js",
    "test": "node --test",
    "check": "npm run lint && npm test"
  },
  "dependencies": {
    "heic-convert": "^2.1.0",
    "sharp": "^0.33.4"
  },
  "devDependencies": {
    "@electron/notarize": "^2.2.0",
    "electron": "^30.0.0",
    "electron-builder": "^24.13.3"
  }
}
```

3) Build the installers:
```bash
npm run dist
```
- Outputs will appear in `dist/`.
- macOS: `.dmg` and `.zip`
- Windows: `.exe` (NSIS installer) and `.zip`
- Linux: `.AppImage`, `.deb`, `.tar.gz`

For a local macOS replacement build only:
```bash
npm run dist:mac
```

Code signing:
- macOS and Windows may require code signing for seamless installation. If you have certificates, configure them per electron-builder docs.
- You can also build unsigned for testing. On macOS, you may need to right-click → Open.

---

### How it works
- The main process receives dropped paths and determines whether it’s a folder or files from one folder.
- Images are processed with `sharp` and output as JPEG to the `Opti/` folder (or your chosen name).
- Progress and completion status are sent to the renderer to update the UI.

---

### Troubleshooting
- Sharp install errors: ensure build tools are installed (`xcode-select --install` on macOS) and try `npm rebuild sharp`.
- If packaging fails on Apple Silicon, try:
  ```bash
  npm config set sharp_binary_host "https://npm.taobao.org/mirrors/sharp" # optional mirror
  npm rebuild sharp
  ```
- If the app can’t find the logo during development, verify `cli-projects/photopti/Logo/logo-200.png` exists.
