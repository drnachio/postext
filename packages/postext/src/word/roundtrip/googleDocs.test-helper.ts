// What Google Docs does to a .docx it opens and saves again, done to a
// file the flow writer wrote (#1458). Each step is something measured on
// two real files (the Spanish guide, both designs, uploaded to Google
// Docs and downloaded as .docx with no edit):
//
// - every custom XML part goes, and the export map with it; of the
//   document properties only docProps/custom.xml stays;
// - content controls are unwrapped;
// - paragraph and character styles go, but for the headings (`Heading1`…):
//   what a style gave is written on each run (`w:b w:val="1"`, the face);
// - text a style or a run set in capitals (`w:caps`) is typed in capitals;
// - hidden text (`w:vanish`) is left out;
// - a bookmark that starts where its paragraph starts has its start
//   written between the paragraphs, with `w:colFirst`/`w:colLast`; one
//   that starts further in stays where it was; every end stays;
// - index entries (XE) go and an index (INDEX) becomes plain paragraphs;
//   the contents list stays a field, Google's own (`toc: 'plain'` is an
//   editor that turns it into plain paragraphs too, which neither file
//   showed);
// - every bookmark keeps its name, and Google adds bookmarks of its own.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { decodeEntities, escapeXml, parseXml } from '../xml.js';
import { LOOK_CAPS, LOOK_HIDDEN, styleLooks, type StyleLooks } from './looks.js';

const KEPT_STYLE = /^(?:Heading[1-6]|Title|Subtitle)$/;

/** The run properties Google Docs writes for a look: all of them, on or
 *  off, on every run. */
function directProps(look: string): string {
  const on = (l: string): string => (look.includes(l) ? '1' : '0');
  const face = look.includes('k') ? 'Roboto Mono' : 'Arial';
  const raised = look.includes('p') ? 'superscript' : look.includes('s') ? 'subscript' : 'baseline';
  return (
    `<w:rPr><w:rFonts w:ascii="${face}" w:cs="${face}" w:eastAsia="${face}" w:hAnsi="${face}"/>` +
    `<w:b w:val="${on('b')}"/><w:bCs w:val="${on('b')}"/><w:i w:val="${on('i')}"/><w:iCs w:val="${on('i')}"/>` +
    `<w:smallCaps w:val="${on('c')}"/><w:strike w:val="0"/><w:color w:val="000000"/><w:sz w:val="22"/><w:szCs w:val="22"/>` +
    `<w:u w:val="none"/><w:vertAlign w:val="${raised}"/><w:rtl w:val="0"/></w:rPr>`
  );
}

function flattenRuns(paragraph: string, pStyle: string | undefined, looks: StyleLooks): string {
  return paragraph.replace(/<w:r>(<w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr>)?((?:(?!<\/w:r>).)*)<\/w:r>/gs, (_all, rPr: string | undefined, inner: string) => {
    const look = looks.look(pStyle, rPr ? parseXml(rPr) : undefined);
    if (look.includes(LOOK_HIDDEN)) return '';
    const body = look.includes(LOOK_CAPS) ? inner.replace(/(<w:t(?: [^>]*)?>)([^<]*)/g, (_m, open: string, text: string) => open + escapeXml(decodeEntities(text).toUpperCase())) : inner;
    return `<w:r w:rsidDel="00000000" w:rsidR="00000000" w:rsidRPr="00000000">${directProps(look)}${body}</w:r>`;
  });
}

let own = 0;

