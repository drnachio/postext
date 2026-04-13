# postext

**A programmable typesetter for the web.**

postext is a layout engine that takes semantic content — enriched markdown with referenced resources — and applies professional editorial layout rules to produce publication-grade output. Built on top of [`@chenglou/pretext`](https://github.com/chenglou/pretext) for DOM-free, pixel-perfect text measurement.

> **Active development** — postext is under very active development and undergoing frequent changes. The team is working intensively on it. We will announce when a first stable version is available. In the meantime, the project is published so everyone can follow its evolution, but we do not recommend using it in production yet as configuration changes are frequent.

**Website:** [postext.dev](https://postext.dev/)

## Install

```bash
npm install postext
```

Requires React >= 18 as a peer dependency.

## Quick Example

```tsx
import { createLayout } from 'postext';
import type { PostextContent, PostextConfig } from 'postext';

const content: PostextContent = {
  markdown: '# My Article\n\nFirst paragraph of the article...',
  resources: [
    {
      id: 'hero',
      type: 'image',
      src: '/images/hero.jpg',
      alt: 'Hero image',
      caption: 'Photo by Jane Doe',
    },
  ],
  notes: [
    {
      id: 'note-1',
      type: 'footnote',
      content: 'See the original study for details.',
    },
  ],
};

const config: PostextConfig = {
  columns: 3,
  gutter: '24px',
  typography: {
    orphans: 2,
    widows: 2,
    hyphenation: true,
  },
  references: {
    footnotes: { placement: 'columnBottom', marker: 'number' },
  },
};

const Layout = createLayout(content, config);
```

## With pretext

postext is designed to work alongside [`@chenglou/pretext`](https://github.com/chenglou/pretext). **pretext** measures how much space text needs (DOM-free, 300-600x faster than DOM measurement). **postext** uses those measurements to make editorial layout decisions.

```ts
import { prepare, layout } from '@chenglou/pretext';
import { createLayout } from 'postext';

// pretext: measure text dimensions
const prepared = prepare(paragraphText, '16px/1.5 Inter');
const { height } = layout(prepared, columnWidth, 24);

// postext: apply layout rules
const Layout = createLayout(content, config);
```

## API

### `createLayout(content, config?)`

Returns a React component that renders the laid-out content.

| Parameter | Type | Description |
|---|---|---|
| `content` | `PostextContent` | The semantic content to lay out |
| `config` | `PostextConfig` | Optional layout configuration |

### Types

#### `PostextContent`

The input content structure.

| Field | Type | Description |
|---|---|---|
| `markdown` | `string` | Main content in enriched markdown |
| `resources?` | `PostextResource[]` | Images, tables, figures, pull quotes |
| `notes?` | `PostextNote[]` | Footnotes, endnotes, margin notes |

#### `PostextResource`

An embeddable resource referenced within the content.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier |
| `type` | `'image' \| 'table' \| 'figure' \| 'pullQuote'` | Resource type |
| `src?` | `string` | Source URL (for images) |
| `alt?` | `string` | Alt text |
| `caption?` | `string` | Caption text |
| `content?` | `string` | Inline content (for tables/pull quotes) |
| `width?` | `number` | Width in pixels |
| `height?` | `number` | Height in pixels |

#### `PostextNote`

A reference note attached to the content.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier |
| `type` | `'footnote' \| 'endnote' \| 'marginNote'` | Note type |
| `content` | `string` | Note content |
| `marker?` | `string` | Custom marker (defaults to auto-numbering) |

#### `PostextConfig`

Top-level layout configuration.

| Field | Type | Description |
|---|---|---|
| `page?` | `PageConfig` | Page dimensions and margins |
| `layout?` | `LayoutConfig` | General layout settings |
| `bodyText?` | `BodyTextConfig` | Body text font, size, and line height |
| `headings?` | `HeadingsConfig` | Heading styles configuration |
| `columns?` | `number` | Number of columns |
| `gutter?` | `string` | Space between columns (e.g., `'24px'`) |
| `columnConfig?` | `ColumnConfig` | Detailed column settings |
| `resourcePlacement?` | `ResourcePlacementConfig` | Resource placement strategy |
| `typography?` | `TypographyConfig` | Typographic quality rules |
| `references?` | `ReferenceConfig` | Footnote/endnote/numbering settings |
| `sectionOverrides?` | `PostextSectionOverride[]` | Per-section rule overrides |
| `renderer?` | `'web' \| 'pdf'` | Output format |

#### `ColumnConfig`

| Field | Type | Description |
|---|---|---|
| `count?` | `number` | Number of columns |
| `gutter?` | `string` | Space between columns |
| `columnRule?` | `{ width?, style?, color? }` | Visual rule between columns |
| `balancing?` | `boolean` | Equalize column heights |

#### `ResourcePlacementConfig`

| Field | Type | Description |
|---|---|---|
| `defaultStrategy?` | `PlacementStrategy` | Default placement strategy |
| `deferPlacement?` | `boolean` | Find next available position if resource doesn't fit |
| `preserveAspectRatio?` | `boolean` | Maintain aspect ratio when sizing |

#### `PlacementStrategy`

```ts
type PlacementStrategy =
  | 'topOfColumn'
  | 'inline'
  | 'floatLeft'
  | 'floatRight'
  | 'fullWidthBreak'
  | 'margin';
```

#### `TypographyConfig`

| Field | Type | Description |
|---|---|---|
| `orphans?` | `number` | Min lines at top of column |
| `widows?` | `number` | Min lines at bottom of column |
| `hyphenation?` | `boolean` | Enable hyphenation |
| `ragOptimization?` | `boolean` | Minimize ragged right edges |
| `spacing?` | `object` | Space before/after headings, figures, block quotes |
| `keepTogether?` | `object` | Keep heading with paragraph, figure with caption |

#### `ReferenceConfig`

| Field | Type | Description |
|---|---|---|
| `footnotes?` | `{ placement?, marker? }` | Footnote placement and marker style |
| `figureNumbering?` | `boolean` | Auto-number figures |
| `tableNumbering?` | `boolean` | Auto-number tables |
| `marginNotes?` | `boolean` | Enable margin notes |

#### `PostextSectionOverride`

| Field | Type | Description |
|---|---|---|
| `selector` | `string` | CSS selector or content marker |
| `columns?` | `ColumnConfig` | Column overrides for this section |
| `typography?` | `TypographyConfig` | Typography overrides |
| `resourcePlacement?` | `ResourcePlacementConfig` | Placement overrides |

## Full Documentation

Visit [postext.dev](https://postext.dev/) for the full documentation, project vision, architecture, and roadmap. For contributing guidelines, see the [GitHub repository](https://github.com/drnachio/postext).

## License

MIT
