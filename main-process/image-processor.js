const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const heicConvert = require("heic-convert");
const { HEIC_FORMATS } = require("./constants");
const {
  MIN_CROP_PERCENT,
  dimensionsForRatio,
  getPresetRatio,
  parseOutputDimension,
} = require("../renderer/crop-geometry");
const {
  getPathType,
  isSupportedImagePath,
  listImagesInDirectory,
} = require("./file-discovery");

const DEFAULT_COVER_WIDTH = 1920;
const DEFAULT_COVER_HEIGHT = 1080;
const DEFAULT_COVER_ASPECT_RATIO = "16:9";
const MAX_IMAGE_DIMENSION = 20000;

function normalizeProcessOptions(options = {}) {
  const output = normalizePathSegment(options.output, "Opti", "output folder");
  const quality = normalizeInteger(options.quality, 1, 100, 80);
  const percentage = normalizeOptionalNumber(options.percentage, 1, 1000);
  const width = percentage ? undefined : normalizeInteger(options.width, 1, MAX_IMAGE_DIMENSION, 800);
  const outputBaseDir = options.outputBaseDir || null;
  const rename = options.rename
    ? normalizePathSegment(options.rename, null, "rename base")
    : undefined;
  const coverImagePath = options.coverImagePath || null;
  const cover = normalizeCoverOptions(options.cover);

  return {
    output,
    quality,
    width,
    percentage,
    outputBaseDir,
    rename,
    coverImagePath,
    cover,
  };
}

function normalizeCoverOptions(cover = {}) {
  const aspectRatio = cover.aspectRatio || DEFAULT_COVER_ASPECT_RATIO;
  const orientation = cover.orientation || "landscape";
  if (orientation !== "landscape" && orientation !== "portrait") {
    throw new Error(`Unsupported cover orientation: ${orientation}`);
  }
  const ratio = getPresetRatio(aspectRatio, orientation);
  let width = parseOutputDimension(cover.width ?? DEFAULT_COVER_WIDTH);
  let height = parseOutputDimension(cover.height ?? DEFAULT_COVER_HEIGHT);
  if (ratio) {
    const anchor = cover.dimensionAnchor === "height"
      || (cover.width === undefined && cover.height !== undefined)
      ? "height"
      : "width";
    ({ width, height } = dimensionsForRatio(anchor === "width" ? width : height, anchor, ratio));
  }
  const suffix = normalizePathSegment(cover.suffix, "cover", "cover suffix");
  const crop = normalizeCropBox(cover.crop);

  return {
    width,
    height,
    aspectRatio,
    orientation,
    crop,
    suffix,
  };
}

function normalizeCropBox(crop = {}) {
  const width = clampNumber(crop.width, MIN_CROP_PERCENT, 100, 90);
  const height = clampNumber(crop.height, MIN_CROP_PERCENT, 100, 50.625);
  const x = clampNumber(crop.x, 0, 100 - width, (100 - width) / 2);
  const y = clampNumber(crop.y, 0, 100 - height, (100 - height) / 2);

  return { x, y, width, height };
}

function clampNumber(value, min, max, fallback) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function normalizeInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(clampNumber(number, min, max, fallback));
}

function normalizeOptionalNumber(value, min, max) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return clampNumber(number, min, max, undefined);
}

function normalizePathSegment(value, fallback, label) {
  const raw = typeof value === "string" ? value.trim() : "";
  const segment = raw || fallback;
  if (!segment) return segment;

  if (
    segment.includes("/") ||
    segment.includes("\\") ||
    segment === "." ||
    segment === ".."
  ) {
    throw new Error(`${label} cannot contain path separators or relative path segments.`);
  }

  return segment.replace(/[<>:"|?*\u0000-\u001F]/g, "-");
}

function getOutputName(filePath, options, counter) {
  const parsed = path.parse(filePath);
  if (options.rename) {
    return `${options.rename}-${String(counter).padStart(3, "0")}.jpg`;
  }
  return `${parsed.name}.jpg`;
}

function getCoverOutputName(filePath, options) {
  const parsed = path.parse(filePath);
  const baseName = options.rename || parsed.name;
  return `${options.cover.suffix}-${baseName}.jpg`;
}

function allocateUniquePath(outputDir, outputName, usedDestinations) {
  const parsed = path.parse(outputName);
  let candidate = path.join(outputDir, outputName);
  let index = 2;

  while (usedDestinations.has(candidate) || fs.existsSync(candidate)) {
    candidate = path.join(outputDir, `${parsed.name}-${index}${parsed.ext}`);
    index++;
  }

  usedDestinations.add(candidate);
  return candidate;
}

async function resolveFilesAndBaseDir(paths, outputBaseDir) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error("No files or folders provided.");
  }

  if (
    paths.length === 1 &&
    (await getPathType(paths[0])) === "directory"
  ) {
    return {
      baseDir: paths[0],
      files: await listImagesInDirectory(paths[0]),
    };
  }

  const files = [];
  for (const filePath of paths) {
    if ((await getPathType(filePath)) !== "file") continue;
    if (!isSupportedImagePath(filePath)) continue;
    files.push(filePath);
  }

  if (files.length === 0) {
    throw new Error("No supported image files found.");
  }

  if (outputBaseDir) {
    return { baseDir: outputBaseDir, files };
  }

  const parentDirs = new Set(files.map((filePath) => path.dirname(filePath)));
  if (parentDirs.size === 1) {
    return { baseDir: path.dirname(files[0]), files };
  }

  return { baseDir: path.dirname(files[0]), files };
}

