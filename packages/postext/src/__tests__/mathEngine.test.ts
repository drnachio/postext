import { describe, it, expect, vi } from 'vitest';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { buildDocument } from '../pipeline';
import { initMathEngine, isMathReady } from '../math';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const engineWarnings = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter((call) => String(call[0]).includes('initMathEngine'));

// The math engine is a singleton per JS realm (this test file), so the
// order matters: the first tests lay out math before `initMathEngine`, the
// last one after it.
describe('math engine', () => {
  it('stays silent for a document without math', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      buildDocument({ markdown: 'Costs \\$5, no formulas here.' });
      expect(engineWarnings(warn)).toHaveLength(0);
    } finally {
      warn.mockRestore();
    }
  });

  it('warns once when math is laid out before initMathEngine, instead of silent grey boxes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const doc = buildDocument({ markdown: 'Euler: $e^{i\\pi}+1=0$.\n\n$$\\int_0^1 x^2\\,dx$$' });
      buildDocument({ markdown: 'Again: $x$.' });
      expect(isMathReady()).toBe(false);
      // Still laid out, with placeholders…
      const display = doc.blocks.find((b) => b.type === 'mathDisplay');
      expect(display?.mathRender?.paths).toHaveLength(0);
      // …but not silently.
      const calls = engineWarnings(warn);
      expect(calls).toHaveLength(1);
      expect(String(calls[0]![0])).toContain('placeholder');
    } finally {
      warn.mockRestore();
    }
  });

  it('renders formulas without registering anything in MathJax\'s global handler registry', async () => {
    await initMathEngine();
    expect(isMathReady()).toBe(true);
    // A registry entry is what breaks the engine when a CDN (esm.sh) serves
    // each mathjax-full subpath with a private copy of the registry, and it
    // would leak into a page that runs MathJax of its own.
    expect([...mathjax.handlers]).toHaveLength(0);
    const doc = buildDocument({ markdown: 'Inline $\\sqrt{x^2+y^2}$.\n\n$$\\frac{a}{b}$$' });
    const display = doc.blocks.find((b) => b.type === 'mathDisplay');
    expect(display?.mathRender?.error).toBeUndefined();
    expect(display?.mathRender?.paths.length).toBeGreaterThan(0);
    const inline = doc.blocks
      .filter((b) => b.type !== 'mathDisplay')
      .flatMap((b) => b.lines.flatMap((l) => l.segments ?? []))
      .filter((s) => s.kind === 'math');
    expect(inline).toHaveLength(1);
    expect(inline[0]!.mathRender?.paths.length).toBeGreaterThan(0);
  });
});
