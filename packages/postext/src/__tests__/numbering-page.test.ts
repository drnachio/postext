import { describe, it, expect } from 'vitest';
import { buildPageLabels, collectPageLabelRuns } from '../numbering';

describe('buildPageLabels', () => {
  it('single decimal segment', () => {
    const labels = buildPageLabels(3, [
      { startPageIndex: 0, format: 'decimal', startAt: 1 },
    ]);
    expect(labels.map((l) => l.label)).toEqual(['1', '2', '3']);
    expect(labels.every((l) => l.format === 'decimal')).toBe(true);
    expect(labels[0]!.value).toBe(1);
    expect(labels[2]!.value).toBe(3);
  });

  it('roman front matter then decimal chapters from 1', () => {
    const labels = buildPageLabels(6, [
      { startPageIndex: 0, format: 'lower-roman', startAt: 1 },
      { startPageIndex: 4, format: 'decimal', startAt: 1 },
    ]);
    expect(labels.map((l) => l.label)).toEqual(['i', 'ii', 'iii', 'iv', '1', '2']);
    expect(labels[3]!.format).toBe('lower-roman');
    expect(labels[4]!.format).toBe('decimal');
  });

  it('format-only switch continues the counter', () => {
    const labels = buildPageLabels(4, [
      { startPageIndex: 0, format: 'decimal', startAt: 1 },
      { startPageIndex: 2, format: 'upper-roman' },
    ]);
    // Counter carries over: 1, 2, then III, IV.
    expect(labels.map((l) => l.label)).toEqual(['1', '2', 'III', 'IV']);
  });

  it('startAt-only switch resets value but keeps format', () => {
    const labels = buildPageLabels(4, [
      { startPageIndex: 0, format: 'decimal', startAt: 1 },
      { startPageIndex: 2, startAt: 17 },
    ]);
    expect(labels.map((l) => l.label)).toEqual(['1', '2', '17', '18']);
  });

  it('alpha overflow past Z uses bijective labels', () => {
    const labels = buildPageLabels(28, [
      { startPageIndex: 0, format: 'upper-alpha', startAt: 1 },
    ]);
    expect(labels[0]!.label).toBe('A');
    expect(labels[25]!.label).toBe('Z');
    expect(labels[26]!.label).toBe('AA');
    expect(labels[27]!.label).toBe('AB');
  });

  it('empty document returns empty array', () => {
    expect(buildPageLabels(0, [])).toEqual([]);
  });

  it('falls back to decimal from 1 when no segment given', () => {
    const labels = buildPageLabels(3, []);
    expect(labels.map((l) => l.label)).toEqual(['1', '2', '3']);
  });
});

describe('collectPageLabelRuns', () => {
  it('groups contiguous decimal pages into one run', () => {
    const labels = buildPageLabels(4, [
      { startPageIndex: 0, format: 'decimal', startAt: 1 },
    ]);
    const runs = collectPageLabelRuns(labels);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.startPageIndex).toBe(0);
    expect(runs[0]!.endPageIndex).toBe(3);
    expect(runs[0]!.startAt).toBe(1);
    expect(runs[0]!.maxValue).toBe(4);
  });

  it('splits runs on format change', () => {
    const labels = buildPageLabels(6, [
      { startPageIndex: 0, format: 'lower-roman', startAt: 1 },
      { startPageIndex: 4, format: 'decimal', startAt: 1 },
    ]);
    const runs = collectPageLabelRuns(labels);
    expect(runs).toHaveLength(2);
    expect(runs[0]!.format).toBe('lower-roman');
    expect(runs[0]!.endPageIndex).toBe(3);
    expect(runs[1]!.format).toBe('decimal');
    expect(runs[1]!.startAt).toBe(1);
  });

  it('splits runs on counter reset', () => {
    const labels = buildPageLabels(4, [
      { startPageIndex: 0, format: 'decimal', startAt: 1 },
      { startPageIndex: 2, startAt: 17 },
    ]);
    const runs = collectPageLabelRuns(labels);
    expect(runs).toHaveLength(2);
    expect(runs[1]!.startAt).toBe(17);
  });

  it('alpha run past Z tracks maxValue for PDF overflow detection', () => {
    const labels = buildPageLabels(28, [
      { startPageIndex: 0, format: 'upper-alpha', startAt: 1 },
    ]);
    const runs = collectPageLabelRuns(labels);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.maxValue).toBe(28);
  });
});
