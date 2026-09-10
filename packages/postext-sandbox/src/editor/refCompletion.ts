import {
  autocompletion,
  closeCompletion,
  CompletionContext,
  completionStatus,
  insertCompletionText,
  type Completion,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { EditorView, keymap } from '@codemirror/view';
import { Prec, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import type { Resource, ResourceKind, ResourceType } from 'postext';

/** What the `@` picker needs from the sandbox: the current resources and the
 *  resource types that name them (figure/table/…) in the document locale.
 *  Read lazily on every keystroke so the editor never has to be
 *  reconfigured when a resource is added, renamed or deleted. */
export interface RefCompletionContext {
  resources: readonly Resource[];
  types: readonly ResourceType[];
}

/** `@` followed by an optional query, ending at the caret. Ids are slugs
 *  (letters, digits, `-`, `_`) but the query also searches captions, so spaces
 *  are allowed after the first character ("@measurement speed"). A bare `@`
 *  followed by a space is a literal at-sign and does not match. */
const TRIGGER_RE = /@[\p{L}\p{N}_-][\p{L}\p{N}_ -]*|@/u;

/** Syntax nodes where an `@` is literal text and must never open the picker. */
const CODE_NODES: ReadonlySet<string> = new Set([
  'FencedCode',
  'CodeBlock',
  'CodeText',
  'InlineCode',
  'Frontmatter',
  'HTMLBlock',
]);

/** Dismissed `@` positions: after Escape the picker stays closed for that
 *  particular `@` so the author can keep a literal at-sign. Positions are
 *  mapped through edits and forgotten once the `@` itself is edited away. */
const dismissRef = StateEffect.define<number>();
const dismissedRefs = StateField.define<readonly number[]>({
  create: () => [],
  update(value, tr) {
    let next = value;
    if (tr.docChanged) {
      const kept: number[] = [];
      for (const pos of value) {
        let removed = false;
        tr.changes.iterChangedRanges((fromA, toA) => {
          if (fromA <= pos && toA >= pos + 1) removed = true;
        });
        if (!removed) kept.push(tr.changes.mapPos(pos, -1));
      }
      next = kept;
    }
    for (const e of tr.effects) {
      if (e.is(dismissRef) && !next.includes(e.value)) next = [...next, e.value];
    }
    return next;
  },
});

interface NodeLike {
  name: string;
  parent: NodeLike | null;
}

function isInsideCode(state: EditorState, pos: number): boolean {
  let node: NodeLike | null = syntaxTree(state).resolveInner(pos, -1);
  while (node) {
    if (CODE_NODES.has(node.name)) return true;
    node = node.parent;
  }
  return false;
}

/** Case- and accent-insensitive haystack normalisation. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Captions may carry inline markdown; strip the marks for the one-line preview. */
function plainCaption(caption: string | undefined): string {
  if (!caption) return '';
  return caption
    .replace(/:ref\{[^}]*\}/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lucide outlines for the three resource kinds (static markup, never user content). */
const KIND_ICON: Record<ResourceKind, string> = {
  bitmap:
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  svg: '<path d="M10 12.5 8 15l2 2.5"/><path d="m14 12.5 2 2.5-2 2.5"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/>',
  table:
    '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
};

function kindIcon(kind: ResourceKind): HTMLElement {
  const span = document.createElement('span');
  span.className = 'cm-refOption-icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${KIND_ICON[kind] ?? KIND_ICON.table}</svg>`;
  return span;
}

interface RefOption extends Completion {
  resource: Resource;
  caption: string;
}

/** The inline reference microformat the engine resolves to a label. */
export function refMicroformat(id: string): string {
  return `:ref{id="${id}" style="full"}`;
}

/** Filter + rank the resources for a query: id prefix, then id substring,
 *  then caption, then type name. Ties keep the Resources panel order. */
export function buildRefOptions(ctx: RefCompletionContext, query: string): RefOption[] {
  const q = fold(query);
  const typeById = new Map(ctx.types.map((t) => [t.id, t] as const));
  const scored: Array<{ option: RefOption; rank: number }> = [];
  ctx.resources.forEach((resource, index) => {
    const type = typeById.get(resource.typeId);
    const caption = plainCaption(resource.caption);
    const id = fold(resource.id);
    let rank: number;
    if (q.length === 0 || id.startsWith(q)) rank = 0;
    else if (id.includes(q)) rank = 1;
    else if (fold(caption).includes(q)) rank = 2;
    else if (type && (fold(type.name).includes(q) || fold(type.shortLabel).includes(q))) rank = 3;
    else return;
    const option: RefOption = {
      label: resource.id,
      detail: type?.name,
      resource,
      caption,
      apply: (view, _completion, from, to) => {
        view.dispatch(insertCompletionText(view.state, refMicroformat(resource.id), from, to));
      },
    };
    scored.push({ option, rank: rank * 10_000 + index });
  });
  scored.sort((a, b) => a.rank - b.rank);
  return scored.map((s) => s.option);
}

function refSource(getContext: () => RefCompletionContext) {
  return (cx: CompletionContext): CompletionResult | null => {
    const match = cx.matchBefore(TRIGGER_RE);
    if (!match) return null;
    // Only a fresh `@` opens the picker: an at-sign glued to a word (e-mails,
    // handles in prose) is left alone.
    const before = match.from > 0 ? cx.state.sliceDoc(match.from - 1, match.from) : '';
    if (before !== '' && /[\p{L}\p{N}]/u.test(before)) return null;
    if (cx.state.field(dismissedRefs).includes(match.from)) return null;
    if (isInsideCode(cx.state, match.from)) return null;
    const options = buildRefOptions(getContext(), match.text.slice(1));
    if (options.length === 0) return null;
    return { from: match.from, to: match.to, options, filter: false };
  };
}

/** Escape while the picker is open: close it and remember this `@` so typing
 *  on does not reopen the list. Falls through when no picker is open so the
 *  default Escape behaviour still applies. */
const dismissOnEscape = keymap.of([
  {
    key: 'Escape',
    run: (view) => {
      if (completionStatus(view.state) === null) return false;
      const head = view.state.selection.main.head;
      const match = new CompletionContext(view.state, head, false).matchBefore(TRIGGER_RE);
      closeCompletion(view);
      if (match) view.dispatch({ effects: dismissRef.of(match.from) });
      return true;
    },
  },
]);

/** Dropdown styling on the sandbox palette. `EditorView.theme` (not
 *  `baseTheme`) so these rules outrank the autocomplete package defaults. */
const refPickerTheme = EditorView.theme({
  '.cm-tooltip.cm-tooltip-autocomplete.cm-refPicker': {
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
    border: '1px solid var(--rule)',
    borderRadius: '6px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
    overflow: 'hidden',
  },
  '.cm-tooltip.cm-tooltip-autocomplete.cm-refPicker > ul': {
    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
    maxHeight: '240px',
    minWidth: '260px',
    maxWidth: '440px',
    padding: '4px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete.cm-refPicker > ul > li': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px 8px',
    borderRadius: '4px',
    fontSize: '12.5px',
    lineHeight: '1.3',
    cursor: 'pointer',
  },
  '.cm-tooltip.cm-tooltip-autocomplete.cm-refPicker > ul > li[aria-selected]': {
    backgroundColor: 'var(--surface)',
    color: 'var(--foreground)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete.cm-refPicker .cm-refOption-icon': {
    display: 'inline-flex',
    flexShrink: '0',
    color: 'var(--slate)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete.cm-refPicker > ul > li[aria-selected] .cm-refOption-icon': {
    color: 'var(--gilt)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete.cm-refPicker .cm-completionLabel': {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '12px',
    flexShrink: '0',
  },
  '.cm-tooltip.cm-tooltip-autocomplete.cm-refPicker .cm-completionDetail': {
    fontStyle: 'normal',
    marginLeft: '0',
    color: 'var(--gilt)',
    fontSize: '11px',
    flexShrink: '0',
  },
  '.cm-tooltip.cm-tooltip-autocomplete.cm-refPicker .cm-refOption-caption': {
    color: 'var(--slate)',
    fontSize: '11.5px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: '0',
    flex: '1 1 auto',
  },
});

/**
 * `@`-mention style resource picker. Typing `@` (at a word boundary, outside
 * code and frontmatter) opens a dropdown of the document's resources; typing
 * on filters by id, caption or type name; Enter/Tab/click replaces the `@…`
 * with the `:ref{id="…"}` microformat. Escape closes the list and keeps the
 * literal `@`.
 */
export function refCompletion(getContext: () => RefCompletionContext): Extension {
  return [
    dismissedRefs,
    Prec.highest(dismissOnEscape),
    autocompletion({
      override: [refSource(getContext)],
      activateOnTyping: true,
      icons: false,
      tooltipClass: () => 'cm-refPicker',
      addToOptions: [
        {
          position: 20,
          render: (completion) => kindIcon((completion as RefOption).resource.kind),
        },
        {
          position: 90,
          render: (completion) => {
            const { caption } = completion as RefOption;
            if (!caption) return null;
            const span = document.createElement('span');
            span.className = 'cm-refOption-caption';
            span.textContent = caption;
            span.title = caption;
            return span;
          },
        },
      ],
    }),
    refPickerTheme,
  ];
}
