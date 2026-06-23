const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const test = require("node:test");
const {
  allocateUniquePath,
  getCoverExtract,
  getCoverOutputName,
  getErrorMessage,
  getOutputName,
  normalizeInteger,
  normalizePathSegment,
  normalizeProcessOptions,
  processImages,
} = require("../main-process/image-processor");

async function withTempDir(fn) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "photopti-"));
  try {
    await fn(dir);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

test("normalizes missing process options to current defaults", () => {
  assert.deepEqual(normalizeProcessOptions({}), {
    output: "Opti",
    quality: 80,
    width: 800,
    percentage: undefined,
    outputBaseDir: null,
    rename: undefined,
    coverImagePath: null,
    cover: {
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
      orientation: "landscape",
      crop: {
        x: 5,
        y: 24.6875,
        width: 90,
        height: 50.625,
      },
      suffix: "cover",
    },
  });
});

test("normalizes percentage mode by disabling fixed width", () => {
  const options = normalizeProcessOptions({
    output: " Web ",
    quality: 75,
    width: 1200,
    percentage: 50,
    outputBaseDir: "/tmp/out",
    rename: "listing",
  });

  assert.deepEqual(options, {
    output: "Web",
    quality: 75,
    width: undefined,
    percentage: 50,
    outputBaseDir: "/tmp/out",
    rename: "listing",
    coverImagePath: null,
    cover: {
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
      orientation: "landscape",
      crop: {
        x: 5,
        y: 24.6875,
        width: 90,
        height: 50.625,
      },
      suffix: "cover",
    },
  });
});

test("clamps batch options, locks cover dimensions, and sanitizes names", () => {
  const options = normalizeProcessOptions({
    output: ' Web:Ready ',
    quality: 500,
    width: -25,
    rename: 'listing*hero',
    cover: {
      width: 1600,
      height: 200,
      suffix: 'cover*wide',
    },
  });

  assert.equal(options.output, "Web-Ready");
  assert.equal(options.quality, 100);
  assert.equal(options.width, 1);
  assert.equal(options.rename, "listing-hero");
  assert.equal(options.cover.width, 1600);
  assert.equal(options.cover.height, 900);
  assert.equal(options.cover.suffix, "cover-wide");
});

test("rejects invalid cover dimensions and creates an exact 9:16 portrait size", () => {
  for (const value of [0, -1, 1.5, "nope", 20001]) {
    assert.throws(
      () => normalizeProcessOptions({ cover: { width: value } }),
      /Cover dimensions must be whole numbers/
    );
  }

  const options = normalizeProcessOptions({
    cover: {
      width: 900,
      height: 1600,
      aspectRatio: "16:9",
      orientation: "portrait",
    },
  });
  assert.equal(options.cover.width, 900);
  assert.equal(options.cover.height, 1600);

  const rounded = normalizeProcessOptions({
    cover: {
      width: 563,
      height: 1000,
      dimensionAnchor: "height",
      aspectRatio: "16:9",
      orientation: "portrait",
    },
  });
  assert.equal(rounded.cover.width, 563);
  assert.equal(rounded.cover.height, 1000);
});

test("rejects path traversal in output folder, rename base, and cover suffix", () => {
  assert.throws(
    () => normalizeProcessOptions({ output: "../Opti" }),
    /output folder cannot contain path separators/
  );
  assert.throws(
    () => normalizeProcessOptions({ rename: "listing/hero" }),
    /rename base cannot contain path separators/
  );
  assert.throws(
    () => normalizeProcessOptions({ cover: { suffix: "cover\\wide" } }),
    /cover suffix cannot contain path separators/
  );
});

test("normalizes integer and path segment helpers", () => {
  assert.equal(normalizeInteger("72.2", 1, 100, 80), 72);
  assert.equal(normalizeInteger("nope", 1, 100, 80), 80);
  assert.equal(normalizePathSegment("bad:name", "fallback", "label"), "bad-name");
});

test("builds output names from rename counter or original basename", () => {
  assert.equal(
    getOutputName(path.join("photos", "front.png"), { rename: "listing" }, 3),
    "listing-003.jpg"
  );
  assert.equal(
    getOutputName(path.join("photos", "front.png"), {}, 3),
    "front.jpg"
  );
});

test("builds cover output names with a distinct prefix", () => {
  assert.equal(
    getCoverOutputName(path.join("photos", "front.png"), {
      cover: { suffix: "cover" },
    }),
    "cover-front.jpg"
  );
  assert.equal(
    getCoverOutputName(path.join("photos", "front.png"), {
      rename: "listing",
      cover: { suffix: "cover" },
    }),
    "cover-listing.jpg"
  );
});

test("converts normalized cover crop coordinates to sharp extract values", () => {
  assert.deepEqual(
    getCoverExtract(
      { width: 1000, height: 500 },
      { x: 10, y: 20, width: 40, height: 50 }
    ),
    {
      left: 100,
      top: 100,
      width: 400,
      height: 250,
    }
  );
});

test("creates a separate 16:9 cover output without changing batch output sizing", async () => {
  await withTempDir(async (dir) => {
    const source = path.join(dir, "source.png");
    await sharp({
      create: {
        width: 1200,
        height: 900,
        channels: 3,
        background: "#6688aa",
      },
    })
      .png()
      .toFile(source);

    const summary = await processImages({
      paths: [source],
      options: {
        output: "Opti",
        width: 600,
        quality: 80,
        coverImagePath: source,
        cover: {
          width: 1920,
          height: 1080,
          aspectRatio: "16:9",
          orientation: "landscape",
          crop: {
            x: 0,
            y: 0,
            width: 100,
            height: 75,
          },
          suffix: "cover",
        },
      },
    });

    const normalMetadata = await sharp(path.join(dir, "Opti", "source.jpg")).metadata();
    const coverMetadata = await sharp(path.join(dir, "Opti", "cover-source.jpg")).metadata();

    assert.equal(summary.processed, 1);
    assert.equal(summary.cover.processed, 1);
    assert.equal(normalMetadata.width, 600);
    assert.equal(coverMetadata.width, 1920);
    assert.equal(coverMetadata.height, 1080);
  });
});

test("creates a 900x1600 portrait cover from the selected source region", async () => {
  await withTempDir(async (dir) => {
    const source = path.join(dir, "portrait-source.png");
    await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 3,
        background: "#ff0000",
      },
    })
      .composite([{
        input: Buffer.from('<svg width="100" height="100"><rect width="100" height="100" fill="#0000ff"/></svg>'),
        left: 100,
        top: 0,
      }])
      .png()
      .toFile(source);

    await processImages({
      paths: [source],
      options: {
        output: "Opti",
        coverImagePath: source,
        cover: {
          width: 900,
          height: 1600,
          aspectRatio: "16:9",
          orientation: "portrait",
          crop: { x: 0, y: 0, width: 28.125, height: 100 },
        },
      },
    });

    const output = sharp(path.join(dir, "Opti", "cover-portrait-source.jpg"));
    const metadata = await output.metadata();
    const pixel = await output.extract({ left: 450, top: 800, width: 1, height: 1 }).raw().toBuffer();
    assert.equal(metadata.width, 900);
    assert.equal(metadata.height, 1600);
    assert.ok(pixel[0] > 240 && pixel[1] < 20 && pixel[2] < 20);
  });
});

