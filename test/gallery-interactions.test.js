const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const renderer = fs.readFileSync(
  path.resolve(__dirname, '..', 'renderer', 'renderer.js'),
  'utf8'
);
const cropGeometry = fs.readFileSync(
  path.resolve(__dirname, '..', 'renderer', 'crop-geometry.js'),
  'utf8'
);
const rendererUtils = fs.readFileSync(
  path.resolve(__dirname, '..', 'renderer', 'renderer-utils.js'),
  'utf8'
);

class TestElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      contains: (name) => this.classes.has(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classes.has(name) : force;
        if (enabled) this.classes.add(name);
        else this.classes.delete(name);
        return enabled;
      }
    };
  }

  set className(value) {
    this.classes = new Set(value.split(/\s+/).filter(Boolean));
  }

  get className() {
    return Array.from(this.classes).join(' ');
  }

  set innerHTML(value) {
    this._innerHTML = value;
    if (value === '') this.children = [];
  }

  get innerHTML() {
    return this._innerHTML || '';
  }

  appendChild(child) {
    if (child.isFragment) {
      child.children.slice().forEach((item) => this.appendChild(item));
      return child;
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, properties = {}) {
    const event = {
      type,
      target: this,
      key: properties.key,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; }
    };
    let current = this;
    while (current && !event.propagationStopped) {
      event.currentTarget = current;
      (current.listeners.get(type) || []).forEach((listener) => listener(event));
      current = current.parentNode;
    }
    return event;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }
}

