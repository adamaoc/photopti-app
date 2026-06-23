const fs = require("fs");
const path = require("path");
const { SUPPORTED_FORMATS } = require("./constants");

const DEFAULT_DISCOVERY_OPTIONS = {
  maxDepth: 12,
  maxFiles: 10000,
};

function isSupportedImagePath(filePath) {
  return SUPPORTED_FORMATS.includes(path.parse(filePath).ext.toLowerCase());
}

async function getPathType(filePath) {
  try {
    const stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) return "directory";
    if (stats.isFile()) return "file";
  } catch (error) {
    return null;
  }
  return null;
}

async function listImagesInDirectory(dir, options = {}) {
  const settings = { ...DEFAULT_DISCOVERY_OPTIONS, ...options };
  const images = [];
  const queue = [{ dir, depth: 0 }];

  while (queue.length > 0 && images.length < settings.maxFiles) {
    const current = queue.shift();
    let entries = [];

    try {
      entries = await fs.promises.readdir(current.dir, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const entryPath = path.join(current.dir, entry.name);
      if (entry.isDirectory() && current.depth < settings.maxDepth) {
        queue.push({ dir: entryPath, depth: current.depth + 1 });
        continue;
      }

      if (!entry.isFile() || !isSupportedImagePath(entryPath)) continue;
      images.push(entryPath);
      if (images.length >= settings.maxFiles) break;
    }
  }

  return images;
}

async function resolveDroppedToImages(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return [];

  if (paths.length === 1 && (await getPathType(paths[0])) === "directory") {
    return await listImagesInDirectory(paths[0]);
  }

  const files = [];
  for (const filePath of paths) {
    if ((await getPathType(filePath)) !== "file") continue;
    if (!isSupportedImagePath(filePath)) continue;
    files.push(filePath);
  }
  return files;
}

module.exports = {
  getPathType,
  isSupportedImagePath,
  listImagesInDirectory,
  resolveDroppedToImages,
};
