'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, Trash2, Upload } from 'lucide-react';
import {
  BUILT_IN_BINDING_PROFILES,
  exportProductionProfiles,
  importProductionProfiles,
  parseIsbn,
  resolveBodyTextConfig,
  resolveColorValue,
  resolveBindingMeasures,
  type BindingProfile,
  type PaperProfile,
  type PostextConfig,
  type ProductionVersion,
  type ProductionWarning,
  type TrimMm,
  type VersionSheets,
} from 'postext';
import { useBookPlan, useSandboxLabels, useSandboxSelector } from '../context/SandboxContext.js';
import { Button, ConfirmPopover, IconButton, PanelBody, PanelHeader, SegmentedControl, Select, Switch, announce, cn, type SelectOption } from '../ui/index.js';
import { bookMetadata } from '../book/compose.js';
import { downloadBytes } from '../storage/persistence.js';
import { fill } from '../print/fillTokens.js';
import {

  WORKING_BOOK,
  bookTrimMm,
  metadataIsbn,
  metadataTexts,
  newVersion,
  planPageCount,
  sheetChoices,
  sheetsOf,
  bookMainPaper,
  type BookPaper,
  type BookProduction,

  type SheetChoice,
} from './model/bookProduction.js';
import { deleteProfile, putProfiles } from './store/productionStore.js';
import { HEADING, INPUT, mm1, type Labels } from './productionUi.js';
import { LogoLibrary } from './LogoLibrarySection.js';
import { DesignSection } from './CoverDesignSections.js';
import { COVER_FIELDS, coverFields, type CoverField } from './model/coverTexts.js';
import { SheetPreview } from './SheetPreview.js';
import { Fold } from './Fold.js';
import { PaperSection } from './PaperSection.js';
import { CoverGallerySection } from './CoverGallerySection.js';
import { galleryPicturesFrom, galleryResource, galleryResourceId } from './library/coverGallery.js';
import { pictureSize } from './library/coverImages.js';
import { readPictureFile } from './library/printFiles.js';
import { useBookProduction, useCollections, useCoverGallery, useLogos, useProfiles } from './store/useProduction.js';
import { CoverTemplatesSection } from './CoverTemplatesSection.js';
import { CollectionsSection } from './CollectionsSection.js';
import { EndpapersSection } from './EndpapersSection.js';
import { chooseCoverSheet, openCoverDesigner, useCoverSheet } from './store/coverDesignerStore.js';

const BUILT_IN_LABEL: Record<string, keyof Labels> = {
  perfect: 'productionProfilePerfect',
  'sewn-softcover': 'productionProfileSewn',
  'case-flat': 'productionProfileCaseFlat',
  'case-round': 'productionProfileCaseRound',
};

const FIELD_LABEL: Record<CoverField, keyof Labels> = {
  title: 'coverFieldTitle',
  subtitle: 'coverFieldSubtitle',
  author: 'coverFieldAuthor',
  back: 'productionZoneBack',
  spine: 'productionZoneSpine',
  flapFront: 'productionZoneFlapFront',
  flapBack: 'productionZoneFlapBack',
  front: 'productionZoneFront',
};
/** The general texts written on one line. */
const ONE_LINE: ReadonlySet<CoverField> = new Set(['title', 'subtitle', 'author', 'spine']);

const MEASURE_LABEL = {
  trimWidth: 'productionMeasureTrimWidth',
  trimHeight: 'productionMeasureTrimHeight',
  spine: 'productionMeasureSpine',
} as const satisfies Record<string, keyof Labels>;

function warningText(w: ProductionWarning, labels: Labels): string {
  switch (w.kind) {
    case 'signatureBlanks': return fill(labels.productionWarningBlanks, { count: String(w.blanks) });
    case 'profileOutOfRange': return fill(labels.productionWarningOutOfRange, {
      measure: String(labels[MEASURE_LABEL[w.measure]]), value: mm1(w.value), limit: mm1(w.limit),
    });
    case 'spineTooThinForText': return fill(labels.productionWarningThinSpine, { spine: mm1(w.spine), min: mm1(w.minSpine) });
    case 'spineOverridden': return fill(labels.productionWarningOverride, { used: mm1(w.used), calculated: mm1(w.calculated) });
    case 'bindingProfileMissing': return fill(labels.productionWarningProfileMissing, { name: w.profile });
    case 'isbnInvalid': return labels.productionIsbnInvalid;
  }
}

