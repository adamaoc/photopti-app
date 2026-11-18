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

const { resolveInputPaths, scanDirectory } = require("../main-process/file-discovery");

test("skips hidden files such as macOS AppleDouble sidecars", async () => {
  await withTempDir(async (dir) => {
    await fs.promises.writeFile(path.join(dir, "IMG_1.jpg"), "");
    await fs.promises.writeFile(path.join(dir, "._IMG_1.jpg"), "");
    await fs.promises.mkdir(path.join(dir, ".thumbnails"));
    await fs.promises.writeFile(path.join(dir, ".thumbnails", "x.jpg"), "");

    const images = await listImagesInDirectory(dir);
    const dropped = await resolveDroppedToImages([path.join(dir, "._IMG_1.jpg")]);

    assert.deepEqual(images.map((p) => path.basename(p)), ["IMG_1.jpg"]);
    assert.deepEqual(dropped, []);
  });
});

test("does not rediscover images inside the output folder", async () => {
  await withTempDir(async (dir) => {
    await fs.promises.writeFile(path.join(dir, "a.jpg"), "");
    await fs.promises.mkdir(path.join(dir, "Opti"));
    await fs.promises.writeFile(path.join(dir, "Opti", "a.jpg"), "");

    const images = await listImagesInDirectory(dir, { excludeDirNames: ["opti"] });

    assert.deepEqual(images, [path.join(dir, "a.jpg")]);
  });
});

test("resolves several dropped folders and files together and reports roots", async () => {
  await withTempDir(async (dir) => {
    const one = path.join(dir, "one");
    const two = path.join(dir, "two");
    const loose = path.join(dir, "loose");
    for (const folder of [one, two, loose]) await fs.promises.mkdir(folder);
    await fs.promises.writeFile(path.join(one, "a.jpg"), "");
    await fs.promises.writeFile(path.join(two, "b.jpg"), "");
    await fs.promises.writeFile(path.join(loose, "c.jpg"), "");

    const result = await resolveInputPaths([one, two, path.join(loose, "c.jpg"), path.join(one, "a.jpg")]);

    assert.deepEqual(result.files, [
      path.join(one, "a.jpg"),
      path.join(two, "b.jpg"),
      path.join(loose, "c.jpg"),
    ]);
    assert.deepEqual(result.roots, [one, two, loose]);
    assert.equal(result.truncated, false);
  });
});

test("reports when discovery stops at the file limit", async () => {
  await withTempDir(async (dir) => {
    for (const name of ["a.jpg", "b.jpg", "c.jpg"]) {
      await fs.promises.writeFile(path.join(dir, name), "");
    }

    const scan = await scanDirectory(dir, { maxFiles: 2 });
    const resolved = await resolveInputPaths([dir], { maxFiles: 2 });
    const exact = await scanDirectory(dir, { maxFiles: 3 });

    assert.equal(scan.images.length, 2);
    assert.equal(scan.truncated, true);
    assert.equal(resolved.truncated, true);
    assert.equal(exact.truncated, false);
  });
});
