const fs = require("fs");
const path = require("path");

function resolveLogoPath(options = {}) {
  const resourcesPath = options.resourcesPath ?? process.resourcesPath;
  const appDir = options.appDir ?? path.join(__dirname, "..");
  const existsSync = options.existsSync ?? fs.existsSync;
  const packaged = path.join(
    resourcesPath || "",
    "assets",
    "logo-lg-200.png"
  );
  if (resourcesPath && existsSync(packaged)) return packaged;

  const localAsset = path.join(appDir, "assets", "logo-lg-200.png");
  if (existsSync(localAsset)) return localAsset;

  return null;
}

function loadDockIcon(options = {}) {
  try {
    const nativeImage = options.nativeImage ?? require("electron").nativeImage;
    const appDir = options.appDir ?? path.join(__dirname, "..");
    const icns = path.join(appDir, "assets", "photopti.icns");
    if (fs.existsSync(icns)) {
      const icnsImg = nativeImage.createFromPath(icns);
      if (icnsImg && !icnsImg.isEmpty()) return icnsImg;
    }

    const logoPath = resolveLogoPath({ ...options, appDir });
    if (!logoPath) return null;
    let img = nativeImage.createFromPath(logoPath);
    if (img && !img.isEmpty()) return img;
    if (fs.existsSync(logoPath)) {
      const buf = fs.readFileSync(logoPath);
      img = nativeImage.createFromBuffer(buf);
      if (img && !img.isEmpty()) return img;
    }
  } catch (error) {
    console.warn("[photopti] Failed to load dock icon:", error.message);
  }
  return null;
}

module.exports = {
  loadDockIcon,
  resolveLogoPath,
};
