import katex, { type KatexOptions } from 'katex';
import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import type { MarkdownPlugin } from '../types.js';

export interface MathOptions {
  /**
   * Also accept LaTeX-style delimiters: `\( … \)` inline and `\[ … \]` as a
   * block on its own lines. Default true. Dollar delimiters (`$…$`, `$$…$$`)
   * and ```` ```math ```` fences are always on.
   */
  latexDelimiters?: boolean;
  /**
   * Options passed to KaTeX. Defaults: `throwOnError: false`, `output: 'html'`,
   * `trust: false`, `strict: 'ignore'`.
   */
  katex?: KatexOptions;
}

/**
 * TeX math rendered with KaTeX at render time (no browser step needed).
 * Include `katex/dist/katex.min.css` in your page.
 */
export function math(options: MathOptions = {}): MarkdownPlugin {
  const latex = options.latexDelimiters ?? true;
  const katexOptions: KatexOptions = {
    throwOnError: false,
    output: 'html',
    trust: false,
    strict: 'ignore',
    ...options.katex,
  };
  const toHtml = (tex: string, displayMode: boolean) =>
    katex.renderToString(tex, { ...katexOptions, displayMode });

  return {
    name: 'math',
    extend(md) {
      md.inline.ruler.before('escape', 'math_inline', (state, silent) =>
        mathInline(state, silent, latex),
      );
      md.block.ruler.before('fence', 'math_block', (state, start, end, silent) =>
        mathBlock(state, start, end, silent, latex),
        { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
      );

      md.renderer.rules.math_inline = (tokens, idx) => {
        const token = tokens[idx]!;
        const display = token.meta?.display === true;
        return `<span class="${display ? 'math-display' : 'math-inline'}">${toHtml(token.content, display)}</span>`;
      };
      md.renderer.rules.math_block = (tokens, idx, _opts, _env, self) => {
        const token = tokens[idx]!;
        token.attrJoin('class', 'math-block');
        return `<div${self.renderAttrs(token)}>${toHtml(token.content, true)}</div>\n`;
      };

      // ```math fences, as GitHub supports.
      const fence = md.renderer.rules.fence!;
      md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
        const token = tokens[idx]!;
        if (token.info.trim().toLowerCase() !== 'math') return fence(tokens, idx, opts, env, self);
        token.attrJoin('class', 'math-block');
        return `<div${self.renderAttrs(token)}>${toHtml(token.content, true)}</div>\n`;
      };
    },
  };
}

const DOLLAR = 0x24;
const BACKSLASH = 0x5c;

function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a;
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

/**
 * `$…$`, `$$…$$` (display) and, optionally, `\(…\)`.
 * Single-dollar math follows the Pandoc rule: the opening `$` must not be
 * followed by a space, the closing `$` must not be preceded by a space or
 * followed by a digit. This keeps "costs $5 and $10" as plain text.
 */
function mathInline(state: StateInline, silent: boolean, latex: boolean): boolean {
  const { src, pos: start, posMax: max } = state;
  let open: string;
  let close: string;
  let display = false;

  if (latex && src.startsWith('\\(', start)) {
    open = '\\(';
    close = '\\)';
  } else if (src.charCodeAt(start) === DOLLAR) {
    if (src.charCodeAt(start + 1) === DOLLAR) {
      open = close = '$$';
      display = true;
    } else {
      open = close = '$';
      const next = src.charCodeAt(start + 1);
      if (start + 1 >= max || isSpace(next)) return false;
    }
  } else {
    return false;
  }

  const contentStart = start + open.length;
  let end = contentStart;
  for (;;) {
    end = src.indexOf(close, end);
    if (end === -1 || end + close.length > max) return false;
    if (src.charCodeAt(end - 1) === BACKSLASH && close !== '\\)') {
      end += 1; // escaped \$
      continue;
    }
    if (close === '$' && (isSpace(src.charCodeAt(end - 1)) || isDigit(src.charCodeAt(end + 1)))) {
      end += 1;
      continue;
    }
    break;
  }
  if (end === contentStart) return false;

  if (!silent) {
    const token: Token = state.push('math_inline', 'math', 0);
    token.content = src.slice(contentStart, end);
    token.markup = open;
    token.meta = { display };
  }
  state.pos = end + close.length;
  return true;
}

/** `$$ … $$` and, optionally, `\[ … \]`, starting at the beginning of a line. */
function mathBlock(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
  latex: boolean,
): boolean {
  if (state.sCount[startLine]! - state.blkIndent >= 4) return false;

  const lineText = (line: number) =>
    state.src.slice(state.bMarks[line]! + state.tShift[line]!, state.eMarks[line]!);

  const first = lineText(startLine);
  let open: string;
  let close: string;
  if (first.startsWith('$$')) {
    open = close = '$$';
  } else if (latex && first.startsWith('\\[')) {
    open = '\\[';
    close = '\\]';
  } else {
    return false;
  }

  const afterOpen = first.slice(open.length).trimEnd();
  let content: string;
  let lastLine = startLine;

  if (afterOpen.endsWith(close) && afterOpen.length >= close.length) {
    // One-line form: $$ x^2 $$
    content = afterOpen.slice(0, -close.length);
    if (content.trim() === '') return false;
  } else {
    let found = false;
    for (let line = startLine + 1; line < endLine; line++) {
      const text = lineText(line).trimEnd();
      // A line indented less than the block's content ends it (e.g. a list item).
      if (text !== '' && state.sCount[line]! < state.blkIndent) break;
      if (text.endsWith(close)) {
        lastLine = line;
        found = true;
        break;
      }
    }
    if (!found) return false;
    const middle = state.getLines(startLine + 1, lastLine, state.blkIndent, false);
    const tail = lineText(lastLine).trimEnd().slice(0, -close.length);
    content = [afterOpen, middle.replace(/\n$/, ''), tail].filter((s) => s.trim() !== '').join('\n');
  }

  if (silent) return true;

  state.line = lastLine + 1;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = content.trim();
  token.markup = open;
  token.map = [startLine, state.line];
  return true;
}
