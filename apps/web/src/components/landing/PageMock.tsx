/** A page of the guide in miniature, set with CSS at the book's own
 *  proportions: every size is in container units of the 210 mm sheet
 *  (1cqw = 2.1 mm), so the page scales as one piece. A chapter opener on a
 *  Postext-blue band, two justified columns, a figure floated to the head
 *  of the second column and a "Try it" box. Decorative (aria-hidden
 *  content); the wrapper carries the label. */
export function PageMock({
  label,
  kicker,
  title,
  lead,
  body,
  figureLabel,
  figureCaption,
  tryTitle,
  tryText,
}: {
  label: string;
  kicker: string;
  title: string;
  lead: string;
  body: string[];
  figureLabel: string;
  figureCaption: string;
  tryTitle: string;
  tryText: string;
}) {
  const mm = (v: number) => `${(v / 2.1).toFixed(3)}cqw`;
  const pt = (v: number) => mm(v * 0.3528);
  return (
    <div
      role="img"
      aria-label={label}
      className="relative aspect-[210/280] w-full overflow-hidden bg-white text-[#15171c] shadow-[0_2px_4px_rgba(0,0,0,0.08),0_30px_60px_-20px_rgba(14,16,20,0.45)] [container-type:inline-size]"
    >
      <div aria-hidden="true" className="absolute inset-0">
        {/* Opener band */}
        <div className="absolute inset-x-0 top-0 bg-[#2b4acb] text-white" style={{ height: mm(3 + 24 + 74 - 22) }}>
          <div className="absolute font-display font-[800] leading-none" style={{ right: mm(20), top: mm(24 - 6), fontSize: pt(118) }}>
            1
          </div>
          <div className="absolute" style={{ left: mm(20), top: mm(24 + 4), width: mm(110) }}>
            <div className="font-sans font-semibold uppercase" style={{ fontSize: pt(8.5), letterSpacing: pt(2.2) }}>
              {kicker}
            </div>
            <div className="bg-white" style={{ marginTop: mm(3.5), width: mm(22), height: pt(1.5) }} />
            <div className="font-display font-bold" style={{ marginTop: mm(5), fontSize: pt(32), lineHeight: 1.04 }}>
              {title}
            </div>
            <div className="font-body italic" style={{ marginTop: mm(5), width: mm(150), fontSize: pt(10.5), lineHeight: 1.36 }}>
              {lead}
            </div>
          </div>
        </div>
        <div className="absolute inset-x-0 bg-[#15171c]" style={{ top: mm(3 + 24 + 74 - 22), height: mm(1.6) }} />

        {/* Two columns */}
        <div
          className="absolute overflow-hidden font-body"
          style={{
            left: mm(20),
            right: mm(20),
            top: mm(3 + 24 + 74 - 22 + 10),
            bottom: mm(22),
            columnCount: 2,
            columnGap: mm(9),
            columnFill: "auto",
            fontSize: pt(9.4),
            lineHeight: pt(13.6),
            textAlign: "justify",
            hyphens: "auto",
          }}
        >
          {body.slice(0, 1).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <div
            className="bg-[#f7f1e3] font-sans"
            style={{ breakInside: "avoid", margin: `${pt(6)} 0 ${pt(9)}`, padding: `${mm(3)} ${mm(3.5)} ${mm(2.6)} ${mm(4.5)}`, borderLeft: `${pt(3)} solid #2b4acb`, borderRadius: mm(1.2), fontSize: pt(8.3), lineHeight: pt(12), textAlign: "left" }}
          >
            <div className="font-bold uppercase text-[#2b4acb]" style={{ fontSize: pt(7.5), letterSpacing: pt(1.6), marginBottom: mm(1.6) }}>
              {tryTitle}
            </div>
            {tryText}
          </div>
          {body.slice(1, 2).map((p, i) => (
            <p key={i} style={{ textIndent: mm(4) }}>{p}</p>
          ))}
          <div style={{ breakBefore: "column", breakInside: "avoid", marginBottom: pt(12) }}>
            <svg viewBox="0 0 160 92" className="block w-full" style={{ background: "#f1f3f8" }}>
              {[0.35, 0.55, 0.42, 0.7, 0.95].map((v, i) => (
                <rect key={i} x={22 + i * 25} y={80 - 64 * v} width={16} height={64 * v} rx={1.5} fill={i === 4 ? "#d8a21a" : "#3d5bd6"} />
              ))}
              <rect x={14} y={80} width={132} height={0.8} fill="#15171c" />
            </svg>
            <div className="font-sans" style={{ marginTop: mm(1.8), fontSize: pt(7.4), lineHeight: 1.3, textAlign: "left" }}>
              <b className="text-[#2b4acb]">{figureLabel}</b> {figureCaption}
            </div>
          </div>
          {body.slice(2).map((p, i) => (
            <p key={i} style={{ textIndent: i === 0 ? 0 : mm(4) }}>{p}</p>
          ))}
        </div>

        {/* Folio */}
        <div className="absolute inset-x-0 text-center font-sans font-bold text-[#2b4acb]" style={{ bottom: mm(10), fontSize: pt(8.5) }}>
          5
        </div>
      </div>
    </div>
  );
}
