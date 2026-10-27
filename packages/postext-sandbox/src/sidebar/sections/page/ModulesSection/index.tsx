'use client';

import { memo, useMemo, useState } from 'react';
import { PackagePlus, PenLine, Plus, X } from 'lucide-react';
import { resolvePageTemplate } from 'postext';
import type { SandboxLabels } from '../../../../types/labels.js';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../../context/SandboxContext.js';
import { CollapsibleSection, SelectInput } from '../../../../controls/index.js';
import { Button, IconButton } from '../../../../ui/index.js';
import { applyTemplateRewrite, bookChapters } from '../../../../templates/applyTemplateRewrite.js';
import { chapterPages, createModule, moduleTemplates, moduleUsage, pageAtOffset, planInsertModule, renameModuleChanges, type ModuleUsage } from '../../../../templates/moduleEdits.js';
import { templateSheet } from '../../../../templates/templateSheet.js';
import { applyViewerEdit } from '../../../../editor/viewerEdits.js';
import { TemplateSheetSvg } from '../PageTemplatesSection/TemplateSheetSvg.js';
import { TemplateEditor } from '../PageTemplatesSection/index.js';
import { moduleWidthText } from '../PageTemplatesSection/ModuleWidthField.js';

/** «2 blocks on 1 page», «Not used yet». */
export function moduleUsageText(labels: SandboxLabels, u: ModuleUsage | undefined): string {
  if (!u || u.blocks === 0) return labels.modulesUsageNone;
  const blocks = u.blocks === 1 ? labels.modulesBlocksOne : labels.modulesBlocksMany.replace('__count__', String(u.blocks));
  const pages = u.pages === 1 ? labels.modulesPagesOne : labels.modulesPagesMany.replace('__count__', String(u.pages));
  return labels.modulesUsageText.replace('__blocks__', blocks).replace('__pages__', pages);
}

/**
 * Design › Page & columns › Modules (#1065): the book's module templates
 * (#1062) as a library, each drawn with what the book's `:::module` blocks
 * make of it (blocks and pages), made from scratch, edited in place (the
 * page-template editor opened on it, its id rewriting the blocks that name
 * it), and written into a composed page of the chapter in the editor as a
 * `:::module` block with an empty slot for each frame.
 */
