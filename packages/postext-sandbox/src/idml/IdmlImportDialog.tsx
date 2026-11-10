'use client';

// The InDesign import dialog: what the IDML holds, the pictures
// of its Links folder, what each paragraph and character style becomes,
// whether its design comes too, what does not come over as it is, and a
// preview; then the new book is created among the reader's books.
import { type ReactNode, useId, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { ChevronRight, FolderOpen, FileArchive, Info, X } from 'lucide-react';
import { sameContentLocale } from 'postext';
import { analyzeIdml, idmlToPostext, type CharacterRole, type IdmlDocument, type ParagraphRole } from 'postext/idml';
import { useSandboxLabels, useSandboxProjects, useSandboxSelector } from '../context/SandboxContext.js';
import { Collapsible, usePortalContainer, type SelectOption, Select, announce, IconButton, Button, Switch } from '../ui/index.js';
import { POPUP_Z_INDEX, POPUP_SURFACE } from '../ui/layout/surface.js';
import { DOCUMENT_LOCALE_OPTIONS } from '../sidebar/sections/text/BodyTextSection/constants.js';
import { counted, isolate } from '../word/WordImportDialog.js';
import { idmlBundleBytes, linksFound, linksFromEntries, linksFromZip, noteText } from './idmlImport.js';

export interface IdmlImportFile {
  name: string;
  doc: IdmlDocument;
}

const fileBase = (name: string): string => name.replace(/\.[^.]+$/, '');

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

function StyleRow({ name, uses, sample, children }: { name: string; uses: string; sample: string; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-(--pt-control-border) py-2 last:border-b-0">
      <div className="min-w-[180px] flex-[1_1_220px]">
        <div className="font-semibold" style={{ overflowWrap: 'anywhere' }}>{name}</div>
        <div className="text-xs text-(--slate)">
          {uses}
          {sample && <span className="italic" style={{ overflowWrap: 'anywhere' }}> · {sample}</span>}
        </div>
      </div>
      <div className="flex flex-[2_1_320px] flex-wrap items-center gap-2">{children}</div>
    </li>
  );
}

export function IdmlImportDialog({ file, onClose }: { file: IdmlImportFile | null; onClose: () => void }) {
  return (
    <Dialog.Root open={file !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      {file && <IdmlImportPopup file={file} onClose={onClose} />}
    </Dialog.Root>
  );
}

function IdmlImportPopup({ file, onClose }: { file: IdmlImportFile; onClose: () => void }) {
  const labels = useSandboxLabels();
  const { importBundleBytes } = useSandboxProjects();
  const viewerLocale = useSandboxSelector((s) => s.locale);
  const container = usePortalContainer();
  const titleId = useId();
  const createRef = useRef<HTMLButtonElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const { doc } = file;

  const analysis = useMemo(() => analyzeIdml(doc), [doc]);
  const [paragraphRoles, setParagraphRoles] = useState<Record<string, ParagraphRole>>({});
  const [characterRoles, setCharacterRoles] = useState<Record<string, CharacterRole>>({});
  const [links, setLinks] = useState<Map<string, Uint8Array>>(() => new Map());
  const [design, setDesign] = useState(true);
  const languageOptions = useMemo(() => {
    const detected = analysis.language;
    const match = detected ? DOCUMENT_LOCALE_OPTIONS.find((o) => sameContentLocale(o.value, detected)) : undefined;
    return { options: DOCUMENT_LOCALE_OPTIONS, initial: match?.value ?? DOCUMENT_LOCALE_OPTIONS.find((o) => sameContentLocale(o.value, viewerLocale))?.value ?? DOCUMENT_LOCALE_OPTIONS[0]!.value };
  }, [analysis.language, viewerLocale]);
  const [locale, setLocale] = useState(languageOptions.initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(
    () => idmlToPostext(doc, { paragraphRoles, characterRoles, links, locale, textOnly: !design, untitledChapter: labels.wordUntitledChapter }),
    [doc, paragraphRoles, characterRoles, links, locale, design, labels.wordUntitledChapter],
  );

  const addLinks = (entries: Iterable<[string, Uint8Array]>) => {
    const next = new Map(links);
    for (const [name, bytes] of linksFromEntries(entries)) next.set(name, bytes);
    setLinks(next);
  };
  const pickFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    addLinks(await Promise.all(files.map(async (f): Promise<[string, Uint8Array]> => [f.webkitRelativePath || f.name, new Uint8Array(await f.arrayBuffer())])));
  };
  const pickZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      addLinks(linksFromZip(new Uint8Array(await f.arrayBuffer())));
    } catch {
      setError(labels.idmlLinksZipInvalid);
    }
  };

  const paragraphOptions: SelectOption<ParagraphRole>[] = [
    { value: 'body', label: labels.wordTargetBody },
    ...([1, 2, 3, 4, 5, 6] as const).map((n) => ({ value: `h${n}` as ParagraphRole, label: `${labels.wordTargetHeading} · ${labels.wordHeadingLevel.replace('__n__', String(n))}` })),
    { value: 'style', label: labels.idmlRoleStyle },
    { value: 'list', label: labels.idmlRoleList },
    { value: 'ordered', label: labels.idmlRoleOrdered },
    { value: 'quote', label: labels.wordTargetQuote },
    { value: 'caption', label: labels.wordTargetCaption },
    { value: 'box', label: labels.wordTargetCallout },
    { value: 'box-title', label: labels.wordTargetCalloutTitle },
    { value: 'skip', label: labels.wordTargetDrop },
  ];
  const characterOptions: SelectOption<CharacterRole>[] = [
    { value: 'auto', label: labels.idmlCharAuto },
    { value: 'italic', label: labels.wordCharItalic },
    { value: 'bold', label: labels.wordCharBold },
    { value: 'boldItalic', label: labels.wordCharBoldItalic },
    { value: 'sup', label: labels.wordCharSup },
    { value: 'sub', label: labels.wordCharSub },
    { value: 'plain', label: labels.wordCharText },
  ];

  const found = linksFound(analysis.links, links);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const name = fileBase(file.name);
      const bytes = await idmlBundleBytes(result, { name, locale });
      await importBundleBytes(bytes, `${name}.postext`, { locale });
      announce(labels.idmlCreated.replace('__name__', isolate(name)));
      onClose();
    } catch (err) {
      setError(labels.idmlCreateError.replace('__error__', err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const preview = result.chapters.map((c) => c.markdown).join('\n\n').slice(0, 6000);
  const uses = (count: number) => counted(labels, 'wordStyleUses', count);

  return (
    <Dialog.Portal container={container}>
      <Dialog.Backdrop className="fixed inset-0" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
      <Dialog.Popup
        data-postext-popup=""
        data-testid="idml-import-dialog"
        aria-labelledby={titleId}
        initialFocus={createRef}
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
            {labels.idmlImportIntro}
          </Dialog.Description>

          <Section title={labels.idmlSummaryHeading}>
            <p className="m-0 text-xs text-(--slate)">
              {labels.idmlSummaryCounts
                .replace('__pages__', String(analysis.pages))
                .replace('__paragraphs__', String(analysis.paragraphs))
                .replace('__tables__', String(analysis.tables))
                .replace('__pictures__', String(analysis.pictures))
                .replace('__notes__', String(analysis.footnotes))}
            </p>
            <p className="m-0 text-xs" style={{ overflowWrap: 'anywhere' }}>
              {labels.wordPreviewChapters.replace('__count__', String(result.chapters.length)).replace('__titles__', result.chapters.map((c) => isolate(c.title)).join(' · '))}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs">{labels.idmlLanguage}</span>
              <Select size="sm" value={locale} onValueChange={setLocale} options={languageOptions.options} ariaLabel={labels.idmlLanguage} className="min-w-[180px]" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs">{labels.idmlDesign}</span>
              <Switch checked={design} onCheckedChange={setDesign} ariaLabel={labels.idmlDesign} />
            </div>
          </Section>

          <Section title={labels.idmlLinksHeading}>
            {analysis.links.length === 0 ? (
              <p className="m-0 text-xs text-(--slate)">{labels.idmlLinksNone}</p>
            ) : (
              <>
                <p className="m-0 text-xs" role="status">{labels.idmlLinksFound.replace('__found__', String(found)).replace('__total__', String(analysis.links.length))}</p>
                <p className="m-0 text-xs text-(--slate)">{labels.idmlLinksHelp}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" icon={<FolderOpen size={13} aria-hidden="true" />} onClick={() => folderRef.current?.click()}>{labels.idmlLinksFolder}</Button>
                  <Button variant="outline" size="sm" icon={<FileArchive size={13} aria-hidden="true" />} onClick={() => zipRef.current?.click()}>{labels.idmlLinksZip}</Button>
                  <input ref={folderRef} type="file" multiple onChange={(e) => void pickFolder(e)} className="hidden" aria-hidden="true" tabIndex={-1} {...{ webkitdirectory: '', directory: '' }} />
                  <input ref={zipRef} type="file" accept=".zip,application/zip" onChange={(e) => void pickZip(e)} className="hidden" aria-hidden="true" tabIndex={-1} />
                </div>
              </>
            )}
          </Section>

          <Section title={labels.wordParagraphStyles}>
            <ul className="m-0 list-none p-0">
              {analysis.paragraphStyles.map((s) => (
                <StyleRow key={s.self} name={s.name} uses={uses(s.count)} sample={s.sample}>
                  <Select<ParagraphRole>
                    size="sm"
                    value={paragraphRoles[s.self] ?? s.guess}
                    onValueChange={(v) => setParagraphRoles((r) => ({ ...r, [s.self]: v }))}
                    options={paragraphOptions}
                    ariaLabel={`${s.name}: ${labels.wordMapTo}`}
                    className="min-w-[180px] flex-1"
                  />
                </StyleRow>
              ))}
            </ul>
          </Section>

          <Section title={labels.wordCharacterStyles} defaultOpen={analysis.characterStyles.length > 0}>
            {analysis.characterStyles.length === 0 ? (
              <p className="m-0 text-xs text-(--slate)">{labels.wordNoCharacterStyles}</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {analysis.characterStyles.map((s) => (
                  <StyleRow key={s.self} name={s.name} uses={uses(s.count)} sample={s.sample}>
                    <Select<CharacterRole>
                      size="sm"
                      value={characterRoles[s.self] ?? s.guess}
                      onValueChange={(v) => setCharacterRoles((r) => ({ ...r, [s.self]: v }))}
                      options={characterOptions}
                      ariaLabel={`${s.name}: ${labels.wordMapTo}`}
                      className="min-w-[180px] flex-1"
                    />
                  </StyleRow>
                ))}
              </ul>
            )}
          </Section>

          {result.notes.length > 0 && (
            <Section title={labels.idmlNotesHeading}>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {result.notes.map((n) => (
                  <li key={n.id} className="flex items-start gap-2 text-xs">
                    <Info size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-(--slate)" />
                    <span>
                      {noteText(labels, n.id, n.count)}
                      {n.examples.length > 0 && (
                        <span className="block text-(--slate)">{labels.wordFindingExamples.replace('__list__', n.examples.map((e) => isolate(e)).join(' · '))}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={labels.wordPreviewHeading} defaultOpen={false}>
            <pre
              tabIndex={0}
              aria-label={labels.wordPreviewHeading}
              className="m-0 max-h-[320px] overflow-auto rounded border border-(--pt-control-border) bg-(--surface) p-2 text-[12px] leading-[17px]"
              style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            >
              {preview}
            </pre>
          </Section>
          {error && <p role="alert" className="m-0 text-xs" style={{ color: 'var(--destructive)' }}>{error}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-(--pt-control-border) px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>{labels.wordCancel}</Button>
          <Button ref={createRef} variant="primary" size="sm" disabled={busy} onClick={() => void create()}>
            {busy ? labels.idmlCreating : labels.idmlCreate}
          </Button>
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
