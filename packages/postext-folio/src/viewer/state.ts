// The running state of the folio viewer its modules share (#1276).
import type { FolioLabels, FolioPage, FolioAppearance, FolioInteraction, FolioPageSize, FolioPageVideo, FolioPagePoint } from './types.js';
import type { Spread } from '../spreads.js';
import { PageFlipper, type PageSource } from '../pageFlip.js';

/** The bindings the folio viewer reassigns and more than one of its modules
 *  reads or writes: fields of one object. */
export interface FolioViewerState {
  labels: FolioLabels;
  pages: FolioPage[];
  firstPageRecto: boolean;
  binding: "left" | "right";
  mode: "auto" | "single" | "double";
  paper: string;
  appearance: FolioAppearance;
  appearanceKey: string;
  interaction: FolioInteraction;
  single: boolean;
  spreads: Spread[];
  current: number;
  shown: number;
  flipper: PageFlipper | null;
  flipCanvas: HTMLCanvasElement | null;
  holding: ((click: boolean) => void) | null;
  press: { x: number; y: number } | null;
  swipe: { x: number; y: number } | null;
  disposed: boolean;
  slot: FolioPageSize;
  pageVideos: FolioPageVideo[];
  pressPoint: FolioPagePoint | null;
  lensAt: { x: number; y: number } | null;
  lensZoom: number | null;
  details: Map<PageSource, PageSource>;
  detailAsked: Map<PageSource, number>;
  detailTimer: number;
}

/** What a module of the folio viewer calls before the viewer has made it:
 *  filled as soon as each one exists. */
export interface FolioViewerLate {
  placeDomVideo: () => void;
  lensOf: (at: { x: number; y: number; }) => { x: number; y: number; radius: number; rim: number; zoom: number; };
  raiseLens: () => void;
  hideLens: () => void;
  zoomBy: (factor: number) => void;
  scheduleDetail: (delay: number) => void;
  onPage: (event: PointerEvent) => boolean;
  leftToHost: () => boolean;
  aimedPageAt: (event: { clientX: number; clientY: number; pointerType?: string; }) => FolioPagePoint | null;
}
