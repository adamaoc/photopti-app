const assert = require("assert");
const test = require("node:test");
const Utils = require("../renderer/renderer-utils");

test("builds encoded file URLs for POSIX and Windows paths", () => {
  assert.equal(Utils.toFileUrl("/photos/two.jpg"), "file:///photos/two.jpg");
  assert.equal(Utils.toFileUrl("/photos/#1 shoot/a?.jpg"), "file:///photos/%231%20shoot/a%3F.jpg");
  assert.equal(Utils.toFileUrl("/photos/100%/x.jpg"), "file:///photos/100%25/x.jpg");
  assert.equal(Utils.toFileUrl("C:\\Users\\Ana\\Pictures\\a b.jpg"), "file:///C:/Users/Ana/Pictures/a%20b.jpg");
  assert.equal(Utils.toFileUrl("\\\\server\\share\\a b.jpg"), "file://server/share/a%20b.jpg");
});

test("gets file names and parents on any platform", () => {
  assert.equal(Utils.getFileName("C:\\photos\\a.jpg"), "a.jpg");
  assert.equal(Utils.getFileName("/photos/a.jpg"), "a.jpg");
  assert.equal(Utils.getParentDir("/photos/a.jpg"), "/photos");
  assert.equal(Utils.getParentDir("C:\\photos\\a.jpg"), "C:\\photos");
});

test("escapes quotes and backslashes for attribute selectors", () => {
  assert.equal(Utils.cssEscape('/a "quoted" \\ path'), '/a \\"quoted\\" \\\\ path');
});

test("collapses and prunes source roots", () => {
  assert.deepEqual(Utils.collapseRoots(["/p/2024", "/p", "/p", "/q"]), ["/p", "/q"]);
  assert.deepEqual(Utils.collapseRoots(["C:\\p", "C:\\p\\sub"]), ["C:\\p"]);
  assert.deepEqual(Utils.collapseRoots(["/photos", "/photos-old"]), ["/photos", "/photos-old"]);
  assert.deepEqual(Utils.pruneRoots(["/p", "/q"], ["/p/a.jpg"]), ["/p"]);
});

test("formats savings", () => {
  assert.equal(Utils.formatSavings(4 * 1024 * 1024, 1024 * 1024), "Saved 75% (4.0 MB → 1.0 MB)");
  assert.equal(Utils.formatSavings(1000, 1500), "Output is 50% larger (1000 B → 1.5 KB)");
  assert.equal(Utils.formatSavings(0, 10), "");
});

test("validates resize settings before processing", () => {
  assert.equal(Utils.validateBatchSettings({ resizeMode: "width", width: "800" }), null);
  assert.match(Utils.validateBatchSettings({ resizeMode: "width", width: "" }), /width/);
  assert.match(Utils.validateBatchSettings({ resizeMode: "width", width: "12.5" }), /width/);
  assert.match(Utils.validateBatchSettings({ resizeMode: "percentage", percentage: "" }), /percentage/);
  assert.match(Utils.validateBatchSettings({ resizeMode: "percentage", percentage: "0" }), /percentage/);
  assert.equal(Utils.validateBatchSettings({ resizeMode: "percentage", percentage: "50" }), null);
});

test("persists sanitized settings and survives unavailable storage", () => {
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };

  assert.equal(Utils.saveSettings(storage, { quality: 65, format: "webp", width: 1200, keepMetadata: true, output: "../x" }), true);
  const loaded = Utils.loadSettings(storage);
  assert.equal(loaded.quality, 65);
  assert.equal(loaded.format, "webp");
  assert.equal(loaded.width, 1200);
  assert.equal(loaded.keepMetadata, true);

  store.set(Utils.SETTINGS_KEY, "{not json");
  assert.deepEqual(Utils.loadSettings(storage), Utils.DEFAULT_SETTINGS);
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.deepEqual(Utils.loadSettings(broken), Utils.DEFAULT_SETTINGS);
  assert.equal(Utils.saveSettings(broken, {}), false);
  assert.equal(Utils.sanitizeSettings({ format: "gif", quality: 500 }).format, "jpeg");
});
