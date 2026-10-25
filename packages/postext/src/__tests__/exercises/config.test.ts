import { describe, expect, it } from 'vitest';
import { collectConfigWarnings } from '../../configWarnings.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { stripExercisesDefaults } from '../../defaults/exercises.js';
import type { PostextConfig } from '../../types.js';

const warnings = (config: PostextConfig) => collectConfigWarnings(config).filter((w) => w.path.startsWith('exercise'));

describe('exercise settings checks (#1226)', () => {
  it('raises nothing for valid settings', () => {
    expect(warnings({
      exerciseStyles: [{
        id: 'ej', name: 'Ejercicio', box: 'note',
        number: { show: true, label: true, shape: 'disc', resetOn: 'h2', format: 'roman-upper', template: '{h1}.{n}' },
        instruction: { bold: false, italic: true },
        options: { labels: 'katakana', marker: 'box', layout: 'row', columns: 3, shuffle: true, bracket: true },
        blank: { look: 'dots', width: { value: 6, unit: 'em' } },
        trueFalse: { labels: ['V', 'F'], look: 'bracket' },
        match: { look: 'letters' },
        bank: { order: 'alpha', separator: ' · ' },
        area: { kind: 'tianzige', lines: 4 },
        grid: { uppercase: false },
        arithmetic: { division: 'potence', columns: 3 },
        level: { glyph: '★', empty: '☆', max: 5 },
        icons: { oral: { glyph: '♪', alt: 'Oral' } },
        answers: { italic: true },
        solutions: { placement: 'after', layout: 'key' },
        digital: { correctColor: { hex: '#00aa00', model: 'hex' } },
        marginTop: { value: 2, unit: 'em' },
      }],
      exercises: { edition: 'teacher', seed: 4, solutions: { placement: 'chapterEnd', heading: 'Soluciones' }, digital: { interactive: false, persist: false, check: 'instant' } },
    })).toEqual([]);
  });

  it('names unknown keys, words and numbering styles', () => {
    const found = warnings({
      exerciseStyles: [{ id: 'x', number: { shape: 'circle', format: 'klingon', colour: 'red' } as never, options: { labels: 'none', marker: 'tick' } as never, blank: { width: 'wide' } as never, icons: { oral: { glyf: '♪' } } as never }],
      exercises: { edition: 'pupil', digital: { check: 'live' }, sede: 2 } as never,
    });
    expect(found.map((w) => `${w.kind} ${w.path}`)).toEqual([
      'unknownConfigKey exerciseStyles[0].number.colour',
      'unknownConfigValue exerciseStyles[0].number.shape',
      'unknownNumberFormat exerciseStyles[0].number.format',
      'unknownConfigValue exerciseStyles[0].options.marker',
      'unknownConfigValue exerciseStyles[0].blank.width',
      'unknownConfigKey exerciseStyles[0].icons.oral.glyf',
      'unknownConfigKey exercises.sede',
      'unknownConfigValue exercises.edition',
      'unknownConfigValue exercises.digital.check',
    ]);
    expect(found.find((w) => w.path === 'exerciseStyles[0].number.colour')).toMatchObject({ suggestion: 'color' });
  });
});

describe('exercise settings for storage', () => {
  it('drops the defaults', () => {
    expect(stripExercisesDefaults({ edition: 'student', seed: 1, solutions: { placement: 'none', layout: 'full', heading: 'Solutions' }, digital: { interactive: true, persist: true, check: 'button' } }, 'en')).toBeUndefined();
    expect(stripExercisesDefaults({ solutions: { heading: 'Solutions' } }, 'es')).toEqual({ solutions: { heading: 'Solutions' } });
    expect(stripExercisesDefaults({ edition: 'teacher', digital: { check: 'instant', persist: true } })).toEqual({ edition: 'teacher', digital: { check: 'instant' } });
  });

  it('leaves the built-in style and default settings out of a stored config', () => {
    const stripped = stripConfigDefaults({ exerciseStyles: [{ id: 'exercise', name: 'Exercise' }], exercises: { seed: 1 } });
    expect(stripped.exerciseStyles).toBeUndefined();
    expect(stripped.exercises).toBeUndefined();
    expect(stripConfigDefaults({ exercises: { edition: 'teacher' } }).exercises).toEqual({ edition: 'teacher' });
  });
});

describe('assessment settings (#1268)', () => {
  it('resolves the limits, a style over the book', async () => {
    const { resolveExercisesConfig, resolveExerciseStylesConfig, assessmentLimitsOf } = await import('../../defaults/exercises.js');
    const book = resolveExercisesConfig({ digital: { maxChecks: 2.7, maxResets: -1, showSolution: 'afterCheck', passingScore: 140 } }, 'en');
    expect(book.digital).toMatchObject({ maxChecks: 2, reset: true, maxResets: 0, showSolution: 'afterCheck', passingScore: 100 });
    const [practice, test] = resolveExerciseStylesConfig([{ id: 'exercise' }, { id: 'test', digital: { maxChecks: 1, reset: false, showSolution: 'never' } }], 'en');
    expect(assessmentLimitsOf(practice!, book)).toEqual({ maxChecks: 2, reset: true, maxResets: 0, showSolution: 'afterCheck' });
    expect(assessmentLimitsOf(test!, book)).toEqual({ maxChecks: 1, reset: false, maxResets: 0, showSolution: 'never' });
    expect(resolveExercisesConfig(undefined, 'es').words.checkLeft).toBe('Comprobar (quedan {n})');
  });

  it('gives the digital outputs the limits of the styles that have any, and the pass mark', async () => {
    const { exerciseDigitalOf } = await import('../../exercises/digital.js');
    const { exerciseSettingsOf } = await import('../../defaults/exercises.js');
    const digital = exerciseDigitalOf(exerciseSettingsOf({
      exercises: { digital: { passingScore: 60 } },
      exerciseStyles: [{ id: 'exercise' }, { id: 'test', digital: { maxChecks: 1 } }],
    }, 'en'));
    expect(digital.passingScore).toBe(60);
    expect(digital.styles.exercise!.limits).toBeUndefined();
    expect(digital.styles.test!.limits).toEqual({ maxChecks: 1, reset: true, maxResets: 0, showSolution: 'always' });
  });

  it('checks the keys and words, and keeps only what differs from the defaults', () => {
    expect(warnings({ exercises: { digital: { maxChecks: 1, reset: false, maxResets: 2, showSolution: 'afterCheck', passingScore: 50 } }, exerciseStyles: [{ id: 'x', digital: { maxChecks: 1, showSolution: 'noChecksLeft' } }] })).toEqual([]);
    const found = warnings({ exercises: { digital: { showSolution: 'later' as never } }, exerciseStyles: [{ id: 'x', digital: { maxCheck: 1 } as never }] });
    expect(found.map((w) => [w.kind, w.path])).toEqual([
      ['unknownConfigKey', 'exerciseStyles[0].digital.maxCheck'],
      ['unknownConfigValue', 'exercises.digital.showSolution'],
    ]);
    expect(stripExercisesDefaults({ digital: { maxChecks: 0, reset: true, maxResets: 0, showSolution: 'always', passingScore: 0 } })).toBeUndefined();
    expect(stripExercisesDefaults({ digital: { maxChecks: 3, reset: false, passingScore: 70 } })).toEqual({ digital: { maxChecks: 3, reset: false, passingScore: 70 } });
  });
});
