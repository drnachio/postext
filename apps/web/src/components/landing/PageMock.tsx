"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** A page of the guide in miniature, set with CSS at the book's own
 *  proportions: every size is in container units of the 210 mm sheet
 *  (1cqw = 2.1 mm), so the page scales as one piece. A chapter opener on a
 *  Postext-blue band, two justified columns, a figure floated to the head
 *  of the second column and a "Try it" box. Decorative (aria-hidden
 *  content); the wrapper carries the label.
 *
 *  CSS columns cannot float a figure and keep the text flowing past it, so
 *  the page is set the way the engine sets it: the text runs as one stream,
 *  shown in the first column and again, shifted up, under the figure in the
 *  second. Both columns have the same measure, so the lines break the same
 *  way in both copies. After layout, the "Try it" box and the figure are
 *  padded to whole lines, and each column is cut after its last whole line,
 *  so the two columns end level on the same baseline grid. */
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
  const pageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const q = <T extends HTMLElement>(sel: string) => page.querySelector<T>(sel)!;
    const all = <T extends HTMLElement>(sel: string) => Array.from(page.querySelectorAll<T>(sel));

    const set = () => {
      const left = q("[data-col=left]");
      const rightClip = q("[data-col=right-clip]");
      const figure = q("[data-figure]");
      const streams = all("[data-stream]");
      const [main, copy] = streams;
      const lh = parseFloat(getComputedStyle(main).lineHeight);
      if (!(lh > 0)) return;
      const snap = (h: number) => Math.ceil(h / lh - 0.01) * lh;
      const height = (el: HTMLElement) => el.getBoundingClientRect().height;

      // Pad the boxes to whole lines so every text line sits on the grid.
      for (const s of streams) {
        const box = s.querySelector<HTMLElement>("[data-try]")!;
        box.style.marginBottom = "";
        const cs = getComputedStyle(box);
        const outer = height(box) + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
        box.style.marginBottom = `${parseFloat(cs.marginBottom) + snap(outer) - outer}px`;
      }
      figure.style.paddingBottom = "";
      figure.style.paddingBottom = `${snap(height(figure)) - height(figure)}px`;

      // The stream's cut points: every text line, and the box as one piece.
      const origin = main.getBoundingClientRect().top;
      const units: [number, number][] = [];
      for (const el of Array.from(main.children) as HTMLElement[]) {
        const r = el.getBoundingClientRect();
        const top = r.top - origin;
        if (el.dataset.try !== undefined) {
          const cs = getComputedStyle(el);
          units.push([top - parseFloat(cs.marginTop), top + r.height + parseFloat(cs.marginBottom)]);
        } else {
          const n = Math.round(r.height / lh);
          for (let k = 0; k < n; k++) units.push([top + k * lh, top + (k + 1) * lh]);
        }
      }
      const cut = (from: number, room: number) => {
        let end = from;
        for (const [a, b] of units) if (a >= from - 0.5 && b - from <= room + 0.5) end = b;
        return end;
      };

      const colH = height(left.parentElement as HTMLElement);
      const leftEnd = cut(0, colH);
      left.style.height = `${leftEnd}px`;
      const room = colH - height(figure);
      copy.style.marginTop = `${-leftEnd}px`;
      rightClip.style.height = `${cut(leftEnd, room) - leftEnd}px`;
    };

    set();
    const ro = new ResizeObserver(set);
    ro.observe(page);
    document.fonts?.ready.then(set);
    return () => ro.disconnect();
  }, [body, tryText, figureCaption]);

  const stream = (copy: boolean): ReactNode => (
    <div data-stream="" aria-hidden={copy || undefined}>
      <p>{body[0]}</p>
      <div
        data-try=""
        className="bg-[#f7f1e3] font-sans"
        style={{ margin: `${pt(6)} 0 ${pt(9)}`, padding: `${mm(3)} ${mm(3.5)} ${mm(2.6)} ${mm(4.5)}`, borderLeft: `${pt(3)} solid #2b4acb`, borderRadius: mm(1.2), fontSize: pt(8.3), lineHeight: pt(12), textAlign: "left" }}
      >
        <div className="font-bold uppercase text-[#2b4acb]" style={{ fontSize: pt(7.5), letterSpacing: pt(1.6), marginBottom: mm(1.6) }}>
          {tryTitle}
        </div>
        {tryText}
      </div>
      {body.slice(1).map((p, i) => (
        <p key={i} style={{ textIndent: mm(4) }}>{p}</p>
      ))}
    </div>
  );

  return (
    <div
      ref={pageRef}
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

        {/* Two columns: one text stream, cut after the first column and
            resumed under the figure in the second. */}
        <div
          className="absolute flex items-start font-body"
          style={{
            left: mm(20),
            right: mm(20),
            top: mm(3 + 24 + 74 - 22 + 10),
            bottom: mm(22),
            columnGap: mm(9),
            fontSize: pt(9.4),
            lineHeight: pt(13.6),
            textAlign: "justify",
            hyphens: "auto",
          }}
        >
          <div data-col="left" className="h-full min-w-0 flex-1 overflow-hidden">
            {stream(false)}
          </div>
          <div className="h-full min-w-0 flex-1 overflow-hidden">
            <div data-figure="" className="flow-root">
              <svg viewBox="0 0 160 92" className="block w-full" style={{ background: "#f1f3f8" }}>
                {[0.35, 0.55, 0.42, 0.7, 0.95].map((v, i) => (
                  <rect key={i} x={22 + i * 25} y={80 - 64 * v} width={16} height={64 * v} rx={1.5} fill={i === 4 ? "#d8a21a" : "#3d5bd6"} />
                ))}
                <rect x={14} y={80} width={132} height={0.8} fill="#15171c" />
              </svg>
              <div className="font-sans" style={{ marginTop: mm(1.8), marginBottom: pt(12), fontSize: pt(7.4), lineHeight: 1.3, textAlign: "left" }}>
                <b className="text-[#2b4acb]">{figureLabel}</b> {figureCaption}
              </div>
            </div>
            <div data-col="right-clip" className="overflow-hidden">
              {stream(true)}
            </div>
          </div>
        </div>

        {/* Folio */}
        <div className="absolute inset-x-0 text-center font-sans font-bold text-[#2b4acb]" style={{ bottom: mm(10), fontSize: pt(8.5) }}>
          5
        </div>
      </div>
    </div>
  );
}
