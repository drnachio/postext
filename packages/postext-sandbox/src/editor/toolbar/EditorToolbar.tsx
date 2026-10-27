'use client';

import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  Link,
  Code,
  Quote,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  SeparatorHorizontal,
  UnfoldVertical,
  Columns2,
  Hash,
  Tag,
  ALargeSmall,
  Languages,
  ArrowLeftRight,
  LayoutTemplate,
  Shapes,
  Palette,
} from 'lucide-react';
import { isCjkLanguage } from 'postext';
import type { EditorView } from '@codemirror/view';
import { useRef, useState, type ReactNode } from 'react';
import { useSandbox } from '../../context/SandboxContext.js';
import { useHistoryAvailability, useHistoryCommands } from '../../history/HistoryButtons.js';
import { IconButton } from '../../ui/index.js';
import { composedPageInsertion } from './composedInsert.js';
import { TemplatePicker } from './TemplatePicker.js';
import { IconPicker } from './IconPicker.js';
import { LookPicker } from './LookPicker.js';
import { framePieceAt, frameLookChange, type FramePiece } from '../../templates/frameLooks.js';

/** Write `text` over the selection and put the caret after it (#1064: a
 *  label's symbol). */
export function insertAtCaret(view: EditorView, text: string) {
  const { from, to } = view.state.selection.main;
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
  view.focus();
}

interface EditorToolbarProps {
  viewRef: React.RefObject<EditorView | null>;
  /** The document language: a Chinese or Japanese one adds the ruby and
   *  tate-chū-yoko buttons. */
  lang?: string;
  /** Design mode (#864): the text is read only, so nothing here edits it. */
  readOnly?: boolean;
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return <IconButton label={label} icon={icon} onClick={onClick} tooltipSide="bottom" disabled={disabled} />;
}

function wrapSelection(view: EditorView, before: string, after: string) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  view.dispatch({
    changes: { from, to, insert: `${before}${selected}${after}` },
    selection: { anchor: from + before.length, head: to + before.length },
  });
  view.focus();
}

function insertLinePrefix(view: EditorView, prefix: string) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  view.dispatch({
    changes: { from: line.from, to: line.from, insert: prefix },
  });
  view.focus();
}

/** The selection (`selected`, at `from`) as a ruby base, `:ruby[漢字]{rt=""}`
 *  (group ruby), and where the caret goes: between the quotes for the
 *  reading, or in the brackets for the base when nothing is selected. */
export function rubyWrap(selected: string, from: number): { insert: string; caret: number } {
  const open = ':ruby[';
  const insert = `${open}${selected}]{rt=""}`;
  return { insert, caret: selected ? from + insert.length - 2 : from + open.length };
}

function wrapRuby(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const { insert, caret } = rubyWrap(view.state.sliceDoc(from, to), from);
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: caret } });
  view.focus();
}

/** Insert a standalone block line (e.g. a directive). If the current line
 *  is non-empty, the directive is appended after it with a blank line on
 *  each side; if empty, it replaces the current line. The final cursor
 *  position is placed at `cursorOffset` characters into the inserted
 *  `text` — useful for dropping the caret inside the attribute braces. */
function insertBlockLine(view: EditorView, text: string, cursorOffset?: number) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const lineIsEmpty = line.text.trim() === '';
  const insertAt = lineIsEmpty ? line.from : line.to;
  const leading = lineIsEmpty ? '' : '\n\n';
  const trailing = '\n\n';
  const insert = `${leading}${text}${trailing}`;
  const finalCaret =
    insertAt + leading.length + (cursorOffset ?? text.length);
  view.dispatch({
    changes: { from: insertAt, to: lineIsEmpty ? line.to : insertAt, insert },
    selection: { anchor: finalCaret },
  });
  view.focus();
}

/** Insert a block (a composed page, #864) as {@link insertBlockLine} does,
 *  leaving the selection at `[anchor, head)` of `text`. */
export function insertBlockSelecting(view: EditorView, text: string, anchor: number, head: number) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const lineIsEmpty = line.text.trim() === '';
  const insertAt = lineIsEmpty ? line.from : line.to;
  const leading = lineIsEmpty ? '' : '\n\n';
  const insert = `${leading}${text}\n\n`;
  const base = insertAt + leading.length;
  view.dispatch({
    changes: { from: insertAt, to: lineIsEmpty ? line.to : insertAt, insert },
    selection: { anchor: base + anchor, head: base + head },
    scrollIntoView: true,
  });
  view.focus();
}

