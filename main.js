const { app, BrowserWindow, session } = require("electron");
const { registerIpcHandlers } = require("./main-process/ipc");
const { loadDockIcon } = require("./main-process/logo-paths");
const { createWindow } = require("./main-process/window");

app.whenReady().then(() => {
  try {
    if (process.platform === "darwin") {
      const dockIcon = loadDockIcon();
      if (dockIcon) {
        app.dock.setIcon(dockIcon);
      }
      try {
        app.setAboutPanelOptions({
          applicationName: "Photopti",
          applicationVersion: app.getVersion(),
          version: app.getVersion(),
          credits: "Open-source software licensed under the MIT License",
          copyright: "© 2025 ampnet media",
          icon: dockIcon || undefined,
        });
      } catch (error) {
        console.warn("[photopti] Failed to set About panel:", error.message);
      }
    }
  } catch (error) {
    console.warn("[photopti] Failed to configure macOS dock:", error.message);
  }

  // Photopti never needs camera, microphone, notifications, or similar access.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  registerIpcHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

try {
  app.setName("Photopti");
} catch (error) {
  console.warn("[photopti] Failed to set app name:", error.message);
}
