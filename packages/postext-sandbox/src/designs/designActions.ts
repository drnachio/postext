/**
 * What can be done with designs (#1523), in one plain module the Design
 * panel and the WebMCP tools share: save the book's design (or another
 * stored book's), try a design on the book and keep or discard it, apply
 * one at once or as a chapter style, import and export design files.
 *
 * Every change to the book is one `SET_CONFIG` step of the history
 * (Cmd/Ctrl+Z takes it back). In a book in several languages the design
 * is the general settings': it is read from them and written to them, and
 * the edition on screen is rebased on the result, as a write the Design
 * panel makes for every language.
 */

import {
  DESIGN_PARTS,
  applyDesign,
  designFileIds,
  designMissingStyles,
  designPartSlots,
  extractDesign,
  isBookPageKey,
  isBookWideKey,
  pickDesignParts,
  revertDesign,
  type Design,
  type DesignPart,
  type MissingStyle,
  type PostextConfig,
} from 'postext';
import { createDesignBundle } from 'postext/bundle';
import type { SandboxAction, SandboxState } from '../context/SandboxContext.js';
import { generalSettingsFrom, generalSettingsView, generalSettingsWithWording, rebaseEdition, recordSharedConfig } from '../editions/configLayers.js';
import { chapterStyleView, newChapterStyle, writeChapterStyle } from '../editions/chapterStyleEdit.js';
import { getFontFile, putFontFiles } from '../storage/fontStorage.js';
import { getBlob, putBlobsAt } from '../storage/blobStore.js';
import { getProject } from '../storage/projects.js';
import { configFromExport } from '../storage/persistence.js';
import { slugify } from '../panels/resources/slugify.js';
import { deleteSavedDesign, generateDesignId, putSavedDesign } from './designStore.js';
import { loadDesign, readDesignFile, type DesignEntry, type DesignSourcesContext, type ReadyDesign } from './designSources.js';
import { bookKey, designTrialOf, setDesignTrial, type DesignTrial } from './designTrial.js';

/** What the design actions work on. */
export interface DesignHost {
  getState: () => SandboxState;
  dispatch: (action: SandboxAction) => void;
  /** Where the gallery's designs come from. */
  sources: () => DesignSourcesContext;
}

/** The book's design as a design reads and writes it: the general
 *  settings of a book in several languages, else its configuration. */
export function bookDesignConfig(s: Pick<SandboxState, 'config' | 'configLayers'>): PostextConfig {
  return s.configLayers ? generalSettingsView(s.configLayers.shared, s.config) : s.config;
}

/** The write that gives the book `next` as its design (see
 *  {@link bookDesignConfig}), one step of the history. */
export function writeBookDesign(s: SandboxState, next: PostextConfig): SandboxAction {
  const layers = s.configLayers;
  if (!layers) return { type: 'SET_CONFIG', payload: next, history: { merge: false } };
  const shared = generalSettingsFrom(next, s.config);
  return { type: 'SET_CONFIG', payload: rebaseEdition(layers.shared, shared, s.config), shared, history: { merge: false } };
}

/** Put a design's font files and profiles in the Sandbox's stores, before
 *  the book names them. */
export async function storeDesignFiles(ready: Pick<ReadyDesign, 'fonts' | 'blobs'>): Promise<void> {
  if (ready.fonts.length > 0) await putFontFiles(ready.fonts);
  if (ready.blobs.length > 0) await putBlobsAt(ready.blobs);
}

function chosenParts(design: Design, parts: readonly DesignPart[] | undefined): DesignPart[] {
  if (!parts || parts.length === 0) return [...design.parts];
  return design.parts.filter((p) => parts.includes(p));
}

function missingOf(s: SandboxState, before: PostextConfig, after: PostextConfig): MissingStyle[] {
  return designMissingStyles(s.chapters.map((c) => c.markdown), before, after, s.resources);
}

/** Try a design on the book: its `parts` (all it holds when left out)
 *  over the book's design as it was before the first try. Resolves to the
 *  trial, with the style ids the text uses that the design lacks. */
