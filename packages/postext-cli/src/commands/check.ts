import { outputTransform, parseIccProfile, preflightDocument, resolvePrintConfig } from 'postext';
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
  if (print.preflight.enabled && (forPrint || opts.flag('preflight'))) {
    const icc = print.outputProfile === 'custom'
      ? (print.customProfile ? book.files.get(print.customProfile.fileId) : undefined)
      : iccProfile(print.outputProfile);
    const transform = icc
      ? outputTransform(parseIccProfile(icc), { intent: print.renderingIntent, blackPointCompensation: print.blackPointCompensation, preserveNeutrals: print.black.kOnlyNeutrals })
      : undefined;
    let issues = 0;
    reporter.time('preflight', () => layout.docs.forEach((doc, i) => {
      for (const issue of preflightDocument(doc, { print, resources: book.resources, cmyk: print.standard !== 'none' || cmyk, ...(transform ? { transform } : {}) })) {
        const { kind, severity, pageIndex, rect: _rect, sourceStart, sourceEnd: _end, ...detail } = issue;
        issues++;
        reporter.warn({
          kind: `preflight.${kind}`,
          severity: severity === 'critical' ? 'error' : severity === 'warning' ? 'warning' : 'info',
          message: Object.entries(detail).map(([k, v]) => `${k} ${typeof v === 'number' ? Math.round(v * 100) / 100 : v}`).join(', '),
          at: sourceAt(layout.chapters[i], sourceStart),
          page: pageLabelOf(doc, pageIndex),
        });
      }
    }));
    reporter.data.preflight = { standard: print.standard, profile: print.outputProfile, issues };
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
