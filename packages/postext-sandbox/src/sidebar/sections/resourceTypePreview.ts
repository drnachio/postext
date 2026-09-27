import type { NumberFormatStyle, ResourceCounterFormat, ResourceType } from 'postext';
import { formatNumeral, parseNumberFormat } from 'postext';

/** The resource spelling of each numeral style: `counterFormat` says
 *  `roman-lower` where page labels say `lower-roman`. */
const RESOURCE_COUNTER_FORMATS: Record<NumberFormatStyle, ResourceCounterFormat> = {
  decimal: 'decimal',
  'lower-roman': 'roman-lower',
  'upper-roman': 'roman-upper',
  'lower-alpha': 'alpha-lower',
  'upper-alpha': 'alpha-upper',
};

/** A type's `counterFormat` in the resource spelling, read as the engine
 *  reads it: any spelling of a format (`lower-roman`, `arabic`, `i`…), and
 *  an unknown value counts in decimal. What the counter-format select shows,
 *  so a preset written with another setting's spelling still selects its
 *  option. */
export function resourceCounterFormat(format: unknown): ResourceCounterFormat {
  return RESOURCE_COUNTER_FORMATS[parseNumberFormat(format) ?? 'decimal'];
}

/** Sample heading numbers used solely to render the live preview. */
const PREVIEW_HEADING: Record<string, number> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

/** Render a sample number for a type using a fixed sample counter (7) and the
 *  sample heading context above. Mirrors the runtime template syntax (`{n}`,
 *  `{h1}`..`{h6}`) but is intentionally lightweight for preview purposes. */
function renderPreviewNumber(type: ResourceType): string {
  const style = parseNumberFormat(type.counterFormat) ?? 'decimal';
  return type.numberingTemplate.replace(/\{([^}]+)\}/g, (_match, body: string) => {
    const key = body.trim();
    if (key === 'n') return formatNumeral(7, style);
    const h = PREVIEW_HEADING[key];
    if (h !== undefined) return formatNumeral(h, 'decimal');
    return _match;
  });
}

/** Builds the full preview string, e.g. "Fig. 1.7" or "Figure 1.7". */
export function renderResourceTypePreview(type: ResourceType): string {
  const number = renderPreviewNumber(type);
  const prefix = type.shortLabel || type.captionPrefix || type.name;
  return [prefix, number].filter(Boolean).join(' ');
}
