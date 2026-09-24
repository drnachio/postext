import { HeroArt } from "./HeroArt";

/** The built-in guide's cover as HTML (the preset has no bundle
 *  thumbnail): the artwork band over night, the kicker, the title in
 *  Fraunces and its gilt rule, at the 210 × 280 page ratio. */
export function GuideCover({ kicker, title, subtitle, label }: { kicker: string; title: string; subtitle: string; label: string }) {
  const mm = (v: number) => `${(v / 2.1).toFixed(3)}cqw`;
  const pt = (v: number) => mm(v * 0.3528);
  return (
    <div className="relative aspect-[210/280] w-full overflow-hidden bg-night [container-type:inline-size]">
      <div className="absolute" style={{ left: mm(-3), top: mm(-3), width: mm(216) }}>
        <HeroArt label={label} className="block h-auto w-full" />
      </div>
      <div className="absolute" style={{ left: mm(20), right: mm(20), top: mm(170) }}>
        <div className="font-sans font-semibold text-gold uppercase" style={{ fontSize: pt(9), letterSpacing: pt(2.6) }}>
          {kicker}
        </div>
        <div className="font-display font-bold text-white" style={{ marginTop: mm(3), fontSize: pt(88), lineHeight: 0.95 }}>
          {title}
        </div>
        <div className="bg-gold" style={{ marginTop: mm(5), width: mm(34), height: pt(2) }} />
        <div className="font-body text-white italic" style={{ marginTop: mm(5), fontSize: pt(17), lineHeight: 1.25 }}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}
