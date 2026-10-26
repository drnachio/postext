'use client';

// The rows of the library panel: one row per saved book and per built-in
// preset, with the preset's licence tag (#1276: split out of
// ProjectsPanel.tsx).
import { Check, ImagePlus, X, Pencil, Languages, Copy, Download, Trash2, RotateCcw, EyeOff, Eye } from 'lucide-react';
import { useState, useRef } from 'react';
import { type ProjectSummary, useSandboxLabels } from '../../context/SandboxContext.js';
import { RowTag, IconButton, ListRow, MenuItem, MenuSeparator } from '../../ui/index.js';
import { sameLocaleTag, presetLocales, activeLocaleTag } from '../../presets/locale.js';
import { localeDisplayName, localeShortTag } from '../../presets/localeNames.js';
import { useBlobObjectUrl } from '../../panels/resources/ResourcePreview.js';
import type { PresetSummary } from '../../presets/index.js';
import { RowActionsMenu } from '../RowActionsMenu.js';
import { LocaleTag } from '../LocaleTag.js';

interface ProjectRowProps {
  project: ProjectSummary;
  isActive: boolean;
  disabled: boolean;
  onActivate: () => void;
  /** Open the project in another of its editions (#903). */
  onActivateEdition: (locale: string) => void;
  uiLocale: string;
  /** A click on the open book: the Chapters panel. */
  onShowChapters: () => void;
  /** `opts.edition`: the title is the language on screen's only (#999). */
  onRename: (name: string, description: string, opts?: { edition?: boolean }) => void;
  /** Add a language to the book (#989). */
  onAddLanguage: () => void;
  canAddLanguage: boolean;
  onDuplicate: () => void;
  onExport: () => void;
  /** Set the cover picture from a file, or drop it with null. */
  onSetThumbnail: (file: File | null) => void;
  onDelete: () => void;
}

