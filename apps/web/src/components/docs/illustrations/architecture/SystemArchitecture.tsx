import { Figure } from "../Figure";
import { ArrowMarker, Box, DropShadowDef, Label, colorTokens } from "../primitives";

export interface SystemArchitectureLabels {
  title: string;
  desc?: string;
  caption?: string;
  markdown: string;
  configTitle: string;
  configSubtitle: string;
  engine: string;
  parser: string;
  pass1: string;
  vdtLine1: string;
  vdtLine2: string;
  vdtAttr1: string;
  vdtAttr2: string;
  vdtAttr3: string;
  vdtAttr4: string;
  pretext: string;
  pretextSubtitle: string;
  passesTitle: string;
  passes: { num: string; name: string }[];
  convergence: string;
  backend: string;
  backendSubtitle: string;
  backendItems: string[];
  output: string;
  outputSubtitle: string;
}

/**
 * Postext system architecture.
 *
 * One idea made obvious: the VDT is the single mutable artifact at the center
 * of the engine — the parser builds it, the layout passes read & mutate it
 * inside a convergence loop, and a backend renders the converged result.
 *
 * Color semantics (restrained):
 *   blue   = inputs entering the system
 *   yellow = engine machinery (parser = pass 1, layout passes, convergence loop)
 *   green  = the VDT itself (and the converged VDT flowing to the backend)
 *   teal   = output side (backend + rendered output)
 *   neutral= Pretext, an external measurement service
 */
