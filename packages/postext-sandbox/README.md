# postext-sandbox

Interactive sandbox UI for experimenting with the [Postext](https://postext.dev/) layout engine.

## Install

```bash
npm install postext-sandbox
```

Requires React >= 18 and `postext` as peer dependencies.

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

Loads a single font family from Google Fonts. Returns a promise that resolves when the font is usable.

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

## License

MIT
