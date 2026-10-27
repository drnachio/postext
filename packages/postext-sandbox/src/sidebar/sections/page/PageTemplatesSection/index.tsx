'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { Copy, LayoutTemplate, Plus, Trash2 } from 'lucide-react';
import { resolveDesignSlot, resolveHeaderFooterConfig, resolvePageTemplate, type DesignSlot, type PageTemplate, type VDTDocument } from 'postext';
import { useSandboxDocRef, useSandboxLabels, useSandboxSelector } from '../../../../context/SandboxContext.js';
import { CollapsibleSection, DimensionInput, FieldGroup, FieldRow, NumberInput, SelectInput, TextControl, ToggleSwitch } from '../../../../controls/index.js';
import { Button, ConfirmPopover, SegmentedControl } from '../../../../ui/index.js';
import { SearchScope } from '../../../search/SearchScope.js';
import { applyViewerEdit } from '../../../../editor/viewerEdits.js';
import { templateEditor, useTemplateEditor } from '../../../../templates/editorStore.js';
import {
  addFrame,
  createTemplate,
  descendantsOf,
  duplicateTemplate,
  inheritedDecoration,
  joinDecoration,
  namesInUse,
  newFrameFor,
  removeTemplate,
  renameTemplate,
  setInheritedElementHidden,
  slugify,
  splitDecoration,
  templateAt,
  templateFromLayout,
  uniqueName,
  updateTemplate,
  type TemplateScope,
} from '../../../../templates/templateEdits.js';
import { renameTemplateChanges } from '../../../../templates/templateUsage.js';
import { renameModuleChanges } from '../../../../templates/moduleEdits.js';
import { ReshapeFrames } from './ReshapeFrames.js';
import { pageAreas, templateAreaRect } from '../../../../templates/frameGeometry.js';
import { templateSheet } from '../../../../templates/templateSheet.js';
import { SlotEditor } from '../../running/HeaderFooterSection/SlotEditor.js';
import { templateFrameInputs } from '../../../../templates/connectorEdits.js';
import { FrameProperties } from './FrameProperties.js';
import { GroupsEditor } from './GroupsEditor.js';
import { ModuleShareFields, ModuleWidthField } from './ModuleWidthField.js';
import { TemplateSheetSvg } from './TemplateSheetSvg.js';
import { laidHeights, resolveAt, usePageTemplates } from './model.js';

/** The composed page «Save layout as template» reads: the one a frame was
 *  picked on, else the first of the document. */
function layoutSource(doc: VDTDocument | null, pageIndex: number | null) {
  if (!doc) return null;
  const at = pageIndex !== null ? doc.pages[pageIndex] : undefined;
  const page = at?.composed ? at : doc.pages.find((p) => p.composed);
  return page?.composed ? { page, composed: page.composed } : null;
}

/** Design › Page templates (#863): the book's page templates with a
 *  drawing of each and the number of pages using it, the template being
 *  edited (its fields, variants, frames, groups, decoration and running
 *  heads) and the Design-mode switch of the canvas. */
