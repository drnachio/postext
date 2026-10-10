// ═══ Postext Cookbook · Nº 001 · Textbook with a margin column ═══════════════════
// https://postext.dev/en/cookbook/textbook-margin-column
// Code: MIT · Text: original (CC BY 4.0) · Diagrams: generated in code (CC BY 4.0)
// Fonts: Merriweather, Merriweather Sans (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// A chapter of a physics textbook in the column-and-a-half layout: the body text keeps to
// the main column, and the outer margin is a channel for diagrams, captions and glosses.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, defaultResourceTypes,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'textbook-margin-column';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: semantic colours, each linked by id and written out in hex
const palette = {
  ink: '#1a222d', // text, and the dark panels of figures 4.1, 4.4 and 4.5
  accent: '#17774f', // the only accent colour: numerals, folios, section headings, labels
  ray: '#f2a516', // light rays in every diagram
  glass: '#cfe6dd', // glass in the diagrams
  tint: '#edf5f1', // the key-term glosses and the light plate of a construction diagram
  muted: '#5b6863', // running heads, the normals in the diagrams, the colophon
  paper: '#ffffff',
};
// A colour carries its id and its hex. The diagrams read `palette` as well, so retint the
// chapter by editing it: the text, the designs and the drawings change together.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': point it at the accent, so nothing prints blue.
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
// The page in mm, named once: the channel, the opener and the running heads derive from it.
const [TRIM_W, TRIM_H] = [210, 275];
const [TOP, BOTTOM, INNER, OUTER] = [24, 22, 20, 14]; // inner and outer swap on a verso
const LEAD = 13.5; // body leading in pt
const [SERIF, SANS] = ['Merriweather', 'Merriweather Sans'];

// #region answer: a float-only channel on the outer edge, and what goes into it
const layout = {
  layoutType: 'oneAndHalf', // a wide main column and a narrow side column
  sideColumnPercent: 30, // of the 176 mm content width: a 52.8 mm channel
  sideColumnRole: 'floats', // no body text: side figures, side captions and side boxes only
  sideColumnSide: 'outer', // right on a recto, left on a verso (the margins are mirrored)
  gutterWidth: mm(7), // the text column keeps the rest: 176 − 52.8 − 7 = 116 mm
};
// A figure placed with span 'side' stacks in the channel from the head of the page that cites it,
// under the numeral on a chapter's first page.
const side = { span: 'side' };
// A figure left in the text column (the default span) sets its caption in the channel beside
// it; page-wide floats ignore captionSide and keep theirs underneath.
const resourceTypes = defaultResourceTypes(LANG).map((type) => (type.id !== 'figure' ? type
  : { ...type, defaultPlacement: { captionSide: true } })); // the built-in types, in LANG
// A box fenced :::callout{type="term" span="side"} leaves the flow and lands in the channel at the
// height the text has reached: fence each gloss before the paragraph it should stand beside.
// #endregion
// The channel's width, the measure of everything the opener and the heads set in it: 52.8 mm.
const CHANNEL = ((TRIM_W - INNER - OUTER) * layout.sideColumnPercent) / 100;

// The channel's own type, and the two boxes that stand in it.
const label = { fontFamily: SANS, fontSize: pt(7.5), fontWeight: 700, letterSpacing: pt(1.2),
  textTransform: 'uppercase', color: col('accent') };
// A box's text takes the body's ink for text, bold and italic; only face, size and setting change.
const note = { fontFamily: SANS, fontSize: pt(8), lineHeight: pt(11.25), textAlign: 'left',
  firstLineIndent: pt(0) };
const calloutStyles = [
  { id: 'panel', backgroundEnabled: false, // objectives and key ideas; each fence names its title
    padding: { top: mm(2.6), right: pt(0), bottom: pt(0), left: pt(0) },
    stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('accent') },
    titleStyle: { ...label, gap: mm(2) }, body: note, marginTop: pt(0), marginBottom: pt(LEAD),
    lists: { color: col('accent'), indent: mm(3), itemSpacing: pt(3) } },
  { id: 'term', title: t({ en: 'Key term', es: 'Término clave' }), background: col('tint'),
    padding: { top: mm(2.6), right: mm(3), bottom: mm(3), left: mm(3) },
    titleStyle: { ...label, gap: mm(1.2) }, body: note, marginTop: pt(0), marginBottom: pt(LEAD) },
];

