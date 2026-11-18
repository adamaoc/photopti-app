// End-to-end test that drives the real Electron app.
/* global coverCrop -- renderer global read inside page.evaluate callbacks */
// Run with `npm run test:e2e` (on Linux without a display: `xvfb-run -a npm run test:e2e`).
// Set PHOTOPTI_SCREENSHOT_DIR to save screenshots of each step.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const test = require("node:test");
const { _electron: electron } = require("playwright-core");
const { createFixtureLibrary } = require("./fixtures");

const appRoot = path.resolve(__dirname, "..");
const screenshotDir = process.env.PHOTOPTI_SCREENSHOT_DIR || null;

async function screenshot(page, name) {
  if (!screenshotDir) return;
  await fs.promises.mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, `${name}.png`) });
}

async function mockOpenDialog(app, filePaths) {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths });
  }, filePaths);
}

test("adds a folder, crops a cover, and processes a batch in the real app", { timeout: 180000 }, async (t) => {
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "photopti-e2e-"));
  t.after(() => fs.promises.rm(workDir, { recursive: true, force: true }));
  const { album } = await createFixtureLibrary(path.join(workDir, "library"));

  const app = await electron.launch({
    args: [
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
      `--user-data-dir=${path.join(workDir, "user-data")}`,
      appRoot,
    ],
    env: { ...process.env, NODE_ENV: "test" },
  });
  t.after(() => app.close());

  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForSelector("#dropzone");
  await screenshot(page, "01-empty");

  // External links go to the system browser instead of a new app window.
  await app.evaluate(({ shell }) => {
    globalThis.__openedExternal = [];
    shell.openExternal = async (url) => { globalThis.__openedExternal.push(url); };
  });
  await page.click(".powered a");
  await page.waitForTimeout(300);
  assert.equal(app.windows().length, 1);
  assert.deepEqual(await app.evaluate(() => globalThis.__openedExternal), ["https://ampnet.media/"]);

  // Add a folder through the browse menu.
  await mockOpenDialog(app, [album]);
  await page.click("#dropzoneTrigger");
  await page.click("#selectFolder");
  await page.waitForSelector(".thumb");
  // 18 scenes + phone photo + logo + corrupt file; the AppleDouble sidecar is skipped.
  assert.equal(await page.locator(".thumb").count(), 21);
  // Every thumbnail loads except the corrupt file's, which is marked as having no preview.
  await page.waitForFunction(() => document.querySelectorAll(".thumb img.thumb-loading").length === 0, null, { timeout: 60000 });
  assert.deepEqual(
    await page.$$eval(".thumb-unavailable", (els) => els.map((el) => el.dataset.path.split("/").pop())),
    ["corrupted-upload.jpg"]
  );
  assert.equal(await page.textContent("#galleryCount"), "21 images");
  assert.equal(await page.textContent("#footerSource"), album);

  // The phone photo reports its upright size.
  await page.click('.thumb[aria-label^="IMG_0420"]');
  await page.waitForFunction(() => document.querySelector("#selectedImageDimensions").textContent.includes("×"));
  assert.equal(await page.textContent("#selectedImageDimensions"), "1200 × 1800");

  // Batch settings: WebP needs no background; JPEG shows the background picker.
  await page.selectOption("#format", "webp");
  assert.equal(await page.isVisible("#background"), false);
  await page.selectOption("#format", "jpeg");
  assert.equal(await page.isVisible("#background"), true);
  await page.fill("#width", "1600");
  await page.locator("#width").dispatchEvent("change");
  await screenshot(page, "02-gallery-selected");

  // Promote a landscape image to cover: defaults are 16:9 at 1600 x 900.
  const coverThumb = page.locator('.thumb[aria-label^="DSC_1004"]');
  await coverThumb.hover();
  await coverThumb.locator(".thumb-cover-action").click();
  await page.waitForSelector("#coverEditor:not(.hidden)");
  await page.waitForFunction(() => document.querySelector("#coverCropImage").naturalWidth > 0);
  assert.equal(await page.inputValue("#coverAspect"), "16:9");
  assert.equal(await page.inputValue("#coverWidth"), "1600");
  assert.equal(await page.inputValue("#coverHeight"), "900");
  assert.equal(await page.textContent("#coverEditState"), "New cover, not saved yet");
  assert.equal(await page.isVisible("#saveCoverCrop"), true);
  assert.equal(await page.isVisible("#process"), false);

  // Adjust the crop with the keyboard, then save with Enter.
  await page.focus("#coverCropBox");
  for (let i = 0; i < 4; i++) await page.keyboard.press("Minus");
  for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(100);
  await screenshot(page, "03-cover-crop");
  const savedBox = await page.evaluate(() => JSON.stringify(coverCrop.box));
  await page.keyboard.press("Enter");
  await page.waitForSelector("#thumbs:not(.hidden)");
  assert.match(await page.textContent("#status"), /^Cover saved: DSC_1004\.jpg \(16:9 landscape · 1600 × 900 px\)/);
  await page.waitForSelector("#coverSummary:not(.hidden)");
  assert.equal(await page.textContent("#coverSummaryName"), "DSC_1004.jpg");
  assert.equal(await page.textContent("#coverSummaryMeta"), "16:9 landscape · 1600 × 900 px");
  await page.waitForFunction(() => Boolean(document.querySelector("#coverSummaryImage").getAttribute("src")));
  await screenshot(page, "03b-cover-saved");

  // Re-open with "Edit crop" and change it. A single Esc only warns; Cancel restores the saved crop.
  await page.click("#editCover");
  await page.waitForSelector("#coverEditor:not(.hidden)");
  assert.equal(await page.textContent("#coverEditState"), "");
  await page.focus("#coverCropBox");
  await page.keyboard.press("Shift+ArrowLeft");
  assert.equal(await page.textContent("#coverEditState"), "Unsaved changes");
  await page.keyboard.press("Escape");
  assert.equal(await page.textContent("#coverEditState"), "Press Esc again to discard your changes");
  assert.equal(await page.isVisible("#coverEditor"), true);
  await page.click("#cancelCoverCrop");
  await page.waitForSelector("#thumbs:not(.hidden)");
  assert.equal(await page.evaluate(() => JSON.stringify(coverCrop.box)), savedBox);
  assert.match(await page.textContent("#status"), /Crop changes discarded/);

  // Trying a different image as cover and cancelling keeps the saved cover.
  await page.click('.thumb[aria-label^="DSC_1001"]');
  await page.click("#selectedImageCoverAction");
  await page.waitForSelector("#coverEditor:not(.hidden)");
  await page.click("#cancelCoverCrop");
  assert.equal(await page.textContent("#footerCover"), "DSC_1004.jpg");
  assert.equal(await page.evaluate(() => JSON.stringify(coverCrop.box)), savedBox);

  // An invalid percentage is caught before anything is processed.
  await page.click('label.toggle:has(input[value="percentage"])');
  await page.fill("#percentage", "");
  await page.click("#process");
  assert.match(await page.textContent("#status"), /resize percentage/);
  await page.click('label.toggle:has(input[value="width"])');

  await page.click("#process");
  await page.waitForSelector("#results:not(.hidden)", { timeout: 120000 });
  const status = await page.textContent("#status");
  assert.match(status, /Done\. 20 processed, 1 failed\. Cover created\./);
  assert.match(await page.textContent("#resultsSavings"), /^Saved \d+%/);
  assert.equal(await page.textContent("#process"), "Process again");
  await page.evaluate(() => { document.querySelector("#failureDetails").open = true; });
  await page.locator("#results").scrollIntoViewIfNeeded();
  await screenshot(page, "04-results");

  // Check the files on disk.
  const outputDir = path.join(album, "Opti");
  const outputs = fs.readdirSync(outputDir).sort();
  assert.equal(outputs.length, 21);
  assert.ok(outputs.includes("cover-DSC_1004.jpg"));
  const cover = await sharp(path.join(outputDir, "cover-DSC_1004.jpg")).metadata();
  assert.deepEqual([cover.width, cover.height], [1600, 900]);
  assert.ok(!outputs.includes("corrupted-upload.jpg"));
  const phone = await sharp(path.join(outputDir, "IMG_0420 (phone).jpg")).metadata();
  assert.deepEqual([phone.width, phone.height], [1200, 1800]);
  const logoPixel = await sharp(path.join(outputDir, "studio-logo.jpg"))
    .extract({ left: 2, top: 2, width: 1, height: 1 })
    .raw()
    .toBuffer();
  assert.ok(logoPixel.every((channel) => channel > 245), "transparent corners should be white");

  // "Show in folder" opens the output folder through the shell.
  await app.evaluate(({ shell }) => {
    globalThis.__openedPaths = [];
    shell.openPath = async (dir) => { globalThis.__openedPaths.push(dir); return ""; };
  });
  await page.click("#openOutput");
  await page.waitForTimeout(200);
  assert.deepEqual(await app.evaluate(() => globalThis.__openedPaths), [outputDir]);

  // Processing again does not pick up the previous results.
  await page.click("#process");
  await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Done."), null, { timeout: 120000 });
  assert.match(await page.textContent("#status"), /Done\. 20 processed, 1 failed/);
  assert.equal(fs.readdirSync(outputDir).length, 42);

  // Settings persist for the next session.
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("photopti.batchSettings.v1")).width), 1600);

  // Navigating away (as a stray file drop would) must not replace the app.
  const getUrl = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getURL());
  const startUrl = await getUrl();
  await page.evaluate(() => setTimeout(() => { window.location.href = "file:///etc/hosts"; }, 0));
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(await getUrl(), startUrl);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
});

