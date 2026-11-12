/**
 * A jump to a frame of a composed page in one edition (#867): a check of
 * the Checks panel, or the edition switcher keeping the reader on the same
 * composed page in another language.
 *
 * The URL fragment opens the edition, the chapter and the page (the
 * permalink syncs do that already, for links and the contents); the jump
 * waits here until the edition's chapter is laid out, then the canvas
 * hook (`useFrameJumpRunner`) lands on the fence's page in that edition,
 * picks the frame and puts the editor's caret in its slot.
 */

import { hashBundleFragment, hashBundleOrigin, readViewHash, viewHashFragment, type HashBundleRef } from '../storage/viewHash.js';
import { openLinkQuietly } from '../context/hashBundle.js';
import type { FrameJump } from '../warnings/composedChecks.js';
import { setOverlapFocus } from './overlapFocus.js';
import { hasWindow } from '../env/window.js';

export interface PendingFrameJump extends FrameJump {
  /** The book the jump is for: a preset's id (null for a project). */
  presetId: string | null;
  /** The local project it is for, when that is the book (#903). */
  projectId?: string | null;
  /** Another language of a book a host links to (#1011): the link, which
   *  opens `locale` as a project of its own. */
  linked?: HashBundleRef | null;
  /** Leave the editor where it is (the edition switcher). */
  keepEditor?: boolean;
  /** When it was asked for: a jump the book never reaches is dropped. */
  at: number;
}

/** How long a jump waits for its edition and chapter to be laid out. */
export const FRAME_JUMP_TIMEOUT_MS = 60_000;

const listeners = new Set<() => void>();
let pending: PendingFrameJump | null = null;

/** A frame just reached, outlined on the canvas for a moment. */
export interface JumpFlash {
  frameId: string;
  /** Its page in the document on screen. */
  pageIndex: number;
  until: number;
}
let flash: JumpFlash | null = null;

function emit(): void {
  for (const l of listeners) l();
}

export function onFrameJumpChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function pendingFrameJump(): PendingFrameJump | null {
  if (pending && Date.now() - pending.at > FRAME_JUMP_TIMEOUT_MS) pending = null;
  return pending;
}

export function clearFrameJump(): void {
  if (pending === null) return;
  pending = null;
  emit();
}

export function jumpFlashNow(): JumpFlash | null {
  return flash && flash.until > Date.now() ? flash : null;
}

export function setJumpFlash(next: JumpFlash | null): void {
  flash = next;
  emit();
}

/** The fragment a jump writes: the edition (for a preset), the canvas, the
 *  chapter and the page. Pure (tests). */
export function frameJumpFragment(current: ReturnType<typeof readViewHash>, jump: Pick<PendingFrameJump, 'presetId' | 'projectId' | 'linked' | 'locale' | 'chapterIndex' | 'page'>): string {
  if (jump.linked && jump.locale !== '') {
    return hashBundleFragment({ ...jump.linked, lang: jump.locale }, { view: 'canvas', chapter: jump.chapterIndex ?? current.chapter, page: jump.page ?? null });
  }
  const otherEdition = (jump.presetId !== null || (jump.projectId ?? null) !== null) && jump.locale !== '';
  return viewHashFragment({
    ...current,
    ...(otherEdition
      ? jump.presetId !== null
        ? { preset: jump.presetId, project: null, lang: jump.locale }
        : { preset: null, project: jump.projectId ?? null, lang: jump.locale }
      : {}),
    view: 'canvas',
    chapter: jump.chapterIndex ?? current.chapter,
    page: jump.page ?? null,
  });
}

/** Go to a frame: the fragment opens what it names, and the jump waits for
 *  the page to be laid out. */
export function requestFrameJump(jump: Omit<PendingFrameJump, 'at'>): void {
  pending = { ...jump, at: Date.now() };
  // The overlap drawn for an earlier check goes; this jump's is drawn once
  // it lands (`useFrameJumpRunner`).
  setOverlapFocus(null);
  emit();
  if (!hasWindow()) return;
  // The reader's copy of that language opens as it is (#1011).
  if (jump.linked && jump.locale !== '') openLinkQuietly(hashBundleOrigin({ ...jump.linked, lang: jump.locale }));
  const next = frameJumpFragment(readViewHash(), jump);
  // Assigned so `hashchange` fires (the chapter, page and book syncs).
  if (window.location.hash !== next) window.location.hash = next;
}
