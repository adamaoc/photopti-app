const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const heicConvert = require("heic-convert");
const { HEIC_FORMATS } = require("./constants");

const thumbnailCache = new Map();
const MAX_CACHE_ITEMS = 600;
const DEFAULT_THUMBNAIL_SIZE = 220;

function getCacheKey(filePath, size) {
  return `${size}:${filePath}`;
}

function rememberThumbnail(key, value) {
  if (thumbnailCache.has(key)) {
    thumbnailCache.delete(key);
  }
  thumbnailCache.set(key, value);

  while (thumbnailCache.size > MAX_CACHE_ITEMS) {
    const oldestKey = thumbnailCache.keys().next().value;
    thumbnailCache.delete(oldestKey);
  }
}

async function createThumbnail(filePath, size = DEFAULT_THUMBNAIL_SIZE) {
  const key = getCacheKey(filePath, size);
  if (thumbnailCache.has(key)) {
    return thumbnailCache.get(key);
  }

  const input = await createThumbnailInput(filePath);
  const buffer = await input
    .resize(size, size, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();

  const dataUrl = `data:image/jpeg;base64,${buffer.toString("base64")}`;
  rememberThumbnail(key, dataUrl);
  return dataUrl;
}

async function createThumbnailInput(filePath) {
  const ext = path.parse(filePath).ext.toLowerCase();
  if (!HEIC_FORMATS.has(ext)) {
    return sharp(filePath, { failOn: "none" });
  }

  const heicBuffer = await fs.promises.readFile(filePath);
  const convertedBuffer = await heicConvert({
    buffer: heicBuffer,
    format: "JPEG",
    quality: 0.72,
  });
  return sharp(convertedBuffer, { failOn: "none" });
}

async function getThumbnails(paths, options = {}) {
  const size = options.size || DEFAULT_THUMBNAIL_SIZE;
  const results = {};

  if (!Array.isArray(paths)) return results;

  await Promise.all(
    paths.map(async (filePath) => {
      try {
        results[filePath] = await createThumbnail(filePath, size);
      } catch (error) {
        results[filePath] = null;
      }
    })
  );

  return results;
}

module.exports = {
  createThumbnail,
  createThumbnailInput,
  getThumbnails,
};
