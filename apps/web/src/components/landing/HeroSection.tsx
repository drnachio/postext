export function HeroSection() {
  return (
    <section className="relative">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-12 px-6 pt-24 pb-16 md:flex-row md:items-center md:justify-between">
        <div className="text-left">
          <p className="font-mono text-xs text-ink-red">v0.0.2</p>
          <h1
            className="mt-4 max-w-md font-display text-2xl font-bold italic leading-[1.08] tracking-tight md:text-3xl"
            style={{ textWrap: "balance" }}
          >
            The Programmable Typesetter for the Web
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-slate">
            Postext takes semantic markdown and applies centuries-old editorial
            layout rules — orphan prevention, column balancing, figure placement —
            producing publication-grade React components.
          </p>
          <div className="mt-8 flex gap-6">
            <a
              href="#install"
              className="border border-ink-red bg-ink-red px-6 py-3 font-display text-sm font-semibold text-white transition-colors hover:bg-ink-red-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-red focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              style={{ touchAction: "manipulation" }}
            >
              Get Started
            </a>
            <a
              href="https://github.com/drnachio/postext"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-rule px-6 py-3 font-display text-sm font-semibold text-foreground transition-colors hover:border-slate focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-red focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              style={{ touchAction: "manipulation" }}
            >
              View on GitHub
            </a>
          </div>
        </div>

        <div className="flex items-baseline tracking-tight">
          <span className="font-logo text-8xl font-black text-ink-red md:text-9xl">P</span>
          <span className="-ml-4 font-display text-5xl text-foreground md:-ml-5 md:text-6xl">ostext</span>
        </div>
      </div>
    </section>
  );
}
