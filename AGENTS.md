# Photopti

Photopti is a desktop app for resizing and compressing batches of images on the local machine. It also makes one cropped cover image per batch. Built with Electron and Sharp. Plain JavaScript and CommonJS, with no bundler, no framework, and no TypeScript.

The repo is public: `adamaoc/photopti-app`. Keep personal data, local paths, and secrets out of commits, issues, and test fixtures.

The npm CLI with a similar name is a different repo (`adamaoc/photopti`). This app does not call it.

## Layout

| Path | What it holds |
| --- | --- |
| `main.js` | App lifecycle entry point |
| `main-process/` | Window, IPC handlers, file discovery, thumbnails, image processing, concurrency |
| `preload.js` | The only bridge to the renderer. Exposes `window.photopti` through `contextBridge`. |
| `renderer/` | HTML, CSS, UI logic, crop geometry |
| `assets/` | Logo, platform icons, demo screenshots used in the README |
| `build/` | macOS entitlements and the notarize hook |
| `test/` | Node test suite (`node --test`) |
| `e2e/` | Playwright tests that drive the real Electron app |
| `docs/RELEASE_CHECKLIST.md` | Release steps |

## Commands

Node 22.12 or newer.

```sh
npm ci              # install
npm start           # run the app (no hot reload)
npm run check       # syntax check, ESLint, Node tests
npm run test:e2e    # Electron end-to-end tests
npm run dist:mac    # package for macOS into dist/
```

`PHOTOPTI_DEVTOOLS=1 npm start` opens DevTools. Reload the window for renderer changes. Restart for main-process or preload changes.

CI runs `npm run check` on Node 22 and 24, plus the e2e job, on every push and pull request.

## Rules

- Run `npm run check` before calling work done. Run `npm run test:e2e` when the change touches a UI flow.
- Add or update a test under `test/` for any behavior that can run without a window. Extend `e2e/` for UI flows.
- Keep the security setup: `contextIsolation` on, `nodeIntegration` off, every renderer call through `preload.js` and a named IPC handler. Validate paths and input in the main process. `test/ipc-security.test.js` and `test/window.test.js` guard this.
- Never modify source images. Output goes to a separate folder and never overwrites an existing file.
- Prefer the existing modules over a new dependency. Sharp and `@img` must stay in `asarUnpack`, or the packaged app cannot load them.
- Signing and notarization credentials come from the environment only. Never commit them.
- Branch from `main`. Short imperative commit subjects.

## Install the Mac app locally

The copy in `/Applications/Photopti.app` is a local build, not a release. To replace it:

```sh
npm ci
npm run dist:mac -- --dir
rm -rf /Applications/Photopti.app
cp -R dist/mac-arm64/Photopti.app /Applications/
```

Without Apple credentials in the environment the build is ad-hoc signed and notarization is skipped. That is fine for this machine.

## Issues

Defects go to GitHub issues on `adamaoc/photopti-app` with the `snag` label. Search open issues first. Use `SECURITY.md` for anything sensitive, not a public issue.
