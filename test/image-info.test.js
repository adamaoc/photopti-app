const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const test = require("node:test");
const { getImageInfo } = require("../main-process/image-info");

async function withTempDir(fn) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "photopti-"));
  try {
    await fn(dir);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

test("reads image metadata for the sidebar", async () => {
  await withTempDir(async (dir) => {
    const source = path.join(dir, "hero.png");
    await sharp({
      create: {
        width: 1280,
        height: 720,
        channels: 3,
        background: "#224466",
      },
    })
      .png()
      .toFile(source);

    const info = await getImageInfo(source);

    assert.equal(info.name, "hero.png");
    assert.equal(info.folder, dir);
    assert.equal(info.width, 1280);
    assert.equal(info.height, 720);
    assert.equal(info.format, "PNG");
    assert.equal(info.size > 0, true);
    assert.equal(info.path, source);
  });
});