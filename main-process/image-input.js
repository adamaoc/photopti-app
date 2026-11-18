const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const heicDecode = require("heic-decode");
const { HEIC_FORMATS } = require("./constants");

function isHeicPath(filePath) {
  return HEIC_FORMATS.has(path.extname(filePath).toLowerCase());
}

/**
 * Creates a sharp pipeline whose pixels are already upright: EXIF orientation
 * is applied on input so resize, extract, and output all see the image the way
 * a viewer (and the crop preview) shows it.
 *
 * HEIC/HEIF is decoded straight to raw RGBA instead of being re-encoded to an
 * intermediate JPEG, so it is compressed only once, at the requested quality.
 */
async function createImageInput(filePath, { failOn = "warning" } = {}) {
  if (!isHeicPath(filePath)) {
    return sharp(filePath, { autoOrient: true, failOn });
  }

  const buffer = await fs.promises.readFile(filePath);
  const { width, height, data } = await heicDecode({ buffer });
  return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: { width, height, channels: 4 },
  });
}

/**
 * Reads upright dimensions and format without decoding pixels where possible.
 */
async function readImageMetadata(filePath) {
  if (isHeicPath(filePath)) {
    const buffer = await fs.promises.readFile(filePath);
    const images = await heicDecode.all({ buffer });
    try {
      const [primary] = images;
      return {
        width: primary?.width ?? null,
        height: primary?.height ?? null,
        format: "heif",
      };
    } finally {
      images.dispose();
    }
  }

  const metadata = await sharp(filePath, { failOn: "none" }).metadata();
  const oriented = metadata.autoOrient || metadata;
  return {
    width: oriented.width ?? null,
    height: oriented.height ?? null,
    format: metadata.format || null,
  };
}

module.exports = {
  createImageInput,
  isHeicPath,
  readImageMetadata,
};
