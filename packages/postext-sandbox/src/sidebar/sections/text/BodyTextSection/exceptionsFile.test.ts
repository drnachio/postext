import { describe, expect, it } from 'vitest';
import { formatExceptionsFile, mergeExceptions, parseExceptionsFile } from './exceptionsFile.js';

describe('hyphenation exception files', () => {
  it('read back what they export', () => {
    const words = ['de-sa-rro-llo', 'Ca-ta-lu-ña', 'Blender'];
    const file = formatExceptionsFile(words, 'es');
    expect(file.startsWith('# Postext')).toBe(true);
    expect(file.split('\n')).toContain('Ca-ta-lu-ña');
    expect(parseExceptionsFile(file)).toEqual(words);
  });

  it('read the usual shapes: separators, comments, a TeX block, soft hyphens, hyphenation points', () => {
    const text = '﻿% from TeX\n\\hyphenation{hí-ga-do ri-ñón}\n# a comment\nbazo, pán-cre-as;  co­lon\r\nes‧tó‧ma‧go\n\n';
    expect(parseExceptionsFile(text)).toEqual(['hí-ga-do', 'ri-ñón', 'bazo', 'pán-cre-as', 'co-lon', 'es-tó-ma-go']);
  });

  it('read tilde marks (~ at a break, a leading ~ for never divided), = as a break, and // comments', () => {
    expect(parseExceptionsFile('de~sa~~rro~~~llo\n~Blender\n// note\npe=rro')).toEqual(['de-sa-rro-llo', 'Blender', 'pe-rro']);
  });

  it('read a JSON list, or lists by language', () => {
    expect(parseExceptionsFile('["ca-sa", "mo-to"]')).toEqual(['ca-sa', 'mo-to']);
    expect(parseExceptionsFile('{"es": ["ca-sa"], "en": ["ta-ble"]}')).toEqual(['ca-sa', 'ta-ble']);
  });

  it('keep the last form of a repeated word, and keep case apart as the engine does', () => {
    expect(parseExceptionsFile('de-sarrollo\ndesa-rro-llo')).toEqual(['desa-rro-llo']);
    expect(parseExceptionsFile('Rose rose')).toEqual(['Rose', 'rose']);
  });

  it('merge an import into the list, an imported word replacing the same word', () => {
    expect(mergeExceptions(['de-sa-rro-llo', 'Blender'], ['desa-rro-llo', 'hí-ga-do'])).toEqual(['Blender', 'desa-rro-llo', 'hí-ga-do']);
  });
});
