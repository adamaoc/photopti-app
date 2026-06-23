const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer', 'styles.css'), 'utf8');

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
