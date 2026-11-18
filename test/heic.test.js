const assert = require("assert");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const test = require("node:test");
const { withTempDir } = require("./helpers");
const { getImageInfo } = require("../main-process/image-info");
const { createThumbnail } = require("../main-process/thumbnails");
const { processImages } = require("../main-process/image-processor");

// 64x32 HEIC: left half red, right half blue.
const fixture = path.join(__dirname, "fixtures", "sample.heic");

test("reads HEIC dimensions without decoding pixels", async () => {
  const info = await getImageInfo(fixture);
  assert.equal(info.width, 64);
  assert.equal(info.height, 32);
  assert.equal(info.format, "HEIF");
});

test("creates HEIC thumbnails", async () => {
  const dataUrl = await createThumbnail(fixture, 32);
  const metadata = await sharp(Buffer.from(dataUrl.split(",")[1], "base64")).metadata();
  assert.deepEqual([metadata.width, metadata.height], [32, 16]);
});

test("converts HEIC to the chosen output format with correct colours", async () => {
  await withTempDir(async (dir) => {
    const source = path.join(dir, "phone.heic");
    fs.copyFileSync(fixture, source);

    const summary = await processImages({ paths: [source], options: { width: 32, quality: 90 } });

    assert.equal(summary.processed, 1);
    const output = path.join(dir, "Opti", "phone.jpg");
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height], [32, 16]);
    const pixel = (x, y) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
    const [r1, , b1] = pixel(4, 8);
    const [r2, , b2] = pixel(28, 8);
    assert.ok(r1 > 150 && b1 < 90, `left should be red, got ${pixel(4, 8)}`);
    assert.ok(b2 > 150 && r2 < 90, `right should be blue, got ${pixel(28, 8)}`);
  });
});
