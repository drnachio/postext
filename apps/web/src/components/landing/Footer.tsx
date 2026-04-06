export function Footer() {
  return (
    <footer className="border-t border-rule bg-background">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex flex-col gap-10 sm:flex-row sm:gap-0">
          <div className="flex-1">
            <p className="flex items-baseline text-xl tracking-tight">
              <span className="font-logo text-3xl font-black text-ink-red">P</span>
              <span className="-ml-1 font-display text-lg text-foreground">ostext</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate">
              Programmable typesetter for the web.
              <br />
              Built with{" "}
              <a
                href="https://github.com/chenglou/pretext"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline decoration-rule underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-red"
              >
                @chenglou/pretext
              </a>
            </p>
          </div>

          <div className="column-rule mx-10 hidden sm:block" />

          <div className="flex gap-16">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-slate">
                Resources
              </p>
              <ul className="mt-4 space-y-3">
                <li>
                  <a
                    href="https://github.com/drnachio/postext"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-slate transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-red"
                  >
                    GitHub
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.npmjs.com/package/postext"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-slate transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-red"
                  >
                    npm
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-slate">
                Legal
              </p>
              <ul className="mt-4 space-y-3">
                <li>
                  <span className="text-sm text-slate">MIT License</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-16 border-t border-rule pt-6">
          <p className="text-xs text-slate">
            &copy; {new Date().getFullYear()} Postext Contributors
          </p>
        </div>
      </div>
    </footer>
  );
}