export const PageTemplatesSection = memo(function PageTemplatesSection() {
  const labels = useSandboxLabels();
  const { templates, write, counts, dispatch, chapters } = usePageTemplates();
  const config = useSandboxSelector((s) => s.config);
  const docRef = useSandboxDocRef();
  const docVersion = useSandboxSelector((s) => s.docVersion);
  const editor = useTemplateEditor();
  const selection = editor.selection;
  const selectedId = selection && templates.some((t) => t.id === selection.templateId) ? selection.templateId : templates[0]?.id ?? null;
  const scope: TemplateScope = selection && selection.templateId === selectedId ? selection.scope : 'base';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the document behind the ref changes with `docVersion`.
  const heights = useMemo(() => laidHeights(docRef?.current ?? null), [docRef, docVersion]);
  const source = useMemo(() => layoutSource(docRef?.current ?? null, selection?.pageIndex ?? null), [docRef, docVersion, selection?.pageIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (templateId: string, patch: Partial<{ scope: TemplateScope; frame: string | null; group: string | null }> = {}) =>
    templateEditor.select({ templateId, scope: patch.scope ?? 'base', frame: patch.frame ?? null, group: patch.group ?? null, pageIndex: null });

  const pagesText = (n: number) => (n === 1 ? labels.pageTemplatesPagesOne : labels.pageTemplatesPagesMany).replace('__count__', String(n));

  const onNew = () => {
    const out = createTemplate(templates, labels.pageTemplatesNewName);
    write(out.templates);
    // Its text frame is picked, so the fields of the frame are in view.
    select(out.id, { frame: out.templates.find((t) => t.id === out.id)?.frames?.[0]?.name ?? null });
  };
  const onDuplicate = () => {
    if (!selectedId) return;
    const t = templateAt(templates, selectedId)!.template;
    const out = duplicateTemplate(templates, selectedId, labels.pageTemplatesCopyName.replace('__name__', t.name || t.id));
    write(out.templates);
    select(out.id);
  };
  const onSaveLayout = () => {
    const doc = docRef?.current ?? null;
    if (!doc || !source) return;
    const resolved = resolvePageTemplate(config, source.composed.template, source.composed.variant ? { parity: source.composed.variant } : {});
    if (!resolved) return;
    const area = templateAreaRect(resolved.area, pageAreas(source.page, doc.trimOffset));
    const rects = new Map(source.composed.frames.map((f) => [f.name, f.rect]));
    const name = labels.pageTemplatesLayoutName.replace('__name__', resolved.name || resolved.id);
    const out = templateFromLayout(templates, resolved, rects, area, doc.config.page.dpi, name);
    write(out.templates);
    select(out.id);
  };

  return (
    <CollapsibleSection
      title={labels.pageTemplatesSection}
      sectionId="pageTemplates"
      hasOverrides={templates.length > 0}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { pageTemplates: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.pageTemplatesResetConfirm}
    >
      <ToggleSwitch
        label={labels.pageTemplatesDesignMode}
        tooltip={labels.pageTemplatesDesignModeTooltip}
        checked={editor.designMode}
        onChange={(v) => templateEditor.setDesignMode(v)}
        isDefault={!editor.designMode}
      />
      {templates.length === 0 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>{labels.pageTemplatesEmpty}</p>
      )}
      {templates.length > 0 && (
        <ul className="m-0 mb-2 flex list-none flex-col gap-1 p-0" aria-label={labels.pageTemplatesListLabel}>
          {templates.map((t) => {
            const resolved = resolvePageTemplate({ pageTemplates: templates }, t.id);
            const sheet = resolved ? templateSheet(config, resolved, 'recto', heights.get(t.id)) : null;
            const n = counts.get(t.id) ?? 0;
            const active = t.id === selectedId;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => select(t.id)}
                  className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded border px-1.5 py-1 text-start"
                  style={{ borderColor: active ? 'var(--brand)' : 'var(--rule)', background: active ? 'var(--surface)' : 'transparent' }}
                >
                  {sheet && <TemplateSheetSvg sheet={sheet} width={resolved!.spread ? 72 : 40} />}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-medium" style={{ color: 'var(--foreground)' }}>{t.name || t.id}</span>
                    <span className="truncate text-[0.7rem]" style={{ color: 'var(--slate)' }}>
                      <span dir="ltr">{t.id}</span>
                      {' · '}
                      {t.role === 'module' ? labels.pageTemplatesModuleTag : pagesText(n)}
                      {t.extends ? ` · ${labels.pageTemplatesBasedOnShort.replace('__name__', templateAt(templates, t.extends)?.template.name || t.extends)}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Button variant="outline" size="xs" icon={<Plus size={12} aria-hidden="true" />} onClick={onNew}>{labels.pageTemplatesNew}</Button>
        <Button variant="outline" size="xs" icon={<Copy size={12} aria-hidden="true" />} onClick={onDuplicate} disabled={!selectedId}>{labels.pageTemplatesDuplicate}</Button>
        <Button variant="outline" size="xs" icon={<LayoutTemplate size={12} aria-hidden="true" />} onClick={onSaveLayout} disabled={!source} aria-describedby={source ? undefined : 'pt-save-layout-none'}>
          {labels.pageTemplatesSaveLayout}
        </Button>
      </div>
      {!source && templates.length > 0 && (
        <p id="pt-save-layout-none" className="mb-2 text-[0.7rem]" style={{ color: 'var(--slate)' }}>{labels.pageTemplatesSaveLayoutNone}</p>
      )}
      {selectedId && (
        <TemplateEditor
          key={selectedId}
          id={selectedId}
          scope={scope}
          pages={counts.get(selectedId) ?? 0}
          heights={heights.get(selectedId)}
          onScope={(s) => select(selectedId, { scope: s, frame: selection?.frame ?? null })}
          frame={selection?.templateId === selectedId ? selection.frame : null}
          pageIndex={selection?.pageIndex ?? null}
          onFrame={(f) => templateEditor.select({ templateId: selectedId, scope, frame: f, group: null, pageIndex: selection?.pageIndex ?? null })}
          onRenamed={(next) => {
            // A page fence names a template; a :::module block, a module (#1065).
            const isModule = templates.find((t) => t.id === selectedId)?.role === 'module';
            for (const ch of chapters) {
              const changes = isModule ? renameModuleChanges(ch.markdown, selectedId, next) : renameTemplateChanges(ch.markdown, selectedId, next);
              if (changes.length > 0) applyViewerEdit(dispatch, ch.id, changes, ch.markdown.length);
            }
            select(next, { scope });
          }}
          onRemoved={() => templateEditor.select(null)}
        />
      )}
    </CollapsibleSection>
  );
});

export interface TemplateEditorProps {
  id: string;
  scope: TemplateScope;
  pages: number;
  heights?: ReadonlyMap<string, number>;
  frame: string | null;
  /** The page a frame was picked on: «Reshape frames» reads it first. */
  pageIndex?: number | null;
  onScope: (scope: TemplateScope) => void;
  onFrame: (frame: string | null) => void;
  onRenamed: (id: string) => void;
  onRemoved: () => void;
}

/** One template's editor (the Page templates section; the Modules section
 *  opens it on a module, #1065). */
export function TemplateEditor({ id, scope, pages, heights, frame, pageIndex = null, onScope, onFrame, onRenamed, onRemoved }: TemplateEditorProps) {
  const labels = useSandboxLabels();
  const { templates, write } = usePageTemplates();
  const config = useSandboxSelector((s) => s.config);
  const own = templateAt(templates, id)?.template;
  const [idDraft, setIdDraft] = useState(id);
  useEffect(() => setIdDraft(id), [id]);
  const resolved = resolveAt({ pageTemplates: templates }, id, own?.spread || own?.role === 'module' ? 'base' : scope);
  if (!own || !resolved) return null;
  const spread = resolved.spread;
  // A module (#1062, #1065) has no area, running heads, variants or spread.
  const isMod = resolved.role === 'module';
  const effScope: TemplateScope = spread || isMod ? 'base' : scope;
  const scoped = (effScope === 'base' ? own : own.variants?.[effScope]) ?? {};
  const sheet = templateSheet(config, resolved, effScope === 'verso' ? 'verso' : 'recto', heights);
  const set = (patch: Partial<PageTemplate>) => write(updateTemplate(templates, id, effScope, patch));
  const has = (k: keyof PageTemplate) => (k === 'name' || k === 'extends' || k === 'spread' || k === 'gutter' || k === 'role' ? own[k] : (scoped as Record<string, unknown>)[k]) !== undefined;
  const parents = templates.filter((t) => t.id !== id && !descendantsOf(templates, id).includes(t.id));

  const commitId = () => {
    const next = slugify(idDraft);
    if (!next || next === id || templates.some((t) => t.id === next)) {
      setIdDraft(id);
      return;
    }
    write(renameTemplate(templates, id, next));
    onRenamed(next);
  };

  const headSelect = (k: 'header' | 'footer') => {
    const value = (scoped as Record<string, unknown>)[k] as DesignSlot | false | undefined;
    const mode = value === false ? 'hidden' : value === undefined ? 'book' : 'own';
    return (
      <>
        <SelectInput
          label={k === 'header' ? labels.pageTemplatesHeader : labels.pageTemplatesFooter}
          value={mode}
          options={[
            { value: 'book', label: labels.pageTemplatesHeadBook },
            { value: 'hidden', label: labels.pageTemplatesHeadHidden },
            { value: 'own', label: labels.pageTemplatesHeadOwn },
          ]}
          onChange={(v) => set({ [k]: v === 'book' ? undefined : v === 'hidden' ? false : { elements: [] } })}
          tooltip={labels.pageTemplatesHeadTooltip}
          isDefault={!has(k)}
          onReset={() => set({ [k]: undefined })}
        />
        {mode === 'own' && value && (
          <SlotEditor slotKey={k} raw={value} resolved={resolveHeaderFooterConfig(value, k)} onUpdate={(slot) => set({ [k]: slot ?? { elements: [] } })} />
        )}
      </>
    );
  };

  const grid = scoped.grid;
  // The elements the scope draws and the inherited ones it hides (#975).
  const { slot: decoration, hidden: hiddenElements } = splitDecoration(scoped.decoration);
  const inherited = inheritedDecoration(templates, id, effScope).elements;
  const addNewFrame = () => {
    const name = uniqueName(namesInUse(templates, id), 'frame');
    // Sized like the frames of the group it will join (#991).
    write(addFrame(templates, id, effScope, newFrameFor(name, resolved)));
    onFrame(name);
  };

  return (
    <SearchScope title={`${own.name ?? ''} ${own.id}`} overridden>
      <div className="rounded border p-2" style={{ borderColor: 'var(--rule)' }}>
        {!spread && !isMod && (
          <FieldRow stacked label={labels.pageTemplatesScope} tooltip={labels.pageTemplatesScopeTooltip}>
            <SegmentedControl<TemplateScope>
              value={effScope}
              onValueChange={onScope}
              ariaLabel={labels.pageTemplatesScope}
              size="sm"
              fill
              options={[
                { value: 'base', label: labels.pageTemplatesScopeBase },
                { value: 'recto', label: labels.pageTemplatesScopeRecto },
                { value: 'verso', label: labels.pageTemplatesScopeVerso },
              ]}
            />
          </FieldRow>
        )}
        <div className="mx-auto my-2" style={{ maxWidth: spread ? '100%' : '13rem' }}>
          <TemplateSheetSvg
            sheet={sheet}
            width={spread ? 280 : 200}
            fluid
            selectedFrame={frame}
            onSelectFrame={(n) => onFrame(n)}
            frameLabel={labels.pageTemplatesSheetFrame}
            gutterLabel={labels.pageTemplatesGutter}
          />
        </div>
        <p className="mb-2 text-[0.7rem]" style={{ color: 'var(--slate)' }}>
          {spread ? labels.pageTemplatesSheetSpreadHint : labels.pageTemplatesSheetHint}
        </p>

        <FieldGroup title={labels.pageTemplatesGroupTemplate}>
          <FieldRow stacked label={labels.idLabel} tooltip={labels.pageTemplatesIdTooltip} hint={pages > 0 ? labels.pageTemplatesIdHint : undefined}>
            <TextControl value={idDraft} onChange={setIdDraft} onBlur={commitId} ariaLabel={labels.idLabel} widthCh={18} />
          </FieldRow>
          <FieldRow stacked label={labels.pageTemplatesName} tooltip={labels.pageTemplatesNameTooltip}>
            <TextControl value={own.name ?? ''} onChange={(v) => set({ name: v || undefined })} ariaLabel={labels.pageTemplatesName} placeholder={own.id} widthCh={18} />
          </FieldRow>
          <SelectInput
            label={labels.pageTemplatesBasedOn}
            value={own.extends ?? ''}
            options={[{ value: '', label: labels.pageTemplatesBasedOnNone }, ...parents.map((t) => ({ value: t.id, label: t.name || t.id }))]}
            onChange={(v) => set({ extends: v || undefined })}
            tooltip={labels.pageTemplatesBasedOnTooltip}
            isDefault={!has('extends')}
            onReset={() => set({ extends: undefined })}
          />
          <ToggleSwitch
            label={labels.pageTemplatesModuleRole}
            tooltip={labels.pageTemplatesModuleRoleTooltip}
            checked={isMod}
            onChange={(v) => set(v ? { role: 'module', spread: undefined, gutter: undefined, area: undefined, header: undefined, footer: undefined, overflowTemplate: undefined, variants: undefined } : { role: undefined, width: undefined, grow: undefined, shrink: undefined })}
            isDefault={!has('role')}
          />
          {isMod && <ModuleWidthField value={resolved.width} isDefault={!has('width')} onChange={(w) => set({ width: w })} />}
          {isMod && (
            <ModuleShareFields
              width={resolved.width}
              grow={resolved.grow}
              shrink={resolved.shrink}
              growSet={has('grow')}
              shrinkSet={has('shrink')}
              onChange={(patch) => set(patch)}
            />
          )}
          {!isMod && (
          <>
          <ToggleSwitch label={labels.pageTemplatesSpread} tooltip={labels.pageTemplatesSpreadTooltip} checked={spread} onChange={(v) => set({ spread: v || undefined })} isDefault={!has('spread')} onReset={() => set({ spread: undefined })} />
          {spread && (
            <DimensionInput label={labels.pageTemplatesGutter} value={resolved.gutter} onChange={(d) => set({ gutter: d })} tooltip={labels.pageTemplatesGutterTooltip} isDefault={!has('gutter')} onReset={() => set({ gutter: undefined })} />
          )}
          <SelectInput
            label={labels.pageTemplatesArea}
            value={resolved.area}
            options={[
              { value: 'content', label: labels.pageTemplatesAreaContent },
              { value: 'trim', label: labels.pageTemplatesAreaTrim },
              { value: 'bleed', label: labels.pageTemplatesAreaBleed },
            ]}
            onChange={(v) => set({ area: v as PageTemplate['area'] })}
            tooltip={labels.pageTemplatesAreaTooltip}
            isDefault={!has('area')}
            onReset={() => set({ area: undefined })}
          />
          {/* The pages a frame's content goes on to (#859). */}
          <SelectInput
            label={labels.pageTemplatesOverflowTemplate}
            value={resolved.overflowTemplate ?? ''}
            options={[{ value: '', label: labels.pageTemplatesOverflowTemplateSame }, ...templates.filter((t) => t.id !== id).map((t) => ({ value: t.id, label: t.name || t.id }))]}
            onChange={(v) => set({ overflowTemplate: v || undefined })}
            tooltip={labels.pageTemplatesOverflowTemplateTooltip}
            isDefault={!has('overflowTemplate')}
            onReset={() => set({ overflowTemplate: undefined })}
          />
          </>
          )}
          <FieldRow stacked label={labels.pageTemplatesPalette} tooltip={labels.pageTemplatesPaletteTooltip}>
            <TextControl
              value={scoped.palette ?? ''}
              onChange={(v) => set({ palette: v.trim() === '' ? undefined : v })}
              ariaLabel={labels.pageTemplatesPalette}
              placeholder="tint=#f6c3d0"
              widthCh={24}
            />
          </FieldRow>
          {!isMod && <NumberInput
            label={labels.pageTemplatesGridColumns}
            value={resolved.grid?.columns ?? 0}
            min={0}
            max={24}
            onChange={(n) => set({ grid: n === 0 ? undefined : { ...(grid ?? {}), columns: n, rows: grid?.rows ?? resolved.grid?.rows ?? 1 } })}
            tooltip={labels.pageTemplatesGridTooltip}
            isDefault={!has('grid')}
            onReset={() => set({ grid: undefined })}
          />}
          {resolved.grid && !isMod && (
            <>
              <NumberInput label={labels.pageTemplatesGridRows} value={resolved.grid.rows} min={1} max={48} onChange={(n) => set({ grid: { ...resolved.grid!, ...(grid ?? {}), rows: n } })} isDefault={!has('grid')} />
              <DimensionInput label={labels.pageTemplatesGridColumnGap} value={resolved.grid.columnGap} onChange={(d) => set({ grid: { ...resolved.grid!, ...(grid ?? {}), columnGap: d } })} isDefault={!has('grid')} />
              <DimensionInput label={labels.pageTemplatesGridRowGap} value={resolved.grid.rowGap} onChange={(d) => set({ grid: { ...resolved.grid!, ...(grid ?? {}), rowGap: d } })} isDefault={!has('grid')} />
            </>
          )}
          <ConfirmPopover message={labels.pageTemplatesDeleteConfirm.replace('__count__', String(pages))} onConfirm={() => { write(removeTemplate(templates, id)); onRemoved(); }}>
            {({ open }) => (
              <Button variant="ghost" size="xs" icon={<Trash2 size={12} aria-hidden="true" />} onClick={open}>
                {labels.pageTemplatesDelete}
              </Button>
            )}
          </ConfirmPopover>
        </FieldGroup>

        <FieldGroup title={labels.pageTemplatesGroupFrames} description={labels.pageTemplatesGroupFramesDescription}>
          <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label={labels.pageTemplatesGroupFrames}>
            {resolved.frames.map((f) => (
              <button
                key={f.name}
                type="button"
                aria-pressed={f.name === frame}
                onClick={() => onFrame(f.name === frame ? null : f.name)}
                className="min-h-8 cursor-pointer rounded border px-2 text-xs"
                style={{ borderColor: f.name === frame ? 'var(--brand)' : 'var(--rule)', color: f.name === frame ? 'var(--brand)' : 'var(--foreground)' }}
              >
                <span dir="ltr">{f.name}</span>
              </button>
            ))}
          </div>
          <Button variant="outline" size="xs" icon={<Plus size={12} aria-hidden="true" />} onClick={addNewFrame}>{labels.pageTemplatesFrameAdd}</Button>
          {frame && resolved.frames.some((f) => f.name === frame) && (
            // Keyed by the frame: a field left with a draft in it never commits
            // into the next frame picked.
            <FrameProperties key={`${id}:${effScope}:${frame}`} templateId={id} scope={effScope} name={frame} onRenamed={(n) => onFrame(n)} onRemoved={() => onFrame(null)} />
          )}
          {/* One-off frames into a grid or a module (#1065): the template's
              own frames, on a page that is not a spread. */}
          {effScope === 'base' && !spread && !isMod && (own.frames ?? []).length > 1 && (
            <ReshapeFrames key={id} templateId={id} frames={(own.frames ?? []).filter((f) => !f.remove).map((f) => f.name)} pageIndex={pageIndex} />
          )}
        </FieldGroup>

        <FieldGroup title={labels.pageTemplatesGroupGroups} description={labels.pageTemplatesGroupGroupsDescription}>
          <GroupsEditor templateId={id} scope={effScope} />
        </FieldGroup>

        {!isMod && (
          <FieldGroup title={labels.pageTemplatesGroupRunning}>
            {headSelect('header')}
            {headSelect('footer')}
          </FieldGroup>
        )}

        <FieldGroup title={labels.pageTemplatesGroupDecoration} description={labels.pageTemplatesGroupDecorationDescription}>
          <SlotEditor
            slotKey="part"
            configPath={`/pageTemplates/${templates.findIndex((t) => t.id === id)}${effScope === 'base' ? '' : `/variants/${effScope}`}/decoration`}
            // Frames of a repeating grid are marked: a connector can go to
            // each of their instances (#1063).
            frames={templateFrameInputs(resolved)}
            connectorHost={{ templateId: id, scope: effScope }}
            textOverDefault={isMod}
            raw={decoration}
            extraPlaceholders={['headingNumber']}
            resolved={resolveDesignSlot(decoration, 'part')}
            onUpdate={(slot) => set({ decoration: joinDecoration(slot && slot.elements ? slot : undefined, hiddenElements) })}
          />
          {inherited.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-[0.75rem] font-medium">{labels.pageTemplatesDecorationInherited}</p>
              <p className="mb-1 text-[0.7rem]" style={{ color: 'var(--slate)' }}>{labels.pageTemplatesDecorationInheritedHint}</p>
              {inherited.map((el) => (
                <ToggleSwitch
                  key={el.id}
                  label={`${el.id} (${el.kind})`}
                  checked={!hiddenElements.includes(el.id)}
                  onChange={(show) => write(setInheritedElementHidden(templates, id, effScope, el.id, !show))}
                  tooltip={labels.pageTemplatesDecorationInheritedShowTooltip}
                />
              ))}
            </div>
          )}
        </FieldGroup>
      </div>
    </SearchScope>
  );
}
