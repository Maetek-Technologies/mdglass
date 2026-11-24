import type { HLJSApi } from 'highlight.js';
import hljsCommon from 'highlight.js/lib/common';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type { MarkdownPlugin } from '../types.js';

export interface HighlightOptions {
  /**
   * The highlight.js instance to use. Defaults to `highlight.js/lib/common`
   * (about 35 popular languages). Pass `import hljs from 'highlight.js'` for
   * all languages, or a core instance with only the languages you register.
   */
  hljs?: HLJSApi;
  /** Guess the language of fences that don't name one. Default false. */
  autoDetect?: boolean;
  /** Fence languages to leave alone (other plugins render them). */
  skip?: string[];
}

/**
 * Syntax highlighting for fenced code blocks with highlight.js. Output uses
 * `hljs-*` classes, so include any highlight.js theme stylesheet.
 */
export function highlight(options: HighlightOptions = {}): MarkdownPlugin {
  const hljs = options.hljs ?? hljsCommon;
  const autoDetect = options.autoDetect ?? false;
  const skip = new Set((options.skip ?? ['mermaid', 'math']).map((s) => s.toLowerCase()));

  return {
    name: 'highlight',
    extend(md) {
      md.set({
        highlight(code, lang) {
          const name = lang.toLowerCase();
          if (skip.has(name)) return '';
          try {
            if (name && hljs.getLanguage(name)) {
              return hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
            }
            if (!name && autoDetect) return hljs.highlightAuto(code).value;
          } catch {
            // Fall through to markdown-it's plain escaped output.
          }
          return '';
        },
      });

      // Mark fenced and indented code with the `hljs` class that themes target.
      md.core.ruler.push('highlight_class', (state: StateCore) => {
        for (const token of state.tokens) {
          if (token.type !== 'fence' && token.type !== 'code_block') continue;
          const lang = token.info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
          if (!skip.has(lang)) token.attrJoin('class', 'hljs');
        }
      });
    },
  };
}
