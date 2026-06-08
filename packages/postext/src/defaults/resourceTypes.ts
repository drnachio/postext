import type { ResourceType } from '../types';

/** Built-in resource types provided when a config does not define its own.
 *  Both reset their counter on every `h1` and number as `{h1}.{n}` (e.g.
 *  "Figure 2.3"), using decimal counters. New objects are returned on every
 *  call so callers may freely mutate the result. */
export function defaultResourceTypes(): ResourceType[] {
  return [
    {
      id: 'figure',
      name: 'Figure',
      namePlural: 'Figures',
      shortLabel: 'Fig.',
      numberingTemplate: '{h1}.{n}',
      resetOn: 'h1',
      counterFormat: 'decimal',
      captionPrefix: 'Figure',
    },
    {
      id: 'table',
      name: 'Table',
      namePlural: 'Tables',
      shortLabel: 'Tab.',
      numberingTemplate: '{h1}.{n}',
      resetOn: 'h1',
      counterFormat: 'decimal',
      captionPrefix: 'Table',
    },
  ];
}
