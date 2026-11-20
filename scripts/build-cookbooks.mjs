import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml as escape } from '../src/report-views.mjs';

const repository = 'https://github.com/Rhys-Lindmark/poppy/blob/main/';
const source = 'https://github.com/Rhys-Lindmark/poppy';
const guides = [
  { slug: 'personal-agent', topic: 'Agent implementation', proposal: 1 },
  { slug: 'store-discovery', topic: 'Store implementation', proposal: 13 },
  { slug: 'direct-sign-in', topic: 'Direct Sign-In', proposal: 15 },
  { slug: 'delivery-approval', topic: 'Operations 3', proposal: 35 },
  { slug: 'interoperability', topic: 'Evaluation', proposal: 27 },
];
const communities = new Map([
  ['Cliffside Retail', 'https://www.cliffside-retail.com/'],
  ['Poppy Demo Agent', 'https://poppydemoagent.dev/'],
  ['Print with Poppy', 'https://sandbox.printwithpoppy.com/'],
]);
const guideByProposal = new Map(guides.map(({ proposal, slug }) => [proposal, slug]));
const languageNames = { sh: 'Shell', js: 'JavaScript', json: 'JSON', text: 'Example output' };

const anchor = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function guideLink(href) {
  if (/^https:\/\//.test(href) || href.startsWith('#')) return href;
  if (href.startsWith('../../src/')) return repository + href.slice('../../'.length);
  if (href === '../poppyval.md') return repository + 'docs/poppyval.md';
  if (guides.some(({ slug }) => href === slug + '.md')) return href.replace(/\.md$/, '.html');
  throw new Error('Unsupported guide link ' + href);
}

function inline(text) {
  let rendered = '';
  let offset = 0;
  const tokens = /\[([^\]\n]+)\]\(([^)\s]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*/g;
  for (const match of text.matchAll(tokens)) {
    const [token, label, href, code, strong] = match;
    rendered += escape(text.slice(offset, match.index));
    if (href) rendered += '<a href="' + escape(guideLink(href)) + '">' + escape(label) + '</a>';
    else if (code) rendered += '<code>' + escape(code) + '</code>';
    else rendered += '<strong>' + escape(strong) + '</strong>';
    offset = match.index + token.length;
  }
  return rendered + escape(text.slice(offset));
}

function renderBlocks(markdown) {
  const outline = [];
  const blocks = [];
  for (const piece of markdown.matchAll(/^\x60{3}([a-z]+)\n([\s\S]*?)^\x60{3}$|([^\n]+(?:\n(?!\n|\x60{3})[^\n]+)*)/gm)) {
    const [, language, code, prose] = piece;
    if (language) {
      const label = languageNames[language];
      if (!label) throw new Error('Unsupported cookbook code language ' + language);
      blocks.push('<div class="cookbook-code"><div class="cookbook-code-bar"><span>' + label + '</span>' +
        '<button type="button" data-copy hidden aria-label="Copy ' + label + '">Copy</button></div>' +
        '<pre tabindex="0"><code>' + escape(code.replace(/\n$/, '')) + '</code></pre></div>');
    } else if (prose.startsWith('## ')) {
      const label = prose.slice(3);
      const id = anchor(label);
      if (!id || outline.some((heading) => heading.id === id)) throw new Error('Duplicate guide heading ' + label);
      outline.push({ id, label });
      blocks.push('<h2 id="' + id + '">' + inline(label) + '</h2>');
    } else if (/^(?:- |\d+\. )/.test(prose)) {
      const tag = prose.startsWith('- ') ? 'ul' : 'ol';
      blocks.push('<' + tag + '>' + prose.split('\n').map((line) =>
        '<li>' + inline(line.replace(/^(?:- |\d+\. )/, '')) + '</li>').join('') + '</' + tag + '>');
    } else if (prose.startsWith('> ')) {
      blocks.push('<blockquote><p>' + inline(prose.slice(2)) + '</p></blockquote>');
    } else if (prose.startsWith('\x60\x60\x60')) {
      throw new Error('Unclosed or unlabeled code fence in cookbook');
    } else {
      blocks.push('<p>' + inline(prose) + '</p>');
    }
  }
  return { html: blocks.join('\n'), outline };
}

function readGuide(repo, guide) {
  const markdown = readFileSync(join(repo, 'docs/cookbooks', guide.slug + '.md'), 'utf8').replaceAll('\r\n', '\n');
  const [title, description, ...content] = markdown.trim().split('\n\n');
  if (!title.startsWith('# ') || !description || content.length === 0) {
    throw new Error('Expected a title, description and content in ' + guide.slug);
  }
  return { ...guide, title: title.slice(2), description, markdown, ...renderBlocks(content.join('\n\n')) };
}

function article(guide) {
  const items = guide.outline.map(({ id, label }) =>
    '<li><a href="#' + id + '">' + escape(label) + '</a></li>').join('');
  return '<div class="cookbook-title cookbook-entry-title"><p class="cookbook-breadcrumb"><a href="./">Cookbooks</a>' +
    '<span> / </span>' + escape(guide.topic) + '</p><h1>' + escape(guide.title) + '</h1>' +
    '<p class="cookbook-intro">' + inline(guide.description) + '</p>' +
    '<p class="cookbook-source"><a href="' + guide.slug + '.md">Markdown</a>' +
    '<a href="' + repository + 'docs/cookbooks/' + guide.slug + '.md">View on GitHub</a></p></div>' +
    '<div class="cookbook-layout"><nav class="cookbook-outline" aria-label="On this page">' +
    '<p>On this page</p><ul>' + items + '</ul></nav><article class="cookbook-content">' +
    guide.html + '</article></div><p class="cookbook-feedback" role="status"></p>';
}

function proposalGroups(repo) {
  const catalog = readFileSync(join(repo, 'docs/cookbooks.md'), 'utf8');
  const section = catalog.split('## 50 proposals\n')[1]?.split('\n## ')[0];
  const groups = (section ?? '').trim().split(/^### /m).filter(Boolean).map((group) => {
    const titleEnd = group.indexOf('\n');
    return {
      title: group.slice(0, titleEnd),
      entries: [...group.matchAll(/^\| (\d+) \| ([^|]+) \| ([^|]+) \|$/gm)]
        .map(([, id, label, outcome]) => ({ id: Number(id), label: label.trim(), outcome: outcome.trim() })),
    };
  });
  if (groups.flatMap(({ entries }) => entries).map(({ id }) => id).join(',') !==
      Array.from({ length: 50 }, (_, index) => index + 1).join(',')) {
    throw new Error('Expected the 50 numbered cookbook proposals');
  }
  return groups;
}

