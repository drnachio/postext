import { describe, expect, it } from 'vitest';
import { bytesToDataUrl } from './presetCovers';

describe('bytesToDataUrl', () => {
  it('encodes the bytes as a base64 data URL of their type', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x41]).buffer;
    expect(bytesToDataUrl(bytes, 'image/jpeg')).toBe('data:image/jpeg;base64,/9j/AEE=');
  });

  it('handles pictures larger than one encoding chunk', () => {
    const bytes = new Uint8Array(70_000).fill(65).buffer;
    const url = bytesToDataUrl(bytes, 'image/jpeg');
    expect(atob(url.slice('data:image/jpeg;base64,'.length)).length).toBe(70_000);
  });
});