export async function tryDesign(host: DesignHost, entryId: string, parts?: readonly DesignPart[]): Promise<DesignTrial> {
  const ready = await loadDesign(host.sources(), entryId);
  await storeDesignFiles(ready);
  const s = host.getState();
  const before = designTrialOf(s)?.before ?? bookDesignConfig(s);
  const chosen = chosenParts(ready.design, parts);
  if (chosen.length === 0) throw new Error('None of the parts asked for is in the design');
  const applied = applyDesign(before, ready.design, chosen);
  host.dispatch(writeBookDesign(s, applied));
  const trial: DesignTrial = { book: bookKey(s), entryId, name: ready.entry.name, parts: chosen, before, applied, missing: missingOf(s, before, applied) };
  setDesignTrial(trial);
  return trial;
}

/** Keep the design being tried. Resolves to it (null: none). */
export function keepDesign(host: DesignHost): DesignTrial | null {
  const t = designTrialOf(host.getState());
  setDesignTrial(null);
  return t;
}

/** Take the design being tried off the book: what it replaced comes
 *  back, every other edit stays. Resolves to it (null: none). */
export function discardDesign(host: DesignHost): DesignTrial | null {
  const s = host.getState();
  const t = designTrialOf(s);
  if (!t) return null;
  host.dispatch(writeBookDesign(s, revertDesign(bookDesignConfig(s), t.before, t.applied)));
  setDesignTrial(null);
  return t;
}

/** Apply a design at once (a design being tried is kept first). Resolves
 *  to the style ids the text uses that the design lacks. */
export async function applyDesignNow(host: DesignHost, entryId: string, parts?: readonly DesignPart[]): Promise<{ entry: DesignEntry; parts: DesignPart[]; missing: MissingStyle[] }> {
  const ready = await loadDesign(host.sources(), entryId);
  await storeDesignFiles(ready);
  setDesignTrial(null);
  const s = host.getState();
  const before = bookDesignConfig(s);
  const chosen = chosenParts(ready.design, parts);
  if (chosen.length === 0) throw new Error('None of the parts asked for is in the design');
  const after = applyDesign(before, ready.design, chosen);
  host.dispatch(writeBookDesign(s, after));
  return { entry: ready.entry, parts: chosen, missing: missingOf(s, before, after) };
}

/** The parts a chapter style can take: those with a setting a chapter may
 *  set apart from the rest of the book. */
export const CHAPTER_STYLE_PARTS: readonly DesignPart[] = DESIGN_PARTS.filter((p) =>
  designPartSlots([p]).some((s) => !isBookWideKey(s.key) && !(s.key === 'page' && s.field !== undefined && isBookPageKey(s.field))),
);

/**
 * Keep a design's `parts` as a chapter style: style `target.id` when the
 * book has it, else a new style called `target.name`. The style holds what
 * the design changes over the book, so a chapter that names it
 * (`chapterStyle:`) or a part (`:::part{style="…"}`) is set in the
 * design and the rest of the book is not. The design's font families join
 * the book's, where every style reads them.
 */