// #region opener: the title in the main column, the chapter number standing in the channel
// Every element counts toward the opener's depth, the page-anchored numeral too (gotcha:
// opener-reserves-anchored). minHeight fixes that depth at nine lines of the grid, room for a
// one-line title, the rule and a four-line standfirst (41.2 mm), so the text starts on the same
// line in every such chapter, however short its standfirst and even with a smaller numeral. Kicker
// and numeral (40.6 mm) reach the ninth line too; a deeper opener grows past it, line by line.
const [KICKER, NUMERAL] = [8, 104]; // pt
const opener = {
  enabled: true,
  minHeight: pt(LEAD * 9), // 42.9 mm: the text starts on the eleventh line, after marginBottom
  slot: {
    elements: [
      { kind: 'text', id: 'title', content: '{titleText}', fontFamily: SANS, fontWeight: 800,
        fontSize: pt(32), lineHeight: 1.05, color: col('ink'), align: 'left', overflow: 'wrap',
        placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } } },
      { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1), color: col('accent'),
        placement: { anchor: { to: '#title', edge: 'below' }, offset: { y: mm(4) },
          size: { width: 'fill' } } },
      { kind: 'text', id: 'lead', content: '{attr.lead}', fontFamily: SERIF, italic: true,
        fontSize: pt(10.5), lineHeight: 1.45, color: col('ink'), align: 'left', overflow: 'wrap',
        placement: { anchor: { to: '#rule', edge: 'below' }, offset: { y: mm(3.5) },
          size: { width: 'fill' } } },
      // The kicker hangs from the page's top-right corner, not from the heading: the channel lies
      // outside the heading's column, and on the right only on a recto (so chapters open on one).
      // The numeral hangs from the kicker.
      { kind: 'text', id: 'kicker', content: t({ en: 'Chapter', es: 'Capítulo' }), ...label,
        fontSize: pt(KICKER), align: 'left', placement: { anchor: { to: 'page', edge: 'top-right' },
          offset: { x: mm(-OUTER), y: mm(TOP) }, size: { width: mm(CHANNEL) } } },
      { kind: 'text', id: 'numeral', content: '{chapterNumber}', fontFamily: SANS, fontWeight: 800,
        fontSize: pt(NUMERAL), lineHeight: 1, color: col('accent'), align: 'left',
        placement: { anchor: { to: '#kicker', edge: 'below' }, offset: { y: mm(0.5) },
          size: { width: mm(CHANNEL) } } },
    ],
  },
};
// #endregion

// #region heads: book title on the verso, chapter on the recto, folios on the outer edge
const [HEAD_Y, FOOT_Y, HEAD_GAP] = [12.5, -12, 9]; // mm from the top and bottom trim; folio to head
// A text on the physical page: edge picks the corner, x and y are its offsets in mm.
const head = ({ edge, x, y = HEAD_Y, ...text }) => ({
  kind: 'text', pages: 'body', ...label, color: col('muted'), ...text,
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(y) } },
});
const folio = { content: '{pageNumber}', fontSize: pt(8.5), letterSpacing: pt(0),
  color: col('accent') };
const verso = { parity: 'even', edge: 'top-left' }; // x counts in from the left edge
const recto = { parity: 'odd', edge: 'top-right' }; // x counts back from the right edge
const header = { elements: [
  head({ id: 'verso-folio', ...verso, ...folio, x: OUTER }),
  head({ id: 'verso-title', ...verso, content: '{title}', x: OUTER + HEAD_GAP }),
  head({ id: 'recto-title', ...recto, x: -(OUTER + HEAD_GAP),
    content: t({ en: 'Chapter {chapterNumber} · {chapterTitle}',
      es: 'Capítulo {chapterNumber} · {chapterTitle}' }) }),
  head({ id: 'recto-folio', ...recto, ...folio, x: -OUTER }),
] };
// A chapter's first page, always a recto, carries a drop folio at the foot of the channel instead.
const footer = { elements: [
  head({ id: 'drop-folio', ...recto, ...folio, pages: 'opener', edge: 'bottom-right', x: -OUTER,
    y: FOOT_Y }),
] };
// #endregion

