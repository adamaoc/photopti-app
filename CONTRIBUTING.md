# Contributing to Photopti

Thanks for helping improve Photopti. Keep changes focused, explain user-visible behavior, and include tests for behavior that can be exercised without a desktop session.

## Setup

Use Node.js 20 or 22 and npm:

```bash
git clone https://github.com/adamaoc/photopti-app.git
cd photopti-app
npm ci
npm run check
npm start
```

## Changes

1. Search existing issues before opening a duplicate. For substantial changes, open an issue before investing in implementation.
2. Create a short-lived branch from the default branch. Use a descriptive name such as `fix/heic-error-message`.
3. Follow the existing CommonJS and plain JavaScript style. Prefer small functions and existing modules over new dependencies.
4. Add or update Node tests under `test/`. Manually exercise affected Electron interactions when UI or packaging behavior changes.
5. Run `npm run check`. For release or packaging changes, also build the package for your host platform.
6. Use concise, imperative commit subjects. Keep formatting-only or unrelated refactors out of a functional change.

## Pull requests

Describe the problem and solution, link the issue when one exists, and complete the pull-request checklist. Include screenshots for visible UI changes. State exactly which automated and manual checks ran and disclose any limitations. A maintainer may ask for a smaller scope, additional tests, or platform verification before merge.

By contributing, you agree that your contribution is licensed under the repository's [MIT License](LICENSE). Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues through the private process in [SECURITY.md](SECURITY.md), not a public issue.
