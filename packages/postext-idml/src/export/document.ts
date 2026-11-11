// The document around the pages: how they pair into spreads, the
// sections that give them their folios, and the hyperlinks of the text.

import { escapeXml } from '../xml/write.js';
import { attr } from './parts.js';
import type { Writer } from './writer.js';

const ROMAN: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];

function fromRoman(s: string): number | undefined {
  const v: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const a = v[s[i]!];
    const b = v[s[i + 1] ?? ''];
    if (!a) return undefined;
    total += b && b > a ? -a : a;
  }
  // Only what writes back the same is a roman numeral (`mix` is, `iiii` is not).
  let n = total;
  let back = '';
  for (const [value, mark] of ROMAN) {
    while (n >= value) {
      back += mark;
      n -= value;
    }
  }
  return total > 0 && back === s ? total : undefined;
}

export type FolioStyle = 'Arabic' | 'LowerRoman' | 'UpperRoman';

/** A folio as a number in a numbering style, when it is one. */
export function readFolio(label: string | undefined): { style: FolioStyle; n: number } | undefined {
  const s = (label ?? '').trim();
  if (/^[0-9]{1,6}$/.test(s)) return { style: 'Arabic', n: Number(s) };
  if (/^[ivxlcdm]{1,15}$/.test(s)) {
    const n = fromRoman(s);
    return n ? { style: 'LowerRoman', n } : undefined;
  }
  if (/^[IVXLCDM]{1,15}$/.test(s)) {
    const n = fromRoman(s.toLowerCase());
    return n ? { style: 'UpperRoman', n } : undefined;
  }
  return undefined;
}

/** The sections that make InDesign number the pages as Postext did: a
 *  new one wherever the folio's style changes or its number does not
 *  follow the page before. A page with no folio (a cover, a plate) goes on
 *  counting. */
export function sectionsXml(w: Writer, pages: { self: string; label?: string }[]): string {
  const starts: { at: number; style: FolioStyle; n: number }[] = [];
  let expect: { style: FolioStyle; n: number } | undefined;
  pages.forEach((p, i) => {
    const f = readFolio(p.label);
    if (expect) expect = { ...expect, n: expect.n + 1 };
    if (f && (!expect || f.style !== expect.style || f.n !== expect.n)) {
      // The run starts where its count does: pages with no folio before
      // it that count up to it belong to it.
      let at = i;
      let n = f.n;
      const floor = starts.length ? starts[starts.length - 1]!.at + 1 : 0;
      while (!expect && at > floor && n > 1 && !readFolio(pages[at - 1]!.label)) {
        at--;
        n--;
      }
      starts.push({ at, style: f.style, n });
      expect = f;
    }
  });
  if (!starts.length || starts[0]!.at > 0) starts.unshift({ at: 0, style: 'Arabic', n: 1 });
  return starts
    .map((s, i) => {
      const length = (starts[i + 1]?.at ?? pages.length) - s.at;
      return (
        `<Section${attr('Self', w.next())}${attr('Length', length)} Name="" ContinueNumbering="false" IncludeSectionPrefix="false"${attr('PageNumberStart', s.n)} Marker=""${attr('PageStart', pages[s.at]!.self)} SectionPrefix="">` +
        `<Properties><PageNumberStyle type="enumeration">${s.style}</PageNumberStyle></Properties></Section>`
      );
    })
    .join('');
}

/** The hyperlinks the stories hold: each text source with its
 *  destination, a web address or a page of the document. */
export function linksXml(w: Writer, pageSelfs: string[]): string {
  const urls = new Map<string, { self: string; key: number }>();
  const pages = new Map<number, { self: string; key: number }>();
  let key = 0;
  let out = '';
  const links: string[] = [];
  w.links.forEach((l, i) => {
    let dest: { self: string; key: number } | undefined;
    if (l.url !== undefined) {
      dest = urls.get(l.url);
      if (!dest) {
        dest = { self: `HyperlinkURLDestination/URL ${urls.size + 1}`, key: ++key };
        urls.set(l.url, dest);
        out += `<HyperlinkURLDestination${attr('Self', dest.self)}${attr('Name', `URL ${urls.size}`)}${attr('DestinationURL', l.url)} Hidden="true"${attr('DestinationUniqueKey', dest.key)}/>`;
      }
    } else if (l.page !== undefined && pageSelfs[l.page]) {
      dest = pages.get(l.page);
      if (!dest) {
        dest = { self: `HyperlinkPageDestination/Page ${l.page + 1}`, key: ++key };
        pages.set(l.page, dest);
        out += `<HyperlinkPageDestination${attr('Self', dest.self)}${attr('Name', `Page ${l.page + 1}`)} NameManually="true"${attr('DestinationPage', pageSelfs[l.page])} ViewSetting="Fit" ViewPercentage="100" Hidden="false"${attr('DestinationUniqueKey', dest.key)}/>`;
      }
    }
    if (!dest) return;
    links.push(
      `<Hyperlink${attr('Self', w.next())}${attr('Name', `Link ${i + 1}`)}${attr('Source', l.source)} Visible="false" Highlight="None" Width="Thin" BorderStyle="Solid" Hidden="false"${attr('DestinationUniqueKey', dest.key)}>` +
        `<Properties><BorderColor type="enumeration">Black</BorderColor><Destination type="object">${escapeXml(dest.self)}</Destination></Properties></Hyperlink>`,
    );
  });
  return out + links.join('');
}
