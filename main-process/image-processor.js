const fs = require("fs");
const path = require("path");
const {
  DEFAULT_BACKGROUND,
  DEFAULT_OUTPUT_FOLDER,
  DEFAULT_OUTPUT_FORMAT,
  OUTPUT_FORMATS,
} = require("./constants");
const {
  MIN_CROP_PERCENT,
  dimensionsForRatio,
  getPresetRatio,
  parseOutputDimension,
} = require("../renderer/crop-geometry");
const { resolveInputPaths } = require("./file-discovery");
const { createImageInput } = require("./image-input");
const { getDefaultConcurrency, mapWithConcurrency } = require("./concurrency");

const DEFAULT_COVER_WIDTH = 1600;
const DEFAULT_COVER_HEIGHT = 900;
const DEFAULT_COVER_ASPECT_RATIO = "16:9";
const MAX_IMAGE_DIMENSION = 20000;
// Control characters and characters that are invalid in Windows file names.
// eslint-disable-next-line no-control-regex
const UNSAFE_FILE_NAME_CHARACTERS = /[<>:"|?*\u0000-\u001F]/g;

function normalizeProcessOptions(options = {}) {
  const output = normalizePathSegment(options.output, DEFAULT_OUTPUT_FOLDER, "output folder");
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
    format: normalizeOutputFormat(options.format),
    background: normalizeBackground(options.background),
    enlarge: options.enlarge === true,
    keepMetadata: options.keepMetadata === true,
  };
}

function normalizeOutputFormat(format) {
  if (format === undefined || format === null || format === "") return DEFAULT_OUTPUT_FORMAT;
  if (!Object.prototype.hasOwnProperty.call(OUTPUT_FORMATS, format)) {
    throw new Error(`Unsupported output format: ${format}`);
  }
  return format;
}

function normalizeBackground(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : DEFAULT_BACKGROUND;
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

  return segment.replace(UNSAFE_FILE_NAME_CHARACTERS, "-");
}

function getOutputExtension(options) {
  return OUTPUT_FORMATS[options.format || DEFAULT_OUTPUT_FORMAT].extension;
}

function getOutputName(filePath, options, counter) {
  const parsed = path.parse(filePath);
  const extension = getOutputExtension(options);
  if (options.rename) {
    return `${options.rename}-${String(counter).padStart(3, "0")}${extension}`;
  }
  return `${parsed.name}${extension}`;
}

function getCoverOutputName(filePath, options) {
  const parsed = path.parse(filePath);
  const baseName = options.rename || parsed.name;
  return `${options.cover.suffix}-${baseName}${getOutputExtension(options)}`;
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

function isPathInside(parent, child) {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Drops duplicate roots and roots nested inside another root, so adding a
 * folder and then a file from one of its subfolders still counts as one source.
 */
function collapseSourceRoots(roots) {
  const unique = Array.from(new Set((roots || []).filter((root) => typeof root === "string" && root)))
    .map((root) => path.resolve(root))
    .sort((a, b) => a.length - b.length);
  const kept = [];
  for (const root of unique) {
    if (!kept.some((parent) => parent === root || isPathInside(parent, root))) {
      kept.push(root);
    }
  }
  return kept;
}

function resolveOutputBaseDir(roots, outputBaseDir) {
  if (outputBaseDir) return outputBaseDir;
  const collapsed = collapseSourceRoots(roots);
  if (collapsed.length === 1) return collapsed[0];
  if (collapsed.length === 0) throw new Error("No source folder could be determined.");
  throw new Error("Images come from multiple folders. Choose an output folder first.");
}

async function resolveFilesAndBaseDir(paths, outputBaseDir, { sourceRoots, outputName } = {}) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error("No files or folders provided.");
  }

  const { files, roots, truncated } = await resolveInputPaths(paths, {
    excludeDirNames: outputName ? [outputName] : [],
  });
  if (files.length === 0) {
    throw new Error("No supported image files found.");
  }

  const baseDir = resolveOutputBaseDir(
    Array.isArray(sourceRoots) && sourceRoots.length > 0 ? sourceRoots : roots,
    outputBaseDir
  );
  return { baseDir, files, truncated };
}

function getUprightSize(metadata) {
  const oriented = metadata.autoOrient || metadata;
  return { width: oriented.width, height: oriented.height };
}

function applyOutputFormat(instance, options) {
  let output = instance;
  if (options.keepMetadata) output = output.keepMetadata();
  switch (options.format || DEFAULT_OUTPUT_FORMAT) {
    case "webp":
      return output.webp({ quality: options.quality });
    case "avif":
      return output.avif({ quality: options.quality });
    default:
      // JPEG has no alpha channel: composite transparency onto the background
      // instead of letting it turn black.
      return output
        .flatten({ background: options.background || DEFAULT_BACKGROUND })
        .jpeg({ quality: options.quality, mozjpeg: true });
  }
}

function getTargetWidth(sourceWidth, options) {
  if (options.percentage) {
    return Math.max(1, Math.round(sourceWidth * (options.percentage / 100)));
  }
  return options.width || 800;
}

