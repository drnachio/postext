// The designer's words for the design's layers and items.

import type { SandboxLabels } from '../../types/labels.js';
import type { DesignerItem, DesignerLayer } from './designerModel.js';

export const LAYER_LABEL: Record<DesignerLayer, keyof SandboxLabels> = {
  elements: 'coverLayerElements',
  textBoxes: 'coverLayerTexts',
  effects: 'coverLayerEffects',
  logos: 'coverLayerLogos',
  finishes: 'coverLayerFinishes',
};

const KIND_LABEL: Record<DesignerItem['kind'], keyof SandboxLabels> = {
  text: 'coverKindText',
  image: 'coverKindPicture',
  box: 'coverKindBox',
  shape: 'coverKindShape',
  varnish: 'coverFinishVarnish',
  foil: 'coverFinishFoil',
  emboss: 'coverFinishEmboss',
  deboss: 'coverFinishDeboss',
};

export const kindLabel = (labels: SandboxLabels, item: Pick<DesignerItem, 'kind'>): string => String(labels[KIND_LABEL[item.kind]]);
