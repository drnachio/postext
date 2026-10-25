// The package's manifest (`imsmanifest.xml`, #1265): the organization the
// LMS shows, mirroring the items picked, one resource per SCO (its launch
// page and documents) and one shared resource (styles, fonts, pictures,
// scripts) every SCO depends on.
//
// SCORM 1.2 carries the passing score as each SCO's `adlcp:masteryscore`.
// SCORM 2004 carries it as each SCO's primary objective, satisfied by
// measure, and weights each SCO's measure by its graded slots (over the
// largest SCO's: the schema keeps weights between 0 and 1), so the course's
// score is every right slot over every graded slot.

import type { ScormItem, ScormVersion } from './types.js';

export interface ManifestSco {
  /** Its item in the organization. */
  item: ScormItem;
  /** Launch page and the files only it uses, from the package root. */
  href: string;
  files: string[];
  /** Its exercises' graded slots. */
  points: number;
}

export interface ManifestInput {
  version: ScormVersion;
  identifier: string;
  title: string;
  language: string;
  items: ScormItem[];
  /** The SCO of each leaf item. */
  scoOf: (item: ScormItem) => ManifestSco | undefined;
  /** The shared files. */
  shared: string[];
  /** The passing score as a fraction, when set. */
  passing?: number;
}

const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** An XML NCName from any text. */
export function ncName(s: string): string {
  const n = s.replace(/[^A-Za-z0-9_.-]/g, '-');
  return /^[A-Za-z_]/.test(n) ? n : `id-${n}`;
}

const fmt = (n: number): string => String(Math.round(n * 10000) / 10000);

export function manifestXml(input: ManifestInput): string {
  const v2004 = input.version === '2004';
  const scos: ManifestSco[] = [];
  let n = 0;
  const leaves = (list: ScormItem[]): ScormItem[] => list.flatMap((i) => (i.children ? leaves(i.children) : [i]));
  const most = Math.max(0, ...leaves(input.items).map((i) => input.scoOf(i)?.points ?? 0));
  const itemXml = (item: ScormItem, depth: number): string => {
    const pad = '  '.repeat(depth + 3);
    const id = `item-${++n}`;
    const title = `${pad}  <title>${xml(item.title)}</title>\n`;
    if (item.children) {
      return `${pad}<item identifier="${id}">\n${title}${item.children.map((c) => itemXml(c, depth + 1)).join('')}${pad}</item>\n`;
    }
    const sco = input.scoOf(item);
    if (!sco) return '';
    scos.push(sco);
    const res = `res-${scos.length}`;
    let extra = '';
    if (v2004) {
      const objective = input.passing !== undefined && sco.points > 0
        ? `${pad}    <imsss:objectives>\n${pad}      <imsss:primaryObjective objectiveID="${id}-score" satisfiedByMeasure="true">\n${pad}        <imsss:minNormalizedMeasure>${fmt(input.passing)}</imsss:minNormalizedMeasure>\n${pad}      </imsss:primaryObjective>\n${pad}    </imsss:objectives>\n`
        : '';
      extra = `${pad}  <imsss:sequencing>\n${pad}    <imsss:rollupRules objectiveMeasureWeight="${most > 0 ? fmt(sco.points / most) : 1}"/>\n${objective}${pad}  </imsss:sequencing>\n`;
    } else if (input.passing !== undefined && sco.points > 0) {
      extra = `${pad}  <adlcp:masteryscore>${Math.round(input.passing * 100)}</adlcp:masteryscore>\n`;
    }
    return `${pad}<item identifier="${id}" identifierref="${res}"${v2004 ? '' : ' isvisible="true"'}>\n${title}${extra}${pad}</item>\n`;
  };
  const items = input.items.map((i) => itemXml(i, 0)).join('');
  const scormType = v2004 ? 'adlcp:scormType' : 'adlcp:scormtype';
  const files = (list: string[], pad: string): string => list.map((f) => `${pad}<file href="${xml(f)}"/>\n`).join('');
  const resources =
    scos.map((sco, i) =>
      `    <resource identifier="res-${i + 1}" type="webcontent" ${scormType}="sco" href="${xml(sco.href)}">\n` +
      files([sco.href, ...sco.files], '      ') +
      `      <dependency identifierref="shared"/>\n` +
      `    </resource>\n`).join('') +
    `    <resource identifier="shared" type="webcontent" ${scormType}="asset">\n${files(input.shared, '      ')}    </resource>\n`;
  const head = v2004
    ? `<manifest identifier="${xml(input.identifier)}" version="1.0"\n` +
      `  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"\n` +
      `  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"\n` +
      `  xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3"\n` +
      `  xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3"\n` +
      `  xmlns:imsss="http://www.imsglobal.org/xsd/imsss"\n` +
      `  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n` +
      `  xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd http://www.adlnet.org/xsd/adlseq_v1p3 adlseq_v1p3.xsd http://www.adlnet.org/xsd/adlnav_v1p3 adlnav_v1p3.xsd http://www.imsglobal.org/xsd/imsss imsss_v1p0.xsd">\n` +
      `  <metadata>\n    <schema>ADL SCORM</schema>\n    <schemaversion>2004 4th Edition</schemaversion>\n  </metadata>\n`
    : `<manifest identifier="${xml(input.identifier)}" version="1.0"\n` +
      `  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"\n` +
      `  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"\n` +
      `  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n` +
      `  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">\n` +
      `  <metadata>\n    <schema>ADL SCORM</schema>\n    <schemaversion>1.2</schemaversion>\n  </metadata>\n`;
  const orgSequencing = v2004 ? `      <imsss:sequencing>\n        <imsss:controlMode choice="true" flow="true"/>\n      </imsss:sequencing>\n` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n` + head +
    `  <organizations default="org">\n` +
    `    <organization identifier="org">\n` +
    `      <title>${xml(input.title)}</title>\n` +
    items.replace(/^ {6}/gm, '      ') +
    orgSequencing +
    `    </organization>\n` +
    `  </organizations>\n` +
    `  <resources>\n${resources}  </resources>\n` +
    `</manifest>\n`;
}
