/** Deterministic, size-aware text measurement for the vertical-writing
 *  tests: CJK characters and fullwidth forms 1 em, a space ¼ em, anything
 *  else ½ em, at the size the font string names. The ideograph's ink box
 *  (`actualBoundingBox*`) is the Noto CJK em box: 0.88 em up, 0.12 em
 *  down, so the measured central baseline is 0.38 em. */
const SIZE_RE = /(\d*\.?\d+)px/;

export function stubCharWidth(ch: string, em: number): number {
  const cp = ch.codePointAt(0)!;
  if (ch === ' ') return em / 4;
  return cp >= 0x2e80 || (cp >= 0x2010 && cp <= 0x2027) ? em : em / 2;
}

export class SizedStubCtx {
  font = '10px Test';
  letterSpacing = '0px';
  measureText(s: string): TextMetrics {
    const em = Number(SIZE_RE.exec(this.font)?.[1] ?? 10);
    let w = 0;
    for (const ch of s) w += stubCharWidth(ch, em);
    return {
      width: w,
      actualBoundingBoxAscent: em * 0.8,
      actualBoundingBoxDescent: em * 0.04,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: w,
    } as TextMetrics;
  }
}

export function installSizedStub(): void {
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    getContext(): SizedStubCtx {
      return new SizedStubCtx();
    }
  };
}
