# Credits — Física universitaria / Physics (OpenStax)

Showcase preset for the Postext sandbox: the first two chapters of two OpenStax
textbooks published under the Creative Commons Attribution 4.0 licence.

## Física universitaria (es)

- Física universitaria, volumen 1. OpenStax, Rice University. Licencia CC BY 4.0. Acceso gratuito en openstax.org.
- Book page: https://openstax.org/details/books/física-universitaria-volumen-1
- Source repository: https://github.com/openstax/osbooks-fisica-universitaria-bundle
- Chapters: Unidades y medidas; Vectores

## Physics (en)

- Physics. OpenStax, Rice University. CC BY 4.0 licence. Free access at openstax.org.
- Book page: https://openstax.org/details/books/physics
- Source repository: https://github.com/openstax/osbooks-physics
- Chapters: What is Physics?; Motion in One Dimension

Figure credits are kept in the captions as OpenStax publishes them. Teacher notes,
interactive iframes and the problem sets are omitted; formulas are converted from
MathML to LaTeX by `cnxml.py`.

## Fonts (SIL Open Font License 1.1)

- Source Serif 4 — Frank Grießhammer, Adobe (`fonts/SourceSerif4-OFL.txt`)
- Source Sans 3 — Paul D. Hunt, Adobe (`fonts/SourceSans3-OFL.txt`)

## Build

`scripts/presets/showcase/openstax-fisica/` in the Postext repository: `fetch.py`
downloads the CNXML modules, media and fonts; `build.py` writes this bundle.
