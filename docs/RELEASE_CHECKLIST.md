# Release checklist

## Prepare

- [ ] Confirm the working tree contains only intended changes.
- [ ] Review dependency updates and run `npm audit`; assess each finding rather than applying forced upgrades blindly.
- [ ] Update the semantic version in `package.json` and `package-lock.json`.
- [ ] Update release notes with changes, known limitations, and supported platforms.
- [ ] Run `npm ci` from a clean checkout and then `npm run check`.
- [ ] Confirm no credentials, local paths, logs, generated artifacts, or sample personal images are tracked.

## Package and test

- [ ] Build on each release platform with `npm run dist:mac`, `npm run dist:win`, or `npm run dist:linux`.
- [ ] Sign Windows and macOS artifacts; notarize macOS artifacts using CI or local environment secrets.
- [ ] Inspect packaged contents and scan artifacts with platform-appropriate security tooling.
- [ ] Install each package on a clean supported system.
- [ ] Verify file and folder selection, thumbnails, resize by width and percentage, rename, custom output location, cover crop presets and free crop, cancellation, and a forced file-level error.
- [ ] Confirm source images remain unchanged and output naming does not overwrite existing files.
- [ ] Confirm macOS Gatekeeper and Windows SmartScreen behavior matches the release notes.

## Publish

- [ ] Tag the exact tested commit as `v<version>`.
- [ ] Create a GitHub release with checksums and the tested artifacts.
- [ ] Confirm download links and installation notes from a signed-out browser.
- [ ] Monitor issues after release and use a GitHub security advisory for sensitive reports.
