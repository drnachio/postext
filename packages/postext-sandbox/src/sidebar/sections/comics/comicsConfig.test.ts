import { describe, expect, it } from 'vitest';
import type { BalloonStyleConfig, ComicsConfig } from 'postext';
import {
  isBuiltInBalloonStyle,
  nextFreeId,
  pruneComics,
  removeById,
  renameById,
  resetFieldById,
  retargetCast,
  sanitizeSpeakerId,
  setComicsField,
  setNestedField,
  slugifyStyleId,
  upsertById,
} from './comicsConfig';

const MM = (value: number) => ({ value, unit: 'mm' as const });

describe('comics config edits', () => {
  it('stores nothing for an untouched or emptied section', () => {
    expect(pruneComics(undefined)).toBeUndefined();
    expect(pruneComics({})).toBeUndefined();
    expect(pruneComics({ lettering: {}, cast: [], panelStyles: [], gutter: { horizontal: undefined } })).toBeUndefined();
    expect(pruneComics({ frame: {} })).toBeUndefined();
  });

  it('sets and unsets top-level and nested fields', () => {
    let c = setComicsField(undefined, 'readingDirection', 'rtl');
    expect(c).toEqual({ readingDirection: 'rtl' });
    c = setNestedField(c, 'gutter', 'horizontal', MM(5));
    expect(c).toEqual({ readingDirection: 'rtl', gutter: { horizontal: MM(5) } });
    c = setNestedField(c, 'gutter', 'horizontal', undefined);
    expect(c).toEqual({ readingDirection: 'rtl' });
    c = setNestedField(c, 'lettering', 'bold', true);
    c = setComicsField(c, 'readingDirection', undefined);
    expect(c).toEqual({ lettering: { bold: true } });
    expect(setNestedField(c, 'lettering', 'bold', undefined)).toBeUndefined();
  });

  it('keeps the frame margins together', () => {
    const c: ComicsConfig = { frame: { margins: { top: MM(5), bottom: MM(5), left: MM(4), right: MM(4) } } };
    expect(pruneComics(c)).toEqual(c);
  });

  it('edits a list by id, dropping a built-in balloon style left bare', () => {
    let list: BalloonStyleConfig[] = upsertById<BalloonStyleConfig>(undefined, 'whisper', { dash: false });
    expect(list).toEqual([{ id: 'whisper', dash: false }]);
    list = upsertById(list, 'whisper', { fontScale: 0.8 });
    expect(list).toEqual([{ id: 'whisper', dash: false, fontScale: 0.8 }]);
    list = resetFieldById(list, 'whisper', 'dash', true);
    expect(list).toEqual([{ id: 'whisper', fontScale: 0.8 }]);
    expect(resetFieldById(list, 'whisper', 'fontScale', true)).toEqual([]);
    // A style of one's own stays, even with nothing set.
    expect(resetFieldById([{ id: 'robot', shape: 'electric' }], 'robot', 'shape')).toEqual([{ id: 'robot' }]);
  });

  it('renames never onto a taken id, and removes', () => {
    const list = [{ id: 'a' }, { id: 'b' }];
    expect(renameById(list, 'a', 'b')).toEqual(list);
    expect(renameById(list, 'a', 'c')).toEqual([{ id: 'c' }, { id: 'b' }]);
    expect(removeById(list, 'a')).toEqual([{ id: 'b' }]);
  });

  it('moves the cast with a renamed or deleted balloon style', () => {
    const cast = [{ id: 'robot', balloonStyle: 'beep' }, { id: 'ana' }];
    expect(retargetCast(cast, 'beep', 'radio2')).toEqual([{ id: 'robot', balloonStyle: 'radio2' }, { id: 'ana' }]);
    expect(retargetCast(cast, 'beep', undefined)).toEqual([{ id: 'robot' }, { id: 'ana' }]);
    expect(retargetCast(undefined, 'beep', 'x')).toBeUndefined();
  });

  it('makes ids', () => {
    expect(nextFreeId('panel', ['panel-1', 'panel-2'])).toBe('panel-3');
    expect(slugifyStyleId(' Big Shout! ')).toBe('big-shout');
    // Speaker ids take any script, as script lines do.
    expect(sanitizeSpeakerId(' ナミ ')).toBe('ナミ');
    expect(sanitizeSpeakerId('mr. smith')).toBe('mr.smith');
    expect(isBuiltInBalloonStyle('sfx')).toBe(true);
    expect(isBuiltInBalloonStyle('robot')).toBe(false);
  });
});
