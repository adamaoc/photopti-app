const fs = require("fs");
const path = require("path");
const { createThumbnailInput } = require("./thumbnails");

async function getImageInfo(filePath) {
  const stats = await fs.promises.stat(filePath);
  const input = await createThumbnailInput(filePath);
  const metadata = await input.metadata();
  const parsed = path.parse(filePath);

  return {
    path: filePath,
    name: parsed.base,
    folder: parsed.dir,
    size: stats.size,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    format: (metadata.format || parsed.ext.slice(1) || "unknown").toUpperCase(),
  };
}

module.exports = {
  getImageInfo,
};