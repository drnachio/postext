/** Screens whose short side is below this (CSS px) are phones: the folio's
 *  WebGL book (three.js, a texture per page side) takes more memory than
 *  their browsers give a tab, and the tab reloads (#345). */
const MIN_SHORT_SIDE = 600;

let cached: boolean | null = null;

function hasWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    // Give the probe's context back at once: phones hold only a few.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Whether the Folio view is offered: WebGL2 is there and the screen is not
 *  a phone's. The screen (not the window) is measured, so a narrow desktop
 *  window keeps it; its short side, so turning a phone does not bring it
 *  in. Settled once per page. */
export function folioSupported(): boolean {
  if (typeof window === 'undefined') return true;
  if (cached === null) {
    const { width, height } = window.screen;
    cached = Math.min(width, height) >= MIN_SHORT_SIDE && hasWebGL2();
  }
  return cached;
}
