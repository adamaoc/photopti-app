const assert = require('node:assert/strict');
const test = require('node:test');
const {
  dimensionsForRatio,
  fitBoxToRatio,
  getCropRatio,
  getPresetRatio,
  parseOutputDimension
} = require('../renderer/crop-geometry');

test('preset ratios become reciprocal in portrait orientation', () => {
  assert.equal(getPresetRatio('16:9', 'landscape'), 16 / 9);
  assert.equal(getPresetRatio('16:9', 'portrait'), 9 / 16);
  assert.equal(getPresetRatio('4:3', 'portrait'), 3 / 4);
  assert.equal(getPresetRatio('1:1', 'portrait'), 1);
});

test('crop geometry accounts for the image aspect and remains in bounds', () => {
  const source = { x: 70, y: 70, width: 25, height: 20 };
  for (const ratio of [16 / 9, 9 / 16, 1, 4 / 3, 3 / 4]) {
    const box = fitBoxToRatio(source, ratio, 2);
    assert.ok(Math.abs(getCropRatio(box, 2) - ratio) < 1e-10);
    assert.ok(box.x >= 0 && box.y >= 0);
    assert.ok(box.x + box.width <= 100 + 1e-10);
    assert.ok(box.y + box.height <= 100 + 1e-10);
  }
});

test('ratio changes preserve crop center unless an image edge constrains it', () => {
  const source = { x: 30, y: 35, width: 40, height: 30 };
  const box = fitBoxToRatio(source, 9 / 16, 4 / 3);
  assert.ok(Math.abs(box.x + box.width / 2 - 50) < 1e-10);
  assert.ok(Math.abs(box.y + box.height / 2 - 50) < 1e-10);
});

test('output dimensions lock to either edited axis', () => {
  assert.deepEqual(dimensionsForRatio(1600, 'height', 9 / 16), { width: 900, height: 1600 });
  assert.deepEqual(dimensionsForRatio(1200, 'width', 4 / 3), { width: 1200, height: 900 });
  for (const value of ['', 0, -1, 1.2, 'abc', 20001]) {
    assert.throws(() => parseOutputDimension(value), /whole numbers/);
  }
  assert.throws(() => dimensionsForRatio(20000, 'height', 16 / 9), /whole numbers/);
});
