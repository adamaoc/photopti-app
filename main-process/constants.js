const SUPPORTED_FORMATS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".tiff",
  ".bmp",
  ".avif",
  ".heic",
  ".heif",
];

const HEIC_FORMATS = new Set([".heic", ".heif"]);

const OUTPUT_FORMATS = Object.freeze({
  jpeg: { extension: ".jpg", label: "JPEG", supportsAlpha: false },
  webp: { extension: ".webp", label: "WebP", supportsAlpha: true },
  avif: { extension: ".avif", label: "AVIF", supportsAlpha: true },
});

const DEFAULT_OUTPUT_FOLDER = "Opti";
const DEFAULT_OUTPUT_FORMAT = "jpeg";
const DEFAULT_BACKGROUND = "#ffffff";

module.exports = {
  DEFAULT_BACKGROUND,
  DEFAULT_OUTPUT_FOLDER,
  DEFAULT_OUTPUT_FORMAT,
  HEIC_FORMATS,
  OUTPUT_FORMATS,
  SUPPORTED_FORMATS,
};
