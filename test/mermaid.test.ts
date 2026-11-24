// @vitest-environment jsdom
import DOMPurify from 'dompurify';
import { describe, expect, it, vi } from 'vitest';
import { createRenderer, mermaid, type MermaidLike } from '../src/index.js';

function fakeMermaid(): MermaidLike & { initialize: ReturnType<typeof vi.fn> } {
  return {
    initialize: vi.fn(),
    render: vi.fn(async (_id: string, text: string) => {
      if (text.includes('broken')) throw new Error('Parse error on line 1');
      return { svg: `<svg data-src="${text.length}"></svg>` };
    }),
  };
}

describe('mermaid', () => {
  it('renders a placeholder, then SVG on hydrate', async () => {
    const fake = fakeMermaid();
    const load = vi.fn(async () => fake);
    const plugin = mermaid({ load });
    const r = createRenderer({ plugins: [plugin] });

    const { html } = r.render('```mermaid\ngraph TD; A-->B\n```\n\ntext');
    expect(html).toContain('<div data-source-lines="0-3" class="mermaid-diagram">');
    expect(html).toContain('<pre class="mermaid-source">graph TD; A--&gt;B\n</pre>');

    const root = document.createElement('div');
    root.innerHTML = html;
    await r.hydrate(root);

    const block = root.querySelector('.mermaid-diagram')!;
    expect(block.innerHTML).toContain('<svg');
    expect(block.getAttribute('data-mermaid-source')).toBe('graph TD; A-->B\n');
    expect(fake.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ startOnLoad: false, securityLevel: 'strict', theme: 'default' }),
    );

    // A second hydrate does nothing new.
    await r.hydrate(root);
    expect(fake.render).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);

    // rerender redraws with a new theme.
    await plugin.rerender(root, 'dark');
    expect(fake.render).toHaveBeenCalledTimes(2);
    expect(fake.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }));
  });

  it('does not load mermaid when there are no diagrams', async () => {
    const load = vi.fn(async () => fakeMermaid());
    const r = createRenderer({ plugins: [mermaid({ load })] });
    const root = document.createElement('div');
    root.innerHTML = r.render('no diagrams').html;
    await r.hydrate(root);
    expect(load).not.toHaveBeenCalled();
  });

  it('shows diagram errors in place', async () => {
    const r = createRenderer({ plugins: [mermaid({ load: async () => fakeMermaid() })] });
    const root = document.createElement('div');
    root.innerHTML = r.render('```mermaid\nbroken\n```').html;
    await r.hydrate(root);
    const block = root.querySelector('.mermaid-diagram')!;
    expect(block.classList.contains('mermaid-error')).toBe(true);
    expect(block.textContent).toContain('Parse error');
  });

  it('survives DOMPurify sanitizing', async () => {
    const purify = DOMPurify(window);
    const r = createRenderer({
      html: true,
      sanitize: (h) => purify.sanitize(h),
      plugins: [mermaid({ load: async () => fakeMermaid() })],
    });
    const { html } = r.render('```mermaid\ngraph TD; A-->B\n```\n\n<img src=x onerror="alert(1)">');
    expect(html).not.toContain('onerror');
    const root = document.createElement('div');
    root.innerHTML = html;
    await r.hydrate(root);
    expect(root.querySelector('.mermaid-diagram svg')).not.toBeNull();
  });
});
