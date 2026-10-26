'use client';

import { composeBookMemo } from '../book/compose.js';

import { useCallback, useMemo, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import type { Resource, ResourceKind, ResourceType } from 'postext';
import { defaultResourceTypes } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../context/SandboxContext.js';
import { ResourceList } from '../panels/resources/ResourceList.js';
import { ResourceDetail } from '../panels/resources/ResourceDetail.js';
import { newResource, renameResource, typesWithExample, typesWithVideo } from '../panels/resources/resourceEdits.js';
import { uploadFiles } from '../panels/resources/uploads/uploadFiles.js';

/** Escape a string for safe inclusion in a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Count `::resource{id="X"}` and `:ref{id="X"}` occurrences in the markdown. */
function countReferences(markdown: string, id: string): number {
  if (!id) return 0;
  const esc = escapeRegExp(id);
  const re = new RegExp(`(?:::resource|:ref)\\{[^}]*id="${esc}"`, 'g');
  return (markdown.match(re) ?? []).length;
}

interface ResourcesPanelProps {
  /** Host theme, forwarded to the SVG source editor (CodeMirror theme). */
  isDark?: boolean;
}

export function ResourcesPanel({ isDark = true }: ResourcesPanelProps) {
  // Slices only: the whole state changes on every keystroke, caret move and
  // relayout, and a panel of many thumbnails must not re-render for those.
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const resources = useSandboxSelector((s) => s.resources);
  const configTypes = useSandboxSelector((s) => s.config.resourceTypes);
  const locale = useSandboxSelector((s) => s.locale);
  const chapters = useSandboxSelector((s) => s.chapters);
  const types: ResourceType[] = useMemo(() => configTypes ?? defaultResourceTypes(locale), [configTypes, locale]);

  // The open resource lives in shared state (a preview click can open it, and
  // it survives switching panels); this panel only reads and sets it.
  const selectedId = useSandboxSelector((s) => s.activeResourceId);
  const setSelectedId = useCallback(
    (id: string | null) => dispatch({ type: 'SET_ACTIVE_RESOURCE', payload: id }),
    [dispatch],
  );
  const [dropActive, setDropActive] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  // Drag events fire for every nested child; a depth counter keeps the overlay
  // stable until the pointer actually leaves the panel.
  const dragDepth = useRef(0);

  const selected = useMemo(
    () => resources.find((r) => r.id === selectedId) ?? null,
    [resources, selectedId],
  );
  const otherIds = useMemo(
    () => new Set(resources.filter((r) => r.id !== selectedId).map((r) => r.id)),
    [resources, selectedId],
  );
  // Counted over the whole book (resources are shared by every chapter);
  // only recounted when the text or the selection changes.
  const referenceCount = useMemo(
    () => (selectedId ? countReferences(composeBookMemo(chapters).markdown, selectedId) : 0),
    [chapters, selectedId],
  );

  // Videos are numbered in a sequence of their own (#454): a book whose
  // types predate them gets the built-in Video type when it adds one.
  const videoTypeId = (): string => {
    const withVideo = typesWithVideo(types, locale);
    // The Video type comes with the video: no step of the history (#899).
    if (withVideo) dispatch({ type: 'UPDATE_CONFIG', payload: { resourceTypes: withVideo }, history: false });
    return 'video';
  };

  // Music examples (#1172) likewise get the built-in Example type.
  const exampleTypeId = (): string => {
    const withExample = typesWithExample(types, locale);
    if (withExample) dispatch({ type: 'UPDATE_CONFIG', payload: { resourceTypes: withExample }, history: false });
    return 'example';
  };

  const ingestFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const existingIds = new Set(resources.map((r) => r.id));
    const typeId = types[0]?.id ?? '';
    const { created, skipped } = await uploadFiles(files, typeId, existingIds, videoTypeId, exampleTypeId);
    for (const r of created) dispatch({ type: 'UPSERT_RESOURCE', payload: r });
    if (created.length === 1) setSelectedId(created[0].id);
    setUploadNote(
      skipped.length > 0
        ? labels.resourcesUploadNote
            .replace('__added__', String(created.length))
            .replace('__skipped__', String(skipped.length))
        : null,
    );
  };

  // Only react to drags that carry files (not internal element drags).
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');

  const handleDragEnter = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDropActive(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDropActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDropActive(false);
    void ingestFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const handleNew = (kind: ResourceKind) => {
    const existingIds = new Set(resources.map((r) => r.id));
    const typeId = kind === 'video' ? videoTypeId() : kind === 'score' ? exampleTypeId() : (types.find((t) => t.id !== 'video') ?? types[0])?.id ?? '';
    const resource = newResource(kind, typeId, existingIds);
    dispatch({ type: 'UPSERT_RESOURCE', payload: resource });
    setSelectedId(resource.id);
  };

  const handleChange = (next: Resource) => {
    dispatch({ type: 'UPSERT_RESOURCE', payload: next });
  };

  const handleRename = (oldId: string, next: Resource) => {
    // ResourceDetail only commits non-colliding ids; the rename guards too.
    void renameResource(oldId, next, resources, dispatch);
  };

  const handleDelete = () => {
    if (!selected) return;
    dispatch({ type: 'DELETE_RESOURCE', payload: selected.id });
    setSelectedId(null);
  };

  // Single-column flow: the list fills the panel, and selecting a resource
  // swaps it for the detail view (with a back button) rather than splitting
  // the panel into two narrow columns. The whole panel is a drop target so
  // files dragged from disk (one or many) upload automatically.
  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {selected ? (
        <ResourceDetail
          key={selected.id}
          resource={selected}
          types={types}
          isDark={isDark}
          otherIds={otherIds}
          referenceCount={referenceCount}
          onChange={handleChange}
          onRename={handleRename}
          onDelete={handleDelete}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <>
          <ResourceList
            resources={resources}
            types={types}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onNew={handleNew}
          />
          {uploadNote && (
            <div
              className="border-t px-2 py-1 text-xs"
              style={{ borderColor: 'var(--rule)', color: 'var(--slate)' }}
            >
              {uploadNote}
            </div>
          )}
        </>
      )}

      {dropActive && (
        <div
          className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 text-xs"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--background) 85%, transparent)',
            border: '2px dashed var(--brand)',
            color: 'var(--foreground)',
          }}
        >
          <UploadCloud size={28} aria-hidden="true" style={{ color: 'var(--brand)' }} />
          <span>{labels.resourcesDropToUpload}</span>
        </div>
      )}
    </div>
  );
}
