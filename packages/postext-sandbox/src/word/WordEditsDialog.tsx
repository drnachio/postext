'use client';

// The review of an edited Word export (#1397): the changes found in the
// file, chapter by chapter (going in, in conflict with what changed in the
// book since, or not importable, with why), the comments left in Word, and
// one Apply that writes them as one change Cmd/Ctrl+Z takes back.

import { type ReactNode, type RefObject, useId, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { AlertTriangle, CheckCircle2, ChevronRight, MessageSquare, XCircle, X } from 'lucide-react';
import type { DocxComment, DocxEdit } from 'postext/word';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector, useSandboxStore } from '../context/SandboxContext.js';
import type { SandboxLabels } from '../types/index.js';
import { Button, Collapsible, IconButton, announce, usePortalContainer } from '../ui/index.js';
import { POPUP_SURFACE, POPUP_Z_INDEX } from '../ui/layout/surface.js';
import { counted } from './sandboxImport.js';
import { isolate } from './WordImportDialog.js';
import { editFieldText, editReasonText, editSnippet, reviewChanges, reviewWordEdits, writeWordEdits, type WordEditGroup, type WordEditsReview } from './wordEdits.js';

/** An exported .docx picked in the Manuscript panel. */
export interface WordEditsFile {
  name: string;
  bytes: Uint8Array;
}

