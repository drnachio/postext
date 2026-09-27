import { describe, expect, it } from 'vitest';
import type { ResourceType } from 'postext';
import { renderResourceTypePreview, resourceCounterFormat } from './resourceTypePreview';

const plate = (counterFormat: string): ResourceType => ({
  id: 'plate',
  name: 'Plate',
  shortLabel: 'Pl.',
  numberingTemplate: '{h1}.{n}',
  resetOn: 'h1',
  // Presets are JSON: any spelling the engine reads can reach the panel.
  counterFormat: counterFormat as ResourceType['counterFormat'],
  captionPrefix: 'Plate',
});

// EF-12: the engine reads every spelling of a counter format; the Resource
// types panel must show the same number and select the same option.
describe('resource type counter format in the panel', () => {
  it('previews another setting’s spelling as the engine numbers it', () => {
    expect(renderResourceTypePreview(plate('roman-lower'))).toBe('Pl. 1.vii');
    expect(renderResourceTypePreview(plate('lower-roman'))).toBe('Pl. 1.vii');
    expect(renderResourceTypePreview(plate('i'))).toBe('Pl. 1.vii');
    expect(renderResourceTypePreview(plate('upper-latin'))).toBe('Pl. 1.G');
    expect(renderResourceTypePreview(plate('arabic'))).toBe('Pl. 1.7');
    // Unknown: decimal, as the engine counts it.
    expect(renderResourceTypePreview(plate('roman'))).toBe('Pl. 1.7');
  });

  it('selects the resource spelling of the format', () => {
    expect(resourceCounterFormat('lower-roman')).toBe('roman-lower');
    expect(resourceCounterFormat('I')).toBe('roman-upper');
    expect(resourceCounterFormat('lower-latin')).toBe('alpha-lower');
    expect(resourceCounterFormat('UPPER-ALPHA')).toBe('alpha-upper');
    expect(resourceCounterFormat('arabic')).toBe('decimal');
    expect(resourceCounterFormat('alpha-upper')).toBe('alpha-upper');
    expect(resourceCounterFormat('roman')).toBe('decimal');
    expect(resourceCounterFormat(undefined)).toBe('decimal');
  });
});
