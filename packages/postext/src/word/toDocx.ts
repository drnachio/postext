// Postext chapters → a `.docx` someone can edit in Word and send back. The
// import template is applied in reverse: headings, paragraph styles,
// callouts, quotes, lists, chips and footnotes become Word styles, numbering
// and notes; what Word cannot say (fences, directives, `:ref`, maths, front
// matter) is kept verbatim in the *Postext Markup* styles. The template
// travels inside the file, so the re-import maps every style back.

import { zipSync, strToU8 } from 'fflate';
import { type InlineRun, parseInline } from './inline.js';
import { MARKUP_STYLE, type WordTemplate } from './template.js';
import { TEMPLATE_XML_ROOT, TEMPLATE_XML_NS } from './docxRead.js';
import { escapeAttr, escapeXml } from './xml.js';
import { type Role, parseChapter, NOTE_DEF_RE } from './toDocx/parse.js';
import { Styles, type ExportChapter, type ExportSettings, DEFAULT_STYLE_NAMES } from './toDocx/styles.js';
import { Numbering, paragraphXml, textXml, type RunContext, runsXml, W_NS } from './toDocx/wordml.js';

export { DEFAULT_STYLE_NAMES } from './toDocx/styles.js';
export type { ExportChapter, WordStyleNames, ExportSettings } from './toDocx/styles.js';

function roleStyle(role: Role, styles: Styles): string {
  switch (role.kind) {
    case 'paragraphs':
      return styles.paragraphsStyle(role.style);
    case 'callout':
      return role.type ? styles.callout(role.type) : styles.body();
    case 'quote':
      return styles.quote();
    default:
      return styles.body();
  }
}

