import { load as parseYaml } from 'js-yaml';
import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import type { MarkdownPlugin, RenderEnv } from '../types.js';

export interface FrontMatterOptions {
  /**
   * How to show the front matter in the HTML:
   * - `'table'` (default): a collapsible `<details>` with a key/value table
   * - `'hidden'`: nothing; the data is still returned as `frontMatter`
   */
  display?: 'table' | 'hidden';
  /** Summary text of the collapsible block. Default "Front matter". */
  label?: string;
}

/**
 * YAML front matter between `---` fences at the very top of the document.
 * Parsed data is returned as `result.frontMatter`; parse errors as
 * `result.frontMatterError`.
 */
export function frontMatter(options: FrontMatterOptions = {}): MarkdownPlugin {
  const display = options.display ?? 'table';
  const label = options.label ?? 'Front matter';

  return {
    name: 'front-matter',
    extend(md) {
      // Must run before `hr` and `lheading`, which would otherwise claim `---`.
      md.block.ruler.before('table', 'front_matter', frontMatterRule);

      md.renderer.rules.front_matter = (tokens, idx, _opts, _env, self) => {
        if (display === 'hidden') return '';
        const token = tokens[idx]!;
        const data = token.meta?.data as unknown;
        const error = token.meta?.error as string | undefined;
        token.attrJoin('class', 'front-matter');
        const esc = md.utils.escapeHtml;
        const body = error
          ? `<pre class="front-matter-error">${esc(error)}</pre>`
          : renderValue(data, esc);
        return `<details${self.renderAttrs(token)}><summary>${esc(label)}</summary>${body}</details>\n`;
      };
    },
  };
}

const FENCE = /^---[ \t]*$/;
const END_FENCE = /^(?:---|\.\.\.)[ \t]*$/;

function frontMatterRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  if (startLine !== 0 || state.blkIndent !== 0 || state.tShift[0] !== 0) return false;
  const line = (n: number) => state.src.slice(state.bMarks[n]!, state.eMarks[n]!);
  if (!FENCE.test(line(0))) return false;

  let close = -1;
  for (let n = 1; n < endLine; n++) {
    if (END_FENCE.test(line(n))) {
      close = n;
      break;
    }
  }
  if (close === -1) return false;
  if (silent) return true;

  const raw = state.getLines(1, close, 0, false).replace(/\n$/, '');
  const env = state.env as Partial<RenderEnv>;
  env.frontMatterRaw = raw;

  let data: unknown;
  let error: string | undefined;
  try {
    data = parseYaml(raw);
    env.frontMatter = data;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    env.frontMatterError = error;
  }

  const token = state.push('front_matter', '', 0);
  token.block = true;
  token.content = raw;
  token.meta = { data, error };
  token.map = [0, close + 1];
  state.line = close + 1;
  return true;
}

type Escape = (s: string) => string;

function renderValue(value: unknown, esc: Escape): string {
  if (value === null || value === undefined) return '<span class="front-matter-null">null</span>';
  if (value instanceof Date) return esc(value.toISOString());
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== 'object')) {
      return esc(value.map((v) => String(v)).join(', '));
    }
    return `<ol>${value.map((v) => `<li>${renderValue(v, esc)}</li>`).join('')}</ol>`;
  }
  if (typeof value === 'object') {
    const rows = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${renderValue(v, esc)}</td></tr>`)
      .join('');
    return `<table><tbody>${rows}</tbody></table>`;
  }
  return esc(String(value));
}