function index(articles, groups) {
  const topics = groups.map(({ title }) =>
    '<option value="' + anchor(title) + '">' + escape(title) + '</option>').join('');
  const tutorials = articles.map(({ slug, title, topic }) =>
    '<li><a href="' + slug + '.html">' + escape(title) + '</a><span>' + escape(topic) + '</span></li>').join('');
  const proposals = groups.map(({ title, entries }) =>
    '<div class="cookbook-group" data-proposal-group><h3 id="' + anchor(title) + '">' + escape(title) + '</h3>' +
    '<ul>' + entries.map(({ id, label, outcome }) => {
      const slug = guideByProposal.get(id);
      const href = slug ? slug + '.html' : communities.get(label);
      return '<li data-proposal><p>' + (href ? '<a href="' + escape(href) + '">' + escape(label) +
        '</a>' : '<strong>' + escape(label) + '</strong>') + '</p> <p>' + escape(outcome) + '</p></li>';
    }).join('') + '</ul></div>').join('');

  return '<div class="cookbook-title cookbook-catalog-title"><h1>Personal Agent Protocol cookbooks</h1><p class="cookbook-intro">' +
    'Build a personal agent, connect a store, or test how they work together.</p>' +
    '<nav class="cookbook-source" aria-label="Cookbook resources">' +
    '<a href="#runnable-guides">Runnable guides</a><a href="#proposals">50 proposals</a>' +
    '<a href="/poppy/protocol-trace.html#replay">Replay the demo</a>' +
    '<a href="' + source + '">GitHub</a></nav></div>' +
    '<div class="cookbook-content cookbook-catalog"><section aria-labelledby="runnable-guides">' +
    '<h2 id="runnable-guides">Runnable guides <span>' + articles.length + '</span></h2><ul class="cookbook-guides">' + tutorials +
    '</ul></section><section aria-labelledby="proposals"><h2 id="proposals">50 proposals</h2>' +
    '<div class="cookbook-filter" data-filter hidden>' +
    '<div><label for="find-proposal">Search proposals</label>' +
    '<input id="find-proposal" type="search" placeholder="Search by task or capability" autocomplete="off"></div>' +
    '<div><label for="proposal-topic">Topic</label><select id="proposal-topic"><option value="">All topics</option>' +
    topics + '</select></div><p data-count role="status"></p></div>' + proposals +
    '<p><a href="https://personalagentprotocol.org/docs/demos">All Poppy community demos</a></p></section></div>';
}

export function buildCookbooks({ repo, route, write, page }) {
  const articles = guides.map((guide) => readGuide(repo, guide));
  const head = '<link rel="stylesheet" href="' + route + '/cookbooks.css">' +
    '<script type="module" src="' + route + '/cookbooks.mjs"></script>';
  for (const guide of articles) {
    write('cookbooks/' + guide.slug + '.html', page(guide.title, article(guide), head, 'cookbook-page'));
    write('cookbooks/' + guide.slug + '.md', guide.markdown);
  }
  write('cookbooks/index.html', page('Personal Agent Protocol cookbooks', index(articles, proposalGroups(repo)), head, 'cookbook-page'));
}
