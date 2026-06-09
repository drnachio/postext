import { describe, it, expect } from 'vitest';
import { defaultResourceTypes } from '../../defaults/resourceTypes';
import { parseMarkdown } from '../../parse';
import {
  computeHeadingContext,
  computeResourceNumbering,
} from '../../pipeline/resourceNumbering';
import type { Resource } from '../../types';

const VALID_FORMATS = new Set([
  'decimal',
  'roman-lower',
  'roman-upper',
  'alpha-lower',
  'alpha-upper',
]);
const VALID_RESETS = new Set(['never', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

describe('built-in resource types', () => {
  it('returns a fresh array on every call (callers may mutate)', () => {
    const a = defaultResourceTypes();
    const b = defaultResourceTypes();
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
    expect(a).toEqual(b);
  });

  it('has at least the figure and table types', () => {
    const ids = defaultResourceTypes().map((t) => t.id);
    expect(ids).toContain('figure');
    expect(ids).toContain('table');
  });

  it('has unique ids', () => {
    const ids = defaultResourceTypes().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('every default type', () => {
    const types = defaultResourceTypes();
    for (const t of types) {
      describe(`type "${t.id}"`, () => {
        it('has a non-empty id, name and shortLabel', () => {
          expect(t.id.trim()).not.toBe('');
          expect(t.name.trim()).not.toBe('');
          expect(t.shortLabel.trim()).not.toBe('');
        });

        it('has a non-empty caption prefix', () => {
          expect(t.captionPrefix.trim()).not.toBe('');
        });

        it('has a valid counterFormat and resetOn', () => {
          expect(VALID_FORMATS.has(t.counterFormat)).toBe(true);
          expect(VALID_RESETS.has(t.resetOn)).toBe(true);
        });

        it('has a template that references the {n} counter', () => {
          expect(t.numberingTemplate).toContain('{n}');
        });

        it('renders a non-empty number through the numbering pipeline', () => {
          const resource: Resource = {
            id: 'r',
            typeId: t.id,
            kind: 'bitmap',
            createdAt: 0,
            updatedAt: 0,
            bitmap: { fileId: 'r.png', format: 'png', width: 1, height: 1 },
          };
          const md = '# Chapter\n\n::resource{id="r"}\n';
          const blocks = parseMarkdown(md);
          const ctx = computeHeadingContext(blocks);
          const map = computeResourceNumbering(blocks, [t], [resource], ctx);
          expect(map.r).toBeDefined();
          expect(map.r!.number).not.toBe('');
        });
      });
    }
  });
});
