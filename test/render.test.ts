import { describe, expect, it } from 'vitest';
import {
  createDefaultRenderer,
  createRenderer,
  fileReferences,
  findFileReferences,
  frontMatter,
  gfm,
  highlight,
  math,
  slugify,
  toggleTask,
} from '../src/index.js';

describe('createRenderer', () => {
  it('renders plain markdown with source line attributes', () => {
    const { html } = createRenderer().render('# Title\n\nHello *world*\n');
    expect(html).toContain('<h1 data-source-lines="0-1">Title</h1>');
    expect(html).toContain('<p data-source-lines="2-3">Hello <em>world</em></p>');
  });

  it('can turn source lines off', () => {
    const { html } = createRenderer({ sourceLines: false }).render('para');
    expect(html).toBe('<p>para</p>\n');
  });

  it('escapes raw HTML by default', () => {
    const { html } = createRenderer().render('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('allows raw HTML when enabled and applies sanitize last', () => {
    const r = createRenderer({
      html: true,
      sanitize: (h) => h.replace(/<script[\s\S]*?<\/script>/g, ''),
    });
    const { html } = r.render('<details><summary>x</summary>y</details>\n\n<script>bad()</script>');
    expect(html).toContain('<details>');
    expect(html).not.toContain('script');
  });

  it('rewrites link and image URLs', () => {
    const r = createRenderer({
      resolveUrl: (url, kind) => (url.startsWith('http') ? undefined : `/files/${kind}/${url}`),
    });
    const { html } = r.render('[doc](other.md) ![pic](img/a.png) [web](https://x.dev)');
    expect(html).toContain('href="/files/link/other.md"');
    expect(html).toContain('src="/files/image/img/a.png"');
    expect(html).toContain('href="https://x.dev"');
  });

  it('rejects duplicate plugins', () => {
    const r = createRenderer().use(gfm());
    expect(() => r.use(gfm())).toThrow(/already added/);
    expect(r.plugins).toEqual(['gfm']);
  });

  it('keeps tables and strikethrough from markdown-it', () => {
    const { html } = createRenderer().render('| a | b |\n|---|---|\n| 1 | ~~2~~ |');
    expect(html).toContain('<table');
    expect(html).toContain('<s>2</s>');
  });
});

describe('gfm', () => {
  const r = createRenderer({ plugins: [gfm()] });

  it('renders task lists', () => {
    const { html } = r.render('- [ ] todo\n- [x] done\n- plain');
    expect(html).toContain('<ul class="contains-task-list" data-source-lines="0-3">');
    expect(html).toContain(
      '<input type="checkbox" class="task-list-item-checkbox" disabled data-task-line="0"> todo',
    );
    expect(html).toContain('checked disabled data-task-line="1"> done');
    expect(html).toMatch(/<li data-source-lines="2-3">plain<\/li>/);
  });

  it('leaves checkboxes clickable when interactive', () => {
    const { html } = createRenderer({ plugins: [gfm({ interactiveTasks: true })] }).render('- [ ] a');
    expect(html).not.toContain('disabled');
  });

  it('renders alerts', () => {
    const { html } = r.render('> [!WARNING]\n> Be careful\n> here.');
    expect(html).toContain('<div class="markdown-alert markdown-alert-warning" data-source-lines="0-3">');
    expect(html).toContain('<p class="markdown-alert-title">Warning</p>');
    expect(html).toContain('<p data-source-lines="0-3">Be careful\nhere.</p>');
    expect(html).not.toContain('[!WARNING]');
    expect(html.match(/<\/div>/g)).toHaveLength(1);
  });

  it('renders alerts whose marker is alone in its paragraph', () => {
    const { html } = r.render('> [!TIP]\n>\n> Second paragraph');
    expect(html).toContain('markdown-alert-tip');
    expect(html).toContain('<p data-source-lines="2-3">Second paragraph</p>');
  });

  it('leaves ordinary blockquotes and unknown markers alone', () => {
    expect(r.render('> quote').html).toContain('<blockquote');
    expect(r.render('> [!FOO]\n> x').html).toContain('<blockquote');
  });

  it('adds heading ids and collects headings', () => {
    const result = r.render('# Hello, World!\n\n## Hello, World!\n\n### `code` & more');
    expect(result.html).toContain('<h1 data-source-lines="0-1" id="hello-world">');
    expect(result.html).toContain('id="hello-world-1"');
    expect(result.headings).toEqual([
      { level: 1, text: 'Hello, World!', id: 'hello-world', line: 0 },
      { level: 2, text: 'Hello, World!', id: 'hello-world-1', line: 2 },
      { level: 3, text: 'code & more', id: 'code--more', line: 4 },
    ]);
  });

  it('renders footnotes', () => {
    const { html } = r.render('Text[^1]\n\n[^1]: The note.');
    expect(html).toContain('class="footnote-ref"');
    expect(html).toContain('The note.');
  });
});

describe('slugify', () => {
  it('matches GitHub-style anchors', () => {
    expect(slugify('Getting Started')).toBe('getting-started');
    expect(slugify('API: v2.0 (beta)')).toBe('api-v20-beta');
    expect(slugify('snake_case and-dash')).toBe('snake_case-and-dash');
    expect(slugify('Ünïcödé 日本語')).toBe('ünïcödé-日本語');
  });
});

describe('toggleTask', () => {
  const src = '# List\n- [ ] one\n  1. [x] two\n> - [X] quoted\nnot a task';
  it('flips the checkbox on the given line', () => {
    expect(toggleTask(src, 1)).toContain('- [x] one');
    expect(toggleTask(src, 2)).toContain('  1. [ ] two');
    expect(toggleTask(src, 3)).toContain('> - [ ] quoted');
  });
  it('ignores lines that are not tasks', () => {
    expect(toggleTask(src, 0)).toBe(src);
    expect(toggleTask(src, 4)).toBe(src);
    expect(toggleTask(src, 99)).toBe(src);
  });
  it('round-trips with the rendered data-task-line', () => {
    const r = createRenderer({ plugins: [gfm({ interactiveTasks: true })] });
    const line = Number(/data-task-line="(\d+)"/.exec(r.render(src).html)![1]);
    expect(toggleTask(src, line)).toContain('- [x] one');
  });
});

describe('highlight', () => {
  const r = createRenderer({ plugins: [highlight()] });

  it('highlights known languages', () => {
    const { html } = r.render('```ts\nconst x: number = 1;\n```');
    expect(html).toContain('<pre><code data-source-lines="0-3" class="hljs language-ts">');
    expect(html).toContain('<span class="hljs-keyword">const</span>');
  });

  it('escapes unknown languages without highlighting', () => {
    const { html } = r.render('```nope\n<b>\n```');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('hljs-');
  });

  it('skips mermaid and math fences', () => {
    const { html } = r.render('```mermaid\ngraph TD\n```');
    expect(html).not.toContain('hljs');
  });
});

describe('math', () => {
  const r = createRenderer({ plugins: [math()] });

  it('renders inline dollar math', () => {
    const { html } = r.render('Euler: $e^{i\\pi}+1=0$.');
    expect(html).toContain('<span class="math-inline"><span class="katex">');
  });

  it('does not treat prices as math', () => {
    const { html } = r.render('It costs $5 and $10 total.');
    expect(html).not.toContain('katex');
    expect(r.render('Escaped \\$x\\$ stays').html).not.toContain('katex');
  });

  it('renders \\( \\) inline and $$ $$ inline as display', () => {
    expect(r.render('a \\(x^2\\) b').html).toContain('math-inline');
    expect(r.render('a $$x^2$$ b').html).toContain('math-display');
  });

  it('renders multi-line $$ blocks with source lines', () => {
    const { html } = r.render('Before\n\n$$\na^2 + b^2\n= c^2\n$$\n\nAfter');
    expect(html).toContain('<div data-source-lines="2-6" class="math-block"><span class="katex-display">');
    expect(html).toContain('<p data-source-lines="7-8">After</p>');
  });

  it('renders one-line $$ blocks, \\[ \\] blocks and math fences', () => {
    expect(r.render('$$ x $$').html).toContain('math-block');
    expect(r.render('\\[\nx\n\\]').html).toContain('math-block');
    expect(r.render('```math\nx\n```').html).toContain('math-block');
  });

  it('leaves an unclosed $$ as text', () => {
    expect(r.render('$$\nno end').html).not.toContain('katex');
  });

  it('shows errors inline instead of throwing', () => {
    expect(r.render('$\\frac{$').html).toContain('katex-error');
  });

  it('can disable LaTeX delimiters', () => {
    const plain = createRenderer({ plugins: [math({ latexDelimiters: false })] });
    expect(plain.render('\\(x\\)').html).not.toContain('katex');
  });
});

describe('frontMatter', () => {
  const doc = '---\ntitle: Hello\ntags: [a, b]\nmeta:\n  draft: true\n---\n# Body';

  it('parses YAML and renders a table', () => {
    const result = createRenderer({ plugins: [frontMatter()] }).render(doc);
    expect(result.frontMatter).toEqual({ title: 'Hello', tags: ['a', 'b'], meta: { draft: true } });
    expect(result.html).toContain('<details data-source-lines="0-6" class="front-matter">');
    expect(result.html).toContain('<tr><th>title</th><td>Hello</td></tr>');
    expect(result.html).toContain('<td>a, b</td>');
    expect(result.html).toContain('<h1 data-source-lines="6-7">Body</h1>');
  });

  it('can hide the block', () => {
    const result = createRenderer({ plugins: [frontMatter({ display: 'hidden' })] }).render(doc);
    expect(result.html).not.toContain('details');
    expect(result.frontMatter).toMatchObject({ title: 'Hello' });
  });

  it('reports invalid YAML', () => {
    const result = createRenderer({ plugins: [frontMatter()] }).render('---\na: [\n---\n');
    expect(result.frontMatterError).toBeTruthy();
    expect(result.html).toContain('front-matter-error');
  });

  it('only applies at the top of the document', () => {
    const result = createRenderer({ plugins: [frontMatter()] }).render('text\n\n---\na: 1\n---');
    expect(result.frontMatter).toBeUndefined();
  });

  it('escapes values', () => {
    const { html } = createRenderer({ plugins: [frontMatter()] }).render('---\nx: "<img>"\n---');
    expect(html).toContain('&lt;img&gt;');
  });
});

describe('fileReferences', () => {
  it('finds references with paths or line numbers only', () => {
    const refs = findFileReferences(
      'See src/app.ts:42:7, ./lib/a.test.js and main.go:10. Not Node.js or e.g. or v1.2.',
    ).map((m) => m.ref);
    expect(refs).toEqual([
      { path: 'src/app.ts', line: 42, column: 7 },
      { path: './lib/a.test.js' },
      { path: 'main.go', line: 10 },
    ]);
  });

  it('links text and whole code spans', () => {
    const r = createRenderer({
      plugins: [fileReferences({ resolve: (ref) => `vscode://file/${ref.path}:${ref.line ?? 1}` })],
    });
    const result = r.render('Look at src/a.ts:3 and `lib/b.rs`.');
    expect(result.html).toContain(
      '<a href="vscode://file/src/a.ts:3" class="file-ref" data-file-path="src/a.ts" data-file-line="3">src/a.ts:3</a>',
    );
    expect(result.html).toContain('data-file-path="lib/b.rs"><code>lib/b.rs</code></a>');
    expect(result.fileReferences).toHaveLength(2);
  });

  it('leaves unresolved references and existing links alone', () => {
    const r = createRenderer({ plugins: [fileReferences({ resolve: () => null })] });
    expect(r.render('src/a.ts:3').html).not.toContain('<a');
    const linked = createRenderer({ plugins: [fileReferences()] }).render('[src/a.ts](x)');
    expect(linked.html.match(/<a /g)).toHaveLength(1);
  });

  it('is not rewritten by resolveUrl', () => {
    const r = createRenderer({ resolveUrl: () => 'REWRITTEN', plugins: [fileReferences()] });
    expect(r.render('src/a.ts:1').html).toContain('href="src/a.ts"');
  });
});

describe('createDefaultRenderer', () => {
  it('combines everything', () => {
    const r = createDefaultRenderer();
    expect(r.plugins).toEqual(['front-matter', 'gfm', 'highlight', 'math', 'mermaid']);
    const result = r.render(
      [
        '---',
        'title: Doc',
        '---',
        '# Intro',
        '',
        '> [!NOTE]',
        '> $x$ is math',
        '',
        '- [x] done',
        '',
        '```js',
        'let a = 1',
        '```',
        '',
        '```mermaid',
        'graph TD; A-->B',
        '```',
      ].join('\n'),
    );
    expect(result.frontMatter).toEqual({ title: 'Doc' });
    expect(result.headings[0]).toMatchObject({ text: 'Intro', id: 'intro', line: 3 });
    for (const needle of ['markdown-alert-note', 'katex', 'task-list-item', 'hljs-keyword', 'mermaid-diagram']) {
      expect(result.html).toContain(needle);
    }
  });

  it('lets plugins be turned off', () => {
    const r = createDefaultRenderer({ math: false, mermaid: false, fileReferences: {} });
    expect(r.plugins).toEqual(['front-matter', 'gfm', 'highlight', 'file-references']);
  });
});
