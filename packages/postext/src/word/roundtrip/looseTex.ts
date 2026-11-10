// A spelling of TeX for telling whether an editor that wrote an equation
// out again changed it (#1458). LibreOffice reads Word's equations into
// its own model and saves them back differently: no thin spaces, a group
// round each side of a slash, `\left(` for `\bigl(`, the letter π for
// `\pi`. None of that is an edit. Two equations with the same loose
// spelling are the same equation; the spelling itself is never written
// into a book.

/** Arguments a command takes (the commands the OMML reader writes, and
 *  the common ones a source uses). Any other command takes none. */
const ARITY: Record<string, number> = {
  frac: 2, binom: 2, overset: 2, underset: 2, stackrel: 2, genfrac: 6,
  sqrt: 1, text: 1, operatorname: 1, mathrm: 1, mathbf: 1, mathit: 1, mathbb: 1, mathcal: 1, mathsf: 1, mathtt: 1, boldsymbol: 1, textbf: 1, textit: 1,
  hat: 1, tilde: 1, dot: 1, ddot: 1, dddot: 1, bar: 1, vec: 1, acute: 1, grave: 1, breve: 1, check: 1,
  overline: 1, underline: 1, overbrace: 1, underbrace: 1, begin: 1, end: 1, tag: 1,
};

/** Commands that only space or size what is around them. */
const DROPPED = new Set(['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'biggl', 'biggr', 'Biggl', 'Biggr', 'bigm', 'Bigm', 'quad', 'qquad', 'limits', 'nolimits', 'displaystyle', 'textstyle', 'scriptstyle', 'nobreak', 'allowbreak']);

const SAME: Record<string, string> = { dfrac: 'frac', tfrac: 'frac', le: 'leq', ge: 'geq', ne: 'neq', to: 'rightarrow', gets: 'leftarrow', lvert: 'vert', rvert: 'vert', dots: 'ldots' };

/** Commands an OMML run holds as the character itself. */
const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ',
  pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  times: '×', cdot: '⋅', pm: '±', mp: '∓', leq: '≤', geq: '≥', neq: '≠', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', propto: '∝', infty: '∞', partial: '∂', nabla: '∇',
  rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔', in: '∈', notin: '∉', subset: '⊂', cup: '∪', cap: '∩', forall: '∀', exists: '∃',
  ldots: '…', cdots: '⋯', ell: 'ℓ', hbar: 'ℏ', degree: '°', prime: '′', circ: '∘', langle: '⟨', rangle: '⟩', vert: '|', mid: '|',
};

/** Characters that stand for the same thing as another. */
const CHARS: Record<string, string> = { '−': '-', '∗': '*', '∣': '|', '∶': ':', '⁄': '/', '·': '⋅', '∙': '⋅' };

const SPACE = /[\s~  -  ⁡-⁤]/;

/** Delimited matrices as a plain matrix between their fences, which is
 *  what a reader gives for Word's delimiter round a matrix. */
const FENCED: Record<string, [string, string]> = { pmatrix: ['(', ')'], bmatrix: ['[', ']'], vmatrix: ['|', '|'], Bmatrix: ['\\{', '\\}'], cases: ['\\{', '.'] };

/** Index just past the `}` that closes the `{` at `i` (the string's end
 *  when it never closes). */
function closing(s: string, i: number): number {
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === '\\') k++;
    else if (s[k] === '{') depth++;
    else if (s[k] === '}' && --depth === 0) return k + 1;
  }
  return s.length;
}

/** The tokens of `s`, groups kept only where they change the reading. */
function tokens(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  /** The next argument: a braced group's content, or one token. */
  const argument = (): string => {
    while (i < s.length && SPACE.test(s[i]!)) i++;
    if (s[i] === '{') {
      const end = closing(s, i);
      const inner = s.slice(i + 1, end - 1);
      i = end;
      return join(tokens(inner));
    }
    const start = i;
    if (s[i] === '\\') {
      i++;
      if (/[A-Za-z]/.test(s[i] ?? '')) while (i < s.length && /[A-Za-z]/.test(s[i]!)) i++;
      else i++;
    } else if (i < s.length) i += s.codePointAt(i)! > 0xffff ? 2 : 1;
    return join(tokens(s.slice(start, i)));
  };
  const single = (t: string): boolean => [...t].length === 1 || /^\\[A-Za-z]+$/.test(t);
  while (i < s.length) {
    const c = s[i]!;
    if (SPACE.test(c)) {
      i++;
    } else if (c === '\\') {
      const m = /^\\([A-Za-z]+)/.exec(s.slice(i, i + 40));
      if (!m) {
        // `\,` `\;` `\:` `\!` `\ ` are spaces; `\{` and the like stay.
        if (!',;:! '.includes(s[i + 1] ?? '')) out.push(s.slice(i, i + 2));
        i += 2;
        continue;
      }
      i += m[0].length;
      const name = SAME[m[1]!] ?? m[1]!;
      if (DROPPED.has(name)) continue;
      if (SYMBOLS[name]) {
        out.push(SYMBOLS[name]!);
        continue;
      }
      const arity = ARITY[name] ?? 0;
      if (name === 'begin' || name === 'end') {
        const env = argument();
        const fence = FENCED[env];
        if (!fence) out.push(`\\${name}{${env}}`);
        else if (name === 'begin') out.push(fence[0], '\\begin{matrix}');
        else out.push('\\end{matrix}', fence[1]);
        continue;
      }
      let t = `\\${name}`;
      if (name === 'sqrt' && s[i] === '[') {
        const end = s.indexOf(']', i);
        if (end > 0) {
          t += `[${join(tokens(s.slice(i + 1, end)))}]`;
          i = end + 1;
        }
      }
      for (let k = 0; k < arity; k++) t += `{${argument()}}`;
      out.push(t);
    } else if (c === '{') {
      const end = closing(s, i);
      const inner = tokens(s.slice(i + 1, end - 1));
      i = end;
      while (i < s.length && SPACE.test(s[i]!)) i++;
      // A group under a script holds the script's base together; one
      // token (a letter, an accent over its base) needs no group.
      if ((s[i] === '^' || s[i] === '_') && inner.length > 1) out.push(`{${join(inner)}}`);
      else out.push(...inner);
    } else if (c === '^' || c === '_') {
      i++;
      const a = argument();
      out.push(single(a) ? `${c}${a}` : `${c}{${a}}`);
    } else {
      const ch = String.fromCodePoint(s.codePointAt(i)!);
      i += ch.length;
      out.push(CHARS[ch] ?? ch);
    }
  }
  return out;
}

/** Tokens side by side, a command kept apart from a letter after it. */
function join(parts: readonly string[]): string {
  let out = '';
  for (const p of parts) {
    if (/\\[A-Za-z]+$/.test(out) && /^[A-Za-z]/.test(p)) out += ' ';
    out += p;
  }
  return out;
}

/** The loose spelling of `tex`. */
export function looseTex(tex: string): string {
  return join(tokens(tex));
}
