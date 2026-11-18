const assert = require("assert");
const path = require("path");
const test = require("node:test");
const { withTempDir, writeImage } = require("./helpers");
const { createProcessRunner, registerIpcHandlers } = require("../main-process/ipc");

function createHarness(overrides = {}) {
  const handlers = new Map();
  const listeners = new Map();
  const opened = [];
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    on: (channel, listener) => listeners.set(channel, listener),
  };
  const dialog = {
    showOpenDialog: overrides.showOpenDialog || (async () => ({ canceled: true, filePaths: [] })),
  };
  const shell = { openPath: async (dir) => { opened.push(dir); return ""; } };
  const { registry } = registerIpcHandlers({ ipcMain, dialog, shell, processImages: overrides.processImages });
  return { handlers, listeners, opened, registry };
}

function createWebContents() {
  const sent = [];
  return {
    sent,
    destroyed: false,
    isDestroyed() { return this.destroyed; },
    send(channel, data) { sent.push({ channel, data }); },
    once() {},
    removeListener() {},
  };
}

test("only reads thumbnails and info for images the user added", async () => {
  await withTempDir(async (dir) => {
    const added = await writeImage(path.join(dir, "added.png"));
    const other = await writeImage(path.join(dir, "elsewhere", "other.png"));
    const { handlers } = createHarness();

    const listed = await handlers.get("list-images")(null, [added]);
    const thumbnails = await handlers.get("get-thumbnails")(null, [added, other]);

    assert.deepEqual(listed.files, [added]);
    assert.deepEqual(Object.keys(thumbnails), [added]);
    await assert.rejects(handlers.get("get-image-info")(null, other), /Unknown image/);
    assert.equal((await handlers.get("get-image-info")(null, added)).name, "added.png");
  });
});

test("ignores relative paths when listing images", async () => {
  const { handlers } = createHarness();
  const result = await handlers.get("list-images")(null, ["relative/photo.jpg"]);
  assert.deepEqual(result.files, []);
});

test("rejects processing paths and output folders that were not chosen by the user", async () => {
  await withTempDir(async (dir) => {
    const added = await writeImage(path.join(dir, "added.png"));
    const calls = [];
    const { handlers, listeners } = createHarness({
      processImages: async (payload) => {
        calls.push(payload);
        return { outputDir: path.join(dir, "Opti") };
      },
    });
    await handlers.get("list-images")(null, [added]);

    const contents = createWebContents();
    await listeners.get("process-images")({ sender: contents }, { paths: ["/etc/passwd"], options: {} });
    await listeners.get("process-images")({ sender: contents }, { paths: [added], options: { outputBaseDir: "/tmp/elsewhere" } });
    await listeners.get("process-images")({ sender: contents }, { paths: [added], sourceRoots: ["/"], options: {} });
    await listeners.get("process-images")({ sender: contents }, { paths: [added], sourceRoots: [dir], options: {} });

    assert.deepEqual(contents.sent.map(({ data }) => data.ok), [false, false, false, true]);
    assert.match(contents.sent[0].data.error, /Only images added/);
    assert.match(contents.sent[1].data.error, /folder picker/);
    assert.equal(calls.length, 1);
  });
});

test("opens only output folders produced by a completed batch", async () => {
  await withTempDir(async (dir) => {
    const added = await writeImage(path.join(dir, "added.png"));
    const outputDir = path.join(dir, "Opti");
    const { handlers, listeners, opened } = createHarness({
      processImages: async () => ({ outputDir }),
    });

    await assert.rejects(handlers.get("open-output-folder")(null, outputDir), /Unknown output folder/);
    await handlers.get("list-images")(null, [added]);
    await listeners.get("process-images")({ sender: createWebContents() }, { paths: [added], options: {} });
    await handlers.get("open-output-folder")(null, outputDir);

    assert.deepEqual(opened, [outputDir]);
  });
});

test("accepts output folders returned by the folder picker", async () => {
  const { handlers, registry } = createHarness({
    showOpenDialog: async () => ({ canceled: false, filePaths: ["/chosen/output"] }),
  });

  assert.equal(await handlers.get("show-folder-dialog")(), "/chosen/output");
  assert.equal(registry.isApprovedOutputBase("/chosen/output"), true);
});

test("runs one batch at a time and does not send to a closed window", async () => {
  let release;
  const registry = { isApprovedFile: () => true, isApprovedRoot: () => true, isApprovedOutputBase: () => true, approveOutputDir: () => {} };
  const runner = createProcessRunner({
    registry,
    process: (_payload, onProgress) => new Promise((resolve) => {
      onProgress({ current: 1 });
      release = () => resolve({ outputDir: "/out" });
    }),
  });

  const first = createWebContents();
  const second = createWebContents();
  const running = runner.start({ sender: first }, { paths: ["/a.jpg"] });
  await runner.start({ sender: second }, { paths: ["/a.jpg"] });
  assert.match(second.sent[0].data.error, /already running/);
  assert.equal(runner.isRunning(), true);

  first.destroyed = true;
  release();
  await running;
  assert.deepEqual(first.sent.map(({ channel }) => channel), ["process-progress"]);
  assert.equal(runner.isRunning(), false);
});

test("cancels the running batch when its window is destroyed", async () => {
  const registry = { isApprovedFile: () => true, isApprovedRoot: () => true, isApprovedOutputBase: () => true, approveOutputDir: () => {} };
  let destroyListener;
  let shouldCancel;
  let release;
  const runner = createProcessRunner({
    registry,
    process: (_payload, _onProgress, controls) => new Promise((resolve) => {
      shouldCancel = controls.shouldCancel;
      release = () => resolve({ outputDir: "/out" });
    }),
  });
  const contents = createWebContents();
  contents.once = (event, listener) => { if (event === "destroyed") destroyListener = listener; };

  const running = runner.start({ sender: contents }, { paths: ["/a.jpg"] });
  assert.equal(shouldCancel(), false);
  destroyListener();
  assert.equal(shouldCancel(), true);
  release();
  await running;
});
