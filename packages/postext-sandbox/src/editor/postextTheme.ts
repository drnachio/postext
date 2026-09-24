import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const darkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--surface)',
      color: 'var(--foreground)',
      height: '100%',
    },
    '.cm-content': {
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: '13px',
      lineHeight: '1.6',
      caretColor: 'var(--brand)',
      padding: '8px 0',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--brand)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(216, 162, 26, 0.2)',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(244, 241, 234, 0.035)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--background)',
      color: 'var(--slate)',
      border: 'none',
      borderRight: '1px solid var(--rule)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      color: 'var(--foreground)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      fontSize: '11px',
      padding: '0 8px 0 4px',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
  },
  { dark: true },
);

const darkHighlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--brand)', fontWeight: 'bold' },
  { tag: tags.emphasis, color: 'var(--foreground)', fontStyle: 'italic' },
  { tag: tags.strong, color: 'var(--foreground)', fontWeight: 'bold' },
  { tag: tags.link, color: 'var(--accent-blue)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--accent-blue)' },
  { tag: tags.monospace, color: 'var(--brand)' },
  { tag: tags.quote, color: 'var(--slate)', fontStyle: 'italic' },
  { tag: tags.meta, color: 'var(--slate)' },
  { tag: tags.comment, color: 'var(--slate)', fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: 'var(--brand)' },
]);

const lightTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--surface)',
      color: 'var(--foreground)',
      height: '100%',
    },
    '.cm-content': {
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: '13px',
      lineHeight: '1.6',
      caretColor: 'var(--brand)',
      padding: '8px 0',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--brand)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(43, 74, 203, 0.14)',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(0, 0, 0, 0.03)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--background)',
      color: 'var(--slate)',
      border: 'none',
      borderRight: '1px solid var(--rule)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(0, 0, 0, 0.05)',
      color: 'var(--foreground)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      fontSize: '11px',
      padding: '0 8px 0 4px',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
  },
  { dark: false },
);

const lightHighlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--brand)', fontWeight: 'bold' },
  { tag: tags.emphasis, color: 'var(--foreground)', fontStyle: 'italic' },
  { tag: tags.strong, color: 'var(--foreground)', fontWeight: 'bold' },
  { tag: tags.link, color: 'var(--accent-blue)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--accent-blue)' },
  { tag: tags.monospace, color: 'var(--brand)' },
  { tag: tags.quote, color: 'var(--slate)', fontStyle: 'italic' },
  { tag: tags.meta, color: 'var(--slate)' },
  { tag: tags.comment, color: 'var(--slate)', fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: 'var(--brand)' },
]);

export function getEditorTheme(isDark: boolean) {
  return isDark
    ? [darkTheme, syntaxHighlighting(darkHighlight)]
    : [lightTheme, syntaxHighlighting(lightHighlight)];
}
