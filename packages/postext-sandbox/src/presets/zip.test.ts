// #198 review: the import asks a multi-language `.postext` which edition to
// open before importing it. Reading that question must not inflate the
// whole archive (a 120-chapter book in three languages with CJK font
// subsets and plates), which the import then opens once.

import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { openBundleZip, readBundleZipManifest } from './zip';

const manifest = { version: 2, id: 'hlm', name: '紅樓夢', locale: 'zh-Hant', locales: ['zh-Hant', 'zh-Hans', 'en'] };
const chapter = strToU8('# 第一回\n\n此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去。'.repeat(200));

/** Flip the first byte of an entry's compressed data (a deflate block of
 *  type 3, which does not exist): inflating it throws. */
function corruptEntry(zip: Uint8Array, name: string): Uint8Array {
  const out = zip.slice();
  const target = strToU8(name);
  for (let i = 0; i + 30 < out.length; i++) {
    if (out[i] !== 0x50 || out[i + 1] !== 0x4b || out[i + 2] !== 0x03 || out[i + 3] !== 0x04) continue;
    const nameLen = out[i + 26]! | (out[i + 27]! << 8);
    const extraLen = out[i + 28]! | (out[i + 29]! << 8);
    const entry = out.subarray(i + 30, i + 30 + nameLen);
    if (entry.length === target.length && entry.every((b, k) => b === target[k])) {
      out[i + 30 + nameLen + extraLen] = 0xff;
      return out;
    }
  }
  throw new Error(`no entry ${name}`);
}

describe('readBundleZipManifest', () => {
  it('reads the manifest without inflating the other files', () => {
    const zip = zipSync({
      'preset.json': strToU8(JSON.stringify(manifest)),
      'chapters/zh-Hant/001.md': [chapter, { level: 6 }],
    });
    const broken = corruptEntry(zip, 'chapters/zh-Hant/001.md');
    expect(() => unzipSync(broken)).toThrow();
    expect(readBundleZipManifest(broken)).toEqual(manifest);
  });

  it('finds the manifest where openBundleZip does', () => {
    const nested = zipSync({
      'hlm/preset.json': strToU8(JSON.stringify(manifest)),
      '__MACOSX/hlm/preset.json': strToU8('junk'),
      'hlm/.hidden/preset.json': strToU8('junk'),
      'hlm/chapters/zh-Hant/001.md': chapter,
    });
    expect(readBundleZipManifest(nested)).toEqual(openBundleZip(nested).manifest);
    const both = zipSync({ 'preset.json': strToU8(JSON.stringify(manifest)), 'old/preset.json': strToU8('{}') });
    expect(readBundleZipManifest(both)).toEqual(manifest);
  });

  it('rejects what openBundleZip rejects', () => {
    expect(() => readBundleZipManifest(strToU8('not a zip'))).toThrow(/zip/);
    expect(() => readBundleZipManifest(zipSync({ 'a.md': chapter }))).toThrow(/preset\.json/);
    expect(() => readBundleZipManifest(zipSync({ 'a/preset.json': strToU8('{}'), 'b/preset.json': strToU8('{}') }))).toThrow(/several/);
    expect(() => readBundleZipManifest(zipSync({ 'preset.json': strToU8('{') }))).toThrow(/JSON/);
  });
});
