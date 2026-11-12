'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';
import { resolveBodyTextConfig, resolveColorValue, resolveLayoutConfig, resolvePageConfig, type ChapterStyleConfig, type PostextConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { Button, ConfirmPopover, IconButton, PanelBody, PanelHeader, Select, announce, cn, type SelectOption } from '../../ui/index.js';
import { PagePreview } from '../../sidebar/settings/PagePreview.js';
import { toPt } from '../../controls/inputs/units.js';
import { downloadBytes } from '../../storage/persistence.js';
import { getProject } from '../../storage/projects.js';
import { fill } from '../../print/fillTokens.js';
import { applyDesign, CHAPTER_STYLE_PARTS, DESIGN_PARTS, extractDesign, templateAsChapterStyle, type DesignPart, type DesignSnapshot } from './designTemplate.js';
import { BUILTIN_TEMPLATES } from './builtinTemplates.js';
import {
  deleteTemplate,
  isTemplateFile,
  listTemplates,
  onTemplatesChange,
  putTemplate,
  restoreTemplateFiles,
  templateFromDesign,
  templateFromFile,
  templateToFile,
  type DesignTemplate,
} from './templateStore.js';

type Labels = ReturnType<typeof useSandboxLabels>;

const PART_LABEL: Record<DesignPart, keyof Labels> = {
  page: 'designPartPage',
  typography: 'designPartTypography',
  composition: 'designPartComposition',
  colors: 'designPartColors',
  headerFooter: 'designPartHeaderFooter',
  print: 'designPartPrint',
};

/** A template as the gallery shows it: a saved one, or one it ships. */
interface GalleryEntry {
  id: string;
  name: string;
  description?: string;
  source?: string;
  builtin: boolean;
  design: DesignSnapshot;
  saved?: DesignTemplate;
}

const THIS_BOOK = '__this-book__';

/** A template being tried on the book: the design before the first try
 *  (what Discard brings back, and what each further try is set over), and
 *  the one on show. Kept while the page lives, so leaving the panel does
 *  not lose it. */
interface Trial {
  base: PostextConfig;
  name: string;
}
let trial: Trial | null = null;
const trialListeners = new Set<() => void>();
function setTrial(next: Trial | null): void {
  trial = next;
  for (const l of trialListeners) l();
}
export function useTemplateTrial(): Trial | null {
  return useSyncExternalStore(
    (l) => { trialListeners.add(l); return () => trialListeners.delete(l); },
    () => trial,
    () => null,
  );
}

/** The saved templates, kept current. */
function useSavedTemplates(): DesignTemplate[] {
  const [list, setList] = useState<DesignTemplate[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => { listTemplates().then((l) => { if (alive) setList(l); }, () => undefined); };
    load();
    const off = onTemplatesChange(load);
    return () => { alive = false; off(); };
  }, []);
  return list;
}

function fileBase(name: string): string {
  return name.trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'template';
}

/**
 * The Templates panel: the designs a book can start from. Try one on the
 * book (Keep or Discard), save the book's design — or another stored
 * book's — as a template of its own, and move templates between machines
 * as files.
 */
