import { BookMarked, Columns2, FileDown, Heading, Image, List, Palette, PanelTop, Pilcrow, SquareMenu, Wrench, type LucideIcon } from 'lucide-react';
import type { SettingsGroupId } from '../sections/registry';

export const GROUP_ICONS: Record<SettingsGroupId, LucideIcon> = {
  page: Columns2,
  colors: Palette,
  text: Pilcrow,
  headings: Heading,
  lists: List,
  figures: Image,
  callouts: SquareMenu,
  running: PanelTop,
  parts: BookMarked,
  output: FileDown,
  advanced: Wrench,
};
