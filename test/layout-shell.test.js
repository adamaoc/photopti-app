const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer', 'styles.css'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'renderer', 'renderer.js'), 'utf8');

function createElement() {
  const attributes = new Map();
  const classes = new Set();
  return {
    textContent: '',
    title: '',
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !classes.has(name) : force;
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      }
    },
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: (name) => attributes.get(name) ?? null,
    removeAttribute: (name) => attributes.delete(name)
  };
}

function createRendererSandbox() {
  const elements = new Map([
    ['#footerSource', createElement()],
    ['#footerImageCount', createElement()],
    ['#footerCoverStat', createElement()],
    ['#footerCover', createElement()],
    ['#thumbs', createElement()],
    ['#dropzone', createElement()],
    ['#folderSelection', createElement()]
  ]);
  elements.get('#footerCoverStat').classList.add('hidden');
  elements.get('#folderSelection').classList.add('hidden');

  const sandbox = {
    document: { querySelector: (selector) => elements.get(selector) || null },
    window: { addEventListener: () => {} },
    Map,
    Set
  };
  vm.createContext(sandbox);
  vm.runInContext(renderer, sandbox);
  return {
    elements,
    run: (source) => vm.runInContext(source, sandbox)
  };
}

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]+)\\}`));
  assert.ok(match, `Expected a CSS rule for ${selector}`);
  return match[1];
}

test('uses a bounded three-region app shell with workspace scrolling', () => {
  assert.match(html, /class="app-shell"/);
  assert.match(html, /<header class="header">[\s\S]*class="workspace"[\s\S]*<footer class="footer">/);
  assert.match(rule('.app-shell'), /grid-template-rows:\s*var\(--header-height\) minmax\(0, 1fr\) var\(--footer-height\)/);
  assert.match(rule('html,\nbody'), /height:\s*100%/);
  assert.match(rule('body'), /overflow:\s*hidden/);
  assert.match(rule('.workspace'), /min-height:\s*0/);
  assert.match(rule('.workspace'), /overflow-y:\s*auto/);
  assert.doesNotMatch(rule('.footer'), /position:\s*fixed/);
});

test('renders selection stats in the footer and removes the old top panel', () => {
  const main = html.match(/<main class="container">([\s\S]*?)<\/main>/)?.[1] || '';
  const footer = html.match(/<footer class="footer">([\s\S]*?)<\/footer>/)?.[1] || '';

  assert.doesNotMatch(main, /id="selection"/);
  assert.match(footer, /id="footerSource"/);
  assert.match(footer, /id="footerImageCount"/);
  assert.match(footer, /id="footerCover"/);
  assert.match(rule('.footer-stat-value'), /text-overflow:\s*ellipsis/);
  assert.match(rule('.footer-stat-value'), /white-space:\s*nowrap/);
});

test('summarizes empty, single, shared-folder, and multi-folder sources', () => {
  const { run } = createRendererSandbox();

  assert.equal(run('getSourceSummary([])'), 'No source selected');
  assert.equal(run("getSourceSummary(['/photos/one.jpg'])"), '/photos/one.jpg');
  assert.equal(
    run("getSourceSummary(['/photos/one.jpg', '/photos/two.jpg'])"),
    '/photos'
  );
  assert.equal(
    run("getSourceSummary(['/photos/one.jpg', '/exports/two.jpg'])"),
    'Multiple folders (2)'
  );
});

test('updates accessible footer stats without replacing full paths with ellipses', () => {
  const { elements, run } = createRendererSandbox();
  const longSource = `/photos/${'nested/'.repeat(12)}one.jpg`;
  const coverPath = '/photos/covers/hero-image.jpg';

  run(`droppedPaths = [${JSON.stringify(longSource)}]; imagePaths = ['/photos/one.jpg', '/photos/two.jpg']; coverImagePath = ${JSON.stringify(coverPath)}; updateFooterStats()`);

  const source = elements.get('#footerSource');
  const count = elements.get('#footerImageCount');
  const coverStat = elements.get('#footerCoverStat');
  const cover = elements.get('#footerCover');
  assert.equal(source.textContent, longSource);
  assert.equal(source.title, longSource);
  assert.equal(source.getAttribute('aria-label'), `Source: ${longSource}`);
  assert.equal(count.textContent, '2');
  assert.equal(count.getAttribute('aria-label'), 'Images: 2');
  assert.equal(coverStat.classList.contains('hidden'), false);
  assert.equal(cover.textContent, 'hero-image.jpg');
  assert.equal(cover.title, coverPath);
  assert.equal(cover.getAttribute('aria-label'), `Cover: ${coverPath}`);

  run('droppedPaths = []; imagePaths = []; coverImagePath = null; updateFooterStats()');
  assert.equal(source.textContent, 'No source selected');
  assert.equal(count.textContent, '0');
  assert.equal(coverStat.classList.contains('hidden'), true);
  assert.equal(cover.textContent, '');
  assert.equal(cover.getAttribute('title'), null);
  assert.equal(cover.getAttribute('aria-label'), null);
});

test('removing the last photo clears stale multi-folder controls and footer state', () => {
  const { elements, run } = createRendererSandbox();
  elements.get('#thumbs').classList.remove('hidden');
  elements.get('#dropzone').classList.add('hidden');
  elements.get('#folderSelection').classList.remove('hidden');

  run("droppedPaths = ['/photos/one.jpg', '/exports']; imagePaths = ['/photos/one.jpg']; coverImagePath = '/photos/one.jpg'; removePhoto('/photos/one.jpg')");

  assert.equal(elements.get('#folderSelection').classList.contains('hidden'), true);
  assert.equal(elements.get('#footerSource').textContent, 'No source selected');
  assert.equal(elements.get('#footerImageCount').textContent, '0');
  assert.equal(elements.get('#footerCoverStat').classList.contains('hidden'), true);
});
