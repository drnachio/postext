// The book's resources (pictures, diagrams, tables, videos) and its own
// fonts: what the Resources and Fonts panels do, done with the functions
// the panels call.

import { invalidateResourceImage } from '../../controls/media/resourceImages.js';
import { readSvgFaces } from '../../panels/resources/svg/svgFaces.js';
import { getBlob } from '../../storage/blobStore.js';
import { type SandboxToolHost, dispatchAndWait } from '../host.js';
import { type WebMcpTool, ToolError } from '../modelContext.js';
import { layoutAnswer } from './book.js';
import { tableRows, typesOf, sizeOf } from './resources/schema.js';
import { createSaveResource } from './resources/saveResource.js';
import { createFontTools } from './resources/fonts.js';

export { readFileInput, type FileInput } from '../fileInput.js';

export function resourceTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;

  const listResources: WebMcpTool = {
    name: 'sandbox_list_resources',
    title: 'Sandbox: the book\'s resources',
    description: 'The pictures, diagrams, tables, videos and music examples of the book, which the text places with ::resource{id="…"} and cites with :ref{id="…"}: each one\'s id, kind, type, caption, size and how often the text uses it. With an id: that resource in full — its record (a table\'s cells with their formatting under resource.table.model.rows, which sandbox_save_resource takes back as table.cells; a picture\'s marks; a video\'s source and player), the source of an SVG and what became of the fonts its text names, the texts of a table\'s cells as rows.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Give this resource in full.' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (args) => {
      const s = store.getSnapshot();
      const text = s.chapters.map((c) => c.markdown).join('\n');
      const uses = (id: string): number => text.split(`id="${id}"`).length - 1;
      if (args.id !== undefined) {
        const resource = s.resources.find((r) => r.id === args.id);
        if (!resource) throw new ToolError(`No resource with id ${JSON.stringify(args.id)}. The ids: ${s.resources.map((r) => r.id).join(', ') || 'none'}.`);
        const answer: Record<string, unknown> = { resource, usedInText: uses(resource.id) };
        if (resource.kind === 'svg' && resource.svg) {
          const blob = await getBlob(resource.svg.fileId).catch(() => null);
          if (blob) answer.svg = new TextDecoder().decode(blob.bytes);
          // What the detail pane lists under the picture's fonts: each face
          // its text names, embedded when the document and the picture
          // both say so, else only named.
          const embedded = s.config.diagramStyle?.inlineFonts !== false && resource.svg.inlineFonts !== false;
          try {
            answer.fonts = { embedded, faces: await readSvgFaces(resource.svg.fileId, embedded) };
          } catch {
            answer.fonts = { embedded, unavailable: 'The faces could not be read here.' };
          }
        }
        if (resource.kind === 'table' && resource.table) {
          answer.rows = tableRows(resource.table.model);
          answer.tableStyles = (s.config.tableStyles ?? []).map((t) => ({ id: t.id, ...(t.name ? { name: t.name } : {}) }));
        }
        if (resource.kind === 'score' && resource.score) {
          // The styles a score can be set in (#1173).
          answer.scoreStyles = (s.config.scoreStyles ?? []).map((t) => ({ id: t.id, ...(t.name ? { name: t.name } : {}) }));
        }
        return answer;
      }
      return {
        types: typesOf(s).map((t) => ({ id: t.id, name: t.name })),
        resources: s.resources.map((r) => ({
          id: r.id,
          kind: r.kind,
          type: r.typeId,
          ...(r.caption ? { caption: r.caption } : {}),
          ...(sizeOf(r) ? { size: sizeOf(r) } : {}),
          ...(r.kind === 'table' && r.table ? { rows: r.table.model.rows.length, columns: r.table.model.rows[0]?.length ?? 0 } : {}),
          ...(r.kind === 'video' && r.video ? { source: r.video.source } : {}),
          ...(r.kind === 'score' && r.score ? { format: r.score.format, ...(r.score.styleId ? { styleId: r.score.styleId } : {}) } : {}),
          usedInText: uses(r.id),
        })),
      };
    },
  };

  const {
    saveResource
  } = createSaveResource({
    host, store
  });

  const deleteResource: WebMcpTool = {
    name: 'sandbox_delete_resource',
    title: 'Sandbox: delete a resource',
    description: 'Delete a resource and its file from the book. It cannot be undone; places in the text that use it are left pointing at nothing and show up as warnings.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, wait: { type: 'boolean', description: 'Wait for the book to be laid out again (default true).' } },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { consequentialHint: true },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      const resource = s.resources.find((r) => r.id === args.id);
      if (!resource) throw new ToolError(`No resource with id ${JSON.stringify(args.id)}. The ids: ${s.resources.map((r) => r.id).join(', ') || 'none'}.`);
      const usedInText = s.chapters.map((c) => c.markdown).join('\n').split(`id="${resource.id}"`).length - 1;
      await dispatchAndWait(host, { type: 'DELETE_RESOURCE', payload: resource.id });
      const fileId = resource.bitmap?.fileId ?? resource.svg?.fileId ?? resource.video?.poster?.fileId;
      if (fileId) invalidateResourceImage(fileId);
      return { deleted: resource.id, stillUsedInText: usedInText, ...(await layoutAnswer(host, args.wait, signal)) };
    },
  };

  const {
    listFonts, saveFont
  } = createFontTools({
    host, store
  });

  return [listResources, saveResource, deleteResource, listFonts, saveFont];
}
