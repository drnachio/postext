// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { resetViewerEdits } from '../../editor/viewerEdits.js';
import { harness } from './testHarness.js';

afterEach(() => resetViewerEdits());

const base64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const fromBase64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** The exported file with its body text edited as Word would: each
 *  `[find, replace]` once, inside the text runs of word/document.xml. */
function edited(b64: string, edits: [string, string][]): { base64: string; fileName: string } {
  const files = unzipSync(fromBase64(b64));
  let xml = strFromU8(files['word/document.xml']!);
  for (const [find, replace] of edits) {
    expect(xml).toContain(find);
    xml = xml.replace(find, replace);
  }
  files['word/document.xml'] = strToU8(xml);
  return { base64: base64(zipSync(files)), fileName: 'corrected.docx' };
}

describe('the Word round trip as tools (#1397)', () => {
  it('exports the semantic document as data and finds no change in it untouched', async () => {
    const { call } = harness();
    const out = await call('sandbox_export', { format: 'docx', deliver: 'data' });
    expect(out).toMatchObject({ ok: true, format: 'docx', variant: 'semantic', scope: 'book', file: 'Guide.docx' });
    expect(out.base64.length).toBeGreaterThan(1000);
    const chapter = await call('sandbox_export', { format: 'docx', scope: 'chapter', deliver: 'data' });
    expect(chapter.file).toBe('Guide - Opening.docx');
    const dry = await call('sandbox_apply_word_edits', { file: { base64: out.base64, fileName: 'Guide.docx' }, dryRun: true });
    expect(dry).toMatchObject({ ok: true, dryRun: true, variant: 'semantic', counts: { applied: 0, conflict: 0, rejected: 0 }, edits: [] });
    const real = await call('sandbox_apply_word_edits', { file: { base64: out.base64, fileName: 'Guide.docx' }, wait: false });
    expect(real).toMatchObject({ applied: false, changed: false });
  });

  it('applies edits to several chapters as one change that sandbox_undo takes back', async () => {
    const { call, get } = harness();
    const before = get().chapters.map((c) => c.markdown);
    const out = await call('sandbox_export', { format: 'docx', deliver: 'data' });
    const file = edited(out.base64, [['The last words of the opening.', 'The final words of the opening.'], ['>Second<', '>Latter<']]);

    const dry = await call('sandbox_apply_word_edits', { file, dryRun: true });
    expect(dry.counts.applied).toBe(2);
    expect(dry.wouldChange.chapters).toEqual([1, 2]);
    expect(get().chapters.map((c) => c.markdown)).toEqual(before);

    const done = await call('sandbox_apply_word_edits', { file, wait: false });
    expect(done).toMatchObject({ ok: true, applied: true, changed: true, chapters: [1, 2], laidOut: false });
    expect(done.edits.map((e: { chapter: number; status: string }) => [e.chapter, e.status])).toEqual([[1, 'applied'], [2, 'applied']]);
    expect(get().markdown).toContain('The final words of the opening.');
    expect(get().chapters[1]!.markdown).toMatch(/^# Latter\n/);

    const state = await call('sandbox_get_state');
    expect(state.history.undo).toEqual({ kind: 'wordEdits', chapters: [1, 2] });
    const undone = await call('sandbox_undo', { wait: false });
    expect(undone).toMatchObject({ ok: true, undone: { kind: 'wordEdits', chapters: [1, 2] }, canUndo: false, canRedo: true });
    expect(get().chapters.map((c) => c.markdown)).toEqual(before);
    await call('sandbox_undo', { redo: true, wait: false });
    expect(get().chapters[1]!.markdown).toMatch(/^# Latter\n/);
    expect(get().markdown).toContain('The final words of the opening.');
  });

  it('reports an edit to text that changed in the book since the export as a conflict', async () => {
    const { call, get } = harness();
    const out = await call('sandbox_export', { format: 'docx', deliver: 'data' });
    // The book changed the same word; an edit elsewhere in the sentence
    // would have been merged.
    await call('sandbox_edit_text', { edits: [{ find: 'The last words of the opening.', replace: 'The closing words of the opening.' }], wait: false });
    const file = edited(out.base64, [['The last words of the opening.', 'The final words of the opening.']]);
    const dry = await call('sandbox_apply_word_edits', { file, dryRun: true });
    expect(dry.counts).toEqual({ applied: 0, conflict: 1, rejected: 0 });
    expect(dry.edits[0]).toMatchObject({ status: 'conflict', chapter: 1, reason: 'changed-since-export' });
    expect((await call('sandbox_apply_word_edits', { file, wait: false })).changed).toBe(false);
    expect(get().markdown).toContain('The closing words of the opening.');
  });

  it('sends each kind of file to its own tool', async () => {
    const { call } = harness();
    const out = await call('sandbox_export', { format: 'docx', deliver: 'data' });
    const exported = { base64: out.base64, fileName: 'Guide.docx' };
    expect((await call('sandbox_import_word', { file: exported, dryRun: true })).error).toMatch(/was exported from the Sandbox: sandbox_apply_word_edits/);
    const old = new Uint8Array(readFileSync(new URL('../../word/__fixtures__/old-harbour.docx', import.meta.url)));
    expect((await call('sandbox_apply_word_edits', { file: { base64: base64(old), fileName: 'harbour.docx' } })).error).toMatch(/was not exported from the Sandbox/);
    const notZip = base64(new TextEncoder().encode('{\\rtf1 not a docx}'));
    expect((await call('sandbox_apply_word_edits', { file: { base64: notZip, fileName: 'notes.rtf' } })).error).toMatch(/is not a \.docx file/);
  });
});
