# postext-citeproc

Citation formatting for [Postext](https://postext.dev): the citations a Postext document writes in Pandoc's syntax (`[@garcia2020, p. 33]`, `@garcia2020`) are formatted in a CSL style — APA, Chicago, MLA, IEEE, Vancouver, ISO 690, GB/T 7714, SIST 02, OSCOLA… — and the bibliography is built from the document's references.

```ts
import 'postext-citeproc/register';
import { buildDocument } from 'postext';

const doc = buildDocument({ markdown }, { citations: { style: 'ieee' } });
```

`postext-citeproc/register` registers the engine with every bundled style and locale. To load it only when a document cites, hand Postext a loader instead (its layout worker calls it before such a build):

```ts
import { setCitationEngineLoader } from 'postext';
setCitationEngineLoader(() => import('postext-citeproc/register'));
```

## What is bundled

- **Styles** (`citations.style`): `apa`, `chicago-author-date`, `harvard-cite-them-right`, `iso690-author-date-en`, `iso690-author-date-es`, `china-national-standard-gb-t-7714-2025-author-date`, `china-national-standard-gb-t-7714-2015-author-date`, `modern-language-association`, `ieee`, `elsevier-vancouver`, `american-medical-association`, `nature`, `iso690-numeric-en`, `china-national-standard-gb-t-7714-2025-numeric`, `china-national-standard-gb-t-7714-2015-numeric`, `sist02`, `chicago-notes-bibliography`, `oscola`, `china-national-standard-gb-t-7714-2025-note`, `china-national-standard-gb-t-7714-2015-note`. Any other CSL style can be passed whole (`citations.style: 'custom'`, `citations.customStyle: '<style …>'`).
- **Locales**: en-US, en-GB, es-ES, fr-FR, de-DE, it-IT, pt-PT, pt-BR, ca-AD, nl-NL, zh-CN, zh-TW, ja-JP, ar.
- `postext-citeproc/catalog`: the style list alone (names, citation system, fields), for a picker that should not load the engine.

## Licences

This package is MIT. It depends on [citeproc-js](https://github.com/Juris-M/citeproc-js), © Frank Bennett, used under the Common Public Attribution License 1.0 (it is dual-licensed CPAL 1.0 / AGPL 1.0). The bundled styles and locales are from the [Citation Style Language](https://citationstyles.org/) project, CC BY-SA 3.0. See `THIRD_PARTY_LICENSES.md`.
