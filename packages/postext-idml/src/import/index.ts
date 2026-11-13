// postext-idml, import half: an IDML package as a Postext book.
//
// `idmlToPostext` reads the package (or takes a document already read)
// and returns the book: a configuration that holds only what the
// document sets, Markdown chapters, resources with their files, the
// faces the book needs, the links nobody gave the bytes of, and a report
// of everything read differently. Nothing of the document is left out
// without a finding that names and counts it.

import type { PostextConfig, ResourceType } from 'postext';
import type { IdmlDocument } from '../model/document.js';
import { readIdml } from '../read/index.js';
import { Context } from './context.js';
import { decideLayout, mainStory } from './decide.js';
import type { MasterWords } from './design.js';
import { joinContinued } from './fidelity/continued.js';
import { indexDestinations } from './fidelity/crossref.js';
import { layoutFlow } from './flow.js';
import { carryFonts } from './fonts.js';
import { calloutStyles } from './objects.js';
import { layoutPages } from './pages.js';
import { runningHeads } from './fidelity/masters.js';
import { allPages, pageConfig } from './pagesetup.js';
import { countLooks, selectStories } from './scan.js';
import { styleConfig } from './styleconfig.js';
import { tableStyles } from './tables.js';
import type { IdmlImportOptions, IdmlImportResult, ImportedFont } from './types.js';
import { italicOf, pt, weightOf } from './values.js';

export type { IdmlFontFile, IdmlImportOptions, IdmlImportResult, IdmlLink, ImportedFont, ImportFinding, ImportReport, FindingSeverity, StyleMapping } from './types.js';
export { captionLabel } from './pictures.js';
export { escapeStory, guardBlockStart } from './escape.js';

const isDocument = (x: unknown): x is IdmlDocument => typeof x === 'object' && x !== null && 'stories' in x && 'spreads' in x;

const FOOTNOTE_RESTART: Record<string, NonNullable<PostextConfig['footnotes']>['numbering']> = { DontRestart: 'document', PageRestart: 'page', SpreadRestart: 'spread', SectionRestart: 'chapter' };
const FOOTNOTE_FORMAT: Record<string, string> = { Arabic: 'decimal', UpperRoman: 'upper-roman', LowerRoman: 'lower-roman', UpperLetters: 'upper-alpha', LowerLetters: 'lower-alpha', Symbols: 'symbols', Asterisks: 'symbols' };

