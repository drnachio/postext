import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { computeWarnings } from './compute';
import type { WarningPayload } from './types';

function kinds(markdown: string, config: PostextConfig = {}): WarningPayload['kind'][] {
  return computeWarnings({ markdown, config, doc: null }).map((w) => w.payload.kind);
}

function find<K extends WarningPayload['kind']>(
  markdown: string,
  kind: K,
  config: PostextConfig = {},
) {
  return computeWarnings({ markdown, config, doc: null }).filter(
    (w): w is typeof w & { payload: Extract<WarningPayload, { kind: K }> } => w.payload.kind === kind,
  );
}

describe('fenced-container warnings', () => {
  it('does not flag known containers as unknown directives', () => {
    const md = [
      '# Title',
      '',
      ':::callout{type="note"}',
      'Inside.',
      ':::',
      '',
      ':::paragraphs{style="biblio"}',
      'Entry.',
      ':::',
      '',
      ':::part',
      'Part.',
      ':::',
      '',
      ':::pagebreak',
    ].join('\n');
    const config: PostextConfig = { paragraphStyles: [{ id: 'biblio' }] };
    expect(kinds(md, config)).not.toContain('unknownDirective');
  });

  it('still flags directive names the parser does not know', () => {
    const found = find(':::banana\ntext\n:::', 'unknownDirective');
    expect(found).toHaveLength(1);
    expect(found[0]!.payload.name).toBe('banana');
  });

  it('reports an unclosed container pointing at its opening fence', () => {
    const md = 'Intro.\n\n:::callout{type="tip"}\nStill open.';
    const found = find(md, 'unclosedContainer');
    expect(found).toHaveLength(1);
    expect(found[0]!.payload.name).toBe('callout');
    expect(found[0]!.sourceStart).toBe(md.indexOf(':::callout'));
    expect(found[0]!.line).toBe(3);
  });

  it('reports a paragraphs container whose style id is not configured', () => {
    const md = ':::paragraphs{style="missing"}\nEntry.\n:::';
    const found = find(md, 'unknownParagraphStyle', { paragraphStyles: [{ id: 'biblio' }] });
    expect(found).toHaveLength(1);
    expect(found[0]!.payload.style).toBe('missing');
    expect(found[0]!.sourceStart).toBe(0);
    expect(kinds(md, { paragraphStyles: [{ id: 'missing' }] })).not.toContain('unknownParagraphStyle');
  });

  it('reports an unknown callout type only once callout styles are configured', () => {
    const md = ':::callout{type="danger"}\nText.\n:::';
    expect(kinds(md)).not.toContain('unknownCalloutType');
    const withStyles = { calloutStyles: [{ id: 'note' }] } as PostextConfig;
    const found = find(md, 'unknownCalloutType', withStyles);
    expect(found).toHaveLength(1);
    expect(found[0]!.payload.type).toBe('danger');
    const known = { calloutStyles: [{ id: 'danger' }] } as PostextConfig;
    expect(kinds(md, known)).not.toContain('unknownCalloutType');
  });
});
