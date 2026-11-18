const { createImageInput } = require("./image-input");
const { mapWithConcurrency } = require("./concurrency");

const thumbnailCache = new Map();
const MAX_CACHE_ITEMS = 600;
const DEFAULT_THUMBNAIL_SIZE = 220;
const MAX_THUMBNAIL_SIZE = 1024;
// Bounds memory use: HEIC decoding in particular holds a full RGBA frame.
const THUMBNAIL_CONCURRENCY = 4;

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

  const input = await createImageInput(filePath, { failOn: "none" });
  const buffer = await input
    .resize(size, size, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#1c1e22" })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();

  const dataUrl = `data:image/jpeg;base64,${buffer.toString("base64")}`;
  rememberThumbnail(key, dataUrl);
  return dataUrl;
}

function normalizeThumbnailSize(size) {
  const number = Number(size);
  if (!Number.isInteger(number) || number < 16) return DEFAULT_THUMBNAIL_SIZE;
  return Math.min(number, MAX_THUMBNAIL_SIZE);
}

async function getThumbnails(paths, options = {}) {
  const size = normalizeThumbnailSize(options.size);
  const results = {};

  if (!Array.isArray(paths)) return results;

  await mapWithConcurrency(paths, THUMBNAIL_CONCURRENCY, async (filePath) => {
    try {
      results[filePath] = await createThumbnail(filePath, size);
    } catch (error) {
      results[filePath] = null;
    }
  });

  return results;
}

function clearThumbnailCache() {
  thumbnailCache.clear();
}

module.exports = {
  clearThumbnailCache,
  createThumbnail,
  getThumbnails,
};
