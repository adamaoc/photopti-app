const path = require("path");
const { pathToFileURL } = require("url");
const { resolveInputPaths } = require("./file-discovery");
const { getErrorMessage, processImages } = require("./image-processor");
const { resolveLogoPath } = require("./logo-paths");
const { getImageInfo } = require("./image-info");
const { getThumbnails } = require("./thumbnails");
const { SUPPORTED_FORMATS } = require("./constants");

/**
 * Tracks which paths the user actually chose (by dialog or drag and drop), so
 * file-reading and file-writing IPC calls cannot be pointed at arbitrary
 * locations by a misbehaving renderer.
 */
function createPathRegistry() {
  const files = new Set();
  const roots = new Set();
  const outputBases = new Set();
  const outputDirs = new Set();

  return {
    approveInputs({ files: newFiles = [], roots: newRoots = [] }) {
      newFiles.forEach((filePath) => files.add(filePath));
      newRoots.forEach((root) => roots.add(root));
    },
    isApprovedFile: (filePath) => files.has(filePath),
    isApprovedRoot: (root) => roots.has(root),
    approveOutputBase: (dir) => outputBases.add(dir),
    isApprovedOutputBase: (dir) => outputBases.has(dir),
    approveOutputDir: (dir) => outputDirs.add(dir),
    isApprovedOutputDir: (dir) => outputDirs.has(dir),
  };
}

function isAbsolutePathString(value) {
  return typeof value === "string" && value.length > 0 && path.isAbsolute(value);
}

function createInputDialogHandler(dialog) {
  let activeDialog = null;

  return async (_event, kind) => {
    if (activeDialog) return null;

    if (kind !== "images" && kind !== "folder") {
      throw new Error("Invalid input selection type");
    }

    const options = kind === "folder"
      ? {
          properties: ["openDirectory", "multiSelections"],
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

function createProcessRunner({ registry, process = processImages }) {
  let activeProcess = null;

  const safeSend = (webContents, channel, data) => {
    if (webContents && !webContents.isDestroyed?.()) webContents.send(channel, data);
  };

  const validatePayload = (payload) => {
    const { paths, sourceRoots, options = {} } = payload || {};
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new Error("No images to process.");
    }
    if (!paths.every((filePath) => registry.isApprovedFile(filePath))) {
      throw new Error("Only images added to Photopti can be processed.");
    }
    if (sourceRoots !== undefined) {
      if (!Array.isArray(sourceRoots) || !sourceRoots.every((root) => registry.isApprovedRoot(root))) {
        throw new Error("Unknown source folder.");
      }
    }
    if (options.outputBaseDir && !registry.isApprovedOutputBase(options.outputBaseDir)) {
      throw new Error("Choose the output folder with the folder picker.");
    }
    return { paths, sourceRoots, options };
  };

  const start = async (event, payload) => {
    const webContents = event.sender;
    if (activeProcess) {
      safeSend(webContents, "process-complete", {
        ok: false,
        error: "A batch is already running.",
      });
      return;
    }

    const processState = { canceled: false };
    activeProcess = processState;
    const cancelOnClose = () => {
      processState.canceled = true;
    };
    webContents.once?.("destroyed", cancelOnClose);

    try {
      const summary = await process(validatePayload(payload), (progress) => {
        safeSend(webContents, "process-progress", progress);
      }, {
        shouldCancel: () => processState.canceled,
      });
      registry.approveOutputDir(summary.outputDir);
      safeSend(webContents, "process-complete", { ok: true, summary });
    } catch (err) {
      safeSend(webContents, "process-complete", {
        ok: false,
        error: getErrorMessage(err),
      });
    } finally {
      webContents.removeListener?.("destroyed", cancelOnClose);
      if (activeProcess === processState) {
        activeProcess = null;
      }
    }
  };

  const cancel = () => {
    if (!activeProcess) return false;
    activeProcess.canceled = true;
    return true;
  };

  return { cancel, isRunning: () => Boolean(activeProcess), start };
}

function registerIpcHandlers(dependencies = {}) {
  const electron = dependencies.ipcMain && dependencies.dialog
    ? dependencies
    : require("electron");
  const { dialog, ipcMain } = electron;
  const shell = dependencies.shell || electron.shell;
  const registry = dependencies.registry || createPathRegistry();
  const runner = createProcessRunner({
    registry,
    process: dependencies.processImages || processImages,
  });

  ipcMain.handle("get-logo-url", () => {
    const logoPath = resolveLogoPath();
    return logoPath ? pathToFileURL(logoPath).href : null;
  });

  ipcMain.handle("list-images", async (_event, paths, options = {}) => {
    if (!Array.isArray(paths)) throw new Error("Paths must be a list");
    const inputPaths = paths.filter(isAbsolutePathString);
    const excludeDirNames = typeof options?.outputFolderName === "string"
      ? [options.outputFolderName]
      : [];
    const result = await resolveInputPaths(inputPaths, { excludeDirNames });
    registry.approveInputs(result);
    return result;
  });

  ipcMain.handle("show-input-dialog", createInputDialogHandler(dialog));

  ipcMain.handle("get-thumbnails", async (_event, paths, options) => {
    if (!Array.isArray(paths)) return {};
    return await getThumbnails(paths.filter((filePath) => registry.isApprovedFile(filePath)), options);
  });

  ipcMain.handle("get-image-info", async (_event, filePath) => {
    if (typeof filePath !== "string" || !filePath) {
      throw new Error("Image path is required");
    }
    if (!registry.isApprovedFile(filePath)) {
      throw new Error("Unknown image");
    }
    return await getImageInfo(filePath);
  });

  ipcMain.handle("show-folder-dialog", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "Select output folder",
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    registry.approveOutputBase(result.filePaths[0]);
    return result.filePaths[0];
  });

  ipcMain.handle("open-output-folder", async (_event, dir) => {
    if (!registry.isApprovedOutputDir(dir)) {
      throw new Error("Unknown output folder");
    }
    const error = await shell.openPath(dir);
    if (error) throw new Error(error);
    return true;
  });

  ipcMain.on("process-images", runner.start);
  ipcMain.handle("cancel-processing", runner.cancel);

  return { registry, runner };
}

module.exports = {
  createInputDialogHandler,
  createPathRegistry,
  createProcessRunner,
  registerIpcHandlers,
};
