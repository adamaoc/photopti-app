const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");

async function withTempDir(fn) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "photopti-"));
  try {
    return await fn(dir);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

async function writeImage(filePath, { width = 400, height = 300, channels = 3, background = "#6688aa", format = "png", orientation } = {}) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  let image = sharp({ create: { width, height, channels, background } });
  if (format === "jpeg") image = image.jpeg();
  else image = image.png();
  if (orientation) image = image.withMetadata({ orientation });
  await image.toFile(filePath);
  return filePath;
}

module.exports = {
  withTempDir,
  writeImage,
};
