import { frontMatter, type FrontMatterOptions } from './plugins/frontMatter.js';
import { fileReferences, type FileReferenceOptions } from './plugins/fileReferences.js';
import { gfm, type GfmOptions } from './plugins/gfm.js';
import { highlight, type HighlightOptions } from './plugins/highlight.js';
import { math, type MathOptions } from './plugins/math.js';
import { mermaid, type MermaidOptions } from './plugins/mermaid.js';
import { createRenderer, type Renderer, type RendererOptions } from './renderer.js';
import type { MarkdownPlugin } from './types.js';

export { createRenderer } from './renderer.js';
export type { Renderer, RendererOptions } from './renderer.js';
export { gfm, toggleTask, slugify, ALERT_TYPES } from './plugins/gfm.js';
export type { GfmOptions, AlertType } from './plugins/gfm.js';
export { highlight } from './plugins/highlight.js';
export type { HighlightOptions } from './plugins/highlight.js';
export { math } from './plugins/math.js';
export type { MathOptions } from './plugins/math.js';
export { mermaid } from './plugins/mermaid.js';
export type { MermaidOptions, MermaidPlugin, MermaidLike } from './plugins/mermaid.js';
export { frontMatter } from './plugins/frontMatter.js';
export type { FrontMatterOptions } from './plugins/frontMatter.js';
export { fileReferences, findFileReferences } from './plugins/fileReferences.js';
export type { FileReferenceOptions } from './plugins/fileReferences.js';
export type * from './types.js';

export interface DefaultRendererOptions extends Omit<RendererOptions, 'plugins'> {
  /** Set a plugin to `false` to leave it out, or pass its options. */
  gfm?: GfmOptions | false;
  highlight?: HighlightOptions | false;
  math?: MathOptions | false;
  frontMatter?: FrontMatterOptions | false;
  /** Placeholders are rendered anywhere; diagrams need `hydrate()` in a browser. */
  mermaid?: MermaidOptions | false;
  /** Off by default; pass options (or `{}`) to turn on. */
  fileReferences?: FileReferenceOptions | false;
  /** Extra plugins added after the built-in ones. */
  plugins?: MarkdownPlugin[];
}

/**
 * A renderer with the usual set of plugins: GFM extras, syntax highlighting,
 * math, front matter and Mermaid. File references are opt-in.
 */
export function createDefaultRenderer(options: DefaultRendererOptions = {}): Renderer {
  const {
    gfm: gfmOpts = {},
    highlight: highlightOpts = {},
    math: mathOpts = {},
    frontMatter: frontMatterOpts = {},
    mermaid: mermaidOpts = {},
    fileReferences: fileRefOpts = false,
    plugins = [],
    ...rendererOptions
  } = options;

  const list: MarkdownPlugin[] = [];
  if (frontMatterOpts) list.push(frontMatter(frontMatterOpts));
  if (gfmOpts) list.push(gfm(gfmOpts));
  if (highlightOpts) list.push(highlight(highlightOpts));
  if (mathOpts) list.push(math(mathOpts));
  if (mermaidOpts) list.push(mermaid(mermaidOpts));
  if (fileRefOpts) list.push(fileReferences(fileRefOpts));
  list.push(...plugins);

  return createRenderer({ ...rendererOptions, plugins: list });
}
