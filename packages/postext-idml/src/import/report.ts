// The quality report: every difference between the document and the book
// is a finding with a count, never a silent drop.

import type { FindingSeverity, ImportFinding, ImportReport, StyleMapping } from './types.js';

const RANK: Record<FindingSeverity, number> = { loss: 0, warning: 1, info: 2 };

export class Reporter {
  private readonly byId = new Map<string, ImportFinding>();
  readonly styles: StyleMapping[] = [];

  /** Count one more case of a finding. The message of an id is the first
   *  one given; `example` names a place (a style, a story's first words). */
  add(id: string, severity: FindingSeverity, message: string, example?: string, count = 1): void {
    let f = this.byId.get(id);
    if (!f) this.byId.set(id, (f = { id, severity, message, count: 0, examples: [] }));
    f.count += count;
    if (RANK[severity] < RANK[f.severity]) f.severity = severity;
    const e = example?.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (e && f.examples.length < 5 && !f.examples.includes(e)) f.examples.push(e);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  findings(): ImportFinding[] {
    return [...this.byId.values()].sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.id.localeCompare(b.id));
  }

  build(counts: Omit<ImportReport['counts'], 'info' | 'warnings' | 'losses'>): ImportReport {
    const findings = this.findings();
    const n = (s: FindingSeverity): number => findings.filter((f) => f.severity === s).length;
    const losses = n('loss');
    const warnings = n('warning');
    return {
      findings,
      verdict: losses ? 'lossy' : warnings ? 'approximate' : 'faithful',
      styles: this.styles,
      counts: { ...counts, info: n('info'), warnings, losses },
    };
  }
}
