'use client';

// Downloading a book as PDF, HTML or EPUB 3 from its row (#1526): the
// items of the row's menu, one per format (a book in several languages
// asks which edition), and the line of the panel that follows the work.

import { BookOpen, FileText, Globe, X } from 'lucide-react';
import { type ProjectSummary, useSandboxLabels } from '../../context/SandboxContext.js';
import type { CompiledFormat, CompileProgress } from '../../export/compileBook.js';
import { cancelCompile, dismissCompileFailure, useCompileState } from '../../export/compileStore.js';
import { sameLocaleTag } from '../../presets/locale.js';
import { localeDisplayName } from '../../presets/localeNames.js';
import type { SandboxLabels } from '../../types/labels.js';
import { Button, IconButton, MenuItem, MenuSubmenu } from '../../ui/index.js';
import { ProgressMeter, progressFraction, progressText } from '../../viewport/epub/EpubPreview.js';

const FORMATS = [
  { format: 'pdf', icon: <FileText size={13} />, label: 'projectCompilePdf' },
  { format: 'html', icon: <Globe size={13} />, label: 'projectCompileHtml' },
  { format: 'epub', icon: <BookOpen size={13} />, label: 'projectCompileEpub' },
] as const satisfies readonly { format: CompiledFormat; icon: unknown; label: keyof SandboxLabels }[];

const FORMAT_NAMES: Record<CompiledFormat, string> = { pdf: 'PDF', html: 'HTML', epub: 'EPUB 3' };

/** The editions a download asks between: every language of a book kept in
 *  several, none for a book in one (it is written as it opens). */
export function compileEditions(project: Pick<ProjectSummary, 'locales'>): readonly string[] {
  return project.locales && project.locales.length > 1 ? project.locales : [];
}

/** The row menu's download items. While a book compiles they wait. */
export function CompileMenuItems({ project, uiLocale, onCompile }: {
  project: ProjectSummary;
  uiLocale: string;
  onCompile: (format: CompiledFormat, locale?: string) => void;
}) {
  const labels = useSandboxLabels();
  const busy = useCompileState().job !== null;
  const editions = compileEditions(project);
  return (
    <>
      {FORMATS.map(({ format, icon, label }) => editions.length > 0 ? (
        <MenuSubmenu key={format} icon={icon} label={labels[label]} disabled={busy}>
          {editions.map((l) => (
            <MenuItem key={l} selected={sameLocaleTag(l, project.locale ?? '')} onClick={() => onCompile(format, l)}>
              {localeDisplayName(l, uiLocale)}
            </MenuItem>
          ))}
        </MenuSubmenu>
      ) : (
        <MenuItem key={format} icon={icon} disabled={busy} onClick={() => onCompile(format)}>{labels[label]}</MenuItem>
      ))}
    </>
  );
}

/** The share of a compilation done: the pagination takes the first fifth,
 *  the layout and the writing go as on the EPUB tab. */
export function compileFraction(progress: CompileProgress | null): { fraction: number; pulse: boolean } {
  if (!progress) return { fraction: 0, pulse: true };
  if (progress.phase === 'paginate') return { fraction: progress.total > 0 ? 0.2 * Math.min(1, progress.done / progress.total) : 0, pulse: false };
  const step = progressFraction({ ...progress, phase: progress.phase });
  return progress.phase === 'layout' ? { fraction: 0.2 + 0.6 * step.fraction, pulse: false } : step;
}

/** Where a compilation stands, in words. */
export function compileProgressText(progress: CompileProgress | null, labels: SandboxLabels): string {
  if (!progress) return labels.projectBusy;
  switch (progress.phase) {
    case 'paginate':
      return labels.projectCompilePaginate
        .replace('__chapter__', String(Math.min(progress.total, progress.done + 1)))
        .replace('__count__', String(progress.total));
    case 'inputs':
      return labels.projectCompileInputs;
    default:
      return progressText({ ...progress, phase: progress.phase }, labels);
  }
}

/** The panel's line for the book being compiled (with Cancel), or for the
 *  compilation that failed. */
export function CompileStatus() {
  const labels = useSandboxLabels();
  const { job, failure } = useCompileState();
  if (job) {
    const title = labels.projectCompiling.replace('__format__', FORMAT_NAMES[job.format]).replace('__book__', () => job.name);
    return (
      <div role="status" className="mb-2 rounded border px-2 py-1.5 text-xs" style={{ borderColor: 'var(--rule)', color: 'var(--foreground)' }}>
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 break-words font-medium">{title}</span>
          <Button variant="ghost" size="xs" onClick={cancelCompile}>{labels.cancel}</Button>
        </div>
        <p className="mt-0.5 break-words" style={{ color: 'var(--slate)' }}>{compileProgressText(job.progress, labels)}</p>
        <ProgressMeter {...compileFraction(job.progress)} label={title} />
      </div>
    );
  }
  if (!failure) return null;
  return (
    <div role="alert" className="mb-2 flex items-start gap-2 rounded border px-2 py-1.5 text-xs" style={{ borderColor: 'var(--rule)', color: 'var(--destructive)' }}>
      <span className="min-w-0 flex-1 break-words">
        {labels.projectCompileFailed.replace('__format__', FORMAT_NAMES[failure.format]).replace('__book__', () => failure.name).replace('__error__', () => failure.message)}
      </span>
      <IconButton size={18} label={labels.projectNoticeDismiss} icon={<X size={11} />} tooltip={false} onClick={dismissCompileFailure} />
    </div>
  );
}
