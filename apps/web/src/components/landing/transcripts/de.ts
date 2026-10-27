// The German cut of each narrated video, block by block.
import type { TranscriptBlock, TranscriptVideo } from "../transcripts";

export const TRANSCRIPTS_DE: Record<TranscriptVideo, TranscriptBlock[]> = {
  showreel: [
    {
      time: "0:00",
      scene: "Eine dunkle Karte zeigt „MAINZ · 1455“ über einer feinen goldenen Linie. Hinter der Schlagzeile „Fünf Jahrhunderte lang lernte der Buchdruck, Seiten zu setzen.“ zählt die Jahreszahl in riesigen Konturziffern von 1455 bis 2026 hoch, und ringsum landen Begriffe aus dem Druckwesen: Blocksatz, Kerning, Witwen, Waisen, Spaltenausgleich, Zeilenabstand, Grundlinienraster, Sil·ben·tren·nung, Zeilenlänge, Gleitobjekte, Kolumnentitel, Gießbäche. Die Kamera fährt in den Schlusspunkt hinein, der den Bildschirm mit Gold flutet.",
      narration: "Fünf Jahrhunderte lang hat der Buchdruck gelernt, eine Seite zu setzen.",
    },
    {
      time: "0:06",
      scene: "Schlagzeile: „Das Web lernte, Oberflächen zu gestalten. Seiten zu setzen, lernte es nie.“ Ein Browserfenster mit der Adresse example.com/longform/article zeigt einen dreispaltigen Artikel im Blocksatz, „Warum das Web scheitert“; rote Etiketten markieren Gießbäche aus Weißraum, eine Waise, eine Witwe, ein Bild, das auf dem Text landet, und eine unausgeglichene letzte Spalte. Daneben zeigt ein Code-Chip „column-count: 3;“, dann „…und kaum mehr.“ und eine durchgestrichene Liste derselben fünf Fehler: Gießbäche, Waisen, Witwen, Kollisionen, Unausgeglichene Spalten. Das Fenster flackert und fällt in sich zusammen.",
      narration: "Das Web hat gelernt, Oberflächen zu gestalten. Nie Seiten. Deshalb bricht langer Text noch immer auseinander: Gießbäche, Witwen, Waisen, Kollisionen.",
    },
    {
      time: "0:18",
      scene: "Nach einem weißen Blitz und einem Wisch aus blauen, goldenen und roten Streifen steigen Logo und Schriftzug von Postext an ihren Platz, mit dem Slogan „Das programmierbare Satzsystem für das Web“. Darunter: OPEN SOURCE · MIT-LIZENZ · v1.33.8 · LÄUFT IN IHREM BROWSER.",
      narration: "Das ist Postext: das programmierbare Satzsystem für das Web.",
    },
    {
      time: "0:24",
      scene: "Abschnitt 01 von 07, „Der Inhalt“: „Markdown sagt, was die Dinge sind.“ Eine Markdown-Datei, 03-warum-postext.md, schreibt sich von selbst: eine Teil-Direktive, die Überschrift „Warum Postext“ mit einem Vorspann, ein Absatz, der mit :ref auf die Abbildung fig-flow verweist, eine Zeile ::resource und ein Block :::callout. Daneben ruft config.ts buildDocument mit einem zweispaltigen Layout, Grundtext im Blocksatz und Silbentrennung für „de“ auf, unter dem Satz „Die Konfiguration bestimmt das Aussehen. Der Text enthält keine einzige Layoutentscheidung.“",
      narration: "Sie schreiben semantisches Markdown, das sagt, was die Dinge sind. Die Konfiguration entscheidet, wie sie aussehen.",
    },
    {
      time: "0:33",
      scene: "Abschnitt 02, „Pretext misst“: „Gemessen, ohne DOM-Zugriff.“ Eine Überschrift, ein Absatz und ein Kasten werden nacheinander abgetastet, und Maßlinien geben ihre Höhe in Punkt an; ein Code-Feld zeigt prepare(text, '25px Lora') und layout(prepared, width, 38), die eine Höhe und eine Zeilenzahl zurückgeben. Zwei Balken liefern sich ein Rennen durch 10.000 Absätze: „Umbruch im Browser · DOM“ kommt kaum voran, während sich „Pretext · Canvas + Arithmetik“ auf einen Schlag füllt, und ein Zähler klettert auf 600× über „schnellere Textmessung als mit dem DOM, damit ein ganzes Buch beim Tippen neu umbricht.“ und „Basiert auf @chenglou/pretext“.",
      narration: "Jeder Absatz wird gemessen, ohne das DOM anzufassen, bis zu sechshundertmal schneller, dank Pretext, der Bibliothek, die das möglich gemacht hat.",
    },
    {
      time: "0:43",
      scene: "Abschnitt 03, „Postext entscheidet“: „Jede Zeile steht, bevor ein Pixel gezeichnet ist.“ Ein Ring aus sieben Segmenten leuchtet der Reihe nach auf, Struktur, Messung, Platzierung, Gleiten, Feinschliff, Ausgleich und Rhythmus, jedes mit einer einzeiligen Beschreibung, während sich daneben eine zweispaltige Seite des Postext-Leitfadens zusammensetzt: Beschriftete Blöcke fliegen in ihre Spalten, eine Abbildung gleitet unter der Notiz „:ref{id=\"fig-flow\"} → Spaltenfuß“ an ihren Platz, das Farbband des Kapitelauftakts fällt herein, die Zeilen erscheinen, die Spalten gleichen sich aus, und ein Grundlinienraster streicht über die Seite nach unten. Der Ring durchläuft die Iterationen 1 bis 3 und zeigt mit einem Häkchen „Nach 3 Iterationen stabil“; eine Beschriftung gibt den Begrenzungsrahmen und die Grundlinie einer Zeile an.",
      narration: "Dann entscheidet Postext. Sieben Durchgänge platzieren jede Zeile, bringen jede Abbildung an ihren Platz und gleichen die Spalten aus, bis sich nichts mehr bewegt.",
    },
    {
      time: "0:55",
      scene: "Abschnitt 04, „Das virtuelle Dokument“: „Ändern Sie ein Wort. Nur das Geänderte wird neu gesetzt.“, mit der Notiz „Wie das virtuelle DOM von React, aber für Seiten: der VDT, ein virtueller Dokumentbaum.“ Sieben Seiten, p. 7 bis p. 13, stehen in einer Reihe; eine Einfügemarke zeigt eine Änderung auf p. 11, der Rest dieser Spalte färbt sich golden und trägt UNGÜLTIG, und ein schmaler Rest fließt auf p. 12 über, die ein Häkchen und STABIL erhält, während die Seiten davor ÜBERSPRUNGEN und die danach UNBERÜHRT zeigen. Drei Aufzählungspunkte nennen die Regel, und ein Feld mit der Überschrift renderToHtmlIndexed() markiert die geänderten Knoten des Dokumentbaums als AKTUALISIERT.",
      narration: "Alles lebt in einem virtuellen Dokument, wie das virtuelle DOM von React. Ändern Sie ein Wort, und nur das Geänderte wird neu gesetzt.",
    },
    {
      time: "1:05",
      scene: "„Ein langes Dokument? Gezeichnet wird nur, was zu sehen ist.“ Eine Kolonne von Buchseiten läuft durch einen goldenen Rahmen mit der Aufschrift VIEWPORT, mit einem Rand von 200 Pixeln darüber und darunter: Seiten innerhalb werden vollständig gezeichnet, Seiten außerhalb sind gestrichelte Umrisse. Ein großer Zähler zeigt, wie viele der 51 Seiten in diesem Moment gezeichnet sind (IntersectionObserver · +200 px), neben „Geometrie: jede Seite. Pixel: nur, was Sie sehen.“",
      narration: "Und in einem langen Buch werden nur die Seiten gezeichnet, die auf dem Bildschirm sind.",
    },
    {
      time: "1:12",
      scene: "Abschnitt 05, „Knuth–Plass-Blocksatz“: „Jede Art, den Absatz umzubrechen. Auf einmal.“ Links, unter „Gierig · der Browser“, wird ein Absatz über den Zeilenumbruch so gesetzt, wie es ein Browser tut, mit der ersten passenden Lösung für jede Zeile, und seine lockersten Zeilen färben sich rot. Darunter wird jedes Wort zu einem Punkt auf einer Linie: Rote Bögen markieren die gierigen Umbrüche, blasse blaue Bögen probieren jeden möglichen Umbruch aus, und ein goldener Pfad wählt die beste Kombination. Rechts ist die Fassung „Knuth–Plass · Postext“ gleichmäßig verteilt, mit den Strafpunkten jeder Zeile, der Formel „(1 + Unschönheit + Strafe)²“ und einer niedrigeren Summe der Strafpunkte.",
      narration: "Ein Browser bricht Zeilen gierig um, eine nach der anderen. Postext nutzt Knuth-Plass, den Algorithmus von TeX: Er wägt jede Art ab, den ganzen Absatz umzubrechen, und wählt die gleichmäßigste.",
    },
    {
      time: "1:27",
      scene: "Abschnitt 06, „Ein Layout, fünf Ausgaben“: „Was Sie sehen, geht in den Druck.“ Unter der Codezeile const vdt = buildDocument(content, config); teilt sich eine Seite in fünf. Canvas (renderToCanvas(), pixelgenaue Bitmaps) bekommt eine Lupe über seinem Pixelraster; bei HTML (renderToHtml(), auswählbar, responsiv) wird jeder Block umrandet und mit <h1>, <p>, <figure> usw. beschriftet; bei PDF (renderToPdf(), druckfertig, PDF/UA, CMYK) gleiten vier Farbauszüge passgenau übereinander, dann erscheinen Schnittmarken und ein Farbkontrollstreifen. EPUB 3 (renderToEpub(), E-Book, fest oder umfließend) zeigt die Seite in einem E-Reader mit der Aufschrift „Festes Layout“; der Bildschirm schrumpft auf Handygröße, der Text bricht neu um, und die Aufschrift wechselt zu „Umfließend“. Folio (postext-folio, ein 3D-Buch zum Blättern) öffnet die Seite zu einer Doppelseite und blättert ein Blatt über den Rücken um.",
      narration: "Ein Layout, fünf Ausgaben: Canvas, HTML, druckfertiges PDF, EPUB 3, fest oder umfließend, und ein Buch in 3D. Was Sie sehen, geht genau so in den Druck.",
    },
    {
      time: "1:42",
      scene: "Abschnitt 07, „Warum ein offener Standard“: „LaTeX setzte den Maßstab im Druck. Heute wird auch auf jedem Bildschirm publiziert.“ Zwei Karten: LaTeX, 1984, mit Kreuzen bei „Für die gedruckte Seite gedacht“, „An Schriften und Pakete eines Rechners gebunden“, „Kompilieren, warten, wiederholen“ und „Kein redaktionelles Layout im responsiven Web“; Postext, 2026, mit Häkchen bei „Web, Druck-PDF und EPUB 3 aus einem Layout“, „Eine einzige .postext-Datei enthält alles“, „Bricht live beim Tippen neu um“ und „In jedem Browser · ohne Server · MIT“. Die Postext-Karte leuchtet auf.",
      narration: "LaTeX hat den Standard für das Papier gesetzt. Aber heute lebt das Publizieren auf allen Bildschirmen.",
    },
    {
      time: "1:50",
      scene: "Dachzeile „Eine Datei, das ganze Buch“, Schlagzeile „Ein offener Standard fürs Publizieren, weiter, als LaTeX reicht.“ Ein Dateisymbol .postext zerfällt in fünf Teile: preset.json (Konfiguration & Gestaltung), chapters/*.md (ein Markdown je Kapitel), fonts/*.woff2 (die Schriften selbst), images/ · SVG (jedes Bild, eingebettet) und resources (Tabellen, Abb., Legenden). Bildtext: „Ein gewöhnliches ZIP: offen, dokumentiert, MIT-lizenziert. Jedes Werkzeug kann es lesen und schreiben.“",
      narration: "Postext ist ein offener Standard: eine einzige portable Datei, dokumentiert und unter MIT-Lizenz, die jedes Werkzeug lesen und schreiben kann.",
    },
    {
      time: "2:02",
      scene: "„Das Beispiel · gesetzt von der echten Engine“: Eine Wand aus Seiten der deutschen Ausgabe des Leitfadens weicht perspektivisch zurück, während ein Zähler 51 Seiten erreicht. Text: „11 Kapitel, 3 Teile und der Umschlag, gesetzt in rund einer halben Sekunde. Jede Seite des Postext-Leitfadens, berechnet in einem Browser von postext v1.33.8 für diesen Film. Nichts von Hand gesetzt.“ Es folgen die Schlagwörter Lehrbücher, Magazine, Literarische Ausgaben, Kataloge.",
      narration: "Deshalb kann es Bücher mit Hunderten von Seiten in wenigen Zehntelsekunden setzen.",
    },
    {
      time: "2:09",
      scene: "Abspann: das Postext-Logo mit dem Slogan „Das programmierbare Satzsystem für das Web“, die Adresse postext.dev, eine Terminalzeile, die „$ pnpm add postext“ tippt, und die Fußzeile „Open Source · MIT · github.com/drnachio/postext“.",
      narration: "Postext. Open Source, auf postext.dev.",
    },
  ],
  tutorial: [
    {
      time: "0:00",
      scene: "Titelkarte: das Postext-Logo, die Dachzeile „Tutorial · 5 Schritte“ und der Titel „Ihre Publikation in Postext mit einem KI-Agenten. Ohne Code.“",
    },
    {
      time: "0:03",
      scene: "„Ihre Publikation gibt es schon.“ Drei Umschläge fallen nacheinander herein, jeder mit seinem Etikett: ein Buch, „Beate und Mareile“ von Eduard von Keyserling, mit InDesign (IDML); ein Handbuch, die Bedienungsanleitung des Wasserkochers Verra W1, mit Word (DOCX); und eine Zeitschrift, FALLOW, mit PDF. Sie sammeln sich links, ein gestrichelter goldener Pfeil läuft durch ein Abzeichen „KI-Agent“, und ein Dateisymbol namens mein-buch.postext erscheint, unter „Ein Agent überführt sie in Postext. Fünf Schritte. Ein paar gut formulierte Anfragen.“",
      narration: "Sie haben schon eine Publikation: ein Buch, ein Handbuch, eine Zeitschrift. Sie liegt in InDesign, in Word oder in einem PDF. In diesem Tutorial überführt ein KI-Agent sie für Sie in Postext. Ohne Code: nur fünf Schritte und ein paar gut formulierte Anfragen.",
    },
    {
      time: "0:22",
      scene: "„Der Plan“: Fünf nummerierte Karten erscheinen, während jeder Schritt genannt wird: 01 Ordner vorbereiten, 02 Vektororiginale mitbringen, 03 Referenz hinzufügen, 04 Den Agenten beauftragen, 05 In der Sandbox prüfen.",
      narration: "Der Plan: den Ordner vorbereiten, die Vektororiginale sammeln, eine Referenz hinzufügen, den Agenten beauftragen und das Ergebnis prüfen.",
    },
    {
      time: "0:34",
      scene: "Schritt 01, der Ordner: „Ein Projekt, ein Ordner.“ Ein großer Ordner, mein-buch/, schwebt zwischen zehn losen Dateien wie MinionPro-Regular.otf, umschlag.jpg, abb-2-1.ai, kapitel-01.docx, karte.svg, buch.idml und diagramm.pdf. Ein Fenster mit dem Ordnerbaum öffnet sich, und jede Datei fliegt in ihren Unterordner, sobald er genannt wird: referenz.pdf (so soll es aussehen → Schritt 03), schriften/ (Minion Pro, Myriad…, .otf .ttf .woff2), bilder/ (Fotos, .jpg .png), illustrationen/ (Vektororiginale, .ai .svg .pdf) und texte/ (Word, InDesign IDML…).",
      narration: "Schritt eins: Legen Sie alles in einen einzigen Ordner auf Ihrem Computer. Ein Projekt, ein Ordner. Darin bekommt jede Art von Material einen eigenen Unterordner: die Schriften, die Bilder, die Illustrationen und die Texte.",
    },
    {
      time: "0:51",
      scene: "Die Zeile schriften/ wird hervorgehoben, und eine Karte mit der Überschrift „Schriften“ zeigt ein großes „Aa“, die Schnitte Normal, Kursiv und Fett, die Formate OTF, TTF und WOFF2 und den Hinweis „Nur beigelegte Schriften sind nutzbar.“ Dann „Je ordentlicher, desto weniger Raten.“, während jeder Unterordner im Baum ein Häkchen bekommt.",
      narration: "Denken Sie an die Schriften: Sie sind die Stimme der Gestaltung, und der Agent kann nur die nutzen, die Sie beilegen. Je ordentlicher der Ordner ist, desto weniger muss der Agent raten.",
    },
    {
      time: "1:03",
      scene: "Schritt 02, Vektororiginale: „Nehmen Sie die Originale.“ Ein Diagramm, ein Schaubild und eine Karte werden als Strichzeichnungen mit sichtbaren Ankerpunkten gezeichnet, und drei Dateisymbole erscheinen: .ai Illustrator, .svg SVG und .pdf PDF.",
      narration: "Schritt zwei: Wenn Ihre Illustrationen Vektorgrafiken sind, etwa Diagramme, Schaubilder oder Karten, suchen Sie die Originaldateien: Illustrator, SVG oder PDF.",
    },
    {
      time: "1:16",
      scene: "Zwei Felder zeigen dieselbe Abbildung, ein Diagramm, in dem Manuskript und Vorlage beide auf Seiten zeigen, mit der Bildunterschrift „Abb. 2.1 Inhalt und Gestaltung treffen sich.“ Links wird „PDF-Ausschnitt: ein Foto der Zeichnung“ beim Hineinzoomen unscharf und pixelig; rechts bleibt „Das Original: die Zeichnung selbst“ scharf. Das linke Feld blendet aus, die Beschriftungen des Originals werden auf Englisch neu getippt (Manuscript, Template, Pages), Schnittmarken rahmen es ein, und drei Häkchen stehen bei „Scharf in jeder Größe“, „Text bleibt Text“ und „Original → Druckerei“.",
      narration: "Eine aus dem fertigen PDF ausgeschnittene Abbildung ist kaum mehr als ein Foto der Zeichnung. Das Original ist die Zeichnung selbst. Damit baut der Agent jede Abbildung neu auf: scharf in jeder Größe, mit Beschriftungen als echtem Text, bereit zum Übersetzen. Und in den Druck geht das Original unverändert.",
    },
    {
      time: "1:39",
      scene: "Schritt 03, die Referenz: „So soll es aussehen.“ Im Ordnerbaum wird referenz.pdf hervorgehoben und mit „Im Hauptordner“ markiert; eine Seite fliegt heraus und wird zu einer großen zweispaltigen Buchseite mit der Kennzeichnung referenz.pdf.",
      narration: "Schritt drei ist entscheidend: Legen Sie in den Hauptordner eine Datei, die klar zeigt, wie das fertige Produkt aussehen soll. Ideal ist ein PDF.",
    },
    {
      time: "1:49",
      scene: "Über der Seite erscheinen Maße: Spaltenumrisse, „Spaltenabstand 9 mm“, „Rand 20 mm“, Beschriftungen für die Überschrift (Fraunces 28 pt), den Text (Lora 9,4/13,6 pt) und einen Kasten (Fläche, 1 Linie) sowie Grundlinien mit „Zeilenabstand 13,6 pt“. Eine Datei, gestaltungsvorgaben.md, füllt sich: Seite 210 × 280 mm; Ränder 24 · 20 · 22 · 20 mm, gespiegelt; Spalten 2 · Abstand 9 mm; Grundlinienraster 13,6 pt; Grundtext Lora 9,4 / 13,6 pt, Blocksatz; Überschriften Fraunces 28 pt · Geist; Auftakte Farbband, 101 mm; Kästen Fläche + Linie links. Dann wird das Wort „Raten“ durchgestrichen, und „Messen.“ leuchtet golden auf.",
      narration: "Der Agent liest die Gestaltung an diesen Seiten ab: Er misst Ränder, Spalten, Schriften und Abstände und hält sie als Layoutregeln fest. Ohne Referenz müsste er raten. Mit einer Referenz misst er.",
    },
    {
      time: "2:04",
      scene: "Schritt 04, der Agent: „Sagen Sie es mit Ihren Worten.“ Ein Fenster mit dem Titel „Agent · ~/mein-buch“ öffnet sich neben den Abzeichen Claude Code, Codex und „oder jeder andere Agent“. Eine Nachricht mit dem Absender SIE tippt sich: „Installiere den Postext-Skill: `npx skills add drnachio/postext --skill postext-port`“, und der Agent antwortet „✓ Skill installiert: postext-port“. Eine Karte zum Skill postext-port nennt „Ein erprobtes Verfahren“, „Alles über Postext“ und „Werkzeuge zur Selbstprüfung“.",
      narration: "Schritt vier: Öffnen Sie Ihren Agenten, Claude Code, Codex oder welchen Sie auch nutzen, in diesem Ordner, und lassen Sie ihn den Postext-Skill installieren. Ein Skill ist ein Paket aus Fachwissen. Dieser bringt dem Agenten bei, eine Publikation in Postext zu überführen, und gibt ihm Werkzeuge, um seine eigene Arbeit zu prüfen.",
    },
    {
      time: "2:26",
      scene: "Die nächste Anfrage tippt sich: „Verwende den Skill postext-port, um dieses Buch nach Postext zu überführen. Die Gestaltung steht in referenz.pdf, die Schriften liegen in schriften/ und die Originalillustrationen in illustrationen/: Verwende sie, statt Abbildungen aus dem PDF auszuschneiden. Beginne nur mit Kapitel 1 und zeig mir die Gestaltungsvorgaben, bevor du es baust.“ Daneben leuchten referenz.pdf, schriften/ und illustrationen/ im Ordnerbaum auf, sobald die Anfrage sie nennt, und eine Karte mit „Kap. 1“ springt auf.",
      narration: "Dann bitten Sie mit eigenen Worten um das, was Sie wollen. Sagen Sie ihm, wo Referenz, Schriften und Originale liegen, und dass er mit einem einzigen Kapitel beginnt.",
    },
    {
      time: "2:39",
      scene: "Ein Raster aus zwölf abgedunkelten Buchseiten; die erste ist golden umrandet. Ein kreisförmiger Pfeil zählt darauf die Runden, bis ein Häkchen erscheint, dann leuchten die übrigen elf auf. Darunter: Probekapitel → Verfeinern → Ausweiten.",
      narration: "Ist der Inhalt lang, beginnen Sie mit einem Probekapitel. Verfeinern Sie es, bis es perfekt ist, und erst dann übertragen Sie es auf den Rest.",
    },
    {
      time: "2:48",
      scene: "Der Agent fragt „Kopie oder Neugestaltung?“, „Welche Sprachen?“ und „Druck, Bildschirm oder beides?“. Eine Checkliste geht Bestand aufnehmen, Gestaltung messen, Text extrahieren, Schriften und Bilder, Seite für Seite vergleichen und Datei packen durch, und die Datei mein-buch.postext erscheint. Eine dritte Anfrage tippt sich: „Kapitel 1 ist freigegeben. Überführe die übrigen Kapitel mit derselben Gestaltung, vergleiche jedes mit referenz.pdf und pack alles in eine einzige .postext-Datei.“ Der Agent antwortet „✓ 12 Kapitel · 0 Warnungen · mein-buch.postext“.",
      narration: "Der Agent stellt ein paar Fragen: getreue Kopie oder Neugestaltung, welche Sprachen, Papier oder Bildschirm. Dann misst er, extrahiert, baut zusammen, prüft und übergibt Ihnen eine Postext-Datei. Stimmt das Probekapitel, ist das ganze Buch nur noch eine Anfrage mehr.",
    },
    {
      time: "3:13",
      scene: "Schritt 05, die Sandbox: „Prüfen Sie es, Seite für Seite.“ In einem Browserfenster wird die Adresse postext.dev/de/sandbox getippt. Der Mauszeiger klickt in der Seitenleiste auf Bücher, dann auf Neu, dann auf „Eine .postext-Datei öffnen …“; die Datei fliegt herein, „Mein Buch, 12 Kapitel · 184 Seiten“ erscheint oben in der Liste, und seine ersten Seiten öffnen sich in der Ansicht Canvas; die Tabs der Ansichten heißen Canvas, HTML, PDF, Folio und EPUB 3.",
      narration: "Schritt fünf: Öffnen Sie die Sandbox auf postext.dev. Unter Bücher wählen Sie Neu und öffnen Ihre Datei.",
    },
    {
      time: "3:22",
      scene: "Die Referenzseite und die Postext-Seite stehen nebeneinander, beschriftet mit Referenz und Postext, und eine goldene Linie tastet beide von oben nach unten ab. Das Bedienfeld Prüfungen öffnet sich mit einem Zähler von 3 und listet Witwe (S. 4), Zu lockere Zeile (S. 7) und Abbildung passt nicht (S. 9) auf; rote Rahmen markieren jedes Problem auf der Postext-Seite.",
      narration: "Gehen Sie das Buch Seite für Seite durch, neben Ihrer Referenz. Das Bedienfeld Prüfungen zeigt Ihnen die Probleme: Witwen, zu lockere Zeilen, Abbildungen, die nicht passen.",
    },
    {
      time: "3:34",
      scene: "Zwei Reihen von Seitenskizzen, „Referenz · PDF“ und „Postext · fließend“. In der fließenden Reihe wandert eine Abbildung von der ersten Seite an den Kopf der zweiten, und eine gestrichelte Linie verbindet ihre beiden Positionen. Text: „Dieselben Regeln, nicht dieselben Seiten. Der Inhalt fließt: Eine Abbildung oder ein Seitenumbruch kann woanders landen.“ Dann verbindet ein Gleichheitszeichen jedes Seitenpaar unter „Was übereinstimmen muss“: Ränder und Grundlinienraster, Typografie, Stil von Abbildungen und Kästen, Saubere Seiten: keine Witwen, ausgeglichene Spalten. Ein rotes Feld mit ≠ sagt „Kleine Entscheidungen von Hand“ und darunter „keine Regeln: für wechselnden Inhalt untauglich“.",
      narration: "Eines sollten Sie bedenken: Die Seiten müssen nicht mit denen Ihres PDFs identisch sein. Postext hat die Layoutregeln verstanden, und Ihr Inhalt fließt jetzt, also kann eine Abbildung oder ein Seitenumbruch woanders landen. Übereinstimmen muss die Qualität: derselbe Anspruch an die Herstellung. Wer von Hand setzt, trifft kleine handwerkliche Entscheidungen, die keine Regeln sind. Und nur mit Regeln lässt sich ein Inhalt setzen, der sich ändert.",
    },
    {
      time: "4:03",
      scene: "Das Agentenfenster kehrt mit einer vierten Anfrage zurück: „In der Sandbox, Kapitel 2, Seite 7: Der Kasten ‚Merke‘ wird auf zwei Spalten verteilt, und der Kolumnentitel fehlt. Prüfungen meldet 3 zu lockere Zeilen. Behebe das und pack die Datei neu.“ Ein Screenshot ist angehängt, screenshot-kap2-s7.png. Dann läuft eine Schleife zwischen Sandbox (prüfen) und Agent (korrigieren) durch die Runden 1 bis 3, während die Zahl der Warnungen von 3 auf 0 fällt, und endet mit einem Häkchen und „Genau richtig.“",
      narration: "Dann sagen Sie dem Agenten so genau wie möglich, was Sie sehen: das Kapitel, die Seite und was nicht stimmt. Ein Screenshot hilft. Öffnen Sie die neue Fassung, prüfen Sie erneut und wiederholen Sie das. Mit jeder Runde kommen Sie näher, bis alles perfekt ist.",
    },
    {
      time: "4:23",
      scene: "„Nicht nur eine Postext-Fassung.“ Die Datei mein-buch.postext teilt sich entlang einer goldenen Linie in zwei. Links Inhalt (was es sagt): chapters/de/02-die-zelle.md mit der Überschrift „Die Zelle“, einem Satz, der auf die Abbildung fig-zelle verweist, und einem Kasten „merke“. Rechts Form (wie es aussieht): eine „Vorlage · aus Ihrem Original abgeleitet“ mit gespiegelten Seiten von 210 × 280 mm, 2 Spalten mit 9 mm Abstand, Grundtext Lora 9,4/13,6 im Blocksatz, nummerierten Überschriften in Fraunces, Kästen „Merke“ mit Fläche und Linie und Abbildungen, die an den Spaltenkopf gehen.",
      narration: "Und das Beste: Sie haben nicht nur Ihren Inhalt in Postext. Sie haben Inhalt und Form getrennt. Der Text lebt in sauberen Kapiteln, die Gestaltung in einer Vorlage, mit Layoutregeln aus Ihrem Original.",
    },
    {
      time: "4:37",
      scene: "Über einer Reihe von Buchseiten leuchten die Chips Korrigieren, Erweitern und Übersetzen auf: Eine Zeile wird hervorgehoben und ein Schimmer zieht über die Seiten, zwei weitere Seiten gleiten herein, und die Seiten blättern zur englischen Ausgabe um. Eine Anfrage tippt sich: „Füge eine englische Ausgabe hinzu: Übersetze die Kapitel, die Legenden und die Beschriftungen der Diagramme, und behalte dieselbe Gestaltung bei.“ Bildtext: „Dieselben Regeln. Neuer Inhalt. Die Seiten setzen sich selbst.“ Dann „Eine Datei, das ganze Buch.“: Ein .postext-Symbol verzweigt sich zu einer Seite mit Schnittmarken, „Druckfertiges PDF“, einem E-Reader, dessen Text sich an seinen Bildschirm anpasst, „E-Book (EPUB)“, einem Browserfenster, „Web-Reader“, und einem Seitenpaar, „Jede Seite gesetzt“.",
      narration: "Wenn sich Ihr Inhalt also ändert, wenn Sie ihn korrigieren, erweitern oder übersetzen, müssen Sie sich um das Layout nicht kümmern. Postext setzt ihn neu, nach denselben Regeln. Eine einzige Datei für das ganze Buch: ein druckfertiges PDF, ein E-Book im EPUB-Format, ein Reader für das Web und Seiten, die sich selbst setzen.",
    },
    {
      time: "5:01",
      scene: "Abspann: das Postext-Logo, der Slogan „Das programmierbare Satzsystem für das Web“, postext.dev, eine Pille mit „Die Prompts aus diesem Video stehen in der Beschreibung ↓“ und die Fußzeile „Open Source · MIT · github.com/drnachio/postext“.",
      narration: "Postext. Open Source, auf postext.dev. Die Beispiel-Prompts finden Sie in der Beschreibung.",
    },
  ],
};