export function WordEditsDialog({ file, onClose }: { file: WordEditsFile | null; onClose: () => void }) {
  return (
    <Dialog.Root open={file !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      {file && <WordEditsPopup file={file} onClose={onClose} />}
    </Dialog.Root>
  );
}

/** The icons' colours; the words stay in the text colour, which keeps its
 *  contrast on every theme. */
const STATUS_COLOR: Record<DocxEdit['status'], string> = {
  applied: 'var(--pt-success, #16a34a)',
  conflict: 'var(--pt-warning, #d97706)',
  rejected: 'var(--pt-error, #ef4444)',
};

function StatusIcon({ status }: { status: DocxEdit['status'] }) {
  const style = { color: STATUS_COLOR[status] };
  if (status === 'applied') return <CheckCircle2 size={13} aria-hidden="true" className="mt-0.5 shrink-0" style={style} />;
  if (status === 'conflict') return <AlertTriangle size={13} aria-hidden="true" className="mt-0.5 shrink-0" style={style} />;
  return <XCircle size={13} aria-hidden="true" className="mt-0.5 shrink-0" style={style} />;
}

/** An edit as one line: what was there and what Word has instead. */
export function editChangeText(labels: SandboxLabels, e: Pick<DocxEdit, 'before' | 'after'>): string {
  const before = isolate(`“${editSnippet(e.before)}”`);
  const after = isolate(`“${editSnippet(e.after)}”`);
  if (e.before && e.after) return labels.wordEditChange.replace('__before__', before).replace('__after__', after);
  if (e.after) return labels.wordEditAdded.replace('__text__', after);
  return labels.wordEditRemoved.replace('__text__', before);
}

function EditRow({ edit, labels }: { edit: DocxEdit; labels: SandboxLabels }) {
  const status = edit.status === 'applied' ? labels.wordEditStatusApplied : edit.status === 'conflict' ? labels.wordEditStatusConflict : labels.wordEditStatusRejected;
  const reason = edit.status === 'applied' ? null : editReasonText(labels, edit.reason);
  const field = editFieldText(labels, edit.field);
  return (
    <li className="flex items-start gap-2 border-b border-(--pt-control-border) py-1.5 text-xs last:border-b-0">
      <StatusIcon status={edit.status} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span>
          <span className="font-semibold">{status}</span>
          {field && <span className="text-(--slate)"> · {field}</span>}
        </span>
        {(edit.before || edit.after) && <span style={{ overflowWrap: 'anywhere' }}>{editChangeText(labels, edit)}</span>}
        {reason && <span className="text-(--slate)">{reason}</span>}
      </span>
    </li>
  );
}

function CommentRow({ comment, labels }: { comment: DocxComment; labels: SandboxLabels }) {
  return (
    <li className="flex items-start gap-2 py-1 text-xs">
      <MessageSquare size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-(--slate)" />
      <span className="min-w-0" style={{ overflowWrap: 'anywhere' }}>
        <span className="font-semibold">{comment.author ? isolate(comment.author) : labels.wordEditCommentUnsigned}</span>
        {': '}
        {isolate(comment.text)}
      </span>
    </li>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="border-t border-(--pt-control-border)">
      <Collapsible.Trigger className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-0 py-2 text-start text-[13px] font-semibold text-(--foreground) outline-(--brand) focus-visible:outline-2" style={{ minHeight: 44 }}>
        <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-(--slate) rtl:-scale-x-100" style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 200ms ease' }} />
        <span className="min-w-0" style={{ overflowWrap: 'anywhere' }}>{title}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel data-postext-collapsible="">
        <div className="flex flex-col gap-1 pb-3">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

/** A group's heading: the chapter, the resource, or the generated text. */
export function groupTitle(labels: SandboxLabels, g: WordEditGroup, chapters: readonly { id: string; title: string }[]): string {
  if (g.kind === 'chapter') {
    const index = chapters.findIndex((c) => c.id === g.chapterId);
    if (index < 0) return labels.wordEditsChapterGone;
    return labels.wordEditsChapter.replace('__n__', String(index + 1)).replace('__title__', isolate(chapters[index]!.title));
  }
  if (g.kind === 'resource') return labels.wordEditsResource.replace('__resource__', isolate(g.resourceId ?? ''));
  if (g.kind === 'comments') return counted(labels, 'wordEditsComments', g.comments.length);
  return labels.wordEditsGenerated;
}

function WordEditsPopup({ file, onClose }: { file: WordEditsFile; onClose: () => void }) {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const store = useSandboxStore();
  const chapters = useSandboxSelector((s) => s.chapters);
  const container = usePortalContainer();
  const titleId = useId();
  const applyRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Read once against the book as it stood when the file was picked.
  const review = useMemo((): WordEditsReview | { error: true } => {
    try {
      return reviewWordEdits(file.bytes, store.getSnapshot());
    } catch (err) {
      console.error(err);
      return { error: true };
    }
  }, [file, store]);

  if ('error' in review) {
    return (
      <Shell titleId={titleId} container={container} initialFocus={cancelRef} labels={labels} onClose={onClose}>
        <p role="alert" className="m-0 text-xs">{labels.wordEditsFailed.replace('__file__', isolate(file.name))}</p>
        <div className="flex justify-end">
          <Button ref={cancelRef} variant="primary" size="sm" onClick={onClose}>{labels.wordExportClose}</Button>
        </div>
      </Shell>
    );
  }

  const changes = reviewChanges(review);
  const apply = () => {
    const s = store.getSnapshot();
    let written: ReturnType<typeof writeWordEdits>;
    try {
      // Read again against the book as it is now: a change made while the
      // dialog was open is merged, not overwritten.
      written = writeWordEdits(dispatch, store.history, s, reviewWordEdits(file.bytes, s));
    } catch (err) {
      console.error(err);
      announce(labels.wordEditsFailed.replace('__file__', isolate(file.name)));
      onClose();
      return;
    }
    announce(written.chapters.length + written.resources.length > 0
      ? labels.wordEditsDone.replace('__file__', isolate(file.name))
      : labels.wordEditsNone);
    onClose();
  };
  const { counts } = review;
  const total = counts.applied + counts.conflict + counts.rejected;

  return (
    <Shell titleId={titleId} container={container} initialFocus={changes ? applyRef : cancelRef} labels={labels} onClose={onClose}>
      <Dialog.Description className="text-xs text-(--slate)" style={{ margin: 0 }}>
        {labels.wordEditsIntro.replace('__file__', isolate(file.name))}
      </Dialog.Description>
      {review.lost && (
        <p role="alert" className="m-0 flex items-start gap-2 text-xs">
          <XCircle size={13} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: STATUS_COLOR.rejected }} />
          <span>{labels.wordEditReasonBookmarksLost}</span>
        </p>
      )}
      {total === 0 && review.result.comments.length === 0 ? (
        <p className="m-0 text-xs">{labels.wordEditsNone}</p>
      ) : (
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
          <li className="flex items-start gap-1"><StatusIcon status="applied" />{counted(labels, 'wordEditsApplied', counts.applied)}</li>
          {counts.conflict > 0 && <li className="flex items-start gap-1"><StatusIcon status="conflict" />{counted(labels, 'wordEditsConflicts', counts.conflict)}</li>}
          {counts.rejected > 0 && <li className="flex items-start gap-1"><StatusIcon status="rejected" />{counted(labels, 'wordEditsRejected', counts.rejected)}</li>}
          {review.result.comments.length > 0 && <li className="text-(--slate)">{counted(labels, 'wordEditsComments', review.result.comments.length)}</li>}
        </ul>
      )}
      <div className="flex flex-col">
        {review.groups.map((g) => (
          <Group key={g.key} title={groupTitle(labels, g, chapters)}>
            {g.edits.length > 0 && (
              <ul className="m-0 flex list-none flex-col p-0">
                {g.edits.map((e, i) => <EditRow key={i} edit={e} labels={labels} />)}
              </ul>
            )}
            {g.comments.length > 0 && (
              <ul className="m-0 flex list-none flex-col p-0" aria-label={counted(labels, 'wordEditsComments', g.comments.length)}>
                {g.comments.map((c, i) => <CommentRow key={i} comment={c} labels={labels} />)}
              </ul>
            )}
          </Group>
        ))}
      </div>
      {changes && <p className="m-0 text-xs text-(--slate)">{labels.wordEditsUndoHint}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button ref={cancelRef} variant="outline" size="sm" onClick={onClose}>{labels.wordCancel}</Button>
        <Button ref={applyRef} variant="primary" size="sm" onClick={apply} disabled={!changes}>{labels.wordEditsApply}</Button>
      </div>
    </Shell>
  );
}

function Shell({ titleId, container, initialFocus, labels, onClose, children }: {
  titleId: string;
  container: ReturnType<typeof usePortalContainer>;
  initialFocus: RefObject<HTMLButtonElement | null>;
  labels: SandboxLabels;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Portal container={container}>
      <Dialog.Backdrop className="fixed inset-0" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
      <Dialog.Popup
        data-postext-popup=""
        data-testid="word-edits-dialog"
        aria-labelledby={titleId}
        initialFocus={initialFocus}
        className="fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-16px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto"
        style={{ ...POPUP_SURFACE, zIndex: POPUP_Z_INDEX, width: 'min(640px, calc(100vw - 16px))', padding: 16, fontSize: 13, lineHeight: '19px' }}
      >
        <div className="flex items-start justify-between gap-2">
          <Dialog.Title id={titleId} style={{ fontSize: 15, lineHeight: '20px', fontWeight: 600, margin: '10px 0 0' }}>
            {labels.wordEditsTitle}
          </Dialog.Title>
          <IconButton label={labels.wordCancel} icon={<X size={14} aria-hidden="true" />} onClick={onClose} />
        </div>
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