export function ProjectRow({
  project,
  isActive,
  disabled,
  onActivate,
  onActivateEdition,
  uiLocale,
  onShowChapters,
  onRename,
  onAddLanguage,
  canAddLanguage,
  onDuplicate,
  onExport,
  onSetThumbnail,
  onDelete,
}: ProjectRowProps) {
  const labels = useSandboxLabels();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [descriptionDraft, setDescriptionDraft] = useState(project.description ?? '');
  const nameRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const editionRef = useRef<HTMLInputElement>(null);
  // A book in several languages: the title may be the one language's (#999).
  const [editionOnly, setEditionOnly] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverUrl = useBlobObjectUrl(project.thumbnail?.fileId);
  // Set once the edit is committed or cancelled, so the blur of the field
  // being unmounted does not commit a second time.
  const settledRef = useRef(false);

  const startRename = () => {
    setDraft(project.name);
    setDescriptionDraft(project.description ?? '');
    setEditionOnly(false);
    settledRef.current = false;
    setEditing(true);
  };
  const cancelRename = () => {
    settledRef.current = true;
    setEditing(false);
  };
  // Name and description are one edit: committed together on Enter in
  // either field, or when focus leaves both.
  const commitRename = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    setEditing(false);
    const name = draft.trim() || project.name;
    const description = descriptionDraft.trim();
    if (name !== project.name || description !== (project.description ?? '')) onRename(name, description, editionOnly && project.locales ? { edition: true } : undefined);
  };
  const fieldProps = {
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      if (e.relatedTarget === nameRef.current || e.relatedTarget === descriptionRef.current || e.relatedTarget === editionRef.current) return;
      commitRename();
    },
    style: { borderColor: 'var(--rule)', color: 'var(--foreground)' },
  };

  const title = editing ? (
    <input
      dir="auto"
      ref={nameRef}
      type="text"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      aria-label={labels.projectNameLabel}
      className="min-w-0 w-full rounded border bg-transparent px-1.5 py-0.5 text-xs font-medium"
      {...fieldProps}
    />
  ) : (
    project.name
  );
  const subtitle = editing ? (
    <>
      <input
        dir="auto"
        ref={descriptionRef}
        type="text"
        value={descriptionDraft}
        onChange={(e) => setDescriptionDraft(e.target.value)}
        aria-label={labels.projectDescriptionLabel}
        placeholder={labels.projectDescriptionLabel}
        className="min-w-0 w-full rounded border bg-transparent px-1.5 py-0.5 text-[11px] font-normal"
        {...fieldProps}
      />
      {project.locales && project.locale && (
        // A press must not take the focus out of the fields: the row would commit before the box is ticked.
        <label className="mt-1 flex min-h-6 items-center gap-1.5 text-[11px] font-normal" onMouseDown={(e) => e.preventDefault()}>
          <input
            ref={editionRef}
            type="checkbox"
            checked={editionOnly}
            onChange={(e) => setEditionOnly(e.target.checked)}
            onKeyDown={fieldProps.onKeyDown}
            onBlur={fieldProps.onBlur}
          />
          {labels.projectRenameEditionOnly.replace('__language__', localeDisplayName(project.locale, uiLocale))}
        </label>
      )}
    </>
  ) : (
    project.description
  );

  const tags = (
    <>
      {project.locales
        // A book kept in several languages: one tag per edition, each
        // opening the project in that language; the one on screen is marked.
        ? project.locales.map((l) => {
            const short = localeShortTag(l, project.locales!);
            const text = short.lang ? <span lang={short.lang}>{short.text}</span> : short.text;
            const name = localeDisplayName(l, uiLocale);
            const current = sameLocaleTag(l, project.locale ?? '');
            if (current || disabled) {
              return (
                <RowTag key={l} accent={isActive && current} label={(current ? labels.presetLocaleActive : labels.presetLocaleLoad).replace('__locale__', name)}>
                  {text}
                </RowTag>
              );
            }
            return (
              <RowTag key={l} onClick={() => onActivateEdition(l)} pressed={false} label={labels.presetLocaleLoad.replace('__locale__', name)}>
                {text}
              </RowTag>
            );
          })
        : project.locale && <LocaleTag locale={project.locale} />}
      {project.chapterCount > 1 && <RowTag>{labels.chapterCountTag.replace('__n__', String(project.chapterCount))}</RowTag>}
      {isActive && <RowTag accent>{labels.presetActive}</RowTag>}
    </>
  );

  // The cover picture, as in a showcase preset's row: the check mark of the
  // open project sits over it.
  const coverImage = coverUrl ? <img src={coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : null;
  const leading = coverImage ? (
    <span
      className="relative flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded-sm border"
      style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
    >
      {coverImage}
      {isActive && (
        <span className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--brand)', background: 'color-mix(in srgb, var(--background) 60%, transparent)' }}>
          <Check size={13} aria-hidden="true" />
        </span>
      )}
    </span>
  ) : (
    <span className="flex h-4 w-4 items-center justify-center" style={{ color: 'var(--brand)' }}>
      {isActive && <Check size={13} aria-hidden="true" />}
    </span>
  );
  // While the row is being edited the cover becomes the control that sets
  // it, in the handle slot — the leading cell is hidden from assistive
  // technology, and buttons do not belong there. A click must not blur the
  // fields: the row would commit and unmount these controls before it lands.
  const keepFocus = (e: React.MouseEvent) => { e.preventDefault(); };
  const coverEditor = (
    <span className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label={labels.projectThumbnailChange}
        title={labels.projectThumbnailChange}
        onMouseDown={keepFocus}
        onClick={() => coverInputRef.current?.click()}
        className="flex h-12 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm border bg-transparent p-0 text-(--slate) hover:text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand-hover)"
        style={{ borderColor: 'var(--rule)' }}
      >
        {coverImage ?? <ImagePlus size={14} aria-hidden="true" />}
      </button>
      {project.thumbnail && (
        <IconButton
          size={18}
          label={labels.projectThumbnailRemove}
          icon={<X size={11} />}
          onMouseDown={keepFocus}
          onClick={() => onSetThumbnail(null)}
        />
      )}
    </span>
  );
  // Always mounted: the file dialog takes the focus out of the row, and a
  // picker that unmounted with the edit would never report its file.
  const coverInput = (
    <input
      ref={coverInputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
      className="hidden"
      aria-hidden="true"
      onChange={(e) => {
        const file = e.target.files?.[0] ?? null;
        e.target.value = '';
        if (file) onSetThumbnail(file);
      }}
    />
  );

  const row = (
    <ListRow
      selected={isActive}
      disabled={disabled}
      onSelect={editing || disabled ? undefined : isActive ? onShowChapters : onActivate}
      ariaLabel={isActive ? `${project.name} (${labels.presetActive})` : `${labels.projectActivate}: ${project.name}`}
      handle={editing ? coverEditor : undefined}
      leading={editing ? undefined : leading}
      title={title}
      subtitle={subtitle}
      tags={tags}
      alignTop={editing || !!project.description}
      actions={
        <RowActionsMenu
          label={labels.rowMoreActions.replace('__name__', project.name)}
          disabled={disabled}
          confirmMessage={labels.projectDeleteConfirm.replace('__name__', project.name)}
          onConfirm={onDelete}
        >
          {(askDelete) => (
            <>
              <MenuItem icon={<Pencil size={13} />} disabled={editing} onClick={startRename}>{labels.projectRename}</MenuItem>
              <MenuItem icon={<Languages size={13} />} disabled={!canAddLanguage} onClick={onAddLanguage}>{labels.projectAddLanguage}</MenuItem>
              <MenuItem icon={<Copy size={13} />} onClick={onDuplicate}>{labels.projectDuplicate}</MenuItem>
              <MenuItem icon={<Download size={13} />} onClick={onExport}>{labels.projectExport}</MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Trash2 size={13} />} destructive onClick={askDelete}>{labels.projectDelete}</MenuItem>
            </>
          )}
        </RowActionsMenu>
      }
    />
  );

  return (
    <li className="mb-0.5">
      {coverInput}
      {row}
    </li>
  );
}

