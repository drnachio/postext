import { useDirection } from '@base-ui/react/direction-provider';

/** Languages whose interface runs right to left. */
const RTL_LANGUAGES = new Set(['ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'iw', 'ks', 'ku', 'ps', 'sd', 'ug', 'ur', 'yi']);

/** The direction of the interface in `locale` (a BCP 47 tag, `ar`,
 *  `ar-EG`, `fa-IR`…): right to left for Arabic, Hebrew, Persian, Urdu…;
 *  left to right otherwise, and when no locale is given. */
export function uiDirectionOf(locale: string | undefined): 'ltr' | 'rtl' {
  const language = locale?.toLowerCase().split(/[-_]/)[0];
  return language && RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
}

/** Whether the sandbox interface runs right to left (the direction the
 *  root's `DirectionProvider` gives Base UI). The page previews do not
 *  follow it: a book carries its own direction. */
export function useUiRtl(): boolean {
  return useDirection() === 'rtl';
}
