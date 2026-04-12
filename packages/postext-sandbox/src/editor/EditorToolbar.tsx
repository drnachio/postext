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
} from 'lucide-react';
import type { EditorView } from '@codemirror/view';
import type { ReactNode } from 'react';
import { useSandbox } from '../context/SandboxContext';
import type { ToolbarAction } from '../types';
import { Tooltip } from '../panels/Tooltip';

interface EditorToolbarProps {
  viewRef: React.RefObject<EditorView | null>;
  extraActions?: ToolbarAction[];
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
  return (
    <Tooltip content={label} side="bottom">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
        style={{ color: 'var(--slate)', outlineColor: 'var(--accent-blue)', width: 24, height: 24 }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--foreground)';
          e.currentTarget.style.backgroundColor = 'var(--surface)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--slate)';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        {icon}
      </button>
    </Tooltip>
  );
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

export function EditorToolbar({ viewRef, extraActions }: EditorToolbarProps) {
  const { state } = useSandbox();
  const { labels } = state;

  const getView = () => viewRef.current;

  const actions: { icon: ReactNode; label: string; action: () => void; separator?: boolean }[] = [
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
    },
  ];

  return (
    <div
      className="flex flex-nowrap items-center gap-0.5 overflow-x-auto border-b px-2 py-0.5"
      style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--background)' }}
      role="toolbar"
      aria-label="Markdown formatting"
    >
      {actions.map((a, i) => (
        <span key={i} className="contents">
          <ToolbarButton icon={a.icon} label={a.label} onClick={a.action} />
          {a.separator && (
            <div className="mx-1.5 h-5 w-px shrink-0" style={{ backgroundColor: 'var(--rule)' }} aria-hidden="true" />
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
