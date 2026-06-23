const fs = require("fs");
const path = require("path");
const { app, nativeImage } = require("electron");

function resolveLogoPath() {
  const packaged = path.join(
    process.resourcesPath || "",
    "assets",
    "logo-lg-200.png"
  );
  if (fs.existsSync(packaged)) return packaged;

  const localAsset = path.join(__dirname, "..", "assets", "logo-lg-200.png");
  if (fs.existsSync(localAsset)) return localAsset;

  return path.resolve(
    app.getAppPath(),
    "..",
    "..",
    "cli-projects",
    "photopti",
    "Logo",
    "logo-lg-200.png"
  );
}

function loadDockIcon() {
  try {
    const icns = path.join(__dirname, "..", "assets", "photopti.icns");
    if (fs.existsSync(icns)) {
      const icnsImg = nativeImage.createFromPath(icns);
      if (icnsImg && !icnsImg.isEmpty()) return icnsImg;
    }

    const logoPath = resolveLogoPath();
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
