# Credits — Pepper&Carrot · Pepper's Birthday Party

Showcase preset for the Postext sandbox: episode 8 of the webcomic Pepper&Carrot (June 2015), in eight
languages, re-lettered and re-laid out by Postext.

## The comic

Based on the webcomic Pepper&Carrot by David Revoy. https://www.peppercarrot.com
Licensed under the Creative Commons Attribution 4.0. https://creativecommons.org/licenses/by/4.0/
Based on the universe of Hereva created by David Revoy with contributions by Craig Maloney.
Corrections by Willem Sonke, Moini, Hali, CGand and Alex Gryson.

Art & Scenario: David Revoy. Episode sources: https://www.peppercarrot.com/0_sources/ep08_Pepper-s-Birthday-Party/

## Translations

| edition | title | credits |
| --- | --- | --- |
| `en` | Episode 8: Pepper's Birthday Party | Art & Scenario: David Revoy — Translation: Alex Gryson |
| `es` | Episodio 8: El cumpleaños de Pimienta | Art & Scenario: David Revoy — Translation: Juanjo Faico — Contribution: Andrej Ficko, Hồ Nhựt Châu |
| `ca` | Episodi 8: La festa d'aniversari de la Pepper | Art & Scenario: David Revoy — Translation: Juan José Segura |
| `fr` | Épisode 8 : L'anniversaire de Pepper | Art & Scenario: David Revoy (original version) — Proofreading: Aurélien Gâteau |
| `pt-BR` | Episódio 8: A Festa de Aniversário da Pepper | Art & Scenario: David Revoy — Translation: Frederico Batista — Proofreading: Alexandre E. Almeida |
| `ja` | エピソード 8: ペッパーの誕生パーティー | Art & Scenario: David Revoy — Translation: guruguru — Contribution: Hồ Nhựt Châu |
| `zh-Hans` | 第8集：小辣椒的生日 | Art & Scenario: David Revoy — Translation: Ran Zhuang |
| `ar` | حلقة ٨ : حفلةُ عيدِ ميلادِ فُلفُل | Art & Scenario: David Revoy — Translation: Mahwiii |

## Changes

The pictures are David Revoy's text-free art (`hi-res/gfx-only`), cut into one picture per panel and
scaled to 1200 px. The words come from each translation's Inkscape SVG; the balloons, their tails and
the lettering are new, laid out by the Postext engine. Speaker anchors, faces and safe areas were
marked for the port. The title page and the credits page are new.

## Fonts

All under the SIL Open Font License 1.1, from google/fonts; the Chinese, Japanese and Arabic faces are
subset. Comic Neue, Zen Antique, ZCOOL KuaiLe and Playpen Sans Arabic carry letters composed from
their own glyphs (ồ ự for a translator's name, ŗ for the monsters' voice), which they lack; none
of these faces has a Reserved Font Name.

- comicneue: `fonts/ComicNeue-OFL.txt`
- bangers: `fonts/Bangers-OFL.txt`
- zenantique: `fonts/ZenAntique-OFL.txt`
- delagothicone: `fonts/DelaGothicOne-OFL.txt`
- notosansjp: `fonts/NotoSansJP-OFL.txt`
- notosanssc: `fonts/NotoSansSC-OFL.txt`
- zcoolkuaile: `fonts/ZCOOLKuaiLe-OFL.txt`
- playpensansarabic: `fonts/PlaypenSansArabic-OFL.txt`
- lalezar: `fonts/Lalezar-OFL.txt`

## Build

`scripts/presets/showcase/pepper-carrot/` in the Postext repository: `fetch.py`, `fonts.py`, `panels.py`,
`anchors.py`, `manifest.py` and `text.py` prepare the pictures and the text, `build.py` writes this
bundle.
