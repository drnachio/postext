import { describe, expect, it } from 'vitest';
import { coverSlotTexts, renameCoverSlot, hasCoverSlot, setCoverSlotText } from './coverText.js';

const MD = ':::frame{slot="back"}\nA blurb.\n\nSecond paragraph.\n:::\n\n:::frame{slot="flapFront"}\nAbout the author.\n:::\n';

describe('cover text by slot', () => {
  it('reads each slot\'s text without its fences', () => {
    expect(coverSlotTexts(MD)).toEqual({ back: 'A blurb.\n\nSecond paragraph.', flapFront: 'About the author.' });
    expect(coverSlotTexts(undefined)).toEqual({});
  });

  it('replaces one slot and leaves the others as written', () => {
    const next = setCoverSlotText(MD, 'back', 'New blurb.');
    expect(coverSlotTexts(next)).toEqual({ back: 'New blurb.', flapFront: 'About the author.' });
    expect(next.indexOf('slot="back"')).toBeLessThan(next.indexOf('slot="flapFront"'));
  });

  it('adds a frame for a slot it lacks, and removes one with null', () => {
    const added = setCoverSlotText(MD, 'front', 'Override');
    expect(coverSlotTexts(added).front).toBe('Override');
    expect(hasCoverSlot(added, 'front')).toBe(true);
    const removed = setCoverSlotText(added, 'front', null);
    expect(hasCoverSlot(removed, 'front')).toBe(false);
    expect(coverSlotTexts(removed)).toEqual(coverSlotTexts(MD));
  });

  it('starts an empty cover with its first frame', () => {
    expect(setCoverSlotText('', 'back', 'Text')).toBe(':::frame{slot="back"}\nText\n:::\n');
    expect(setCoverSlotText('', 'back', null)).toBe('');
  });

  it('drops a repeated slot when it is written', () => {
    const twice = `${MD}\n:::frame{slot="back"}\nOld copy\n:::\n`;
    const next = setCoverSlotText(twice, 'back', 'One');
    expect(next.match(/slot="back"/g)).toHaveLength(1);
  });

  it('renames a slot in its frames and leaves the rest', () => {
    const md = ':::frame{slot="quote"}\nA line\n:::\n\n:::frame{slot="back"}\nBlurb\n:::\n';
    const next = renameCoverSlot(md, 'quote', 'praise');
    expect(next).toContain(':::frame{slot="praise"}\nA line');
    expect(next).toContain(':::frame{slot="back"}\nBlurb');
    expect(coverSlotTexts(next).praise).toBe('A line');
  });

  it('reads and writes a sheet’s own text apart from the shared one (#1673)', () => {
    const own = setCoverSlotText(MD, 'back', 'For the case.', ['case', 'cover']);
    expect(own).toContain(':::frame{slot="back" sheet="case"}\nFor the case.');
    expect(coverSlotTexts(own)).toEqual(coverSlotTexts(MD));
    expect(coverSlotTexts(own, ['case', 'cover'])).toEqual({ back: 'For the case.' });
    expect(hasCoverSlot(own, 'back', ['jacket'])).toBe(false);
    // The shared text written leaves the sheet's own frame alone.
    const shared = setCoverSlotText(own, 'back', 'Shared.');
    expect(coverSlotTexts(shared, ['case'])).toEqual({ back: 'For the case.' });
    expect(coverSlotTexts(shared).back).toBe('Shared.');
    // A frame for several sheets keeps them when one writes it.
    const both = ':::frame{slot="front" sheet="case jacket"}\nOld\n:::\n';
    expect(setCoverSlotText(both, 'front', 'New', ['jacket'])).toContain('sheet="case jacket"}\nNew');
    const gone = setCoverSlotText(own, 'back', null, ['case']);
    expect(gone).not.toContain('sheet=');
    expect(coverSlotTexts(gone)).toEqual(coverSlotTexts(MD));
  });

  it('renames a text box’s frames for one sheet too', () => {
    const md = ':::frame{slot="quote"}\nShared\n:::\n\n:::frame{slot="quote" sheet="jacket"}\nJacket\n:::\n';
    const next = renameCoverSlot(md, 'quote', 'praise');
    expect(coverSlotTexts(next).praise).toBe('Shared');
    expect(coverSlotTexts(next, ['jacket']).praise).toBe('Jacket');
  });
});
