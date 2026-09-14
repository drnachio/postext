'use client';

import { SANDBOX_CSS } from './styles';

/** Mounts the sandbox's global CSS once. Rendered by the `PostextSandbox`
 *  root so every keyframe and popup transition is available in any host. */
export function SandboxGlobalStyles() {
  return <style data-postext-styles="">{SANDBOX_CSS}</style>;
}
