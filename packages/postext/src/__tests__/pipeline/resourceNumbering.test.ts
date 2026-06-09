import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../parse';
import {
  computeHeadingContext,
  computeResourceNumbering,
} from '../../pipeline/resourceNumbering';
import type { Resource, ResourceType, ResourceCounterFormat } from '../../types';

const now = 0;

const makeResource = (id: string, typeId: string): Resource => ({
  id,
  typeId,
  kind: 'bitmap',
  createdAt: now,
  updatedAt: now,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 1, height: 1 },
});

const makeType = (over: Partial<ResourceType> & { id: string }): ResourceType => ({
  name: over.id,
  shortLabel: over.id,
  numberingTemplate: '{n}',
  resetOn: 'never',
  counterFormat: 'decimal',
  captionPrefix: over.id,
  ...over,
});

/** Run the numbering pipeline on markdown + a resource/type set. */
const number = (
  md: string,
  types: ResourceType[],
  resources: Resource[],
): Record<string, string> => {
  const blocks = parseMarkdown(md);
  const ctx = computeHeadingContext(blocks);
  const map = computeResourceNumbering(blocks, types, resources, ctx);
  return Object.fromEntries(
    Object.entries(map).map(([id, entry]) => [id, entry.number]),
  );
};

describe('resource numbering — first-reference ordering', () => {
  const types = [makeType({ id: 'figure', numberingTemplate: '{n}' })];
  const resources = [
    makeResource('a', 'figure'),
    makeResource('b', 'figure'),
    makeResource('c', 'figure'),
  ];

  it('numbers embeds in reading order', () => {
    const out = number(
      '::resource{id="a"}\n\n::resource{id="b"}\n\n::resource{id="c"}\n',
      types,
      resources,
    );
    expect(out).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('numbers a ref before its embed (ref-before-embed)', () => {
    const out = number(
      'See :ref{id="b"} first.\n\n::resource{id="a"}\n\n::resource{id="b"}\n',
      types,
      resources,
    );
    // b is first-referenced before a's embed
    expect(out).toEqual({ b: '1', a: '2' });
  });

  it('numbers an embed before its ref (embed-before-ref)', () => {
    const out = number(
      '::resource{id="a"}\n\nlater :ref{id="a"} again\n',
      types,
      resources,
    );
    expect(out).toEqual({ a: '1' });
  });

  it('numbers ref-only resources (no embed present)', () => {
    const out = number(
      'see :ref{id="c"} and :ref{id="a"}\n',
      types,
      resources,
    );
    expect(out).toEqual({ c: '1', a: '2' });
  });

  it('handles interleaved types preserving per-type counters', () => {
    const mixedTypes = [
      makeType({ id: 'figure', numberingTemplate: '{n}' }),
      makeType({ id: 'table', numberingTemplate: '{n}' }),
    ];
    const mixedResources = [
      makeResource('f1', 'figure'),
      makeResource('t1', 'table'),
      makeResource('f2', 'figure'),
      makeResource('t2', 'table'),
    ];
    const out = number(
      '::resource{id="f1"}\n\n::resource{id="t1"}\n\n::resource{id="f2"}\n\n::resource{id="t2"}\n',
      mixedTypes,
      mixedResources,
    );
    expect(out).toEqual({ f1: '1', t1: '1', f2: '2', t2: '2' });
  });

  it('uses the first reference even when it later appears again', () => {
    const out = number(
      ':ref{id="a"} ... ::resource{id="a"} ... :ref{id="a"}\n\n::resource{id="b"}\n',
      types,
      resources,
    );
    // first line is a paragraph (embed mid-line is not a block), so only the
    // inline refs to "a" count there; b's embed comes after.
    expect(out.a).toBe('1');
    expect(out.b).toBe('2');
  });
});

describe('resource numbering — resetOn', () => {
  const types = [
    makeType({
      id: 'figure',
      numberingTemplate: '{h1}.{n}',
      resetOn: 'h1',
    }),
  ];
  const resources = [
    makeResource('a', 'figure'),
    makeResource('b', 'figure'),
    makeResource('c', 'figure'),
  ];

  it("resetOn:'h1' restarts the counter at each h1", () => {
    const md = [
      '# Chapter One',
      '',
      '::resource{id="a"}',
      '',
      '::resource{id="b"}',
      '',
      '# Chapter Two',
      '',
      '::resource{id="c"}',
      '',
    ].join('\n');
    const out = number(md, types, resources);
    expect(out).toEqual({ a: '1.1', b: '1.2', c: '2.1' });
  });

  it("resetOn:'never' keeps a single running counter across h1s", () => {
    const neverTypes = [
      makeType({ id: 'figure', numberingTemplate: '{n}', resetOn: 'never' }),
    ];
    const md = [
      '# One',
      '',
      '::resource{id="a"}',
      '',
      '# Two',
      '',
      '::resource{id="b"}',
      '',
    ].join('\n');
    const out = number(md, neverTypes, resources);
    expect(out).toEqual({ a: '1', b: '2' });
  });
});

describe('resource numbering — template rendering', () => {
  const resources = [makeResource('a', 'figure')];

  it('renders {h1}.{n}', () => {
    const types = [makeType({ id: 'figure', numberingTemplate: '{h1}.{n}', resetOn: 'h1' })];
    const out = number('# C\n\n::resource{id="a"}\n', types, resources);
    expect(out.a).toBe('1.1');
  });

  it('collapses {h1}.{n} to bare {n} when no h1 is in effect', () => {
    const types = [makeType({ id: 'figure', numberingTemplate: '{h1}.{n}', resetOn: 'never' })];
    const out = number('::resource{id="a"}\n', types, resources);
    expect(out.a).toBe('1');
  });

  it('renders literal text around the counter', () => {
    const types = [makeType({ id: 'figure', numberingTemplate: 'No. {n}', resetOn: 'never' })];
    const out = number('::resource{id="a"}\n', types, resources);
    expect(out.a).toBe('No. 1');
  });
});

describe('resource numbering — counter formats', () => {
  const resources = [
    makeResource('a', 'figure'),
    makeResource('b', 'figure'),
    makeResource('c', 'figure'),
    makeResource('d', 'figure'),
  ];
  const md =
    '::resource{id="a"}\n\n::resource{id="b"}\n\n::resource{id="c"}\n\n::resource{id="d"}\n';

  const run = (format: ResourceCounterFormat): string[] => {
    const types = [
      makeType({ id: 'figure', numberingTemplate: '{n}', counterFormat: format }),
    ];
    const out = number(md, types, resources);
    return ['a', 'b', 'c', 'd'].map((id) => out[id]!);
  };

  it('decimal', () => {
    expect(run('decimal')).toEqual(['1', '2', '3', '4']);
  });

  it('roman-lower', () => {
    expect(run('roman-lower')).toEqual(['i', 'ii', 'iii', 'iv']);
  });

  it('roman-upper', () => {
    expect(run('roman-upper')).toEqual(['I', 'II', 'III', 'IV']);
  });

  it('alpha-lower', () => {
    expect(run('alpha-lower')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('alpha-upper', () => {
    expect(run('alpha-upper')).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('resource numbering — unknown resources/types', () => {
  it('skips refs to unknown resource ids', () => {
    const types = [makeType({ id: 'figure', numberingTemplate: '{n}' })];
    const resources = [makeResource('a', 'figure')];
    const out = number(':ref{id="ghost"} and ::resource{id="a"}\n\n::resource{id="a"}\n', types, resources);
    expect(out.ghost).toBeUndefined();
    expect(out.a).toBe('1');
  });

  it('skips resources whose type is undefined', () => {
    const types: ResourceType[] = [];
    const resources = [makeResource('a', 'figure')];
    const out = number('::resource{id="a"}\n', types, resources);
    expect(out).toEqual({});
  });
});
