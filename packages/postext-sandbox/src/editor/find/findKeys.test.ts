import { describe, expect, it } from 'vitest';
import { findFieldKey, isReplacementStep, type FindKey } from './findKeys.js';

const key = (k: string, extra: Partial<FindKey> = {}): FindKey => ({ key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, composing: false, ...extra });

describe('the find bar keys', () => {
  it('go to the next and previous match, replace, and close', () => {
    expect(findFieldKey(key('Enter'), 'query', false)).toBe('next');
    expect(findFieldKey(key('Enter', { shiftKey: true }), 'query', false)).toBe('previous');
    expect(findFieldKey(key('Enter'), 'replace', false)).toBe('replace');
    expect(findFieldKey(key('Enter', { ctrlKey: true, altKey: true }), 'replace', false)).toBe('replaceAll');
    expect(findFieldKey(key('Enter', { metaKey: true, altKey: true }), 'replace', true)).toBe('replaceAll');
    expect(findFieldKey(key('Enter', { ctrlKey: true, altKey: true }), 'query', false)).toBeNull();
    expect(findFieldKey(key('Escape'), 'replace', false)).toBe('close');
  });

  it('leave Enter and Escape to an input method while it composes', () => {
    expect(findFieldKey(key('Enter', { composing: true }), 'query', false)).toBeNull();
    expect(findFieldKey(key('Enter', { composing: true }), 'replace', true)).toBeNull();
    expect(findFieldKey(key('Escape', { composing: true }), 'query', false)).toBeNull();
  });

  it('read undo and redo with the platform modifier', () => {
    expect(findFieldKey(key('z', { metaKey: true }), 'query', true)).toBe('undo');
    expect(findFieldKey(key('z', { ctrlKey: true }), 'query', true)).toBeNull();
    expect(findFieldKey(key('Z', { ctrlKey: true, shiftKey: true }), 'replace', false)).toBe('redo');
    expect(findFieldKey(key('y', { ctrlKey: true }), 'replace', false)).toBe('redo');
  });

  it('take back only the bar\'s own replacement', () => {
    expect(isReplacementStep({ kind: 'group', source: 'find' }, ['a', 'b'])).toBe(true);
    expect(isReplacementStep({ kind: 'group', source: 'word' }, ['a', 'b'])).toBe(false);
    expect(isReplacementStep({ kind: 'text', chapterId: 'a' }, ['a'])).toBe(true);
    expect(isReplacementStep({ kind: 'text', chapterId: 'b' }, ['a'])).toBe(false);
    expect(isReplacementStep({ kind: 'config' }, ['a'])).toBe(false);
    expect(isReplacementStep(null, ['a'])).toBe(false);
  });
});