async function createSharpInput(filePath, quality) {
  const ext = path.parse(filePath).ext.toLowerCase();
  if (!HEIC_FORMATS.has(ext)) {
    return sharp(filePath);
  }

  const heicBuffer = await fs.promises.readFile(filePath);
  const convertedBuffer = await heicConvert({
    buffer: heicBuffer,
    format: "JPEG",
    quality: Math.max(0, Math.min(1, quality / 100)),
  });
  return sharp(convertedBuffer);
}

async function processStandardImage(filePath, dest, options) {
  let instance = await createSharpInput(filePath, options.quality);
  const metadata = await instance.metadata();
  if (!metadata.width) throw new Error("Could not read image dimensions");

  let targetWidth = options.width || 800;
  if (options.percentage) {
    targetWidth = Math.round(metadata.width * (options.percentage / 100));
  }
  if (targetWidth !== metadata.width) {
    instance = instance.resize(targetWidth);
  }
  await instance.jpeg({ quality: options.quality }).toFile(dest);
}

async function processCoverImage(filePath, dest, options) {
  let instance = await createSharpInput(filePath, options.quality);
  const metadata = await instance.metadata();
  const extract = getCoverExtract(metadata, options.cover.crop);
  instance = instance
    .extract(extract)
    .resize(options.cover.width, options.cover.height, {
      fit: "fill",
    });
  await instance.jpeg({ quality: options.quality }).toFile(dest);
}

function getCoverExtract(metadata, crop) {
  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read cover image dimensions");
  }

  const left = Math.floor((crop.x / 100) * metadata.width);
  const top = Math.floor((crop.y / 100) * metadata.height);
  const width = Math.max(1, Math.round((crop.width / 100) * metadata.width));
  const height = Math.max(1, Math.round((crop.height / 100) * metadata.height));

  return {
    left: Math.min(left, metadata.width - 1),
    top: Math.min(top, metadata.height - 1),
    width: Math.min(width, metadata.width - Math.min(left, metadata.width - 1)),
    height: Math.min(height, metadata.height - Math.min(top, metadata.height - 1)),
  };
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function createFailure(source, dest, error, kind = "image") {
  return {
    kind,
    source,
    dest,
    message: getErrorMessage(error),
  };
}

function createSummary({
  processed,
  errors,
  skipped,
  outputDir,
  failures,
  canceled,
  cover,
}) {
  return {
    processed,
    errors,
    skipped,
    outputDir,
    failures,
    canceled,
    cover,
  };
}

async function processImages(payload, onProgress, controls = {}) {
  const { paths, options: rawOptions = {} } = payload;
  const options = normalizeProcessOptions(rawOptions);
  const { files, baseDir } = await resolveFilesAndBaseDir(
    paths,
    options.outputBaseDir
  );

  const outputDir = path.join(baseDir, options.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let processed = 0;
  let errors = 0;
  let coverProcessed = 0;
  let coverErrors = 0;
  let skipped = 0;
  let canceled = false;
  const failures = [];
  const usedDestinations = new Set();
  let counter = 1;

  for (let i = 0; i < files.length; i++) {
    if (controls.shouldCancel && controls.shouldCancel()) {
      canceled = true;
      skipped = files.length - i;
      break;
    }

    const filePath = files[i];
    const outputName = getOutputName(filePath, options, counter);
    const dest = allocateUniquePath(outputDir, outputName, usedDestinations);

    let okFile = false;
    try {
      await processStandardImage(filePath, dest, options);
      processed++;
      okFile = true;
      if (options.rename) counter++;
    } catch (error) {
      errors++;
      failures.push(createFailure(filePath, dest, error));
      console.warn("[photopti] Failed to process image:", filePath, getErrorMessage(error));
    }

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: files.length,
        processed,
        errors,
        file: filePath,
        dest,
        ok: okFile,
      });
    }
  }

  let coverDest = null;
  if (!canceled && options.coverImagePath && files.includes(options.coverImagePath)) {
    coverDest = allocateUniquePath(
      outputDir,
      getCoverOutputName(options.coverImagePath, options),
      usedDestinations
    );
    if (onProgress) {
      onProgress({
        current: files.length,
        total: files.length,
        processed,
        errors,
        file: options.coverImagePath,
        dest: coverDest,
        ok: false,
        kind: "cover",
      });
    }
    try {
      await processCoverImage(options.coverImagePath, coverDest, options);
      coverProcessed = 1;
      if (onProgress) {
        onProgress({
          current: files.length,
          total: files.length,
          processed,
          errors,
          file: options.coverImagePath,
          dest: coverDest,
          ok: true,
          kind: "cover",
        });
      }
    } catch (error) {
      coverErrors = 1;
      failures.push(createFailure(options.coverImagePath, coverDest, error, "cover"));
      console.warn("[photopti] Failed to process cover image:", options.coverImagePath, getErrorMessage(error));
    }
  }

  return createSummary({
    processed,
    errors,
    skipped,
    outputDir,
    failures,
    canceled,
    cover: {
      processed: coverProcessed,
      errors: coverErrors,
      source: options.coverImagePath,
      dest: coverDest,
      width: options.cover.width,
      height: options.cover.height,
      aspectRatio: options.cover.aspectRatio,
      orientation: options.cover.orientation,
      crop: options.cover.crop,
    },
  });
}

module.exports = {
  createFailure,
  createSummary,
  allocateUniquePath,
  getCoverExtract,
  getCoverOutputName,
  getErrorMessage,
  getOutputName,
  normalizeInteger,
  normalizePathSegment,
  normalizeCoverOptions,
  normalizeProcessOptions,
  processImages,
  resolveFilesAndBaseDir,
};
