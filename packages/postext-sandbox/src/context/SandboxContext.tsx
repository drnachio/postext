'use client';

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  type ReactNode,
  type Dispatch,
} from 'react';
import type { PostextConfig } from 'postext';
import type { PanelId, ViewportTab, SandboxLabels } from '../types';
import { DEFAULT_LABELS } from '../types';
import { loadConfig, loadMarkdown, loadViewport, loadSidebarPercent, saveConfig, saveMarkdown, saveViewport, saveSidebarPercent } from '../storage/persistence';

export interface SandboxState {
  markdown: string;
  config: PostextConfig;
  activePanel: PanelId | null;
  sidebarPercent: number;
  sidebarDragging: boolean;
  activeViewport: ViewportTab;
  labels: SandboxLabels;
}

export type SandboxAction =
  | { type: 'SET_MARKDOWN'; payload: string }
  | { type: 'SET_CONFIG'; payload: PostextConfig }
  | { type: 'UPDATE_CONFIG'; payload: Partial<PostextConfig> }
  | { type: 'TOGGLE_PANEL'; payload: PanelId }
  | { type: 'SET_SIDEBAR_PERCENT'; payload: number }
  | { type: 'SET_SIDEBAR_DRAGGING'; payload: boolean }
  | { type: 'SET_VIEWPORT'; payload: ViewportTab };

function sandboxReducer(state: SandboxState, action: SandboxAction): SandboxState {
  switch (action.type) {
    case 'SET_MARKDOWN':
      return { ...state, markdown: action.payload };
    case 'SET_CONFIG':
      return { ...state, config: action.payload };
    case 'UPDATE_CONFIG':
      return { ...state, config: { ...state.config, ...action.payload } };
    case 'TOGGLE_PANEL':
      return {
        ...state,
        activePanel: state.activePanel === action.payload ? null : action.payload,
      };
    case 'SET_SIDEBAR_PERCENT':
      return { ...state, sidebarPercent: action.payload };
    case 'SET_SIDEBAR_DRAGGING':
      return { ...state, sidebarDragging: action.payload };
    case 'SET_VIEWPORT':
      return { ...state, activeViewport: action.payload };
    default:
      return state;
  }
}

interface SandboxContextValue {
  state: SandboxState;
  dispatch: Dispatch<SandboxAction>;
}

const SandboxContext = createContext<SandboxContextValue | null>(null);

export function useSandbox(): SandboxContextValue {
  const ctx = useContext(SandboxContext);
  if (!ctx) throw new Error('useSandbox must be used within <SandboxProvider>');
  return ctx;
}

const DEFAULT_CONFIG: PostextConfig = {
  columns: 1,
  gutter: '24px',
  typography: {
    orphans: 2,
    widows: 2,
    hyphenation: true,
    ragOptimization: false,
  },
  references: {
    footnotes: { placement: 'columnBottom', marker: 'number' },
    figureNumbering: true,
    tableNumbering: true,
    marginNotes: false,
  },
  resourcePlacement: {
    defaultStrategy: 'inline',
    deferPlacement: false,
    preserveAspectRatio: true,
  },
  renderer: 'web',
};

const DEFAULT_MARKDOWN = `# Welcome to the Postext Sandbox

This is a live editor where you can experiment with the **Postext** layout engine.

## Getting Started

Write your markdown here and see the results in the viewport on the right. Use the configuration panel to adjust layout settings.

### Features

- **Multi-column layout** with configurable gutters
- **Orphan and widow prevention** for professional typography
- **Hyphenation** and rag optimization
- **Resource placement** strategies (images, tables, figures)
- **Footnotes, endnotes, and margin notes**

> Typography is the craft of endowing human language with a durable visual form.
> — Robert Bringhurst

Here is a paragraph to demonstrate text flow. The layout engine processes your content through seven sequential passes, building a Virtual Document Tree (VDT) that represents every element's exact position on the page. This approach, inspired by how React's Virtual DOM works for UI components, allows interconnected typographic rules to be applied holistically rather than in isolation.

### Code Example

\`\`\`typescript
import { createLayout } from 'postext';

const Article = createLayout(
  { markdown: content },
  { columns: 2, typography: { orphans: 2, widows: 2 } }
);
\`\`\`
`;

interface SandboxProviderProps {
  children: ReactNode;
  initialMarkdown?: string;
  initialConfig?: PostextConfig;
  labels?: Partial<SandboxLabels>;
  onConfigChange?: (config: PostextConfig) => void;
  onMarkdownChange?: (markdown: string) => void;
}

export function SandboxProvider({
  children,
  initialMarkdown,
  initialConfig,
  labels,
  onConfigChange,
  onMarkdownChange,
}: SandboxProviderProps) {
  const mergedLabels: SandboxLabels = { ...DEFAULT_LABELS, ...labels };

  const [state, dispatch] = useReducer(sandboxReducer, {
    markdown: initialMarkdown ?? DEFAULT_MARKDOWN,
    config: initialConfig ?? DEFAULT_CONFIG,
    activePanel: 'markdown' as PanelId,
    sidebarPercent: 25,
    sidebarDragging: false,
    activeViewport: 'canvas' as ViewportTab,
    labels: mergedLabels,
  });

  // Hydrate from localStorage after mount
  useEffect(() => {
    const savedMarkdown = !initialMarkdown ? loadMarkdown() : null;
    const savedConfig = !initialConfig ? loadConfig() : null;
    const savedViewport = loadViewport() as ViewportTab | null;
    const savedPercent = loadSidebarPercent();

    if (savedMarkdown) dispatch({ type: 'SET_MARKDOWN', payload: savedMarkdown });
    if (savedConfig) dispatch({ type: 'SET_CONFIG', payload: savedConfig });
    if (savedViewport) dispatch({ type: 'SET_VIEWPORT', payload: savedViewport });
    if (savedPercent !== null) dispatch({ type: 'SET_SIDEBAR_PERCENT', payload: savedPercent });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save to localStorage (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveMarkdown(state.markdown);
      saveConfig(state.config);
    }, 1000);
    return () => clearTimeout(saveTimerRef.current);
  }, [state.markdown, state.config]);

  // Save viewport tab immediately (no debounce needed)
  useEffect(() => {
    saveViewport(state.activeViewport);
  }, [state.activeViewport]);

  // Save sidebar percent when drag ends
  useEffect(() => {
    if (!state.sidebarDragging) {
      saveSidebarPercent(state.sidebarPercent);
    }
  }, [state.sidebarDragging, state.sidebarPercent]);

  // Notify parent of changes
  useEffect(() => {
    onConfigChange?.(state.config);
  }, [state.config, onConfigChange]);

  useEffect(() => {
    onMarkdownChange?.(state.markdown);
  }, [state.markdown, onMarkdownChange]);

  return (
    <SandboxContext.Provider value={{ state, dispatch }}>
      {children}
    </SandboxContext.Provider>
  );
}