function flatten(xml: string, looks: StyleLooks, toc: 'field' | 'plain'): string {
  let out = xml;
  // Content controls unwrapped.
  out = out.replace(/<w:sdtPr>(?:(?!<\/w:sdtPr>).)*<\/w:sdtPr>|<\/?w:sdt>|<\/?w:sdtContent>|<w:sdtEndPr\/>/gs, '');
  // Index entries gone; an index as the text it showed, and with `toc:
  // 'plain'` the contents list too.
  const R = '<w:r>(?:<w:rPr>(?:(?!<\\/w:rPr>).)*<\\/w:rPr>)?';
  out = out.replace(new RegExp(`${R}<w:fldChar w:fldCharType="begin"\\/><\\/w:r>${R}<w:instrText[^>]*>\\s*XE [^<]*<\\/w:instrText><\\/w:r>${R}<w:fldChar w:fldCharType="end"\\/><\\/w:r>`, 'gs'), '');
  const open: boolean[] = [];
  out = out.replace(
    new RegExp(`(${R}<w:fldChar w:fldCharType="begin"\\/><\\/w:r>)(${R}<w:instrText[^>]*>([^<]*)<\\/w:instrText><\\/w:r>)|${R}<w:fldChar w:fldCharType="(separate|end)"\\/><\\/w:r>`, 'gs'),
    (all: string, _begin: string | undefined, _instr: string | undefined, code: string | undefined, kind: string | undefined) => {
      if (code !== undefined) {
        const drop = toc === 'plain' || /^\s*INDEX\b/.test(code) || open.includes(true);
        open.push(drop);
        return drop ? '' : all;
      }
      const drop = kind === 'end' ? open.pop() : open[open.length - 1];
      return drop ? '' : all;
    },
  );
  // Paragraphs: styles written out on the runs, the properties cut down.
  out = out.replace(/<w:p>((?:(?!<w:p>|<w:p |<\/w:p>).)*)<\/w:p>/gs, (_all, inner: string) => {
    const pPr = /^<w:pPr>((?:(?!<\/w:pPr>).)*)<\/w:pPr>/s.exec(inner);
    const props = pPr?.[1] ?? '';
    const pStyle = /<w:pStyle w:val="([^"]*)"\/>/.exec(props)?.[1];
    const kept =
      (pStyle && KEPT_STYLE.test(pStyle) ? `<w:pStyle w:val="${pStyle}"/>` : '') +
      (/<w:numPr>(?:(?!<\/w:numPr>).)*<\/w:numPr>/s.exec(props)?.[0] ?? '') +
      `<w:rPr>${directProps(looks.look(pStyle, undefined)).slice('<w:rPr>'.length, -'</w:rPr>'.length)}</w:rPr>` +
      (/<w:sectPr(?:(?!<\/w:sectPr>).)*<\/w:sectPr>|<w:sectPr\/>/s.exec(props)?.[0] ?? '');
    const shown = inner.slice(pPr?.[0].length ?? 0);
    let rest = flattenRuns(shown, pStyle, looks);
    // A bookmark left with no text at all (its text was hidden) goes too.
    if (shown.includes('<w:vanish/>')) rest = rest.replace(/<w:bookmarkStart w:id="(\d+)" w:name="_ptx_[^"]*"\/><w:bookmarkEnd w:id="\1"\/>/g, '');
    // A bookmark of ours that starts with the paragraph: its start goes
    // between the paragraphs.
    let hoisted = '';
    const lead = /^((?:<w:bookmarkStart [^>]*\/><w:bookmarkEnd [^>]*\/>)*)<w:bookmarkStart w:id="(\d+)" w:name="(_ptx_[^"]*)"\/>/.exec(rest);
    if (lead) {
      hoisted = `<w:bookmarkStart w:colFirst="0" w:colLast="0" w:name="${lead[3]}" w:id="${lead[2]}"/>`;
      // Google's own bookmark on the paragraph.
      const mine = 900000 + own++;
      rest = `<w:bookmarkStart w:colFirst="0" w:colLast="0" w:name="_g${mine.toString(36)}x" w:id="${mine}"/><w:bookmarkEnd w:id="${mine}"/>${lead[1]}${rest.slice(lead[0].length)}`;
    }
    rest = rest.replace(/<w:bookmarkStart w:id="(\d+)" w:name="([^"]*)"\/>/g, '<w:bookmarkStart w:colFirst="0" w:colLast="0" w:name="$2" w:id="$1"/>');
    return `${hoisted}<w:p w:rsidR="00000000" w:rsidDel="00000000" w:rsidP="00000000" w:rsidRDefault="00000000" w:rsidRPr="00000000"><w:pPr>${kept}</w:pPr>${rest}</w:p>`;
  });
  return out;
}

export interface GoogleDocsOptions {
  /** `field` (default, as measured): the contents list stays a field;
   *  `plain`: it comes back as plain paragraphs, like the index. */
  toc?: 'field' | 'plain';
  /** Leave out the properties written since #1458 (design, digest,
   *  chapters): a file exported before them. */
  oldProps?: boolean;
}

/** `bytes`, a file the flow writer wrote, as Google Docs saves it. */
export function savedByGoogleDocs(bytes: Uint8Array, options: GoogleDocsOptions = {}): Uint8Array {
  const files = unzipSync(bytes);
  const out: Record<string, Uint8Array> = {};
  const looks = styleLooks(parseXml(strFromU8(files['word/styles.xml']!)));
  for (const [path, data] of Object.entries(files)) {
    if (path.startsWith('customXml/') || path === 'docProps/app.xml' || path === 'docProps/core.xml') continue;
    if (path === 'word/document.xml' || path === 'word/footnotes.xml') out[path] = strToU8(flatten(strFromU8(data), looks, options.toc ?? 'field'));
    else if (path === 'word/styles.xml') {
      // Google's own styles: the headings by name, nothing of the book's.
      const heads = [1, 2, 3, 4, 5, 6].map((n) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b w:val="1"/></w:rPr></w:style>`).join('');
      out[path] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="normal"/></w:style>${heads}</w:styles>`);
    } else if (path === 'docProps/custom.xml' && options.oldProps) {
      out[path] = strToU8(strFromU8(data).replace(/<property [^>]*name="postext\.(?:design|digest|chapters[^"]*)"[^>]*>(?:(?!<\/property>).)*<\/property>/gs, ''));
    } else out[path] = data;
  }
  return zipSync(out);
}

/** Change a part of a .docx as an edit made in the editor would. */
export function editPart(bytes: Uint8Array, path: string, edit: (xml: string) => string): Uint8Array {
  const files = { ...unzipSync(bytes) };
  files[path] = strToU8(edit(strFromU8(files[path]!)));
  return zipSync(files);
}