test("pages very large folders and asks for an output folder for unrelated sources", { timeout: 180000 }, async (t) => {
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "photopti-e2e-"));
  t.after(() => fs.promises.rm(workDir, { recursive: true, force: true }));
  const big = path.join(workDir, "Big export");
  const other = path.join(workDir, "Client picks");
  await fs.promises.mkdir(big, { recursive: true });
  await fs.promises.mkdir(other, { recursive: true });
  const { writeScene } = require("./fixtures");
  const seeds = [];
  for (let i = 0; i < 6; i++) {
    seeds.push(await writeScene(path.join(workDir, `seed-${i}.jpg`), i, { width: 600, height: 400 }));
  }
  for (let i = 0; i < 260; i++) {
    await fs.promises.copyFile(seeds[i % seeds.length], path.join(big, `frame-${String(i).padStart(4, "0")}.jpg`));
  }
  await fs.promises.copyFile(seeds[1], path.join(other, "pick-01.jpg"));

  const app = await electron.launch({
    args: [
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
      `--user-data-dir=${path.join(workDir, "user-data")}`,
      appRoot,
    ],
  });
  t.after(() => app.close());
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });

  await mockOpenDialog(app, [big, other]);
  await page.click("#dropzoneTrigger");
  await page.click("#selectFolder");
  await page.waitForSelector(".thumb");
  assert.equal(await page.textContent("#galleryCount"), "261 images");
  assert.equal(await page.textContent("#footerSource"), "Multiple folders (2)");
  assert.equal(await page.isVisible("#folderSelection"), true);

  await page.click("#process");
  assert.match(await page.textContent("#status"), /Select an output folder/);

  // Scrolling to the end of the first page loads the rest.
  await page.locator(".thumb-show-more").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll(".thumb").length === 261);
  await page.locator(".thumb").nth(240).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll(".thumb img.thumb-loading").length === 0, null, { timeout: 60000 });
  await screenshot(page, "05-large-gallery-multi-folder");
});