function descendants(element) {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

function bindImageSrc(element) {
  Object.defineProperty(element, 'src', {
    get() {
      return element.getAttribute('src') || '';
    },
    set(value) {
      if (value) element.setAttribute('src', value);
      else element.removeAttribute('src');
    }
  });
}

function createSandbox({ stubThumbnailSelectionUI = false, withCoverCrop = false } = {}) {
  const thumbs = new TestElement();
  const dropzone = new TestElement();
  const batchSettings = new TestElement();
  const process = new TestElement('button');
  const body = new TestElement('body');
  const elements = new Map([
    ['#thumbs', thumbs],
    ['#dropzone', dropzone],
    ['#batchSettings', batchSettings],
    ['#process', process]
  ]);
  if (withCoverCrop) {
    const coverEditor = new TestElement();
    const coverControls = new TestElement();
    const coverCropImage = new TestElement('img');
    bindImageSrc(coverCropImage);
    elements.set('#coverEditor', coverEditor);
    elements.set('#coverControls', coverControls);
    elements.set('#coverCropImage', coverCropImage);
    elements.set('#coverCropBox', new TestElement());
  }
  const document = {
    body,
    querySelector: (selector) => elements.get(selector) || null,
    querySelectorAll: (selector) => selector === '.thumb'
      ? descendants(thumbs).filter((element) => element.classList.contains('thumb'))
      : [],
    createElement: (tagName) => new TestElement(tagName),
    createDocumentFragment: () => Object.assign(new TestElement(), { isFragment: true })
  };
  const sandbox = {
    document,
    window: { addEventListener: () => {} },
    setTimeout: () => 0,
    Map,
    Set
  };
  vm.createContext(sandbox);
  vm.runInContext(cropGeometry, sandbox);
  vm.runInContext(rendererUtils, sandbox);
  vm.runInContext(renderer, sandbox);
  const run = (source) => vm.runInContext(source, sandbox);
  if (!withCoverCrop) {
    run('updateCoverCropUI = () => {}; updateFolderSelectionUI = () => {}; updateFooterStats = () => {}');
  } else {
    run('updateFolderSelectionUI = () => {}; updateFooterStats = () => {}');
  }
  if (stubThumbnailSelectionUI) run('updateThumbnailSelectionUI = () => {}');
  return { thumbs, batchSettings, process, body, run };
}

function findByClass(root, className) {
  return descendants(root).find((element) => element.classList.contains(className));
}

function findThumb(root, pathName) {
  return descendants(root).find(
    (element) => element.classList.contains('thumb') && element.dataset.path === pathName
  );
}

test('thumbnail click and keyboard activation select without promoting', () => {
  const { thumbs, run } = createSandbox();
  run("imagePaths = ['/photos/one.jpg', '/photos/two.jpg']; renderThumbs(imagePaths)");

  const first = findThumb(thumbs, '/photos/one.jpg');
  first.children[0].dispatch('click');
  assert.equal(run('selectedImagePath'), '/photos/one.jpg');
  assert.equal(run('coverImagePath'), null);
  assert.equal(first.classList.contains('thumb-selected'), true);
  assert.equal(first.getAttribute('aria-pressed'), 'true');

  const second = findThumb(thumbs, '/photos/two.jpg');
  const event = second.dispatch('keydown', { key: 'Enter' });
  assert.equal(event.defaultPrevented, true);
  assert.equal(run('selectedImagePath'), '/photos/two.jpg');
  assert.equal(run('coverImagePath'), null);
});

test('promote and remove controls do not trigger thumbnail selection', () => {
  const { thumbs, run } = createSandbox();
  run("sourceRoots = ['/photos']; imagePaths = ['/photos/one.jpg', '/photos/two.jpg']; renderThumbs(imagePaths)");
  findThumb(thumbs, '/photos/one.jpg').dispatch('click');

  const second = findThumb(thumbs, '/photos/two.jpg');
  const promote = findByClass(second, 'thumb-cover-action');
  promote.dispatch('keydown', { key: 'Enter' });
  assert.equal(run('coverImagePath'), null);
  promote.dispatch('click');
  assert.equal(run('coverImagePath'), '/photos/two.jpg');
  assert.equal(run('selectedImagePath'), '/photos/one.jpg');

  const selected = findThumb(thumbs, '/photos/one.jpg');
  findByClass(selected, 'thumb-remove').dispatch('click');
  assert.equal(run('JSON.stringify(imagePaths)'), '["/photos/two.jpg"]');
  assert.equal(run('selectedImagePath'), null);
  assert.equal(run('coverImagePath'), '/photos/two.jpg');
});

test('removing a selected cover clears both states and closes crop mode', () => {
  const { thumbs, run } = createSandbox();
  run("sourceRoots = ['/photos']; imagePaths = ['/photos/one.jpg', '/photos/two.jpg']; selectedImagePath = '/photos/two.jpg'; coverImagePath = '/photos/two.jpg'; renderThumbs(imagePaths)");

  const combined = findThumb(thumbs, '/photos/two.jpg');
  assert.equal(combined.classList.contains('thumb-selected'), true);
  assert.equal(combined.classList.contains('thumb-cover'), true);
  findByClass(combined, 'thumb-remove').dispatch('click');

  assert.equal(run('selectedImagePath'), null);
  assert.equal(run('coverImagePath'), null);
  assert.equal(run('JSON.stringify(imagePaths)'), '["/photos/one.jpg"]');
});

test('cover action enters crop workspace and saving preserves all gallery and crop state', () => {
  const { thumbs, batchSettings, process, body, run } = createSandbox({ stubThumbnailSelectionUI: true });
  run("sourceRoots = ['/photos']; imagePaths = ['/photos/one.jpg', '/photos/two.jpg']; selectedImagePath = '/photos/one.jpg'; renderThumbs(imagePaths)");

  const second = findThumb(thumbs, '/photos/two.jpg');
  findByClass(second, 'thumb-cover-action').dispatch('click');

  assert.equal(run('workspaceMode'), 'crop');
  assert.equal(run('selectedImagePath'), '/photos/one.jpg');
  assert.equal(run('coverImagePath'), '/photos/two.jpg');
  assert.equal(thumbs.classList.contains('hidden'), true);
  assert.equal(batchSettings.classList.contains('hidden'), true);
  assert.equal(process.classList.contains('hidden'), true);
  assert.equal(body.classList.contains('crop-mode'), true);

  run("coverCrop.aspectRatio = '4:3'; coverCrop.orientation = 'portrait'; coverCrop.width = 900; coverCrop.height = 1200; coverCrop.box = { x: 12, y: 8, width: 70, height: 52.5 }; saveCoverCrop()");

  assert.equal(run('workspaceMode'), 'gallery');
  assert.equal(run('selectedImagePath'), '/photos/one.jpg');
  assert.equal(run('coverImagePath'), '/photos/two.jpg');
  assert.equal(
    run('JSON.stringify(coverCrop)'),
    '{"aspectRatio":"4:3","orientation":"portrait","width":900,"height":1200,"box":{"x":12,"y":8,"width":70,"height":52.5}}'
  );
  assert.equal(thumbs.classList.contains('hidden'), false);
  assert.equal(batchSettings.classList.contains('hidden'), false);
  assert.equal(process.classList.contains('hidden'), false);
  assert.equal(body.classList.contains('crop-mode'), false);
});

test('re-entering cover crop restores image src after saving', () => {
  const { thumbs, run } = createSandbox({ withCoverCrop: true, stubThumbnailSelectionUI: true });
  run("sourceRoots = ['/photos']; imagePaths = ['/photos/one.jpg', '/photos/two.jpg']; renderThumbs(imagePaths)");

  const second = findThumb(thumbs, '/photos/two.jpg');
  findByClass(second, 'thumb-cover-action').dispatch('click');
  assert.equal(run("document.querySelector('#coverCropImage').src"), 'file:///photos/two.jpg');

  run('saveCoverCrop()');
  assert.equal(run("document.querySelector('#coverCropImage').src"), '');

  findByClass(second, 'thumb-cover-action').dispatch('click');
  assert.equal(run('workspaceMode'), 'crop');
  assert.equal(run("document.querySelector('#coverCropImage').src"), 'file:///photos/two.jpg');
});

test('ordinary thumbnail selection never enters crop workspace', () => {
  const { thumbs, run } = createSandbox();
  run("imagePaths = ['/photos/one.jpg']; renderThumbs(imagePaths)");

  findThumb(thumbs, '/photos/one.jpg').dispatch('click');

  assert.equal(run('workspaceMode'), 'gallery');
  assert.equal(run('selectedImagePath'), '/photos/one.jpg');
  assert.equal(run('coverImagePath'), null);
});

test('renders large galleries in pages so every image stays reachable', () => {
  const { thumbs, run } = createSandbox();
  run("imagePaths = Array.from({ length: 450 }, (_, i) => `/photos/${i}.jpg`); renderThumbs(imagePaths)");

  const countThumbs = () => descendants(thumbs).filter((el) => el.classList.contains('thumb')).length;
  assert.equal(countThumbs(), 200);
  const showMore = findByClass(thumbs, 'thumb-show-more');
  assert.equal(showMore.textContent, 'Show 200 more');

  showMore.dispatch('click');
  assert.equal(countThumbs(), 400);
  findByClass(thumbs, 'thumb-show-more').dispatch('click');
  assert.equal(countThumbs(), 450);
  assert.equal(findByClass(thumbs, 'thumb-show-more'), undefined);

  const last = findThumb(thumbs, '/photos/449.jpg');
  findByClass(last, 'thumb-cover-action').dispatch('click');
  assert.equal(run('coverImagePath'), '/photos/449.jpg');
});

test('does not remove images while a batch is running', () => {
  const { thumbs, run } = createSandbox();
  run("imagePaths = ['/photos/one.jpg', '/photos/two.jpg']; renderThumbs(imagePaths); isProcessing = true");

  findByClass(findThumb(thumbs, '/photos/one.jpg'), 'thumb-remove').dispatch('click');

  assert.equal(run('imagePaths.length'), 2);
});

test('removing images drops source folders that no longer contribute', () => {
  const { thumbs, run } = createSandbox();
  run("sourceRoots = ['/photos', '/exports']; imagePaths = ['/photos/one.jpg', '/exports/two.jpg']; renderThumbs(imagePaths)");

  findByClass(findThumb(thumbs, '/exports/two.jpg'), 'thumb-remove').dispatch('click');

  assert.equal(run('JSON.stringify(sourceRoots)'), '["/photos"]');
  assert.equal(run('hasMultipleFolders()'), false);
});

test('arrow and resize keys move and scale the crop box inside the image', () => {
  const { run } = createSandbox();
  run("coverImagePath = '/photos/one.jpg'; workspaceMode = 'crop'; coverImageAspectRatio = 1.5; coverCrop.box = { x: 10, y: 10, width: 50, height: 50 * 1.5 / (16 / 9) }");

  assert.equal(run("handleCropKey({ key: 'ArrowRight', shiftKey: false })"), true);
  assert.equal(run('coverCrop.box.x'), 11);
  run("handleCropKey({ key: 'ArrowLeft', shiftKey: true }); handleCropKey({ key: 'ArrowLeft', shiftKey: true }); handleCropKey({ key: 'ArrowLeft', shiftKey: true })");
  assert.equal(run('coverCrop.box.x'), 0);

  run("handleCropKey({ key: '+', shiftKey: false })");
  assert.equal(Math.round(run('coverCrop.box.width')), 52);
  const ratio = run('(coverCrop.box.width / coverCrop.box.height) * coverImageAspectRatio');
  assert.ok(Math.abs(ratio - 16 / 9) < 1e-9);

  assert.equal(run("handleCropKey({ key: 'a', shiftKey: false })"), false);
  run("workspaceMode = 'gallery'");
  assert.equal(run("handleCropKey({ key: 'ArrowRight', shiftKey: false })"), false);
});

test('new covers default to 16:9 at 1600 x 900', () => {
  const { thumbs, run } = createSandbox({ stubThumbnailSelectionUI: true });
  run("imagePaths = ['/photos/one.jpg']; renderThumbs(imagePaths)");
  findByClass(findThumb(thumbs, '/photos/one.jpg'), 'thumb-cover-action').dispatch('click');

  assert.equal(run('coverCrop.aspectRatio'), '16:9');
  assert.equal(run('coverCrop.width'), 1600);
  assert.equal(run('coverCrop.height'), 900);
});

test('cancel restores the previous cover and crop, save keeps the new one', () => {
  const { thumbs, run } = createSandbox({ stubThumbnailSelectionUI: true });
  run("imagePaths = ['/photos/one.jpg', '/photos/two.jpg']; renderThumbs(imagePaths)");

  // Choose and save a cover with a custom crop.
  findByClass(findThumb(thumbs, '/photos/one.jpg'), 'thumb-cover-action').dispatch('click');
  run("coverCrop.box = { x: 10, y: 10, width: 60, height: 40 }; markCoverDirty(); saveCoverCrop()");
  assert.equal(run('workspaceMode'), 'gallery');
  assert.equal(run('coverImagePath'), '/photos/one.jpg');

  // Re-open, change the crop, then cancel: the saved crop comes back.
  findByClass(findThumb(thumbs, '/photos/one.jpg'), 'thumb-cover-action').dispatch('click');
  run("coverCrop.box = { x: 0, y: 0, width: 30, height: 20 }; markCoverDirty(); cancelCoverCrop()");
  assert.equal(run('workspaceMode'), 'gallery');
  assert.equal(run('JSON.stringify(coverCrop.box)'), '{"x":10,"y":10,"width":60,"height":40}');

  // Promote a different image, then cancel: the first image stays the cover.
  findByClass(findThumb(thumbs, '/photos/two.jpg'), 'thumb-cover-action').dispatch('click');
  assert.equal(run('coverImagePath'), '/photos/two.jpg');
  run('cancelCoverCrop()');
  assert.equal(run('coverImagePath'), '/photos/one.jpg');
  assert.equal(run('JSON.stringify(coverCrop.box)'), '{"x":10,"y":10,"width":60,"height":40}');

  // Promote it again and save: now it is the cover.
  findByClass(findThumb(thumbs, '/photos/two.jpg'), 'thumb-cover-action').dispatch('click');
  run('saveCoverCrop()');
  assert.equal(run('coverImagePath'), '/photos/two.jpg');
});

test('cancelling a first-time cover leaves no cover', () => {
  const { thumbs, run } = createSandbox({ stubThumbnailSelectionUI: true });
  run("imagePaths = ['/photos/one.jpg']; renderThumbs(imagePaths)");
  findByClass(findThumb(thumbs, '/photos/one.jpg'), 'thumb-cover-action').dispatch('click');

  run('cancelCoverCrop()');

  assert.equal(run('coverImagePath'), null);
  assert.equal(findThumb(thumbs, '/photos/one.jpg').classList.contains('thumb-cover'), false);
});

test('Esc discards unsaved crop edits only when pressed twice', () => {
  const { thumbs, run } = createSandbox({ stubThumbnailSelectionUI: true });
  run("imagePaths = ['/photos/one.jpg']; renderThumbs(imagePaths)");
  findByClass(findThumb(thumbs, '/photos/one.jpg'), 'thumb-cover-action').dispatch('click');
  run('saveCoverCrop()');

  // Nothing changed yet: Esc closes the editor at once.
  findByClass(findThumb(thumbs, '/photos/one.jpg'), 'thumb-cover-action').dispatch('click');
  assert.equal(run('requestCancelCoverCrop()'), true);
  assert.equal(run('workspaceMode'), 'gallery');

  // After an edit, the first Esc only warns.
  findByClass(findThumb(thumbs, '/photos/one.jpg'), 'thumb-cover-action').dispatch('click');
  run("coverCrop.box.x = 0; markCoverDirty()");
  assert.equal(run('requestCancelCoverCrop()'), false);
  assert.equal(run('workspaceMode'), 'crop');
  assert.equal(run('requestCancelCoverCrop()'), true);
  assert.equal(run('workspaceMode'), 'gallery');
  assert.equal(run('coverCrop.box.x'), 5);
});

test('removing the cover clears it without touching the gallery', () => {
  const { thumbs, run } = createSandbox({ stubThumbnailSelectionUI: true });
  run("imagePaths = ['/photos/one.jpg', '/photos/two.jpg']; renderThumbs(imagePaths)");
  findByClass(findThumb(thumbs, '/photos/two.jpg'), 'thumb-cover-action').dispatch('click');
  run('saveCoverCrop(); removeCover()');

  assert.equal(run('coverImagePath'), null);
  assert.equal(run('imagePaths.length'), 2);
});
