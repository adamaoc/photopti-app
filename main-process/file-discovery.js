const fs = require("fs");
const path = require("path");
const { SUPPORTED_FORMATS } = require("./constants");

const DEFAULT_DISCOVERY_OPTIONS = {
  maxDepth: 12,
  maxFiles: 10000,
  excludeDirNames: [],
};

function isSupportedImagePath(filePath) {
  return SUPPORTED_FORMATS.includes(path.extname(filePath).toLowerCase());
}

// Dotfiles include macOS AppleDouble sidecars ("._IMG_0001.jpg") that external
// drives are full of; they share an image extension but are not images.
function isHiddenName(name) {
  return name.startsWith(".");
}

function isImageCandidate(filePath) {
  return isSupportedImagePath(filePath) && !isHiddenName(path.basename(filePath));
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

function normalizeExcludedNames(names) {
  return new Set(
    (Array.isArray(names) ? names : [])
      .filter((name) => typeof name === "string" && name.trim())
      .map((name) => name.trim().toLowerCase())
  );
}

async function scanDirectory(dir, options = {}) {
  const settings = { ...DEFAULT_DISCOVERY_OPTIONS, ...options };
  const excluded = normalizeExcludedNames(settings.excludeDirNames);
  const images = [];
  const queue = [{ dir, depth: 0 }];
  let truncated = false;

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    let entries;
    try {
      entries = await fs.promises.readdir(current.dir, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (isHiddenName(entry.name)) continue;
      const entryPath = path.join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (current.depth < settings.maxDepth && !excluded.has(entry.name.toLowerCase())) {
          queue.push({ dir: entryPath, depth: current.depth + 1 });
        }
        continue;
      }

      if (!entry.isFile() || !isSupportedImagePath(entryPath)) continue;
      if (images.length >= settings.maxFiles) {
        truncated = true;
        return { images, truncated };
      }
      images.push(entryPath);
    }
  }

  return { images, truncated };
}

async function listImagesInDirectory(dir, options = {}) {
  return (await scanDirectory(dir, options)).images;
}

/**
 * Resolves any mix of dropped or selected files and folders to image files.
 * `roots` lists the folder each input came from (the folder itself, or a
 * file's parent) and decides where the output folder is created.
 */
async function resolveInputPaths(paths, options = {}) {
  const settings = { ...DEFAULT_DISCOVERY_OPTIONS, ...options };
  const files = [];
  const seen = new Set();
  const roots = [];
  let truncated = false;

  const addRoot = (root) => {
    if (!roots.includes(root)) roots.push(root);
  };
  const addFile = (filePath) => {
    if (seen.has(filePath)) return true;
    if (files.length >= settings.maxFiles) {
      truncated = true;
      return false;
    }
    seen.add(filePath);
    files.push(filePath);
    return true;
  };

  if (!Array.isArray(paths)) return { files, roots, truncated };

  for (const inputPath of paths) {
    if (typeof inputPath !== "string" || !inputPath) continue;
    const type = await getPathType(inputPath);
    if (type === "directory") {
      const remaining = settings.maxFiles - files.length;
      const result = await scanDirectory(inputPath, { ...settings, maxFiles: remaining });
      if (result.images.length > 0) addRoot(inputPath);
      result.images.forEach(addFile);
      truncated = truncated || result.truncated;
    } else if (type === "file" && isImageCandidate(inputPath)) {
      if (addFile(inputPath)) addRoot(path.dirname(inputPath));
    }
    if (truncated) break;
  }

  return { files, roots, truncated };
}

async function resolveDroppedToImages(paths, options) {
  return (await resolveInputPaths(paths, options)).files;
}

module.exports = {
  getPathType,
  isHiddenName,
  isImageCandidate,
  isSupportedImagePath,
  listImagesInDirectory,
  resolveDroppedToImages,
  resolveInputPaths,
  scanDirectory,
};
