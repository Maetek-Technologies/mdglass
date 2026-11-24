# mdglass

[![npm version](https://img.shields.io/npm/v/mdglass.svg)](https://www.npmjs.com/package/mdglass)
[![license: MIT](https://img.shields.io/npm/l/mdglass.svg)](https://github.com/Maetek-Technologies/mdglass/blob/main/LICENSE)

GitHub-style Markdown rendering for TypeScript apps, built on
[markdown-it](https://github.com/markdown-it/markdown-it) with a small plugin system:

- **GFM extras**: task lists (optionally clickable), `> [!NOTE]` alerts, heading anchors, footnotes. Tables and strikethrough come from markdown-it.
- **Syntax highlighting**: highlight.js.
- **Math**: KaTeX, rendered at render time (`$…$`, `$$…$$`, `\(…\)`, `\[…\]`, ```` ```math ````).
- **Mermaid**: diagrams in ```` ```mermaid ```` fences, loaded lazily in the browser.
- **Front matter**: YAML parsed and returned as data, optionally shown as a table.
- **File references**: `src/app.ts:42` becomes a link your app handles.
- **Source mapping**: every block element gets `data-source-lines="start-end"`.

Works in Node (server-side rendering) and in the browser. Only Mermaid needs a DOM.

## Install

```sh
npm install mdglass
npm install mermaid   # optional, only if you want diagrams
```

## Quick start

```ts
import { createDefaultRenderer } from 'mdglass';
import 'mdglass/styles.css';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';

const renderer = createDefaultRenderer();

const result = renderer.render(markdownSource);
result.html;         // string
result.frontMatter;  // parsed YAML, if any
result.headings;     // [{ level, text, id, line }] — build a table of contents from this

container.innerHTML = result.html;
await renderer.hydrate(container); // renders Mermaid diagrams
```

`createDefaultRenderer` adds front matter, GFM, highlighting, math and Mermaid.
Turn any off with `false` or pass options:

```ts
createDefaultRenderer({
  math: false,
  mermaid: { theme: 'dark' },
  fileReferences: { resolve: (ref) => `vscode://file/${ref.path}:${ref.line ?? 1}` },
});
```

## Security

Raw HTML in Markdown is **off by default** (`html: false`); it's shown as text.
If you turn it on for content you don't control, sanitize the output:

```ts
import DOMPurify from 'dompurify';

const renderer = createDefaultRenderer({
  html: true,
  sanitize: (html) => DOMPurify.sanitize(html),
});
```

`sanitize` runs after every plugin, and the Mermaid placeholders survive DOMPurify's
defaults. Mermaid runs with `securityLevel: 'strict'` and KaTeX with `trust: false`
unless you override them.

## Building your own set

```ts
import { createRenderer, gfm, highlight, math, frontMatter } from 'mdglass';
import hljs from 'highlight.js'; // all languages; the default is the common set

const renderer = createRenderer({ breaks: true })
  .use(frontMatter({ display: 'hidden' }))
  .use(gfm({ interactiveTasks: true }))
  .use(highlight({ hljs }))
  .use(math());
```

### Renderer options

| Option | Default | |
|---|---|---|
| `html` | `false` | Allow raw HTML in the source |
| `linkify` | `true` | Link bare URLs |
| `typographer` | `true` | Smart quotes and dashes |
| `breaks` | `false` | Single newlines become `<br>` |
| `sourceLines` | `true` | Add `data-source-lines` to block elements |
| `resolveUrl` | — | `(url, 'link' \| 'image') => string \| undefined` to rewrite URLs |
| `sanitize` | — | Final pass over the HTML |
| `plugins` | `[]` | Plugins to add |

### Resolving relative links and images

```ts
createDefaultRenderer({
  resolveUrl: (url, kind) =>
    /^[a-z]+:|^#|^\//i.test(url) ? undefined : `/api/files/${encodeURIComponent(url)}`,
});
```

### Clickable task lists

```ts
import { createDefaultRenderer, toggleTask } from 'mdglass';

const renderer = createDefaultRenderer({ gfm: { interactiveTasks: true } });

container.addEventListener('change', (e) => {
  const box = e.target as HTMLInputElement;
  if (!box.matches('.task-list-item-checkbox')) return;
  source = toggleTask(source, Number(box.dataset.taskLine));
  save(source);
});
```

### Mermaid themes

```ts
import { createRenderer, mermaid } from 'mdglass';

const diagrams = mermaid({ theme: 'default' });
const renderer = createRenderer({ plugins: [diagrams] });
// ...later, when the color scheme changes:
await diagrams.rerender(container, 'dark');
```

## Writing a plugin

A plugin has a `name`, an `extend(md)` that adds markdown-it rules, and an optional
browser-side `hydrate(root)`:

```ts
import type { MarkdownPlugin } from 'mdglass';

export const externalLinks = (): MarkdownPlugin => ({
  name: 'external-links',
  extend(md) {
    md.core.ruler.push('external_links', (state) => {
      for (const block of state.tokens) {
        for (const t of block.children ?? []) {
          if (t.type === 'link_open' && /^https?:/.test(t.attrGet('href') ?? '')) {
            t.attrSet('target', '_blank');
            t.attrSet('rel', 'noopener');
          }
        }
      }
    });
  },
});
```

Data a plugin wants to return can be written to markdown-it's `state.env`; it ends up
on the render result.

## Styling

`mdglass/styles.css` covers only what the plugins add (alerts, task lists, front
matter, math and diagram containers, file links), themed with `--mdg-*` CSS variables
and following `prefers-color-scheme` or `data-theme="light|dark"` on `<html>`. Bring
your own base Markdown stylesheet, a highlight.js theme and KaTeX's CSS.

## Development

```sh
npm test
npm run typecheck
npm run build
```

## License

MIT © Maetek Technologies
