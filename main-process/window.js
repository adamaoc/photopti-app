const path = require("path");
const { app, BrowserWindow, shell } = require("electron");
const { resolveLogoPath } = require("./logo-paths");

function isSafeExternalUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" || protocol === "mailto:";
  } catch (error) {
    return false;
  }
}

function getWindowOptions({ platform = process.platform, iconPath = null } = {}) {
  return {
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#333e46",
    title: "Photopti",
    // The inset title bar is macOS-only. Other platforms keep their native
    // frame so window controls remain available.
    ...(platform === "darwin"
      ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 12, y: 12 } }
      : {}),
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  };
}

function hardenWebContents(webContents, { openExternal = (url) => shell.openExternal(url) } = {}) {
  webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) openExternal(url);
    return { action: "deny" };
  });

  // The app is a single page. Never let a stray drop or link replace it.
  webContents.on("will-navigate", (event, url) => {
    event.preventDefault();
    if (isSafeExternalUrl(url)) openExternal(url);
  });
}

function createWindow() {
  const win = new BrowserWindow(getWindowOptions({ iconPath: resolveLogoPath() }));
  hardenWebContents(win.webContents);

  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  if (!app.isPackaged && process.env.PHOTOPTI_DEVTOOLS === "1") {
    win.webContents.openDevTools();
  }
  return win;
}

module.exports = {
  createWindow,
  getWindowOptions,
  hardenWebContents,
  isSafeExternalUrl,
};
