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
  Hash,
  Tag,
  ALargeSmall,
  Languages,
  ArrowLeftRight,
} from 'lucide-react';
import { isCjkLanguage } from 'postext';
import type { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import type { ReactNode } from 'react';
import { useSandbox } from '../context/SandboxContext';
import type { ToolbarAction } from '../types';
import { IconButton } from '../ui';

interface EditorToolbarProps {
  viewRef: React.RefObject<EditorView | null>;
  extraActions?: ToolbarAction[];
  /** The document language: a Chinese or Japanese one adds the ruby and
   *  tate-chū-yoko buttons. */
  lang?: string;
}

function ToolbarButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return <IconButton label={label} icon={icon} onClick={onClick} tooltipSide="bottom" />;
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

function insertAtCursor(view: EditorView, text: string) {
  const { from } = view.state.selection.main;
  view.dispatch({
    changes: { from, to: from, insert: text },
    selection: { anchor: from + text.length },
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

export function EditorToolbar({ viewRef, extraActions, lang }: EditorToolbarProps) {
  const { state } = useSandbox();
  const { labels } = state;

  const getView = () => viewRef.current;

  const actions: { icon: ReactNode; label: string; action: () => void; separator?: boolean }[] = [
    {
      icon: <Undo2 size={16} aria-hidden="true" />,
      label: labels.undo,
      action: () => { const v = getView(); if (v) { undo(v); v.focus(); } },
    },
    {
      icon: <Redo2 size={16} aria-hidden="true" />,
      label: labels.redo,
      action: () => { const v = getView(); if (v) { redo(v); v.focus(); } },
      separator: true,
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
          <ToolbarButton icon={a.icon} label={a.label} onClick={a.action} />
          {a.separator && (
            <div className="mx-1 h-5 w-px shrink-0" style={{ backgroundColor: 'var(--rule)' }} aria-hidden="true" />
          )}
        </span>
      ))}

      {extraActions?.map((a) => (
        <ToolbarButton
          key={a.id}
          icon={a.icon}
          label={a.label}
          onClick={() =>
            a.action({
              insert: (text) => { const v = getView(); if (v) insertAtCursor(v, text); },
              wrapSelection: (before, after) => { const v = getView(); if (v) wrapSelection(v, before, after); },
            })
          }
        />
      ))}
    </div>
  );
}
