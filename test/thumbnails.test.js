const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const test = require("node:test");
const { createThumbnail, getThumbnails } = require("../main-process/thumbnails");

async function withTempDir(fn) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "photopti-"));
  try {
    await fn(dir);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

test("creates a jpeg data URL thumbnail", async () => {
  await withTempDir(async (dir) => {
    const source = path.join(dir, "source.png");
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: "#6688aa",
      },
    })
      .png()
      .toFile(source);

    const thumbnail = await createThumbnail(source, 120);

    assert.equal(thumbnail.startsWith("data:image/jpeg;base64,"), true);
    assert.equal(thumbnail.length < 20000, true);
  });
});

test("returns null thumbnails for files that fail generation", async () => {
  await withTempDir(async (dir) => {
    const source = path.join(dir, "broken.jpg");
    await fs.promises.writeFile(source, "not an image");

    const thumbnails = await getThumbnails([source], { size: 120 });

    assert.deepEqual(thumbnails, { [source]: null });
  });
});

test("creates upright thumbnails for EXIF-rotated photos", async () => {
  const { withTempDir, writeImage } = require("./helpers");
  await withTempDir(async (dir) => {
    const source = await writeImage(path.join(dir, "phone.jpg"), {
      width: 400,
      height: 200,
      format: "jpeg",
      orientation: 6,
    });

    const dataUrl = await createThumbnail(source, 100);
    const metadata = await sharp(Buffer.from(dataUrl.split(",")[1], "base64")).metadata();

    assert.equal(metadata.width, 50);
    assert.equal(metadata.height, 100);
  });
});
