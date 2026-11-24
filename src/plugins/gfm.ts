import type MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import footnote from 'markdown-it-footnote';
import type { MarkdownPlugin, RenderEnv } from '../types.js';

export interface GfmOptions {
  /** `- [ ]` / `- [x]` checkboxes. Default true. */
  taskLists?: boolean;
  /**
   * Leave task checkboxes enabled so users can click them. Each checkbox gets
   * `data-task-line` (zero-based source line); pair with `toggleTask()`.
   * Default false (checkboxes are disabled).
   */
  interactiveTasks?: boolean;
  /** `> [!NOTE]`-style alert boxes. Default true. */
  alerts?: boolean;
  /** GitHub-style `id`s on headings, also collected into `headings`. Default true. */
  headingAnchors?: boolean;
  /** `[^1]` footnotes. Default true. */
  footnotes?: boolean;
}

export const ALERT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/**
 * GitHub Flavored Markdown extras on top of markdown-it's built-in tables and
 * strikethrough.
 */
export function gfm(options: GfmOptions = {}): MarkdownPlugin {
  const opts = {
    taskLists: true,
    interactiveTasks: false,
    alerts: true,
    headingAnchors: true,
    footnotes: true,
    ...options,
  };
  return {
    name: 'gfm',
    extend(md) {
      if (opts.alerts) addAlerts(md);
      if (opts.taskLists) addTaskLists(md, opts.interactiveTasks);
      addHeadings(md, opts.headingAnchors);
      // @types/markdown-it-footnote is typed against the CJS build of markdown-it.
      if (opts.footnotes) md.use(footnote as unknown as (md: MarkdownIt) => void);
    },
  };
}

// ---------------------------------------------------------------------------
// Alerts

const ALERT_MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|$)/i;

function addAlerts(md: MarkdownIt): void {
  // Runs after block parsing but before inline parsing, so the marker can be
  // removed from the paragraph's raw text.
  md.core.ruler.after('block', 'gfm_alerts', (state: StateCore) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const open = tokens[i]!;
      if (open.type !== 'blockquote_open') continue;
      const para = tokens[i + 1];
      const inline = tokens[i + 2];
      if (para?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;
      const match = ALERT_MARKER.exec(inline.content);
      if (!match) continue;

      const close = findClose(tokens, i, 'blockquote_close');
      if (close === -1) continue;

      const type = match[1]!.toLowerCase() as AlertType;
      const rest = inline.content.slice(match[0].length);

      open.tag = 'div';
      open.attrJoin('class', `markdown-alert markdown-alert-${type}`);
      tokens[close]!.tag = 'div';

      const title = new state.Token('html_block', '', 0);
      title.content = `<p class="markdown-alert-title">${capitalize(type)}</p>\n`;
      title.block = true;

      if (rest.trim() === '') {
        // The paragraph held only the marker; replace it with the title.
        tokens.splice(i + 1, 3, title);
      } else {
        inline.content = rest;
        tokens.splice(i + 1, 0, title);
      }
    }
  });
}

/** Index of the token closing `tokens[openIndex]`, matched by nesting level. */
function findClose(tokens: Token[], openIndex: number, closeType: string): number {
  const level = tokens[openIndex]!.level;
  for (let j = openIndex + 1; j < tokens.length; j++) {
    const t = tokens[j]!;
    if (t.type === closeType && t.level === level) return j;
  }
  return -1;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Task lists

const TASK_PREFIX = /^\[([ xX])\][ \t]/;

function addTaskLists(md: MarkdownIt, interactive: boolean): void {
  md.core.ruler.after('inline', 'gfm_task_lists', (state: StateCore) => {
    const tokens = state.tokens;
    const listStack: Token[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
        listStack.push(token);
        continue;
      }
      if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
        listStack.pop();
        continue;
      }
      if (token.type !== 'list_item_open') continue;

      // A task item's first child is a paragraph whose text starts with [ ] / [x].
      const para = tokens[i + 1];
      const inline = tokens[i + 2];
      if (para?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;
      const first = inline.children?.[0];
      if (!first || first.type !== 'text') continue;
      // `[ ]` alone (no trailing text) is also a task in GitHub.
      const text = first.content.length === 3 ? first.content + ' ' : first.content;
      const match = TASK_PREFIX.exec(text);
      if (!match) continue;

      const checked = match[1] !== ' ';
      first.content = text.slice(match[0].length);

      const line = token.map?.[0];
      const box = new state.Token('html_inline', '', 0);
      box.content =
        '<input type="checkbox" class="task-list-item-checkbox"' +
        (checked ? ' checked' : '') +
        (interactive ? '' : ' disabled') +
        (line !== undefined ? ` data-task-line="${line}"` : '') +
        '> ';
      inline.children!.unshift(box);

      token.attrJoin('class', 'task-list-item');
      const list = listStack[listStack.length - 1];
      if (list && !(list.attrGet('class') ?? '').includes('contains-task-list')) {
        list.attrJoin('class', 'contains-task-list');
      }
    }
  });
}

const TASK_LINE = /^(\s*(?:>\s*)*(?:[-+*]|\d{1,9}[.)])\s+\[)([ xX])\]/;

/**
 * Flip the checkbox of the task item on `line` (zero-based) and return the new
 * source. Returns the source unchanged if that line is not a task item.
 * Use the `data-task-line` attribute of a clicked checkbox as `line`.
 */
export function toggleTask(source: string, line: number): string {
  const lines = source.split('\n');
  const text = lines[line];
  if (text === undefined) return source;
  const match = TASK_LINE.exec(text);
  if (!match) return source;
  const prefix = match[1]!;
  const next = match[2] === ' ' ? 'x' : ' ';
  lines[line] = prefix + next + text.slice(prefix.length + 1);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Headings

function addHeadings(md: MarkdownIt, anchors: boolean): void {
  md.core.ruler.push('gfm_headings', (state: StateCore) => {
    const env = state.env as Partial<RenderEnv>;
    const headings = (env.headings ??= []);
    const seen = new Map<string, number>();

    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i]!;
      if (token.type !== 'heading_open') continue;
      const inline = state.tokens[i + 1];
      const text = inline ? plainText(inline) : '';
      let id = '';
      if (anchors) {
        const base = slugify(text);
        if (base) {
          const count = seen.get(base) ?? 0;
          seen.set(base, count + 1);
          id = count === 0 ? base : `${base}-${count}`;
          token.attrSet('id', id);
        }
      }
      headings.push({
        level: Number(token.tag.slice(1)),
        text,
        id,
        line: token.map?.[0] ?? -1,
      });
    }
  });
}

function plainText(inline: Token): string {
  let out = '';
  for (const child of inline.children ?? []) {
    if (child.type === 'text' || child.type === 'code_inline') out += child.content;
    else if (child.type === 'softbreak' || child.type === 'hardbreak') out += ' ';
    else if (child.type === 'image') out += plainText(child);
  }
  return out.trim();
}

/** GitHub-style heading slug: lowercase, punctuation removed, spaces to hyphens. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}