export function TemplatesPanel() {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const config = useSandboxSelector((s) => s.config);
  const projects = useSandboxSelector((s) => s.projects);
  const activeProjectId = useSandboxSelector((s) => s.activeProjectId);
  const importRef = useRef<HTMLInputElement>(null);
  const saved = useSavedTemplates();

  // Saving: from this book or any other the sandbox keeps.
  const [from, setFrom] = useState<string>(THIS_BOOK);
  const [name, setName] = useState('');
  const [parts, setParts] = useState<DesignPart[]>([...DESIGN_PARTS]);
  const [busy, setBusy] = useState(false);
  const current = useTemplateTrial();

  const entries = useMemo<GalleryEntry[]>(() => [
    ...saved.map((t) => ({
      id: t.id,
      name: t.name,
      ...(t.description ? { description: t.description } : {}),
      ...(t.source ? { source: t.source } : {}),
      builtin: false,
      design: t.design,
      saved: t,
    })),
    ...BUILTIN_TEMPLATES.map((t) => ({
      id: t.id,
      name: String(labels[t.nameKey]),
      description: String(labels[t.descriptionKey]),
      builtin: true,
      design: { parts: t.parts, config: t.config },
    })),
  ], [saved, labels]);

  const fromOptions: SelectOption[] = [
    { value: THIS_BOOK, label: labels.designTemplateThisBook },
    ...projects.filter((p) => p.id !== activeProjectId).map((p) => ({ value: p.id, label: p.name })),
  ];

  const save = async () => {
    const templateName = name.trim();
    if (!templateName || parts.length === 0) return;
    setBusy(true);
    try {
      let source: PostextConfig = config;
      let bookName: string | undefined = projects.find((p) => p.id === activeProjectId)?.name;
      if (from !== THIS_BOOK) {
        const record = await getProject(from);
        if (!record) {
          announce(labels.designTemplateLoadFailed);
          return;
        }
        source = record.config;
        bookName = record.name;
      }
      const t = await templateFromDesign(templateName, extractDesign(source, parts), bookName ? { source: bookName } : {});
      await putTemplate(t);
      setName('');
      announce(fill(labels.designTemplateSaved, { name: templateName }));
    } catch {
      announce(labels.designTemplateSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  // Each try is set over the design the book had before the first one, so
  // trying several in a row compares them, and Discard returns to it.
  const tryOn = useCallback(async (entry: GalleryEntry, chosen: DesignPart[]) => {
    if (entry.saved) await restoreTemplateFiles(entry.saved);
    const base = trial?.base ?? config;
    setTrial({ base, name: entry.name });
    dispatch({ type: 'SET_CONFIG', payload: applyDesign(base, entry.design, chosen) });
    announce(fill(labels.designTemplateTrying, { name: entry.name }));
  }, [config, dispatch, labels]);

  // A template kept as a chapter style : its chosen parts as a
  // style of the book, for the chapters and sections that name it.
  const asStyle = useCallback(async (entry: GalleryEntry, chosen: DesignPart[], target: { id: string } | { name: string }) => {
    if (entry.saved) await restoreTemplateFiles(entry.saved);
    const { config: next, id } = templateAsChapterStyle(config, entry.design, chosen, target);
    dispatch({ type: 'SET_CONFIG', payload: next });
    const style = next.chapterStyles?.find((st) => st.id === id);
    announce(fill(labels.designTemplateAsStyleDone, { name: style?.name ?? id, id }));
  }, [config, dispatch, labels]);

  const keep = () => {
    if (!current) return;
    setTrial(null);
    announce(fill(labels.designTemplateKept, { name: current.name }));
  };

  const discard = () => {
    if (!current) return;
    dispatch({ type: 'SET_CONFIG', payload: current.base });
    setTrial(null);
    announce(labels.designTemplateUndone);
  };

  const exportEntry = async (entry: GalleryEntry) => {
    const t = entry.saved ?? await templateFromDesign(entry.name, entry.design, entry.description ? { description: entry.description } : {});
    downloadBytes(JSON.stringify(templateToFile(t)), `${fileBase(entry.name)}.postext-template.json`, 'application/json');
  };

  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!isTemplateFile(data)) throw new Error('not a template');
      const t = templateFromFile(data);
      await putTemplate(t);
      announce(fill(labels.designTemplateImported, { name: t.name }));
    } catch {
      announce(fill(labels.designTemplateImportFailed, { file: file.name }));
    }
  };

  const remove = async (entry: GalleryEntry) => {
    await deleteTemplate(entry.id);
    announce(fill(labels.designTemplateDeleted, { name: entry.name }));
  };

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title={labels.navTemplates}
        actions={
          <>
            <IconButton label={labels.designTemplateImport} icon={<Upload size={14} />} onClick={() => importRef.current?.click()} />
            <input ref={importRef} type="file" accept=".json,application/json" className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => void importFile(e)} />
          </>
        }
      />
      <PanelBody padded>
        <div className="flex flex-col gap-4" style={{ fontSize: 13, lineHeight: '19px' }}>
          <p className="m-0 text-xs text-(--slate)">{labels.designTemplatesIntro}</p>

          {current && (
            <div role="status" className="flex flex-col gap-2 rounded-md border border-(--brand) p-2 text-xs">
              <span>{fill(labels.designTemplateTrying, { name: current.name })}</span>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={discard}>{labels.designTemplateDiscard}</Button>
                <Button variant="primary" size="sm" onClick={keep}>{labels.designTemplateKeep}</Button>
              </div>
            </div>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="m-0 text-[0.72rem] font-semibold tracking-[0.12em] text-(--slate) pt-caps">{labels.designTemplatesGallery}</h3>
            {saved.length === 0 && <p className="m-0 text-xs text-(--slate)">{labels.designTemplateEmpty}</p>}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {entries.map((entry) => (
                <TemplateCard
                  key={entry.id}
                  entry={entry}
                  book={current?.base ?? config}
                  labels={labels}
                  active={current?.name === entry.name}
                  onTry={(chosen) => void tryOn(entry, chosen)}
                  styles={config.chapterStyles ?? []}
                  onAsStyle={(chosen, target) => void asStyle(entry, chosen, target)}
                  onExport={() => void exportEntry(entry)}
                  {...(entry.builtin ? {} : { onDelete: () => void remove(entry) })}
                />
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2 rounded-lg border border-(--rule) p-3">
            <h3 className="m-0 text-xs font-semibold">{labels.designTemplateSaveHeading}</h3>
            {fromOptions.length > 1 && (
              <label className="flex flex-col gap-1 text-xs">
                {labels.designTemplateSaveFrom}
                <Select size="sm" value={from} onValueChange={setFrom} options={fromOptions} ariaLabel={labels.designTemplateSaveFrom} />
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs">
              {labels.designTemplateName}
              <input
                type="text"
                value={name}
                placeholder={labels.designTemplateNamePlaceholder}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
                className="rounded border border-(--pt-control-border) bg-(--background) px-2 py-1 text-xs text-(--foreground)"
              />
            </label>
            <PartChoice labels={labels} legend={labels.designTemplateParts} available={DESIGN_PARTS} value={parts} onChange={setParts} />
            <div className="flex justify-end">
              <Button variant="primary" size="sm" onClick={() => void save()} disabled={busy || !name.trim() || parts.length === 0}>
                {labels.designTemplateSave}
              </Button>
            </div>
          </section>
        </div>
      </PanelBody>
    </div>
  );
}

function PartChoice({ labels, legend, available, value, onChange }: {
  labels: Labels;
  legend: string;
  available: readonly DesignPart[];
  value: readonly DesignPart[];
  onChange: (parts: DesignPart[]) => void;
}) {
  return (
    <fieldset className="m-0 flex flex-wrap gap-x-3 gap-y-1 border-0 p-0 text-xs">
      <legend className="mb-1 p-0 text-(--slate)">{legend}</legend>
      {available.map((p) => (
        <label key={p} className="flex cursor-pointer items-center gap-1">
          <input
            type="checkbox"
            checked={value.includes(p)}
            onChange={(e) => onChange(e.target.checked ? DESIGN_PARTS.filter((x) => x === p || value.includes(x)) : value.filter((x) => x !== p))}
          />
          {String(labels[PART_LABEL[p]])}
        </label>
      ))}
    </fieldset>
  );
}

/** One template: a drawing of its page, its type and colours, and what
 *  can be done with it. */
function TemplateCard({ entry, book, labels, active, onTry, styles, onAsStyle, onExport, onDelete }: {
  entry: GalleryEntry;
  book: PostextConfig;
  labels: Labels;
  /** On show in the book (being tried). */
  active: boolean;
  onTry: (parts: DesignPart[]) => void;
  /** The book's chapter styles, and keeping the template as one . */
  styles: readonly ChapterStyleConfig[];
  onAsStyle: (parts: DesignPart[], target: { id: string } | { name: string }) => void;
  onExport: () => void;
  onDelete?: () => void;
}) {
  const [choosing, setChoosing] = useState<false | 'try' | 'style'>(false);
  const [chosen, setChosen] = useState<DesignPart[]>(entry.design.parts);
  // As a chapter style: the parts a style takes, into a new style or one
  // the book has.
  const styleParts = entry.design.parts.filter((p) => CHAPTER_STYLE_PARTS.includes(p));
  const [styleChosen, setStyleChosen] = useState<DesignPart[]>(styleParts);
  const [styleTarget, setStyleTarget] = useState<string>('');
  const [styleName, setStyleName] = useState(entry.name);
  // The template as it would look on this book: its parts over the book's.
  const look = useMemo(() => applyDesign(book, entry.design, entry.design.parts), [book, entry.design]);
  const layout = resolveLayoutConfig(look.layout);
  const page = resolvePageConfig(look.page, look.locale, layout.writingMode);
  const body = resolveBodyTextConfig(look.bodyText, look.locale);
  const ink = resolveColorValue(body.color, look.colorPalette, { hex: '#000000', model: 'hex' }).hex;
  const palette = entry.design.config.colorPalette ?? [];

  return (
    <li className={cn('flex flex-col gap-2 rounded-lg border bg-(--surface) p-3', active ? 'border-(--brand)' : 'border-(--rule)')}>
      <div className="flex gap-3">
        <PagePreview page={page} layout={layout} lineHeightPt={toPt(body.lineHeight)} inkHex={ink} height={72} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-start justify-between gap-1">
            <span className="font-semibold" style={{ overflowWrap: 'anywhere' }}>{entry.name}</span>
            {entry.builtin && <span className="shrink-0 rounded bg-(--surface-2,var(--background)) px-1 text-[0.6rem] text-(--slate)">{labels.designTemplateBuiltin}</span>}
          </div>
          {entry.description && <span className="text-xs text-(--slate)">{entry.description}</span>}
          {entry.source && <span className="text-xs text-(--slate)">{fill(labels.designTemplateFrom, { book: entry.source })}</span>}
          {/* A composition convention sets no type: the book's would be
              shown as if it were the template's. */}
          {entry.design.parts.includes('typography') && (
            <span className="truncate text-xs" style={{ fontFamily: `"${body.fontFamily}", serif` }}>{body.fontFamily} · {toPt(body.fontSize)}/{toPt(body.lineHeight)} pt</span>
          )}
          {palette.length > 0 && (
            <span role="img" className="flex items-center gap-0.5" aria-label={palette.map((p) => p.name).join(', ')}>
              {palette.slice(0, 8).map((p) => (
                <span key={p.id} title={p.name} className="inline-block h-3 w-3 rounded-sm border border-(--rule)" style={{ backgroundColor: p.value.hex }} />
              ))}
            </span>
          )}
        </div>
      </div>
      {choosing === 'try' ? (
        <div className="flex flex-col gap-2">
          <PartChoice labels={labels} legend={labels.designTemplateApplyIntro} available={entry.design.parts} value={chosen} onChange={setChosen} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setChoosing(false)}>{labels.designTemplateCancel}</Button>
            <Button variant="primary" size="sm" disabled={chosen.length === 0} onClick={() => { onTry(chosen); setChoosing(false); }}>
              {labels.designTemplateTryIn}
            </Button>
          </div>
        </div>
      ) : choosing === 'style' ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-xs text-(--slate)">{labels.designTemplateAsStyleIntro}</p>
          <label className="flex flex-col gap-1 text-xs">
            {labels.designTemplateAsStyleTarget}
            <select
              value={styleTarget}
              onChange={(e) => setStyleTarget(e.target.value)}
              className="rounded border border-(--pt-control-border) bg-(--background) px-2 py-1 text-xs text-(--foreground)"
            >
              <option value="">{labels.designTemplateAsStyleNew}</option>
              {styles.map((st) => <option key={st.id} value={st.id}>{st.name ?? st.id}</option>)}
            </select>
          </label>
          {styleTarget === '' && (
            <label className="flex flex-col gap-1 text-xs">
              {labels.designTemplateAsStyleName}
              <input
                type="text"
                value={styleName}
                onChange={(e) => setStyleName(e.target.value)}
                className="rounded border border-(--pt-control-border) bg-(--background) px-2 py-1 text-xs text-(--foreground)"
              />
            </label>
          )}
          <PartChoice labels={labels} legend={labels.designTemplateApplyIntro} available={styleParts} value={styleChosen} onChange={setStyleChosen} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setChoosing(false)}>{labels.designTemplateCancel}</Button>
            <Button
              variant="primary"
              size="sm"
              disabled={styleChosen.length === 0 || (styleTarget === '' && !styleName.trim())}
              onClick={() => { onAsStyle(styleChosen, styleTarget ? { id: styleTarget } : { name: styleName.trim() }); setChoosing(false); }}
            >
              {labels.designTemplateAsStyleApply}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-1">
          <div className="flex flex-wrap gap-1">
            <Button variant="primary" size="sm" onClick={() => setChoosing('try')}>{labels.designTemplateTry}</Button>
            {styleParts.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setChoosing('style')}>{labels.designTemplateAsStyle}</Button>
            )}
          </div>
          <div className="flex gap-1">
            <IconButton label={`${labels.designTemplateExport}: ${entry.name}`} icon={<Download size={14} aria-hidden="true" />} onClick={onExport} />
            {onDelete && (
              <ConfirmPopover message={fill(labels.designTemplateDeleteConfirm, { name: entry.name })} confirmLabel={labels.designTemplateDelete} onConfirm={onDelete}>
                {({ open }) => <IconButton label={`${labels.designTemplateDelete}: ${entry.name}`} icon={<Trash2 size={14} aria-hidden="true" />} onClick={open} />}
              </ConfirmPopover>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