async function processStandardImage(filePath, dest, options) {
  let instance = await createImageInput(filePath);
  const { width } = getUprightSize(await instance.metadata());
  if (!width) throw new Error("Could not read image dimensions");

  const targetWidth = getTargetWidth(width, options);
  // An explicit percentage above 100% is a request to enlarge; a fixed width
  // only enlarges smaller images when the user opts in.
  const allowEnlarge = options.percentage ? options.percentage > 100 : options.enlarge;
  if (targetWidth !== width) {
    instance = instance.resize({ width: targetWidth, withoutEnlargement: !allowEnlarge });
  }
  await applyOutputFormat(instance, options).toFile(dest);
}

async function processCoverImage(filePath, dest, options) {
  let instance = await createImageInput(filePath);
  const extract = getCoverExtract(getUprightSize(await instance.metadata()), options.cover.crop);
  instance = instance
    .extract(extract)
    .resize(options.cover.width, options.cover.height, {
      fit: "fill",
    });
  await applyOutputFormat(instance, options).toFile(dest);
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
  inputBytes = 0,
  outputBytes = 0,
  format = DEFAULT_OUTPUT_FORMAT,
  truncated = false,
}) {
  return {
    processed,
    errors,
    skipped,
    outputDir,
    failures,
    canceled,
    cover,
    inputBytes,
    outputBytes,
    format,
    truncated,
  };
}

async function getFileSize(filePath) {
  try {
    return (await fs.promises.stat(filePath)).size;
  } catch (error) {
    return 0;
  }
}

async function removePartialOutput(dest) {
  try {
    await fs.promises.unlink(dest);
  } catch (error) {
    // Nothing was written, or it is already gone.
  }
}

async function processImages(payload, onProgress, controls = {}) {
  const { paths, sourceRoots, options: rawOptions = {} } = payload;
  const options = normalizeProcessOptions(rawOptions);
  const { files, baseDir, truncated } = await resolveFilesAndBaseDir(
    paths,
    options.outputBaseDir,
    { sourceRoots, outputName: options.output }
  );

  const outputDir = path.join(baseDir, options.output);
  // Never re-optimize earlier results that live inside this run's output folder.
  const inputs = files.filter((filePath) => !isPathInside(outputDir, filePath));
  await fs.promises.mkdir(outputDir, { recursive: true });

  const usedDestinations = new Set();
  const jobs = inputs.map((filePath, index) => ({
    filePath,
    dest: allocateUniquePath(outputDir, getOutputName(filePath, options, index + 1), usedDestinations),
  }));
  const shouldCancel = () => Boolean(controls.shouldCancel && controls.shouldCancel());

  let processed = 0;
  let errors = 0;
  let completed = 0;
  let inputBytes = 0;
  let outputBytes = 0;
  const failures = [];

  const { started } = await mapWithConcurrency(
    jobs,
    controls.concurrency || getDefaultConcurrency(),
    async ({ filePath, dest }) => {
      let ok = false;
      try {
        await processStandardImage(filePath, dest, options);
        const [sourceSize, destSize] = await Promise.all([getFileSize(filePath), getFileSize(dest)]);
        inputBytes += sourceSize;
        outputBytes += destSize;
        processed++;
        ok = true;
      } catch (error) {
        errors++;
        failures.push(createFailure(filePath, dest, error));
        await removePartialOutput(dest);
        console.warn("[photopti] Failed to process image:", filePath, getErrorMessage(error));
      }

      completed++;
      if (onProgress) {
        onProgress({
          current: completed,
          total: jobs.length,
          processed,
          errors,
          file: filePath,
          dest,
          ok,
        });
      }
    },
    { shouldStop: shouldCancel }
  );

  const skipped = jobs.length - started;
  const canceled = skipped > 0;

  let coverProcessed = 0;
  let coverErrors = 0;
  let coverDest = null;
  let coverBytes = 0;
  if (!canceled && options.coverImagePath && inputs.includes(options.coverImagePath)) {
    coverDest = allocateUniquePath(
      outputDir,
      getCoverOutputName(options.coverImagePath, options),
      usedDestinations
    );
    const reportCover = (ok) => {
      if (!onProgress) return;
      onProgress({
        current: jobs.length,
        total: jobs.length,
        processed,
        errors,
        file: options.coverImagePath,
        dest: coverDest,
        ok,
        kind: "cover",
      });
    };
    reportCover(false);
    try {
      await processCoverImage(options.coverImagePath, coverDest, options);
      coverProcessed = 1;
      coverBytes = await getFileSize(coverDest);
      reportCover(true);
    } catch (error) {
      coverErrors = 1;
      failures.push(createFailure(options.coverImagePath, coverDest, error, "cover"));
      await removePartialOutput(coverDest);
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
    inputBytes,
    outputBytes,
    format: options.format,
    truncated,
    cover: {
      processed: coverProcessed,
      errors: coverErrors,
      source: options.coverImagePath,
      dest: coverDest,
      bytes: coverBytes,
      width: options.cover.width,
      height: options.cover.height,
      aspectRatio: options.cover.aspectRatio,
      orientation: options.cover.orientation,
      crop: options.cover.crop,
    },
  });
}

module.exports = {
  allocateUniquePath,
  collapseSourceRoots,
  createFailure,
  createSummary,
  getCoverExtract,
  getCoverOutputName,
  getErrorMessage,
  getOutputName,
  isPathInside,
  normalizeCoverOptions,
  normalizeInteger,
  normalizePathSegment,
  normalizeProcessOptions,
  processImages,
  resolveFilesAndBaseDir,
  resolveOutputBaseDir,
};