test("captures per-file failure details without stopping the batch", async () => {
  await withTempDir(async (dir) => {
    const originalWarn = console.warn;
    const good = path.join(dir, "good.png");
    const bad = path.join(dir, "bad.jpg");
    await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: "#6688aa",
      },
    })
      .png()
      .toFile(good);
    await fs.promises.writeFile(bad, "not an image");

    let summary;
    try {
      console.warn = () => {};
      summary = await processImages({
        paths: [good, bad],
        options: {
          output: "Opti",
          width: 200,
          quality: 80,
        },
      });
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(summary.processed, 1);
    assert.equal(summary.errors, 1);
    assert.equal(summary.failures.length, 1);
    assert.equal(summary.failures[0].source, bad);
    assert.equal(summary.failures[0].dest, path.join(dir, "Opti", "bad.jpg"));
    assert.equal(typeof summary.failures[0].message, "string");
  });
});

test("can cancel before processing starts and report skipped files", async () => {
  await withTempDir(async (dir) => {
    const first = path.join(dir, "first.png");
    const second = path.join(dir, "second.png");
    for (const source of [first, second]) {
      await sharp({
        create: {
          width: 400,
          height: 300,
          channels: 3,
          background: "#6688aa",
        },
      })
        .png()
        .toFile(source);
    }

    const summary = await processImages(
      {
        paths: [first, second],
        options: {
          output: "Opti",
          width: 200,
          quality: 80,
        },
      },
      null,
      { shouldCancel: () => true }
    );

    assert.equal(summary.canceled, true);
    assert.equal(summary.processed, 0);
    assert.equal(summary.skipped, 2);
    assert.equal(summary.errors, 0);
  });
});

test("formats unknown errors safely", () => {
  assert.equal(getErrorMessage("plain failure"), "plain failure");
});

test("allocates unique destinations when names collide", async () => {
  await withTempDir(async (dir) => {
    const used = new Set();
    const first = allocateUniquePath(dir, "photo.jpg", used);
    const second = allocateUniquePath(dir, "photo.jpg", used);
    await fs.promises.writeFile(path.join(dir, "photo-3.jpg"), "");
    const third = allocateUniquePath(dir, "photo.jpg", used);

    assert.equal(first, path.join(dir, "photo.jpg"));
    assert.equal(second, path.join(dir, "photo-2.jpg"));
    assert.equal(third, path.join(dir, "photo-4.jpg"));
  });
});

test("does not overwrite duplicate source basenames from different folders", async () => {
  await withTempDir(async (dir) => {
    const oneDir = path.join(dir, "one");
    const twoDir = path.join(dir, "two");
    const outputDir = path.join(dir, "out");
    await fs.promises.mkdir(oneDir);
    await fs.promises.mkdir(twoDir);
    await fs.promises.mkdir(outputDir);

    const first = path.join(oneDir, "same.png");
    const second = path.join(twoDir, "same.png");
    for (const source of [first, second]) {
      await sharp({
        create: {
          width: 400,
          height: 300,
          channels: 3,
          background: "#6688aa",
        },
      })
        .png()
        .toFile(source);
    }

    const summary = await processImages({
      paths: [first, second],
      options: {
        output: "Opti",
        outputBaseDir: outputDir,
        width: 200,
        quality: 80,
      },
    });

    assert.equal(summary.processed, 2);
    assert.equal(fs.existsSync(path.join(outputDir, "Opti", "same.jpg")), true);
    assert.equal(fs.existsSync(path.join(outputDir, "Opti", "same-2.jpg")), true);
  });
});
