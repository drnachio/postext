/** The name type designers give a weight (CSS `font-weight`, OpenType
 *  `usWeightClass`), for the hundreds; none for a value between two, which
 *  only a variable face has. Not translated: they are the names the font
 *  files themselves carry. */
export function fontWeightName(weight: number): string | undefined {
  switch (weight) {
    case 100: return 'Thin';
    case 200: return 'ExtraLight';
    case 300: return 'Light';
    case 400: return 'Regular';
    case 500: return 'Medium';
    case 600: return 'SemiBold';
    case 700: return 'Bold';
    case 800: return 'ExtraBold';
    case 900: return 'Black';
    default: return undefined;
  }
}
