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

describe('header/footer placeholder warnings', () => {
  const header = (content: string): PostextConfig => ({
    header: {
      elements: [
        {
          kind: 'text',
          id: 'text1',
          content,
          fontSize: { value: 8, unit: 'pt' },
          overflow: 'wrap',
          placement: { anchor: { to: 'container', edge: 'bottom' } },
        },
      ],
    },
  });

  it('flags names outside the engine allow-list', () => {
    const found = find('', 'headerFooterUnknownPlaceholder', header('{bogus} {pageNumber}'));
    expect(found.map((w) => w.payload.name)).toEqual(['bogus']);
  });

  it('accepts the open-ended attr namespace', () => {
    expect(kinds('', header('{attr.edition} — {chapterTitle}'))).not.toContain(
      'headerFooterUnknownPlaceholder',
    );
  });
});

describe('design slot placeholder warnings', () => {
  const text = (content: string) => ({
    kind: 'text' as const,
    id: 'text1',
    content,
    fontSize: { value: 8, unit: 'pt' as const },
    overflow: 'wrap' as const,
    placement: { anchor: { to: 'container' as const, edge: 'top' as const } },
  });

  it('validates the part opener with the part placeholder set', () => {
    const config: PostextConfig = {
      parts: { design: { elements: [text('{partNumber} · {titleText} · {number} {bogus}')] } },
    };
    const found = find('', 'headerFooterUnknownPlaceholder', config);
    expect(found.map((w) => [w.payload.slot, w.payload.name])).toEqual([['part', 'bogus']]);
  });

  it('keeps the heading-only names out of headers', () => {
    const config: PostextConfig = { header: { elements: [text('{titleText} {partTitle}')] } };
    const found = find('', 'headerFooterUnknownPlaceholder', config);
    expect(found.map((w) => w.payload.name)).toEqual(['titleText']);
  });

  it('tags heading advanced designs with their level', () => {
    const config: PostextConfig = {
      headings: {
        levels: [{ level: 2, advancedDesign: { enabled: true, slot: { elements: [text('{titleText} {nope}')] } } }],
      },
    };
    const found = find('', 'headerFooterUnknownPlaceholder', config);
    expect(found.map((w) => [w.payload.slot, w.payload.level, w.payload.name])).toEqual([['heading', 2, 'nope']]);
  });

  it('checks anchors inside the part opener', () => {
    const config: PostextConfig = {
      parts: {
        design: {
          elements: [{ ...text('{titleText}'), placement: { anchor: { to: '#ghost', edge: 'below' } } }],
        },
      },
    };
    const found = find('', 'designDanglingAnchor', config);
    expect(found.map((w) => [w.payload.slot, w.payload.referencedId])).toEqual([['part', 'ghost']]);
  });
});

describe('callout icon resources', () => {
  it('does not flag a resource used as a callout icon as unused', () => {
    const resource = {
      id: 'icon-note', typeId: 'figure', kind: 'svg' as const, caption: '',
      createdAt: 0, updatedAt: 0, svg: { fileId: 'f' },
    };
    const warnings = computeWarnings({
      markdown: 'Hello',
      config: { calloutStyles: [{ id: 'note', icon: { kind: 'resource', resourceId: 'icon-note' } }] },
      resources: [resource],
      doc: null,
    } as never);
    expect(warnings.some((w) => w.payload.kind === 'unusedResource')).toBe(false);
  });
});