export const ModulesSection = memo(function ModulesSection() {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const config = useSandboxSelector((s) => s.config);
  const templates = useMemo(() => config.pageTemplates ?? [], [config.pageTemplates]);
  const chapters = useSandboxSelector((s) => s.chapters);
  const markdown = useSandboxSelector((s) => s.markdown) ?? '';
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const caret = useSandboxSelector((s) => s.selection?.head ?? 0);
  const texts = useMemo(() => bookChapters({ chapters: chapters ?? [], activeChapterId, markdown }), [chapters, activeChapterId, markdown]);
  const usage = useMemo(() => moduleUsage(templates, texts), [templates, texts]);
  const modules = moduleTemplates(templates);
  const [editing, setEditing] = useState<string | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // The composed pages of the chapter in the editor; the one the caret is
  // in first.
  const pages = useMemo(() => chapterPages(markdown), [markdown]);
  const atCaret = pageAtOffset(markdown, caret);
  const [chosenPage, setChosenPage] = useState<number | null>(null);
  const page = chosenPage !== null && pages.some((p) => p.fence === chosenPage) ? chosenPage : atCaret ?? pages[0]?.fence ?? null;

  const write = (next: readonly typeof templates[number][]) =>
    dispatch({ type: 'UPDATE_CONFIG', payload: { pageTemplates: next.length > 0 ? [...next] : undefined } });

  const onNew = () => {
    const out = createModule(templates, labels.modulesNewName);
    write(out.templates);
    setEditing(out.id);
    setFrame(null);
  };

  const insert = (id: string) => {
    if (page === null) return;
    const chapter = texts.find((c) => c.id === activeChapterId);
    if (!chapter) return;
    const plan = planInsertModule(templates, chapter, page, id);
    if (!plan.ok) {
      setStatus(plan.reason === 'pageTemplate' ? labels.modulesInsertRefused : labels.modulesInsertNoPage);
      return;
    }
    applyTemplateRewrite(dispatch, plan, activeChapterId);
    // The caret in the module's first slot, to write there.
    dispatch({ type: 'SET_PENDING_EDITOR_FOCUS', payload: { chapterId: chapter.id, anchor: plan.caret, head: plan.caret, selectWord: false, fromViewer: true } });
    const number = String(page + 1);
    setStatus(plan.added
      ? labels.modulesInsertDoneGroup.replace('__number__', number).replace('__template__', plan.pageTemplate).replace('__group__', plan.group)
      : labels.modulesInsertDone.replace('__number__', number));
  };

  const pageOptions = pages.map((p) => ({ value: String(p.fence), label: labels.modulesInsertPageOption.replace('__number__', String(p.fence + 1)).replace('__template__', p.template || '—') }));

  return (
    <CollapsibleSection title={labels.modulesSection} sectionId="modules" hasOverrides={modules.length > 0}>
      {modules.length === 0 && <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>{labels.modulesEmpty}</p>}
      {pages.length > 0 ? (
        <SelectInput
          label={labels.modulesInsertPage}
          tooltip={labels.modulesInsertPageTooltip}
          value={page !== null ? String(page) : ''}
          options={pageOptions}
          onChange={(v) => setChosenPage(Number(v))}
        />
      ) : (
        modules.length > 0 && <p className="mb-2 text-[0.7rem]" style={{ color: 'var(--slate)' }}>{labels.modulesInsertNoPage}</p>
      )}
      {modules.length > 0 && (
        <ul className="m-0 mb-2 flex list-none flex-col gap-1 p-0" aria-label={labels.modulesListLabel}>
          {modules.map((t) => {
            const resolved = resolvePageTemplate({ pageTemplates: templates }, t.id);
            const sheet = resolved ? templateSheet(config, resolved, 'recto') : null;
            const name = t.name || t.id;
            const open = editing === t.id;
            return (
              <li key={t.id} className="rounded border px-1.5 py-1" style={{ borderColor: open ? 'var(--brand)' : 'var(--rule)' }}>
                <div className="flex min-h-11 items-center gap-2">
                  {sheet && <TemplateSheetSvg sheet={sheet} width={40} />}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs font-medium" style={{ color: 'var(--foreground)' }}>{name}</span>
                    <span className="truncate text-[0.7rem]" style={{ color: 'var(--slate)' }}>
                      <span dir="ltr">{t.id}</span>
                      {' · '}
                      {moduleUsageText(labels, usage.get(t.id))}
                    </span>
                    {/* Its width in a row of modules (#1088). */}
                    <span className="truncate text-[0.7rem]" style={{ color: 'var(--slate)' }}>
                      {labels.modulesWidthText.replace('__width__', moduleWidthText(resolved?.width, labels.modulesWidthShare))}
                    </span>
                  </span>
                  <IconButton
                    label={labels.modulesEditLabel.replace('__name__', name)}
                    icon={<PenLine size={14} aria-hidden="true" />}
                    active={open}
                    aria-pressed={open}
                    onClick={() => { setEditing(open ? null : t.id); setFrame(null); }}
                  />
                  <IconButton
                    label={labels.modulesInsertLabel.replace('__name__', name)}
                    icon={<PackagePlus size={14} aria-hidden="true" />}
                    disabled={page === null}
                    onClick={() => insert(t.id)}
                  />
                </div>
                {open && (
                  <div className="mt-1">
                    <div className="mb-1 flex justify-end">
                      <Button variant="ghost" size="xs" icon={<X size={12} aria-hidden="true" />} onClick={() => setEditing(null)}>{labels.modulesClose}</Button>
                    </div>
                    <TemplateEditor
                      key={t.id}
                      id={t.id}
                      scope="base"
                      pages={usage.get(t.id)?.pages ?? 0}
                      frame={frame}
                      onScope={() => undefined}
                      onFrame={setFrame}
                      onRenamed={(next) => {
                        // Every :::module block that named it names it anew.
                        for (const ch of texts) {
                          const changes = renameModuleChanges(ch.markdown, t.id, next);
                          if (changes.length > 0) applyViewerEdit(dispatch, ch.id, changes, ch.markdown.length);
                        }
                        setEditing(next);
                      }}
                      onRemoved={() => setEditing(null)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mb-1 flex flex-wrap gap-1.5">
        <Button variant="outline" size="xs" icon={<Plus size={12} aria-hidden="true" />} onClick={onNew}>{labels.modulesNew}</Button>
      </div>
      <p role="status" className="m-0 text-[0.7rem]" style={{ color: 'var(--slate)' }}>{status ?? ''}</p>
    </CollapsibleSection>
  );
});
