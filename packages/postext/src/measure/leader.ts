/**
 * Leaders: a character (or a short text) repeated over a room, flush with
 * the room's end so the leaders of several lines line up. The contents'
 * rows (`pipeline/toc.ts`) and the tab stops of body text (#622,
 * `measure/tabs.ts`) both fit theirs here.
 */

/**
 * The leader run for `room` px: `char` repeated as often as one repeat's
 * width allows, or fewer times when the run, measured as a whole, is wider
 * than the room. A face may kern the character against itself: Public Sans
 * 700 sets one full stop 6.74 px wide at 25 px and a run of thirty at 7.58
 * px a dot, and a leader counted from one dot then ran over the gap into
 * the page number (EF-148). `widthOf` measures a run as it is painted (the
 * leader's face, its tracking). Null when not one fits.
 */
export function fitLeader(char: string, room: number, widthOf: (text: string) => number): { text: string; width: number } | null {
  if (char.length === 0 || !(room > 0)) return null;
  const unit = widthOf(char);
  const most = unit > 0 ? Math.floor(room / unit) : 0;
  if (most <= 0) return null;
  // Rounding in the width sums is not an overrun.
  const fits = (width: number) => width <= room + 0.01;
  const runOf = (n: number) => widthOf(char.repeat(n));
  let width = runOf(most);
  if (fits(width)) return { text: char.repeat(most), width };
  // The longest shorter run that fits (a run widens with every character).
  let lo = 0;
  let hi = most - 1;
  let loWidth = 0;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    width = runOf(mid);
    if (fits(width)) {
      lo = mid;
      loWidth = width;
    } else {
      hi = mid - 1;
    }
  }
  return lo > 0 ? { text: char.repeat(lo), width: loWidth } : null;
}
