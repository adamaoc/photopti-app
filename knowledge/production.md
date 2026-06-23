# Production Deployment Guide

## Table of Contents
1. [Pre-Production Checklist](#pre-production-checklist)
2. [Version Management](#version-management)
3. [Build Configuration](#build-configuration)
4. [Code Signing Setup](#code-signing-setup)
5. [macOS Production Build](#macos-production-build)
6. [Windows Production Build](#windows-production-build)
7. [Linux Production Build](#linux-production-build)
8. [Notarization (macOS)](#notarization-macos)
9. [Distribution](#distribution)
10. [Release Process](#release-process)
11. [Post-Release](#post-release)
12. [Troubleshooting Production Builds](#troubleshooting-production-builds)

---

## Pre-Production Checklist

### Before Building for Production

**Code Quality:**
- [ ] All features tested and working
- [ ] No console.log statements (or remove debug logs)
- [ ] Error handling is comprehensive
- [ ] Code is reviewed and approved
- [ ] No hardcoded development paths or URLs

**Version Management:**
- [ ] Version number updated in `package.json`
- [ ] Version number matches release notes
- [ ] Changelog updated

**Assets:**
- [ ] Logo files are present and correct
- [ ] Icons are properly formatted (.icns for macOS)
- [ ] All assets are included in build config

**Documentation:**
- [ ] README.md is up to date
- [ ] User documentation is complete
- [ ] Known issues documented

**Security:**
- [ ] No sensitive data in code
- [ ] Environment variables properly configured
- [ ] Code signing certificates ready (if applicable)

**Testing:**
- [ ] Tested on target platforms
- [ ] Tested with various image formats
- [ ] Tested edge cases
- [ ] Performance tested with large batches

---

## Version Management

### Semantic Versioning

Follow [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`

- **MAJOR:** Breaking changes
- **MINOR:** New features (backward compatible)
- **PATCH:** Bug fixes (backward compatible)

### Updating Version

**1. Update package.json:**
```json
{
  "version": "1.0.1",  // Update this
  "productName": "Photopti"
}
```

**2. Update build config (if needed):**
```json
{
  "build": {
    "appId": "com.photopti.app"
  }
}
```

**3. Update macOS About Panel (if needed):**
```javascript
// main.js
app.setAboutPanelOptions({
  applicationVersion: "1.0.1",  // Update this
  version: "1.0.1"              // Update this
});
```

**4. Create Git Tag:**
```bash
git tag -a v1.0.1 -m "Release version 1.0.1"
git push origin v1.0.1
```

### Version History Example

```
1.0.0 - Initial release
1.0.1 - Bug fixes
1.1.0 - New features
2.0.0 - Major update (breaking changes)
```

---

## Build Configuration

### Current Build Setup

The build configuration is in `package.json` under the `"build"` key:

```json
{
  "build": {
    "appId": "com.photopti.app",
    "productName": "Photopti",
    "icon": "assets/logo-lg-200.png",
    "asarUnpack": [
      "**/node_modules/sharp/**",
      "**/node_modules/@img/**"
    ],
    "npmRebuild": false,
    "files": [
      "main.js",
      "preload.js",
      "renderer/**/*",
      "assets/**/*"
    ],
    "extraResources": [
      {
        "from": "assets",
        "to": "assets",
        "filter": ["**/*"]
      }
    ]
  }
}
```

### Key Configuration Options

**appId:**
- Unique identifier for your app
- Format: `com.domain.appname`
- Used for code signing and app identification

**productName:**
- Display name of the application
- Appears in menus, about panel, etc.

**asarUnpack:**
- Files that should NOT be packed into ASAR archive
- Required for native modules (Sharp)
- Native binaries must be unpacked

**files:**
- Files to include in the build
- Use glob patterns
- Excludes node_modules by default (except unpacked)

**extraResources:**
- Files copied to `resources/` directory
- Accessible via `process.resourcesPath`
- Used for assets that need to be outside ASAR

---

## Code Signing Setup

### macOS Code Signing

**Requirements:**
- Apple Developer Account ($99/year)
- Code Signing Certificate
- Team ID

**1. Obtain Certificate:**

**Option A: Automatic (Recommended)**
- electron-builder can create certificates automatically
- Requires Apple ID credentials

**Option B: Manual**
1. Go to [Apple Developer Portal](https://developer.apple.com/account)
2. Certificates, Identifiers & Profiles
3. Create "Developer ID Application" certificate
4. Download and install in Keychain

**2. Configure Environment Variables:**

```bash
# Option 1: Apple ID + App-Specific Password
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="4Y7KA339Z3"  # Your team ID

# Option 2: API Key (Recommended for CI/CD)
export APPLE_API_KEY="AuthKey_XXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export APPLE_TEAM_ID="4Y7KA339Z3"
```

**3. Create App-Specific Password (if using Apple ID):**
1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in → App-Specific Passwords
3. Generate password for "Electron Builder"
4. Save password securely

**4. Create API Key (if using API method):**
1. Go to [Apple Developer Portal](https://developer.apple.com/account/resources/authkeys/list)
2. Create new key
3. Download `.p8` file (only available once)
4. Note Key ID and Issuer ID

### Windows Code Signing

**Requirements:**
- Code Signing Certificate (from trusted CA)
- Or use self-signed for testing

**Option 1: Purchased Certificate**
1. Purchase from: DigiCert, Sectigo, GlobalSign, etc.
2. Install certificate in Windows Certificate Store
3. Configure in `package.json`:
```json
{
  "build": {
    "win": {
      "certificateFile": "path/to/certificate.pfx",
      "certificatePassword": "password"
    }
  }
}
```

**Option 2: Self-Signed (Testing Only)**
```bash
# Create self-signed certificate
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365
```

**Note:** Self-signed certificates will show warnings to users.

### Linux Code Signing

Linux doesn't require code signing, but you can:
- Sign AppImages with GPG
- Sign DEB packages with GPG
- Not required for distribution

---

## macOS Production Build

### Prerequisites

- macOS (for building macOS apps)
- Xcode Command Line Tools installed
- Code signing certificate (for distribution)
- Apple Developer account (for notarization)

### Build Steps

**1. Clean Previous Builds:**
```bash
rm -rf dist/
```

**2. Set Environment Variables:**
```bash
# Required for notarization
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="4Y7KA339Z3"

# Or use API key method
export APPLE_API_KEY="AuthKey_XXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export APPLE_TEAM_ID="4Y7KA339Z3"
```

**3. Build for macOS:**
```bash
# Build DMG and ZIP
npm run dist -- --mac

# Or build specific format
npm run dist -- --mac dmg
npm run dist -- --mac zip
```

**4. Build Outputs:**

Located in `dist/`:
- `Photopti-1.0.0-arm64.dmg` - Disk image installer
- `Photopti-1.0.0-arm64.dmg.blockmap` - Update blockmap
- `Photopti-1.0.0-arm64-mac.zip` - ZIP archive
- `mac-arm64/Photopti.app/` - Application bundle

### Build Options

**Target Architecture:**
```bash
# Apple Silicon (ARM64) - default
npm run dist -- --mac

# Intel (x64)
npm run dist -- --mac --x64

# Universal (both architectures)
npm run dist -- --mac --universal
```

**Build Formats:**
- **DMG:** Disk image (recommended for distribution)
- **ZIP:** Archive (for direct download)

### Verification

**1. Check Code Signing:**
```bash
codesign --verify --deep --strict --verbose=2 dist/mac-arm64/Photopti.app
```

**Expected output:**
```
dist/mac-arm64/Photopti.app: valid on disk
dist/mac-arm64/Photopti.app: satisfies its Designated Requirement
```

**2. Check Entitlements:**
```bash
codesign --display --entitlements - dist/mac-arm64/Photopti.app
```

**3. Test the App:**
```bash
# Open the app
open dist/mac-arm64/Photopti.app

# Or install from DMG
open dist/Photopti-1.0.0-arm64.dmg
```

---

## Windows Production Build

### Prerequisites

- Windows (for building Windows apps)
- Or use macOS/Linux with Wine (limited support)
- Code signing certificate (optional, for distribution)

### Build Steps

**1. Clean Previous Builds:**
```bash
rm -rf dist/
```

**2. Build for Windows:**
```bash
# Build NSIS installer and ZIP
npm run dist -- --win

# Or build specific format
npm run dist -- --win nsis
npm run dist -- --win zip
```

**3. Build Outputs:**

Located in `dist/`:
- `Photopti Setup 1.0.0.exe` - NSIS installer
- `Photopti-1.0.0-arm64.zip` - ZIP archive
- `win-arm64-unpacked/` - Unpacked application

### Build Options

**Target Architecture:**
```bash
# ARM64 (Windows on ARM) - default
npm run dist -- --win

# x64 (Intel/AMD)
npm run dist -- --win --x64

# ia32 (32-bit)
npm run dist -- --win --ia32
```

**Build Formats:**
- **NSIS:** Windows installer (recommended)
- **ZIP:** Archive (portable)

### Verification

**1. Test the Installer:**
- Run `Photopti Setup 1.0.0.exe`
- Verify installation process
- Check Start Menu shortcut
- Verify uninstaller

**2. Test the App:**
- Launch from Start Menu
- Test all features
- Verify file associations (if configured)

---

## Linux Production Build

### Prerequisites

- Linux system (for building Linux apps)
- Or use Docker with Linux image
- Build tools installed

### Build Steps

**1. Clean Previous Builds:**
```bash
rm -rf dist/
```

**2. Build for Linux:**
```bash
# Build all formats
npm run dist -- --linux

# Or build specific format
npm run dist -- --linux AppImage
npm run dist -- --linux deb
npm run dist -- --linux tar.gz
```

**3. Build Outputs:**

Located in `dist/`:
- `Photopti-1.0.0-arm64.AppImage` - AppImage (portable)
- `photopti_1.0.0_arm64.deb` - Debian package
- `photopti-1.0.0-arm64.tar.gz` - Archive

### Build Options

**Target Architecture:**
```bash
# ARM64 - default
npm run dist -- --linux

# x64
npm run dist -- --linux --x64
```

**Build Formats:**
- **AppImage:** Portable, no installation needed
- **DEB:** Debian/Ubuntu package (recommended)
- **TAR.GZ:** Archive (manual installation)

### Verification

**1. Test AppImage:**
```bash
chmod +x Photopti-1.0.0-arm64.AppImage
./Photopti-1.0.0-arm64.AppImage
```

**2. Test DEB Package:**
```bash
# Install
sudo dpkg -i photopti_1.0.0_arm64.deb

# Or fix dependencies
sudo apt-get install -f

# Run
photopti
```

---

## Notarization (macOS)

### What is Notarization?

Apple's security process that scans apps for malicious content. Required for:
- Distribution outside Mac App Store
- Avoiding Gatekeeper warnings
- User trust

### Automatic Notarization

The app is configured for automatic notarization via `build/notarize.js`.

**Requirements:**
- Apple Developer account
- Code signing certificate
- Apple ID credentials OR API key

### Setup

**1. Configure Environment Variables:**

**Option A: Apple ID Method**
```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="4Y7KA339Z3"
```

**Option B: API Key Method (Recommended)**
```bash
export APPLE_API_KEY="AuthKey_XXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export APPLE_TEAM_ID="4Y7KA339Z3"
```

**2. Build with Notarization:**
```bash
npm run dist -- --mac
```

Notarization happens automatically after code signing.

### Notarization Process

1. **Code Sign:** App is signed with Developer ID
2. **Submit:** App submitted to Apple's notary service
3. **Scan:** Apple scans for malicious content
4. **Staple:** Ticket stapled to app (if successful)
5. **Complete:** App ready for distribution

### Verification

**Check Notarization Status:**
```bash
spctl --assess --verbose dist/mac-arm64/Photopti.app
```

**Expected output:**
```
dist/mac-arm64/Photopti.app: accepted
source=Developer ID
```

**Check Staple:**
```bash
stapler validate dist/mac-arm64/Photopti.app
```

**Expected output:**
```
The validate action worked!
```

### Troubleshooting Notarization

**Issue: Notarization Fails**

**Check logs:**
```bash
# View notarization logs
xcrun altool --notarization-info <UUID> --username <APPLE_ID> --password <APP_SPECIFIC_PASSWORD>
```

**Common issues:**
- Missing entitlements
- Hardened runtime not enabled
- Code signing issues
- Missing dependencies

**Fix:**
1. Check `build/entitlements.mac.plist`
2. Verify `hardenedRuntime: true` in build config
3. Ensure all dependencies are signed
4. Check notarization logs for specific errors

---

## Distribution

### Distribution Channels

**1. Direct Download:**
- Host files on your website
- GitHub Releases
- Cloud storage (S3, Google Drive, etc.)

**2. GitHub Releases (Recommended):**

**Create Release:**
1. Go to GitHub repository
2. Releases → Draft a new release
3. Tag: `v1.0.0`
4. Title: `Photopti 1.0.0`
5. Description: Release notes
6. Upload build artifacts:
   - `Photopti-1.0.0-arm64.dmg` (macOS)
   - `Photopti Setup 1.0.0.exe` (Windows)
   - `Photopti-1.0.0-arm64.AppImage` (Linux)
7. Publish release

**3. Mac App Store (Future):**
- Requires App Store Connect account
- Different build configuration
- Additional review process

**4. Windows Store (Future):**
- Requires Microsoft Developer account
- Different build configuration
- Additional review process

### File Hosting

**Recommended File Sizes:**
- macOS DMG: ~150-200 MB
- Windows NSIS: ~150-200 MB
- Linux AppImage: ~150-200 MB

**Hosting Options:**
- GitHub Releases (free, 2GB limit per file)
- AWS S3 + CloudFront (CDN)
- Google Cloud Storage
- Your own server

### Update Mechanism

**Current Status:** No auto-updater implemented

**Future Implementation:**
- Use `electron-updater`
- Configure update server
- Implement update checks
- Show update notifications

---

## Release Process

### Step-by-Step Release Checklist

**1. Pre-Release (1 week before):**
- [ ] Final testing on all platforms
- [ ] Update version number
- [ ] Update changelog
- [ ] Prepare release notes
- [ ] Test build process

**2. Build Day:**
- [ ] Clean build directory
- [ ] Verify environment variables
- [ ] Build macOS version
- [ ] Verify macOS code signing
- [ ] Verify macOS notarization
- [ ] Build Windows version
- [ ] Verify Windows installer
- [ ] Build Linux versions
- [ ] Test all builds

**3. Release Day:**
- [ ] Create Git tag
- [ ] Push tag to repository
- [ ] Create GitHub release
- [ ] Upload all build artifacts
- [ ] Write release notes
- [ ] Publish release
- [ ] Update website/documentation
- [ ] Announce release (if applicable)

**4. Post-Release:**
- [ ] Monitor for issues
- [ ] Collect user feedback
- [ ] Document any issues
- [ ] Plan next release

### Release Notes Template

```markdown
# Photopti 1.0.1

## Bug Fixes
- Fixed issue with logo loading on Windows
- Improved error handling for corrupted images

## Improvements
- Better progress indicators
- Improved UI responsiveness

## Downloads
- [macOS DMG](link)
- [Windows Installer](link)
- [Linux AppImage](link)
```

### Git Tagging

```bash
# Create annotated tag
git tag -a v1.0.1 -m "Release version 1.0.1"

# Push tag to remote
git push origin v1.0.1

# Or push all tags
git push --tags
```

---

## Post-Release

### Monitoring

**Track Downloads:**
- GitHub Releases shows download counts
- Monitor hosting server logs
- Use analytics if integrated

**User Feedback:**
- GitHub Issues
- Email support
- User reviews (if on app stores)

### Hotfixes

**If Critical Bug Found:**
1. Create hotfix branch
2. Fix the issue
3. Increment patch version (1.0.0 → 1.0.1)
4. Build and release quickly
5. Notify users of update

### Version Support

**Support Policy:**
- Support current version
- Support previous major version
- Document deprecated versions

---

## Troubleshooting Production Builds

### Issue: Build Fails with "Cannot find module"

**Symptoms:**
- Build fails with module not found errors
- Missing dependencies

**Solutions:**
```bash
# Clean and reinstall
rm -rf node_modules package-lock.json
npm install

# Rebuild native modules
npm rebuild sharp

# Try building again
npm run dist
```

### Issue: Code Signing Fails

**Symptoms:**
- "No identity found" error
- Certificate not found

**Solutions:**

**macOS:**
```bash
# List available identities
security find-identity -v -p codesigning

# Verify certificate in Keychain
# Ensure certificate is valid and not expired
```

**Windows:**
```bash
# Verify certificate file exists
# Check certificate password is correct
# Ensure certificate is not expired
```

### Issue: Notarization Fails

**Symptoms:**
- Notarization submission fails
- App rejected by Apple

**Solutions:**
1. Check notarization logs
2. Verify all dependencies are signed
3. Check entitlements file
4. Ensure hardened runtime is enabled
5. Verify Apple credentials are correct

### Issue: Build Size Too Large

**Symptoms:**
- Build artifacts are very large (>500MB)
- Slow downloads

**Solutions:**
```json
// Exclude unnecessary files in package.json
{
  "build": {
    "files": [
      "main.js",
      "preload.js",
      "renderer/**/*",
      "assets/**/*",
      "!**/*.map",           // Exclude source maps
      "!**/test/**",          // Exclude tests
      "!**/docs/**"           // Exclude docs
    ]
  }
}
```

### Issue: App Crashes on Launch

**Symptoms:**
- App builds successfully
- Crashes immediately on launch

**Solutions:**
1. Check console logs
2. Verify all required files are included
3. Check native module compatibility
4. Test on clean system
5. Verify file permissions

### Issue: Sharp Not Working in Production

**Symptoms:**
- Sharp works in development
- Fails in production build

**Solutions:**
1. Verify `asarUnpack` includes Sharp
2. Check Sharp binary architecture matches target
3. Verify Sharp is properly signed (macOS)
4. Check file permissions on native binaries

---

## CI/CD Integration (Future)

### GitHub Actions Example

```yaml
# .github/workflows/build.yml
name: Build and Release

on:
  release:
    types: [created]

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm install
      - run: npm run dist
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: ${{ matrix.os }}-build
          path: dist/
```

### Automated Releases

**Benefits:**
- Consistent builds
- Automated testing
- Faster releases
- Reproducible builds

**Setup:**
1. Configure GitHub Actions
2. Set up secrets (signing certificates, API keys)
3. Create release workflow
4. Test thoroughly

---

## Security Considerations

### Code Signing Best Practices

1. **Never commit certificates or keys**
   - Use environment variables
   - Use secret management
   - Store securely

2. **Rotate credentials regularly**
   - Update API keys annually
   - Renew certificates before expiration

3. **Limit access**
   - Only authorized personnel
   - Use separate accounts for CI/CD

### Distribution Security

1. **Verify downloads**
   - Provide checksums (SHA256)
   - Use HTTPS for downloads
   - Verify signatures

2. **Monitor for tampering**
   - Check file hashes
   - Monitor download sources
   - Report suspicious activity

---

## Conclusion

This guide covers the complete production deployment process for Photopti. Follow the steps carefully, test thoroughly, and maintain security best practices.

**Key Takeaways:**
- Always test builds before release
- Keep credentials secure
- Document all changes
- Monitor post-release
- Plan for updates

For development setup, see `knowledge/local-development.md`.  
For architecture details, see `knowledge/overview.md`.

---

**Document Version:** 1.0  
**Last Updated:** 2025  
**Maintained By:** Development Team
