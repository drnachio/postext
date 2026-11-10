// Equations an editor wrote out again (#1458): what LibreOffice 26.8 gave
// back for equations nobody touched, against their source.

import { describe, expect, it } from 'vitest';
import { looseTex } from './looseTex.js';
import { mathUnchanged } from './math.js';
import { ommlToTex } from '../omml.js';
import { parseXml } from '../xml.js';

const SAME: [string, string][] = [
  ['T_0 = 2\\pi\\sqrt{L/g}', 'T_{0}=2π\\sqrt{L/g}'],
  ['T_0 = 2\\pi\\sqrt{\\frac{L}{g}} \\, .', 'T_{0}=2π\\sqrt{\\frac{L}{g}}.'],
  ['-mgL\\sin\\theta', '−mgL\\sinθ'],
  ['\\ddot\\theta + \\frac{g}{L}\\,\\sin\\theta = 0 .', '\\ddot{θ}+\\frac{g}{L}\\sinθ=0.'],
  ['T_0 = 2\\pi/\\omega_0', 'T_{0}=2π/{ω_{0}}'],
  ['\\tfrac{1}{2}\\,L\\,\\dot\\theta^{2} = g\\,(\\cos\\theta - \\cos\\theta_0) .', '\\frac{1}{2}L{\\dot{θ}}^{2}=g(\\cosθ−\\cosθ_{0}).'],
  ['k = \\sin(\\theta_0/2)', 'k=\\sin({θ_{0}}/2)'],
  ['T = 4\\sqrt{\\frac{L}{g}}\\;K(k) .', 'T=4\\sqrt{\\frac{L}{g}}K(k).'],
  ['T = \\frac{T_0}{M\\bigl(1,\\,\\cos(\\theta_0/2)\\bigr)} .', 'T=\\frac{T_{0}}{M\\left(1,\\cos({θ_{0}}/2)\\right)}.'],
  ['173\\,\\theta_0^6/737\\,280', '173{θ_{0}^{6}}/{737}280'],
  ['L\\,(1 + \\tfrac{2}{5}\\,r^2/L^2)', 'L(1+\\frac{2}{5}{r^{2}}/{L^{2}})'],
  ['|x| = \\begin{cases} x & \\text{si } x \\ge 0 \\\\ -x & \\text{si } x < 0 \\end{cases}', '|x|=\\left\\{\\begin{matrix}x & \\text{si }x≥0 \\\\ −x & \\text{si }x<0\\end{matrix}\\right.'],
];

describe('equations an editor wrote out again', () => {
  it.each(SAME)('reads %s as unchanged', (source, read) => {
    expect(looseTex(read)).toBe(looseTex(source));
    expect(mathUnchanged(`$${source}$`, read)).toBe(true);
  });

  it('still tells a changed equation', () => {
    expect(mathUnchanged('$x^{2n}$', 'x^{2}n')).toBe(false);
    expect(mathUnchanged('$a+b$', 'a-b')).toBe(false);
    expect(mathUnchanged('$\\dot\\theta$', '\\ddot{θ}')).toBe(false);
    expect(mathUnchanged('$\\frac{a}{b}$', '\\frac{b}{a}')).toBe(false);
    expect(mathUnchanged('${a+b}^2$', 'a+b^2')).toBe(false);
  });

  it('reads the accents LibreOffice saves as spacing characters', () => {
    const acc = (chr: string): string => ommlToTex(parseXml(`<m:oMath><m:acc><m:accPr><m:chr m:val="${chr}"/></m:accPr><m:e><m:r><m:t>θ</m:t></m:r></m:e></m:acc></m:oMath>`));
    expect(acc('¨')).toBe('\\ddot{θ}');
    expect(acc('˙')).toBe('\\dot{θ}');
    expect(acc('̈')).toBe('\\ddot{θ}');
    // An accent with no command is set as it is, never as another accent.
    expect(acc('⌒')).toBe('\\overset{⌒}{θ}');
  });
});
