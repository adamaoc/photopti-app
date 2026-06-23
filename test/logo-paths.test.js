const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { loadDockIcon, resolveLogoPath } = require("../main-process/logo-paths");

const projectDir = path.join(__dirname, "..");

test("the runtime logo and macOS build icon are present", () => {
  assert.equal(fs.existsSync(path.join(projectDir, "assets", "logo-lg-200.png")), true);
  assert.equal(fs.existsSync(path.join(projectDir, "assets", "photopti.icns")), true);
});

test("resolves the packaged extraResource before the development asset", () => {
  const resourcesPath = path.join(path.sep, "packaged", "resources");
  const packagedLogo = path.join(resourcesPath, "assets", "logo-lg-200.png");

  assert.equal(resolveLogoPath({
    resourcesPath,
    appDir: projectDir,
    existsSync: (candidate) => candidate === packagedLogo,
  }), packagedLogo);
});

test("resolves the development asset when no packaged resource exists", () => {
  assert.equal(
    resolveLogoPath({ resourcesPath: "", appDir: projectDir }),
    path.join(projectDir, "assets", "logo-lg-200.png")
  );
});

test("returns null instead of a nonexistent fallback path", () => {
  assert.equal(resolveLogoPath({
    resourcesPath: path.join(path.sep, "missing", "resources"),
    appDir: path.join(path.sep, "missing", "app"),
    existsSync: () => false,
  }), null);
});

test("loads the PNG copied by extraResources when the ICNS is unavailable", () => {
  const resourcesPath = path.join(path.sep, "packaged", "resources");
  const packagedLogo = path.join(resourcesPath, "assets", "logo-lg-200.png");
  const image = { isEmpty: () => false };
  const requestedPaths = [];
  const nativeImage = {
    createFromPath(candidate) {
      requestedPaths.push(candidate);
      return image;
    },
  };

  assert.equal(loadDockIcon({
    nativeImage,
    resourcesPath,
    appDir: path.join(path.sep, "missing", "app"),
    existsSync: (candidate) => candidate === packagedLogo,
  }), image);
  assert.deepEqual(requestedPaths, [packagedLogo]);
});

test("package configuration copies only the required runtime logo", () => {
  const packageJson = require("../package.json");
  assert.deepEqual(packageJson.build.extraResources, [{
    from: "assets",
    to: "assets",
    filter: ["logo-lg-200.png"],
  }]);
  assert.equal(packageJson.build.mac.icon, "assets/photopti.icns");
});
