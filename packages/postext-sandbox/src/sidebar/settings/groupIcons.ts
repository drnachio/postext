import { BookMarked, BookOpen, Columns2, FileDown, Heading, Image, Languages, List, MessageCircle, Palette, PanelTop, PencilLine, Pilcrow, SquareMenu, Wrench, WrapText, type LucideIcon } from 'lucide-react';
import type { SettingsGroupId } from '../sections/registry.js';

export const GROUP_ICONS: Record<SettingsGroupId, LucideIcon> = {
  page: Columns2,
  writing: Languages,
  colors: Palette,
  text: Pilcrow,
  composition: WrapText,
  headings: Heading,
  lists: List,
  figures: Image,
  callouts: SquareMenu,
  exercises: PencilLine,
  comics: MessageCircle,
  running: PanelTop,
  parts: BookMarked,
  output: FileDown,
  folio: BookOpen,
  advanced: Wrench,
};
