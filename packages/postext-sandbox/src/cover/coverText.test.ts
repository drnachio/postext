import { describe, expect, it } from 'vitest';
import { coverSlotTexts, hasCoverSlot, setCoverSlotText } from './coverText.js';

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
});
