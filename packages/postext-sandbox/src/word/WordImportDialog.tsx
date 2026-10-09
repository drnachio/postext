'use client';

import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { AlertTriangle, CheckCircle2, ChevronRight, Download, Info, Save, Trash2, Upload, X } from 'lucide-react';
import { defaultResourceTypes } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../context/SandboxContext';
import { newChapter } from '../book/chapterOps';
import { generateId } from '../storage/ids';
import { downloadBytes } from '../storage/persistence';
import { Button, Collapsible, ConfirmPopover, IconButton, Select, Switch, announce, usePortalContainer, type SelectOption } from '../ui';
import { POPUP_SURFACE, POPUP_Z_INDEX } from '../ui/surface';
import { importedResources, loadLastTemplateId, saveLastTemplateId, useWordTemplates } from './sandboxImport';
import {
  analyzeDocx,
  calloutStylesOf,
  chipStylesOf,
  displayStyleName,
  emptyTemplate,
  lookup,
  newTemplateId,
  parseTemplate,
  templateFile,
  characterTargetOf,
  paragraphTargetOf,
  wordToPostext,
  type CharacterTarget,
  type CharacterTargetKind,
  type ParagraphTarget,
  type ParagraphTargetKind,
  type WordImportOptions,
  type WordTemplate,
  type FindingId,
  type QualityReport,
  type WordDocument,
} from 'postext/word';
import type { SandboxLabels } from '../types';

export interface WordImportFile {
  name: string;
  doc: WordDocument;
}

type Destination = 'chapter' | 'append' | 'book';

const AUTO = '__auto__';
const EMBEDDED = '__embedded__';

/** A count in words: the `…One` label for 1, the other one otherwise. */
export function counted(labels: SandboxLabels, key: keyof SandboxLabels, count: number): string {
  const one = `${String(key)}One` as keyof SandboxLabels;
  const text = (count === 1 && typeof labels[one] === 'string' ? labels[one] : labels[key]) as string;
  return text.replace('__count__', String(count));
}

const FINDING_LABEL: Record<FindingId, keyof SandboxLabels> = {
  allNormal: 'wordFindingAllNormal',
  directFormatting: 'wordFindingDirectFormatting',
  manualHeadings: 'wordFindingManualHeadings',
  lineBreaks: 'wordFindingLineBreaks',
  pageBreaks: 'wordFindingPageBreaks',
  emptyParagraphs: 'wordFindingEmptyParagraphs',
  typedNumbering: 'wordFindingTypedNumbering',
  spacing: 'wordFindingSpacing',
  trackedChanges: 'wordFindingTrackedChanges',
  comments: 'wordFindingComments',
  textBoxes: 'wordFindingTextBoxes',
  unsupportedPictures: 'wordFindingUnsupportedPictures',
  equations: 'wordFindingEquations',
  hiddenText: 'wordFindingHiddenText',
};

const fileBase = (name: string): string => name.replace(/\.[^.]+$/, '');

/** A name or quoted text set apart for the bidi algorithm (FSI … PDI), so
 *  `mañana.docx` stays whole in an Arabic sentence and the other way round. */