const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }), // each edition's hyphenation patterns
  resourceTypes,
  colorPalette,
  page: { width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150, margins: { top: mm(TOP),
    bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER), mirror: true } }, // left: recto's inner
  layout,
  bodyText: { // hyphenation, optimal line breaking and widow control are on by default
    fontFamily: SERIF, fontWeight: 300, fontSize: pt(9.3), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('accent'),
    referenceBold: false, textAlign: 'justify', firstLineIndent: mm(4), indentAfterHeading: false },
  headings: {
    fontFamily: SANS, color: col('ink'), fontWeight: 800,
    levels: [
      // 'odd': kicker, numeral and drop folio sit at the right edge, the outer one only on a recto.
      // The heading stays in the main column; its design draws it.
      { level: 1, breakBefore: { enabled: true, parity: 'odd' }, marginBottom: pt(LEAD),
        advancedDesign: opener },
      { level: 2, fontSize: pt(13), lineHeight: pt(LEAD), numberingTemplate: '{1}.{2}',
        color: col('accent'), marginTop: pt(LEAD * 1.5), marginBottom: pt(0) },
    ],
  },
  headingStyles: [{ id: 'plain', numbered: false }], // ## Questions {style="plain"}
  orderedLists: { numberFormat: 'arabic', // the default, written out: 'decimal' prints 'undefined'
    fontFamily: SANS, fontWeight: 800, color: col('accent'), marginTop: pt(0),
    marginBottom: pt(0) },
  calloutStyles,
  captionStyle: { fontFamily: SANS, fontSize: pt(7.6), labelColor: col('accent'), gap: mm(2) },
  paragraphStyles: [{ id: 'aside', firstLineIndent: pt(0), marginTop: pt(LEAD * 0.5) },
    { id: 'colophon', fontFamily: SANS, fontSize: pt(6.8), lineHeight: pt(9),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// The diagrams are drawn without lettering: their captions carry the labels.
const captions = {
  'burning-glass': {
    en: 'A burning glass. A converging lens bends parallel rays of sunlight so that they all '
      + 'meet at one point, the focus, where a card begins to scorch.',
    es: 'Una lupa al sol. Una lente convergente desvía los rayos paralelos de luz para que '
      + 'coincidan en un punto, el foco, donde una cartulina empieza a quemarse.' },
  'refraction': {
    en: 'Entering glass, a ray bends towards the normal (dashed): the angle of refraction (green) '
      + 'is less than the angle of incidence (amber).',
    es: 'Al entrar en el vidrio, el rayo se acerca a la normal (a trazos): el ángulo de refracción '
      + '(verde) es menor que el de incidencia (ámbar).' },
  'critical-angle': {
    en: 'Rays aimed at the centre of a semicircular block. At 25° the ray escapes, bent away '
      + 'from the normal; at 58°, past the critical angle, all of it is reflected.',
    es: 'Rayos dirigidos al centro de un bloque semicircular. A 25° el rayo sale, alejándose de '
      + 'la normal; a 58°, pasado el ángulo límite, se refleja por completo.' },
  'fibre': {
    en: 'An optical fibre. Light meets the wall of the core at more than the critical angle, '
      + 'so it is totally reflected each time and cannot leak out.',
    es: 'Una fibra óptica. La luz incide en la pared del núcleo con un ángulo mayor que el límite, '
      + 'así que se refleja por completo cada vez y no puede escaparse por el camino.' },
  'prism': {
    en: 'Dispersion. The prism bends every colour towards its base, red least and violet most '
      + '(the spread is exaggerated).',
    es: 'Dispersión. El prisma desvía todos los colores hacia su base: el rojo, menos, y el '
      + 'violeta, más (la separación está exagerada).' },
  'principal-rays': {
    en: 'The three principal rays from the tip of an object beyond 2F meet at the tip of a real, '
      + 'inverted, smaller image (green). Dots mark the foci F; open circles, the points 2F.',
    es: 'Los tres rayos principales que parten de la punta de un objeto situado más allá de 2F se '
      + 'cortan en la punta de una imagen real, invertida y menor (verde). Los puntos marcan los '
      + 'focos F, y los círculos, los puntos 2F.' },
  'diverging': {
    en: 'A diverging lens. Parallel rays leave as if they came from the focus in front of the '
      + 'lens (dashed lines), so the image is virtual.',
    es: 'Una lente divergente. Los rayos paralelos salen como si vinieran del foco situado delante '
      + 'de la lente (líneas a trazos), así que la imagen es virtual.' },
};

// #region art: seven diagrams drawn in code: amber rays, green glass, no text
const f1 = (n) => Math.round(n * 10) / 10;
const pts = (list) => list.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L');
const svg = (width, height, body) => ({ width, height, markup: '<svg '
  + `xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `
  + `viewBox="0 0 ${width} ${height}">${body}</svg>` });
const stroke = (list, color, width, extra = '') => `<path d="M${pts(list)}" fill="none" `
  + `stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`
  + `${extra}/>`;
const shape = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const deg = (a) => (a * Math.PI) / 180; // degrees to radians
// An arrowhead is a path, never a <marker> (gotcha: svg-no-marker-filters).
const tip = ([x, y], [dx, dy], color, s = 12) => {
  const l = Math.hypot(dx, dy);
  const [u, v] = [dx / l, dy / l];
  return shape(`M${pts([[x + u * s, y + v * s], [x - v * s * 0.5, y + u * s * 0.5],
    [x + v * s * 0.5, y - u * s * 0.5]])}Z`, color);
};
// A ray through its points, with an arrowhead halfway along the first segment.
const ray = (list, color = palette.ray, width = 3, at = 0.5) => {
  const [[x0, y0], [x1, y1]] = list;
  return stroke(list, color, width) + tip([x0 + (x1 - x0) * at, y0 + (y1 - y0) * at],
    [x1 - x0, y1 - y0], color, width * 4);
};
const dot = (x, y, r, fill, extra = '') => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" `
  + `fill="${fill}"${extra}/>`;
const lens = (x, top, bottom, bulge, fill, line, width = 2.5, extra = '') => {
  const mid = (top + bottom) / 2;
  return shape(`M${x} ${top}Q${x + bulge} ${mid} ${x} ${bottom}Q${x - bulge} ${mid} ${x} ${top}Z`,
    fill, ` stroke="${line}" stroke-width="${width}"${extra}`);
};

// 4.1 · A burning glass on a dark panel: the Sun, seven parallel rays, the focus on a card.
function burningGlass() {
  const [W, H, LX, FX, AX] = [1162, 540, 470, 900, 270];
  const ys = [120, 170, 220, 270, 320, 370, 420];
  const cone = `M${LX} ${ys[0]}L${FX} ${AX}L${LX} ${ys[6]}Z`;
  return svg(W, H, `<rect width="${W}" height="${H}" fill="${palette.ink}"/>`
    + shape(cone, palette.ray, ' fill-opacity=".1"')
    + dot(-60, AX, 200, palette.ray) + dot(-60, AX, 150, palette.paper, ' fill-opacity=".2"')
    + ys.map((y) => ray([[200, y], [LX, y], [FX, AX]], palette.ray, 3, 0.55)).join('')
    + lens(LX, 60, 480, 80, palette.glass, palette.paper, 3, ' fill-opacity=".3"')
    + [34, 22, 13].map((r, i) => dot(FX, AX, r, palette.ray, ` fill-opacity="${0.12 + i * 0.14}"`))
      .join('')
    + dot(FX, AX, 6, palette.paper)
    + shape(`M${FX + 2} 150H${FX + 12}V390H${FX + 2}Z`, palette.paper, ' fill-opacity=".85"'));
}

// 4.2 · Refraction at an air-glass boundary: the ray bends towards the normal.
function refraction() {
  const [W, H, X, Y, L] = [528, 360, 250, 172, 250];
  const [si, ci] = [Math.sin(deg(50)), Math.cos(deg(50))];
  const sr = si / 1.52;
  const cr = Math.sqrt(1 - sr * sr);
  const wedge = (dy, ux, uy, color) => shape(`M${X} ${Y}L${X} ${Y + dy}A80 80 0 0 0 `
    + `${f1(X + ux * 80)} ${f1(Y + uy * 80)}Z`, color, ' fill-opacity=".45"');
  return svg(W, H, shape(`M0 ${Y}H${W}V${H}H0Z`, palette.glass)
    + stroke([[0, Y], [W, Y]], palette.ink, 2.5)
    + stroke([[X, 14], [X, H - 14]], palette.muted, 2, ' stroke-dasharray="10 8"')
    + wedge(-80, -si, -ci, palette.ray) + wedge(80, sr, cr, palette.accent)
    + ray([[X - si * L, Y - ci * L], [X, Y], [X + sr * 205, Y + cr * 205]]));
}

// 4.3 · A semicircular block: a shallow ray escapes, a steep one is totally reflected.
function criticalAngle() {
  const [W, H, X, Y, R] = [528, 372, 264, 110, 250];
  const inside = (a, len) => [X - Math.sin(deg(a)) * len, Y + Math.cos(deg(a)) * len];
  const out = Math.asin(1.52 * Math.sin(deg(25)));
  return svg(W, H, shape(`M${X - R} ${Y}A${R} ${R} 0 0 0 ${X + R} ${Y}Z`, palette.glass,
    ` stroke="${palette.ink}" stroke-width="2.5"`)
    + stroke([[X, 10], [X, Y + R - 10]], palette.muted, 2, ' stroke-dasharray="10 8"')
    + ray([inside(25, R - 8), [X, Y], [X + Math.sin(out) * 150, Y - Math.cos(out) * 150]])
    + ray([inside(58, R - 8), [X, Y], [X + Math.sin(deg(58)) * (R - 8),
      Y + Math.cos(deg(58)) * (R - 8)]], palette.accent, 3, 0.45));
}

// 4.4 · An optical fibre on a dark panel: light zigzags along the core, reflected at each wall.
function fibre() {
  const [W, H, CORE_TOP, CORE_BOT, END] = [1162, 360, 140, 220, 1080];
  const zig = [[20, 96], [70, 180]]; // from the source into the core, then wall to wall
  for (let x = 145, i = 0; x < END; x += 150, i++) zig.push([x, i % 2 ? CORE_TOP : CORE_BOT]);
  const [lx, ly] = zig.at(-1);
  const exit = [END, ly + ((ly === CORE_BOT ? CORE_TOP : CORE_BOT) - ly) * ((END - lx) / 150)];
  const glow = ([x, y], radii) => radii.map((r, i) => dot(x, y, r, palette.ray,
    ` fill-opacity="${0.2 + (i * 0.6) / radii.length}"`)).join('');
  return svg(W, H, `<rect width="${W}" height="${H}" fill="${palette.ink}"/>`
    + shape(`M70 100H${END}V260H70Z`, palette.glass, ' fill-opacity=".14"') // the cladding
    + shape(`M70 ${CORE_TOP}H${END}V${CORE_BOT}H70Z`, palette.glass, ' fill-opacity=".3"')
    + [100, 260].map((y) => stroke([[70, y], [END, y]], palette.paper, 2, ' stroke-opacity=".35"'))
      .join('')
    + [-70, 0, 70].map((dy) => stroke([exit, [W, exit[1] + dy]], palette.ray, 3,
      ' stroke-opacity=".8"')).join('')
    + glow(exit, [26, 15]) + glow(zig[0], [30, 18, 9])
    + ray([...zig, exit], palette.ray, 3.5, 0.5)
    + zig.slice(2, 6).map((p, i) => tip([(p[0] + zig[i + 3][0]) / 2, (p[1] + zig[i + 3][1]) / 2],
      [zig[i + 3][0] - p[0], zig[i + 3][1] - p[1]], palette.ray, 14)).join(''));
}

// 4.5 · Dispersion on a dark panel: a white beam crosses a prism at minimum deviation, and each
// colour leaves bent towards the base, red least and violet most (the spread is exaggerated).
function prism() {
  const [W, H, SX, BEAM] = [1760, 720, 1690, 8]; // the panel, the screen's x, half the beam
  const hues = ['#e5484d', '#f0892a', '#f5cf3a', '#58b86b', '#3b8fd0', '#4f5ab8', '#7c4fb8'];
  const [A, B, C] = [[800, 75], [580, 485], [1020, 485]]; // apex, base left, base right
  const along = (p, d, t) => [p[0] + d[0] * t, p[1] + d[1] * t];
  const into = (q, r) => { // the unit normal of the face q→r that points into the glass
    const l = Math.hypot(r[0] - q[0], r[1] - q[1]);
    return [(q[1] - r[1]) / l, (r[0] - q[0]) / l];
  };
  // Snell's law with vectors: m is the face normal against the ray, eta = n before ÷ n after.
  const refract = (d, m, eta) => {
    const c = -(d[0] * m[0] + d[1] * m[1]);
    return along([eta * d[0], eta * d[1]], m, eta * c - Math.sqrt(1 - eta * eta * (1 - c * c)));
  };
  const meet = (p, d, [q, r]) => { // where the ray from p along d crosses the line q–r
    const [ex, ey] = [r[0] - q[0], r[1] - q[1]];
    return along(p, d, ((q[0] - p[0]) * ey - (q[1] - p[1]) * ex) / (d[0] * ey - d[1] * ex));
  };
  // At minimum deviation the beam crosses the glass parallel to the base: it rises to the first
  // face at half the deviation of the middle colour (n = 1.52), and every colour falls after.
  const half = Math.atan2(C[0] - A[0], C[1] - A[1]); // half the apex angle
  const lift = Math.asin(1.52 * Math.sin(half)) - half;
  const d0 = [Math.cos(lift), -Math.sin(lift)];
  const across = [Math.sin(lift), Math.cos(lift)]; // square to the beam, downwards
  const mid = along(A, [B[0] - A[0], B[1] - A[1]], 0.5); // the beam meets the first face halfway
  const slit = along(mid, d0, (70 - mid[0]) / d0[0]);
  const edge = (s) => along(slit, across, s * BEAM); // s = -1: the beam's upper edge; 1: lower
  const [top, bottom] = [meet(edge(-1), d0, [B, A]), meet(edge(1), d0, [B, A])];
  // The seven bands' eight edges, red (0) to violet (7), each refracted with its own index.
  const edges = Array.from({ length: 8 }, (_, k) => {
    const n = 1.46 + k * 0.02;
    const p = along(top, [bottom[0] - top[0], bottom[1] - top[1]], k / 7);
    const inside = refract(d0, into(A, B), 1 / n);
    const out = meet(p, inside, [A, C]);
    return [p, out, meet(out, refract(inside, into(A, C), n), [[SX, 0], [SX, H]])];
  });
  const ys = edges.map(([, , hit]) => hit[1]);
  const jaw = (from, to) => shape(`M${pts([edge(from), edge(to), along(edge(to), d0, -30),
    along(edge(from), d0, -30)])}Z`, palette.muted);
  return svg(W, H, `<rect width="${W}" height="${H}" fill="${palette.ink}"/>`
    + jaw(-1.3, -7.5) + jaw(1.3, 7.5) // the slit
    + shape(`M${pts([edge(-1), top, bottom, edge(1)])}Z`, palette.paper, ' fill-opacity=".95"')
    + shape(`M${pts([top, edges[0][1], edges[7][1], bottom])}Z`, palette.paper,
      ' fill-opacity=".45"')
    + hues.map((hue, i) => shape(`M${pts([edges[i][1], edges[i][2], edges[i + 1][2],
      edges[i + 1][1]])}Z`, hue, ' fill-opacity=".85"')).join('')
    + shape(`M${pts([A, B, C])}Z`, palette.glass, ` fill-opacity=".16" stroke="${palette.paper}" `
      + 'stroke-opacity=".75" stroke-width="3" stroke-linejoin="round"')
    + shape(`M${pts([A, [A[0] + 40, B[1]], C])}Z`, palette.paper, ' fill-opacity=".07"') // a facet
    + shape(`M${SX} ${f1(Math.min(...ys) - 10)}H${SX + 16}V${f1(Math.max(...ys) + 10)}H${SX}Z`,
      palette.paper, ' fill-opacity=".25"') // the screen
    + tip(along(slit, d0, 260), d0, palette.ink, 16));
}

// 4.6 · The three principal rays of a converging lens meet at the tip of a real image.
function principalRays() {
  const [W, H, AX, LX, F] = [1162, 470, 235, 581, 200];
  const [ox, oy] = [121, 95]; // the object's tip, beyond 2F
  const v = 1 / (1 / F - 1 / (LX - ox)); // the lens formula gives the image distance
  const [ix, iy] = [LX + v, AX + (AX - oy) * (v / (LX - ox))];
  const along = (p, q, x) => [x, p[1] + ((q[1] - p[1]) * (x - p[0])) / (q[0] - p[0])];
  const hit = along([ox, oy], [LX - F, AX], LX); // where the ray through F meets the lens
  const arrow = (x, y, color) => stroke([[x, AX], [x, y + Math.sign(AX - y) * 18]], color, 5)
    + tip([x, y + Math.sign(AX - y) * 20], [0, y - AX], color, 20);
  return svg(W, H, `<rect width="${W}" height="${H}" fill="${palette.tint}"/>` // a light plate
    + stroke([[0, AX], [W, AX]], palette.muted, 1.5)
    + lens(LX, 30, 440, 70, palette.glass, palette.ink)
    + [LX - 2 * F, LX + 2 * F].map((x) => dot(x, AX, 6, palette.paper,
      ` stroke="${palette.ink}" stroke-width="2.5"`)).join('')
    + [LX - F, LX + F].map((x) => dot(x, AX, 7, palette.ink)).join('')
    + ray([[ox, oy], [LX, oy], along([LX, oy], [LX + F, AX], 1110)], palette.ray, 3, 0.45)
    + ray([[ox, oy], along([ox, oy], [LX, AX], 1110)], palette.ray, 3, 0.28)
    + ray([[ox, oy], hit, [1110, hit[1]]], palette.ray, 3, 0.6) // through F, then parallel
    + arrow(ox, oy, palette.ink) + arrow(ix, iy, palette.accent) + dot(ix, iy, 7, palette.ray));
}

// 4.7 · A diverging lens spreads parallel rays as if they came from the focus in front of it.
function diverging() {
  const [W, H, AX, LX, F, OUT] = [528, 380, 190, 300, 150, 185];
  // A ray leaves the lens along the line from the virtual focus, and every one runs OUT px.
  const away = (y) => {
    const l = Math.hypot(F, y - AX);
    return [LX + (F * OUT) / l, y + ((y - AX) * OUT) / l];
  };
  return svg(W, H, stroke([[0, AX], [W, AX]], palette.muted, 1.5)
    + shape(`M${LX - 26} 40H${LX + 26}Q${LX + 4} ${AX} ${LX + 26} 340H${LX - 26}Q${LX - 4} ${AX} `
      + `${LX - 26} 40Z`, palette.glass, ` stroke="${palette.ink}" stroke-width="2.5"`)
    + dot(LX - F, AX, 7, palette.ink)
    + [105, 150, 230, 275].map((y) => stroke([[LX - F, AX], [LX, y]], palette.muted, 1.5,
      ' stroke-dasharray="8 7"') + ray([[20, y], [LX, y], away(y)], palette.ray, 3, 0.55)).join('')
    + ray([[20, AX], [LX + OUT, AX]], palette.ray, 3, 0.3));
}
// #endregion

// #region figures: where each diagram goes, set by its placement and its first citation
const drawings = new Map(); // fileId → SVG markup, registered before the build
const figure = (id, { width, height, markup }, placement) => {
  drawings.set(`${id}.svg`, markup);
  return { id, typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, caption: t(captions[id]),
    altText: t(captions[id]), // read aloud in HTML and tagged PDF; the canvas does not use it
    svg: { fileId: `${id}.svg`, width, height }, ...(placement && { placement }) };
};
const resources = [ // no placement: a main-column float, its caption in the channel
  figure('burning-glass', burningGlass()),
  figure('refraction', refraction(), side),
  figure('critical-angle', criticalAngle(), side),
  figure('fibre', fibre()),
  figure('prism', prism(), { span: 'page', position: 'top' }), // across text column and channel
  figure('principal-rays', principalRays()),
  figure('diverging', diverging(), side),
];
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build
  Merriweather: ['300', '300i', '400i', '700'],
  'Merriweather Sans': ['300', '300i', '700', '800'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await Promise.all([...drawings].map(([fileId, markup]) => loadSvg(fileId, markup)));
// #region build: chapter 4 of a longer book, so the counters start where chapter 3 ended
const continuation = { pageNumbering: { startAt: 87 }, // odd, like page 1: a recto
  headings: { h1: 3, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } }; // the next # is chapter 4
const doc = await buildDocumentWithFonts({ markdown, resources, continuation }, config(),
  kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Textbook with a margin column',
  es: 'Libro de texto con columna al margen' }) });
// #endregion

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
