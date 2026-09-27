import type { FC } from 'react';
import type { PostextContent, PostextConfig } from './types';

/**
 * A React component that lays `content` out and shows its pages as canvases.
 *
 * @deprecated Import `createLayout` from `postext/react`, which takes
 * `className` / `style` props and needs no Suspense. This alias stays so
 * existing imports keep working, and it keeps React out of the main entry:
 * it loads the `postext/react` implementation when it is called, and the
 * component suspends (React renders it again) until that has arrived.
 * Rendered before then, it needs a concurrent root (`createRoot`) or a
 * `<Suspense>` boundary above it: in a legacy `ReactDOM.render` root, or in
 * `renderToString`, with no boundary, React reports an error instead.
 * Planned for removal in the next major version, which also makes `react`
 * an optional peer dependency (it stays required until then, so bundlers
 * can resolve this alias's lazy `postext/react` chunk).
 */
export function createLayout(content: PostextContent, config?: PostextConfig): FC {
  let Impl: FC | null = null;
  let failure: { error: unknown } | null = null;
  const loading = import('./react/createLayout').then(
    (m) => { Impl = m.createLayout(content, config) as FC; },
    (error: unknown) => { failure = { error }; },
  );

  const Layout: FC = () => {
    if (failure) throw failure.error;
    if (!Impl) throw loading;
    // Called as a function: its hooks belong to this component, and every
    // render from now on takes this same path.
    return Impl({});
  };

  Layout.displayName = 'PostextLayout';
  return Layout;
}
