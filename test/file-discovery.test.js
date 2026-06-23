const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const {
  isSupportedImagePath,
  listImagesInDirectory,
  resolveDroppedToImages,
} = require("../main-process/file-discovery");

async function withTempDir(fn) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "photopti-"));
  try {
    await fn(dir);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

test("detects supported image extensions case-insensitively", () => {
  assert.equal(isSupportedImagePath("/tmp/photo.JPG"), true);
  assert.equal(isSupportedImagePath("/tmp/photo.heic"), true);
  assert.equal(isSupportedImagePath("/tmp/notes.txt"), false);
});

test("lists supported images recursively", async () => {
  await withTempDir(async (dir) => {
    await fs.promises.writeFile(path.join(dir, "a.jpg"), "");
    await fs.promises.writeFile(path.join(dir, "b.txt"), "");
    await fs.promises.mkdir(path.join(dir, "nested"));
    await fs.promises.writeFile(path.join(dir, "nested", "c.jpg"), "");

    const images = await listImagesInDirectory(dir);

    assert.deepEqual(images.map((p) => path.relative(dir, p)), [
      "a.jpg",
      path.join("nested", "c.jpg"),
    ]);
  });
});

test("respects discovery depth and file limits", async () => {
  await withTempDir(async (dir) => {
    await fs.promises.writeFile(path.join(dir, "a.jpg"), "");
    await fs.promises.writeFile(path.join(dir, "b.jpg"), "");
    await fs.promises.mkdir(path.join(dir, "nested"));
    await fs.promises.writeFile(path.join(dir, "nested", "c.jpg"), "");

    const shallow = await listImagesInDirectory(dir, { maxDepth: 0 });
    const limited = await listImagesInDirectory(dir, { maxFiles: 1 });

    assert.deepEqual(shallow.map((p) => path.relative(dir, p)), ["a.jpg", "b.jpg"]);
    assert.equal(limited.length, 1);
  });
});

test("resolves mixed dropped paths to supported image files", async () => {
  await withTempDir(async (dir) => {
    const jpg = path.join(dir, "a.jpg");
    const txt = path.join(dir, "b.txt");
    await fs.promises.writeFile(jpg, "");
    await fs.promises.writeFile(txt, "");

    const images = await resolveDroppedToImages([jpg, txt, path.join(dir, "x")]);

    assert.deepEqual(images, [jpg]);
  });
});
