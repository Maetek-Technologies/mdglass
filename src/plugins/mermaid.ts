import type { MarkdownPlugin } from '../types.js';

/** The part of the Mermaid API this plugin uses. */
export interface MermaidLike {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string; bindFunctions?: (el: Element) => void }>;
}

export interface MermaidOptions {
  /**
   * Loads Mermaid. Defaults to a dynamic `import('mermaid')`, so Mermaid is
   * only downloaded when a document actually contains a diagram.
   */
  load?: () => Promise<MermaidLike>;
  /** Mermaid theme, e.g. `'default'`, `'dark'`, `'neutral'`. Default `'default'`. */
  theme?: string;
  /**
   * Extra Mermaid config merged into `initialize()`. `securityLevel` defaults
   * to `'strict'`, which disables click handlers and HTML labels in diagrams.
   */
  config?: Record<string, unknown>;
}

export interface MermaidPlugin extends MarkdownPlugin {
  /**
   * Re-render every diagram under `root`, e.g. after switching between light
   * and dark mode. `theme` replaces the configured theme.
   */
  rerender(root: ParentNode, theme?: string): Promise<void>;
}

const RENDERED = 'data-mermaid-rendered';
const SOURCE = 'data-mermaid-source';
let idCounter = 0;

/**
 * Mermaid diagrams in ```` ```mermaid ```` fences. Rendering to HTML emits a
 * placeholder holding the diagram source; `renderer.hydrate(element)` turns
 * placeholders into SVG. Browser only.
 */
export function mermaid(options: MermaidOptions = {}): MermaidPlugin {
  const load = options.load ?? defaultLoad;
  let theme = options.theme ?? 'default';
  let instance: Promise<MermaidLike> | null = null;
  let initializedTheme: string | null = null;

  const getMermaid = async (): Promise<MermaidLike> => {
    instance ??= load();
    const m = await instance;
    if (initializedTheme !== theme) {
      m.initialize({ startOnLoad: false, securityLevel: 'strict', ...options.config, theme });
      initializedTheme = theme;
    }
    return m;
  };

  const renderAll = async (root: ParentNode, force: boolean) => {
    const selector = force ? `.mermaid-diagram` : `.mermaid-diagram:not([${RENDERED}])`;
    const blocks = Array.from(root.querySelectorAll<HTMLElement>(selector));
    if (blocks.length === 0) return;
    const m = await getMermaid();

    for (const block of blocks) {
      // On first hydration, move the source out of the <pre> into an attribute
      // so it survives the SVG replacing the content.
      let source = block.getAttribute(SOURCE);
      if (source === null) {
        source = block.querySelector('.mermaid-source')?.textContent ?? '';
        block.setAttribute(SOURCE, source);
      }
      const id = `mdglass-mermaid-${++idCounter}`;
      try {
        const { svg, bindFunctions } = await m.render(id, source);
        block.innerHTML = svg;
        bindFunctions?.(block);
        block.classList.remove('mermaid-error');
      } catch (e) {
        block.classList.add('mermaid-error');
        const message = document.createElement('pre');
        message.className = 'mermaid-error-message';
        message.textContent = e instanceof Error ? e.message : String(e);
        block.replaceChildren(message);
        // Mermaid leaves a temporary element behind when parsing fails.
        document.getElementById(`d${id}`)?.remove();
      }
      block.setAttribute(RENDERED, '');
    }
  };

  return {
    name: 'mermaid',
    extend(md) {
      const fence = md.renderer.rules.fence!;
      md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
        const token = tokens[idx]!;
        if (token.info.trim().split(/\s+/)[0]?.toLowerCase() !== 'mermaid') {
          return fence(tokens, idx, opts, env, self);
        }
        token.attrJoin('class', 'mermaid-diagram');
        return (
          `<div${self.renderAttrs(token)}>` +
          `<pre class="mermaid-source">${md.utils.escapeHtml(token.content)}</pre></div>\n`
        );
      };
    },
    hydrate(root) {
      return renderAll(root, false);
    },
    async rerender(root, nextTheme) {
      if (nextTheme) theme = nextTheme;
      await renderAll(root, true);
    },
  };
}

async function defaultLoad(): Promise<MermaidLike> {
  const mod = await import('mermaid');
  return mod.default as unknown as MermaidLike;
}