export async function designAsChapterStyle(
  host: DesignHost,
  entryId: string,
  parts: readonly DesignPart[] | undefined,
  target: { id: string } | { name: string },
): Promise<{ id: string; name: string; created: boolean }> {
  const ready = await loadDesign(host.sources(), entryId);
  await storeDesignFiles(ready);
  const s = host.getState();
  const book = bookDesignConfig(s);
  const styles = book.chapterStyles ?? [];
  const existing = 'id' in target ? styles.find((st) => st.id === target.id) : undefined;
  if ('id' in target && !existing) throw new Error(`The book has no chapter style "${target.id}"`);
  const made = existing ? undefined : newChapterStyle(styles, 'name' in target ? target.name : ready.entry.name);
  const id = existing?.id ?? made!.id;
  const withStyle: PostextConfig = made ? { ...book, chapterStyles: [...styles, made] } : book;
  const chosen = chosenParts(ready.design, parts).filter((p) => CHAPTER_STYLE_PARTS.includes(p));
  if (chosen.length === 0) throw new Error('None of the parts asked for can go in a chapter style');
  const after = applyDesign(chapterStyleView(withStyle, id), { ...ready.design, config: { ...ready.design.config, chapterStyles: undefined } as PostextConfig }, chosen);
  const withFonts: PostextConfig = after.customFonts ? { ...withStyle, customFonts: after.customFonts } : withStyle;
  const next = writeChapterStyle(withFonts, id, { ...after, customFonts: withFonts.customFonts } as PostextConfig);
  host.dispatch(writeBookDesign(s, next));
  const style = next.chapterStyles?.find((st) => st.id === id);
  return { id, name: style?.name ?? id, created: !existing };
}

/** The book a design is saved from: the one on screen, or a stored one. */
async function sourceConfig(s: SandboxState, from: string | undefined): Promise<{ config: PostextConfig; name?: string }> {
  if (!from || from === s.activeProjectId) {
    const name = s.activeProjectId ? s.projects.find((p) => p.id === s.activeProjectId)?.name : s.presetSummaries.find((p) => p.id === s.activePresetId)?.name;
    const config = s.configLayers ? generalSettingsWithWording(bookDesignConfig(s), s.config) : s.config;
    return { config: { ...config, ...(s.config.locale ? { locale: s.config.locale } : {}) }, ...(name ? { name } : {}) };
  }
  const record = await getProject(from);
  if (!record) throw new Error(`No stored book "${from}"`);
  const shared = recordSharedConfig(record);
  const config = shared ? generalSettingsWithWording(shared, record.config) : record.config;
  return { config: { ...config, ...(record.config.locale ? { locale: record.config.locale } : {}) }, name: record.name };
}

/** The bytes of the files a design names, from the Sandbox's stores. */
async function storedFiles(design: Design): Promise<Map<string, ArrayBuffer>> {
  const { fontIds, blobIds } = designFileIds(design.config);
  const files = new Map<string, ArrayBuffer>();
  await Promise.all([
    ...fontIds.map(async (id) => { const f = await getFontFile(id).catch(() => null); if (f) files.set(id, f.buffer); }),
    ...blobIds.map(async (id) => { const b = await getBlob(id).catch(() => null); if (b) files.set(id, b.bytes); }),
  ]);
  return files;
}

function filesOf(ready: ReadyDesign): Map<string, ArrayBuffer> {
  const files = new Map<string, ArrayBuffer>();
  for (const f of ready.fonts) files.set(f.fileId, f.buffer);
  for (const b of ready.blobs) files.set(b.fileId, b.bytes);
  return files;
}

async function storeDesignBytes(entry: { name: string; description?: string; source?: string; parts: DesignPart[] }, bytes: Uint8Array): Promise<DesignEntry> {
  const id = generateDesignId();
  const now = Date.now();
  const copy = bytes.slice().buffer as ArrayBuffer;
  await putSavedDesign({ id, name: entry.name, ...(entry.description ? { description: entry.description } : {}), ...(entry.source ? { source: entry.source } : {}), parts: entry.parts, createdAt: now, updatedAt: now, bytes: copy });
  return { id: `saved:${id}`, kind: 'saved', name: entry.name, ...(entry.description ? { description: entry.description } : {}), ...(entry.source ? { source: entry.source } : {}), parts: entry.parts };
}

/** Save the design of the book on screen (or of the stored book `from`):
 *  its `parts` (all when left out). */
