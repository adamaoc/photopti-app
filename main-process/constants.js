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

module.exports = {
  HEIC_FORMATS,
  SUPPORTED_FORMATS,
};
