const assert = require("assert");
const test = require("node:test");
const { getWindowOptions, hardenWebContents, isSafeExternalUrl } = require("../main-process/window");

test("uses the inset title bar only on macOS", () => {
  const mac = getWindowOptions({ platform: "darwin" });
  const windows = getWindowOptions({ platform: "win32" });
  const linux = getWindowOptions({ platform: "linux" });

  assert.equal(mac.titleBarStyle, "hiddenInset");
  assert.equal(windows.titleBarStyle, undefined);
  assert.equal(linux.titleBarStyle, undefined);
  assert.equal(linux.trafficLightPosition, undefined);
});

test("runs the renderer sandboxed and isolated", () => {
  const { webPreferences } = getWindowOptions({ platform: "linux" });
  assert.equal(webPreferences.sandbox, true);
  assert.equal(webPreferences.contextIsolation, true);
  assert.equal(webPreferences.nodeIntegration, false);
});

test("only hands web and mail links to the system", () => {
  assert.equal(isSafeExternalUrl("https://ampnet.media"), true);
  assert.equal(isSafeExternalUrl("mailto:hello@example.com"), true);
  assert.equal(isSafeExternalUrl("file:///etc/passwd"), false);
  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
  assert.equal(isSafeExternalUrl("not a url"), false);
});

test("opens new-window links externally and blocks in-app navigation", () => {
  const opened = [];
  const listeners = new Map();
  let openHandler;
  const webContents = {
    setWindowOpenHandler: (handler) => { openHandler = handler; },
    on: (event, listener) => listeners.set(event, listener),
  };
  hardenWebContents(webContents, { openExternal: (url) => opened.push(url) });

  assert.deepEqual(openHandler({ url: "https://ampnet.media" }), { action: "deny" });
  assert.deepEqual(openHandler({ url: "file:///tmp/x.html" }), { action: "deny" });

  const fileDrop = { prevented: false, preventDefault() { this.prevented = true; } };
  listeners.get("will-navigate")(fileDrop, "file:///Users/me/photo.jpg");
  const link = { prevented: false, preventDefault() { this.prevented = true; } };
  listeners.get("will-navigate")(link, "https://example.com");

  assert.equal(fileDrop.prevented, true);
  assert.equal(link.prevented, true);
  assert.deepEqual(opened, ["https://ampnet.media", "https://example.com"]);
});
