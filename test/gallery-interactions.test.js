const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const renderer = fs.readFileSync(
  path.resolve(__dirname, '..', 'renderer', 'renderer.js'),
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

function createSandbox({ stubThumbnailSelectionUI = false } = {}) {
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
    Map,
    Set
  };
  vm.createContext(sandbox);
  vm.runInContext(renderer, sandbox);
  const run = (source) => vm.runInContext(source, sandbox);
  run('updateCoverCropUI = () => {}; updateFolderSelectionUI = () => {}; updateFooterStats = () => {}');
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
  run("droppedPaths = ['/photos/one.jpg', '/photos/two.jpg']; imagePaths = [...droppedPaths]; renderThumbs(imagePaths)");
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
  run("droppedPaths = ['/photos/one.jpg', '/photos/two.jpg']; imagePaths = [...droppedPaths]; selectedImagePath = '/photos/two.jpg'; coverImagePath = '/photos/two.jpg'; renderThumbs(imagePaths)");

  const combined = findThumb(thumbs, '/photos/two.jpg');
  assert.equal(combined.classList.contains('thumb-selected'), true);
  assert.equal(combined.classList.contains('thumb-cover'), true);
  findByClass(combined, 'thumb-remove').dispatch('click');

  assert.equal(run('selectedImagePath'), null);
  assert.equal(run('coverImagePath'), null);
  assert.equal(run('JSON.stringify(imagePaths)'), '["/photos/one.jpg"]');
});

test('cover action enters crop workspace and returning preserves all gallery and crop state', () => {
  const { thumbs, batchSettings, process, body, run } = createSandbox({ stubThumbnailSelectionUI: true });
  run("droppedPaths = ['/photos/one.jpg', '/photos/two.jpg']; imagePaths = [...droppedPaths]; selectedImagePath = '/photos/one.jpg'; renderThumbs(imagePaths)");

  const second = findThumb(thumbs, '/photos/two.jpg');
  findByClass(second, 'thumb-cover-action').dispatch('click');

  assert.equal(run('workspaceMode'), 'crop');
  assert.equal(run('selectedImagePath'), '/photos/one.jpg');
  assert.equal(run('coverImagePath'), '/photos/two.jpg');
  assert.equal(thumbs.classList.contains('hidden'), true);
  assert.equal(batchSettings.classList.contains('hidden'), true);
  assert.equal(process.classList.contains('hidden'), true);
  assert.equal(body.classList.contains('crop-mode'), true);

  run("coverCrop.aspectRatio = '4:3'; coverCrop.orientation = 'portrait'; coverCrop.width = 900; coverCrop.height = 1200; coverCrop.box = { x: 12, y: 8, width: 70, height: 52.5 }; returnToGallery()");

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

test('ordinary thumbnail selection never enters crop workspace', () => {
  const { thumbs, run } = createSandbox();
  run("imagePaths = ['/photos/one.jpg']; renderThumbs(imagePaths)");

  findThumb(thumbs, '/photos/one.jpg').dispatch('click');

  assert.equal(run('workspaceMode'), 'gallery');
  assert.equal(run('selectedImagePath'), '/photos/one.jpg');
  assert.equal(run('coverImagePath'), null);
});