export async function saveDesign(host: DesignHost, input: { name: string; description?: string; parts?: readonly DesignPart[]; from?: string }): Promise<{ entry: DesignEntry; warnings: string[] }> {
  const name = input.name.trim();
  if (!name) throw new Error('A design needs a name');
  const s = host.getState();
  const source = await sourceConfig(s, input.from);
  const design = extractDesign(source.config, input.parts && input.parts.length > 0 ? input.parts : DESIGN_PARTS);
  const made = await createDesignBundle({ name, ...(input.description ? { description: input.description } : {}), locale: s.locale, design, files: await storedFiles(design) });
  const entry = await storeDesignBytes({ name, ...(input.description ? { description: input.description } : {}), ...(source.name ? { source: source.name } : {}), parts: design.parts }, made.bytes);
  return { entry, warnings: made.warnings };
}

/** A design file (`.postext`, a design or a book) or an exported
 *  configuration (`.json`) added to the saved designs. Throws when the
 *  file is neither, or breaks the design file's limits. */
export async function importDesign(host: DesignHost, bytes: Uint8Array, fileName: string): Promise<{ entry: DesignEntry; warnings: string[] }> {
  const s = host.getState();
  const base = fileName.replace(/\.[^.]+$/, '') || 'design';
  if (bytes[0] === 0x7b) {
    let data: unknown;
    try {
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error(`"${fileName}" is not a design file`);
    }
    const rec = data as { type?: unknown; version?: unknown; config?: unknown; configVersion?: number };
    if (rec?.type !== 'postext-config' || rec.version !== 1 || typeof rec.config !== 'object' || rec.config === null) throw new Error(`"${fileName}" is not a design file`);
    const design = extractDesign(configFromExport(rec as Parameters<typeof configFromExport>[0]));
    const made = await createDesignBundle({ name: base, locale: s.locale, design });
    return { entry: await storeDesignBytes({ name: base, parts: design.parts }, made.bytes), warnings: made.warnings };
  }
  const ready = await readDesignFile(bytes, { id: 'import', kind: 'saved' }, s.locale);
  const entry = { name: ready.entry.name || base, ...(ready.entry.description ? { description: ready.entry.description } : {}), parts: ready.design.parts };
  if (!ready.fromBook) return { entry: await storeDesignBytes(entry, bytes), warnings: ready.warnings };
  // A book: its design written as a design file of its own.
  const made = await createDesignBundle({ ...entry, locale: s.locale, design: ready.design, files: filesOf(ready) });
  return { entry: await storeDesignBytes(entry, made.bytes), warnings: [...ready.warnings, ...made.warnings] };
}

/** A design file to download: a design of the gallery (`entryId`) or the
 *  book's own, cut down to `parts` (all it holds when left out). */
export async function exportDesign(host: DesignHost, input: { entryId?: string; parts?: readonly DesignPart[]; name?: string }): Promise<{ bytes: Uint8Array; fileName: string; parts: DesignPart[]; warnings: string[] }> {
  const s = host.getState();
  let design: Design;
  let files: Map<string, ArrayBuffer>;
  let name: string;
  let description: string | undefined;
  if (input.entryId) {
    const ready = await loadDesign(host.sources(), input.entryId);
    design = input.parts && input.parts.length > 0 ? pickDesignParts(ready.design, input.parts) : ready.design;
    files = filesOf(ready);
    name = input.name?.trim() || ready.entry.name;
    description = ready.entry.description;
  } else {
    const source = await sourceConfig(s, undefined);
    design = extractDesign(source.config, input.parts && input.parts.length > 0 ? input.parts : DESIGN_PARTS);
    files = await storedFiles(design);
    name = input.name?.trim() || source.name || 'design';
  }
  if (design.parts.length === 0) throw new Error('None of the parts asked for is in the design');
  const made = await createDesignBundle({ name, ...(description ? { description } : {}), locale: s.locale, design, files });
  return { bytes: made.bytes, fileName: `${slugify(name) || 'design'}.postext`, parts: design.parts, warnings: made.warnings };
}

/** Delete a saved design. */
export async function deleteDesign(entryId: string): Promise<void> {
  if (!entryId.startsWith('saved:')) throw new Error('Only a saved design can be deleted');
  await deleteSavedDesign(entryId.slice('saved:'.length));
}
