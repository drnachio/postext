import { describe, expect, it } from 'vitest';
import type { AppliedPresetSnapshot } from './types';
import { decidePresetUpdate } from './watch';

const snapshot = (over: Partial<AppliedPresetSnapshot> = {}): AppliedPresetSnapshot => ({
  presetId: 'brochure',
  fingerprint: 'aaa',
  markdownHash: '1',
  configHash: '2',
  resourcesHash: '3',
  ...over,
});

describe('decidePresetUpdate', () => {
  it('re-applies when the bundle changed and the document is untouched', () => {
    expect(decidePresetUpdate({ liveFingerprint: 'bbb', snapshot: snapshot(), untouched: true })).toBe('apply');
  });

  it('flags stale when the bundle changed but there are local edits', () => {
    expect(decidePresetUpdate({ liveFingerprint: 'bbb', snapshot: snapshot(), untouched: false })).toBe('stale');
  });

  it('does nothing while the fingerprint matches, edits or not', () => {
    expect(decidePresetUpdate({ liveFingerprint: 'aaa', snapshot: snapshot(), untouched: true })).toBe('none');
    expect(decidePresetUpdate({ liveFingerprint: 'aaa', snapshot: snapshot(), untouched: false })).toBe('none');
  });

  it('does nothing when the live fingerprint is unknown', () => {
    expect(decidePresetUpdate({ liveFingerprint: null, snapshot: snapshot(), untouched: true })).toBe('none');
  });

  it('does nothing without a snapshot or with one taken without a fingerprint', () => {
    expect(decidePresetUpdate({ liveFingerprint: 'bbb', snapshot: null, untouched: true })).toBe('none');
    expect(decidePresetUpdate({ liveFingerprint: 'bbb', snapshot: undefined, untouched: true })).toBe('none');
    expect(decidePresetUpdate({ liveFingerprint: 'bbb', snapshot: snapshot({ fingerprint: null }), untouched: true })).toBe('none');
  });
});
