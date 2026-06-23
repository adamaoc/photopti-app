const assert = require("assert");
const test = require("node:test");
const { SUPPORTED_FORMATS } = require("../main-process/constants");
const {
  createInputDialogHandler,
  registerIpcHandlers,
} = require("../main-process/ipc");

test("registers the native input dialog IPC handler", () => {
  const handlers = new Map();
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    on: () => {},
  };

  registerIpcHandlers({
    ipcMain,
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  });

  assert.equal(typeof handlers.get("show-input-dialog"), "function");
});

test("opens a multi-image dialog restricted to supported formats", async () => {
  let receivedOptions;
  const handler = createInputDialogHandler({
    showOpenDialog: async (options) => {
      receivedOptions = options;
      return { canceled: false, filePaths: ["/photos/a.jpg", "/photos/b.png"] };
    },
  });

  const paths = await handler(null, "images");

  assert.deepEqual(paths, ["/photos/a.jpg", "/photos/b.png"]);
  assert.deepEqual(receivedOptions.properties, ["openFile", "multiSelections"]);
  assert.deepEqual(
    receivedOptions.filters[0].extensions,
    SUPPORTED_FORMATS.map((extension) => extension.slice(1))
  );
});

test("opens a folder dialog and treats cancellation as no selection", async () => {
  let receivedOptions;
  const handler = createInputDialogHandler({
    showOpenDialog: async (options) => {
      receivedOptions = options;
      return { canceled: true, filePaths: [] };
    },
  });

  const paths = await handler(null, "folder");

  assert.equal(paths, null);
  assert.deepEqual(receivedOptions.properties, ["openDirectory"]);
});

test("prevents overlapping native input dialogs", async () => {
  let resolveDialog;
  let openCount = 0;
  const handler = createInputDialogHandler({
    showOpenDialog: () => {
      openCount++;
      return new Promise((resolve) => {
        resolveDialog = resolve;
      });
    },
  });

  const first = handler(null, "images");
  const overlapping = await handler(null, "folder");

  assert.equal(overlapping, null);
  assert.equal(openCount, 1);

  resolveDialog({ canceled: false, filePaths: ["/photos"] });
  assert.deepEqual(await first, ["/photos"]);
});

test("rejects unknown input dialog types", async () => {
  const handler = createInputDialogHandler({ showOpenDialog: async () => ({}) });
  await assert.rejects(() => handler(null, "everything"), /Invalid input selection type/);
});
