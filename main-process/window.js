const path = require("path");
const { BrowserWindow } = require("electron");
const { resolveLogoPath } = require("./logo-paths");

function createWindow() {
  const iconPath = resolveLogoPath();
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#333e46",
    title: "Photopti",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 12 },
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

module.exports = {
  createWindow,
};
