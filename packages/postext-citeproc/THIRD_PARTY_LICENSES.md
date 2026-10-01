# Third-party licences

## citeproc-js

postext-citeproc depends on citeproc-js (npm package `citeproc`), a dependency installed alongside it, not copied into this package.

- Copyright © 2009–2024 Frank Bennett and contributors.
- Licence: Common Public Attribution License 1.0 (CPAL-1.0), at the licensee's choice of CPAL-1.0 or AGPL-1.0. This package uses it under CPAL-1.0.
- Source: https://github.com/Juris-M/citeproc-js

Attribution (CPAL Exhibit B): "Citations are formatted with citeproc-js (Frank Bennett, CPAL 1.0)". Hosts that show citation settings should display this line, as the Postext Sandbox does in its Citations section.

## Citation Style Language styles and locales

The files under `csl/` (embedded in `dist/generated/`) are from the Citation Style Language project:

- Styles: https://github.com/citation-style-language/styles
- Locales: https://github.com/citation-style-language/locales
- Licence: Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0), https://creativecommons.org/licenses/by-sa/3.0/

Each style file names its authors and contributors in its `<info>` block. They are distributed unmodified, except:

- `china-national-standard-gb-t-7714-2015-*.csl`: the CSL-M `locale="en"` layouts the files ship commented out are enabled, so a work in a Western language takes "et al." and the English terms.
- `iso690-author-date-es.csl`: a citation labels its locator ("cap. 2", "p. 33") instead of always writing "p.", and a chapter without pages ends its publisher with a full stop.

At run time `postext-citeproc` also adds `collapse="citation-number"` to a numbered style's citation when ranges are to be joined, and, for notes without numbers, turns off the branches that point back to an earlier note.
