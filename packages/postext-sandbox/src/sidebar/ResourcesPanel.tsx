'use client';

import { useMemo, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import type { Resource, ResourceKind, ResourceType, TableModel } from 'postext';
import { defaultResourceTypes } from 'postext';
import { useSandbox } from '../context/SandboxContext';
import { getBlob, putBlob } from '../storage/blobStore';
import { ResourceList } from '../panels/resources/ResourceList';
import { ResourceDetail } from '../panels/resources/ResourceDetail';
import { uniqueSlug } from '../panels/resources/slugify';

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
  const types: ResourceType[] = state.config.resourceTypes ?? defaultResourceTypes();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => resources.find((r) => r.id === selectedId) ?? null,
    [resources, selectedId],
  );

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

  // Empty state: keep the friendly placeholder but with a working "New" path.
  return (
    <div className="flex h-full min-h-0">
      <div
        className="flex h-full flex-col border-r"
        style={{ width: '42%', minWidth: 180, borderColor: 'var(--rule)' }}
      >
        <ResourceList
          resources={resources}
          types={types}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onNew={handleNew}
        />
      </div>
      <div className="h-full min-w-0 flex-1">
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
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <FolderOpen size={40} className="mb-3" style={{ color: 'var(--rule)' }} />
            <p className="text-xs" style={{ color: 'var(--slate)' }}>
              {resources.length === 0
                ? 'No resources yet. Use “New” to upload an image or SVG, or create a table.'
                : 'Select a resource to edit its details.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
