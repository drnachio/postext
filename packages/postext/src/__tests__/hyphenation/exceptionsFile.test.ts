import { describe, expect, it } from 'vitest';
import {
  formatHyphenationExceptionsFile,
  hyphenationExceptionsFor,
  mergeHyphenationExceptions,
  mergeHyphenationExceptionsFile,
  parseHyphenationExceptionsFile,
  withHyphenationExceptions,
} from '../../hyphenation/exceptionsFile.js';

// Exception lists as files (#1530): the Sandbox's Import and Export and the
// command line's --hyphenation-exceptions read and write them.

const words = (text: string): string[] => parseHyphenationExceptionsFile(text).words;

describe('parseHyphenationExceptionsFile', () => {
  it('reads back what formatHyphenationExceptionsFile writes', () => {
    const list = ['de-sa-rro-llo', 'Ca-ta-lu-ña', 'Blender', 'col·lec-ció'];
    const file = formatHyphenationExceptionsFile(list, 'es');
    expect(file.startsWith('# Postext hyphenation exceptions, language es\n')).toBe(true);
    expect(file.split('\n')).toContain('Ca-ta-lu-ña');
    expect(parseHyphenationExceptionsFile(file)).toEqual({ words: list, byLanguage: {}, dropped: [] });
    expect(formatHyphenationExceptionsFile(['a'])).toContain('all languages');
  });

  it('reads separators, comment lines, soft hyphens and hyphenation points', () => {
    expect(words('﻿# a comment\nbazo, pán-cre-as;  co­lon\r\nes‧tó‧ma‧go\n% TeX-style\n// note\n\n')).toEqual(['bazo', 'pán-cre-as', 'co-lon', 'es-tó-ma-go']);
  });

  it('reads tilde marks, a leading ~ for a word never divided, and = as a break', () => {
    expect(words('de~sa~~rro~~~llo\n~Blen~der\npe=rro')).toEqual(['de-sa-rro-llo', 'Blender', 'pe-rro']);
  });

  it('keeps the Catalan l·l as a letter of the word', () => {
    expect(words('col·lec-ció, il·lu-sió')).toEqual(['col·lec-ció', 'il·lu-sió']);
  });

  it('reads only the \\hyphenation blocks of a TeX file', () => {
    const tex = [
      '\\documentclass{book}',
      '\\usepackage[spanish]{babel}',
      '% \\hyphenation{co-men-ta-do}',
      '\\hyphenation{hí-ga-do ri-ñón % a note',
      '  bazo}',
      '\\begin{document}Texto\\end{document}',
      '\\hyphenation{Ma-drid}',
    ].join('\n');
    expect(parseHyphenationExceptionsFile(tex)).toEqual({ words: ['hí-ga-do', 'ri-ñón', 'bazo', 'Ma-drid'], byLanguage: {}, dropped: [] });
  });

  it('reads a JSON list, and lists keyed by language with "*" for every language', () => {
    expect(words('["ca-sa", "mo-to"]')).toEqual(['ca-sa', 'mo-to']);
    expect(parseHyphenationExceptionsFile('{"es": ["ca-sa"], "en": "ta-ble, Alice", "*": ["You-Tube"], "": ["Blender"]}')).toEqual({
      words: [],
      byLanguage: { es: ['ca-sa'], en: ['ta-ble', 'Alice'], '*': ['You-Tube', 'Blender'] },
      dropped: [],
    });
  });

  it('drops what the engine cannot hold and says which', () => {
    const read = parseHyphenationExceptionsFile('ca-sa 1984 e-mail@x -- R2-D2\n');
    expect(read.words).toEqual(['ca-sa']);
    expect(read.dropped).toEqual(['1984', 'e-mail@x', '--', 'R2-D2']);
    expect(parseHyphenationExceptionsFile('{"es": ["ca-sa", 3], "en": true}').dropped).toEqual(['en', '3']);
  });

  it('keeps the last form of a word given twice, and case apart as the engine does', () => {
    expect(words('de-sarrollo\ndesa-rro-llo')).toEqual(['desa-rro-llo']);
    expect(words('Rose rose')).toEqual(['Rose', 'rose']);
  });
});

describe('mergeHyphenationExceptions', () => {
  it('adds new words, replaces another form of the same word, and counts both', () => {
    expect(mergeHyphenationExceptions(['de-sa-rro-llo', 'Blender'], ['desa-rro-llo', 'hí-ga-do', 'Blender'])).toEqual({
      words: ['Blender', 'desa-rro-llo', 'hí-ga-do'],
      added: 1,
      replaced: 1,
    });
  });
});

describe('lists in the configuration', () => {
  it('reads and writes the list of every language and of one language, by dictionary', () => {
    const h = { exceptions: ['Alice'], exceptionsByLanguage: { 'en-GB': ['co-lour'], es: ['ca-mi-no'] } };
    expect(hyphenationExceptionsFor(h)).toEqual(['Alice']);
    expect(hyphenationExceptionsFor(h, '*')).toEqual(['Alice']);
    expect(hyphenationExceptionsFor(h, 'en')).toEqual(['co-lour']);
    expect(hyphenationExceptionsFor(h, 'el')).toEqual([]);
    // The tag already written for English keeps the list.
    expect(withHyphenationExceptions(h, ['fla-vour', 'co-lour'], 'en-US')).toEqual({ exceptions: ['Alice'], exceptionsByLanguage: { es: ['ca-mi-no'], 'en-GB': ['co-lour', 'fla-vour'] } });
    expect(withHyphenationExceptions(h, [], 'es')).toEqual({ exceptions: ['Alice'], exceptionsByLanguage: { 'en-GB': ['co-lour'] } });
    expect(withHyphenationExceptions({ exceptionsByLanguage: { es: ['x'] } }, undefined, 'es')).toEqual({});
    expect(withHyphenationExceptions(h, [])).toEqual({ exceptionsByLanguage: h.exceptionsByLanguage });
  });

  it('merges a plain file into the list asked for, and a keyed file by its keys', () => {
    const h = { enabled: true, exceptions: ['Alice'], exceptionsByLanguage: { es: ['ca-mi-no'] } };
    const plain = mergeHyphenationExceptionsFile(h, parseHyphenationExceptionsFile('cami-no ma-pa 42'), 'es');
    expect(plain).toEqual({ hyphenation: { enabled: true, exceptions: ['Alice'], exceptionsByLanguage: { es: ['cami-no', 'ma-pa'] } }, added: 1, replaced: 1, dropped: 1, unknownLanguages: [] });
    expect(mergeHyphenationExceptionsFile(h, parseHyphenationExceptionsFile('Bob')).hyphenation.exceptions).toEqual(['Alice', 'Bob']);
    const keyed = mergeHyphenationExceptionsFile(h, parseHyphenationExceptionsFile('{"*": ["Bob"], "en-US": ["ta-ble"], "el": ["λέ-ξη", "κό-σμος"]}'), 'es');
    expect(keyed.hyphenation).toEqual({ enabled: true, exceptions: ['Alice', 'Bob'], exceptionsByLanguage: { es: ['ca-mi-no'], 'en-US': ['ta-ble'] } });
    expect(keyed).toMatchObject({ added: 2, replaced: 0, dropped: 2, unknownLanguages: ['el'] });
  });
});
