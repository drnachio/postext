'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { Grid3x3, PackagePlus, Undo2 } from 'lucide-react';
import type { SandboxLabels } from '../../../../types/labels.js';
import { useSandboxDispatch, useSandboxDocRef, useSandboxLabels, useSandboxSelector, useSandboxStore } from '../../../../context/SandboxContext.js';
import { FieldRow, TextControl } from '../../../../controls/index.js';
import { Button } from '../../../../ui/index.js';
import { applyTemplateRewrite, bookChapters, canUndoTemplateRewrite, undoTemplateRewrite, type TemplateRewriteRecord } from '../../../../templates/applyTemplateRewrite.js';
import { planFramesToGrid, type GridRefusal } from '../../../../templates/framesToGrid.js';
import { planExtractModule, type ExtractRefusal } from '../../../../templates/moduleEdits.js';
import { laidTemplatePage } from '../../../../templates/pagePieces.js';

const noSubscription = () => () => undefined;
const noVersion = () => 0;

/** The words of a refusal, the frames it names filled in. */
export function reshapeRefusal(labels: SandboxLabels, reason: GridRefusal | ExtractRefusal, frames: readonly string[] = []): string {
  const text: Record<GridRefusal | ExtractRefusal, string> = {
    tooFew: labels.pageTemplatesReshapeTooFew,
    unknown: labels.pageTemplatesReshapeNotLaid,
    inherited: labels.pageTemplatesReshapeInherited,
    notLaid: labels.pageTemplatesReshapeNotLaid,
    flow: labels.pageTemplatesReshapeFlow,
    repeated: labels.pageTemplatesReshapeRepeated,
    notLattice: labels.pageTemplatesReshapeNotLattice,
    widths: labels.pageTemplatesReshapeWidths,
    members: labels.pageTemplatesReshapeMembers,
    splitsGrid: labels.pageTemplatesReshapeSplitsGrid,
    hasModules: labels.pageTemplatesReshapeHasModules,
    isModule: labels.pageTemplatesReshapeIsModule,
    empty: labels.pageTemplatesReshapeTooFew,
  };
  return text[reason].replace('__frames__', frames.join(', ')).trim();
}

interface ReshapeFramesProps {
  templateId: string;
  /** The template's own frames, in order. */
  frames: readonly string[];
  /** The page a frame was picked on, read first. */
  pageIndex: number | null;
}

/**
 * «Reshape frames» (#1065): frames of the template picked, then turned into
 * a grid that repeats the first card's set, or moved into a new module. The
 * boxes are read off the first page of the document on screen set with the
 * template; the change rewrites the template and every page set with it,
 * and the section's Undo takes it back while it is the latest change.
 */
export function ReshapeFrames({ templateId, frames, pageIndex }: ReshapeFramesProps) {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const docRef = useSandboxDocRef();
  const docVersion = useSandboxSelector((s) => s.docVersion);
  const templates = useSandboxSelector((s) => s.config.pageTemplates) ?? [];
  const chapters = useSandboxSelector((s) => s.chapters);
  const markdown = useSandboxSelector((s) => s.markdown) ?? '';
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const history = useSandboxStore().history;
  useSyncExternalStore(history?.subscribe ?? noSubscription, history?.getVersion ?? noVersion, history?.getVersion ?? noVersion);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [last, setLast] = useState<TemplateRewriteRecord | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the document behind the ref changes with `docVersion`.
  const laid = useMemo(() => (docRef?.current ? laidTemplatePage(docRef.current, templateId, pageIndex) : null), [docRef, docVersion, templateId, pageIndex]);
  const chosen = picked.filter((f) => frames.includes(f));

  const run = (kind: 'grid' | 'module') => {
    if (!laid) {
      setStatus({ ok: false, text: labels.pageTemplatesReshapeNoPage });
      return;
    }
    const texts = bookChapters({ chapters: chapters ?? [], activeChapterId, markdown });
    if (kind === 'grid') {
      const plan = planFramesToGrid({ templates, templateId, frames: chosen, laid, chapters: texts });
      if (!plan.ok) return setStatus({ ok: false, text: reshapeRefusal(labels, plan.reason, plan.frames) });
      setLast(applyTemplateRewrite(dispatch, plan, activeChapterId));
      setPicked([]);
      setStatus({
        ok: true,
        text: labels.pageTemplatesToGridDone
          .replace('__group__', plan.group)
          .replace('__columns__', String(plan.columns))
          .replace('__count__', String(Object.values(plan.instances).filter((n) => n.startsWith(`${plan.main}[`)).length))
          .replace('__pages__', String(plan.pages)),
      });
      return;
    }
    const plan = planExtractModule({ templates, templateId, frames: chosen, name: name.trim() || labels.modulesNewName, laid, chapters: texts });
    if (!plan.ok) return setStatus({ ok: false, text: reshapeRefusal(labels, plan.reason, plan.frames) });
    setLast(applyTemplateRewrite(dispatch, plan, activeChapterId));
    setPicked([]);
    setName('');
    setStatus({ ok: true, text: labels.pageTemplatesExtractDone.replace('__name__', plan.module).replace('__pages__', String(plan.pages)) });
  };

  const undoable = canUndoTemplateRewrite(history, last);
  return (
    <div className="mt-2 rounded border p-2" style={{ borderColor: 'var(--rule)' }}>
      <p className="mb-1 text-[0.75rem] font-medium">{labels.pageTemplatesReshape}</p>
      <p className="mb-1 text-[0.7rem]" style={{ color: 'var(--slate)' }}>{labels.pageTemplatesReshapeHint}</p>
      <fieldset className="m-0 border-0 p-0">
        <legend className="sr-only">{labels.pageTemplatesReshapeFrames}</legend>
        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-0.5 p-0">
          {frames.map((f) => (
            <li key={f} className="flex min-h-6 items-center text-xs">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={chosen.includes(f)} onChange={(e) => setPicked(e.target.checked ? [...chosen, f] : chosen.filter((x) => x !== f))} />
                <span dir="ltr">{f}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Button variant="outline" size="xs" icon={<Grid3x3 size={12} aria-hidden="true" />} onClick={() => run('grid')} disabled={chosen.length < 2}>
          {labels.pageTemplatesToGrid}
        </Button>
      </div>
      <FieldRow stacked label={labels.pageTemplatesExtractName}>
        <TextControl value={name} onChange={setName} ariaLabel={labels.pageTemplatesExtractName} placeholder={labels.modulesNewName} widthCh={18} />
      </FieldRow>
      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="xs" icon={<PackagePlus size={12} aria-hidden="true" />} onClick={() => run('module')} disabled={chosen.length === 0}>
          {labels.pageTemplatesExtractModule}
        </Button>
        {undoable && last && (
          <Button variant="ghost" size="xs" icon={<Undo2 size={12} aria-hidden="true" />} onClick={() => { if (history) undoTemplateRewrite(history, last); setLast(null); setStatus(null); }}>
            {labels.pageTemplatesReshapeUndo}
          </Button>
        )}
      </div>
      <p role="status" className="mt-1 mb-0 text-[0.7rem]" style={{ color: status && !status.ok ? 'var(--danger, var(--foreground))' : 'var(--slate)' }}>
        {status?.text ?? (laid ? '' : labels.pageTemplatesReshapeNoPage)}
      </p>
    </div>
  );
}