export function SystemArchitecture({ labels }: { labels: SystemArchitectureLabels }) {
  // "convergence (max 5)" / "convergencia (máx 5)" → two stacked lines
  const convWords = labels.convergence.split(" ");
  const convLine1 = convWords[0] ?? labels.convergence;
  const convLine2 = convWords.slice(1).join(" ");

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 992 452" maxWidth={992}>
      <defs>
        <ArrowMarker id="sa-arrow" />
        <ArrowMarker id="sa-arrow-yellow" color={colorTokens.yellow.stroke} />
        <ArrowMarker id="sa-arrow-green" color={colorTokens.green.stroke} />
        <DropShadowDef id="sa-shadow" />
      </defs>

      <style>{`
        .sa-flow { opacity: 0; fill: none; }
        @media (prefers-reduced-motion: no-preference) {
          .sa-flow {
            opacity: 0.9;
            stroke-dasharray: 0 18;
            stroke-linecap: round;
            animation: sa-dash 2.4s linear infinite;
          }
          @keyframes sa-dash {
            from { stroke-dashoffset: 36; }
            to { stroke-dashoffset: 0; }
          }
        }
      `}</style>

      {/* ── Engine container ───────────────────────────────────── */}
      <rect x={248} y={36} width={520} height={404} rx={10} fill="none" stroke="var(--svg-stroke)" strokeWidth={1.5} strokeDasharray="8,4" />
      <Label x={268} y={62} size={12} bold color="dark">{labels.engine}</Label>

      {/* ── Inputs (blue) ──────────────────────────────────────── */}
      <Box x={24} y={84} width={188} height={52} color="blue" filter="url(#sa-shadow)" />
      <Label x={118} y={114} anchor="middle" size={10} bold color="blue">{labels.markdown}</Label>

      <Box x={24} y={168} width={188} height={52} color="blue" filter="url(#sa-shadow)" />
      <Label x={118} y={190} anchor="middle" size={10} bold color="blue">{labels.configTitle}</Label>
      <Label x={118} y={207} anchor="middle" size={9} color="blue">{labels.configSubtitle}</Label>

      <path d="M212 110 H240 V124 H270" fill="none" stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#sa-arrow)" />
      <path d="M212 194 H240 V140 H270" fill="none" stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#sa-arrow)" />

      {/* ── Parser = pass 1 (yellow: engine machinery) ─────────── */}
      <Box x={272} y={104} width={124} height={56} color="yellow" filter="url(#sa-shadow)" />
      <Label x={334} y={127} anchor="middle" size={11} bold color="yellow">{labels.parser}</Label>
      <Label x={334} y={145} anchor="middle" size={9} color="yellow">{labels.pass1}</Label>

      <line x1={396} y1={132} x2={446} y2={132} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#sa-arrow)" />

      {/* ── Pretext (neutral external service) ─────────────────── */}
      <rect x={272} y={188} width={124} height={52} rx={6} fill="var(--svg-legend-fill)" stroke="var(--svg-legend-stroke)" strokeWidth={1.5} />
      <Label x={334} y={210} anchor="middle" size={11} bold color="mid">{labels.pretext}</Label>
      <Label x={334} y={228} anchor="middle" size={9} color="light">{labels.pretextSubtitle}</Label>

      <line x1={398} y1={206} x2={446} y2={206} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#sa-arrow)" />
      <line x1={446} y1={226} x2={398} y2={226} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#sa-arrow)" />

      {/* ── VDT: the focal, central mutable artifact (green) ───── */}
      <Box x={448} y={88} width={196} height={148} color="green" filter="url(#sa-shadow)" />
      <Label x={546} y={112} anchor="middle" size={12} bold color="green">{labels.vdtLine1}</Label>
      <Label x={546} y={130} anchor="middle" size={12} bold color="green">{labels.vdtLine2}</Label>
      <line x1={464} y1={142} x2={628} y2={142} stroke={colorTokens.green.stroke} strokeWidth={1} opacity={0.35} />
      <Label x={546} y={162} anchor="middle" size={9} color="green">{labels.vdtAttr1}</Label>
      <Label x={546} y={180} anchor="middle" size={9} color="green">{labels.vdtAttr2}</Label>
      <Label x={546} y={198} anchor="middle" size={9} color="green">{labels.vdtAttr3}</Label>
      <Label x={546} y={216} anchor="middle" size={9} color="green">{labels.vdtAttr4}</Label>

      {/* read / mutate: VDT ↔ passes */}
      <line x1={536} y1={236} x2={536} y2={270} stroke={colorTokens.yellow.stroke} strokeWidth={1.5} markerEnd="url(#sa-arrow-yellow)" />
      <line x1={556} y1={272} x2={556} y2={238} stroke={colorTokens.yellow.stroke} strokeWidth={1.5} markerEnd="url(#sa-arrow-yellow)" />

      {/* ── Layout passes (yellow) ─────────────────────────────── */}
      <Box x={340} y={272} width={304} height={152} color="yellow" filter="url(#sa-shadow)" />
      <Label x={492} y={296} anchor="middle" size={10} bold color="yellow">{labels.passesTitle}</Label>
      {labels.passes.map((p, i) => (
        <g key={i}>
          <Label x={356} y={320 + i * 18} size={9} bold color="yellow">{p.num}</Label>
          <Label x={414} y={320 + i * 18} size={10} color="dark">{p.name}</Label>
        </g>
      ))}

      {/* convergence loop: passes re-run until the VDT settles */}
      <path d="M644 396 C690 396 690 304 644 304" fill="none" stroke={colorTokens.yellow.stroke} strokeWidth={2} markerEnd="url(#sa-arrow-yellow)" />
      <Label x={690} y={340} size={9} color="yellow">{convLine1}</Label>
      {convLine2 ? <Label x={690} y={354} size={9} color="yellow">{convLine2}</Label> : null}

      {/* ── Converged VDT exits the engine (green) ─────────────── */}
      <line x1={644} y1={130} x2={796} y2={130} stroke={colorTokens.green.stroke} strokeWidth={2} markerEnd="url(#sa-arrow-green)" />

      {/* ── Backend + output (teal) ────────────────────────────── */}
      <Box x={800} y={88} width={168} height={128} color="teal" filter="url(#sa-shadow)" />
      <Label x={884} y={112} anchor="middle" size={11} bold color="teal">{labels.backend}</Label>
      <Label x={884} y={129} anchor="middle" size={9} color="teal">{labels.backendSubtitle}</Label>
      {labels.backendItems.map((b, i) => (
        <Label key={i} x={884} y={156 + i * 20} anchor="middle" size={10} color="teal">{b}</Label>
      ))}

      <line x1={884} y1={216} x2={884} y2={246} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#sa-arrow)" />

      <Box x={800} y={250} width={168} height={56} color="teal" filter="url(#sa-shadow)" />
      <Label x={884} y={273} anchor="middle" size={11} bold color="teal">{labels.output}</Label>
      <Label x={884} y={290} anchor="middle" size={9} color="teal">{labels.outputSubtitle}</Label>

      {/* ── Animated flow dots (enhancement only) ──────────────── */}
      <path className="sa-flow" d="M212 110 H240 V124 H272" stroke="var(--svg-stroke)" strokeWidth={5} />
      <path className="sa-flow" d="M212 194 H240 V140 H272" stroke="var(--svg-stroke)" strokeWidth={5} />
      <path className="sa-flow" d="M396 132 H448" stroke="var(--svg-stroke)" strokeWidth={5} />
      <path className="sa-flow" d="M644 396 C690 396 690 304 644 304" stroke={colorTokens.yellow.stroke} strokeWidth={5} style={{ animationDuration: "4.8s" }} />
      <path className="sa-flow" d="M644 130 H798" stroke={colorTokens.green.stroke} strokeWidth={5} />
      <path className="sa-flow" d="M884 216 V248" stroke="var(--svg-stroke)" strokeWidth={5} />
    </Figure>
  );
}