export const isolate = (s: string): string => `\u2068${s}\u2069`;

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="border-t border-(--pt-control-border)">
      <Collapsible.Trigger className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-0 py-2 text-start text-[13px] font-semibold text-(--foreground) outline-(--brand) focus-visible:outline-2" style={{ minHeight: 44 }}>
        <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-(--slate) rtl:-scale-x-100" style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 200ms ease' }} />
        {title}
      </Collapsible.Trigger>
      <Collapsible.Panel data-postext-collapsible="">
        <div className="flex flex-col gap-2 pb-3">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function Verdict({ report, labels }: { report: QualityReport; labels: SandboxLabels }) {
  const icon = report.verdict === 'clean'
    ? <CheckCircle2 size={16} aria-hidden="true" style={{ color: 'var(--pt-success, #16a34a)' }} />
    : <AlertTriangle size={16} aria-hidden="true" style={{ color: report.verdict === 'plain' ? 'var(--pt-error, #ef4444)' : 'var(--pt-warning, #d97706)' }} />;
  const text = report.verdict === 'clean' ? labels.wordVerdictClean : report.verdict === 'mixed' ? labels.wordVerdictMixed : labels.wordVerdictPlain;
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 flex items-start gap-2 font-semibold">
        <span className="mt-0.5 shrink-0">{icon}</span>
        {text}
      </p>
      <p className="m-0 text-xs text-(--slate)">
        {labels.wordQualityCounts
          .replace('__paragraphs__', String(report.paragraphs))
          .replace('__styled__', String(report.styled))
          .replace('__pictures__', String(report.pictures))
          .replace('__tables__', String(report.tables))
          .replace('__notes__', String(report.footnotes))}
      </p>
      {report.findings.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {report.findings.map((f) => (
            <li key={f.id} className="flex items-start gap-2 text-xs">
              {f.severity === 'warn'
                ? <AlertTriangle size={13} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--pt-warning, #d97706)' }} />
                : <Info size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-(--slate)" />}
              <span>
                {counted(labels, FINDING_LABEL[f.id], f.count)}
                {f.examples.length > 0 && (
                  <span className="block text-(--slate)">
                    {labels.wordFindingExamples.replace('__list__', f.examples.map((e) => isolate(`“${e}”`)).join(' · '))}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface StyleRowProps {
  name: string;
  count: number;
  sample: string;
  children: ReactNode;
  labels: SandboxLabels;
}

function StyleRow({ name, count, sample, children, labels }: StyleRowProps) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-(--pt-control-border) py-2 last:border-b-0">
      <div className="min-w-[180px] flex-[1_1_220px]">
        <div className="font-semibold" style={{ overflowWrap: 'anywhere' }}>{displayStyleName(name)}</div>
        <div className="text-xs text-(--slate)">
          {counted(labels, 'wordStyleUses', count)}
          {sample && <span className="italic" style={{ overflowWrap: 'anywhere' }}> · {sample}</span>}
        </div>
      </div>
      <div className="flex flex-[2_1_320px] flex-wrap items-center gap-2">{children}</div>
    </li>
  );
}

export function WordImportDialog({ file, onClose }: { file: WordImportFile | null; onClose: () => void }) {
  const open = file !== null;
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      {file && <WordImportPopup file={file} onClose={onClose} />}
    </Dialog.Root>
  );
}

function WordImportPopup({ file, onClose }: { file: WordImportFile; onClose: () => void }) {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const resources = useSandboxSelector((s) => s.resources);
  const chapters = useSandboxSelector((s) => s.chapters);
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const locale = useSandboxSelector((s) => s.locale);
  const container = usePortalContainer();
  const { templates, save, remove } = useWordTemplates();
  const uploadRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const doc = file.doc;

  const embedded = useMemo(() => parseTemplate(doc.embeddedTemplate), [doc]);
  const [baseId, setBaseId] = useState<string>(() => {
    if (embedded) return EMBEDDED;
    const last = loadLastTemplateId();
    return last && templates.some((t) => t.id === last) ? last : AUTO;
  });
  const baseTemplate = (id: string): WordTemplate =>
    id === EMBEDDED && embedded ? { ...embedded, id: '', name: labels.wordTemplateEmbedded }
      : templates.find((t) => t.id === id) ?? emptyTemplate();
  const [working, setWorking] = useState<WordTemplate>(() => baseTemplate(baseId));
  const [dirty, setDirty] = useState(false);
  // A whole book exported from the Sandbox (chapter markers) comes back as
  // a book; anything else goes into the open chapter unless asked.
  const [destination, setDestination] = useState<Destination>(() =>
    doc.blocks.some((b) => b.type === 'paragraph' && paragraphTargetOf(doc, b.styleId, working, config).kind === 'chapter') ? 'book' : 'chapter');
  const [saveAsName, setSaveAsName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const selectBase = (id: string) => {
    setBaseId(id);
    setWorking(baseTemplate(id));
    setDirty(false);
    setSaveAsName(null);
  };

  const report = useMemo(() => analyzeDocx(doc, working, config), [doc, working, config]);
  const activeChapter = chapters.find((c) => c.id === activeChapterId);
  const existingIds = useMemo(() => new Set(resources.map((r) => r.id)), [resources]);
  const result = useMemo(
    () => wordToPostext(doc, {
      template: working,
      config,
      chapters: destination === 'chapter' ? 'single' : 'split',
      existingIds,
      untitledChapter: doc.title || labels.wordUntitledChapter,
    }),
    [doc, working, config, destination, existingIds, labels.wordUntitledChapter],
  );

  // -- mapping ----------------------------------------------------------------

  const paragraphStyles = config.paragraphStyles ?? [];
  const calloutStyles = calloutStylesOf(config);
  const headingStyles = config.headingStyles ?? [];
  const chipStyles = chipStylesOf(config);

  const setParagraph = (name: string, target: ParagraphTarget) => {
    setWorking((w) => ({ ...w, paragraphs: { ...w.paragraphs, [name]: target } }));
    setDirty(true);
  };
  const setCharacter = (name: string, target: CharacterTarget) => {
    setWorking((w) => ({ ...w, characters: { ...w.characters, [name]: target } }));
    setDirty(true);
  };
  const setOption = <K extends keyof WordImportOptions>(key: K, value: WordImportOptions[K]) => {
    setWorking((w) => ({ ...w, options: { ...w.options, [key]: value } }));
    setDirty(true);
  };

  const styleIdOf = (name: string): string => [...doc.styles.values()].find((s) => s.type === 'paragraph' && s.name === name)?.id ?? '';
  const paragraphTarget = (name: string): ParagraphTarget =>
    lookup(working.paragraphs, name) ?? paragraphTargetOf(doc, styleIdOf(name), working, config);

  const named = (list: readonly { id: string; name?: string }[], current?: string): SelectOption[] => {
    const opts = list.map((s) => ({ value: s.id, label: s.name ?? s.id }));
    if (current && !opts.some((o) => o.value === current)) opts.push({ value: current, label: `${current} (?)` });
    return opts;
  };

  const paragraphKinds: SelectOption<ParagraphTargetKind>[] = [
    { value: 'body', label: labels.wordTargetBody },
    { value: 'heading', label: labels.wordTargetHeading },
    ...(paragraphStyles.length ? [{ value: 'paragraphs' as const, label: labels.wordTargetParagraphs }] : []),
    { value: 'verse', label: labels.wordTargetVerse },
    ...(calloutStyles.length ? [
      { value: 'callout' as const, label: labels.wordTargetCallout },
      { value: 'calloutTitle' as const, label: labels.wordTargetCalloutTitle },
    ] : []),
    { value: 'quote', label: labels.wordTargetQuote },
    { value: 'caption', label: labels.wordTargetCaption },
    { value: 'chapter', label: labels.wordTargetChapter },
    { value: 'markup', label: labels.wordTargetMarkup },
    { value: 'drop', label: labels.wordTargetDrop },
  ];

  const changeKind = (name: string, kind: ParagraphTargetKind, current: ParagraphTarget) => {
    switch (kind) {
      case 'heading':
        setParagraph(name, { kind, level: current.kind === 'heading' ? current.level : 1 });
        break;
      case 'paragraphs':
        setParagraph(name, { kind, style: paragraphStyles[0]?.id ?? '' });
        break;
      case 'verse':
        setParagraph(name, current.kind === 'paragraphs' && current.style ? { kind, style: current.style } : { kind });
        break;
      case 'callout':
      case 'calloutTitle':
        setParagraph(name, { kind, type: current.kind === 'callout' || current.kind === 'calloutTitle' ? current.type : calloutStyles[0]?.id ?? '' });
        break;
      default:
        setParagraph(name, { kind } as ParagraphTarget);
    }
  };

  const levelOptions: SelectOption[] = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: labels.wordHeadingLevel.replace('__n__', String(n)) }));

  const paragraphControls = (name: string) => {
    const t = paragraphTarget(name);
    const aria = (what: string) => `${displayStyleName(name)}: ${what}`;
    return (
      <>
        <Select<ParagraphTargetKind> size="sm" value={t.kind} onValueChange={(k) => changeKind(name, k, t)} options={paragraphKinds} ariaLabel={aria(labels.wordMapTo)} className="min-w-[180px] flex-1" />
        {t.kind === 'heading' && (
          <>
            <Select size="sm" value={String(t.level)} onValueChange={(v) => setParagraph(name, { ...t, level: Number(v) })} options={levelOptions} ariaLabel={aria(labels.wordTargetLevel)} />
            {headingStyles.length > 0 && (
              <Select
                size="sm"
                value={t.style ?? ''}
                onValueChange={(v) => setParagraph(name, v ? { kind: 'heading', level: t.level, style: v } : { kind: 'heading', level: t.level })}
                options={[{ value: '', label: labels.wordTargetNoHeadingStyle }, ...named(headingStyles, t.style)]}
                ariaLabel={aria(labels.wordTargetHeadingStyle)}
              />
            )}
          </>
        )}
        {t.kind === 'paragraphs' && (
          <Select size="sm" value={t.style} onValueChange={(v) => setParagraph(name, { kind: 'paragraphs', style: v })} options={named(paragraphStyles, t.style)} ariaLabel={aria(labels.wordTargetStyle)} />
        )}
        {t.kind === 'verse' && paragraphStyles.length > 0 && (
          <Select
            size="sm"
            value={t.style ?? ''}
            onValueChange={(v) => setParagraph(name, v ? { kind: 'verse', style: v } : { kind: 'verse' })}
            options={[{ value: '', label: labels.wordTargetNoVerseStyle }, ...named(paragraphStyles, t.style)]}
            ariaLabel={aria(labels.wordTargetStyle)}
          />
        )}
        {(t.kind === 'callout' || t.kind === 'calloutTitle') && (
          <Select size="sm" value={t.type} onValueChange={(v) => setParagraph(name, { kind: t.kind, type: v })} options={named(calloutStyles, t.type)} ariaLabel={aria(labels.wordTargetType)} />
        )}
      </>
    );
  };

  const charKinds: SelectOption<CharacterTargetKind>[] = [
    { value: 'text', label: labels.wordCharText },
    { value: 'bold', label: labels.wordCharBold },
    { value: 'italic', label: labels.wordCharItalic },
    { value: 'boldItalic', label: labels.wordCharBoldItalic },
    { value: 'smallCaps', label: labels.wordCharSmallCaps },
    { value: 'sup', label: labels.wordCharSup },
    { value: 'sub', label: labels.wordCharSub },
    ...(chipStyles.length ? [{ value: 'chip' as const, label: labels.wordCharChip }] : []),
    { value: 'markup', label: labels.wordTargetMarkup },
    { value: 'drop', label: labels.wordTargetDrop },
  ];

  const characterControls = (name: string) => {
    const t = characterTargetOf(doc, name, working, config);
    const aria = (what: string) => `${displayStyleName(name)}: ${what}`;
    return (
      <>
        <Select<CharacterTargetKind>
          size="sm"
          value={t.kind}
          onValueChange={(k) => setCharacter(name, k === 'chip' ? { kind: 'chip', style: chipStyles[0]?.id ?? '' } : { kind: k } as CharacterTarget)}
          options={charKinds}
          ariaLabel={aria(labels.wordMapTo)}
          className="min-w-[180px] flex-1"
        />
        {t.kind === 'chip' && (
          <Select size="sm" value={t.style} onValueChange={(v) => setCharacter(name, { kind: 'chip', style: v })} options={named(chipStyles, t.style)} ariaLabel={aria(labels.wordCharChipStyle)} />
        )}
      </>
    );
  };

  // -- templates ----------------------------------------------------------------

  /** The working mapping with every style of this document written out, so
   *  a saved template says what each one became. */
  const materialized = (): WordTemplate => {
    const paragraphs = { ...working.paragraphs };
    const characters = { ...working.characters };
    for (const s of report.paragraphStyles) paragraphs[s.name] = paragraphTarget(s.name);
    for (const s of report.characterStyles) characters[s.name] = characterTargetOf(doc, s.name, working, config);
    return { ...working, paragraphs, characters };
  };

  const saved = templates.find((t) => t.id === baseId);
  const saveChanges = () => {
    if (!saved) return;
    const t = { ...materialized(), id: saved.id, name: saved.name, updatedAt: Date.now() };
    const ok = save(t);
    setWorking(t);
    setDirty(false);
    setNote(ok ? labels.wordTemplateSaved.replace('__name__', isolate(t.name)) : labels.wordTemplateStorageFailed);
    announce(ok ? labels.wordTemplateSaved.replace('__name__', isolate(t.name)) : labels.wordTemplateStorageFailed);
  };
  const saveAs = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const t = { ...materialized(), id: newTemplateId(), name: trimmed, updatedAt: Date.now() };
    const ok = save(t);
    setBaseId(t.id);
    setWorking(t);
    setDirty(false);
    setSaveAsName(null);
    saveLastTemplateId(t.id);
    const msg = ok ? labels.wordTemplateSaved.replace('__name__', isolate(trimmed)) : labels.wordTemplateStorageFailed;
    setNote(msg);
    announce(msg);
  };
  const deleteSaved = () => {
    if (!saved) return;
    remove(saved.id);
    if (loadLastTemplateId() === saved.id) saveLastTemplateId(null);
    selectBase(embedded ? EMBEDDED : AUTO);
    const msg = labels.wordTemplateDeleted.replace('__name__', isolate(saved.name));
    setNote(msg);
    announce(msg);
  };
  const download = () => {
    const t = materialized();
    const name = t.name || fileBase(file.name);
    downloadBytes(templateFile({ ...t, name }), `${name.replace(/[^\p{L}\p{N}._-]+/gu, '-') || 'template'}.postext-word.json`, 'application/json');
  };
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    let t: WordTemplate | undefined;
    try {
      t = parseTemplate(JSON.parse(await f.text()));
    } catch {
      t = undefined;
    }
    if (!t) {
      const msg = labels.wordTemplateUploadFailed.replace('__file__', isolate(f.name));
      setNote(msg);
      announce(msg);
      return;
    }
    const named = { ...t, id: newTemplateId(), name: t.name || fileBase(f.name), updatedAt: Date.now() };
    save(named);
    setBaseId(named.id);
    setWorking(named);
    setDirty(false);
    saveLastTemplateId(named.id);
    const msg = labels.wordTemplateUploaded.replace('__name__', isolate(named.name));
    setNote(msg);
    announce(msg);
  };

  const templateOptions: SelectOption[] = [
    { value: AUTO, label: labels.wordTemplateAuto },
    ...(embedded ? [{ value: EMBEDDED, label: labels.wordTemplateEmbedded }] : []),
    ...templates.map((t) => ({ value: t.id, label: t.name })),
  ];

  // -- import -------------------------------------------------------------------

  const runImport = async () => {
    setBusy(true);
    try {
      const types = config.resourceTypes ?? defaultResourceTypes(locale);
      const created = await importedResources(result, types);
      for (const r of created) dispatch({ type: 'UPSERT_RESOURCE', payload: r });
      if (destination === 'chapter') {
        dispatch({ type: 'SET_MARKDOWN', payload: result.chapters[0]?.markdown ?? '' });
        announce(labels.wordImportDoneChapter.replace('__file__', isolate(file.name)));
      } else {
        const made = result.chapters.map((c) => newChapter(generateId('chapter'), c.title, c.markdown));
        if (destination === 'book') {
          dispatch({ type: 'SET_BOOK', payload: { chapters: made, activeChapterId: made[0]!.id } });
        } else {
          const at = Math.max(0, chapters.findIndex((c) => c.id === activeChapterId)) + 1;
          made.forEach((chapter, k) => dispatch({ type: 'ADD_CHAPTER', payload: { chapter, index: at + k, activate: k === 0 } }));
        }
        announce(counted(labels, 'wordImportDoneChapters', made.length).replace('__file__', isolate(file.name)));
      }
      if (created.length) announce(counted(labels, 'wordImportResources', created.length));
      if (baseId !== AUTO && baseId !== EMBEDDED) saveLastTemplateId(baseId);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const destinationOptions: SelectOption<Destination>[] = [
    { value: 'chapter', label: labels.wordDestinationChapter, description: labels.wordDestinationChapterHelp.replace('__chapter__', activeChapter?.title ?? '') },
    { value: 'append', label: labels.wordDestinationAppend, description: labels.wordDestinationAppendHelp },
    { value: 'book', label: labels.wordDestinationBook, description: labels.wordDestinationBookHelp },
  ];

  const preview = result.chapters.map((c) => c.markdown).join('\n\n').slice(0, 6000);
  const optionRow = (label: string, control: ReactNode) => (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs">{label}</span>
      {control}
    </div>
  );

  return (
    <Dialog.Portal container={container}>
      <Dialog.Backdrop className="fixed inset-0" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
      <Dialog.Popup
        data-postext-popup=""
        data-testid="word-import-dialog"
        aria-labelledby={titleId}
        initialFocus={importRef}
        className="fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-16px)] -translate-x-1/2 -translate-y-1/2 flex-col"
        style={{ ...POPUP_SURFACE, zIndex: POPUP_Z_INDEX, width: 'min(980px, calc(100vw - 16px))', fontSize: 13, lineHeight: '19px' }}
      >
        <div className="flex items-start justify-between gap-2 px-4 pt-3">
          <Dialog.Title id={titleId} style={{ fontSize: 15, lineHeight: '20px', fontWeight: 600, margin: '10px 0 0', overflowWrap: 'anywhere' }}>
            {labels.wordImportTitle.replace('__file__', isolate(file.name))}
          </Dialog.Title>
          <IconButton label={labels.wordCancel} icon={<X size={14} aria-hidden="true" />} onClick={onClose} />
        </div>
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto px-4 pb-2">
          <Dialog.Description className="text-xs text-(--slate)" style={{ margin: '0 0 8px' }}>
            {labels.wordImportIntro}
          </Dialog.Description>

          <Section title={labels.wordQualityHeading} defaultOpen>
            <Verdict report={report} labels={labels} />
          </Section>

          <Section title={labels.wordTemplateHeading}>
            <div className="flex flex-wrap items-center gap-2">
              <Select size="sm" value={baseId} onValueChange={selectBase} options={templateOptions} ariaLabel={labels.wordTemplateLabel} className="min-w-[220px] flex-1" />
              {dirty && <span className="text-xs italic text-(--slate)">{labels.wordTemplateModified}</span>}
              {saved && (
                <Button variant="outline" size="sm" icon={<Save size={13} aria-hidden="true" />} disabled={!dirty} onClick={saveChanges}>
                  {labels.wordTemplateSave}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setSaveAsName(saveAsName === null ? (working.name && !saved ? working.name : fileBase(file.name)) : null)} aria-expanded={saveAsName !== null}>
                {labels.wordTemplateSaveAs}
              </Button>
              <IconButton label={labels.wordTemplateDownload} icon={<Download size={14} aria-hidden="true" />} onClick={download} />
              <IconButton label={labels.wordTemplateUpload} icon={<Upload size={14} aria-hidden="true" />} onClick={() => uploadRef.current?.click()} />
              <input ref={uploadRef} type="file" accept=".json,application/json" onChange={upload} className="hidden" aria-hidden="true" tabIndex={-1} />
              {saved && (
                <ConfirmPopover message={labels.wordTemplateDeleteConfirm.replace('__name__', isolate(saved.name))} confirmLabel={labels.wordTemplateDelete} onConfirm={deleteSaved}>
                  {({ open: openConfirm }) => <IconButton label={labels.wordTemplateDelete} icon={<Trash2 size={14} aria-hidden="true" />} onClick={openConfirm} />}
                </ConfirmPopover>
              )}
            </div>
            {saveAsName !== null && (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveAs(saveAsName);
                }}
              >
                <label className="flex flex-1 items-center gap-2 text-xs">
                  {labels.wordTemplateName}
                  <input
                    autoFocus
                    value={saveAsName}
                    onChange={(e) => setSaveAsName(e.target.value)}
                    className="min-h-[32px] flex-1 rounded border border-(--pt-control-border) bg-(--surface) px-2 text-[13px] text-(--foreground)"
                  />
                </label>
                <Button type="submit" variant="primary" size="sm" disabled={!saveAsName.trim()}>{labels.wordTemplateSaveConfirm}</Button>
              </form>
            )}
            {note && <p role="status" className="m-0 text-xs text-(--slate)">{note}</p>}
          </Section>

          <Section title={labels.wordParagraphStyles}>
            <ul className="m-0 list-none p-0">
              {report.paragraphStyles.map((s) => (
                <StyleRow key={s.name} name={s.name} count={s.count} sample={s.sample} labels={labels}>
                  {paragraphControls(s.name)}
                </StyleRow>
              ))}
            </ul>
          </Section>

          <Section title={labels.wordCharacterStyles} defaultOpen={report.characterStyles.length > 0}>
            {report.characterStyles.length === 0
              ? <p className="m-0 text-xs text-(--slate)">{labels.wordNoCharacterStyles}</p>
              : (
                <ul className="m-0 list-none p-0">
                  {report.characterStyles.map((s) => (
                    <StyleRow key={s.name} name={s.name} count={s.count} sample={s.sample} labels={labels}>
                      {characterControls(s.name)}
                    </StyleRow>
                  ))}
                </ul>
              )}
          </Section>

          <Section title={labels.wordOptionsHeading}>
            {optionRow(labels.wordOptionLineBreaks, (
              <Select size="sm" value={working.options.lineBreaks} onValueChange={(v) => setOption('lineBreaks', v)} ariaLabel={labels.wordOptionLineBreaks}
                options={[{ value: 'space', label: labels.wordOptionLineBreaksSpace }, { value: 'paragraph', label: labels.wordOptionLineBreaksParagraph }]} />
            ))}
            {optionRow(labels.wordOptionDirect, (
              <Select size="sm" value={working.options.directFormatting} onValueChange={(v) => setOption('directFormatting', v)} ariaLabel={labels.wordOptionDirect}
                options={[{ value: 'keep', label: labels.wordOptionDirectKeep }, { value: 'ignore', label: labels.wordOptionDirectIgnore }]} />
            ))}
            {optionRow(labels.wordOptionManualHeadings, (
              <Select size="sm" value={String(working.options.manualHeadings)} onValueChange={(v) => setOption('manualHeadings', Number(v))} ariaLabel={labels.wordOptionManualHeadings}
                options={[{ value: '0', label: labels.wordOptionManualHeadingsOff }, ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: labels.wordOptionManualHeadingsLevel.replace('__n__', String(n)) }))]} />
            ))}
            {optionRow(labels.wordOptionPageBreaks, (
              <Select size="sm" value={working.options.pageBreaks} onValueChange={(v) => setOption('pageBreaks', v)} ariaLabel={labels.wordOptionPageBreaks}
                options={[{ value: 'drop', label: labels.wordOptionPageBreaksDrop }, { value: 'keep', label: labels.wordOptionPageBreaksKeep }]} />
            ))}
            {optionRow(labels.wordOptionImages, <Switch checked={working.options.images} onCheckedChange={(v) => setOption('images', v)} ariaLabel={labels.wordOptionImages} />)}
            {optionRow(labels.wordOptionTables, <Switch checked={working.options.tables} onCheckedChange={(v) => setOption('tables', v)} ariaLabel={labels.wordOptionTables} />)}
          </Section>

          <Section title={labels.wordPreviewHeading} defaultOpen={false}>
            {result.chapters.length > 1 && (
              <p className="m-0 text-xs text-(--slate)">
                {labels.wordPreviewChapters.replace('__count__', String(result.chapters.length)).replace('__titles__', result.chapters.map((c) => c.title).join(' · '))}
              </p>
            )}
            <pre
              tabIndex={0}
              aria-label={labels.wordPreviewHeading}
              className="m-0 max-h-[320px] overflow-auto rounded border border-(--pt-control-border) bg-(--surface) p-2 text-[12px] leading-[17px]"
              style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            >
              {preview}
            </pre>
          </Section>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-(--pt-control-border) px-4 py-3">
          <div className="flex min-w-[240px] flex-1 items-center gap-2">
            <span className="shrink-0 text-xs">{labels.wordDestinationHeading}</span>
            <Select<Destination> size="sm" value={destination} onValueChange={setDestination} options={destinationOptions} ariaLabel={labels.wordDestinationHeading} className="flex-1" />
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>{labels.wordCancel}</Button>
          <Button ref={importRef} variant="primary" size="sm" disabled={busy} onClick={() => void runImport()}>
            {busy ? labels.wordImportWorking : destination === 'book' ? labels.wordImportBookAction : labels.wordImportAction}
          </Button>
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
