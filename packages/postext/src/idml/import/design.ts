// The design half of the IDML import: the palette, the page, the styles
// as the configuration, and the main master as the header and footer.

import type { ColorValue, ColorPaletteEntry, DesignElement, PostextConfig } from '../../types.js';
import { type ParagraphRole } from './analyze.js';
import { Slugger, slugify } from './markdown.js';
import { type Attrs, type IdmlPara, type IdmlPage, type Inline, type PageItem } from './read.js';
import { kid } from './xml.js';
import { ConverterBase } from './base.js';
import { type Look, clean, generalise, lookOf, mergeSides, mm, num, pt, r1, templateOf, toRgb } from './helpers.js';

/** The design half of a conversion (`ConverterBase` holds its state). */
export abstract class DesignConverter extends ConverterBase {
  // -------------------------------------------------------------------------
  // Design
  // -------------------------------------------------------------------------

  /** A swatch reference as a colour value, the palette's id on it when the
   *  swatch is a named one. */
  color(ref: string | undefined, tintOver?: number): ColorValue | undefined {
    if (!ref || /Swatch\/None|^n$/.test(ref)) return undefined;
    const c = this.doc.colors.get(ref);
    if (!c) return undefined;
    if (c.model === 'Tint' && c.base) {
      const base = this.color(c.base, c.tint);
      return base;
    }
    const tint = tintOver !== undefined && tintOver < 100 ? tintOver / 100 : 1;
    const rgb = toRgb(c.space, c.value);
    if (!rgb) return undefined;
    const mixed = rgb.map((v) => Math.round(255 - (255 - v) * tint));
    const hex = `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    const paletteId = this.paletteIds.get(ref);
    const cmyk = c.space === 'CMYK' && c.value.length === 4 ? { c: c.value[0]! * tint, m: c.value[1]! * tint, y: c.value[2]! * tint, k: c.value[3]! * tint } : undefined;
    const round = (o: { c: number; m: number; y: number; k: number }) => ({ c: r1(o.c), m: r1(o.m), y: r1(o.y), k: r1(o.k) });
    let value: ColorValue;
    // A spot swatch comes in as its CMYK equivalent.
    if (c.model === 'Spot') this.spots.add(c.name);
    if (cmyk) {
      value = { hex, model: 'cmyk', cmyk: round(cmyk) };
    } else {
      value = { hex, model: 'hex' };
    }
    return paletteId && tint === 1 ? { ...value, paletteId } : value;
  }

  protected palette(): ColorPaletteEntry[] {
    const out: ColorPaletteEntry[] = [];
    const seen = new Set<string>();
    for (const c of this.doc.colors.values()) {
      if (c.model === 'Tint' || c.model === 'Registration') continue;
      if (/^Color\/(Black|Paper|Registration)$/.test(c.self) || !c.name || c.name.startsWith('[') || c.name.startsWith('$ID/') || /^(Black|Paper|Registration|None|Negro|Papel|Registro)$/.test(c.name)) continue;
      // A swatch named after its values («C=0 M=100 Y=0 K=0», what InDesign
      // calls a colour nobody named) is no palette entry.
      if (seen.has(c.name) || /^([CMYKRGBL]|LAB)=/.test(c.name)) continue;
      const value = this.color(c.self);
      if (!value) continue;
      seen.add(c.name);
      const id = slugify(c.name, 4, 32) || `swatch-${out.length + 1}`;
      this.paletteIds.set(c.self, id);
      out.push({ id, name: c.name, value });
    }
    return out;
  }


  protected paragraphLook(self: string): Look {
    const look = lookOf(this.doc.paragraphStyles.get(self)?.attrs ?? {});
    if (look.font) this.fonts.add(look.font);
    return look;
  }

  protected textConfig(): PostextConfig {
    const locale = this.options.locale ?? this.analysis.language;
    return locale ? ({ locale } as PostextConfig) : {};
  }

  protected design(): PostextConfig {
    const config: PostextConfig = { ...this.textConfig() };
    const palette = this.palette();
    if (palette.length > 0) config.colorPalette = palette;

    // The page, its margins and its columns: those of the master most
    // pages apply, else of the first page.
    const use = new Map<string, number>();
    for (const p of this.doc.pages) if (p.master && p.master !== 'n') use.set(p.master, (use.get(p.master) ?? 0) + 1);
    const mainMaster = [...use.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const master = mainMaster ? this.doc.masters.get(mainMaster) : undefined;
    const recto = master ? master.pages[master.pages.length - 1] : this.doc.pages.find((p) => p.index % 2 === 0) ?? this.doc.pages[0];
    const margins = this.frameMargins() ?? recto?.margins;
    config.page = {
      width: mm(this.doc.pageWidth),
      height: mm(this.doc.pageHeight),
      ...(margins ? { margins: { top: mm(margins.top), bottom: mm(margins.bottom), left: mm(margins.left), right: mm(margins.right), mirror: this.doc.facing } } : {}),
      ...(this.doc.binding === 'RightToLeft' ? { binding: 'right' as const } : {}),
    };
    // The columns of the text's frames, else of the margins.
    const columns = this.frameColumns()?.columns ?? margins?.columns ?? 1;
    const gutter = this.frameColumns()?.gutter ?? margins?.gutter ?? 12;
    config.layout = columns <= 1 ? { layoutType: 'single' } : columns === 2 ? { layoutType: 'double', gutterWidth: pt(gutter) } : { layoutType: 'multiple', columnCount: Math.min(8, columns), gutterWidth: pt(gutter) };

    // The styles.
    const roles = new Map<string, ParagraphRole>();
    for (const s of this.analysis.paragraphStyles) roles.set(s.self, this.role(s.self));
    const bodyStyle = this.analysis.paragraphStyles.find((s) => roles.get(s.self) === 'body')?.self;
    const body = bodyStyle ? this.paragraphLook(bodyStyle) : {};
    const bodySize = body.size ?? 10;
    config.bodyText = clean({
      fontFamily: body.font,
      fontSize: body.size !== undefined ? pt(body.size) : undefined,
      lineHeight: body.leading !== undefined ? pt(body.leading) : undefined,
      color: this.textColor(body.color),
      textAlign: body.align,
      fontWeight: body.weight !== undefined && body.weight !== 400 ? body.weight : undefined,
      firstLineIndent: body.firstIndent !== undefined ? pt(body.firstIndent) : undefined,
      hyphenation: body.hyphenate !== undefined ? { enabled: body.hyphenate } : undefined,
    }) as PostextConfig['bodyText'];

    const levels: NonNullable<NonNullable<PostextConfig['headings']>['levels']> = [];
    for (let level = 1; level <= 6; level++) {
      const self = this.analysis.paragraphStyles.find((s) => roles.get(s.self) === `h${level}`)?.self;
      if (!self) continue;
      const l = this.paragraphLook(self);
      levels.push(clean({
        level,
        fontFamily: l.font,
        fontSize: l.size !== undefined ? pt(l.size) : undefined,
        lineHeight: l.leading !== undefined ? pt(l.leading) : undefined,
        color: this.textColor(l.color),
        fontWeight: l.weight,
        italic: l.italic,
        marginTop: l.spaceBefore !== undefined ? pt(l.spaceBefore) : undefined,
        marginBottom: l.spaceAfter !== undefined ? pt(l.spaceAfter) : undefined,
      }) as (typeof levels)[number]);
    }
    if (levels.length > 0) config.headings = { levels };

    const paragraphStyles: NonNullable<PostextConfig['paragraphStyles']> = [];
    for (const [self, id] of this.paragraphIds) {
      const l = this.paragraphLook(self);
      const differs = <K extends keyof Look>(k: K) => (l[k] !== undefined && l[k] !== body[k] ? l[k] : undefined);
      paragraphStyles.push(clean({
        id,
        name: this.styleName(self, 'p').replace(/^Paragraph\s+/, ''),
        fontFamily: differs('font'),
        fontSize: differs('size') !== undefined ? pt(l.size!) : undefined,
        lineHeight: differs('leading') !== undefined ? pt(l.leading!) : undefined,
        color: differs('color') !== undefined ? this.textColor(l.color) : undefined,
        textAlign: differs('align'),
        fontWeight: differs('weight'),
        italic: differs('italic'),
        smallCaps: l.smallCaps,
        textTransform: l.allCaps ? 'uppercase' : undefined,
        hyphenation: differs('hyphenate'),
        indent: l.leftIndent ? pt(l.leftIndent) : undefined,
        endIndent: l.rightIndent ? pt(l.rightIndent) : undefined,
        firstLineIndent: differs('firstIndent') !== undefined ? pt(l.firstIndent!) : undefined,
        marginTop: l.spaceBefore ? pt(l.spaceBefore) : undefined,
        marginBottom: l.spaceAfter ? pt(l.spaceAfter) : undefined,
      }) as (typeof paragraphStyles)[number]);
    }
    if (paragraphStyles.length > 0) config.paragraphStyles = paragraphStyles;


    const callouts: NonNullable<PostextConfig['calloutStyles']> = [];
    const seenBoxes = new Set<string>();
    for (const [self, id] of this.calloutIds) {
      if (seenBoxes.has(id)) continue;
      seenBoxes.add(id);
      const a = this.doc.paragraphStyles.get(self)?.attrs ?? {};
      const ground = a.ParagraphShadingOn === 'true' ? this.color(a.ParagraphShadingColor) : undefined;
      const border = a.ParagraphBorderOn === 'true' ? this.color(a.ParagraphBorderColor) : undefined;
      callouts.push(clean({
        id,
        name: this.styleName(self, 'p').replace(/^Box\s+/, ''),
        ...(ground ? { backgroundEnabled: true, background: ground } : {}),
        ...(border ? { border: { enabled: true, color: border, width: pt(num(a.ParagraphBorderTopLineWeight) ?? 1) } } : {}),
      }) as (typeof callouts)[number]);
    }
    if (callouts.length > 0) config.calloutStyles = callouts;

    // The master's items as the header and footer.
    const slots = this.masterDesign(mainMaster, bodySize);
    if (slots.header.length > 0) config.header = { elements: slots.header };
    if (slots.footer.length > 0) config.footer = { elements: slots.footer };
    const others = [...this.doc.masters.values()].filter((m) => m.self !== mainMaster && use.has(m.self));
    if (others.length > 0) this.note('otherMasters', others[0]!.name, others.length);
    if (this.fonts.size > 0) this.note('fonts', undefined, this.fonts.size);
    const fontNote = this.notes.get('fonts');
    if (fontNote) for (const f of [...this.fonts].slice(0, 6)) fontNote.examples.add(f);
    return config;
  }

  /** The frames of the text (not of its furniture), on document pages. */
  protected textFrames(): PageItem[] {
    const stories = new Set(this.analysis.stories);
    return this.doc.items.filter((i) => i.kind === 'TextFrame' && i.story && stories.has(i.story) && i.page >= 0);
  }

  /** The margins most text frames leave on their page: the text area the
   *  book is set in (a master's margins are often not where the frames
   *  are). `left` is the inside of a recto. */
  protected frameMargins(): IdmlPage['margins'] | undefined {
    const votes = new Map<string, { n: number; m: IdmlPage['margins'] }>();
    for (const f of this.textFrames()) {
      const page = this.doc.pages[f.page]!;
      const recto = !this.doc.facing || page.box[0] >= -0.5;
      const left = f.box[0] - page.box[0];
      const right = page.box[2] - f.box[2];
      const m = { top: f.box[1] - page.box[1], bottom: page.box[3] - f.box[3], left: recto ? left : right, right: recto ? right : left, columns: 1, gutter: 12 };
      if (Object.values(m).some((v) => v < -0.5)) continue;
      const key = [m.top, m.bottom, m.left, m.right].map((v) => Math.round(v * 2)).join('|');
      const entry = votes.get(key) ?? { n: 0, m };
      entry.n++;
      votes.set(key, entry);
    }
    return [...votes.values()].sort((a, b) => b.n - a.n)[0]?.m;
  }

  /** The columns most text frames are set in. */
  protected frameColumns(): { columns: number; gutter: number } | undefined {
    const votes = new Map<string, { n: number; columns: number; gutter: number }>();
    for (const f of this.textFrames()) {
      const tfp = kid(f.el, 'TextFramePreference')?.attrs;
      const columns = num(tfp?.TextColumnCount);
      if (columns === undefined) continue;
      const gutter = num(tfp?.TextColumnGutter) ?? 12;
      const key = `${columns}|${Math.round(gutter)}`;
      const entry = votes.get(key) ?? { n: 0, columns, gutter };
      entry.n++;
      votes.set(key, entry);
    }
    return [...votes.values()].sort((a, b) => b.n - a.n)[0];
  }

  /** How a frame's text is aligned: as its paragraph says, centred when
   *  the frame is centred on the page (a frame as narrow as its text). */
  protected frameAlign(it: PageItem, page: IdmlPage, p: IdmlPara | undefined): 'left' | 'right' | 'center' {
    if (Math.abs((it.box[0] + it.box[2]) / 2 - (page.box[0] + page.box[2]) / 2) < 3) return 'center';
    const a = p?.items.find((i): i is Extract<Inline, { t: 'text' }> => i.t === 'text')?.a ?? p?.a ?? {};
    const align = lookOf(a).align;
    return align === 'right' || align === 'center' ? align : 'left';
  }

  /** The text colour of a style: black is the default, left unset. */
  protected textColor(ref: string | undefined): ColorValue | undefined {
    if (!ref || ref === 'Color/Black') return undefined;
    return this.color(ref);
  }

  /** The items of the main master spread, and the running heads and
   *  folios the pages repeat in their margins, as design elements. */
  protected masterDesign(masterSelf: string | undefined, bodySize: number): { header: DesignElement[]; footer: DesignElement[] } {
    const header: DesignElement[] = [];
    const footer: DesignElement[] = [];
    const ids = new Slugger();
    const signatures = new Set<string>();
    const place = (el: DesignElement, centreY: number, sig: string) => {
      if (signatures.has(sig)) return;
      signatures.add(sig);
      (centreY < this.doc.pageHeight / 2 ? header : footer).push(el);
    };
    const master = masterSelf ? this.doc.masters.get(masterSelf) : undefined;
    // A page right of the spine is a recto (odd), bound on the left; the
    // other way round bound on the right. Single pages print on both.
    const parityOf = (page: IdmlPage): 'all' | 'odd' | 'even' => {
      if (!this.doc.facing) return 'all';
      const right = page.box[0] >= -0.5;
      return right !== (this.doc.binding === 'RightToLeft') ? 'odd' : 'even';
    };
    const W = this.doc.pageWidth;
    const items = (list: PageItem[], pages: IdmlPage[], text?: string, forceAlign?: 'left' | 'right' | 'center') => {
      for (const it of list) {
        const page = pages.find((p) => p.index === it.page);
        if (!page) continue;
        const parity = parityOf(page);
        const x = it.box[0] - page.box[0];
        const y = it.box[1] - page.box[1];
        const w = it.box[2] - it.box[0];
        const h = it.box[3] - it.box[1];
        const sigBase = `${parity}|${Math.round(x)}|${Math.round(y)}|${Math.round(w)}|${Math.round(h)}`;
        const placement = { anchor: { to: 'page' as const, edge: 'top-left' as const }, offset: { x: pt(x), y: pt(y) }, size: { width: pt(w), height: pt(h) } };
        if (it.kind === 'TextFrame') {
          const story = it.story ? this.doc.stories.get(it.story) : undefined;
          if (!story || story.paras.length === 0) continue;
          const content = text ?? story.paras.map((p) => templateOf(p)).join('\n');
          if (!content.trim()) continue;
          const a = story.paras[0]!.items.find((i): i is Extract<Inline, { a: Attrs }> => 'a' in i)?.a ?? story.paras[0]!.a;
          const l = lookOf(a);
          if (l.font) this.fonts.add(l.font);
          const valign = kid(it.el, 'TextFramePreference')?.attrs.VerticalJustification;
          // A frame centred on the page holds a centred folio, whatever its
          // paragraph says (a frame as narrow as its text).
          const align = forceAlign ?? this.frameAlign(it, page, story.paras[0]);
          // The text keeps the edge of the frame it is aligned to and takes
          // the width it needs (a frame drawn for one title cuts another).
          const edge = align === 'right' ? 'top-right' : align === 'center' ? 'top' : 'top-left';
          const ox = align === 'right' ? x + w - W : align === 'center' ? x + w / 2 - W / 2 : x;
          place({
            kind: 'text',
            id: ids.slug(/\{pageNumber\}/.test(content) ? 'folio' : 'running head'),
            parity,
            placement: { anchor: { to: 'page', edge }, offset: { x: pt(ox), y: pt(y) }, size: { width: 'auto', height: pt(h) } },
            content,
            ...(l.font ? { fontFamily: l.font } : {}),
            fontSize: pt(l.size ?? bodySize * 0.8),
            ...(l.weight !== undefined && l.weight !== 400 ? { fontWeight: l.weight } : {}),
            ...(l.italic ? { italic: true } : {}),
            ...(this.textColor(l.color) ? { color: this.textColor(l.color)! } : {}),
            align,
            verticalAlign: valign === 'CenterAlign' ? 'middle' : valign === 'BottomAlign' ? 'bottom' : 'top',
          } as DesignElement, y + h / 2, `t|${sigBase}|${content}`);
        } else if (it.kind === 'GraphicLine' && it.line) {
          const [x0, y0, x1, y1] = it.line;
          const horizontal = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
          const weight = num(it.el.attrs.StrokeWeight) ?? 1;
          const color = this.color(it.el.attrs.StrokeColor ?? 'Color/Black') ?? { hex: '#000000', model: 'hex' as const };
          const lx = Math.min(x0, x1) - page.box[0];
          const ly = Math.min(y0, y1) - page.box[1];
          place({
            kind: 'rule',
            id: ids.slug('rule'),
            parity,
            placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: pt(horizontal ? lx : lx - weight / 2), y: pt(horizontal ? ly - weight / 2 : ly) }, size: horizontal ? { width: pt(Math.abs(x1 - x0)) } : { height: pt(Math.abs(y1 - y0)) } },
            direction: horizontal ? 'horizontal' : 'vertical',
            color,
            thickness: pt(weight),
          } as DesignElement, ly, `r|${sigBase}`);
        } else if (it.kind === 'Rectangle' && it.link) {
          const res = this.picture(it.link, it.box);
          if (!res || !this.resources.some((r) => r.id === res)) continue;
          place({ kind: 'image', id: ids.slug('picture'), parity, placement, resourceId: res, decorative: true } as DesignElement, y + h / 2, `i|${sigBase}`);
        } else if (it.kind === 'Rectangle') {
          const fill = this.color(it.el.attrs.FillColor);
          const stroke = this.color(it.el.attrs.StrokeColor);
          const weight = num(it.el.attrs.StrokeWeight) ?? 0;
          if (!fill && !(stroke && weight > 0)) continue;
          const radius = num(it.el.attrs.CornerRadius);
          place({
            kind: 'box',
            id: ids.slug('box'),
            parity,
            placement,
            style: { ...(fill ? { backgroundColor: fill } : {}), ...(stroke && weight > 0 ? { borderColor: stroke, borderWidth: pt(weight) } : {}), ...(radius && it.el.attrs.CornerOption && it.el.attrs.CornerOption !== 'None' ? { borderRadius: pt(radius) } : {}) },
          } as DesignElement, y + h / 2, `b|${sigBase}`);
        } else {
          this.note('masterItems', it.kind);
        }
      }
    };
    if (master) items(master.items, master.pages);

    // Running heads and folios the pages print in their margins (a book
    // exported by Postext keeps a chapter's running head on its pages): a
    // frame at one place on several pages of one side is a design element,
    // its text a placeholder when it changes from page to page.
    // A running head may be several frames in a row («CAPÍTULO 3», «•»,
    // the title), moving with the length of the title: each row of frames
    // in the margins of a page is read as one text, its chapter's number and
    // title made placeholders, set at the edge that stays put from page to
    // page. Only the pages of the main master count: an opener prints its
    // own.
    let chapter = 0;
    const rows = new Map<string, Array<{ page: IdmlPage; frames: PageItem[]; text: string }>>();
    const furniture = new Set(this.analysis.furniture);
    for (const page of this.doc.pages) {
      chapter = this.pageChapter.get(page.index) ?? chapter;
      if (this.titlePages.has(page.index) || (masterSelf && page.master !== masterSelf)) continue;
      const here = this.doc.items.filter((i) => i.page === page.index && i.story && furniture.has(i.story)).sort((a, b) => a.box[0] - b.box[0]);
      // Frames at one height, a run of them where each starts close to
      // where the one before ends (a folio far from the running head is
      // a text of its own).
      const runs: Array<{ y: number; frames: PageItem[] }> = [];
      for (const it of here.sort((a, b) => Math.round(a.box[1] - b.box[1]) || a.box[0] - b.box[0])) {
        const y = Math.round(it.box[1] - page.box[1]);
        const last = runs[runs.length - 1];
        if (last && Math.abs(last.y - y) <= 2 && it.box[0] - last.frames[last.frames.length - 1]!.box[2] < 20) last.frames.push(it);
        else runs.push({ y, frames: [it] });
      }
      // Keyed by the page edge the run keeps to (or the centre).
      const byRow = new Map<string, PageItem[]>();
      for (const run of runs) {
        const l = run.frames[0]!.box[0] - page.box[0];
        const r = page.box[2] - run.frames[run.frames.length - 1]!.box[2];
        const side = Math.abs(l - r) < 3 ? 'c' : l < r ? 'l' : 'r';
        byRow.set(`${run.y}|${side}`, run.frames);
      }
      const c = this.chapters[chapter];
      for (const [rowKey, list] of byRow) {
        const raw = list.map((it) => (this.doc.stories.get(it.story!)?.paras ?? []).map(templateOf).join(' ')).join(' ');
        const text = c ? generalise(raw, c.title, chapter + 1) : raw;
        const key = `${parityOf(page)}|${rowKey}`;
        rows.set(key, [...(rows.get(key) ?? []), { page, frames: list, text }]);
      }
    }
    for (const list of rows.values()) {
      if (list.length < 2) continue;
      // The template most pages agree on.
      const votes = new Map<string, number>();
      for (const r of list) votes.set(r.text, (votes.get(r.text) ?? 0) + 1);
      const text = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      // The edge that stays put across pages.
      const spread = (f: (r: (typeof list)[number]) => number) => Math.max(...list.map(f)) - Math.min(...list.map(f));
      const left = (r: (typeof list)[number]) => r.frames[0]!.box[0] - r.page.box[0];
      const right = (r: (typeof list)[number]) => r.frames[r.frames.length - 1]!.box[2] - r.page.box[0];
      const sample = list.find((r) => r.text === text) ?? list[0]!;
      const longest = [...sample.frames].sort((a, b) => b.box[2] - b.box[0] - (a.box[2] - a.box[0]))[0]!;
      const box: PageItem = { ...longest, box: [sample.frames[0]!.box[0], Math.min(...sample.frames.map((f) => f.box[1])), sample.frames[sample.frames.length - 1]!.box[2], Math.max(...sample.frames.map((f) => f.box[3]))] };
      const align = spread(right) + 0.5 < spread(left) ? 'right' : spread(left) + 0.5 < spread(right) ? 'left' : this.frameAlign(box, sample.page, this.doc.stories.get(longest.story!)?.paras[0]);
      items([box], this.doc.pages, text, align);
    }
    return { header: mergeSides(header), footer: mergeSides(footer) };
  }
}