/** Build the `.docx` bytes for chapters. */
export function postextToDocx(chapters: readonly ExportChapter[], settings: ExportSettings): Uint8Array {
  const styles = new Styles(settings.template, settings.config, settings.names ?? DEFAULT_STYLE_NAMES);
  const numbering = new Numbering();
  const links = new Map<string, string>();
  const linkRel = (url: string): string => {
    let id = links.get(url);
    if (!id) {
      id = `rIdL${links.size + 1}`;
      links.set(url, id);
    }
    return id;
  };
  const footnotes: string[] = [];
  let body = '';
  const listRunBase = { n: 0 };

  chapters.forEach((chapter) => {
    if (settings.book) body += paragraphXml('PostextChapter', `<w:r>${textXml(chapter.title)}</w:r>`);
    const { blocks, notes } = parseChapter(chapter.markdown, listRunBase);
    const noteIds = new Map<string, number>();
    const pending = new Set<string>();
    const ctx: RunContext = { styles, noteIds, linkRel };
    const inline = (text: string, heading = false): InlineRun[] =>
      parseInline(text, {
        heading,
        notes: heading ? new Set() : new Set(notes.keys()),
        takeNote: (id) => {
          if (noteIds.has(id) || pending.has(id)) return false;
          pending.add(id);
          return true;
        },
      });
    const citeNotes = (runs: InlineRun[]): void => {
      for (const r of runs) {
        if (r.note === undefined || noteIds.has(r.note)) continue;
        const wordId = footnotes.length + 1;
        noteIds.set(r.note, wordId);
        const noteRuns = parseInline(notes.get(r.note) ?? '', {});
        footnotes.push(`<w:footnote w:id="${wordId}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>${runsXml(noteRuns, ctx)}</w:p></w:footnote>`);
      }
    };
    // Definitions of notes some marker cites leave the flow (they live in
    // the Word note); the others stay verbatim.
    const cited = new Set<string>();
    for (const b of blocks) {
      if (b.kind === 'para' || b.kind === 'list') for (const m of b.text.matchAll(/\[\^([\p{L}\p{N}_.:-]+)\](?!:)/gu)) cited.add(m[1]!);
    }
    for (const b of blocks) {
      switch (b.kind) {
        case 'markup': {
          const def = NOTE_DEF_RE.exec(b.text);
          if (def && cited.has(def[1]!) && notes.get(def[1]!) === b.text.slice(def[0].length)) break;
          body += paragraphXml(styles.paragraph({ kind: 'markup' }, () => MARKUP_STYLE, () => ({})), b.text ? `<w:r>${textXml(b.text)}</w:r>` : '');
          break;
        }
        case 'heading': {
          // Trailing attributes (`{toc="false"}`) travel as markup.
          const attrs = /\s+\{[^{}]*\}\s*$/.exec(b.text);
          const runs = attrs
            ? [...inline(b.text.slice(0, attrs.index), true), { text: attrs[0].trimEnd(), raw: true }]
            : inline(b.text, true);
          body += paragraphXml(styles.heading(b.level, b.style), runsXml(runs, ctx));
          break;
        }
        case 'para': {
          const runs = inline(b.text);
          citeNotes(runs);
          body += paragraphXml(roleStyle(b.role, styles), runsXml(runs, ctx));
          break;
        }
        case 'list': {
          const runs = inline(b.text);
          citeNotes(runs);
          numbering.touch(b.run, b.depth);
          const numId = b.ordered ? numbering.ordered(b.run, b.depth, b.number) : numbering.bullet();
          const style = b.role.kind === 'body' ? 'ListParagraph' : roleStyle(b.role, styles);
          body += paragraphXml(style, runsXml(runs, ctx), `<w:numPr><w:ilvl w:val="${b.depth - 1}"/><w:numId w:val="${numId}"/></w:numPr>`);
          break;
        }
        default:
          break;
      }
    }
  });
  if (!body) body = paragraphXml('Normal', '');

  const template: WordTemplate = {
    ...settings.template,
    paragraphs: { ...settings.template.paragraphs, ...styles.paragraphs },
    characters: { ...settings.template.characters, ...styles.characters },
  };

  const sect = '<w:sectPr><w:footnotePr><w:numFmt w:val="decimal"/></w:footnotePr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>';
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${body}${sect}</w:body></w:document>`;
  const lang = settings.config.locale ?? 'en';
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W_NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:eastAsia="Georgia" w:cs="Times New Roman"/><w:sz w:val="22"/><w:lang w:val="${escapeAttr(lang)}"/></w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults>${styles.xml()}</w:styles>`;
  const footnotesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes ${W_NS}><w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${footnotes.join('')}</w:footnotes>`;
  const settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${W_NS}><w:defaultTabStop w:val="709"/><w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
  const linkRels = [...links].map(([url, id]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeAttr(url)}" TargetMode="External"/>`).join('');
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdFootnotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdTemplate" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/>${linkRels}</Relationships>`;
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${settings.title ? `<dc:title>${escapeXml(settings.title)}</dc:title>` : ''}${settings.author ? `<dc:creator>${escapeXml(settings.author)}</dc:creator>` : ''}<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Postext</Application></Properties>';
  const templateJson = JSON.stringify({ version: 1, ...template, id: '', updatedAt: 0 });
  const item = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><${TEMPLATE_XML_ROOT} xmlns="${TEMPLATE_XML_NS}">${escapeXml(templateJson)}</${TEMPLATE_XML_ROOT}>`;
  const itemProps = `<?xml version="1.0" encoding="UTF-8" standalone="no"?><ds:datastoreItem ds:itemID="{6E0D2B5A-3F1C-4C8B-9A2D-5F0E7A1B9C30}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="${TEMPLATE_XML_NS}"/></ds:schemaRefs></ds:datastoreItem>`;
  const itemRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps1.xml"/></Relationships>';
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
  const pkgRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(pkgRels),
    'docProps/core.xml': strToU8(core),
    'docProps/app.xml': strToU8(app),
    'word/document.xml': strToU8(documentXml),
    'word/styles.xml': strToU8(stylesXml),
    'word/numbering.xml': strToU8(numbering.xml()),
    'word/footnotes.xml': strToU8(footnotesXml),
    'word/settings.xml': strToU8(settingsXml),
    'word/_rels/document.xml.rels': strToU8(docRels),
    'customXml/item1.xml': strToU8(item),
    'customXml/itemProps1.xml': strToU8(itemProps),
    'customXml/_rels/item1.xml.rels': strToU8(itemRels),
  }, { level: 6 });
}
