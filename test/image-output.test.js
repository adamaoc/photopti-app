const assert = require("assert");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const test = require("node:test");
const { withTempDir, writeImage } = require("./helpers");
const {
  collapseSourceRoots,
  normalizeProcessOptions,
  processImages,
  resolveOutputBaseDir,
} = require("../main-process/image-processor");

const quietly = async (fn) => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = originalWarn;
  }
};

test("applies EXIF orientation so phone photos are not sideways", async () => {
  await withTempDir(async (dir) => {
    // Stored as 400x200 landscape pixels, tagged "rotate 90° clockwise".
    const source = await writeImage(path.join(dir, "phone.jpg"), {
      width: 400,
      height: 200,
      format: "jpeg",
      orientation: 6,
    });

    await processImages({ paths: [source], options: { width: 100 } });

    const output = await sharp(path.join(dir, "Opti", "phone.jpg")).metadata();
    assert.equal(output.width, 100);
    assert.equal(output.height, 200);
    assert.ok(output.orientation === undefined || output.orientation === 1);
  });
});

test("crops the cover from the upright image", async () => {
  await withTempDir(async (dir) => {
    // Upright, this is 200 wide and 400 tall: red top half, blue bottom half.
    const raw = path.join(dir, "raw.png");
    await sharp({ create: { width: 200, height: 400, channels: 3, background: "red" } })
      .composite([{
        input: { create: { width: 200, height: 200, channels: 3, background: "blue" } },
        top: 200,
        left: 0,
      }])
      .png()
      .toFile(raw);
    // Store it rotated 90° counter-clockwise with orientation 6 to undo it.
    const source = path.join(dir, "phone.jpg");
    await sharp(raw).rotate(-90).jpeg({ quality: 95 }).withMetadata({ orientation: 6 }).toFile(source);

    await processImages({
      paths: [source],
      options: {
        width: 100,
        coverImagePath: source,
        cover: {
          aspectRatio: "free",
          width: 100,
          height: 100,
          crop: { x: 0, y: 60, width: 100, height: 40 },
        },
      },
    });

    const pixel = await sharp(path.join(dir, "Opti", "cover-phone.jpg"))
      .extract({ left: 50, top: 50, width: 1, height: 1 })
      .raw()
      .toBuffer();
    assert.ok(pixel[2] > 200 && pixel[0] < 60, `expected blue, got ${[...pixel]}`);
  });
});

test("does not upscale images smaller than the target width unless asked", async () => {
  await withTempDir(async (dir) => {
    const source = await writeImage(path.join(dir, "small.png"), { width: 300, height: 200 });

    await processImages({ paths: [source], options: { width: 800 } });
    const kept = await sharp(path.join(dir, "Opti", "small.jpg")).metadata();

    await processImages({ paths: [source], options: { width: 800, enlarge: true, output: "Big" } });
    const enlarged = await sharp(path.join(dir, "Big", "small.jpg")).metadata();

    await processImages({ paths: [source], options: { percentage: 200, output: "Double" } });
    const doubled = await sharp(path.join(dir, "Double", "small.jpg")).metadata();

    assert.equal(kept.width, 300);
    assert.equal(enlarged.width, 800);
    assert.equal(doubled.width, 600);
  });
});

test("fills transparency with the background colour for JPEG and keeps it for WebP", async () => {
  await withTempDir(async (dir) => {
    const source = await writeImage(path.join(dir, "logo.png"), {
      width: 50,
      height: 50,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });

    await processImages({ paths: [source], options: { width: 50 } });
    await processImages({ paths: [source], options: { width: 50, output: "Red", background: "#ff0000" } });
    await processImages({ paths: [source], options: { width: 50, output: "Web", format: "webp" } });

    const white = await sharp(path.join(dir, "Opti", "logo.jpg")).raw().toBuffer();
    const red = await sharp(path.join(dir, "Red", "logo.jpg")).raw().toBuffer();
    const webp = await sharp(path.join(dir, "Web", "logo.webp")).metadata();

    assert.ok(white[0] > 245 && white[1] > 245 && white[2] > 245);
    assert.ok(red[0] > 240 && red[1] < 20 && red[2] < 20);
    assert.equal(webp.format, "webp");
    assert.equal(webp.hasAlpha, true);
  });
});

test("writes WebP and AVIF files with matching extensions", async () => {
  await withTempDir(async (dir) => {
    const source = await writeImage(path.join(dir, "photo.png"));

    await processImages({ paths: [source], options: { width: 100, format: "webp" } });
    await processImages({ paths: [source], options: { width: 100, format: "avif", output: "Avif" } });

    assert.equal((await sharp(path.join(dir, "Opti", "photo.webp")).metadata()).format, "webp");
    assert.equal((await sharp(path.join(dir, "Avif", "photo.avif")).metadata()).format, "heif");
    assert.throws(() => normalizeProcessOptions({ format: "gif" }), /Unsupported output format/);
  });
});

