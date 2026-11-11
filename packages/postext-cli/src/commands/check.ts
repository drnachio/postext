import { attrPlaceholdersNeverSet, bitmapInfo, composedReflowLog, fenceAttributesSet, fenceConditionsNeverMet, markdownAttributesSet, parseMarkdown, contrastDocument, contrastMedia, outputTransform, parseIccProfile, preflightDocument, resolveContrastConfig, resolvePrintConfig, svgSpotInks, type ContrastIssue, type OutputTransform } from 'postext';
import { iccProfile } from '../assets';
import type { CommandContext } from '../context';
import { pageLabelOf, sourceAt } from '../layout';
import { style } from '../log';
import { openAndLayOut } from '../session';

export default async function check(ctx: CommandContext): Promise<void> {
  const { opts, reporter } = ctx;
  const { book, layout } = await openAndLayOut(ctx);
  const print = resolvePrintConfig(book.config.print);
  const pdfGen = book.config.pdfGeneration;
  const cmyk = !!pdfGen?.forceColorSpace && (pdfGen.colorSpace ?? 'cmyk') === 'cmyk';
  const forPrint = print.standard !== 'none' || cmyk || layout.docs.some((d) => d.config.page.cutLines.enabled);
  // The separation of the book's output profile, read when a check asks.
  let separation: { transform?: OutputTransform } | undefined;
  const outputSeparation = (): OutputTransform | undefined => {
    if (!separation) {
      const icc = print.outputProfile === 'custom'
        ? (print.customProfile ? book.files.get(print.customProfile.fileId) : undefined)
        : iccProfile(print.outputProfile);
      separation = icc
        ? { transform: outputTransform(parseIccProfile(icc), { intent: print.renderingIntent, blackPointCompensation: print.blackPointCompensation, preserveNeutrals: print.black.kOnlyNeutrals }) }
        : {};
    }
    return separation.transform;
  };
  if (print.preflight.enabled && (forPrint || opts.flag('preflight'))) {
    const transform = outputSeparation();
    // The pixels each bitmap's file really has (#631), read from its header.
    const sizes = new Map<string, { width: number; height: number } | undefined>();
    const imageSize = (fileId: string) => {
      if (!sizes.has(fileId)) {
        const bytes = book.files.get(fileId);
        const info = bytes ? bitmapInfo(bytes) : undefined;
        sizes.set(fileId, info ? { width: info.width, height: info.height } : undefined);
      }
      return sizes.get(fileId);
    };
    // The spot inks each SVG names (#1468), read from its markup.
    const inksOf = new Map<string, string[]>();
    const svgInks = (fileId: string) => {
      if (!inksOf.has(fileId)) {
        const bytes = book.files.get(fileId);
        inksOf.set(fileId, bytes ? svgSpotInks(new TextDecoder().decode(bytes)).map((i) => i.name) : []);
      }
      return inksOf.get(fileId);
    };
    const value = (v: unknown): string => {
      if (typeof v === 'number') return String(Math.round(v * 100) / 100);
      if (v && typeof v === 'object' && 'width' in v && 'height' in v) return `${(v as { width: number }).width}×${(v as { height: number }).height}`;
      return String(v);
    };
    let issues = 0;
    reporter.time('preflight', () => layout.docs.forEach((doc, i) => {
      for (const issue of preflightDocument(doc, { print, resources: book.resources, imageSize, svgInks, cmyk: print.standard !== 'none' || cmyk, ...(transform ? { transform } : {}) })) {
        const { kind, severity, pageIndex, rect: _rect, sourceStart, sourceEnd: _end, ...detail } = issue;
        issues++;
        reporter.warn({
          kind: `preflight.${kind}`,
          severity: severity === 'critical' ? 'error' : severity === 'warning' ? 'warning' : 'info',
          message: Object.entries(detail).map(([k, v]) => `${k} ${value(v)}`).join(', '),
          at: sourceAt(layout.chapters[i], sourceStart),
          page: pageLabelOf(doc, pageIndex),
        });
      }
    }));
    reporter.data.preflight = { standard: print.standard, profile: print.outputProfile, issues };
  }
  // Contrast (#748): the text that does not read on its ground, once per
  // pair of colours whatever chapter sets it first; in print, on the paper
  // of the output profile.
  const contrast = resolveContrastConfig(book.config.contrast);
  if (contrast.enabled) {
    const seen = new Map<string, { issue: ContrastIssue; doc: number }>();
    reporter.time('contrast', () => layout.docs.forEach((doc, i) => {
      const media = opts.flag('preflight') && contrast.mode === 'auto' ? ['screen', 'print'] as const : contrastMedia(doc.config, contrast);
      const transform = media.includes('print') ? outputSeparation() : undefined;
      for (const issue of contrastDocument(doc, { contrast, media, ...(transform ? { transform } : {}) })) {
        const key = `${issue.kind}|${issue.color}|${issue.background}|${issue.kind === 'lowContrast' ? issue.required : ''}${issue.accepted ? '|accepted' : ''}`;
        const first = seen.get(key);
        if (first) first.issue.count += issue.count;
        else seen.set(key, { issue: { ...issue }, doc: i });
      }
    }));
    for (const { issue, doc: i } of seen.values()) {
      const doc = layout.docs[i]!;
      const face = `${issue.sizePt} pt${issue.weight !== 400 ? ` ${issue.weight}` : ''}${issue.italic ? ' italic' : ''}`;
      const ratios = issue.kind === 'lowContrast'
        ? [issue.screen !== undefined ? `${issue.screen}:1 on screen` : '', issue.print !== undefined ? `${issue.print}:1 in print` : ''].filter(Boolean).join(', ')
        : '';
      // A pair `contrast.allow` accepts (#1124) is listed, as a note.
      const accepted = issue.accepted ? `accepted${issue.accepted.style ? ` in ${issue.accepted.style}` : ''}${issue.accepted.reason ? ` (${issue.accepted.reason})` : ''}: ` : '';
      reporter.warn({
        kind: `contrast.${issue.kind}`,
        severity: issue.accepted ? 'info' : 'warning',
        message: accepted + (issue.kind === 'lowContrast'
          ? `${issue.color} on ${issue.background}, ${face}: ${ratios}; ${issue.level} asks for ${issue.required}:1 (${issue.count} run${issue.count === 1 ? '' : 's'}): “${issue.text}”`
          : `${issue.color} reversed out of ${issue.background} (${issue.inks} ink${issue.inks === 1 ? '' : 's'}), ${face}: under ${issue.minimumPt} pt it can fill in on press (${issue.count} run${issue.count === 1 ? '' : 's'}): “${issue.text}”`),
        ...(issue.accepted ? { data: { accepted: issue.accepted } } : {}),
        at: sourceAt(layout.chapters[i], issue.sourceStart),
        page: pageLabelOf(doc, issue.pageIndex),
      });
    }
    const acceptedCount = [...seen.values()].filter((s) => s.issue.accepted).length;
    reporter.data.contrast = { level: contrast.level, issues: seen.size - acceptedCount, accepted: acceptedCount };
  }
  // Composed pages (#856): what the layout changed from each template's
  // drawing so the page's content fits («dinero grew 8 mm; gasto moved
  // down 8 mm»), one line per page; the events themselves in --json.
  const reflow = layout.docs.flatMap((doc, i) => composedReflowLog(doc).map((r) => {
    const chapter = layout.chapters[i];
    return { ...r, pageLabel: pageLabelOf(doc, r.pageIndex) ?? r.pageLabel, ...(chapter ? { chapter: chapter.file ?? chapter.title } : {}) };
  }));
  for (const r of reflow) reporter.info(`${style.dim('reflow')} p. ${r.pageLabel} (${r.template}): ${r.lines.join('; ')}`);
  reporter.data.reflow = reflow;
  // Decoration drawn when the page fence says so (#1087): a `when` or
  // `unless` on an attribute no page of the book sets is a note (the
  // element is never drawn, or always). Read over the whole book only: a
  // selection of chapters may leave out the pages that set it.
  if (layout.chapters.length === book.chapters.length) {
    const set = new Set<string>();
    for (const doc of layout.docs) for (const page of doc.pages) for (const k of fenceAttributesSet(page.composed?.attrs)) set.add(k);
    for (const use of fenceConditionsNeverMet(book.config, set)) {
      reporter.warn({
        kind: 'conditionNeverMet',
        severity: 'info',
        message: `${use.path}: no page fence sets “${use.attribute}”, so the element is ${use.condition === 'when' ? 'never' : 'always'} drawn`,
        data: { path: use.path, condition: use.condition, attribute: use.attribute },
      });
    }
    // An `{attr.x}` no heading or fence of the book sets (#1152): it always
    // reads '', so the folio or running foot it fills prints nothing.
    const attrs = new Set<string>();
    for (const chapter of layout.chapters) for (const k of markdownAttributesSet(parseMarkdown(chapter.markdown))) attrs.add(k);
    for (const use of attrPlaceholdersNeverSet(book.config, attrs)) {
      reporter.warn({
        kind: 'conditionNeverMet',
        severity: 'info',
        message: `${use.path}: no heading or fence sets “${use.attribute}”, so {attr.${use.attribute}} is always empty`,
        data: { path: use.path, condition: 'attr', attribute: use.attribute },
      });
    }
  }
  const errors = reporter.errorCount();
  const warnings = reporter.warnings.filter((w) => w.severity === 'warning').length;
  const failed = errors > 0 || (opts.flag('strict') === true && warnings > 0);
  reporter.data.check = { errors, warnings, passed: !failed };
  if (failed) reporter.exitCode = 3;
  reporter.info(failed
    ? style.red(`check failed: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`)
    : style.green(`check passed${warnings ? ` with ${warnings} warning${warnings === 1 ? '' : 's'}` : ''}`));
}
