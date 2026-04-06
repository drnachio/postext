import type { FC } from 'react';
import type { PostextContent, PostextConfig } from './types';

export function createLayout(
  _content: PostextContent,
  _config?: PostextConfig,
): FC {
  const Layout: FC = () => null;
  Layout.displayName = 'PostextLayout';
  return Layout;
}
