import type MarkdownIt from 'markdown-it';

/** A heading collected while rendering, in document order. */
export interface Heading {
  /** 1–6 */
  level: number;
  /** Plain text of the heading. */
  text: string;
  /** The anchor id set on the heading element (empty when anchors are disabled). */
  id: string;
  /** Zero-based source line the heading starts on. */
  line: number;
}

/** A file reference such as `src/app.ts:42:7` found in the document text. */
export interface FileReference {
  path: string;
  line?: number;
  column?: number;
}

/**
 * Data collected while rendering one document. Plugins write to it through
 * markdown-it's `env` object; `render()` returns it alongside the HTML.
 */
export interface RenderEnv {
  /** Parsed YAML front matter, when the front-matter plugin is enabled and the document has some. */
  frontMatter?: unknown;
  /** Set when the front matter block exists but is not valid YAML. */
  frontMatterError?: string;
  /** Raw front matter text, without the `---` fences. */
  frontMatterRaw?: string;
  headings: Heading[];
  /** Any additional data a custom plugin wants to record. */
  [key: string]: unknown;
}

export interface RenderResult extends RenderEnv {
  html: string;
}

/**
 * A rendering plugin. `extend` runs once, synchronously, when the plugin is
 * added; it may add markdown-it rules. `hydrate` runs in the browser after the
 * HTML has been inserted into the page, for work that needs the DOM (Mermaid).
 */
export interface MarkdownPlugin {
  /** Unique name; adding two plugins with the same name throws. */
  name: string;
  extend(md: MarkdownIt): void;
  hydrate?(root: ParentNode): void | Promise<void>;
}

export type UrlKind = 'link' | 'image';

/**
 * Rewrites a link or image URL. Return a new URL, or `undefined` to leave it
 * unchanged. Use this to map relative paths to wherever your app serves files.
 */
export type UrlResolver = (url: string, kind: UrlKind) => string | undefined;
