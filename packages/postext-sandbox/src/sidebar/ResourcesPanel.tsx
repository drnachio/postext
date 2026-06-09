'use client';

import { useMemo, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import type { Resource, ResourceKind, ResourceType, TableModel } from 'postext';
import { defaultResourceTypes } from 'postext';
import { useSandbox } from '../context/SandboxContext';
import { getBlob, putBlob } from '../storage/blobStore';
import { ResourceList } from '../panels/resources/ResourceList';
import { ResourceDetail } from '../panels/resources/ResourceDetail';
import { uniqueSlug } from '../panels/resources/slugify';
import { uploadFiles } from '../panels/resources/uploadFiles';

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

/** Build a fresh, empty 2×2 table model for new table resources. */
function emptyTableModel(): TableModel {
  const cell = (isHeader: boolean) => ({ content: '', isHeader });
  return {
    headerRowCount: 1,
    rows: [
      [cell(true), cell(true)],
      [cell(false), cell(false)],
    ],
  };
}

function newResource(kind: ResourceKind, typeId: string, existingIds: Set<string>): Resource {
  const now = Date.now();
  const base = kind === 'bitmap' ? 'image' : kind === 'svg' ? 'svg' : 'table';
  const id = uniqueSlug(base, existingIds, base);
  const resource: Resource = { id, typeId, kind, createdAt: now, updatedAt: now };
  if (kind === 'table') resource.table = { model: emptyTableModel() };
  return resource;
}

export function ResourcesPanel() {
  const { state, dispatch } = useSandbox();
  const resources = state.resources;
  const types: ResourceType[] = state.config.resourceTypes ?? defaultResourceTypes(state.locale);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  // Drag events fire for every nested child; a depth counter keeps the overlay
  // stable until the pointer actually leaves the panel.
  const dragDepth = useRef(0);

  const selected = useMemo(
    () => resources.find((r) => r.id === selectedId) ?? null,
    [resources, selectedId],
  );

  const ingestFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const existingIds = new Set(resources.map((r) => r.id));
    const typeId = types[0]?.id ?? '';
    const { created, skipped } = await uploadFiles(files, typeId, existingIds);
    for (const r of created) dispatch({ type: 'UPSERT_RESOURCE', payload: r });
    if (created.length === 1) setSelectedId(created[0].id);
    setUploadNote(
      skipped.length > 0
        ? state.labels.resourcesUploadNote
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
    const typeId = types[0]?.id ?? '';
    const resource = newResource(kind, typeId, existingIds);
    dispatch({ type: 'UPSERT_RESOURCE', payload: resource });
    setSelectedId(resource.id);
  };

  const handleChange = (next: Resource) => {
    dispatch({ type: 'UPSERT_RESOURCE', payload: next });
  };

  const handleRename = (oldId: string, next: Resource) => {
    // Renaming changes the keyed identity: drop the old record, add the new one.
    // ResourceDetail only commits non-colliding ids, but guard here too.
    if (next.id === oldId || resources.some((r) => r.id === next.id)) {
      dispatch({ type: 'UPSERT_RESOURCE', payload: { ...next, id: oldId } });
      return;
    }

    // The blob store keys records by id and the persistence layer cascade-
    // deletes the old record's blob when the id disappears. To keep a renamed
    // bitmap/SVG intact, copy its blob to a fresh fileId so the cascade deletes
    // the now-orphaned original rather than the live payload.
    const sourceFileId = next.bitmap?.fileId ?? next.svg?.fileId;
    if (sourceFileId) {
      getBlob(sourceFileId)
        .then((record) => (record ? putBlob(record.bytes, record.contentType) : null))
        .then((newFileId) => {
          const remapped: Resource = newFileId
            ? next.bitmap
              ? { ...next, bitmap: { ...next.bitmap, fileId: newFileId } }
              : next.svg
                ? { ...next, svg: { ...next.svg, fileId: newFileId } }
                : next
            : next;
          dispatch({ type: 'DELETE_RESOURCE', payload: oldId });
          dispatch({ type: 'UPSERT_RESOURCE', payload: remapped });
          setSelectedId(remapped.id);
        })
        .catch(() => {
          dispatch({ type: 'DELETE_RESOURCE', payload: oldId });
          dispatch({ type: 'UPSERT_RESOURCE', payload: next });
          setSelectedId(next.id);
        });
      return;
    }

    dispatch({ type: 'DELETE_RESOURCE', payload: oldId });
    dispatch({ type: 'UPSERT_RESOURCE', payload: next });
    setSelectedId(next.id);
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
          otherIds={new Set(resources.filter((r) => r.id !== selected.id).map((r) => r.id))}
          referenceCount={countReferences(state.markdown, selected.id)}
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
            border: '2px dashed var(--gilt)',
            color: 'var(--foreground)',
          }}
        >
          <UploadCloud size={28} aria-hidden="true" style={{ color: 'var(--gilt)' }} />
          <span>{state.labels.resourcesDropToUpload}</span>
        </div>
      )}
    </div>
  );
}
