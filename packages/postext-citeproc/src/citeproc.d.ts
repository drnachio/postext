declare module 'citeproc' {
  const CSL: {
    Engine: new (sys: unknown, style: string, lang?: string, forceLang?: boolean) => CiteprocEngine;
  };
  export interface CiteprocEngine {
    opt: { class: string; development_extensions: Record<string, unknown> };
    registry: { registry: Record<string, { id: string; seq: number }> };
    rebuildProcessorState(citations: unknown[], mode?: string, uncited?: unknown[]): [string, number, string][];
    updateUncitedItems(ids: string[]): void;
    makeBibliography(selection?: unknown): [BibMeta, string[]] | false;
    getTerm(term: string, form?: string, plural?: boolean): string;
    setOutputFormat(format: string): void;
  }
  export interface BibMeta {
    entry_ids: string[][];
    hangingindent?: boolean | number;
    'second-field-align'?: string | false;
    entryspacing?: number;
    linespacing?: number;
    maxoffset?: number;
  }
  export default CSL;
}