export function EditorToolbar({ viewRef, lang, readOnly = false }: EditorToolbarProps) {
  const { state } = useSandbox();
  const { labels } = state;
  const composedRef = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const iconRef = useRef<HTMLButtonElement>(null);
  const [iconOpen, setIconOpen] = useState(false);
  const lookRef = useRef<HTMLButtonElement>(null);
  // The look picker (#1089) and the :::frame piece the caret was in when it
  // opened.
  const [lookPiece, setLookPiece] = useState<FramePiece | null | undefined>(undefined);
  const openLookPicker = () => {
    const v = getView();
    if (!v) return;
    if (lookPiece !== undefined) {
      setLookPiece(undefined);
      return;
    }
    setLookPiece(framePieceAt(v.state.doc.toString(), v.state.selection.main.head));
  };

  const getView = () => viewRef.current;

  // Undo and redo run the Sandbox's one history (#899): also in Design
  // mode, where the rest of the toolbar is off.
  const history = useHistoryCommands();
  const { canUndo, canRedo } = useHistoryAvailability();
  const actions: { icon: ReactNode; label: string; action: () => void; separator?: boolean; enabled?: boolean }[] = [
    {
      icon: <Undo2 size={16} aria-hidden="true" />,
      label: labels.undo,
      action: () => { history.undo(); getView()?.focus(); },
      enabled: canUndo,
    },
    {
      icon: <Redo2 size={16} aria-hidden="true" />,
      label: labels.redo,
      action: () => { history.redo(); getView()?.focus(); },
      separator: true,
      enabled: canRedo,
    },
    {
      icon: <Bold size={16} aria-hidden="true" />,
      label: labels.bold,
      action: () => { const v = getView(); if (v) wrapSelection(v, '**', '**'); },
    },
    {
      icon: <Italic size={16} aria-hidden="true" />,
      label: labels.italic,
      action: () => { const v = getView(); if (v) wrapSelection(v, '_', '_'); },
    },
    {
      icon: <Heading1 size={16} aria-hidden="true" />,
      label: `${labels.heading} 1`,
      action: () => { const v = getView(); if (v) insertLinePrefix(v, '# '); },
    },
    {
      icon: <Heading2 size={16} aria-hidden="true" />,
      label: `${labels.heading} 2`,
      action: () => { const v = getView(); if (v) insertLinePrefix(v, '## '); },
    },
    {
      icon: <Heading3 size={16} aria-hidden="true" />,
      label: `${labels.heading} 3`,
      action: () => { const v = getView(); if (v) insertLinePrefix(v, '### '); },
      separator: true,
    },
    {
      icon: <Link size={16} aria-hidden="true" />,
      label: labels.link,
      action: () => { const v = getView(); if (v) wrapSelection(v, '[', '](url)'); },
    },
    {
      icon: <Code size={16} aria-hidden="true" />,
      label: labels.code,
      action: () => { const v = getView(); if (v) wrapSelection(v, '`', '`'); },
    },
    {
      icon: <Tag size={16} aria-hidden="true" />,
      label: labels.chipInline,
      action: () => { const v = getView(); if (v) wrapSelection(v, ':chip[', ']'); },
    },
    {
      icon: <ALargeSmall size={16} aria-hidden="true" />,
      label: labels.smallCapsInline,
      action: () => { const v = getView(); if (v) wrapSelection(v, ':smallcaps[', ']'); },
    },
    // Readings (furigana, pinyin) and a run set across a vertical line,
    // for a Chinese or Japanese book.
    ...(isCjkLanguage(lang) ? [
      {
        icon: <Languages size={16} aria-hidden="true" />,
        label: labels.rubyInline,
        action: () => { const v = getView(); if (v) wrapRuby(v); },
      },
      {
        icon: <ArrowLeftRight size={16} aria-hidden="true" />,
        label: labels.tcyInline,
        action: () => { const v = getView(); if (v) wrapSelection(v, ':tcy[', ']'); },
      },
    ] : []),
    {
      icon: <Quote size={16} aria-hidden="true" />,
      label: labels.blockquote,
      action: () => { const v = getView(); if (v) insertLinePrefix(v, '> '); },
      separator: true,
    },
    {
      icon: <ListOrdered size={16} aria-hidden="true" />,
      label: labels.orderedList,
      action: () => { const v = getView(); if (v) insertLinePrefix(v, '1. '); },
    },
    {
      icon: <List size={16} aria-hidden="true" />,
      label: labels.unorderedList,
      action: () => { const v = getView(); if (v) insertLinePrefix(v, '- '); },
      separator: true,
    },
    {
      icon: <SeparatorHorizontal size={16} aria-hidden="true" />,
      label: labels.pagebreakDirective,
      action: () => { const v = getView(); if (v) insertBlockLine(v, ':::pagebreak'); },
    },
    {
      icon: <UnfoldVertical size={16} aria-hidden="true" />,
      label: labels.spaceDirective,
      action: () => { const v = getView(); if (v) insertBlockLine(v, ':::space'); },
    },
    {
      icon: <Columns2 size={16} aria-hidden="true" />,
      label: labels.columnsDirective,
      action: () => {
        const v = getView();
        if (!v) return;
        // A group of two sub-columns, the caret on its empty first line.
        const text = ':::columns{count=2}\n\n:::';
        insertBlockLine(v, text, ':::columns{count=2}\n'.length);
      },
    },
    {
      icon: <Hash size={16} aria-hidden="true" />,
      label: labels.numberingDirective,
      action: () => {
        const v = getView();
        if (!v) return;
        // Drop the caret between the braces so the user can tweak attributes.
        const text = ':::numbering{format="decimal" startAt=1}';
        insertBlockLine(v, text, text.length);
      },
    },
  ];

  return (
    <div
      // Wraps rather than scrolls: every 44px button stays in view.
      className="flex flex-wrap items-center border-b px-1"
      style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--background)' }}
      role="toolbar"
      aria-label={labels.editorFormatting}
    >
      {actions.map((a, i) => (
        <span key={i} className="contents">
          <ToolbarButton icon={a.icon} label={a.label} onClick={a.action} disabled={a.enabled === undefined ? readOnly : !a.enabled} />
          {a.separator && (
            <div className="mx-1 h-5 w-px shrink-0" style={{ backgroundColor: 'var(--rule)' }} aria-hidden="true" />
          )}
        </span>
      ))}

      {/* A composed page from one of the book's templates (#864). */}
      <IconButton
        ref={composedRef}
        label={labels.composedPageInsert}
        icon={<LayoutTemplate size={16} aria-hidden="true" />}
        tooltipSide="bottom"
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        onClick={() => setPickerOpen((o) => !o)}
        disabled={readOnly}
        data-action="composed-page"
      />
      {/* A symbol for a label or a map's key (#1064, `:icon`). */}
      <IconButton
        ref={iconRef}
        label={labels.iconPickerOpen}
        icon={<Shapes size={16} aria-hidden="true" />}
        tooltipSide="bottom"
        aria-haspopup="dialog"
        aria-expanded={iconOpen}
        onClick={() => setIconOpen((o) => !o)}
        disabled={readOnly}
        data-action="label-icon"
      />
      {/* A named look for the :::frame piece the caret is in (#1089). */}
      <IconButton
        ref={lookRef}
        label={labels.frameLookPickerOpen}
        icon={<Palette size={16} aria-hidden="true" />}
        tooltipSide="bottom"
        aria-haspopup="dialog"
        aria-expanded={lookPiece !== undefined}
        onClick={openLookPicker}
        disabled={readOnly}
        data-action="frame-look"
      />
      <LookPicker
        open={lookPiece !== undefined && !readOnly}
        onOpenChange={(o) => { if (!o) setLookPiece(undefined); }}
        anchor={lookRef}
        looks={state.config.frameLooks ?? []}
        piece={lookPiece ?? null}
        labels={labels}
        onPick={(id) => {
          const v = getView();
          if (!v || !lookPiece) return;
          // Read again: the text may have moved since the picker opened.
          const piece = framePieceAt(v.state.doc.toString(), v.state.selection.main.head) ?? lookPiece;
          const change = frameLookChange(v.state.doc.toString(), piece, id);
          if (change) v.dispatch({ changes: change });
          v.focus();
        }}
      />
      <IconPicker
        open={iconOpen && !readOnly}
        onOpenChange={setIconOpen}
        anchor={iconRef}
        labels={labels}
        resources={state.resources ?? []}
        onInsert={(directive) => {
          const v = getView();
          if (v) insertAtCaret(v, directive);
        }}
      />
      <TemplatePicker
        open={pickerOpen && !readOnly}
        onOpenChange={setPickerOpen}
        anchor={composedRef}
        config={state.config}
        labels={labels}
        onPick={(template) => {
          const v = getView();
          if (!v) return;
          const ins = composedPageInsertion(template);
          insertBlockSelecting(v, ins.text, ins.anchor, ins.head);
        }}
      />
    </div>
  );
}
