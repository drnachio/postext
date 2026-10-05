import { describe, expect, it } from 'vitest';
import { defaultEpubLayout, isTablet, type DeviceTraits } from './defaultLayout';

const IPAD_OS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const OLD_IPAD = 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

const device = (d: Partial<DeviceTraits>): DeviceTraits => ({ userAgent: IPAD_OS, maxTouchPoints: 0, touchOnly: false, shortSide: 900, ...d });

describe('the EPUB tab’s default rendition', () => {
  it('is the fixed layout on an iPad, whether it reports itself as one or as a Mac', () => {
    expect(defaultEpubLayout(device({ userAgent: IPAD_OS, maxTouchPoints: 5, touchOnly: true, shortSide: 820 }))).toBe('fixed');
    expect(defaultEpubLayout(device({ userAgent: OLD_IPAD, maxTouchPoints: 5, touchOnly: true, shortSide: 768 }))).toBe('fixed');
  });

  it('is the fixed layout on another touch tablet', () => {
    expect(isTablet(device({ userAgent: ANDROID, maxTouchPoints: 10, touchOnly: true, shortSide: 800 }))).toBe(true);
  });

  it('stays reflowable on a Mac, a phone and outside a browser', () => {
    expect(defaultEpubLayout(device({ userAgent: IPAD_OS, maxTouchPoints: 0, touchOnly: false, shortSide: 982 }))).toBe('reflowable');
    expect(defaultEpubLayout(device({ userAgent: IPHONE, maxTouchPoints: 5, touchOnly: true, shortSide: 393 }))).toBe('reflowable');
    expect(defaultEpubLayout(device({ userAgent: ANDROID, maxTouchPoints: 10, touchOnly: true, shortSide: 412 }))).toBe('reflowable');
    expect(defaultEpubLayout(null)).toBe('reflowable');
  });
});