test("keeps EXIF metadata only when asked", async () => {
  await withTempDir(async (dir) => {
    const source = path.join(dir, "photo.jpg");
    await sharp({ create: { width: 300, height: 200, channels: 3, background: "#456" } })
      .jpeg()
      .withExif({ IFD0: { Copyright: "Photopti Test" } })
      .toFile(source);

    await processImages({ paths: [source], options: { width: 100 } });
    await processImages({ paths: [source], options: { width: 100, keepMetadata: true, output: "Meta" } });

    const stripped = await sharp(path.join(dir, "Opti", "photo.jpg")).metadata();
    const kept = await sharp(path.join(dir, "Meta", "photo.jpg")).metadata();
    assert.equal(stripped.exif, undefined);
    assert.ok(kept.exif && kept.exif.includes(Buffer.from("Photopti Test")));
  });
});

test("reports total input and output bytes", async () => {
  await withTempDir(async (dir) => {
    const source = await writeImage(path.join(dir, "big.png"), { width: 1200, height: 900 });

    const summary = await processImages({ paths: [source], options: { width: 300 } });

    assert.equal(summary.inputBytes, fs.statSync(source).size);
    assert.equal(summary.outputBytes, fs.statSync(path.join(dir, "Opti", "big.jpg")).size);
    assert.ok(summary.outputBytes < summary.inputBytes);
    assert.equal(summary.format, "jpeg");
  });
});

test("re-processing a folder ignores earlier results in its output folder", async () => {
  await withTempDir(async (dir) => {
    await writeImage(path.join(dir, "a.png"));
    await writeImage(path.join(dir, "b.png"));

    const first = await processImages({ paths: [dir], options: { width: 100 } });
    const second = await processImages({ paths: [dir], options: { width: 100 } });

    assert.equal(first.processed, 2);
    assert.equal(second.processed, 2);
    assert.deepEqual(fs.readdirSync(path.join(dir, "Opti")).sort(), ["a-2.jpg", "a.jpg", "b-2.jpg", "b.jpg"]);
  });
});

test("never processes files that live inside the run's output folder", async () => {
  await withTempDir(async (dir) => {
    const source = await writeImage(path.join(dir, "a.png"));
    const previous = await writeImage(path.join(dir, "Opti", "a.png"));

    const summary = await processImages({
      paths: [source, previous],
      sourceRoots: [dir],
      options: { width: 100 },
    });

    assert.equal(summary.processed, 1);
  });
});

test("writes output inside the dropped folder even when images are only in subfolders", async () => {
  await withTempDir(async (dir) => {
    const one = await writeImage(path.join(dir, "2024", "one.png"));
    const two = await writeImage(path.join(dir, "2025", "two.png"));

    const summary = await processImages({
      paths: [one, two],
      sourceRoots: [dir],
      options: { width: 100 },
    });

    assert.equal(summary.outputDir, path.join(dir, "Opti"));
    assert.equal(summary.processed, 2);
  });
});

test("requires an output folder when sources span unrelated folders", async () => {
  await withTempDir(async (dir) => {
    const one = await writeImage(path.join(dir, "one", "a.png"));
    const two = await writeImage(path.join(dir, "two", "b.png"));

    await assert.rejects(
      processImages({ paths: [one, two], options: { width: 100 } }),
      /multiple folders/
    );
  });
});

test("collapses duplicate and nested source roots", () => {
  const base = path.resolve("/photos");
  assert.deepEqual(
    collapseSourceRoots([base, path.join(base, "2024"), base, path.resolve("/photos-old")]),
    [base, path.resolve("/photos-old")]
  );
  assert.equal(resolveOutputBaseDir([base, path.join(base, "nested")]), base);
  assert.equal(resolveOutputBaseDir([base, path.resolve("/other")], "/chosen"), "/chosen");
});

test("numbers renamed files in input order while processing in parallel", async () => {
  await withTempDir(async (dir) => {
    const sources = [];
    for (const [name, width] of [["c.png", 1600], ["a.png", 200], ["b.png", 900]]) {
      sources.push(await writeImage(path.join(dir, name), { width, height: 100 }));
    }

    await processImages({ paths: sources, options: { width: 150, rename: "shot" } }, null, { concurrency: 3 });

    const heights = [];
    for (const name of ["shot-001.jpg", "shot-002.jpg", "shot-003.jpg"]) {
      heights.push((await sharp(path.join(dir, "Opti", name)).metadata()).height);
    }
    // Heights reveal which source each output came from: 1600→9, 200→75, 900→17.
    assert.deepEqual(heights, [9, 75, 17]);
  });
});

test("removes partially written output when a file fails", async () => {
  await withTempDir(async (dir) => {
    const bad = path.join(dir, "bad.png");
    const header = fs.readFileSync(await writeImage(path.join(dir, "seed.png"), { width: 2000, height: 2000 }));
    fs.writeFileSync(bad, header.subarray(0, Math.floor(header.length / 2)));

    const summary = await quietly(() => processImages({ paths: [bad], options: { width: 100 } }));

    assert.equal(summary.errors, 1);
    assert.equal(fs.existsSync(path.join(dir, "Opti", "bad.jpg")), false);
  });
});
