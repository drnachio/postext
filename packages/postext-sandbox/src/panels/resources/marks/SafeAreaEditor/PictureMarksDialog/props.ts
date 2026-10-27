'use client';

// What the picture marks dialog is given.
import type { Resource, LabelStyle } from 'postext';
import type { PictureMarks } from '../../pictureMarks.js';
import type { MarkdownLabel } from '../../figureLabels.js';
import type { AnchorEditorRequest } from '../../anchorEditorRequest.js';
import type { Mode } from '../../SafeAreaEditor.js';

export interface PictureMarksDialogProps {
  open: boolean;
  initialMode: Mode;
  url: string;
  resource: Resource;
  withLettering: boolean;
  labelStyles: readonly LabelStyle[];
  /** The book's `::label` lines of this picture (#866). */
  figureLabels: readonly MarkdownLabel[];
  /** What opened the Anchors mode from elsewhere: an anchor to pick, a
   *  name to place. */
  request: AnchorEditorRequest | null;
  onClose: () => void;
  onSave: (marks: PictureMarks) => void;
}
