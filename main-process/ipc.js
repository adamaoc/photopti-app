const { resolveDroppedToImages } = require("./file-discovery");
const { processImages } = require("./image-processor");
const { resolveLogoPath } = require("./logo-paths");
const { getImageInfo } = require("./image-info");
const { getThumbnails } = require("./thumbnails");
const { SUPPORTED_FORMATS } = require("./constants");

let activeProcess = null;

function createInputDialogHandler(dialog) {
  let activeDialog = null;

  return async (_event, kind) => {
    if (activeDialog) return null;

    if (kind !== "images" && kind !== "folder") {
      throw new Error("Invalid input selection type");
    }

    const options = kind === "folder"
      ? {
          properties: ["openDirectory"],
          title: "Select image folder",
        }
      : {
          properties: ["openFile", "multiSelections"],
          title: "Select images",
          filters: [
            {
              name: "Images",
              extensions: SUPPORTED_FORMATS.map((extension) => extension.slice(1)),
            },
          ],
        };

    activeDialog = dialog.showOpenDialog(options);
    try {
      const result = await activeDialog;
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths;
    } finally {
      activeDialog = null;
    }
  };
}

function registerIpcHandlers(dependencies = {}) {
  const electron = dependencies.ipcMain && dependencies.dialog
    ? dependencies
    : require("electron");
  const { dialog, ipcMain } = electron;

  ipcMain.handle("get-logo-path", () => {
    return resolveLogoPath();
  });

  ipcMain.handle("list-images", async (_event, paths) => {
    return await resolveDroppedToImages(paths);
  });

  ipcMain.handle("show-input-dialog", createInputDialogHandler(dialog));

  ipcMain.handle("get-thumbnails", async (_event, paths, options) => {
    return await getThumbnails(paths, options);
  });

  ipcMain.handle("get-image-info", async (_event, filePath) => {
    if (typeof filePath !== "string" || !filePath) {
      throw new Error("Image path is required");
    }
    return await getImageInfo(filePath);
  });

  ipcMain.handle("show-folder-dialog", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Select output folder",
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.on("process-images", async (event, payload) => {
    const webContents = event.sender;
    const processState = { canceled: false };
    activeProcess = processState;
    try {
      const summary = await processImages(payload, (progress) => {
        webContents.send("process-progress", progress);
      }, {
        shouldCancel: () => processState.canceled,
      });
      webContents.send("process-complete", { ok: true, summary });
    } catch (err) {
      webContents.send("process-complete", {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (activeProcess === processState) {
        activeProcess = null;
      }
    }
  });

  ipcMain.handle("cancel-processing", () => {
    if (!activeProcess) return false;
    activeProcess.canceled = true;
    return true;
  });
}

module.exports = {
  createInputDialogHandler,
  registerIpcHandlers,
};
