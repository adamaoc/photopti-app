(function exposeCropGeometry(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CropGeometry = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createCropGeometry() {
  const ASPECT_RATIOS = Object.freeze({
    '16:9': [16, 9],
    '1:1': [1, 1],
    '4:3': [4, 3]
  });
  const MAX_OUTPUT_DIMENSION = 20000;
  const MIN_CROP_PERCENT = 1;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getPresetRatio(aspectRatio, orientation = 'landscape') {
    if (aspectRatio === 'free') return null;
    const pair = ASPECT_RATIOS[aspectRatio];
    if (!pair) throw new Error(`Unsupported cover aspect ratio: ${aspectRatio}`);
    return orientation === 'portrait' ? pair[1] / pair[0] : pair[0] / pair[1];
  }

  function getCropRatio(box, imageAspectRatio) {
    if (!box || !(imageAspectRatio > 0) || !(box.height > 0)) return null;
    return (box.width / box.height) * imageAspectRatio;
  }

  function fitBoxToRatio(box, targetRatio, imageAspectRatio, requestedWidth) {
    if (!(targetRatio > 0) || !(imageAspectRatio > 0)) return { ...box };
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const normalizedRatio = targetRatio / imageAspectRatio;
    let width;
    let height;

    if (Number.isFinite(requestedWidth)) {
      width = clamp(requestedWidth, MIN_CROP_PERCENT, 100);
      height = width / normalizedRatio;
    } else {
      const area = Math.max(MIN_CROP_PERCENT ** 2, box.width * box.height);
      width = Math.sqrt(area * normalizedRatio);
      height = width / normalizedRatio;
    }

    if (width > 100) {
      width = 100;
      height = width / normalizedRatio;
    }
    if (height > 100) {
      height = 100;
      width = height * normalizedRatio;
    }

    width = clamp(width, MIN_CROP_PERCENT, 100);
    height = clamp(height, MIN_CROP_PERCENT, 100);
    return {
      x: clamp(centerX - width / 2, 0, 100 - width),
      y: clamp(centerY - height / 2, 0, 100 - height),
      width,
      height
    };
  }

  function dimensionsForRatio(value, anchor, ratio) {
    const dimension = parseOutputDimension(value);
    if (!(ratio > 0)) throw new Error('Cover ratio must be a positive number');
    const dimensions = anchor === 'height'
      ? { width: Math.max(1, Math.round(dimension * ratio)), height: dimension }
      : { width: dimension, height: Math.max(1, Math.round(dimension / ratio)) };
    parseOutputDimension(dimensions.width);
    parseOutputDimension(dimensions.height);
    return dimensions;
  }

  function parseOutputDimension(value) {
    const number = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(number) || !Number.isInteger(number) || number < 1 || number > MAX_OUTPUT_DIMENSION) {
      throw new Error(`Cover dimensions must be whole numbers from 1 to ${MAX_OUTPUT_DIMENSION}`);
    }
    return number;
  }

  return {
    ASPECT_RATIOS,
    MAX_OUTPUT_DIMENSION,
    MIN_CROP_PERCENT,
    clamp,
    dimensionsForRatio,
    fitBoxToRatio,
    getCropRatio,
    getPresetRatio,
    parseOutputDimension
  };
}));