/**
 * The Cover panel: the versions the book is made in (a paperback, a
 * hardcover…), each with its binding and ISBN; the spine worked out from
 * the book's pages and paper; the cover's texts; a preview of each sheet
 * (cover or case, jacket, endpapers) and its print-ready PDF; and the
 * user's library of paper and binding profiles, shared as files.
 */
export function ProductionPanel() {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const activeProjectId = useSandboxSelector((s) => s.activeProjectId);
  const projects = useSandboxSelector((s) => s.projects);
  const plan = useBookPlan();
  const chapters = useSandboxSelector((s) => s.chapters);
  const bookResources = useSandboxSelector((s) => s.resources);
  const bookTextHex = useMemo(() => {
    const color = resolveBodyTextConfig(config.bodyText, config.locale).color;
    return resolveColorValue(color, config.colorPalette, { hex: '#000000', model: 'hex' }).hex.slice(0, 7).toLowerCase();
  }, [config]);
  // The book the cover belongs to: its title, subtitle, author and ISBN
  // come from the first chapter's front matter.
  const metadata = useMemo(() => bookMetadata(chapters) as Record<string, unknown>, [chapters]);
  const fromBook = useMemo(() => metadataTexts(metadata), [metadata]);
  const projectId = activeProjectId ?? WORKING_BOOK;
  const [record, update] = useBookProduction(projectId);
  const stored = useProfiles();
  const [gallery, updateGallery] = useCoverGallery();
  const collections = useCollections();
  const logoLibrary = useLogos();
  // The background picture is one of the cover's gallery (or the book's
  // picture a design made before the gallery already uses).
  const coverPictures = useMemo(
    () => [...gallery.pictures.map(galleryResource), ...bookResources.filter((r) => r.id === record?.design?.image?.resourceId)],
    [gallery, bookResources, record?.design?.image?.resourceId],
  );
  const importRef = useRef<HTMLInputElement>(null);

  const bindings = useMemo(() => stored.flatMap((p) => (p.kind === 'binding' ? [p.profile] : [])), [stored]);
  const papers = useMemo(() => stored.flatMap((p) => (p.kind === 'paper' ? [p.profile] : [])), [stored]);
  const complete = plan.chapters.length > 0 && plan.chapters.every((c) => plan.bookPages[c.chapterId]);
  const pages = planPageCount(plan.bookPages);

  const versions = record?.versions ?? [];
  const version = versions.find((v) => v.id === record?.activeVersionId) ?? versions[0];
  const sheets = useMemo(
    () => (version && pages > 0 ? sheetsOf(version, config, pages, bindings, { setting: record?.paper, library: papers }) : null),
    [version, config, pages, bindings, record?.paper, papers],
  );
  // The text sets pages on another paper: the spine counts them only as
  // inserts.
  const usesPaperFences = useMemo(() => chapters.some((c) => /^\s*:{3,}\s*paper\b/m.test(c.markdown)), [chapters]);
  const ready = sheets && isSheets(sheets) ? sheets : null;
  const choice = useCoverSheet();
  const choices = ready ? sheetChoices(ready) : [];
  const shown: SheetChoice = choices.includes(choice) ? choice : 'cover';

  const setVersion = (next: ProductionVersion) => {
    if (!record) return;
    update({ ...record, versions: record.versions.map((v) => (v.id === next.id ? next : v)) });
  };
  const addVersion = (kind: 'paperback' | 'hardcover') => {
    if (!record) return;
    const v = newVersion(kind, kind === 'paperback' ? labels.productionPaperbackName : labels.productionHardcoverName);
    // The first version starts from what the book says of itself.
    const first = record.versions.length === 0;
    const isbn = first ? metadataIsbn(metadata) : undefined;
    const texts = first && Object.keys(record.texts).length === 0 ? fromBook : record.texts;
    update({ ...record, texts, versions: [...record.versions, isbn ? { ...v, isbn } : v], activeVersionId: v.id });
  };
  const removeVersion = (id: string) => {
    if (!record) return;
    const rest = record.versions.filter((v) => v.id !== id);
    const base: BookProduction = { ...record, versions: rest };
    delete base.activeVersionId;
    update(rest[0] ? { ...base, activeVersionId: rest[0].id } : base);
  };

  const bindingOptions: SelectOption<string>[] = [
    ...BUILT_IN_BINDING_PROFILES.map((p) => ({ value: p.id, label: String(labels[BUILT_IN_LABEL[p.id] ?? 'productionBuiltin']) })),
    ...bindings.map((p) => ({ value: p.id, label: p.printer ? `${p.name} · ${p.printer}` : p.name })),
  ];

  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const read = importProductionProfiles(JSON.parse(await file.text()));
      const count = read.papers.length + read.bindings.length;
      if (count === 0) {
        announce(labels.productionImportFailed);
        return;
      }
      await putProfiles(read.papers, read.bindings);
      announce(fill(labels.productionImported, { count: String(count) }));
    } catch {
      announce(labels.productionImportFailed);
    }
  };
  const exportFile = () => {
    downloadBytes(JSON.stringify(exportProductionProfiles(papers, bindings), null, 2), 'profiles.postext-production.json', 'application/json');
  };

  const metaTitle = typeof metadata.title === 'string' ? metadata.title.trim() : '';
  const title = projects.find((p) => p.id === activeProjectId)?.name ?? (metaTitle || 'book');
  // A picture uploaded where the design asks for one goes into the cover's
  // gallery.
  const uploadToGallery = async (file: File) => {
    const { pictures, postscript } = await galleryPicturesFrom([file], pictureSize, readPictureFile);
    if (!pictures[0]) {
      announce(postscript.length ? labels.productionPicturePostscript.replace('__name__', file.name) : labels.productionPictureUnreadable);
      return undefined;
    }
    updateGallery({ ...gallery, pictures: [...gallery.pictures, ...pictures] });
    return galleryResourceId(pictures[0].id);
  };
  const fillFromBook = () => {
    if (!record) return;
    // The book's title and author take the place of a front cover's old text.
    const texts = { ...coverFields(record.texts), ...fromBook };
    delete texts.front;
    update({ ...record, texts });
  };
  const fields = useMemo(() => coverFields(record?.texts ?? {}), [record]);
  const hasOwnText = !!(fields.title?.trim() || fields.author?.trim() || fields.spine?.trim() || fields.front?.trim());

  // In the order the work goes: the version, its spine, the sheet with
  // the designer and the files; then the texts; then what is set once
  // (the look, the zones' type) and the libraries, folded away.
  return (
    <div className="flex h-full flex-col">
      <PanelHeader title={labels.navProduction} />
      <PanelBody padded>
        <div className="flex flex-col gap-4" style={{ fontSize: 13, lineHeight: '19px' }}>
          <p className="m-0 text-xs font-semibold" style={{ overflowWrap: 'anywhere' }}>{fill(labels.productionForBook, { name: title })}</p>
          {versions.length === 0 && <p className="m-0 text-xs text-(--slate)">{labels.productionIntro}</p>}

          <section className="flex flex-col gap-2">
            <h3 className={HEADING}>{labels.productionVersions}</h3>
            {versions.length === 0 && <p className="m-0 text-xs text-(--slate)">{labels.productionNoVersions}</p>}
            {versions.length > 1 && version && (
              <SegmentedControl
                size="sm"
                value={version.id}
                onValueChange={(id) => record && update({ ...record, activeVersionId: id })}
                options={versions.map((v) => ({ value: v.id, label: v.name }))}
                ariaLabel={labels.productionVersions}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!record} onClick={() => addVersion('paperback')}>{labels.productionAddPaperback}</Button>
              <Button variant="outline" size="sm" disabled={!record} onClick={() => addVersion('hardcover')}>{labels.productionAddHardcover}</Button>
            </div>
          </section>

          {version && (
            <VersionForm
              key={version.id}
              version={version}
              labels={labels}
              bindingOptions={bindingOptions}
              library={bindings}
              trim={bookTrimMm(config)}
              onChange={setVersion}
              onDelete={() => removeVersion(version.id)}
            />
          )}

          {version && (
            <section className="flex flex-col gap-1">
              {!complete || !ready ? (
                <>
                  <h3 className={HEADING}>{labels.productionSpine}</h3>
                  <p className="m-0 text-xs text-(--slate)">{labels.productionSpinePending}</p>
                </>
              ) : (
                <SpineSummary config={config} sheets={ready} labels={labels} paper={record?.paper} papers={papers} />
              )}
              {record && (
                <PaperSection
                  paper={record.paper}
                  papers={papers}
                  config={config}
                  usesPaperFences={usesPaperFences}
                  labels={labels}
                  onChange={(paper) => {
                    const next = { ...record };
                    if (paper) next.paper = paper;
                    else delete next.paper;
                    update(next);
                  }}
                />
              )}
              {sheets && sheets.warnings.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs">
                  {sheets.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <AlertTriangle size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-(--brand)" />
                      <span>{warningText(w, labels)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {version && record && ready && complete && (
            <Button variant="primary" size="sm" onClick={openCoverDesigner}>{labels.coverDesignerOpen}</Button>
          )}

          {version && record && ready && complete && (
            <SheetPreview
              config={config}
              version={version}
              texts={record.texts}
              design={record.design}
              {...(record.endpapers ? { endpapers: record.endpapers } : {})}
              bookResources={bookResources}
              sheets={ready}
              choices={choices}
              shown={shown}
              onChoose={chooseCoverSheet}
              labels={labels}
              fileTitle={title}
            />
          )}


          {version && record && (
            <section className="flex flex-col gap-2">
              <h3 className={HEADING}>{labels.productionTexts}</h3>
              <p className="m-0 text-xs text-(--slate)">{labels.productionTextsIntro}</p>
              {fromBook.title && (
                hasOwnText ? (
                  <ConfirmPopover message={labels.productionFromBookConfirm} confirmLabel={labels.productionFromBook} onConfirm={fillFromBook}>
                    {({ open }) => <Button variant="outline" size="sm" onClick={open}>{labels.productionFromBook}</Button>}
                  </ConfirmPopover>
                ) : (
                  <Button variant="outline" size="sm" onClick={fillFromBook}>{labels.productionFromBook}</Button>
                )
              )}
              {[...(fields.front !== undefined ? ['front' as const] : []), ...COVER_FIELDS]
                .filter((f) => !f.startsWith('flap') || versions.some((v) => v.flaps))
                .map((f) => (
                  <label key={f} className="flex flex-col gap-1 text-xs">
                    {String(labels[FIELD_LABEL[f]])}
                    <textarea
                      rows={ONE_LINE.has(f) ? 1 : 4}
                      value={fields[f] ?? ''}
                      placeholder={fromBook[f] ?? ''}
                      // The fields as they now are: a front cover's old text,
                      // split, is written split from here on.
                      onChange={(e) => update({ ...record, texts: { ...fields, [f]: e.target.value } })}
                      className={cn(INPUT, ONE_LINE.has(f) ? undefined : 'font-mono')}
                    />
                  </label>
                ))}
              <p className="m-0 text-xs text-(--slate)">{labels.productionTextsDesigner}</p>
            </section>
          )}

          {version && record && (
            <div className="flex flex-col gap-2">
              <CoverGallerySection labels={labels} />
              <CoverTemplatesSection record={record} gallery={gallery} library={logoLibrary} labels={labels} onRecord={update} onGallery={updateGallery} />
              {ready?.endpapers && (
                <EndpapersSection
                  endpapers={record.endpapers}
                  collections={collections}
                  labels={labels}
                  onChange={(endpapers) => {
                    const next = { ...record };
                    if (endpapers) next.endpapers = endpapers;
                    else delete next.endpapers;
                    update(next);
                  }}
                />
              )}
              <Fold title={labels.productionDesign}>
                <DesignSection
                  design={record.design ?? {}}
                  resources={coverPictures}
                  onUpload={uploadToGallery}
                  bookTextHex={bookTextHex}
                  labels={labels}
                  onChange={(design) => update({ ...record, design })}
                />
              </Fold>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Fold title={labels.productionLibrary} note={stored.length > 0 ? String(stored.length) : undefined}>
              <p className="m-0 text-xs text-(--slate)">{stored.length === 0 ? labels.productionLibraryEmpty : labels.productionLibraryIntro}</p>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs">
                {stored.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {p.kind === 'paper' ? `${labels.productionPaperProfile}: ` : `${labels.productionBinding}: `}
                      {p.profile.name}
                      {p.kind === 'paper' && p.profile.grammage ? ` · ${p.profile.grammage} g/m²` : ''}
                    </span>
                    <ConfirmPopover message={`${labels.productionDeleteProfile}: ${p.profile.name}`} confirmLabel={labels.productionDeleteProfile} onConfirm={() => void deleteProfile(p.id)}>
                      {({ open }) => <IconButton label={`${labels.productionDeleteProfile}: ${p.profile.name}`} icon={<Trash2 size={14} aria-hidden="true" />} onClick={open} />}
                    </ConfirmPopover>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={() => importRef.current?.click()}>{labels.productionImport}</Button>
                {stored.length > 0 && (
                  <Button variant="outline" size="sm" icon={<Download size={13} />} onClick={exportFile}>{labels.productionExportProfiles}</Button>
                )}
              </div>
              <input ref={importRef} type="file" accept=".json,application/json" className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => void importFile(e)} />
            </Fold>
            <LogoLibrary labels={labels} />
            <CollectionsSection labels={labels} />
          </div>
        </div>
      </PanelBody>
    </div>
  );
}

function VersionForm({ version, labels, bindingOptions, library, trim, onChange, onDelete }: {
  version: ProductionVersion;
  labels: Labels;
  bindingOptions: SelectOption<string>[];
  library: readonly BindingProfile[];
  trim: TrimMm;
  onChange: (v: ProductionVersion) => void;
  onDelete: () => void;
}) {
  const bindingId = typeof version.binding === 'string' ? version.binding : version.binding.id;
  const profile = BUILT_IN_BINDING_PROFILES.find((p) => p.id === bindingId) ?? library.find((p) => p.id === bindingId);
  const isCase = profile?.style === 'caseFlat' || profile?.style === 'caseRound';
  const isbnBad = !!version.isbn?.trim() && !parseIsbn(version.isbn).ok;
  const workBad = !!version.workIsbn?.trim() && !parseIsbn(version.workIsbn).ok;
  const [override, setOverride] = useState(version.spineOverride !== undefined ? String(version.spineOverride) : '');
  // The design margin the profile gives, and this version's own.
  const profileMargin = profile ? resolveBindingMeasures(profile, trim).designMargin : undefined;
  const [margin, setMargin] = useState(version.overrides?.designMargin !== undefined ? String(version.overrides.designMargin) : '');
  const setMarginOverride = (raw: string) => {
    setMargin(raw);
    const n = Number(raw);
    const overrides = { ...version.overrides };
    if (raw.trim() && Number.isFinite(n) && n >= 0) overrides.designMargin = n;
    else delete overrides.designMargin;
    const next: ProductionVersion = { ...version, overrides };
    if (Object.keys(overrides).length === 0) delete next.overrides;
    onChange(next);
  };
  const without = <K extends keyof ProductionVersion>(key: K): ProductionVersion => {
    const rest = { ...version };
    delete rest[key];
    return rest;
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
          {labels.productionVersionName}
          <input type="text" value={version.name} onChange={(e) => onChange({ ...version, name: e.target.value })} className={INPUT} />
        </label>
        <ConfirmPopover message={fill(labels.productionDeleteVersionConfirm, { name: version.name })} confirmLabel={labels.productionDeleteVersion} onConfirm={onDelete}>
          {({ open }) => <IconButton label={`${labels.productionDeleteVersion}: ${version.name}`} icon={<Trash2 size={14} aria-hidden="true" />} onClick={open} />}
        </ConfirmPopover>
      </div>
      <label className="flex flex-col gap-1 text-xs">
        {labels.productionIsbn}
        <input
          type="text"
          inputMode="numeric"
          value={version.isbn ?? ''}
          placeholder="978-84-…"
          aria-invalid={isbnBad || undefined}
          onChange={(e) => onChange(e.target.value.trim() ? { ...version, isbn: e.target.value } : without('isbn'))}
          className={cn(INPUT, isbnBad && 'border-(--danger,#c0392b)')}
        />
        {isbnBad && <span role="alert" className="text-(--danger,#c0392b)">{labels.productionIsbnInvalid}</span>}
      </label>
      <label className="flex flex-col gap-1 text-xs">
        {labels.productionWorkIsbn}
        <input
          type="text"
          inputMode="numeric"
          value={version.workIsbn ?? ''}
          placeholder="978-84-…"
          aria-invalid={workBad || undefined}
          onChange={(e) => onChange(e.target.value.trim() ? { ...version, workIsbn: e.target.value } : without('workIsbn'))}
          className={cn(INPUT, workBad && 'border-(--danger,#c0392b)')}
        />
        {workBad
          ? <span role="alert" className="text-(--danger,#c0392b)">{labels.productionIsbnInvalid}</span>
          : <span className="text-(--slate)">{labels.productionWorkIsbnHint}</span>}
      </label>
      <label className="flex flex-col gap-1 text-xs">
        {labels.productionBinding}
        <Select size="sm" value={bindingId} onValueChange={(id) => onChange({ ...version, binding: id })} options={bindingOptions} ariaLabel={labels.productionBinding} />
      </label>
      <label className="flex items-center justify-between gap-2 text-xs">
        {isCase ? labels.productionJacket : labels.productionFlaps}
        <Switch checked={!!version.flaps} onCheckedChange={(on) => onChange(on ? { ...version, flaps: true } : without('flaps'))} ariaLabel={isCase ? labels.productionJacket : labels.productionFlaps} />
      </label>
      {isCase && (
        <div className="flex flex-col gap-1 text-xs">
          {labels.productionCaseMaterial}
          <SegmentedControl
            size="sm"
            value={version.caseMaterial ?? 'printed'}
            onValueChange={(m) => onChange({ ...version, caseMaterial: m })}
            options={[{ value: 'printed', label: labels.productionCasePrinted }, { value: 'cloth', label: labels.productionCaseCloth }]}
            ariaLabel={labels.productionCaseMaterial}
          />
        </div>
      )}
      <div className="flex flex-col gap-1 text-xs">
        {labels.productionSpineDirection}
        <SegmentedControl
          size="sm"
          value={version.spineText?.direction ?? 'bottomToTop'}
          onValueChange={(d) => onChange({ ...version, spineText: { ...version.spineText, direction: d } })}
          options={[{ value: 'bottomToTop', label: labels.productionSpineUp }, { value: 'topToBottom', label: labels.productionSpineDown }]}
          ariaLabel={labels.productionSpineDirection}
        />
      </div>
      <Fold title={labels.productionPrinterSettings} note={[version.spineOverride !== undefined ? `${labels.productionSpineOverride}: ${mm1(version.spineOverride)}` : '', version.overrides?.designMargin !== undefined ? `${labels.productionDesignMargin}: ${mm1(version.overrides.designMargin)}` : ''].filter(Boolean).join(' · ') || undefined} defaultOpen={version.spineOverride !== undefined}>
        <label className="flex flex-col gap-1 text-xs">
          {labels.productionSpineOverride}
          <input
            type="number"
            min={0}
            step={0.1}
            value={override}
            onChange={(e) => {
              setOverride(e.target.value);
              const n = Number(e.target.value);
              onChange(e.target.value.trim() && Number.isFinite(n) && n > 0 ? { ...version, spineOverride: n } : without('spineOverride'));
            }}
            className={INPUT}
          />
          <span className="text-(--slate)">{labels.productionSpineOverrideHint}</span>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {labels.productionDesignMargin}
          <input
            type="number"
            min={0}
            step={0.5}
            value={margin}
            placeholder={profileMargin !== undefined ? mm1(profileMargin) : ''}
            onChange={(e) => setMarginOverride(e.target.value)}
            className={INPUT}
          />
          <span className="text-(--slate)">{labels.productionDesignMarginHint}</span>
        </label>
      </Fold>
    </section>
  );
}

function SpineSummary({ config, sheets, labels, paper, papers }: {
  config: PostextConfig;
  sheets: VersionSheets;
  labels: Labels;
  paper: BookPaper | undefined;
  papers: readonly PaperProfile[];
}) {
  const main = bookMainPaper(config, paper, papers);
  const inserts = (paper?.inserts ?? []).filter((i) => i.pages > 0);
  const s = sheets.spine;
  return (
    <>
      <h3 className={HEADING}>{labels.productionSpine}</h3>
      <p className="m-0 text-base font-semibold tabular-nums">{mm1(s.used)} mm</p>
      <p className="m-0 text-xs text-(--slate)">
        {fill(labels.productionSpineSummary, {
          // The pages on the main paper: the inserts are told apart below.
          pages: String(Math.max(0, s.pages - inserts.reduce((n, i) => n + i.pages, 0))),
          grammage: String(main.grammage),
          bulk: main.bulk.toLocaleString(),
          block: mm1(s.block),
          spine: mm1(s.used),
        })}
      </p>
      {inserts.map((i, k) => (
        <p key={k} className="m-0 text-xs text-(--slate)">
          {fill(labels.productionSpineInsert, { pages: String(i.pages), name: i.name ?? labels.productionInsertManual, grammage: String(i.grammage), bulk: i.bulk.toLocaleString() })}
        </p>
      ))}
      {s.caseSpine !== undefined && <p className="m-0 text-xs">{fill(labels.productionSpineCase, { spine: mm1(s.caseSpine) })}</p>}
    </>
  );
}

const isSheets = (s: ReturnType<typeof sheetsOf>): s is VersionSheets => 'cover' in s;
