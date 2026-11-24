import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import type { FileReference, MarkdownPlugin, RenderEnv } from '../types.js';

export interface FileReferenceOptions {
  /**
   * Turn a reference into a link URL. Return `null`/`undefined` to leave the
   * text as plain text (e.g. the file doesn't exist). By default the path
   * itself is used as the URL.
   */
  resolve?: (ref: FileReference) => string | null | undefined;
}

/**
 * Links file paths such as `src/app.ts`, `./lib/util.js:42` or
 * `/etc/hosts.conf:3:7`, both in text and as whole inline code spans.
 * Links carry `class="file-ref"` and `data-file-path`, `data-file-line`,
 * `data-file-column` so your app can handle clicks. Every reference found is
 * also returned as `result.fileReferences`.
 *
 * To avoid false positives, a match needs a file extension and either a `/`
 * in the path or a line number, so "Node.js" or "e.g." are left alone.
 */
export function fileReferences(options: FileReferenceOptions = {}): MarkdownPlugin {
  const resolve = options.resolve ?? ((ref: FileReference) => ref.path);
  return {
    name: 'file-references',
    extend(md) {
      md.core.ruler.after('linkify', 'file_references', (state: StateCore) => {
        const env = state.env as Partial<RenderEnv> & { fileReferences?: FileReference[] };
        const found = (env.fileReferences ??= []);
        for (const token of state.tokens) {
          if (token.type === 'inline' && token.children) {
            token.children = linkChildren(state, token.children, resolve, found);
          }
        }
      });
    },
  };
}

const REF =
  /(?<![\w./~@+-])((?:~|\.{1,2})?\/?(?:[\w.@+-]+\/)*[\w@+-][\w.@+-]*\.[A-Za-z][A-Za-z0-9]{0,9})(?::(\d+)(?::(\d+))?)?(?![\w/])/g;

interface Match {
  index: number;
  length: number;
  ref: FileReference;
}

/** Find file references in a string. */
export function findFileReferences(text: string): Match[] {
  const out: Match[] = [];
  for (const m of text.matchAll(REF)) {
    const path = m[1]!;
    const line = m[2] ? Number(m[2]) : undefined;
    const column = m[3] ? Number(m[3]) : undefined;
    if (!path.includes('/') && line === undefined) continue;
    const ref: FileReference = { path };
    if (line !== undefined) ref.line = line;
    if (column !== undefined) ref.column = column;
    out.push({ index: m.index, length: m[0].length, ref });
  }
  return out;
}

function linkChildren(
  state: StateCore,
  children: Token[],
  resolve: (ref: FileReference) => string | null | undefined,
  found: FileReference[],
): Token[] {
  const out: Token[] = [];
  let linkDepth = 0;

  const makeLink = (ref: FileReference, href: string, level: number): [Token, Token] => {
    const open = new state.Token('link_open', 'a', 1);
    open.attrs = [
      ['href', href],
      ['class', 'file-ref'],
      ['data-file-path', ref.path],
    ];
    if (ref.line !== undefined) open.attrPush(['data-file-line', String(ref.line)]);
    if (ref.column !== undefined) open.attrPush(['data-file-column', String(ref.column)]);
    open.level = level;
    open.markup = 'file-ref';
    const close = new state.Token('link_close', 'a', -1);
    close.level = level;
    close.markup = 'file-ref';
    return [open, close];
  };

  for (const child of children) {
    if (child.type === 'link_open') linkDepth++;
    if (child.type === 'link_close') linkDepth--;
    if (linkDepth > 0) {
      out.push(child);
      continue;
    }

    if (child.type === 'code_inline') {
      const [match] = findFileReferences(child.content);
      const whole = match && match.index === 0 && match.length === child.content.length;
      const href = whole ? resolve(match.ref) : null;
      if (whole) found.push(match.ref);
      if (whole && href) {
        const [open, close] = makeLink(match.ref, href, child.level);
        child.level += 1;
        out.push(open, child, close);
      } else {
        out.push(child);
      }
      continue;
    }

    if (child.type !== 'text') {
      out.push(child);
      continue;
    }

    const matches = findFileReferences(child.content);
    if (matches.length === 0) {
      out.push(child);
      continue;
    }

    let last = 0;
    const pushText = (s: string) => {
      if (!s) return;
      const t = new state.Token('text', '', 0);
      t.content = s;
      t.level = child.level;
      out.push(t);
    };
    for (const m of matches) {
      found.push(m.ref);
      const href = resolve(m.ref);
      if (!href) continue;
      pushText(child.content.slice(last, m.index));
      const [open, close] = makeLink(m.ref, href, child.level);
      out.push(open);
      const label = new state.Token('text', '', 0);
      label.content = child.content.slice(m.index, m.index + m.length);
      label.level = child.level + 1;
      out.push(label, close);
      last = m.index + m.length;
    }
    pushText(child.content.slice(last));
  }
  return out;
}
