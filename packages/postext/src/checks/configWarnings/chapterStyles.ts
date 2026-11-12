// The settings a chapter style names that stay the book's (#1521): the
// style's chapters keep the book's value.
import type { PostextConfig } from '../../types.js';
import type { ConfigWarning } from '../../vdt.js';
import { bookSettingsOf } from '../../defaults/chapterStyles.js';

/** One `chapterStyleBookSetting` per book setting a chapter style sets. */
export function collectChapterStyleWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  (config.chapterStyles ?? []).forEach((style, i) => {
    for (const key of bookSettingsOf(style)) {
      out.push({ kind: 'chapterStyleBookSetting', path: `chapterStyles[${i}].config.${key}`, value: key, used: '' });
    }
  });
  return out;
}
