# postext-sandbox

Interactive sandbox UI for experimenting with the [Postext](https://postext.dev/) layout engine: the [Sandbox](https://postext.dev/en/sandbox) of postext.dev, with its books and chapters, Markdown editor, Design, Resources, Fonts and Checks panels, Canvas, PDF, Folio, HTML and EPUB 3 previews (with the book's exercises answerable in the HTML and EPUB tabs), and a SCORM tab that packages the chapters and sections you pick for a learning platform.

## Install

The package is not published to npm. It is a package of this monorepo that the website (`apps/web`) embeds as `"postext-sandbox": "workspace:*"`. Its peer dependencies are React and React DOM (>= 18) and `postext`. See [Embedding the Sandbox](https://postext.dev/en/docs/sandbox-embedding) for its props.

## Usage

```tsx
import { PostextSandbox } from 'postext-sandbox';

function App() {
  return (
    <PostextSandbox
      initialMarkdown="# Hello\n\nStart typing..."
      initialConfig={{ bodyText: { fontFamily: 'EB Garamond' } }}
    />
  );
}
```

The sandbox component automatically loads all fonts referenced in the configuration before rendering content, preventing any flash of unstyled text (FOUT).

## Font Preloading

When using Postext outside the sandbox component, you can use the font preloading utilities to ensure fonts are loaded before rendering:

### `preloadConfigFonts(config)`

Loads all fonts referenced in a `PostextConfig` and returns a promise that resolves when they are ready.

```ts
import { preloadConfigFonts } from 'postext-sandbox';
import type { PostextConfig } from 'postext';

const config: PostextConfig = {
  bodyText: { fontFamily: 'EB Garamond' },
  headings: { fontFamily: 'Open Sans' },
};

// Wait for all config fonts to be loaded before rendering
await preloadConfigFonts(config);
```

### `loadFont(family)`

Loads a single font family from Google Fonts, or from Fontsource when Google Fonts does not have it (Commit Mono, FiraGO). Returns a promise that resolves when the font is usable.

```ts
import { loadFont } from 'postext-sandbox';

await loadFont('Playfair Display');
```

Fonts are cached — calling `loadFont` with the same family multiple times returns the same promise and does not create duplicate requests.

### `getConfigFontFamilies(config)`

Extracts all font family names referenced in a config (body text, headings, lists, and their per-level overrides).

```ts
import { getConfigFontFamilies } from 'postext-sandbox';

const families = getConfigFontFamilies(config);
// => ['EB Garamond', 'Open Sans']
```

## WebMCP

The Sandbox registers its tools for an agent in the browser through WebMCP (`document.modelContext`) unless `webmcp={false}`. `postext-sandbox/webmcp` holds only the browser side (`registerWebMcpTools`, `runTool`, `validateArgs`) and imports nothing of the Sandbox, so a host page registers its own tools with it. See [WebMCP](https://postext.dev/en/docs/webmcp).

## License

MIT
