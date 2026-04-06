export function Footer() {
  return (
    <footer role="contentinfo" className="border-t border-rule bg-background">
      <div className="mx-auto max-w-5xl px-6 py-16 2xl:max-w-6xl 2xl:px-8 2xl:py-20 4xl:max-w-7xl 4xl:px-12 4xl:py-24">
        <div className="flex flex-col gap-10 sm:flex-row sm:gap-0">
          <div className="flex-1">
            <p className="flex items-baseline text-xl tracking-tight">
              <span className="font-logo text-3xl font-black text-ink-red 2xl:text-4xl 4xl:text-5xl">P</span>
              <span className="-ml-1 font-display text-lg text-foreground 2xl:text-xl 4xl:text-2xl">ostext</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate 2xl:text-base 4xl:text-lg">
              Programmable typesetter for the web.
              <br />
              Built with{" "}
              <a
                href="https://github.com/chenglou/pretext"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline decoration-rule underline-offset-4 hover:decoration-foreground"
              >
                @chenglou/pretext
              </a>
            </p>
          </div>

          <div className="column-rule mx-10 hidden sm:block 2xl:mx-14 4xl:mx-18" aria-hidden="true" />

          <nav aria-label="Footer navigation" className="flex gap-16 2xl:gap-20 4xl:gap-24">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-slate 2xl:text-sm 4xl:text-base">
                Resources
              </p>
              <ul className="mt-4 space-y-3 2xl:mt-5 2xl:space-y-4 4xl:mt-6 4xl:space-y-5">
                <li>
                  <a
                    href="https://github.com/drnachio/postext"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-slate transition-colors hover:text-foreground 2xl:text-base 4xl:text-lg"
                  >
                    GitHub
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.npmjs.com/package/postext"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-slate transition-colors hover:text-foreground 2xl:text-base 4xl:text-lg"
                  >
                    npm
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-slate 2xl:text-sm 4xl:text-base">
                Legal
              </p>
              <ul className="mt-4 space-y-3 2xl:mt-5 2xl:space-y-4 4xl:mt-6 4xl:space-y-5">
                <li>
                  <span className="text-sm text-slate 2xl:text-base 4xl:text-lg">MIT License</span>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-16 border-t border-rule pt-6 2xl:mt-20 2xl:pt-8 4xl:mt-24 4xl:pt-10">
          <p className="text-xs text-slate 2xl:text-sm 4xl:text-base">
            &copy; {new Date().getFullYear()} Postext Contributors
          </p>
        </div>
      </div>
    </footer>
  );
}
