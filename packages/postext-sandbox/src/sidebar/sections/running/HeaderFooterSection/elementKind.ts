import type { DesignElement } from 'postext';
import type { SandboxLabels } from '../../../../types/labels.js';

/** The kind of a design element in words (#1063: shapes and connectors
 *  too). */
export function elementKindLabel(labels: SandboxLabels, kind: DesignElement['kind']): string {
  switch (kind) {
    case 'text': return labels.headerFooterElementText;
    case 'rule': return labels.headerFooterElementRule;
    case 'image': return labels.headerFooterElementImage;
    case 'path': return labels.headerFooterElementPath;
    case 'connector': return labels.headerFooterElementConnector;
    default: return labels.headerFooterElementBox;
  }
}
