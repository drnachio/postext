import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../index';
import type { PostextConfig } from '../../types';
import type { VDTDocument } from '../../vdt';
import { installSizedStub } from '../vertical/stub';

// The word joiner U+2060 glues in Chinese text too, as the docs say it does
// (found on Nº 086: a line still ended on a sense number ① with a joiner
// after it, and 《說文》 still broke after 說). The stub measures a Han
// character 1 em (20 px), ① ½ em.
installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (chars: number): PostextConfig => ({
  locale: 'zh-Hant',
  page: { width: pt(chars * 20 + 40), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(30), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
});
const linesOf = (doc: VDTDocument): string[] =>
  doc.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines.map((l) => l.text));
const WJ = '⁠';

describe('word joiner in Chinese text', () => {
  it('keeps two characters on one line', () => {
    // Seven characters to the line: 也 ends the first, 作 opens the second
    // (and 歷 goes down to 過, which would end the paragraph alone: 孤字).
    expect(linesOf(buildDocument({ markdown: '此開卷第一回也作者自云因曾歷過' }, config(7))))
      .toEqual(['此開卷第一回也', '作者自云因曾', '歷過']);
    const glued = linesOf(buildDocument({ markdown: `此開卷第一回也${WJ}作者自云因曾歷過` }, config(7)));
    expect(glued).toEqual(['此開卷第一回', '也作者自云因曾', '歷過']);
  });

  it('keeps a two-character title whole', () => {
    // Under `cjk.titleMinChars: 1`: the title rule (#637) keeps it whole
    // by default.
    const md = (t: string) => `甲乙丙丁戊己《${t}》說也。`;
    const loose = { ...config(8), cjk: { titleMinChars: 1 } };
    expect(linesOf(buildDocument({ markdown: md('說文') }, loose))[0]).toBe('甲乙丙丁戊己《說');
    expect(linesOf(buildDocument({ markdown: md(`說${WJ}文`) }, loose))[0]).toBe('甲乙丙丁戊己');
    expect(linesOf(buildDocument({ markdown: md('說文') }, config(8)))[0]).toBe('甲乙丙丁戊己');
  });

  it('keeps a bold sense number with the character after it, across the span', () => {
    // ① is half an em: 此開卷第一回 and ① fill 6.5 of the 7 ems, and the
    // line broke after the number while circled numbers were Western
    // letters (`cjk.circledNumbers: 'western'`, as up to 1.24); #637 keeps
    // them off a line end without the joiner.
    const western = { ...config(7), cjk: { circledNumbers: 'western' as const } };
    const plain = linesOf(buildDocument({ markdown: '此開卷第一回**①**作者自云' }, western));
    expect(plain[0]).toBe('此開卷第一回①');
    for (const md of [`此開卷第一回**①**${WJ}作者自云`, `此開卷第一回**①${WJ}**作者自云`]) {
      expect(linesOf(buildDocument({ markdown: md }, western))).toEqual(['此開卷第一回', '①作者自云']);
      expect(linesOf(buildDocument({ markdown: md }, config(7)))).toEqual(['此開卷第一回', '①作者自云']);
    }
    expect(linesOf(buildDocument({ markdown: '此開卷第一回**①**作者自云' }, config(7)))).toEqual(['此開卷第一回', '①作者自云']);
  });

  it('a space after the joiner still breaks', () => {
    expect(linesOf(buildDocument({ markdown: `此開卷第一回${WJ} 作者自云因曾歷過` }, config(7)))[0]).toBe('此開卷第一回');
  });
});