function footnotes(ctx: Context): PostextConfig['footnotes'] | undefined {
  if (!ctx.counts.footnotes) return undefined;
  const out: NonNullable<PostextConfig['footnotes']> = {};
  const o = ctx.doc.preferences.all?.FootnoteOption?.attrs;
  if (o) {
    const numbering = FOOTNOTE_RESTART[o.RestartNumbering ?? ''];
    if (numbering) out.numbering = numbering;
    const style = (o.FootnoteNumberingStyle ?? '').replace(/^.*\//, '');
    const format = FOOTNOTE_FORMAT[style];
    if (format) out.numberFormat = format;
    else if (style) ctx.rep.add('footnoteNumberStyle', 'warning', 'A footnote numbering style Postext does not have is set in decimal', style);
    if (o.RuleOn === 'false') out.separator = { enabled: false };
    if (o.Prefix || o.Suffix) ctx.rep.add('footnotePrefixSuffix', 'info', 'A prefix or suffix on footnote numbers is not carried', `${o.Prefix ?? ''}#${o.Suffix ?? ''}`);
  }
  if (ctx.noteParagraph) {
    const look = ctx.looks.of(ctx.noteParagraph);
    out.fontSize = pt(look.cf.pointSize);
    out.lineHeight = pt(look.cf.leading);
  }
  // A document whose notes are all endnotes sets them after the text.
  let foot = 0;
  let end = 0;
  for (const s of ctx.doc.stories.values()) for (const p of s.paragraphs) for (const r of p.runs) for (const i of r.content) if (i.kind === 'footnote') foot++; else if (i.kind === 'endnote') end++;
  if (end && !foot) out.placement = 'chapterEnd';
  else if (end && foot) ctx.rep.add('endnotesAsFootnotes', 'warning', 'A document with footnotes and endnotes sets both as footnotes: Postext has one kind of note', undefined, end);
  return out;
}

function fontsOf(ctx: Context): ImportedFont[] {
  const families = new Map<string, ImportedFont>();
  const status = new Map(ctx.doc.fonts.map((f) => [`${f.family}\u0000${f.style}`, f.status]));
  for (const [key, characters] of [...ctx.faces].sort((a, b) => b[1] - a[1])) {
    const [family, name] = key.split('\u0000') as [string, string];
    let f = families.get(family);
    if (!f) families.set(family, (f = { family, styles: [] }));
    f.styles.push({ name, weight: weightOf(name), italic: italicOf(name), characters });
    const s = status.get(key);
    if (s && s !== 'Installed') ctx.rep.add('fontStatus', 'info', 'A font the document names was not installed where it was saved (InDesign had substituted it)', `${family} ${name}: ${s}`);
  }
  return [...families.values()];
}

/** Read an IDML package as a Postext book. Throws the reader's
 *  `IdmlError` for bytes that are no readable IDML; everything else the
 *  importer meets is a finding of the report. */
export function idmlToPostext(input: Uint8Array | ArrayBuffer | IdmlDocument, options: IdmlImportOptions = {}): IdmlImportResult {
  const doc = isDocument(input) ? input : readIdml(input);
  const ctx = new Context(doc, options);
  for (const w of doc.warnings) ctx.rep.add(`reader.${w.code}`, 'warning', w.message, w.part);

  const stories = joinContinued(ctx, selectStories(ctx));
  const main = mainStory(stories);
  ctx.looks.classify(countLooks(ctx, stories, main));
  indexDestinations(ctx, stories);
  const { layout, reason } = decideLayout(ctx, stories, main);
  const styles = styleConfig(ctx);
  const config: PostextConfig = { ...pageConfig(ctx), ...styles };

  let chapters: IdmlImportResult['chapters'] = [];
  let templates = 0;
  const labels = ctx.labelWords;
  const asPages = (): void => {
    const r = layoutPages(ctx, stories);
    chapters = r.chapters;
    if (r.templates.length) config.pageTemplates = r.templates;
    templates = r.templates.length;
  };
  const asFlow = (): void => {
    const words: MasterWords = { attrs: new Map() };
    Object.assign(config, runningHeads(ctx, words, stories));
    const r = layoutFlow(ctx, stories, main, words);
    chapters = r.chapters;
    void r.labels;
    // A cover set as a composed page, an opener drawn by its heading's
    // design (#1556).
    if (r.templates.length) config.pageTemplates = r.templates;
    templates = r.templates.length;
    if (r.headingStyles.length) config.headingStyles = [...(config.headingStyles ?? []), ...r.headingStyles];
    if (main?.story.orientation === 'vertical') (config.layout ??= {}).writingMode = 'vertical-rl';
  };
  // A readable package always gives a book: what the chosen layout
  // cannot do with it is tried as running text, and said.
  try {
    if (layout === 'pages') asPages();
    else asFlow();
  } catch (e) {
    ctx.rep.add('layoutFailed', 'loss', 'The document could not be laid out as asked; its text is set as far as it could be read', e instanceof Error ? e.message : String(e));
    chapters = [];
    try {
      if (layout === 'pages') asFlow();
    } catch (e2) {
      ctx.rep.add('layoutFailed', 'loss', 'The document could not be laid out as asked; its text is set as far as it could be read', e2 instanceof Error ? e2.message : String(e2));
    }
  }
  if (!ctx.opt.masterItems) ctx.rep.add('masterItemsOff', 'info', 'Master items (running heads, folios, master artwork) were left out as asked', undefined);

  // Direction: the document's when most of its stories run that way.
  const rtl = stories.filter((e) => e.story.direction === 'rtl').length;
  if (stories.length && rtl * 2 > stories.length) config.direction = 'rtl';
  if (stories.some((e) => e.story.orientation === 'vertical') && layout === 'flow' && main?.story.orientation !== 'vertical') ctx.rep.add('verticalStoryInFlow', 'warning', 'A vertical story in a horizontal flowing book is set horizontally (layout: "pages" keeps its frame vertical)', undefined);

  const notes = footnotes(ctx);
  if (notes) config.footnotes = notes;
  const callouts = calloutStyles(ctx);
  if (callouts.length) config.calloutStyles = callouts;
  const tables = tableStyles(ctx);
  if (tables.length) config.tableStyles = tables;
  if (ctx.markStyles.size) config.markStyles = [...ctx.markStyles.values()];
  // Resource types: pictures and tables print no label unless a caption
  // of the document typed one.
  if (ctx.resources.length) {
    const type = (id: string, name: string, word: string | undefined): ResourceType => ({ id, name, shortLabel: word ?? '', numberingTemplate: word ? '{n}' : '', resetOn: 'never', counterFormat: 'decimal', captionPrefix: word ?? '' });
    config.resourceTypes = [type('picture', 'Picture', undefined), type('grid', 'Table', undefined), type('figure', 'Figure', labels.get('figure') ?? 'Figure'), type('table', 'Numbered table', labels.get('table') ?? 'Table')];
  }
  // Captions take the look of the document's own: its size, alignment and
  // slant, with the label in the caption's weight (InDesign types it as
  // part of the caption).
  const cap = ctx.captionLook;
  if (cap) {
    config.captionStyle = {
      fontSize: pt(cap.cf.pointSize),
      align: cap.pf.align === 'justify' ? 'left' : cap.pf.align,
      labelBold: cap.weight >= 600,
      labelItalic: cap.italic,
      descriptionItalic: cap.italic,
      ...(cap.cf.fontFamily && cap.cf.fontFamily !== ctx.looks.body?.cf.fontFamily ? { fontFamily: cap.cf.fontFamily } : {}),
    };
  }
  const palette = ctx.palette.list();
  if (palette.length) config.colorPalette = palette;

  // The language most of the text is set in.
  const known = [...ctx.languages].filter(([tag]) => !tag.startsWith('?')).sort((a, b) => b[1] - a[1]);
  for (const [tag, n] of ctx.languages) if (tag.startsWith('?')) ctx.rep.add('unknownLanguage', 'info', 'A language of the text has no tag the importer knows; it does not count towards the book\'s language', tag.slice(1), n);
  const locale = options.locale ?? known[0]?.[0] ?? 'en';
  config.locale = locale as NonNullable<PostextConfig['locale']>;
  if (known.length > 1) ctx.rep.add('languages', 'info', 'Text set in other languages than the book\'s is hyphenated as the book\'s language: Postext has one language per book', known.slice(1).map(([t]) => t).join(', '));

  const name = options.name ?? doc.title ?? doc.name?.replace(/\.(indd|idml)$/i, '') ?? 'Untitled';
  // The title and the author travel in the first chapter's front matter.
  if (chapters.length && (doc.title || doc.author)) {
    const lines = [...(doc.title ? [`title: ${JSON.stringify(doc.title)}`] : []), ...(doc.author ? [`author: ${JSON.stringify(doc.author)}`] : [])];
    chapters[0]!.markdown = `---\n${lines.join('\n')}\n---\n\n${chapters[0]!.markdown}`;
  }
  if (!chapters.length) {
    chapters = [{ title: name, markdown: '' }];
    ctx.rep.add('emptyDocument', 'warning', 'The document holds nothing the importer sets: the book has one empty chapter', undefined);
  }
  const usedStyles = new Set([...ctx.looks.all.values()].filter((l) => l.paragraphs > 0).map((l) => l.style));
  const unused = [...doc.styles.paragraph.values()].filter((s) => !s.root && !usedStyles.has(s.self) && s.name !== 'NormalParagraphStyle');
  if (unused.length) ctx.rep.add('unusedStyles', 'info', 'Paragraph styles no text of the book is set in are not carried', unused.map((s) => s.name).slice(0, 5).join(', '), unused.length);
  if (doc.bookmarks.length && !ctx.rep.has('bookmarkChapters')) ctx.rep.add('bookmarks', 'info', 'Bookmarks are not carried as such: the outline of a Postext book (its PDF bookmarks, its contents) is made from its headings', doc.bookmarks.map((b) => b.name).slice(0, 5).join(', '), doc.bookmarks.length);
  if (ctx.doc.topics.size && !ctx.hasIndexMarks) ctx.rep.add('indexTopicsUnused', 'info', 'Index topics with no page reference in the text set are not carried', undefined, ctx.doc.topics.size);
  else if (ctx.hasIndexMarks && !chapters.some((c) => /^:::index$/m.test(c.markdown))) ctx.rep.add('indexNotPrinted', 'info', 'The text carries index marks and the document has no generated index story: add a chapter with :::index to print one', undefined);

  const fonts = fontsOf(ctx);
  if (options.fontFiles?.length) {
    const custom = carryFonts(ctx, fonts, options.fontFiles);
    if (custom.length) config.customFonts = custom;
  }
  const report = ctx.rep.build({ pages: allPages(ctx).length, ...ctx.counts, templates });
  if (options.onWarning) {
    for (const f of report.findings) {
      try {
        options.onWarning(f);
      } catch {
        // A host's callback must not stop the import.
      }
    }
  }
  return { name, locale, layout, reason, config, chapters, resources: ctx.resources, files: ctx.files, fonts, missingLinks: [...ctx.missing.values()], report };
}

/** The argument of `createBundle` (`postext/bundle`) for an imported
 *  book. */
export function importBundleInput(result: IdmlImportResult): { name: string; locale: string; chapters: { title: string; markdown: string }[]; config: PostextConfig; resources: IdmlImportResult['resources']; files: Map<string, Uint8Array> } {
  return { name: result.name, locale: result.locale, chapters: result.chapters, config: result.config, resources: result.resources, files: result.files };
}