interface PresetRowProps {
  preset: PresetSummary;
  isActive: boolean;
  /** The content locale the active preset is loaded in; null otherwise. */
  activeLocale: string | null;
  /** The interface language, which names the locales in the tooltips. */
  uiLocale: string;
  /** Locales of this preset with a saved draft (the reader's edits). */
  editedLocales: string[];
  /** The cover: the one the preset ships, else the one taken from its
   *  first page. */
  coverUrl: string | undefined;
  disabled: boolean;
  onLoad: () => void;
  /** A click on the open book: the Chapters panel. */
  onShowChapters: () => void;
  /** Open the preset in one of its locales (its draft there, if any). */
  onLoadLocale: (locale: string) => void;
  /** Drop every draft of the preset (asked first). */
  onRestore: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onHide?: () => void;
  onUnhide?: () => void;
}

export function PresetRow({
  preset,
  isActive,
  activeLocale,
  uiLocale,
  editedLocales,
  coverUrl,
  disabled,
  onLoad,
  onShowChapters,
  onLoadLocale,
  onRestore,
  onDuplicate,
  onExport,
  onHide,
  onUnhide,
}: PresetRowProps) {
  const labels = useSandboxLabels();
  const edited = editedLocales.length > 0;

  // A bilingual bundle lists every locale it carries; the primary one
  // otherwise. With more than one, each tag opens the preset in that
  // language (the reader's edits there, if any); the active one is marked.
  // The tags are short (繁 / 简 for the two Chinese editions, 日, ع, EN, ES) and
  // named in full in the interface language by their tooltips.
  const locales = presetLocales(preset);
  const activeTag = isActive ? activeLocaleTag(locales, activeLocale) : null;
  const localeTag = (l: string) => {
    const short = localeShortTag(l, locales);
    const text = short.lang ? <span lang={short.lang}>{short.text}</span> : short.text;
    const name = localeDisplayName(l, uiLocale);
    if (locales.length < 2) return <RowTag key={l} label={name}>{text}</RowTag>;
    const current = activeTag === l;
    const label = (current ? labels.presetLocaleActive : labels.presetLocaleLoad).replace('__locale__', name);
    if (current || disabled) {
      return (
        <RowTag key={l} accent={current} label={label}>
          {text}
        </RowTag>
      );
    }
    return (
      <RowTag key={l} onClick={() => onLoadLocale(l)} pressed={false} label={label}>
        {text}
      </RowTag>
    );
  };
  const editedHint = locales.length > 1 && edited
    ? `${labels.presetEditedHint} (${editedLocales.map((l) => (l ? localeDisplayName(l, uiLocale) : '?')).join(', ')})`
    : labels.presetEditedHint;
  const tags = (
    <>
      {locales.map(localeTag)}
      {edited && <RowTag label={editedHint}>{labels.presetEdited}</RowTag>}
      {preset.license && <RowTag>{licenseText(preset.license)}</RowTag>}
      {preset.source === 'private' && <RowTag>{labels.presetPrivate}</RowTag>}
      {preset.default && <RowTag>{labels.presetDefault}</RowTag>}
      {isActive && <RowTag accent>{labels.presetActive}</RowTag>}
    </>
  );
  const subtitle = !preset.available
    ? labels.presetUnavailable
    : preset.credits
      ? (
        <>
          {preset.description && <span>{preset.description}</span>}
          <span className="mt-0.5 block italic">{preset.credits}</span>
        </>
      )
      : preset.description;
  // Showcase presets carry a page thumbnail (the others get one from their
  // first page once opened); the check mark of the active preset sits over it.
  const leading = coverUrl ? (
    <span
      className="relative flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded-sm border"
      style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
    >
      <img src={coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      {isActive && (
        <span className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--brand)', background: 'color-mix(in srgb, var(--background) 60%, transparent)' }}>
          <Check size={13} aria-hidden="true" />
        </span>
      )}
    </span>
  ) : (
    <span className="flex h-4 w-4 items-center justify-center" style={{ color: 'var(--brand)' }}>
      {isActive && <Check size={13} aria-hidden="true" />}
    </span>
  );

  return (
    <li className="mb-0.5">
      <ListRow
        selected={isActive}
        disabled={disabled}
        onSelect={disabled ? undefined : isActive ? onShowChapters : onLoad}
        ariaLabel={isActive ? `${preset.name} (${labels.presetActive})` : `${labels.presetLoad}: ${preset.name}`}
        leading={leading}
        title={preset.name}
        subtitle={subtitle}
        tags={tags}
        alignTop={!!subtitle}
        actions={
          <RowActionsMenu
            label={labels.rowMoreActions.replace('__name__', preset.name)}
            disabled={disabled && !onHide && !onUnhide}
            confirmMessage={labels.presetRestoreConfirm.replace('__name__', preset.name)}
            onConfirm={onRestore}
          >
            {(askRestore) => (
              <>
                <MenuItem icon={<Copy size={13} />} disabled={disabled} onClick={onDuplicate}>{labels.presetDuplicate}</MenuItem>
                <MenuItem icon={<Download size={13} />} disabled={disabled} onClick={onExport}>{labels.presetExport}</MenuItem>
                {edited && (
                  <MenuItem icon={<RotateCcw size={13} />} disabled={disabled} onClick={askRestore}>
                    {labels.presetReloadActive}
                  </MenuItem>
                )}
                {(onHide || onUnhide) && <MenuSeparator />}
                {onHide && <MenuItem icon={<EyeOff size={13} />} onClick={onHide}>{labels.presetHide}</MenuItem>}
                {onUnhide && <MenuItem icon={<Eye size={13} />} onClick={onUnhide}>{labels.presetUnhide}</MenuItem>}
              </>
            )}
          </RowActionsMenu>
        }
      />
    </li>
  );
}

/** Full names of the abbreviations a licence tag carries (WCAG 3.1.4).
 *  Licence and agency names are proper names, kept as published. */
const LICENSE_ABBR: Record<string, string> = {
  CC: 'Creative Commons',
  BY: 'Attribution',
  SA: 'ShareAlike',
  NC: 'NonCommercial',
  ND: 'NoDerivatives',
  CC0: 'Creative Commons Zero (public domain dedication)',
  MIT: 'MIT License',
  OFL: 'SIL Open Font License',
  EEA: 'European Environment Agency',
};
const LICENSE_ABBR_RE = /\b(CC0|CC|BY|SA|NC|ND|MIT|OFL|EEA)\b/;

/** A licence tag's text with each abbreviation expanded by its title. */
function licenseText(license: string): React.ReactNode {
  return license.split(LICENSE_ABBR_RE).map((part, i) =>
    LICENSE_ABBR[part] ? <abbr key={i} title={LICENSE_ABBR[part]} className="no-underline">{part}</abbr> : part,
  );
}
