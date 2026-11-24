import MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type { MarkdownPlugin, RenderEnv, RenderResult, UrlResolver } from './types.js';

export interface RendererOptions {
  /**
   * Allow raw HTML in the Markdown source. Off by default. If you turn it on
   * for content you don't control, also pass `sanitize`.
   */
  html?: boolean;
  /** Turn bare URLs into links. Default true. */
  linkify?: boolean;
  /** Smart quotes and dashes. Default true. */
  typographer?: boolean;
  /** Treat single newlines as `<br>`. Default false. */
  breaks?: boolean;
  /**
   * Add `data-source-lines="start-end"` (zero-based, end exclusive) to block
   * elements so rendered output can be mapped back to the source. Default true.
   */
  sourceLines?: boolean;
  /** Rewrite link and image URLs, e.g. to resolve paths relative to the document. */
  resolveUrl?: UrlResolver;
  /**
   * Final pass over the HTML string, e.g. `(html) => DOMPurify.sanitize(html)`.
   * Runs after all plugins.
   */
  sanitize?: (html: string) => string;
  /** Plugins to add immediately; equivalent to calling `use()` for each. */
  plugins?: MarkdownPlugin[];
}

export interface Renderer {
  /** Add a plugin. Returns the renderer so calls can be chained. */
  use(plugin: MarkdownPlugin): Renderer;
  /** Render a full document. */
  render(source: string): RenderResult;
  /** Render a single line of inline Markdown (no paragraphs, no plugins' block rules). */
  renderInline(source: string): string;
  /**
   * Run each plugin's browser-side step against an element that contains
   * rendered output. Safe to call repeatedly; plugins skip work already done.
   */
  hydrate(root: ParentNode): Promise<void>;
  /** Names of the plugins added so far, in order. */
  readonly plugins: readonly string[];
  /** The underlying markdown-it instance, for adding your own rules. */
  readonly md: MarkdownIt;
}

export function createRenderer(options: RendererOptions = {}): Renderer {
  const md = new MarkdownIt({
    html: options.html ?? false,
    linkify: options.linkify ?? true,
    typographer: options.typographer ?? true,
    breaks: options.breaks ?? false,
  });

  if (options.sourceLines ?? true) addSourceLines(md);
  if (options.resolveUrl) addUrlResolver(md, options.resolveUrl);

  const added: MarkdownPlugin[] = [];
  const sanitize = options.sanitize;

  const renderer: Renderer = {
    md,
    get plugins() {
      return added.map((p) => p.name);
    },
    use(plugin) {
      if (added.some((p) => p.name === plugin.name)) {
        throw new Error(`mdglass: plugin "${plugin.name}" is already added`);
      }
      plugin.extend(md);
      added.push(plugin);
      return renderer;
    },
    render(source) {
      const env: RenderEnv = { headings: [] };
      let html = md.render(source, env);
      if (sanitize) html = sanitize(html);
      return { ...env, html };
    },
    renderInline(source) {
      const html = md.renderInline(source, { headings: [] });
      return sanitize ? sanitize(html) : html;
    },
    async hydrate(root) {
      for (const plugin of added) {
        if (plugin.hydrate) await plugin.hydrate(root);
      }
    },
  };

  for (const plugin of options.plugins ?? []) renderer.use(plugin);
  return renderer;
}

function addSourceLines(md: MarkdownIt): void {
  md.core.ruler.push('source_lines', (state: StateCore) => {
    for (const token of state.tokens) {
      // Every opening or self-contained block token (paragraphs, fences, math
      // blocks, ...). Renderers that ignore attributes simply drop it.
      if (!token.map || !token.block || token.nesting === -1 || token.type === 'inline') continue;
      token.attrSet('data-source-lines', `${token.map[0]}-${token.map[1]}`);
    }
  });
}

function addUrlResolver(md: MarkdownIt, resolve: UrlResolver): void {
  md.core.ruler.push('resolve_urls', (state: StateCore) => {
    for (const block of state.tokens) {
      if (block.type !== 'inline' || !block.children) continue;
      for (const token of block.children) {
        const attr = token.type === 'image' ? 'src' : token.type === 'link_open' ? 'href' : null;
        // File-reference links have their own resolver.
        if (!attr || token.markup === 'file-ref') continue;
        const url = token.attrGet(attr);
        if (url === null) continue;
        const next = resolve(url, attr === 'src' ? 'image' : 'link');
        if (next !== undefined) token.attrSet(attr, next);
      }
    }
  });
}
