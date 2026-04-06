export function AboutSection() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-24">
      <div className="grid grid-cols-1 gap-16 md:grid-cols-12">
        {/* Left — explanation */}
        <div className="md:col-span-5">
          <p className="font-mono text-xs uppercase tracking-widest text-slate">
            What Is Postext
          </p>
          <h2
            className="mt-4 font-display text-3xl font-bold italic leading-tight tracking-tight"
            style={{ textWrap: "balance" }}
          >
            Editorial Layout,
            <br />
            Computed for the Web
          </h2>
          <p className="mt-6 leading-[1.8] text-slate">
            CSS gives you responsive layout — flexbox, grid, columns. But it
            cannot balance columns, prevent orphans, flow text around figures, or
            place footnotes at the bottom of a column. These are editorial
            decisions that have been refined over centuries of print
            typesetting.
          </p>
          <p className="mt-4 leading-[1.8] text-slate">
            Postext bridges that gap. Feed it semantic markdown and a
            configuration object. It measures text 300&ndash;600&times; faster
            than the DOM using{" "}
            <a
              href="https://github.com/chenglou/pretext"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline decoration-rule underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-red"
            >
              @chenglou/pretext
            </a>
            , then returns React components laid out to professional
            typographic standards.
          </p>
        </div>

        {/* Divider */}
        <div className="hidden md:col-span-1 md:flex md:justify-center">
          <div className="column-rule" />
        </div>

        {/* Right — visual: markdown → typeset output */}
        <div className="md:col-span-6">
          <div className="space-y-6">
            <div>
              <p className="mb-2 font-mono text-xs text-slate">Input</p>
              <pre className="overflow-x-auto border border-rule bg-surface p-5 font-mono text-sm leading-7 text-slate">
{`# Chapter One

The quick brown fox jumps over
the lazy dog. A paragraph with
a {{figure:hero-img}} reference
and a footnote.[^1]

[^1]: Additional context placed
at column bottom automatically.`}
              </pre>
            </div>
            <div>
              <p className="mb-2 font-mono text-xs text-slate">Output</p>
              <div className="flex gap-4 border border-rule bg-surface p-5">
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/4 bg-rule" />
                  <div className="h-2 w-full bg-rule/50" />
                  <div className="h-2 w-full bg-rule/50" />
                  <div className="h-2 w-5/6 bg-rule/50" />
                  <div className="mt-3 h-12 w-full border border-rule bg-background" />
                  <div className="h-2 w-full bg-rule/50" />
                  <div className="h-2 w-4/5 bg-rule/50" />
                </div>
                <div className="column-rule" />
                <div className="flex-1 space-y-2">
                  <div className="h-2 w-full bg-rule/50" />
                  <div className="h-2 w-full bg-rule/50" />
                  <div className="h-2 w-full bg-rule/50" />
                  <div className="h-2 w-3/4 bg-rule/50" />
                  <div className="h-2 w-full bg-rule/50" />
                  <div className="h-2 w-full bg-rule/50" />
                  <div className="h-2 w-2/3 bg-rule/50" />
                  <div className="mt-4 border-t border-rule pt-2">
                    <div className="h-1.5 w-3/4 bg-rule/30" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
