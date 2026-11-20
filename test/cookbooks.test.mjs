import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildCookbooks } from '../scripts/build-cookbooks.mjs';

test('cookbooks render navigable articles with code examples and preserve the proposal catalog', () => {
  const outputs = new Map();
  buildCookbooks({
    repo: fileURLToPath(new URL('../', import.meta.url)),
    route: '/poppy',
    write: (path, content) => outputs.set(path, content),
    page: (_title, body) => body,
  });
  const index = outputs.get('cookbooks/index.html');
  assert.equal([...index.matchAll(/<li data-proposal>/g)].length, 50);
  assert.match(index, /data-filter/);
  assert.match(index, /sandbox\.printwithpoppy\.com/);

  const articles = [...outputs.keys()].filter((name) => name.endsWith('.html') && !name.endsWith('/index.html'));
  assert.equal(articles.length, 5);
  for (const path of articles) {
    const html = outputs.get(path);
    const markdown = outputs.get(path.replace(/\.html$/, '.md'));
    assert.ok(markdown.startsWith('# '));
    assert.match(html, /<article[^>]*>.*<h2 id="what-you-ll-build">/);
    assert.match(html, /data-copy/);
    assert.doesNotMatch(html, /\x60{3}/);
    for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) {
      assert.ok(html.includes('id="' + anchor + '"'), path + ' links to a missing section');
    }
  }
});
