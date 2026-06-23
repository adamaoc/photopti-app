# Local Development Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Running the Application](#running-the-application)
4. [Development Workflow](#development-workflow)
5. [Project Structure](#project-structure)
6. [Debugging](#debugging)
7. [Testing](#testing)
8. [Common Issues & Troubleshooting](#common-issues--troubleshooting)
9. [Development Best Practices](#development-best-practices)
10. [Environment Variables](#environment-variables)

---

## Prerequisites

### Required Software

**Node.js and npm:**
- **Node.js:** Version 18.0.0 or higher
- **npm:** Version 9.0.0 or higher (comes with Node.js)
- **Verify installation:**
  ```bash
  node --version  # Should show v18.x.x or higher
  npm --version   # Should show 9.x.x or higher
  ```

**Platform-Specific Requirements:**

**macOS:**
- macOS 10.13 (High Sierra) or later
- Xcode Command Line Tools (required for Sharp native dependencies)
  ```bash
  xcode-select --install
  ```
- If you encounter issues, ensure you have:
  - Xcode (full version) or Command Line Tools
  - System libraries for image processing

**Windows:**
- Windows 10 or later
- Visual Studio Build Tools (for native dependencies)
  - Download from: https://visualstudio.microsoft.com/downloads/
  - Install "Desktop development with C++" workload
- Python 2.7 or 3.x (may be required for some native modules)

**Linux:**
- Ubuntu 18.04+ / Debian 10+ / Fedora 30+ / or equivalent
- Build tools:
  ```bash
  # Ubuntu/Debian
  sudo apt-get install build-essential libvips-dev
  
  # Fedora
  sudo dnf install gcc-c++ vips-devel
  
  # Arch Linux
  sudo pacman -S base-devel vips
  ```

### Recommended Tools

**Code Editor:**
- Visual Studio Code (recommended)
- Or any editor with JavaScript/Node.js support

**Useful VS Code Extensions:**
- ESLint
- Prettier
- JavaScript/TypeScript support
- Electron snippets

**Git:**
- Git for version control
- GitHub account (if contributing)

**Terminal:**
- macOS: Terminal.app or iTerm2
- Windows: PowerShell, Git Bash, or Windows Terminal
- Linux: Default terminal or your preferred shell

---

## Initial Setup

### 1. Clone the Repository

```bash
# Navigate to your workspace
cd /path/to/your/workspace

# Clone the repository (if applicable)
git clone <repository-url>
cd photopti
```

**OR** if you're already in the project directory:

```bash
# Ensure you're in the project root
pwd  # Should show: .../photopti
```

### 2. Install Dependencies

```bash
# Install all dependencies (production and development)
npm install
```

**What this installs:**
- **Production Dependencies:**
  - `heic-convert` (^2.1.0) - HEIC/HEIF conversion support
  - `sharp` (^0.33.4) - Image processing library

- **Development Dependencies:**
  - `electron` (^30.0.0) - Electron framework
  - `electron-builder` (^24.13.3) - Build and packaging tool
  - `@electron/notarize` (^2.2.0) - macOS notarization

**Expected Output:**
```
added 250 packages, and audited 251 packages in 30s
```

**If installation fails:**

**macOS - Sharp Installation Issues:**
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Rebuild Sharp
npm rebuild sharp

# If still failing, try clearing cache
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**Windows - Sharp Installation Issues:**
```bash
# Ensure Visual Studio Build Tools are installed
# Then rebuild Sharp
npm rebuild sharp

# If using npm 7+, you may need:
npm install --build-from-source sharp
```

**Linux - Sharp Installation Issues:**
```bash
# Install system dependencies
sudo apt-get install libvips-dev  # Ubuntu/Debian
# OR
sudo dnf install vips-devel       # Fedora

# Rebuild Sharp
npm rebuild sharp
```

### 3. Verify Installation

```bash
# Check if Electron is installed correctly
npx electron --version

# Should output: v30.x.x

# Check if Sharp is working
node -e "require('sharp'); console.log('Sharp OK')"

# Should output: Sharp OK
```

### 4. Verify Logo Path (Development)

The app looks for the logo in this order:
1. `assets/logo-lg-200.png` (local assets folder)
2. `../cli-projects/photopti/Logo/logo-lg-200.png` (relative to repo)

**Check if logo exists:**
```bash
# Option 1: Check local assets
ls -la assets/logo-lg-200.png

# Option 2: Check CLI project path (if in monorepo)
ls -la ../cli-projects/photopti/Logo/logo-lg-200.png
```

**If logo is missing:**
- Copy logo to `assets/logo-lg-200.png`, OR
- Ensure the CLI project path exists with the logo file

---

## Running the Application

### Basic Startup

```bash
npm start
```

**What happens:**
1. Electron loads the main process (`main.js`)
2. Creates a BrowserWindow
3. Loads the renderer (`renderer/index.html`)
4. Application window opens

**Expected Behavior:**
- Window opens at 1440x900 pixels
- Dark theme UI appears
- Logo loads in header
- Dropzone is ready for drag-and-drop

### Development Mode Features

**Hot Reload:**
- **Renderer changes:** Press `Cmd+R` (macOS) or `Ctrl+R` (Windows/Linux) to refresh
- **Main process changes:** Restart the application (`Ctrl+C` then `npm start`)

**Developer Tools:**
- Access via menu: `View → Toggle Developer Tools`
- Or use keyboard shortcut: `Cmd+Option+I` (macOS) or `Ctrl+Shift+I` (Windows/Linux)
- Console logs from renderer appear here
- Main process logs appear in terminal

### Running with Debug Flags

**Enable DevTools on startup:**
```bash
# macOS/Linux
ELECTRON_ENABLE_LOGGING=1 npm start

# Windows (PowerShell)
$env:ELECTRON_ENABLE_LOGGING=1; npm start
```

**Run with verbose logging:**
```bash
# macOS/Linux
DEBUG=* npm start

# Windows
set DEBUG=* && npm start
```

---

## Development Workflow

### Making Changes

**1. Renderer Process (UI) Changes:**

Files: `renderer/index.html`, `renderer/renderer.js`, `renderer/styles.css`

```bash
# Make your changes to renderer files
# Then refresh the window: Cmd+R / Ctrl+R
```

**Example: Changing a color:**
```css
/* renderer/styles.css */
:root {
  --accent: #ff6b6b; /* Changed from #5a8eca */
}
```
Save → Refresh window → See changes immediately

**2. Main Process Changes:**

Files: `main.js`, `preload.js`

```bash
# Make your changes
# Stop the app: Ctrl+C
# Restart: npm start
```

**Example: Adding a new IPC handler:**
```javascript
// main.js
ipcMain.handle('new-feature', async () => {
  return 'Hello from main process';
});

// preload.js
contextBridge.exposeInMainWorld('photopti', {
  // ... existing API
  newFeature: () => ipcRenderer.invoke('new-feature'),
});
```

**3. Adding Dependencies:**

```bash
# Production dependency
npm install <package-name>

# Development dependency
npm install --save-dev <package-name>

# Restart app after installing
npm start
```

### File Watching (Future Enhancement)

Currently, the app doesn't have automatic hot reload. To implement:

1. Install `electron-reloader` or `nodemon`
2. Add to `main.js`:
   ```javascript
   try {
     require('electron-reloader')(module);
   } catch (_) {}
   ```

### Git Workflow

**Before making changes:**
```bash
# Create a new branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

**After making changes:**
```bash
# Check what changed
git status
git diff

# Stage changes
git add .

# Commit
git commit -m "Description of changes"

# Push (if working with remote)
git push origin feature/your-feature-name
```

---

## Project Structure

### Directory Layout

```
photopti/
├── main.js              # Main process (entry point)
├── main-process/        # Main-process modules
│   ├── constants.js
│   ├── file-discovery.js
│   ├── image-processor.js
│   ├── ipc.js
│   ├── logo-paths.js
│   └── window.js
├── preload.js          # Preload script (IPC bridge)
├── package.json        # Dependencies and scripts
├── package-lock.json   # Locked dependency versions
├── README.md           # User documentation
│
├── renderer/           # Renderer process (UI)
│   ├── index.html      # HTML structure
│   ├── renderer.js     # UI logic and event handlers
│   └── styles.css      # Styling
│
├── assets/             # Application assets
│   ├── logo-lg-200.png
│   ├── photopti.icns
│   └── Photopti.iconset/
│
├── build/              # Build configuration
│   ├── entitlements.mac.plist
│   └── notarize.js
│
├── scripts/            # Local development checks
│   └── check-syntax.js
│
├── test/               # Node test runner coverage
│   ├── file-discovery.test.js
│   └── image-processor.test.js
│
├── dist/               # Build output (gitignored)
│   └── [platform builds]
│
├── node_modules/       # Dependencies (gitignored)
│
└── knowledge/          # Documentation
    ├── overview.md
    ├── local-development.md
    └── production.md
```

### Key Files Explained

**main.js:**
- Entry point for Electron main process
- Window management
- IPC handlers
- File system operations
- Image processing orchestration

**preload.js:**
- Runs in renderer context before page loads
- Exposes safe API to renderer via `contextBridge`
- Bridges main and renderer processes

**renderer/index.html:**
- UI structure and layout
- Semantic HTML
- Accessibility attributes

**renderer/renderer.js:**
- DOM manipulation
- Event handlers
- UI state management
- IPC communication (via preload API)

**renderer/styles.css:**
- Complete styling system
- CSS variables for theming
- Responsive design
- Animations

**package.json:**
- Project metadata
- Dependencies
- Scripts
- Build configuration

---

## Debugging

### Main Process Debugging

**Console Logging:**
```javascript
// main.js
console.log('Debug message');
console.error('Error message');
console.warn('Warning message');
```

**Output:** Appears in terminal where you ran `npm start`

**Debugger:**
```bash
# Run with Node.js debugger
node --inspect-brk=5858 node_modules/.bin/electron .

# Then attach debugger in VS Code:
# 1. Go to Run and Debug
# 2. Create launch.json:
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main Process",
      "type": "node",
      "request": "attach",
      "port": 5858,
      "protocol": "inspector"
    }
  ]
}
```

### Renderer Process Debugging

**Console Logging:**
```javascript
// renderer/renderer.js
console.log('Renderer debug');
console.table(arrayData);
console.dir(objectData);
```

**Output:** Appears in DevTools console

**Breakpoints:**
1. Open DevTools (`Cmd+Option+I` / `Ctrl+Shift+I`)
2. Go to Sources tab
3. Set breakpoints in your code
4. Interact with UI to trigger breakpoints

**Network Inspection:**
- DevTools → Network tab
- Monitor file loading
- Check for failed requests

**Element Inspection:**
- DevTools → Elements tab
- Inspect DOM
- Modify CSS in real-time
- See computed styles

### IPC Debugging

**Monitor IPC Messages:**
```javascript
// In main.js, add logging:
ipcMain.on('process-images', async (event, payload) => {
  console.log('IPC: process-images', payload);
  // ... rest of handler
});

// In preload.js, add logging:
contextBridge.exposeInMainWorld('photopti', {
  processImages: (paths, options) => {
    console.log('Preload: processImages', { paths, options });
    ipcRenderer.send('process-images', { paths, options });
  },
});
```

### Common Debugging Scenarios

**Image Processing Issues:**
```javascript
// Add detailed logging in processImages function
async function processImages(payload, onProgress) {
  console.log('Processing images:', payload);
  // ... add logs at each step
}
```

**File Path Issues:**
```javascript
// Log resolved paths
console.log('Resolved logo path:', resolveLogoPath());
console.log('Image paths:', files);
```

**UI State Issues:**
```javascript
// In renderer.js, log state changes
console.log('Dropped paths:', droppedPaths);
console.log('Image paths:', imagePaths);
```

---

## Testing

### Automated Checks

Run these from the `photopti-app` directory:

```bash
# Syntax-check JavaScript files
npm run lint

# Run Node unit tests
npm test

# Run all lightweight checks
npm run check
```

Current unit coverage focuses on main-process helper behavior: supported image detection, direct-folder discovery, dropped-file filtering, process option normalization, and output filename generation.

### Manual Testing Checklist

**Basic Functionality:**
- [ ] App launches without errors
- [ ] Logo loads correctly
- [ ] Window is resizable
- [ ] UI elements are visible and styled correctly

**Drag-and-Drop:**
- [ ] Single folder drop works
- [ ] Multiple file drop works
- [ ] Files from multiple folders handled correctly
- [ ] Thumbnails display correctly
- [ ] Thumbnail removal works

**Image Processing:**
- [ ] Resize to width works
- [ ] Resize by percentage works
- [ ] Quality slider works
- [ ] Rename functionality works
- [ ] Custom output folder works
- [ ] Progress bar updates correctly
- [ ] Completion message displays

**Error Handling:**
- [ ] Invalid files are skipped gracefully
- [ ] Error messages are displayed
- [ ] App doesn't crash on errors

**Cross-Platform:**
- [ ] Test on macOS (if available)
- [ ] Test on Windows (if available)
- [ ] Test on Linux (if available)

### Testing Image Processing

**Create Test Images:**
```bash
# Create a test directory
mkdir -p test-images

# Add various image formats:
# - PNG files
# - JPEG files
# - WebP files
# - Large images (> 5MB)
# - Small images (< 100KB)
# - Different aspect ratios
```

**Test Scenarios:**
1. **Single large folder:** Drop folder with 50+ images
2. **Mixed formats:** Drop folder with PNG, JPEG, WebP
3. **Invalid files:** Include non-image files
4. **Nested folders:** Test if subdirectories are processed (currently not supported)
5. **Edge cases:** Very large images, corrupted files

### Performance Testing

**Monitor Resource Usage:**
```bash
# macOS/Linux
top -pid $(pgrep -f electron)

# Windows
# Use Task Manager
```

**Test with Large Batches:**
- Process 100+ images
- Monitor memory usage
- Check processing time
- Verify no memory leaks

---

## Common Issues & Troubleshooting

### Issue: Sharp Installation Fails

**Symptoms:**
- `npm install` fails with Sharp errors
- `Error: Cannot find module 'sharp'` at runtime

**Solutions:**

**macOS:**
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Rebuild Sharp
npm rebuild sharp

# If on Apple Silicon, try:
npm config set sharp_binary_host "https://npm.taobao.org/mirrors/sharp"
npm rebuild sharp
```

**Windows:**
```bash
# Install Visual Studio Build Tools
# Then:
npm rebuild sharp

# Or install from source:
npm install --build-from-source sharp
```

**Linux:**
```bash
# Install system dependencies
sudo apt-get install libvips-dev  # Ubuntu/Debian

# Rebuild
npm rebuild sharp
```

### Issue: Logo Not Loading

**Symptoms:**
- Logo doesn't appear in header
- Console shows file not found errors

**Solutions:**

**Check logo path:**
```bash
# Verify logo exists
ls -la assets/logo-lg-200.png

# Or check CLI project path
ls -la ../cli-projects/photopti/Logo/logo-lg-200.png
```

**Fix:**
- Copy logo to `assets/logo-lg-200.png`, OR
- Ensure CLI project path exists with logo file

**Debug in code:**
```javascript
// In main.js, add logging:
console.log('Logo path:', resolveLogoPath());
console.log('Logo exists:', fs.existsSync(resolveLogoPath()));
```

### Issue: Window Doesn't Open

**Symptoms:**
- App starts but no window appears
- Terminal shows no errors

**Solutions:**

**Check for errors in terminal:**
```bash
# Run with verbose logging
DEBUG=* npm start
```

**Check main.js:**
- Verify `createWindow()` is called
- Check for errors in window creation
- Verify `app.whenReady()` is used

**Check renderer files:**
- Verify `renderer/index.html` exists
- Check for syntax errors in HTML/JS

### Issue: IPC Not Working

**Symptoms:**
- UI doesn't respond to actions
- Console shows IPC errors

**Solutions:**

**Verify preload script:**
```javascript
// Check if preload.js is loaded
console.log('Preload loaded:', window.photopti);
```

**Check context isolation:**
```javascript
// In main.js, ensure:
webPreferences: {
  preload: path.join(__dirname, "preload.js"),
  contextIsolation: true,
  nodeIntegration: false,
}
```

**Verify IPC handlers:**
```javascript
// In main.js, check handlers are registered
console.log('IPC handlers:', ipcMain.listenerCount('process-images'));
```

### Issue: Images Not Processing

**Symptoms:**
- Click "Process" but nothing happens
- No progress updates

**Solutions:**

**Check file paths:**
```javascript
// Add logging in processImages
console.log('Files to process:', files);
console.log('Output directory:', outputDir);
```

**Verify Sharp is working:**
```javascript
// Test Sharp directly
const sharp = require('sharp');
sharp('test-image.jpg')
  .resize(800)
  .jpeg({ quality: 80 })
  .toFile('output.jpg')
  .then(() => console.log('Sharp works!'))
  .catch(err => console.error('Sharp error:', err));
```

**Check file permissions:**
```bash
# Ensure write permissions on output directory
ls -la <output-directory>
```

### Issue: High Memory Usage

**Symptoms:**
- App uses excessive memory
- System becomes slow

**Solutions:**

**Current limitation:** Images processed sequentially, but thumbnails loaded all at once

**Temporary fix:**
- Limit thumbnail display (currently 200 max)
- Process smaller batches
- Close and reopen app between large batches

**Future improvement:** Implement lazy loading and streaming

### Issue: Build Fails

**Symptoms:**
- `npm run dist` fails
- Missing files or permissions errors

**Solutions:**

**Check build configuration:**
```json
// Verify package.json build config is correct
"build": {
  "files": [
    "main.js",
    "preload.js",
    "renderer/**/*",
    "assets/**/*"
  ]
}
```

**Verify all files exist:**
```bash
# Check required files
ls -la main.js preload.js
ls -la renderer/
ls -la assets/
```

**Clear build cache:**
```bash
rm -rf dist/
npm run dist
```

---

## Development Best Practices

### Code Style

**JavaScript:**
- Use modern ES6+ syntax
- Prefer `const` over `let`, avoid `var`
- Use arrow functions for callbacks
- Use template literals for strings
- Add JSDoc comments for functions

**Example:**
```javascript
/**
 * Processes a batch of images with the given options
 * @param {string[]} paths - Array of image file paths
 * @param {Object} options - Processing options
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Processing summary
 */
async function processImages(paths, options, onProgress) {
  // Implementation
}
```

### File Organization

**Keep files focused:**
- One responsibility per file
- Group related functionality
- Separate concerns (UI vs. logic)

**Naming conventions:**
- Files: `kebab-case.js` or `PascalCase.js` for components
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Classes: `PascalCase`

### Error Handling

**Always handle errors:**
```javascript
try {
  await processImages(payload, onProgress);
} catch (err) {
  console.error('Processing failed:', err);
  // Notify user
  webContents.send('process-complete', {
    ok: false,
    error: err.message
  });
}
```

**Provide user feedback:**
- Show error messages in UI
- Don't crash silently
- Log errors for debugging

### Performance

**Optimize image processing:**
- Process sequentially (current approach)
- Consider parallel processing for future
- Limit batch sizes if needed

**Optimize UI:**
- Limit thumbnail count (currently 200)
- Lazy load thumbnails if possible
- Debounce rapid events

### Security

**Follow Electron security best practices:**
- Context isolation enabled ✓
- Node integration disabled ✓
- Use preload script for IPC ✓
- Validate all inputs
- Sanitize file paths

### Git Practices

**Commit messages:**
```
feat: Add new feature description
fix: Fix bug description
docs: Update documentation
style: Code style changes
refactor: Code refactoring
test: Add or update tests
chore: Maintenance tasks
```

**Branch naming:**
- `feature/feature-name`
- `fix/bug-description`
- `docs/documentation-update`

---

## Environment Variables

### Development Environment Variables

Currently, the app doesn't use environment variables for development, but you can add them:

**Create `.env` file (optional):**
```bash
# .env (not committed to git)
LOG_LEVEL=debug
ENABLE_DEV_TOOLS=true
```

**Load in main.js:**
```javascript
// Install dotenv: npm install dotenv
require('dotenv').config();

// Use in code
if (process.env.ENABLE_DEV_TOOLS === 'true') {
  win.webContents.openDevTools();
}
```

**Add to .gitignore:**
```
.env
.env.local
```

### Platform-Specific Environment

**macOS:**
```bash
# Set environment variables
export ELECTRON_ENABLE_LOGGING=1
npm start
```

**Windows (PowerShell):**
```powershell
$env:ELECTRON_ENABLE_LOGGING=1
npm start
```

**Windows (CMD):**
```cmd
set ELECTRON_ENABLE_LOGGING=1
npm start
```

---

## Next Steps

After setting up local development:

1. **Read the Overview:** See `knowledge/overview.md` for architecture details
2. **Review Production Guide:** See `knowledge/production.md` for deployment
3. **Explore the Code:** Start with `main.js` and `renderer/renderer.js`
4. **Make Changes:** Follow the development workflow
5. **Test Thoroughly:** Use the testing checklist
6. **Contribute:** Follow Git best practices

---

**Document Version:** 1.0  
**Last Updated:** 2025  
**Maintained By:** Development Team
