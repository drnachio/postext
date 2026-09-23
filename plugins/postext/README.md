# Postext plugin: `postext-port` skill

Port an existing publication into [Postext](https://postext.dev), the
programmable typesetter for the web. The plugin works from a PDF, Word,
PowerPoint, EPUB, HTML, InDesign (IDML), LaTeX, XML or scanned source. It
produces a Postext project that follows the original's layout rules:

- a measured configuration manifest (page geometry, baseline grid, type,
  openers, running heads, boxes, floats, tables, parts);
- curated chapters in Postext Markdown;
- resources and fonts.

The project opens in the [Postext sandbox](https://postext.dev/en/sandbox) as
a `.postext` file.

- **Documentation:** https://postext.dev/en/docs/skill
- **Source and issues:** https://github.com/drnachio/postext
- **License:** MIT

## What it contains

One skill, [`postext-port`](skills/postext-port/SKILL.md), in the open
[Agent Skills](https://agentskills.io) format:

- **A workflow**: brief, inventory, measured spec sheet, scaffold, extract,
  curate, fonts and images, verify, pack.
- **References**:
  - the Postext document format and configuration, checked against the
    engine;
  - the project format;
  - a playbook per source format;
  - design analysis;
  - a catalogue of solved layout cases;
  - verification.
- **Local scripts** (Python and Node):
  - type-role PDF extraction and figure cutting;
  - pandoc and IDML converters;
  - font and image tools;
  - a project generator;
  - a linter;
  - a renderer that runs without a browser (built on the `postext` npm
    packages);
  - page-by-page comparison.

No hooks, no MCP servers, no background processes.

## Install

Claude Code:

```text
/plugin marketplace add drnachio/postext
/plugin install postext@postext
```

Any agent that supports Agent Skills (Codex, Cursor, Gemini CLI, Copilot,
OpenCode…), via [skills.sh](https://skills.sh):

```bash
npx skills add drnachio/postext --skill postext-port
```

## Example prompts

- "Port chapters 1–3 of `manual.pdf` to Postext, reproducing its two-column
  layout, chapter openers and boxes."
- "Convert `course.docx` into a Postext book; the Word styles 'Note' and
  'Activity' are boxes."
- "Turn `deck.pptx` into a Postext handout: slides become sections, speaker
  notes become the text."
- "We have the InDesign package (IDML + print PDF) of this textbook: build the
  Postext project for chapter 1 in Spanish and English."
- "This EPUB is a novel with verse and footnotes: make a column-and-a-half
  Postext edition with the notes in the margin."
- "Check my Postext project for Markdown and config mistakes and render it to
  PDF."

It is **not** meant for:

- writing a new book from scratch without a source (use Postext directly);
- converting a document to another format such as DOCX or HTML;
- editing the original PDF in place.

## Requirements

The scripts run locally:

- Python 3.10+ with `pymupdf`, `pillow`, `fonttools` and `brotli`;
- `pandoc` for Word, PowerPoint, EPUB and HTML sources;
- `poppler` for page images;
- Node 22.15+ with `postext postext-pdf react @pdf-lib/fontkit` installed
  in a tools folder, for the headless render.

## Privacy

The skill and its scripts collect no data and send nothing anywhere: they
read and write files in your working folder. The only network access is what
you run yourself to install dependencies (`pip`, `npm`, `brew`), or downloads
you ask the agent to make. See the Postext
[privacy policy](https://postext.dev/en/privacy-policy).

## Support

Open an issue at https://github.com/drnachio/postext/issues. When a port hits
a layout case the skill does not cover yet, a pull request that improves the
skill is very welcome.
