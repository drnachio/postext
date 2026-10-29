export const DEFAULT_MARKDOWN_DE = `---
title: "Postext"
subtitle: "Ein programmierbares Satzsystem für das Web"
author: "Ignacio Ferro"
publishDate: "2026-10-04"
---

# Postext {style="cover" toc="false" kicker="Quelloffene Layout-Engine · Der Leitfaden" publisher="postext.dev · MIT-Lizenz · Jede Seite dieses Buches hat Postext in Ihrem Browser gesetzt"}

# Inhalt {style="contents" toc="false"}

:::toc

:::callout{type="colophon"}
**Der Postext-Leitfaden** ist das Beispielbuch, das mit der Sandbox ausgeliefert wird. Er ist Rundgang durch die Engine und Vorführung zugleich: Der Umschlag, das Inhaltsverzeichnis, das sich selbst paginiert, die Teiltitel, die Kapitelauftakte, die Kolumnentitel, jede gleitende Abbildung und Tabelle – all das setzt Postext in Ihrem Browser, aus dem Markdown, das Sie im Editor öffnen können.

Gesetzt aus der Fraunces, der Lora, der Bricolage Grotesque, der Geist und der Geist Mono, bereitgestellt von Google Fonts. Die Diagramme sind schlichte SVG-Dateien, als Vektoren gezeichnet im Canvas, in der HTML-Ansicht und im PDF. Ändern Sie irgendetwas – ein Wort, einen Rand, eine Farbe der Palette –, und das Buch setzt sich neu.

Postext ist Open Source unter der MIT-Lizenz. Text © 2026 Ignacio Ferro und die Mitwirkenden von Postext.
:::

:::part{number="I" title="Grundlagen" palette="band=#2b4acb"}
1. Warum Postext
2. Wie die Engine arbeitet
:::

# Warum Postext {lead="Die Drucktypografie hat fünf Jahrhunderte lang gelernt, eine Seite zu setzen; Browser haben gelernt, eine Oberfläche anzuordnen. Postext bringt das eine zum anderen: eine Layout-Engine, die aus Markdown Seiten nach verlegerischen Maßstäben setzt." summary="Die Lücke zwischen Web und Seite und was sie schließt"}

Postext ist eine **quelloffene Layout-Engine**, die das Handwerk der professionellen Drucktypografie ins Web bringt. Sie nimmt **semantischen Inhalt** in erweitertem Markdown und ein Konfigurationsobjekt:index{term="Konfiguration"} entgegen und berechnet daraus ein vollständig aufgelöstes Layout, in dem jede Zeile, jede Überschrift, jede Abbildung und jede Tabelle eine genaue Position hat, gemessen in echten typografischen Einheiten. Dieses Layout zeichnen dann drei Renderer – eine Live-Vorschau im Canvas, positioniertes HTML und ein druckfertiges PDF –, die alle dieselbe Geometrie lesen: Was Sie auf dem Bildschirm sehen, geht genau so in den Druck. Aus denselben Seiten entsteht außerdem ein E-Book im Format EPUB 3.

Dieses Buch ist seine eigene Vorführung. Sein Umschlag, die Inhaltsseite, die sich selbst paginiert, die Teiltitel in vier Farben, das Band, mit dem jedes Kapitel beginnt, die Kolumnentitel oben auf diesen Seiten und jede Abbildung, die an ihren Platz gleitet: All das hat Postext gesetzt, in Ihrem Browser, vor einem Augenblick. Das Markdown sagt nur, was die Dinge sind, und die Konfiguration entscheidet, wie sie aussehen.

:::callout{type="try"}
Öffnen Sie das Bedienfeld **Text** und wählen Sie dieses Kapitel im Kapitelwähler an seinem Kopf. Ändern Sie ein Wort in diesem Absatz oder löschen Sie einen Satz: Die Seite setzt sich neu, die Spalten gleichen sich wieder aus, und die Seitenzahlen der folgenden Kapitel ziehen nach.
:::

Wenn Sie lieber zuerst zuschauen möchten, zeigt :ref{id="postext-showreel"} das Wichtigste in zwei Minuten; in der Folio-Ansicht läuft es auf der Seite selbst.

## Wie Sie dieses Buch lesen

Das Buch ist in vier Teile gegliedert. **Grundlagen**, der Teil, in dem Sie sich gerade befinden, erklärt, welches Problem Postext löst und wie die Engine aufgebaut ist: was hineingeht, was herauskommt und was dazwischen geschieht. **Das Handwerk** handelt von Typografie: wie eine Zeile gesetzt wird, wie eine Seite ihren Rahmen erhält, wohin Abbildungen, Tabellen und Kästen kommen, wie aus einer Reihe von Kapiteln ein Buch wird und wie ein Buch in mehreren Sprachen lebt. **Jenseits des Fließtexts** setzt Seiten, die kein Strom von Spalten sind: zusammengesetzte Seiten, Comics, Noten und Übungen. **In der Praxis** wendet sich den Werkzeugen zu: dem Dokumentformat, der Sandbox, den Ausgaben und dem Druck, der Kommandozeile und den Agenten und dem Projekt drumherum.

Jedes Kapitel beginnt mit einer kurzen Einführung auf seinem Band, und die meisten schließen ihre Abschnitte mit einem Kasten unter der Überschrift _In der Sandbox ausprobieren_: einem kleinen Experiment, das Sie an genau diesem Buch durchführen können, sofort, um die Funktion bei der Arbeit zu sehen. Dabei kann nichts kaputtgehen – **Original wiederherstellen …** im Menü der Zeile des Leitfadens im Bedienfeld **Bücher** stellt ihn so wieder her, wie er ausgeliefert wurde –, ändern Sie also nach Belieben.

## Anwendungslayout und editoriales Layout

Modernes CSS ist ein bemerkenswertes Werkzeug für Benutzeroberflächen. CSS wurde aber für das _Anwendungslayout_ entworfen, und langes Lesen braucht ein _editoriales Layout_. Das sind zwei verschiedene Probleme:

- **Anwendungslayout** ordnet interaktive Komponenten – Schaltflächen, Formulare, Karten, Navigation – in einem Viewport an, durch den der Leser frei scrollt
- **Editoriales Layout** lässt Text, Abbildungen, Tabellen und Kästen über eine Folge fester Seiten und Spalten fließen, nach Regeln, die in Jahrhunderten des Buchdrucks verfeinert wurden

Die Gegenüberstellung in :ref{id="feature-comparison"} fasst zusammen, wo die beiden Ansätze bei langen Dokumenten auseinandergehen. (Die Erwähnung genügt: Die Tabelle gleitet von selbst an die erste freie Stelle nach diesem Absatz.)

Der Unterschied ist grundsätzlicher, nicht gradueller Natur. Eine Oberfläche passt sich dem Fenster an, das sie enthält, und der Leser bewegt sich nach Belieben darin; eine Seite dagegen hat eine feste Größe, einen Anfang und ein Ende, und alles, was sie enthält, muss innerhalb dieser Grenzen aufgelöst werden: was in diese Spalte passt und was in die nächste wandert, wohin jede Abbildung kommt, wie jede Zeile und jeder Absatz endet.

Für das editoriale Layout hat die Plattform nie die Grundbausteine angeboten, auf die es ankommt:

1. **Ausgeglichene Spalten, die ihren Inhalt kennen.** Die CSS-Eigenschaft _columns_ lässt Text fließen, kann Spalten aber nicht angleichen, indem sie den Raum über Überschriften verändert oder einen Absatz lockerer setzt; sie kennt keine Abbildung oder Tabelle, die an den Kopf der nächsten freien Spalte gleiten muss, und sie kann eine Überschrift über einen Spaltenumbruch hinweg nicht bei dem Absatz halten, den sie einleitet.
2. **Fehler am Absatz- und Spaltenende.** _Waisen_ und _Witwen_ gibt es in CSS, aber die Browserunterstützung ist uneinheitlich, und sie sehen die Geometrie der ganzen Seite nicht; für eine _zu kurze Ausgangszeile_, das kurze Wort, das allein in der letzten Zeile eines Absatzes zurückbleibt, gibt es überhaupt keine Regel.
3. **Zeilenumbruch über den ganzen Absatz.** Browser brechen Zeilen gierig um, eine nach der anderen, und können den übrigen Raum nur innerhalb jeder Zeile verteilen, während ein ausgewogener Blocksatz verlangt, den ganzen Absatz auf einmal abzuwägen.
4. **Ein gemeinsamer vertikaler Rhythmus.** Bücher und Zeitschriften setzen jede Zeile auf ein Grundlinienraster, das alle Spalten einer Seite teilen; CSS kennt kein solches Raster.
5. **Der Apparat eines Buches.** Kolumnentitel, die das Kapitel kennen, Seitenzahlen in römischer oder arabischer Zählung, Kapitelumbrüche, die auf rechte und linke Seiten achten, und ein Inhaltsverzeichnis mit echten Seitenzahlen: Nichts davon gibt es in einem scrollenden Dokument.

:::callout{type="quote" placement="top"}
_Editoriale Typografie ist ein Problem der Erfüllung von Nebenbedingungen. Dem Browser wurde nie die Sprache gegeben, diese Bedingungen zu formulieren._
:::

CSS beschreibt das _Aussehen_ jeder einzelnen Textregion sehr genau. Was ihm fehlt, ist _globale Optimierung_: die Fähigkeit, einen ganzen Absatz, eine ganze Spalte und eine ganze Seite abzuwägen, bevor es sich auf eines davon festlegt.

## Was bestehenden Werkzeugen fehlt

Andere Werkzeuge lösen Teile des Problems. Adobe InDesign bietet vollständige gestalterische Kontrolle. LaTeX ist nach wie vor die Referenz für wissenschaftlichen und mathematischen Satz. Doch keines davon wurde für das Web entworfen, und ihre Grundannahmen machen es schwer, sie in einen modernen Entwicklungsablauf einzufügen:

- Sie lassen sich nicht als Komponente in eine Webanwendung einbetten
- Ihre Ausgabe ist statisch und bewahrt selten die semantische Struktur, auf die Hilfstechnologien angewiesen sind
- Ihre Quellformate sind proprietär, binär oder schwer programmatisch zu erzeugen
- Sie stehen außerhalb der Frontend-Werkzeugkette, die ein Webteam ohnehin nutzt

Postext bezieht eine andere Position, zusammengefasst in :ref{id="tools-comparison"}. Es ist eine **JavaScript-Bibliothek**, die im Browser läuft, Markdown liest, die Regeln professioneller Typografie anwendet und ein Layout zurückgibt, das Sie als Canvas, HTML oder PDF rendern oder als EPUB-E-Book schreiben können. Es ist dafür gedacht, von Entwicklern eingebettet, konfiguriert und erweitert zu werden, die Seiten in Publikationsqualität wollen, ohne ihre Werkzeuge zu verlassen – und von Gestaltern konfiguriert zu werden, die den Code nie anfassen müssen.

## Ein Handwerk mit langem Gedächtnis

Die Regeln, denen Postext folgt, wurden nicht für Postext erfunden. Eine angenehm lesbare Zeile fasst zwischen 45 und 75 Zeichen; deshalb werden lange Texte in Spalten gesetzt und nicht in Zeilen, die so breit sind wie die Seite. Ob im Blocksatz oder im Flattersatz, der Grauwert des Textes muss gleichmäßig sein, ohne Gießbäche aus lockeren Zeilen. Jede Zeile einer Seite sitzt auf einem gemeinsamen Grundlinienraster, sodass die Zeilen einander über den Spaltenabstand hinweg gegenüberstehen und registerhaltig durch das Papier scheinen. Überschriften bleiben bei dem Text, den sie ankündigen, ein Absatz lässt seine erste oder letzte Zeile nicht allein am Rand einer Spalte stehen, und eine Abbildung erscheint nach dem Satz, der sie erwähnt, nie davor.

Jahrhundertelang wurden diese Regeln von Hand angewandt, von Setzern, die jede Seite lasen, bevor sie in den Druck ging. Was nie zur Verfügung stand, war eine Engine, die sie automatisch anwendet, aus strukturiertem Text, in der Umgebung, in der heute das meiste Lesen stattfindet. Um diese Lücke geht es in diesem Buch.

## Für wen Postext gedacht ist

Postext ist überall nützlich, wo langer, strukturierter Text so aussehen soll, als sei er gestaltet und nicht bloß angezeigt worden:

- **Verlage und Redaktionen**, die aus derselben Quelle ein druckfertiges PDF, eine getreue Bildschirmausgabe und ein E-Book erzeugen wollen, ohne getrennte Layouts synchron halten zu müssen
- **Dokumentations- und Bildungsplattformen**, deren Lehrbücher, Handbücher und Kurse Abbildungen, Tabellen, nummerierte Verweise und Mathematik auf jeder Seite sauber gesetzt brauchen
- **Entwickler**, die Leseerlebnisse bauen – Berichte, Zeitschriften, Kataloge, generierte Dokumente – und editoriale Qualität von einer Bibliothek statt von einer Desktop-Anwendung erwarten
- **Gestalter und Typografen**, die eine Gestaltung einmal als Regeln beschreiben und sie über Hunderte von Seiten einheitlich angewandt sehen wollen

## Was Postext nicht ist

Postext ersetzt CSS für Oberflächen nicht; es ist eine spezialisierte Engine für lange, strukturierte Inhalte. Es ist kein WYSIWYG-Editor: Sie schreiben Markdown und beschreiben die Gestaltung, und die Engine setzt die Seiten. Es lädt keine Schriften für Sie: Die Engine misst mit den Schriften, die der Browser bereits hat, also muss eine Seite ihre Schriften laden, bevor sie das Layout berechnet. Und die Layout-Engine läuft vorerst nur im Browser, weil ihre Messungen aus den Canvas-Schriftmetriken eines echten Browsers stammen; die PDF- und EPUB-Writer dagegen laufen auch in Node.

# Wie die Engine arbeitet {#engine lead="Markdown und ein Konfigurationsobjekt gehen hinein; heraus kommt ein Baum, in dem jede Zeile eine Position in echten Einheiten hat. Dazwischen liegt eine kurze Pipeline, die Text misst, ohne das DOM zu berühren, und so lange wiederholt, bis die Seite zur Ruhe kommt." summary="Parsen, Messen, Setzen, Konvergieren"}

Am schnellsten verstehen Sie, was Postext kann, wenn Sie einem Dokument auf seinem Weg durch die Engine folgen. Die Engine ist eine Pipeline, skizziert in :ref{id="layout-pipeline"}, in der jede Stufe eine gemeinsame Darstellung des Dokuments im Arbeitsspeicher verfeinert. Die Pipeline ist außerdem rein: Bei gleichem Inhalt und gleicher Konfiguration erzeugt sie immer dasselbe Layout, dieselben Seiten Zeile für Zeile.

## Inhalt und Konfiguration

Zwei Dinge gehen in die Pipeline ein, und beide sind dafür gedacht, von Menschen gelesen und bearbeitet zu werden:

1. **Inhalt** in erweitertem Markdown
   - Überschriften, Absätze, Listen, Hervorhebungen, Blockzitate und Mathematik
   - Direktiven für Seitenumbrüche, Seitennummerierung, Teile, Kästen und das Inhaltsverzeichnis
   - Verweise auf Ressourcen – Abbildungen, SVG-Diagramme und Tabellen –, die außerhalb des Textes über ihre ID deklariert sind
   - Optionaler YAML-Vorspann mit Titel, Untertitel, Autor und Datum
2. **Konfiguration**, die die Gestaltung beschreibt
   - Seitenformat, Ränder, Anschnitt und Seitennummerierung
   - Spaltenaufbau, Spaltenabstand und Spaltenlinien
   - Grundtext, Überschriften, Listen, Legenden, Tabellen und Mathematik
   - Überschriftenstile, Absatzformate, Kastenstile, Teile und die Inhaltsseite
   - Kolumnentitel, eine benannte Farbpalette und die Optionen der PDF-Ausgabe

Die Trennung ist gewollt. Dasselbe Markdown kann zu einem Taschenbuch, einer zweispaltigen Zeitschrift oder einem Lehrbuch mit Randspalte werden, allein durch eine andere Konfiguration.

## Parsen

Der Parser liest erweitertes Markdown und erzeugt eine flache Liste von Blöcken: Überschriften, Absätze, Blockzitate, Listeneinträge, abgesetzte Formeln und die Direktiven, die das Buch formen. Seine Aufgabe ist es, die Eingabe sorgfältig zu strukturieren: Er fügt die Zeilen eines Absatzes zusammen, verfolgt die Verschachtelung von Listen, trennt den Titel einer Überschrift von ihren Attributen, löst jeden \`:ref\` gegen die außerhalb des Textes deklarierten Ressourcen auf und hält für jeden Block genau fest, aus welchem Abschnitt der Quelle er stammt.

Die Inline-Formatierung wird im selben Zug geparst. Fett, kursiv und beides zusammen, Hoch- und Tiefstellungen, Inline-Mathematik, Farbfelder und Verweise werden zu typisierten Spans innerhalb des Absatzes, damit die Messstufe jedem davon seine eigene Schrift und Farbe geben kann.

## Messen ohne DOM

Bevor die Engine irgendetwas platzieren kann, muss sie wissen, wie viel Raum jedes Element braucht, und genau hier beginnt das ganze Projekt. Text in einem Browser zu messen heißt normalerweise, ihn in die Seite zu rendern und seine Größe zurückzulesen – ein Reflow, der bei einem langen Dokument den Hauptthread Hunderte von Millisekunden blockieren kann.

Postext misst mit _pretext_:index{term="pretext"}, einer Bibliothek zur Textmessung ohne DOM, die Canvas-Schriftmetriken und reine Arithmetik verwendet. Ihr aufwendiger Schritt, einen Text für eine bestimmte Schrift vorzubereiten, wird zwischengespeichert; ihn auf eine bestimmte Breite umzubrechen, kostet fast nichts. Der Ansatz ist 300- bis 600-mal schneller als das Messen per Reflow, wie :ref{id="measurement-speed"} anschaulich zeigt, und darauf baut das eigene Messmodul der Engine gemischte Textläufe aus Fett, Kursiv und Mathematik, Silbentrennung, Blocksatz und optimalen Zeilenumbruch auf. Jedes Ergebnis wird unter einem Schlüssel zwischengespeichert, der den Text, die Schriften, die Breite und jede Option enthält, die eine Zeile verändern kann; wer in einen Absatz tippt, lässt also nur diesen einen Absatz neu messen und sonst nichts.

Das Laden der Schriften ist der einzige Teil des Messens, den die Engine ihrem Host überlässt. Mit einer Schrift zu messen, die noch nicht angekommen ist, hieße, die Ersatzschrift zu messen, und jede Zeile würde sich verschieben, sobald die richtige Schrift erscheint. Die Bibliothek erwartet daher, dass die Schriften vor dem ersten Build geladen sind, und bietet eine Möglichkeit, ihre Mess-Caches zu leeren, wenn doch eine Schrift verspätet eintrifft, damit der nächste Build mit den richtigen Metriken neu misst.

## Ein Zeilenumbruch in WebAssembly

Der Teil der Engine, der am meisten rechnet, ist der Zeilenumbruch, der jede Art abwägt, einen Absatz umzubrechen. Er ist in Rust geschrieben und nach WebAssembly:index{term="WebAssembly"} kompiliert, ein Modul von etwa dreißig Kilobyte im Paket, und er wählt genau die Umbrüche, die die Fassung in TypeScript wählen würde; ein Buch fällt mit beiden also gleich aus. So läuft der Umbruch zwei- bis dreimal schneller, und ein ganzes Buch wird etwa fünfzehn Prozent schneller gesetzt. Wo WebAssembly gesperrt ist, antwortet stattdessen der Umbruch in TypeScript, und auf der Seite ändert sich nichts.

## Sieben Durchgänge und eine Schleife

Das Layout selbst läuft in sieben Durchgängen ab:

1. **Strukturierung des Inhalts** parst das Markdown in eine flache Liste von Blöcken und löst Ressourcen über ihre ID auf
2. **Textmessung** setzt jeden Absatz in Zeilen, in der Breite, die er einnehmen wird
3. **Platzierung auf Seiten und Spalten** füllt Seiten und Spalten und reserviert Raum für Kolumnentitel und seitenbreite Elemente
4. **Platzierung der Ressourcen** lässt jede referenzierte Abbildung und Tabelle an die erste freie Stelle nach ihrem Verweis gleiten
5. **Typografische Feinarbeit** wendet die Regeln an, die Überschriften bei ihrem Text und Listen bei ihrer Einleitung halten
6. **Spaltenausgleich** gleicht die Spalten jeder Seite aus
7. **Vertikaler Rhythmus** bringt den Text nach allem, was das Grundlinienraster unterbricht, wieder ins Raster

Diese Durchgänge hängen im Kreis voneinander ab. Eine Überschrift bei ihrem Absatz zu halten, kann beide in die nächste Spalte schieben; diese Verschiebung kann eine Witwe hinterlassen; die Witwe zu beheben, holt eine Zeile zurück, was die Überschrift wieder abtrennen kann. Postext löst den Kreis mit der **Konvergenzschleife**:index{term="Konvergenzschleife"} aus :ref{id="convergence-loop"}: Die Durchgänge drei bis sieben wiederholen sich und markieren nur, was sich geändert hat, bis sich nichts mehr bewegt. Nach jedem Durchlauf werden die typografischen Verstöße bewertet; wird die Grenze je erreicht, behält die Engine also das beste Layout, das sie gefunden hat, nicht das letzte.

Die Regeln dieser Durchgänge sind bewusst wenige, und sie sind streng. Eine Überschrift bleibt immer bei den ersten Zeilen dessen, was ihr folgt. Ein Absatz, der mit einem Doppelpunkt endet, bleibt bei der Liste, die er einleitet. Eine Abbildung und ihre Bildunterschrift werden nie getrennt. Ein seitenbreites Element teilt die Seite in Streifen, und die Spalten jedes Streifens werden für sich ausgeglichen, sodass Text über einer breiten Tabelle erst beide Spalten hinunterläuft, bevor er unter ihr weitergeht. Lassen sich zwei dieser Regeln nicht zugleich erfüllen, gewinnt die, die der Seite am wenigsten schadet.

## Ein Tastendruck, Schritt für Schritt

Angenommen, Sie tippen einen einzelnen Buchstaben in einen Absatz dieses Buches. Der Editor erfasst die Änderung, und das Markdown des Kapitels wird erneut geparst, was wenig kostet. Jeder Block außer dem, den Sie berührt haben, findet seine Messung im Cache; der bearbeitete Absatz wird in seiner Spaltenbreite neu gesetzt. Das Layout des Kapitels wird aus diesen Messungen neu aufgebaut, abseits des Hauptthreads, und die Schleife läuft, bis die Seite zur Ruhe kommt, bevor die Vorschau das Ergebnis zeichnet.

Weil jedes Kapitel für sich gesetzt wird, als Fortsetzung der vorangehenden, bleibt der Rest des Buches unberührt, solange sich die Seitenanzahl des Kapitels nicht ändert. Ändert sie sich, werden die folgenden Kapitel im Hintergrund neu umbrochen, und die Inhaltsseite übernimmt ihre neuen Seitenzahlen.

:::callout{type="figures" title="Die Engine in Zahlen" placement="top"}
:::columns{count=3 breaks="3,5"}
**300–600×** schnellere Textmessung als per Reflow des DOM. Pretext misst mit Canvas-Schriftmetriken und schlichter Arithmetik; nur deshalb lässt sich ein ganzes Kapitel zwischen zwei Tastendrücken neu setzen.

**7 Durchgänge** machen aus Markdown positionierte Seiten: Strukturierung, Messung, Platzierung auf Seiten und Spalten, Platzierung der Ressourcen, typografische Feinarbeit, Spaltenausgleich und vertikaler Rhythmus.

**5 Durchläufe** höchstens in der Konvergenzschleife, meist einer oder zwei. Sollte die Grenze je erreicht werden, behält die Engine das beste Layout, das sie unterwegs gefunden hat, nicht das letzte.

**8 Sprachen** mit Silbentrennung nach den Liang-Mustern, die TeX seit 1983 verwendet: Englisch, Spanisch, Französisch, Deutsch, Italienisch, Portugiesisch, Katalanisch und Niederländisch.

**4 Ausgaben** – Canvas, HTML, PDF und EPUB 3 – entstehen aus ein und demselben Layout; die Seite, die Sie am Bildschirm prüfen, ist also die Seite, die in den Druck geht.

**0 Reflows** der Seite während des Setzens. Alles wird im Arbeitsspeicher berechnet, auf Wunsch des Hosts in einem Worker, und dieselbe Eingabe ergibt immer dieselben Seiten.
:::
:::

Der Ausgleich konvergiert abschnittsweise, zwischen Kapitelauftakten und expliziten Seitenumbrüchen. Daraus ergibt sich eine Garantie, die für Bücher zählt: Ein Kapitel, das für sich gesetzt wird, und dasselbe Kapitel im ganzen Buch fallen identisch aus, Seite für Seite.

## Der virtuelle Dokumentbaum

:index{term="VDT (virtueller Dokumentbaum)"}Was die Schleife übersteht, ist der **VDT**, der virtuelle Dokumentbaum: Seiten, die Spalten enthalten, Spalten, die Blöcke enthalten, Blöcke, die Zeilen enthalten, jedes mit seinem Rahmen in echten Einheiten, dazu eine flache Liste aller Blöcke für den schnellen Zugriff. Der Baum ist reine Geometrie – er weiß nichts von Canvas, HTML, PDF oder EPUB –, und genau deshalb kann jeder Renderer übereinstimmende Ausgaben zeichnen. Jede Zeile merkt sich außerdem den Abschnitt des Markdowns, aus dem sie stammt; so setzt ein Klick auf die Seite den Cursor des Editors auf das richtige Wort.

Seiten halten auch fest, wofür sie da sind. Eine Seite kann eine Textseite sein, ein Kapitelauftakt, ein Teiltitel oder eine Vakatseite, die eingefügt wurde, damit die folgende Seite rechts oder links zu liegen kommt, und nach dieser Rolle richten sich Kolumnentitel, Paginas und Schmuckelemente, wenn sie entscheiden, wo sie erscheinen. Seitenbezeichnungen – die gedruckte Seitenzahl in ihrer Zählung – werden einmal berechnet, im Baum, sodass Canvas, HTML und PDF darin übereinstimmen, ohne selbst zu zählen.

## Abseits des Hauptthreads

Ein Layout kann länger dauern als ein Tastendruck, deshalb kann die Engine in einem Web Worker:index{term="Web Worker"} laufen. Der Worker behält seinen Mess-Cache zwischen den Builds und bricht kooperativ ab: Wird ein neuer Build angefordert, hält der vorige an seinem nächsten Prüfpunkt an, und die letzte Anfrage gewinnt. Die Sandbox setzt jede Ansicht auf diese Weise, und die PDF- und EPUB-Writer haben eigene Worker, sodass die Oberfläche reaktionsfähig bleibt, während ein ganzes Buch gesetzt oder geschrieben wird.

:::callout{type="note" title="Im Code"}
\`buildDocument(content, config)\` gibt den VDT zurück. \`renderPage\` zeichnet eine Seite auf ein Canvas, \`renderToHtml\` gibt positioniertes HTML zurück, und \`renderToPdf\` aus dem Paket _postext-pdf_ gibt die Bytes eines PDF zurück – für ein einzelnes Dokument oder für ein ganzes Buch, übergeben als Array von Kapiteln. \`renderToEpub\` aus _postext-epub_ schreibt dieselben Kapitel als EPUB-3-Datei. \`createLayoutWorker\` aus _postext/worker_ führt den Build abseits des Hauptthreads aus.
:::

:::part{number="II" title="Das Handwerk" palette="band=#8f6408"}
3. Die Zeile setzen
4. Die Seite und ihre Spalten
5. Abbildungen, Tabellen und Gleitobjekte
6. Kästen, Fußnoten und Marken
7. Bücher, Teile und Kolumnentitel
8. Ein Buch, viele Sprachen
:::

# Die Zeile setzen {lead="Ein Absatz wird als Ganzes gesetzt, nicht Zeile für Zeile. Postext wägt jede mögliche Art ab, ihn umzubrechen, belegt Wortabstände, Trennungen und allein stehende Wörter mit Kosten und wählt die Folge von Umbrüchen, die am wenigsten kostet." summary="Optimaler Zeilenumbruch, Silbentrennung, Wortabstände und die Fehler, die er vermeidet"}

Die Qualität einer Seite entscheidet sich zuerst in ihren Absätzen. Postext implementiert den **Knuth-Plass-Algorithmus**, den optimalen Zeilenumbruch, der seit 1981 in TeX arbeitet. Er bewertet jede mögliche Art, den ganzen Absatz umzubrechen, und wählt die mit den geringsten Gesamtkosten; so bleiben die Wortabstände von der ersten bis zur letzten Zeile gleichmäßig, und keine Zeile zahlt für ihre Nachbarn.

## Boxen, Leim und Strafpunkte

:index{term="Knuth-Plass-Zeilenumbruch"}Der Algorithmus sieht einen Absatz als Folge dreier Grundelemente, in :ref{id="knuth-plass-model"} über die volle Breite gezeichnet:

- **Boxen** sind Wörter oder Wortteile mit fester Breite
- **Leim** (glue) ist der Raum zwischen den Wörtern, mit einer natürlichen Breite und der Fähigkeit, sich zu dehnen oder zu stauchen
- **Strafpunkte** (penalties) sind mögliche Umbruchstellen mit Kosten; ein _markierter_ Strafpunkt bezeichnet eine Trennstelle und setzt einen Trennstrich, wenn er genutzt wird

Für jede mögliche Zeile berechnet die Engine ein Anpassungsverhältnis $r$, also wie weit sich der Leim dehnen oder stauchen muss, um die Satzbreite zu füllen, und eine Schlechtigkeit (badness), die mit dessen dritter Potenz wächst, $b = 100\\,|r|^3$. Die Zeilen werden in vier Eignungsklassen eingeteilt – eng, normal, locker und sehr locker –, und jeder Umbruch wird mit seinen Fehlerpunkten (demerits) belastet:

$$
d = (1 + b + p)^2
$$

Dabei ist $p$ der Strafpunkt des Umbruchs. Zwei getrennte Zeilen hintereinander kosten zusätzlich 3000, und ein Sprung um mehr als eine Eignungsklasse zwischen benachbarten Zeilen kostet 100; so bevorzugt der Optimierer Absätze, deren Textur sich sanft verändert. Gibt es keine zulässige Folge von Umbrüchen, fällt die Engine auf den gierigen Umbruch zurück, statt zu scheitern.

## Warum der ganze Absatz zählt

Nehmen wir einen Absatz, dessen erste Zeile zufällig direkt nach einem langen Wort endet. Ein gieriger Umbruch nimmt diese Stelle, weil sie passt, und geht weiter. Die zweite Zeile beginnt dann mit einer Reihe kurzer Wörter, lässt sich nicht ganz füllen und muss gedehnt werden; die dritte erbt das Problem und endet mit einem Trennstrich; in der letzten Zeile bleibt ein einzelnes Wort übrig.

Der optimale Umbruch sieht die ganze Kette. Er kann beschließen, die erste Zeile ein Wort früher zu beenden, etwas lockerer, als sie sein könnte, weil sich die zweite Zeile dann natürlich füllt, der Trennstrich aus der dritten verschwindet und ein zweites Wort in die letzte Zeile rückt. Der Absatz als Ganzes ist besser, obwohl seine erste Zeile für sich genommen es nicht ist.

## Silbentrennung

:index{term="Silbentrennung"}Die Silbentrennung verwendet dieselben **Liang-Muster**, auf die TeX seit 1983 setzt, bereitgestellt von der Bibliothek _Hypher_, in acht Sprachen: Englisch, Spanisch, Französisch, Deutsch, Italienisch, Portugiesisch, Katalanisch und Niederländisch. Die Muster lassen mindestens zwei Buchstaben vor einem Trennstrich und drei danach stehen, Wörter mit weniger als fünf Buchstaben werden also nie getrennt, und jeder Trennstrich ist ein markierter Strafpunkt von 50, den der Optimierer annehmen oder ablehnen kann.

Silbentrennung läuft nur im Blocksatz, wo sie sich lohnt. Zwei Umbruchmöglichkeiten gibt es immer, unabhängig von der Einstellung: Ein harter Bindestrich zwischen zwei Buchstaben ist eine zulässige Umbruchstelle, und ein Wort, das breiter ist als die ganze Satzbreite, wird an der letzten Silbe getrennt, die noch passt, notfalls am letzten Zeichen.

Weiche Trennstriche im Text gelten als Umbruchstellen, zum selben Preis wie die der Muster. Das Katalanische folgt den Regeln des Institut d’Estudis Catalans: Ein Wort mit geminiertem _l·l_ wie _col·lecció_ wird zwischen den beiden _l_ getrennt, und der Trennstrich tritt an die Stelle des Mittelpunkts, _col-_ am Ende der einen Zeile und _lecció_ am Anfang der nächsten. Eine Sprache ohne Trennmuster wird nicht getrennt: Ihre Zeilen gleichen nur die Wortabstände aus, und das Bedienfeld **Prüfungen** meldet, wo sie zu locker werden.

## Wortabstand und Flattersatzzeilen

Zwei Einstellungen begrenzen, wie weit sich ein Wortzwischenraum dehnen oder stauchen darf: Für das Dehnen gilt \`maxWordSpacing\`, standardmäßig das Doppelte des natürlichen Abstands, für das Stauchen \`minWordSpacing\`, das 0,6-Fache davon. Eine Dehnung über das Maximum hinaus kostet mehr als jeder andere Fehler; der Umbruch wird also eher trennen, ein Wort verschieben oder eine zu kurze Ausgangszeile hinnehmen, als einen Gießbach aufzureißen. Manche Zeilen lassen sich gar nicht füllen – eine lange URL, das unteilbare Ende eines Listeneintrags –, und statt sie zu Lücken vom Dreifachen des natürlichen Abstands aufzureißen, setzt die Engine sie im Flattersatz mit natürlichen Wortabständen. Die letzte Zeile eines Absatzes steht immer im Flattersatz, außer wenn sie überfüllt ist: Dann werden ihre Wortabstände gestaucht, bis sie passt.

## Chinesischer und ostasiatischer Text

:index{term="chinesischer Satz"}Chinesisch wird ohne Leerzeichen zwischen den Wörtern geschrieben und nie getrennt: Eine Zeile darf zwischen fast beliebigen zwei Zeichen enden. Ein Absatz, der mehr chinesische, japanische oder koreanische Zeichen als Wortzwischenräume enthält, durchläuft nicht Knuth-Plass; der **CJK-Setzer** setzt ihn Zeile für Zeile. Beachten muss er dabei die Regeln für Zeilenenden: Ein Komma, ein Punkt oder eine schließende Klammer eröffnet nie eine Zeile, und eine öffnende Klammer beendet nie eine. Wie streng diese Regeln sind, hängt von der Region ab, die sich aus der Dokumentsprache ergibt – \`zh-Hans\` folgt dem Standard des Festlands, GB/T 15834, und \`zh-Hant\` der Praxis Taiwans und Hongkongs –, und \`cjk.lineBreak\` legt die Stufe von Hand fest. Manche Folgen werden nie geteilt: ein Gedankenstrich oder eine Auslassung von zwei Geviert Breite, eine Zahl mit ihrer Einheit. Ein lateinisches Wort oder eine Webadresse inmitten der Zeichen rückt als Ganzes in die nächste Zeile, es sei denn, sie ist breiter als die Zeile; dann wird das Wort getrennt und die Adresse nach einem Schrägstrich oder vor einem Punkt geteilt.

Jedes chinesische Satzzeichen sitzt in einem eigenen Quadrat, zur Hälfte Zeichen, zur Hälfte Leerraum, und wie viel von diesem Leerraum ein Buch behält, ist eine Frage des Hausstils, wie :ref{id="cjk-composition"} zeigt. Taiwan lässt jedem Zeichen ein volles Quadrat. Hongkong setzt seine Zeichen ebenfalls auf ein volles Quadrat, rückt aber die meisten aufeinandertreffenden Zeichenpaare zusammen, und eine Klammer, die eine Zeile eröffnet oder beendet, verliert ihre äußere Hälfte. Der Kaiming-Stil des Festlands, die Voreinstellung für \`zh-Hans\`, setzt Kommas, Klammern und Anführungszeichen auf ein halbes Quadrat und lässt den Punkt ganz, außer am Zeilenende; wo zwei Zeichen aufeinandertreffen, entfällt auch der Leerraum zwischen ihnen. Der Stil wird mit \`cjk.punctuationWidth\` eingestellt, die beiden Anpassungen werden mit \`cjk.compressAdjacent\` und \`cjk.trimLineStart\` geschaltet; \`cjk.hangingPunctuation\` lässt ein Komma oder einen Punkt über das Zeilenende hinaushängen.

Eine chinesische Zeile im Blocksatz wird in fester Reihenfolge gefüllt: zuerst die Zwischenräume zwischen westlichen Wörtern, dann das Viertelgeviert, das die Engine zwischen chinesischen und lateinischen Text setzt (\`cjk.latinSpacing\`; getippt wird es nie), und zuletzt jede Lücke zwischen zwei Zeichen, nie innerhalb eines lateinischen Wortes oder einer Zahl. Darf ein Zeichen die nächste Zeile nicht eröffnen, versucht der Setzer zuerst, es in die Zeile hereinzuholen, indem er den Satzzeichen, die schon darin stehen, Leerraum abnimmt; erst wenn das misslingt, nimmt er das Zeichen davor mit in die nächste Zeile. Eine Zeile, die mehr als ein halbes Geviert zwischen ihren Zeichen bräuchte, bleibt kurz, und das Bedienfeld **Prüfungen** meldet sie mit dem Hinweis „CJK-Zeile zu kurz gesetzt“.

Der Rest eines chinesischen Buches folgt denselben Einstellungen. Kapitelvorlagen, Seitenzahlen, Listen und Zähler akzeptieren die chinesischen Zahlstile, darunter \`simp-chinese-informal\`, \`trad-chinese-informal\` und \`cjk-decimal\`, sodass Kapitel nach ihren chinesischen Ordnungszahlen benannt werden können; Abbildungen und Tabellen erhalten ihre chinesischen Namen und werden kapitelweise mit Bindestrich nummeriert. \`cjk.grid\` legt den Satzspiegel als Anzahl von Zeichen pro Zeile und Zeilen pro Seite fest, das Raster, auf dem chinesische Bücher entworfen werden. Die chinesische Ausgabe dieses Leitfadens ist vertikal gesetzt und rechts gebunden, wie chinesische Bücher jahrhundertelang gedruckt wurden.

Mit \`layout.writingMode: 'vertical-rl'\` wird ein Buch vertikal gesetzt. Die Zeilen laufen von oben nach unten und folgen einander von rechts nach links, zwei Spalten werden zu zwei übereinanderliegenden Etagen der Seite, Abbildungen und Tabellen bleiben aufrecht, lateinische Wörter und lange Zahlen legen sich auf die Seite, und jedes Satzzeichen nimmt die Stelle oder Form ein, die es im vertikalen Text hat: Klammern und Anführungszeichen nehmen ihre vertikalen Formen an, und der Punkt wandert auf dem Festland in die rechte obere Ecke seiner Zelle und bleibt in Taiwan und Hongkong zentriert. Ein solches Buch wird rechts gebunden (\`page.binding\`): Seine erste Seite steht allein links vom Buchrücken, und die Sandbox zeigt seine Doppelseiten von rechts nach links. Canvas und PDF setzen dieselben vertikalen Zeilen; die HTML-Ansicht bricht ihre eigenen Zeilen auf die Höhe ihrer Seite um und stellt jedes Zeichen so aufrecht oder dreht es so, wie es jene tun. Standardmäßig stellt \`cjk.uprightDigits\` eine Zahl mit bis zu zwei Ziffern aufrecht in eine einzige Zelle, und der Wert lässt sich auf drei oder vier erhöhen; \`:tcy[…]\` tut dasselbe für jede kurze Zeichenfolge.

Chinesische Bücher zeichnen Text auch auf Arten aus, für die die lateinische Schrift keine Verwendung hat. Hervorhebung zeigt ein Punkt neben jedem Zeichen, nicht die Kursive; in einem chinesischen Dokument setzt \`*…*\` daher Betonungspunkte an die chinesischen Zeichen, die es umschließt, wie \`:dots[…]\`; \`cjk.emphasis: 'italic'\` behält die Kursive bei. \`:name[…]\` zieht die gerade Linie eines Eigennamens, \`:book[…]\` kennzeichnet den Titel eines Buches, und \`cjk.bookTitleMark\` wählt, wie: mit den doppelten Winkelklammern des Festlands oder der Wellenlinie Taiwans und Hongkongs. \`:ruby[…]{rt="…"}\` setzt eine Lesung, Pinyin über den Zeichen oder Zhuyin rechts neben jedem, und \`:warichu[…]\` setzt eine Anmerkung in zwei halbhohen Zeilen innerhalb der Zeile, die in die nächste Zeile oder auf die nächste Seite weiterläuft, wenn sie nicht passt. Keines davon ändert den Zeilenabstand: Das Bedienfeld **Prüfungen** meldet, wenn Punkte, Linien oder Lesungen mehr Raum zwischen den Zeilen brauchen, als der Absatz lässt. Im vertikalen Text wandern die Punkte rechts neben die Spalte, die Linien links daneben, und die rechte Zeile einer Anmerkung wird zuerst gelesen.

## Arabisch und Schrift von rechts nach links

:index{term="arabischer Satz"}Arabisch, Persisch, Urdu und Hebräisch werden von rechts nach links geschrieben, und Postext setzt sie aus demselben Markdown und derselben Konfiguration wie jede andere Sprache. Die Dokumentsprache entscheidet: Mit \`locale: 'ar'\` beginnen die Zeilen rechts, die erste Spalte ist die rechte, das Buch ist an seiner rechten Kante gebunden, und seine Doppelseiten lesen sich von rechts nach links. Die Engine legt eine solche Seite als Seite von links nach rechts an und spiegelt sie dann als Ganzes, wobei sie jedes Wort, jedes Bild und jede Formel richtig herum malt; eine Gestaltung für ein englisches Buch funktioniert also unverändert: Eine Einstellung, die eine Seite nennt, meint eine Seite des Textes, und \`start\` und \`end\` sind als neutrale Namen dafür zulässig.

Innerhalb einer Zeile lesen sich Zahlen, lateinische Wörter und Zitate weiterhin von links nach rechts. Die Reihenfolge dieser Abschnitte bestimmt der Unicode-Bidi-Algorithmus, vollständig implementiert; der Text wird in der Reihenfolge gespeichert, durchsucht und kopiert, in der er getippt wurde, und nur die Darstellung wird umgeordnet. Klammern und Guillemets werden in Abschnitten von rechts nach links gespiegelt. Ein Block, der gegen die Richtung des Buches gesetzt ist, erhält \`{dir=ltr}\` oder \`{dir=rtl}\`, ein Textabschnitt \`:ltr[…]\` oder \`:rtl[…]\`: eine Isolierung, deren Punkt nicht mehr ans falsche Zeilenende wandert.

Arabische Buchstaben werden verbunden, und jeder nimmt die Form an, die seine Nachbarn verlangen; ein Wort wird daher als eine geformte Zeichenkette gemessen und gemalt, nie Buchstabe für Buchstabe. Das PDF formt es mit HarfBuzz und ordnet jede Glyphe ihren Zeichen zu, sodass kopierter Text und Screenreader die Wörter erhalten, die getippt wurden. Daraus folgen drei Regeln: keine Silbentrennung, keine Sperrung und kein Schnitt innerhalb eines Wortes; ein zu langes Wort ragt über die Zeile hinaus und wird gemeldet statt geteilt. Zeilen im Blocksatz werden zuerst an ihren Wortzwischenräumen gedehnt, dann durch **Kaschida**, die gedehnten Verbindungen, die ein Kalligraf zwischen zwei verbundenen Buchstaben zieht, nur dort gesetzt, wo die Regeln des Naschī eine erlauben, und aus dem kopierten Text herausgehalten. Hervorhebungen werden fett gesetzt, da die arabische Schrift keine Kursive kennt, und die Engine neigt nie einen arabischen Buchstaben.

Vokalzeichen stapeln sich über und unter den Buchstaben, im Zeilenzwischenraum, der nie von selbst wächst: Das Bedienfeld **Prüfungen** meldet einen Absatz, dessen Zeichen die Zeile darüber berühren würden, zusammen mit dem Zeilenabstand, den er bräuchte. Erzeugte Zahlen – Paginas, Kapitel-, Abbildungs- und Anmerkungsnummern – erhalten die Ziffern der Region, arabisch-indische im Osten der arabischen Welt und europäische im Maghreb, während Zahlen, die der Autor tippt, nie umgeschrieben werden; eine Überschrift kann ihre Nummer als Ordnungszahlwort ausschreiben, und die Titelei kann in der Abdschad-Reihenfolge der Handschriften zählen. Klassische Gedichte werden in \`:::verse\` geschrieben, ein Vers pro Zeile, seine beiden Hälften durch \`||\` getrennt: Jede Hälfte wird auf eine einheitliche Breite gebracht, zuerst mit Kaschidas, sodass die Reime das ganze Gedicht hinunter in einer Flucht stehen. Die arabische Ausgabe dieses Leitfadens ist so gesetzt.

## Hervorhebung und Textläufe

Ein Absatz ist selten ein einziger Textlauf. Fett, kursiv und fett kursiv werden in den echten Schnitten der Familie gesetzt – einer echten Kursive, keiner schräggestellten Antiqua –, jeder mit seinen eigenen Metriken gemessen, sodass ein fettes Wort genau den Raum einnimmt, den es braucht. Die Farbe von fettem Text, kursivem Text und Verweisen lässt sich getrennt einstellen; in diesem Buch sind Verweise auf Abbildungen und Tabellen fett in der Farbe des Teils gesetzt, auf der Seite wie im PDF, wo sie zugleich Links sind.

Hoch- und tiefgestellte Zeichen werden kleiner gesetzt und gegen die Grundlinie verschoben, ohne den Zeilenabstand zu stören, und Farbfelder im Text sitzen wie ein Buchstabe auf der Grundlinie. All das ist unteilbar: Der Zeilenumbruch kann davor oder danach umbrechen, aber nie mittendrin.

Zwei weitere Textläufe heben Wörter hervor, ohne einen eigenen Schnitt zu brauchen. \`:smallcaps[…]\` setzt Kapitälchen, die aus den Versalien der Schrift gebildet werden, in jeder Ausgabe gleich, für Akronyme und die Namen der Figuren in einem Theaterstück. \`:chip[…]\` setzt ein Wort als Chip, ein kleines abgerundetes Kästchen, das mit der Zeile fließt – Tastaturtasten, Tags, die Wortbank einer Übung –, nach Namen gestaltet, nie in sich umbrochen und mit Wörtern, die in HTML und PDF echter Text bleiben.

Auch Ziffern haben Stile.:index{term="Ziffernstile"} Eine Schrift kann ihre Ziffern als Versalziffern zeichnen, so hoch wie die Großbuchstaben, oder als Mediävalziffern, die wie Kleinbuchstaben auf- und absteigen, und dazu proportional oder als Tabellenziffern, alle gleich breit, damit Zahlenkolonnen untereinanderstehen. \`figureStyle\` wählt zwischen ihnen für den Grundtext, ein Absatzformat, eine Überschriftenebene, eine Tabelle oder eine Legende. Eine Schrift, die den verlangten Stil nicht zeichnet, behält ihre eigenen Ziffern.

## Waisen, Witwen und zu kurze Ausgangszeilen

:index{term="Waisen und Witwen"}Eine **Waise** ist die erste Zeile eines Absatzes, die allein am Fuß einer Spalte zurückbleibt; eine **Witwe** ist seine letzte Zeile, die allein an den Kopf der nächsten Spalte gerät. Beide stören den Lesefluss, und :ref{id="orphan-widow"} zeigt beide zu beiden Seiten eines Spaltenumbruchs. Ein dritter Fehler, die **zu kurze Ausgangszeile**, ist eine letzte Zeile mit einem einzigen kurzen Wort, verloren unter einem vollen Absatz.

Postext belegt alle drei mit Kosten. Läuft ein Absatz über eine Spalte hinaus, vergleicht die Engine jede mögliche Teilung und berechnet für jede Kosten für den ungenutzten Raum, den sie hinterlässt, für eine Waise und für eine Witwe – standardmäßig je 1000, mit mindestens zwei Zeilen auf jeder Seite. Zu kurze Ausgangszeilen werden im Zeilenumbruch selbst bewertet, als Schlechtigkeit, sobald die letzte Zeile kürzer ist als der Raum von zwanzig Zeichen. Lässt sich eine zu kurze Ausgangszeile durch einen anderen Umbruch nicht vermeiden, kann die Engine den Absatz stattdessen eine Zeile kürzer setzen, indem sie die Wortabstände innerhalb ihres Minimums verengt und, falls nötig, die Laufweite um höchstens zehn Tausendstel Geviert.

## Listen

Listen folgen derselben Disziplin wie Absätze, mit einer eigenen Typografie. Aufzählungen wählen ihr Aufzählungszeichen, dessen Größe, Stärke und Farbe sowie den Abstand und den hängenden Einzug, die den Text jedes Eintrags bündig halten; nummerierte Listen wählen zwischen arabischen Zahlen, Klein- oder Großbuchstaben und kleinen oder großen römischen Ziffern, mit einem Trennzeichen, das sich eigens gestalten lässt, und rechtsbündigen Nummern, damit die Einträge 9 und 10 sauber untereinanderstehen. Die Verschachtelung reicht fünf Ebenen tief, jede Ebene mit eigenem Einzug und eigenen Markierungen, und Aufgabenlisten zeichnen für jeden Eintrag ein Kästchen, angekreuzt oder nicht.

:::callout{type="try"}
Suchen Sie im Bedienfeld **Gestaltung** nach _locker_ und schalten Sie **Lockere Zeilen hervorheben** in der Gruppe **Erweitert** ein. Machen Sie dann die Spalten schmaler oder erhöhen Sie \`maxWordSpacing\` und beobachten Sie, welche Zeilen die Engine öffnen muss und wie der Optimierer sie neu verteilt.
:::

## Mathematik

:index{term="Mathematik"}Formeln sind vollwertige Bestandteile des Textes. Inline-Ausdrücke wie $e^{i\\pi}+1=0$ fließen mit dem Text, von MathJax als Vektorpfade gesetzt, die bei jeder Vergrößerung scharf bleiben. Ist eine Formel höher, als die Zeile erlaubt, wird sie gleichmäßig verkleinert, damit das Grundlinienraster erhalten bleibt. Abgesetzte Formeln stehen auf eigenen Zeilen, mittig in der Spalte, mit eigenen Abständen, und der folgende Text kehrt ins Raster zurück:

$$
\\int_0^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

Dieselben Pfade zeichnen Canvas, HTML-Ansicht und PDF, und im Druck bleiben sie Vektoren.

Einige weitere Beispiele zeigen die Bandbreite der Notation, die die Engine bewältigt. Das erste ist eine unendliche Reihe, die Summe der reziproken Quadrate, die Euler 1734 bestimmte. In einer abgesetzten Formel stehen die Grenzen der Summe über und unter dem Zeichen, und der Bruch des Ergebnisses erscheint in voller Größe statt in der verkleinerten Form, die innerhalb einer Zeile verwendet wird.

$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

Matrizen sind ein weiterer gängiger Test, weil Zeilen und Spalten fluchten und die Klammern auf die Höhe ihres Inhalts wachsen müssen. MathJax streckt die Begrenzer über die ganze Höhe; Postext erhält das Ergebnis als Pfade, misst seinen ganzen Rahmen und reserviert genau diesen Raum, bevor der Text ins Raster zurückkehrt. Die Determinante einer Zwei-mal-zwei-Matrix lautet wie folgt.

$$
\\det \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc
$$

Die Normalverteilung vereint in einem Ausdruck fast alles, was mathematischen Satz schwierig macht: eine Wurzel mit ihrem Strich, griechische Buchstaben und einen ganzen Bruch in einem Exponenten, der zweimal schrumpfen muss, ohne unlesbar zu werden.

$$
f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}
$$

Fallunterscheidungen schließen die Reihe ab. Eine geschweifte Klammer fasst die Zweige der Definition zusammen, jeder mit seiner Bedingung rechts ausgerichtet, und die Klammer wächst mit der Zahl der Fälle.

$$
|x| = \\begin{cases} x & \\text{if } x \\ge 0 \\\\ -x & \\text{if } x < 0 \\end{cases}
$$

Inline-Formeln folgen anderen Regeln, weil sie mit den Wörtern um sie herum leben müssen. Die Lösungen von $ax^2+bx+c=0$ sind $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$, das Euler-Produkt lautet $\\prod_p (1-p^{-s})^{-1} = \\zeta(s)$, und auch die Fourier-Transformation $\\hat f(\\xi) = \\int f(x)\\,e^{-2\\pi i x \\xi}\\,dx$ bleibt auf ihrer Zeile.

# Die Seite und ihre Spalten {#columns lead="Seiten haben feste Maße, Spalten ein Ende, und jede Zeile sollte auf einem Rhythmus sitzen, den die ganze Doppelseite teilt. Dieses Kapitel handelt vom Rahmen: Seitengeometrie, Spaltenaufbau, Grundlinienraster und das Handwerk, Spalten auf gleicher Höhe enden zu lassen." summary="Seitengeometrie, Spalten, Grundlinienraster und Spaltenausgleich"}

Spalten sind der sichtbarste Ausdruck editorialer Gestaltung und die Stelle, an der selbstgebaute Lösungen als Erstes versagen. Postext behandelt die Seite und ihre Spalten als vollwertige Objekte, mit eigener Geometrie, eigenem Rhythmus und eigenen Regeln für ein sauberes Ende.

## Seitengeometrie

Eine Seite beginnt mit ihrem Format. Postext bietet die üblichen Buch- und Zeitschriftenformate als Vorlagen an, aufgeführt in :ref{id="preset-sizes"}, und jedes eigene Format in Zentimetern, Millimetern, Zoll oder Punkt; dieser Leitfaden ist im Format 21 × 28 cm gesetzt. Ränder lassen sich **spiegeln**: Dann wird der linke Rand zum inneren, am Bund, und wechselt auf jeder linken Seite die Seite. Für die Druckvorstufe kann die Seite Anschnitt und Schnittmarken erhalten, und eine DPI-Einstellung steuert die Auflösung pixelbasierter Maße.

Seitenzahlen folgen Zählweisen: arabisch, kleine oder große römische Ziffern, kleine oder große Buchstaben, jede mit eigener Startnummer, sodass ein Buch seine Titelei mit i, ii, iii nummerieren und Kapitel eins bei 1 beginnen lassen kann. Das PDF übernimmt dieselben Zählweisen als Seitenbezeichnungen, sodass das Seitenfeld eines Betrachters genau das anzeigt, was am Fuß der Seite gedruckt steht.

## Satzbreite und Zeilenabstand

Die beiden Zahlen, die am meisten darüber entscheiden, wie sich eine Seite liest, sind die Länge ihrer Zeilen und der Abstand zwischen ihnen. Die Konfiguration legt Schriftgrad und Zeilenabstand des Grundtextes in echten Einheiten fest – dieses Buch verwendet 9,4 auf 13,6 Punkt –, und die Spaltenbreite ergibt sich aus der Seite, den Rändern, dem Spaltenaufbau und dem Spaltenabstand. Eine Zeile von 45 bis 75 Zeichen ist das klassische Ziel; ist sie deutlich kürzer, springt das Auge zu oft, ist sie deutlich länger, findet es nur schwer zur nächsten Zeile zurück. Zwei Spalten auf einer 21 cm breiten Seite liegen bequem in diesem Bereich, einer der Gründe, warum das Format bei Zeitschriften und Fachbüchern so verbreitet ist.

Der Zeilenabstand ist auch die Einheit des Grundlinienrasters. Jeder vertikale Abstand, auf den es ankommt – der Raum über und unter einer Überschrift, um eine Abbildung, zwischen Listeneinträgen –, wird am besten als ganze Zahl von Rasterzeilen ausgedrückt oder darauf korrigiert, sodass die Seite von oben bis unten einen einzigen Rhythmus behält.

## Spaltenaufbau

Drei Aufbauten decken die meisten Publikationen ab, als Seitenminiaturen skizziert in :ref{id="column-layouts"}:

1. **Einspaltig** für Romane, Essays und konzentriertes Lesen
2. **Zweispaltig** für Zeitschriften, Berichte und Bücher wie dieses
3. **Anderthalbspaltig**, eine Hauptspalte neben einer schmaleren Randspalte
   - Die Randspalte kann Text tragen, der aus der Hauptspalte weiterläuft
   - Oder sie ist ein **Gleitkanal**, der nur Abbildungen, Tabellen, Legenden und Kästen aufnimmt, wie in Lehrbüchern mit einer äußeren Spalte für Anmerkungen und Diagramme

Der Spaltenabstand ist einstellbar, und darin kann eine Spaltenlinie gezogen werden, mit eigener Stärke und Farbe. Seitenbreite Elemente – eine Abbildung, eine Tabelle, ein Kasten – durchschneiden die Spalten: Der Text darüber wird gleichmäßig auf die Spalten verteilt, und darunter setzen sich die Spalten fort.

## Überschriften

Überschriften werden Ebene für Ebene konfiguriert, bis zu sechs Ebenen tief: Schriftart, Größe, Zeilenabstand, Stärke, Kursive, Versalien, Farbe, Ausrichtung und der Raum über und unter jeder Überschrift. Eine Ebene kann mit einer Vorlage nummeriert werden – \`{1}.{2}\` druckt 4.3 für den dritten Abschnitt von Kapitel 4, und Formate wie \`{1:I}\` oder \`{1:a}\` stellen eine Ebene auf römische Ziffern oder Buchstaben um. Eine Ebene kann auch auf eine neue Seite umbrechen, rechts oder links, wie sie es verlangt, und statt einer Spalte die volle Seitenbreite einnehmen: Das macht aus einer Überschrift der ersten Ebene einen Kapitelauftakt.

Überschriften bleiben bei dem, was ihnen folgt, sodass ein Abschnittstitel nie allein am Fuß einer Spalte wartet. Sie rasten auch im Grundlinienraster ein: Eine Überschrift, die größer ist als der Grundtext, nimmt sich den Raum, den sie braucht, und der Text danach kehrt ins Raster zurück, sodass die Spalten zu beiden Seiten des Spaltenabstands einander weiterhin Zeile für Zeile gegenüberstehen.

## Das Grundlinienraster

:index{term="Grundlinienraster"}Professionell gesetzte Bücher richten die erste Grundlinie jeder Spalte an einem gemeinsamen vertikalen Rhythmus aus, und jede weitere Zeile landet auf demselben Raster, sodass die Zeilen einander über den Spaltenabstand hinweg gegenüberstehen. Postext lässt Text auf einem Grundlinienraster einrasten, das sich aus dem Zeilenabstand des Grundtextes ableitet, wie :ref{id="baseline-grid"} zeigt. Auf Elemente, die das Raster unterbrechen – eine Überschrift, die größer ist als der Grundtext, eine Abbildung, eine abgesetzte Formel –, folgt der Raum, der nötig ist, um die nächste Zeile wieder ins Raster zu bringen. Das Raster lässt sich während der Arbeit als Überlagerung einblenden, überall, wo Text steht.

## Spalten auf gleicher Höhe beenden

Endet eine Seite mitten im Text, sollten ihre Spalten auf gleicher Höhe enden. Das ist der **Spaltenausgleich**:index{term="Spaltenausgleich"}, und er ist schwieriger, als es aussieht: Zeilen kommen in ganzen Rasterschritten, Abbildungen lassen sich nicht teilen, Überschriften müssen bei ihrem Text bleiben, und Absätze dürfen keine Waisen hinterlassen. Postext gleicht eine zu kurze Spalte mit drei Hebeln aus, eingesetzt in der Reihenfolge ihres Vorrangs und in :ref{id="column-balancing"} gezeichnet:

1. **Raum über Überschriften**, jeweils eine ganze Rasterzeile, nach Rang verteilt und nie am Kopf einer Spalte
2. **Eine Zeile nach dem Ende einer Liste**
3. **Lockerere Absätze**: ein Absatz, eine Zeile länger gesetzt, die _looseness_ von TeX, nur angenommen, wenn keine seiner Zeilen über die Grenze des Wortabstands hinaus gedehnt wird; wenn es hilft, ein Hauch Laufweite, höchstens zehn Tausendstel Geviert

Jede Korrektur wird überprüft, indem die Seite erneut gesetzt wird, bis zu achtmal, und das beste Ergebnis gewinnt. Ein kurzer Absatz wird selten um eine Zeile verlängert: Er hat zu wenige Wortzwischenräume, um sie aufzunehmen. Manche Spalten bleiben absichtlich unangetastet: die letzte Spalte vor einem erzwungenen Seitenumbruch oder einem Kapitelauftakt, die letzte Seite des Dokuments, eine Spalte ohne dehnbaren Inhalt. Zwei verwandte Regeln gleichen die Schlussspalten eines Kapitels aus sowie die Spalten über einem seitenbreiten Element, das weiterwandert oder geteilt wird.

## Streifen und seitenbreite Elemente

Eine Seite besteht nicht immer von oben bis unten aus einem einzigen Satz von Spalten. Eine seitenbreite Abbildung, Tabelle oder ein seitenbreiter Kasten zerteilt sie in **Streifen**:index{term="Streifen"}: Der Text über dem Element füllt seine Spalten als eigener Streifen, das Element durchquert die Seite, und darunter beginnen die Spalten neu. Jeder Streifen wird für sich ausgeglichen, sodass der Leser die erste Spalte hinunter- und zum Kopf der zweiten hinaufgeht, bevor er das Element überquert, wie in einer Zeitung. Würde ein Streifen ungleich enden, kürzt eine **Streifenkappung** seine Spalten auf dieselbe Zeilenzahl, und der Text, der nicht mehr hineinpasst, fließt darunter weiter.

Die Schlussspalten eines Kapitels werden ebenso behandelt. Statt die letzte Seite mit einer vollen und einer fast leeren Spalte zurückzulassen, verteilt eine abschließende Kappung die verbleibenden Zeilen auf beide, und die Ausgleichshebel erledigen den Rest. Explizite Spaltenumbrüche werden respektiert: \`:::columnbreak\` beendet eine Spalte dort, wo der Autor es will, und der Ausgleich lässt den Fuß dieser Spalte in Ruhe.

:::callout{type="try"}
Öffnen Sie im Bedienfeld **Gestaltung** die Gruppe **Überschriften und Inhaltsverzeichnis** und schalten Sie **Spaltenausgleich** aus. Sehen Sie sich den Fuß der Spalten dieses Kapitels an, schalten Sie die Option dann wieder ein und achten Sie darauf, welchen Hebel die Engine auf jeder Seite eingesetzt hat.
:::

## Regeln, die Sie wählen

Manche Entscheidungen sind eine Frage des Hausstils, nicht von richtig und falsch, und die Konfiguration überlässt sie dem Buch. Darf eine kurze Liste mit drei Einträgen zwischen zwei Spalten umbrechen? Darf eine Abbildung auf einen Kapitelauftakt gleiten? Jede solche **Satzregel** nimmt einen von drei Werten an.:index{term="Satzregeln"} :chip[allow]{style="state"} lässt die Engine gewähren, :chip[warn]{style="state"} lässt es geschehen und fügt dem Bedienfeld Prüfungen einen Eintrag hinzu, und :chip[avoid]{style="state"} lässt die Engine die Seite so ändern, dass es nie geschieht: Die ganze Liste wandert mit ihrer Einleitung weiter, die Abbildung wartet auf die Seite nach dem Auftakt. Mit einer Regel auf warn erfährt ein Lektor, wie oft ein Buch gegen sie verstoßen würde, bevor er entscheidet. Beide Regeln stehen zu Beginn auf allow, sodass eine Konfiguration, die sie nie erwähnt, ihre Seiten setzt wie bisher, und eine kurze Liste hat bis zu drei Einträge, solange die Konfiguration keine andere Zahl nennt.

# Abbildungen, Tabellen und Gleitobjekte {lead="Ein Verweis ist ein Versprechen, keine Position. Erwähnen Sie eine Abbildung, und Postext findet ihr einen Platz: die erste freie Stelle nach der Erwähnung, in Lesereihenfolge nummeriert, beschriftet, nie vor den Worten, die sie aufrufen." summary="Wo Ressourcen landen, wie sie nummeriert werden, Tabellen, die sich teilen"}

Alles, was nicht fließender Text ist – Bilder, SVG-Diagramme, Tabellen –, ist eine **Ressource**. Ressourcen werden außerhalb des Textes deklariert, jede mit ID, Typ, Legende und ihren Platzierungswünschen, und das Markdown erwähnt sie einfach. In der Sandbox wohnen sie im Bedienfeld Ressourcen.

## Eine Erwähnung genügt

:index{term="Gleitobjekte"}Wenn Sie \`:ref{id="…"}\` in einen Satz schreiben, geschieht zweierlei: Die Bezeichnung der Ressource wird gedruckt, und beim ersten Mal wird die Ressource _eingebunden_; sie gleitet dann an die erste freie Stelle nach dem Verweis. Die Stellen werden der Reihe nach geprüft, wie :ref{id="float-slots"} zeigt: der Fuß der Spalte, die den Verweis enthält, dann Kopf und Fuß der nächsten freien Spalte, dann ein Streifen auf der nächsten Seite. Der Text wird nie unterbrochen.

Eine Handvoll Regeln sorgt dafür, dass Gleitobjekte sich anständig benehmen:

- Ein Gleitobjekt landet nie vor seinem Verweis und wird nie verkleinert, damit es passt
- Gleitobjekte einer Nummernfolge behalten ihre Reihenfolge, sodass Abbildung 12 nie vor Abbildung 11 erscheint; eine Tabelle, die auf Platz wartet, hält keine Abbildungen auf
- Gleitobjekte verlassen nie ihr Kapitel: Kapitelauftakte, Teiltitel und das Ende des Dokuments sind Schranken
- Ein Gleitobjekt, das auf einer frischen Seite weniger als drei Zeilen Text übrig ließe, wartet auf die nächste
- Kopf- und Fußstreifen werden am Grundlinienraster ausgerichtet, und die Legende eines Gleitobjekts am Fuß teilt die Grundlinie der letzten Textzeile

## Platzierung

Jede Ressource kann angeben, wo sie am liebsten stehen möchte, und jeder Ressourcentyp hat eine Voreinstellung; die Felder sind in :ref{id="placement-options"} zusammengestellt. Ein Gleitobjekt kann in seiner Spalte bleiben oder über die ganze Seite reichen, wie die Abbildungen dieses Kapitels. Eine Ressource kann auch an einer genauen Stelle in den Text eingebettet werden, wenn ihr Platz _hier_ ist. Und eine Tabelle oder Abbildung, die für die Seite zu breit ist, lässt sich um eine Vierteldrehung drehen, in die eine oder die andere Richtung: Sie bekommt dann eine eigene Seite, bündig zum Bund gesetzt und nach der Höhe der Seite bemessen.

## Nummern und Bezeichnungen

Ressourcentypen definieren ihre eigenen Nummernfolgen. Abbildungen und Tabellen sind eingebaut und in die Sprache des Dokuments übersetzt; ein Typ kann ein Präfix ergänzen, eine Kurzbezeichnung, eine Vorlage wie \`{h1}.{n}\` für kapitelbezogene Nummern – Abbildung 5.2 ist die zweite Abbildung von Kapitel 5 –, eine Regel zum Zurücksetzen und ein Zählerformat. Die Nummern folgen dem **ersten Verweis in Lesereihenfolge**: Fügen Sie eine frühere Erwähnung ein, und jede Nummer danach rückt weiter. Ein Verweis kann nur die Nummer drucken, die volle oder die kurze Bezeichnung, deren Groß- und Kleinschreibung ändern oder einen eigenen Text drucken. In chinesischen, japanischen und arabischen Büchern verbindet ein Bindestrich die beiden Zahlen: Abbildung 5-2.

Die Nummerierung bleibt über ein ganzes Buch hinweg richtig, weil sie zu dem gehört, was jedes Kapitel von den vorangehenden erbt. Das siebte Kapitel dieses Leitfadens beginnt seine Abbildungen bei 7.1, weil der Kapitelzähler es so sagt, nicht weil jemand die Nummer getippt hat, und wird ein Kapitel verschoben, nummeriert sich beim nächsten Setzen des Buches alles danach neu.

## Eigene Typen

Abbildungen und Tabellen sind nur die beiden Typen, die jedes Buch braucht; ein dritter eingebauter Typ, das Video, zählt ebenfalls für sich. Eine Konfiguration kann so viele Ressourcentypen deklarieren, wie eine Publikation verwendet – Karten, Tafeln, Kästen, Diagramme, Dokumente –, jeden mit einem Namen im Singular und im Plural, einer Kurzbezeichnung für Verweise, einem Präfix für seine Legenden und einer eigenen Nummernfolge. Ein Katalog kann seine Tafeln durch das ganze Buch mit 1, 2, 3 nummerieren, während seine Abbildungen in jedem Kapitel neu beginnen. Jeder Typ kann außerdem seine Standardplatzierung mitbringen und den Legendenstil anpassen, sodass Tafeln eine ganze Seite mit der Legende darüber einnehmen können, während Abbildungen in Spaltenbreite gleiten.

## Tabellen

:index{term="Tabellen"}Tabellen tragen ihr Modell im Text mit: Zeilen aus Zellen mit Spalten- und Zeilenverbünden, Kopfzeilen, Ausrichtung und relativen Spaltenbreiten. Zellen nehmen Inline-Markdown, Absätze und einfache Listen auf, eine eigene Füllung – die vier Teilfarben dieses Buches sind :swatch{color="#2b4acb"} Blau, :swatch{color="#8f6408"} Gold, :swatch{color="#1f7a6d"} Blaugrün und :swatch{color="#c0452f"} Zinnoberrot – und sogar ein Bild. Tabellen werden einmal für das ganze Dokument gestaltet: Typografie von Tabellenkörper und Kopf, Füllung des Kopfes, Linien als Gitter, nur waagerecht, nur außen oder gar keine, dazu abgerundete Ecken und der Innenabstand der Zellen. Ein Buch kann außerdem benannte Tabellenformate definieren, und jede Tabelle wählt eines davon, sodass eine schlichte Tabelle mit waagerechten Linien neben einer Farbtabelle mit gefüllten Zellen stehen kann.

Eine Tabelle, die höher ist als die Seite, wird auf mehrere Seiten verteilt. Ihre Kopfzeilen wiederholen sich auf jedem Teilstück, die Legende jeder Fortsetzung erhält den Zusatz _(Forts.)_, ein Vermerk _Wird fortgesetzt_ schließt jedes Teilstück außer dem letzten ab, und keine Teilung schneidet je durch einen Zeilenverbund. Eine gedrehte Tabelle teilt sich ebenso, Seite für Seite. Statt sich zu teilen, kann eine zu hohe Tabelle auch nur die Zeilen behalten, die passen, oder ganz wegfallen; das legt ihr Tabellenformat fest. Eine im Text gesetzte Tabelle, die nicht mehr in den Rest ihrer Spalte passt, wird zwischen zwei Zeilen geteilt und läuft am Kopf der nächsten Spalte weiter.

## Abbildungen neben dem Text

In einem anderthalbspaltigen Layout, dessen Randspalte nur Gleitobjekte trägt, können Ressourcen neben dem Text stehen statt in ihm. Eine Abbildung mit der Spanne _side_ stapelt sich in der Randspalte neben dem Absatz, der sie zitiert; ein Kasten kann das ebenso, sodass Lehrbücher Definitionen, Schlüsselbegriffe und Randabbildungen neben den Zeilen halten können, die sie erklären. Eine breite Abbildung kann ihre Legende auch neben sich behalten, in der Randspalte; das ist die klassische Anordnung illustrierter Lehrbücher und Ausstellungskataloge. Die Vorlagen der Beispielgalerie enthalten ein Biochemie-Lehrbuch und eine literarische Ausgabe, die genau so gesetzt sind.

## Text, der umfließt

:index{term="Textumfluss"}Ein Bild oder ein Kasten, schmaler als seine Spalte, kann an einer ihrer Seiten stehen, während der Text in der verbleibenden Satzbreite daneben läuft und darunter zur vollen Breite zurückkehrt, wie in einem Magazin. Die Zeilen bleiben auf dem Grundlinienraster, und ein Absatz, der neben dem Bild beginnt und darunter endet, bleibt ein Absatz. Eine freigestellte Zeichnung kann weiter gehen: Bei einem Umfluss mit **Kontur** wird jede Zeile so kurz gesetzt, wie die Zeichnung auf ihrer Höhe breit ist, sodass der Text dem Umriss folgt und nicht dem Rahmen. Eine Zeile, die an der Zeichnung vorbeiführt, erhält die volle Satzbreite. Überschriften, Formeln und andere Abbildungen laufen nicht neben einem umflossenen Element; sie warten darunter.

Der Abstand zwischen dem Element und dem Text daneben ist einstellbar, standardmäßig eine Zeile des Grundtexts. Bliebe neben dem Element weniger als zwölf Geviert Text übrig oder wäre es kürzer als zwei Zeilen, nimmt es seinen Streifen ganz ein, und das Bedienfeld Prüfungen sagt es. Im getaggten PDF wird das Bild oder der Kasten vor dem Absatz gelesen, der daneben läuft, und ein umfließendes EPUB lässt es mit CSS an seine Seite gleiten, im selben Anteil der Textbreite.

## Sicherheitsbereiche

Von einem Foto wird selten alles gebraucht. Ein Bild kann seinen **Sicherheitsbereich**:index{term="Sicherheitsbereich"} markieren, das Rechteck, das das Wesentliche enthält, und die Engine darf es dann beliebig zwischen dem ganzen Bild und diesem Rechteck beschneiden, bei gleicher Breite. Diese Freiheit nutzt sie, um ein Bild in einer Spalte zu halten, die es sonst zu kurz zurückließe, um ein Bild einzupassen, das höher ist als die Seite, und für den Spaltenausgleich: Ein Bild mit Sicherheitsbereich kann um ganze Zeilen wachsen und so den Fuß einer zu kurzen Spalte füllen, ohne dass ein sichtbares Loch bleibt. Der Sicherheitsbereich wird im Bedienfeld Ressourcen auf das Bild gezeichnet, und Comicpanels nutzen dieselbe Markierung, um zu wissen, was nie beschnitten werden darf.

## Legenden und Bildnachweise

Eine Legende besteht aus dem Präfix des Typs, der Nummer und dem Legendentext – der Inline-Markdown und eigene Verweise annimmt. Legenden stehen über oder unter ihrer Ressource, wahlweise auf einem farbigen Balken, in Schriftart und Größe des Legendenstils; die Bezeichnung kann fett oder farbig sein, wie in diesem Buch. Eine Ressource kann außerdem eine Anmerkung tragen: eine kleinere Nachweis- oder Quellenzeile darunter. Neben einem schmalen Bild kann die Legende auch im selben Platz stehen, in jedem Layout: Das Bild nimmt einen Teil der Breite ein, standardmäßig die Hälfte, die Legende den Rest, und ihre erste Zeile steht auf Höhe der Oberkante des Bildes.

## Vektorabbildungen

SVG-Diagramme werden überall als Vektoren gezeichnet. Das PDF wandelt die gängige Teilmenge von SVG – Formen, Pfade, Gruppen, Beschneidungspfade, Vollfüllungen und Konturen, Deckkraft und Text – in native Zeichenoperationen um und rastert alles darüber hinaus mit 600 dpi; eine Abbildung kann auch eine eigene PDF-Vorlage mitbringen, die unverändert eingebettet wird. Für den einfarbigen Druck färbt ein Schalter jedes Diagramm nach Helligkeit in Tonwerte einer einzigen Druckfarbe um, in allen drei Renderern.

Text in einem SVG bleibt Text. Im PDF wird er in echten Schriften gesetzt und lässt sich auswählen und durchsuchen, und in der Sandbox lässt er sich an Ort und Stelle bearbeiten: Das Bedienfeld Ressourcen öffnet den Quelltext des Diagramms, in dem nur der Text bearbeitbar ist – die Zeichnung selbst bleibt gesperrt, solange Sie sie nicht entsperren –, sodass sich eine Beschriftung korrigieren oder übersetzen lässt, ohne ein Zeichenprogramm zu öffnen. Die Diagramme dieses Buches werden für jede Sprache erzeugt; deshalb stehen ihre Beschriftungen in der spanischen Ausgabe auf Spanisch, in der katalanischen auf Katalanisch, in der chinesischen auf Chinesisch, in der arabischen auf Arabisch, in der französischen auf Französisch, in der englischen auf Englisch und in dieser auf Deutsch.

Drei Abbildungen stehen hier als Beweis. Die Rosette in :ref{id="vector-rosette"} besteht aus Bézierkurven, Haarlinien und einer Zeile Mikroschrift von zweieinhalb Punkt Höhe; das Diagramm in :ref{id="vector-chart"} verbindet eine gefüllte Fläche, eine gestrichelte Linie und Textbeschriftungen; und :ref{id="vector-clip"} verwendet einen Beschneidungspfad, eine transparent gezeichnete Gruppe und eine Form, die fünfmal wiederverwendet wird. Öffnen Sie das PDF, vergrößern Sie die Abbildungen um ein Vielfaches und betrachten Sie die Kanten: Sie bleiben so scharf wie der Text um sie herum, weil sie mit denselben Operatoren gezeichnet und nicht als Bilder eingefügt sind. Versuchen Sie, die Beschriftungen des Diagramms auszuwählen oder nach ihnen zu suchen: Sie sind Text. Auf Papier zeigt sich das an den Haarlinien und an der Mikroschrift.

:::callout{type="try"}
Klicken Sie im Canvas auf die Legende einer beliebigen Abbildung: Das Bedienfeld Ressourcen öffnet sich bei dieser Ressource, das Legendenfeld bereit zur Eingabe. Ändern Sie ihre Platzierung von _auto_ auf _top_ und sehen Sie zu, wie sie wandert.
:::

## Videos

:index{term="Videos"}Ein Video ist eine weitere Ressource. Es wird erwähnt, eigenständig nummeriert (Video 1.1 neben Abbildung 1.1) und gleitet wie eine Abbildung an die erste freie Stelle. Es kann von YouTube oder Vimeo stammen, aus einer im Buch abgelegten Datei oder von einer Webadresse: einer MP4- oder WebM-Datei oder einem HLS-Stream.

Im Druck erscheint sein Vorschaubild, ein ausgewähltes Einzelbild, mit einem Abspielzeichen und einem QR-Code, der das Video öffnet; im PDF ist das Vorschaubild zugleich ein Link. Der QR-Code führt zur Seite des Videos bei YouTube oder Vimeo oder zur Adresse der Datei. Die HTML-Ansicht und das EPUB spielen es ab, außer Videos von YouTube und Vimeo sowie HLS-Videos, auf die ein E-Book nur verlinken kann. Die HTML-Ansicht zeigt dafür den Player von YouTube oder Vimeo oder den HTML5-Player des Browsers; das EPUB spielt eine Datei im Player des Lesesystems ab, ins Buch gepackt oder von ihrer Adresse gelesen. In der Folio-Ansicht spielt ein Klick auf das Vorschaubild das Video auf der Seite ab, und es läuft weiter, während das Blatt umgeblättert wird. Die Videos in diesem Buch, etwa :ref{id="postext-showreel"}, sind HLS-Streams. Ein HLS-Stream läuft in Safari und im aktuellen Chrome ohne Weiteres; in anderen Browsern hängt der Host einen Player wie hls.js an, wie es die Sandbox tut.

Ein Video kann an einer bestimmten Stelle beginnen: Mit einer Startzeit spielt es ab dieser Sekunde, und auch der gedruckte Link führt dorthin. Wie ein Video auf Papier erscheint, legt \`videoStyle\` fest: wo Abspielzeichen und QR-Code auf dem Vorschaubild sitzen und ob das Vorschaubild ein Link ist. Dieselbe Einstellung kann die HTML-Ansicht statt des Players das gedruckte Vorschaubild zeigen lassen. Startet ein Video, hält es die anderen an, die gerade zu sehen sind, sodass immer nur eines spielt; kurze stumme Schleifen, die nebeneinander laufen sollen, lassen sich davon ausnehmen. Ein solches Video, auf selbstständiges Abspielen gestellt, startet in der Folio-Ansicht stumm, sobald seine Seite ins Bild kommt, und hält an, wenn sie umgeblättert wird; ist es als Schleife markiert, beginnt es am Ende wieder von vorn. Angelegt wird ein Video im Bedienfeld Ressourcen, aus einem Link zu YouTube oder Vimeo oder als hochgeladene Datei.

# Kästen, Fußnoten und Marken {#boxes lead="Neben dem Fließtext führt ein Buch eine zweite Ebene: Kästen, die einen Exkurs absetzen, Fußnoten am Fuß der Spalte, kleine Marken in der Zeile und ein Register, das sich jede Seite merkt. Alles davon steht im Markdown, und die Konfiguration zeichnet es." summary="Kästen, verschachtelte und gleitende Kästen, Chips, Fußnoten und das Register"}

Der Fließtext ist nur ein Teil dessen, was ein Leser auf einer Seite antrifft. Postext behandelt jedes davon als Inhalt mit einem Namen, geschrieben an der Stelle im Text, an die er gehört, und überlässt sein Aussehen der Konfiguration.

## Kästen

:index{term="Kästen"}\`:::callout\` setzt einen Kasten mit optionalem Titel in einem der Formate, die die Konfiguration definiert. Dieses Buch definiert fünf: die Kästen _Ausprobieren_, die Sie in die Sandbox schicken, die technischen Anmerkungen, die in kursiver Auszeichnungsschrift gesetzten herausgestellten Zitate, die dunkle, seitenbreite Tafel mit Kennzahlen und, neu in diesem Kapitel, eine Randbemerkung, die eine Linie kennzeichnet. Ein Format bestimmt Hintergrund, Rahmen, Ecken, ein Symbol oder eine Marke, die Typografie und den Ort des Kastens: im Textfluss, oben oder unten in einer Spalte, über die ganze Seitenbreite, in der Nebenspalte eines Layouts mit anderthalb Spalten oder an einer festen Position auf der Seite.

Ein langer Kasten kann zwischen seinen Absätzen oder sogar zwischen seinen Zeilen geteilt werden, wobei auf jeder Seite der Teilung mindestens zwei Zeilen bleiben; die Fortsetzung lässt den Titel weg. Innerhalb eines Kastens setzt \`:::columns\` den Inhalt in ausgeglichenen Spalten, wie die Tafel mit Kennzahlen in :ref{id="engine"}.

Die Attribute eines Kastens können sein Format für diesen einen Kasten überschreiben: ein \`title\`, ein \`placement\`, ein \`span\` über Spalte, Seite oder Nebenspalte und ein \`label\`, das in einem Reiter an seiner oberen Ecke gedruckt wird.

## Kästen in Kästen

:index{term="Kästen!verschachtelte"}Ein Kasten kann einen anderen enthalten. Der innere Kasten wird im äußeren geöffnet und vor ihm geschlossen, und jedes bloße \`:::\` schließt den innersten noch offenen Kasten. Der innere Kasten nimmt die Breite seines Elternkastens ein, abzüglich dessen Innenabstand, und behält sein eigenes Format.

:::callout{type="note" title="Zwei Kästen, ein Block"}
Der äußere Kasten ist eine technische Anmerkung. Die Engine platziert ihn mit dem inneren als einen Block.

:::callout{type="try"}
Öffnen Sie das Bedienfeld Text bei diesem Kapitel und löschen Sie die Zeile, die den inneren Kasten schließt. Der äußere Kasten endet jetzt dort, wo das Kapitel endet, und das Bedienfeld Prüfungen meldet es.
:::

Der äußere Kasten geht nach dem inneren weiter, in seinem eigenen Format.
:::

## Kästen, die gleiten

Ein Kasten steht gewöhnlich dort, wo er geschrieben ist, zwischen den Absätzen um ihn herum. Erhält ein Kasten das \`placement\` _top_ oder _bottom_, gleitet er wie eine Abbildung an den Kopf oder den Fuß der ersten Spalte, die Platz für ihn hat, und der Text, der ihm im Markdown folgt, füllt die Seite darüber oder darunter. Der Kasten unter diesem Absatz wurde hier geschrieben, mitten im Abschnitt, und am Fuß einer Spalte gesetzt.

:::callout{type="aside" placement="bottom" title="Wo ein gleitender Kasten landet"}
An der ersten freien Stelle an oder nach dem Punkt, an dem er geschrieben ist, nach derselben Regel wie eine Abbildung.
:::

## Marken und gestaltete Kästen

Ein Format kann eine **Marke** außerhalb des Kastens zeichnen, in einer eigenen schmalen Spalte daneben: ein Symbol, eine Glyphe, eine Form oder ein Bild aus den Ressourcen, mit einer Linie, die über die Höhe des Kastens läuft. Die Randbemerkung, die aus dem vorigen Abschnitt geglitten ist, hat eine: einen goldenen Punkt über einer Linie in derselben Farbe.

Wo eine Marke nicht genügt, kann ein Format den ganzen Kasten mit einer **Gestaltung** zeichnen, aus denselben Slots mit Text, Flächen, Linien und Bildern, die die Kapitelauftakte dieses Buches zeichnen. Der Text des Kastens wird zu einem Element unter anderen, und die Attribute, die am Kasten stehen, lassen sich in der Gestaltung drucken: eine Nummer in einem Abzeichen, eine Stufe in einem Reiter, ein Name in einem Streifen am Fuß.

## Marken in der Zeile

:index{term="Chips"}Manche Inhalte sind kleiner als ein Kasten. \`:chip[…]\` setzt ein Wort in ein kleines abgerundetes Kästchen, das mit dem Text fließt, für Tasten, Zustände und Tags: eine Einstellung, die :chip[allow]{style="state"}, :chip[warn]{style="state"} oder :chip[avoid]{style="state"} sein kann, oder eine Taste wie :chip[Esc]. Ein Chip hat ein Format wie ein Kasten: Hintergrund, Rahmen, Radius, Schrift und Farbe.

Farbfelder sind eine zweite Art. Als \`:swatch{color="#c0452f"}\` geschrieben, setzt ein Farbfeld ein kleines Quadrat in dieser Farbe in die Zeile, :swatch{color="#c0452f"} wie dieses hier.

## Fußnoten

:index{term="Fußnoten"}Auf eine Fußnote wird mit \`[^id]\` direkt nach dem Wort oder Satzzeichen verwiesen, zu dem sie gehört,[^first-note] und sie wird an beliebiger Stelle im Kapitel als Absatz geschrieben, der mit \`[^id]:\` beginnt. Fußnoten werden in der Reihenfolge ihres ersten Aufrufs nummeriert, in jedem Kapitel wieder ab eins; \`footnotes.numbering\` kann sie durch das ganze Buch fortlaufend zählen oder auf jeder Seite neu beginnen lassen.

[^first-note]: Dies ist eine. Sie steht im Markdown ein paar Zeilen weiter unten, als eigener Absatz, und wurde am Fuß der Spalte gesetzt, die die Zeile mit ihrem Aufruf enthält.

Eine Fußnote steht am Fuß der Spalte, die die Zeile mit ihrem Aufruf enthält, unter einem kurzen Strich, und Zeile und Fußnote teilen sich immer eine Spalte: Passt die Fußnote nicht mehr, wandert die Zeile mit ihr weiter.[^second-note] \`footnotes.placement: 'chapterEnd'\` sammelt die Fußnoten eines Kapitels stattdessen nach seinem letzten Block.

[^second-note]: Die Engine gleicht die Spalte mit den Zeilen der Fußnote aus, sodass auch eine Seite mit Fußnoten auf gleicher Höhe endet.

## Ein Register am Ende

:index{term="Register"}Die Einträge eines Registers stehen dort, wo der Text den jeweiligen Begriff behandelt. So druckt \`:index[anaemia]\` das Wort und nimmt es auf, während \`:index{term="Heart!valves"}\` nichts druckt und die Seite unter einem Untereintrag verzeichnet. Ein Schalter \`main\` setzt die Seitenzahl fett, \`range="start"\` und \`range="end"\` begrenzen eine Erörterung, die sich über mehrere Seiten erstreckt, und \`see\` und \`seealso\` schreiben Querverweise. \`:::index\` druckt das Register dort, wo die Direktive steht.

Die Engine liest nach dem Umbruch die Seite jeder Markierung, sodass die Zahlen dem Text folgen. Die Einträge werden in der alphabetischen Ordnung der Dokumentsprache sortiert und unter ihren Anfangsbuchstaben gruppiert, aufeinanderfolgende Seiten werden zu einem Bereich zusammengefasst, und jede Zahl ist im PDF ein Link.

# Bücher, Teile und Kolumnentitel {lead="Ein Buch ist mehr als seine Kapitel: ein Umschlag, eine Inhaltsseite, die sich selbst auf dem Laufenden hält, Teiltitel, Auftakte, die jedes Kapitel ankündigen, und Kolumnentitel, die wissen, wo der Leser gerade ist. All das ist Konfiguration." summary="Kapitel, Überschriftenstile, Design-Slots, Teile, Inhaltsverzeichnis und Seitenzahlen"}

Dieser Leitfaden ist ein Buch aus einundzwanzig Kapiteln, und jedes Kapitel ist ein eigenes Markdown-Dokument. Ein Projekt in der Sandbox ist immer ein Buch: Konfiguration, Ressourcen und Schriften werden gemeinsam genutzt, und die Kapitel folgen aufeinander, wie :ref{id="book-anatomy"} zeigt.

## Aus Kapiteln wird ein Buch

Jedes Kapitel wird für sich gesetzt, als _Fortsetzung_ der Kapitel davor: Es erbt deren Seitenanzahl und die Lage der nächsten Seite, ihre Kapitel- und Abbildungszähler, den offenen Teil und die Kolumnentitel. Deshalb sind die Abbildungen dieses Kapitels ab 7.1 nummeriert, und deshalb zwingt die Bearbeitung eines Kapitels die Engine nie, das ganze Buch neu zu setzen.

## Was ein Kapitel erbt

Die Fortsetzung, die ein Kapitel erhält, ist klein und genau. Sie enthält die Seitenanzahl und die Lage der nächsten Seite, sodass ein Auftakt, der auf eine linke Seite fallen muss, weiß, ob er davor eine Vakatseite braucht. Sie enthält die Zähler der Kapitel, der Ressourcen und der Seitenbezeichnungen. Und sie enthält die Gliederung des Buches, sodass eine Inhaltsseite in Kapitel zwei die Seite drucken kann, auf der Kapitel zehn beginnt.

## Überschriftenstile

Eine Überschrift kann Attribute tragen, in geschweiften Klammern am Ende ihrer Zeile. Das mächtigste ist ein **Stil**: \`{style="cover"}\` wendet einen benannten Überschriftenstil an, der Typografie und Gestaltung der Überschrift ändert und für den Abschnitt, den die Überschrift eröffnet, die Kolumnentitel, die Seitenränder, das Spaltenlayout, die Typografie des Grundtextes und die Palette ändern kann. Ein Stil kann seine Überschriften auch unnummeriert lassen, damit ein Vorwort die Kapitelnummern nicht verschiebt, und sie aus dem Inhaltsverzeichnis heraushalten.

## Ein Blick in die Konfiguration dieses Buches

Der Umschlag ist die Überschrift der ersten Ebene des ersten Kapitels, mit dem Stil _cover_. Der Stil entfernt die Kolumnentitel und zeichnet eine ganzseitige Gestaltung: eine Fläche, die den Anschnitt in der Nachtfarbe füllt, das Umschlagbild, eine Dachzeile in goldenen Versalien, den Titel aus dem Vorspann in der Fraunces mit 88 Punkt, eine kurze goldene Linie, den Untertitel in der Lora kursiv und am Fuß eine Zeile mit Angaben zu den Mitwirkenden.

Die Kapitelauftakte sind eine Gestaltung der ersten Überschriftenebene. Die Kapitelnummer steht groß an der Außenkante, die Dachzeile verbindet das Wort _Kapitel_, die Nummer und den Titel des Teils, und unter einer kurzen weißen Linie folgen der Titel und die Einführung des Kapitels, entnommen aus dem Attribut \`lead\` der Überschrift. Das Attribut \`summary\` derselben Überschrift ist das, was die Inhaltsseite unter jedem Eintrag druckt.

## Design-Slots

:index{term="Design-Slots"}Kolumnentitel, Fußzeilen, Kapitelauftakte und Teilseiten werden von **Design-Slots** gezeichnet: kleinen freien Kompositionen aus Text, Linien, Flächen und Bildern. Jedes Element ist an der Seite, am Anschnitt, am Satzspiegel oder an einem anderen Element verankert, mit Versätzen und Größen in echten Einheiten, und sein Text kann **Platzhalter** enthalten wie \`{pageNumber}\`, \`{chapterTitle}\`, \`{partTitle}\` oder jedes Attribut der Überschrift, etwa das \`{attr.lead}\`, das die Einführung auf das Band dieses Kapitels setzt.

Kolumnentitel sind ein gewöhnlicher Design-Slot mit Elementen, die nach Seitenlage und Rolle gefiltert werden. Auf den linken Seiten dieses Buches stehen die Pagina in der Farbe des Teils und der Titel des Buches an der Außenkante, auf den rechten der Kapiteltitel und die Pagina.

## Teile und Paletten

:index{term="Teile"}\`:::part\` eröffnet einen Teiltitel: eine eigene Seite, die auf die Seitenlage umbricht, die die Konfiguration verlangt, gezeichnet von der Teilgestaltung und gefolgt von einem Inhalt – meist der Liste seiner Kapitel.

In diesem Buch beginnt jeder Teil als Doppelseite: links eine Seite in der Teilfarbe, rechts der Teiltitel. Die Teile brechen mit der Seitenlage _immer ungerade_ um, die vor jeden Teiltitel ein leeres Blatt legt, sodass der Teiltitel immer auf einer rechten Seite landet.

Ein Teil kann das Buch auch umfärben. Farben in der Konfiguration lassen sich mit benannten Einträgen der **Palette**:index{term="Palette"} verknüpfen, und das Attribut \`palette\` eines Teils ersetzt Einträge bis zum nächsten Teil. Dieses Buch definiert einen Eintrag, die _Teilfarbe_, und jeder Teil setzt ihn.

## Eine Inhaltsseite, die Schritt hält

:index{term="Inhaltsverzeichnis"}\`:::toc\` druckt das Inhaltsverzeichnis: einen Eintrag für jede Überschrift der aufgeführten Ebenen und eine Zeile für jeden Teil, mit Nummern, Titeln, Punktführern, Seitenzahlen und wahlweise einer Zeile aus einem Attribut der Überschrift. Die Seitenzahlen sind echt: Die Engine setzt das Buch, liest ab, wo jede Überschrift gelandet ist, und setzt das Inhaltsverzeichnis erneut, bis die Zahlen feststehen.

## Seitenumbrüche und Nummerierung

\`:::pagebreak\` beginnt eine neue Seite und kann eine ungerade oder gerade verlangen, wobei bei Bedarf eine Vakatseite eingefügt wird. \`:::numbering\` wechselt ab der nächsten Seite die Zählweise der Seitenzahlen; so geht eine Titelei mit römischen Seitenzahlen bei Kapitel eins in arabische Seitenzahlen über. Und wo eine Passage etwas mehr Luft über sich braucht, lässt \`:::space\` eine Leerzeile frei, \`:::space{lines=2}\` zwei; zusätzliche Leerzeilen im Markdown fügen nichts hinzu, wie in jedem Markdown.

# Ein Buch, viele Sprachen {#languages lead="Diesen Leitfaden gibt es in zehn Ausgaben, in vier Schriften und zwei Richtungen, und sie teilen eine Gestaltung. Jede Ausgabe behält nur, was ihre Sprache anders sagen muss." summary="Ausgaben, allgemeine Einstellungen, Abweichungen, Schriften und Richtungen"}

Ein übersetztes Buch ist meist ein zweites Buch. Von da an muss jede Korrektur an der Gestaltung zweimal gemacht werden, oder zehnmal, von Hand. Postext hält die Ausgaben eines Buches stattdessen zusammen: ein Projekt mit einer Reihe von Kapiteln für jede Sprache, eine gemeinsame Gestaltung und für jede Sprache eine kurze Liste der Einstellungen, die sie anders setzt.

## Ausgaben

:index{term="Ausgaben"}Ein Buch in der Sandbox kann mehrere Sprachen enthalten. Jede **Ausgabe** hat ihre eigenen Kapitel und, wo eine Abbildung es braucht, eigene Grafiken; Ressourcen, Schriften und Gestaltung gehören dem Buch. Die Adresse der Seite nennt die Ausgabe auf dem Bildschirm, sodass ein Link die Ausgabe öffnet, aus der er kopiert wurde. Der Canvas kann zwei Ausgaben nebeneinander setzen.

Eine neue Ausgabe beginnt als Kopie der Ausgabe auf dem Bildschirm über **Sprache hinzufügen …** im Menü des Buches. Ist die neue Sprache Arabisch, Chinesisch oder Japanisch, übernimmt die Kopie dabei die Voreinstellungen dieser Sprache: die Laufrichtung, die Schreibrichtung, die Schriften und die Regeln ihrer Typografie.

## Allgemeine Einstellungen und Abweichungen

Die Gestaltung eines Buches in mehreren Sprachen liegt in zwei Ebenen. Die **allgemeinen Einstellungen** sind die, die jede Ausgabe verwendet:index{term="allgemeine Einstellungen"}; jede Sprache hat dann eine **Abweichung**, die nur die Felder nennt, die sie anders setzt, Feld für Feld über die allgemeinen gelegt. Eine Farbe, eine Größe oder ein Rand, in der allgemeinen Ebene geändert, erreicht jede Ausgabe auf einmal; in der Abweichung einer Sprache geändert, erreicht sie nur diese Ausgabe.

Das Bedienfeld Gestaltung zeigt die beiden Ebenen mit einem Schalter an seinem Kopf, zwischen _Alle Sprachen_ und nur der aktuellen Sprache. Steht der Schalter auf einer Sprache, trägt ein Feld, das diese Sprache abweichend setzt, eine Markierung, und das Bedienfeld kann einen Wert in die allgemeine Ebene übernehmen oder eine Ausgabe zu ihr zurückführen. Eine kurze Liste am Kopf des Bedienfelds nennt jede Einstellung, die die Sprache für sich setzt.

:::callout{type="note" title="Wie dieser Leitfaden gesetzt ist"}
Die sieben Ausgaben in lateinischer Schrift teilen fast alles: Von den Einstellungen, die die Gestaltung ausmachen, setzt jede ein paar Dutzend für sich, und alle davon sind Wörter: Titel, Namen und die Sprache ihrer Silbentrennung. Die arabische, die chinesische und die japanische Ausgabe behalten dieselbe Seite, dieselbe Palette und dieselben Teile und setzen Schrift, Laufrichtung und Schreibrichtung für ihre Schriftsysteme.
:::

Diese Zahlen zeigt :ref{id="edition-layers"}. Die Aufteilung ist die kleinste Abweichung, die jede Ausgabe haben kann, berechnet von der Engine aus den Ausgaben selbst.

## Was eine Sprache ändert

Die Sprache des Dokuments ist eine Einstellung, \`locale\`, und sie reicht weiter als die Silbentrennung. Sie wählt die Trennmuster, von denen acht Sprachen eingebaut sind; die Namen der eingebauten Abbildungs- und Tabellentypen, _Figure_ auf Englisch, _Abbildung_ auf Deutsch; die Wörter, die eine geteilte Tabelle oder ein fortgesetzter Kasten druckt; die Ordnung eines Registers; und die Ziffern, die ein arabisches Buch als arabisch-indische Zahlzeichen setzen kann. Eine Überschrift oder ein Absatz kann die Sprache für sich wechseln, und ein paar Wörter in einer anderen Sprache lassen sich im Text auszeichnen, sodass ein französisches Zitat in einem deutschen Kapitel nach französischen Regeln umbricht.

## Vier Schriften, zwei Richtungen

Die lateinischen Ausgaben sind von links nach rechts gesetzt, im Blocksatz und mit Silbentrennung. Die **arabische** Ausgabe liest sich von rechts und ist rechts gebunden: Ihre Zeilen werden im Blocksatz durch Kaschida gefüllt, Zahlen und lateinische Wörter behalten in der Zeile ihre eigene Richtung, und die Abbildungen werden gespiegelt gezeichnet, wo ihr Aufbau der Leserichtung folgt.

Die **chinesische** und die **japanische** Ausgabe sind vertikal gesetzt, in Zeilen, die von oben nach unten laufen und einander von rechts nach links folgen, rechts gebunden wie die arabische. Ihre Zeilen folgen den Regeln, die jede Sprache für sich aufgeschrieben hat. Das Japanische fügt **Ruby**:index{term="Ruby"} hinzu, kleine Lesehilfen neben schwierigen Zeichen, im Markdown als \`:ruby[…]{rt="…"}\` geschrieben.

## Übersetzen mit der Engine im Blick

Weil die Seiten beim Tippen gesetzt werden, lässt sich eine Übersetzung beurteilen, während sie entsteht. Ein deutscher Satz, ein Drittel länger als seine englische Vorlage, zeigt seine Kosten sofort, in einer Spalte, die um eine Zeile überläuft, oder in einer Überschrift, die nicht mehr auf ihr Band passt.

:::callout{type="try"}
Öffnen Sie das Bedienfeld Bücher und schalten Sie diesen Leitfaden mit den Schaltflächen seiner Zeile zwischen seinen Sprachen um. Öffnen Sie dann das Bedienfeld Gestaltung, stellen Sie den Schalter an seinem Kopf auf die aktuelle Sprache und lesen Sie die Liste dessen, was diese Ausgabe für sich setzt.
:::

:::part{number="III" title="Jenseits des Fließtexts" palette="band=#1f7a6d"}
9. Zusammengesetzte Seiten
10. Comics und Noten
11. Übungen und Kurse
:::

# Zusammengesetzte Seiten {#composed lead="Nicht jede Seite ist ein Strom von Text. Eine Lehrbuchdoppelseite, ein Magazinauftakt oder ein Merkblatt besteht aus Rahmen, und jeder enthält sein eigenes Stück. Postext hält die Rahmen in einer Vorlage und die Wörter im Markdown." summary="Seitenvorlagen, Rahmen, Slots, Doppelseiten und Text, der nicht passt"}

Die bisherigen Kapitel setzen Text in Spalten, die von Seite zu Seite laufen, und die Engine entscheidet, wohin jede Zeile fällt. Eine große Familie von Büchern arbeitet umgekehrt. In einem Schulbuch wird jede Doppelseite zuerst gezeichnet: ein Band für den Titel, ein Kasten für die Definition, ein Streifen mit Fotos, eine Spalte mit Übungen. Postext setzt auch diese Seiten, unter dem Namen **zusammengesetzte Seiten**, und hält sich an die Regel, der der Rest der Engine folgt: Das Markdown sagt, was der Inhalt ist, die Konfiguration, wohin er kommt.

## Vorlagen und Rahmen

:index{term="zusammengesetzte Seiten"}Eine **Seitenvorlage** ist Teil der Konfiguration:index{term="Seitenvorlagen"}, unter \`pageTemplates\`. Sie benennt eine Reihe von **Rahmen**: Rechtecke, die über einen Anker und einen Versatz oder über eine Zelle eines Rasters auf der Seite platziert werden, mit einer Breite, einer Höhe und einem Kastenformat aus den Kastenformaten des Buches. Ein Rahmen kann so hoch sein wie sein Inhalt, eine feste Höhe haben oder bis zum Rand der Seite reichen; Rahmen lassen sich stapeln oder als **Gruppe** in eine Reihe setzen, sodass die anderen mitrücken, wenn einer wächst. Eine Vorlage trägt außerdem **Schmuck**: Linien, Bänder, Bilder und kurze Texte, die gesetzt werden, sobald die Rahmen stehen.

In einer Vorlage stehen keine Wörter. Ein Rahmen hat einen Namen, eine Größe und ein Aussehen; der Titel, den er druckt, der Text, den er enthält, und das Bild, das er rahmt, kommen alle von der Seite, die ihn verwendet. Deshalb können die zehn Ausgaben dieses Leitfadens eine Vorlage für die Kurzübersicht teilen, die das Buch vor dem Register abschließt: Jede füllt dieselben Rahmen mit ihren eigenen Wörtern.

## Die Rahmen aus dem Markdown füllen

Eine zusammengesetzte Seite steht zwischen zwei Zeilen aus vier Doppelpunkten, und die erste nennt ihre Vorlage. Dazwischen schickt \`:::frame{slot="…"}\` seinen Inhalt an den Rahmen dieses Namens, und eine Überschrift, eine Ressource oder ein Kasten kann einen eigenen Slot nennen. Inhalt, der nichts nennt, geht an den Rahmen, den die Vorlage als **Fließrahmen** markiert, und die erste Überschrift an den Rahmen, der Überschriften ihrer Ebene aufnimmt.

:::callout{type="note" title="Die Kurzübersicht im Markdown"}
\`::::page{template="sheet"}\` öffnet sie und \`::::\` schließt sie. Dazwischen eine Überschrift für den Titel, ein Absatz für den Fließrahmen, sechs Blöcke \`:::frame\` für die Karten und einer für die Legende am Fuß der Seite. Positionen, Größen und Farben stehen in der Vorlage, unter Gestaltung › Seite und Spalten › Seitenvorlagen.
:::

## Wie eine Seite gesetzt wird

Eine zusammengesetzte Seite nimmt eine eigene Seite ein, oder zwei bei einer Doppelseite, und der Text nach ihrer schließenden Zeile beginnt auf der nächsten. Die Engine platziert die Rahmen der Reihe nach, füllt jeden mit der Typografie des übrigen Buches, und zeichnet seinen Kasten in seiner endgültigen Größe. Rahmen werden in der Reihenfolge gelesen, in der ihr Inhalt im Markdown steht, nicht in der, in der sie gemalt werden; ein Screenreader, das getaggte PDF und das umfließende EPUB lesen also den Titel, dann den Text, dann die Kästen, wie es ein Mensch täte.

## Wenn die Wörter nicht passen

Text, der für einen Rahmen geschrieben wird, passt nie beim ersten Versuch. Eine Vorlage sagt, was die Seite dagegen tun darf, und die Engine versucht jeden Schritt der Reihe nach und hält beim ersten an, der gelingt. Ein Rahmen, der seinem Inhalt folgt, wächst in den Raum, den seine Gruppe lässt; die Rahmen darunter rücken nach unten; Rahmen, die zum Nachgeben markiert sind, schrumpfen; der Text lässt sich etwas enger setzen. Reicht nichts davon, läuft der Text in einem anderen Rahmen weiter, verkettet wie die verbundenen Textrahmen eines Layoutprogramms, oder auf einer Seite, die nach dieser eingefügt wird, unter einem Vermerk, der sagt, wo er weitergeht.

Was die Seite nicht lösen konnte, meldet das Bedienfeld Prüfungen mit seinen Vorschlägen: welcher Rahmen überläuft, um wie viele Zeilen und was ihn passend machen würde. Ein **Umbruchprotokoll** hält jeden Schritt fest, den die Engine für die Seite getan hat, sodass ein Gestalter sehen kann, warum ein Kasten tiefer gelandet ist, als die Vorlage ihn gesetzt hatte.

## Doppelseiten und Verbinder

:index{term="Doppelseiten"}Eine Vorlage kann zwei gegenüberliegende Seiten als ein Blatt abdecken. Eine **Doppelseite** beginnt auf einer linken Seite, fügt davor eine Vakatseite ein, wenn der Text davor auf einer linken Seite endet, und lässt Rahmen und Schmuck über den Bund laufen, wo die Vorlage es erlaubt; ein Bundsteg hält alles andere vom Falz frei. Jede Seite der Doppelseite druckt weiterhin ihren eigenen Kolumnentitel und ihre Pagina.

Rahmen lassen sich auch durch **Verbinder** verknüpfen: Linien, Winkel und Kurven zwischen zwei Rahmen, die angeheftet bleiben, wie auch immer die Wörter sie verschieben. Bilder in einem Rahmen können Beschriftungen tragen, die an Punkten des Bildes verankert sind, mit Führungslinien und Zeigern, sodass eine Flusskarte ihre Namen an den Flüssen behält, wenn die Karte skaliert oder übersetzt wird.

## Vorlagen in der Sandbox

Vorlagen werden im Bedienfeld Gestaltung bearbeitet, wo jede mit ihren Rahmen gezeichnet und mit der Zahl der Seiten aufgeführt ist, die sie verwenden. Steht die Vorschau im Modus **Gestaltung**, zeigt eine zusammengesetzte Seite ihr Raster und ihre Ränder, ein Druck auf einen Rahmen wählt ihn aus, Ziehen verschiebt ihn, und seine Griffe ändern seine Größe; der Kasten wird in Millimetern in die Vorlage zurückgeschrieben. Verwenden andere Seiten dieselbe Vorlage, fragt die Sandbox, ob die Änderung für alle gilt oder nur für diese Seite, was eine neue Vorlage auf Grundlage der ersten anlegt.

Auch der umgekehrte Weg ist da. Eine von Hand gesetzte Seite lässt sich als Vorlage speichern, und ein Buch, dessen alte Formate seine Wörter enthielten, kann sie mit einem Befehl für das ganze Buch ins Markdown verlegen, wohin sie gehören.

:::callout{type="try"}
Schalten Sie die Vorschau in den Modus Gestaltung, gehen Sie zur Kurzübersicht direkt vor dem Register und ziehen Sie eine der Karten nach unten. Die Sandbox fragt, ob die Vorlage oder nur diese Seite geändert werden soll; wählen Sie nur diese Seite und öffnen Sie das Bedienfeld Text: Die öffnende Zeile der Seite nennt jetzt eine neue Vorlage.
:::

# Comics und Noten {#comics lead="Manche Bücher sprechen in Bildern, manche in Noten. Ein Comic ist eine Reihe von Zeichnungen und ein Skript, eine Partitur ist Musik, als Text geschrieben. In beiden hält Postext die Wörter im Markdown und übernimmt Lettering und Notenstich selbst." summary="Panels, Sprechblasen, Lettering, Strips und Notensatz"}

Comics und Musik scheinen das Gegenteil dessen, wofür eine Textengine da ist. Eine Comicseite wird gezeichnet, eine Partitur gestochen, und keines von beiden ist eine Spalte aus Zeilen im Blocksatz. Doch im Kern bestehen beide aus Text. Jede Sprechblase eines Comics ist eine Dialogzeile, die übersetzt, gelettert und in eine Zeichnung eingepasst werden muss, und jeder Takt einer Partitur ist Notation, die ein Musiker in einem Texteditor schreiben kann. So behandelt Postext sie: Die Zeichnungen und die Regeln sind Ressourcen und Einstellungen, der Dialog und die Musik stehen im Kapitel.

## Bilder ohne Worte

:index{term="Comics"}Ein Comic beginnt in Postext mit Zeichnungen ohne Lettering. Jedes Bild kann markieren, was nie beschnitten werden darf, seinen **Sicherheitsbereich**, und wo seine Figuren sind: einen Punkt für den Mund jedes Sprechers, einen Rahmen für jedes Gesicht, Zonen, von denen sich Sprechblasen fernhalten sollen.

Das Skript ist das Markdown des Kapitels. Ein Block \`:::page\` teilt eine Seite mit einer kurzen Formel in Panels, \`30 [30 | 20 | *] / *\` für eine Reihe von drei Panels über einem großen, gibt jedem Panel sein Bild und führt unter jedem Panel auf, was darin gesagt wird, eine Zeile pro Sprechblase: \`maya: Opa! Ich bin da!\`. Ein Erzähltext, ein Gedanke, ein Flüstern, ein Schrei oder ein Geräusch ist dieselbe Zeile mit einem anderen Schlüssel oder Format.

## Lettering

:index{term="Lettering"}Die Engine lettert jede Sprechblase in einer einzigen Größe, in der Lettering-Schrift des Buches. Sie bricht die Wörter in Zeilen um, die eine runde Form ergeben, oben und unten kurz, zeichnet dann die Blase mit gleich viel Luft auf jeder Seite um sie herum, platziert sie in Lesereihenfolge im Panel, abseits von Gesichtern und von den Zonen, die das Bild markiert, und richtet ihren Dorn auf den Mund des Sprechers. Zwei aufeinanderfolgende Zeilen desselben Sprechers werden zu einer Blase mit zwei Bäuchen verbunden. Text wird nie verkleinert, damit er passt: Eine Blase, die nicht passt, ändert ihre Form, rückt weiter oder wird im Bedienfeld Prüfungen gemeldet.

Der Strip in :ref{id="guide-strip"} wurde so gelettert. Seine drei Zeichnungen tragen keine Wörter; der Dialog sind drei Zeilen Markdown in diesem Kapitel, und jede Ausgabe dieses Leitfadens lettert ihn in ihrer eigenen Sprache.

:::strip{split="* | * | *" span=page placement=top caption="Ein von der Engine geletterter Strip. Die Zeichnungen teilen alle Ausgaben dieses Leitfadens; die Sprechblasen stehen im Markdown jeder Ausgabe." type=figure id=guide-strip}
::panel{art=strip-proof}
editor: Die deutsche Ausgabe läuft auf Seite 212 um eine Zeile über.
::panel{art=strip-screen}
designer: Dann den Absatz enger setzen, nicht die Seite.
::panel{art=strip-book}
sfx: RASCHEL
:::

## Leserichtung und Übersetzung

Ein westlicher Comic wird von links nach rechts gelesen, ein Manga und ein arabischer Comic von rechts nach links. Postext nimmt die Richtung aus der Sprache der Ausgabe: Eine arabische oder japanische Ausgabe legt die Panels jeder Reihe von rechts her an, spiegelt die Ecken und Schrägen und bindet das Buch rechts, während die Bilder bleiben, wie sie gezeichnet sind. Japanische Sprechblasen werden in senkrechten Zeilen gelettert, mit Satzzeichen, die für die Zeile gedreht werden.

Eine Übersetzung ist dasselbe Markdown mit anderen Wörtern. Die Bilder, die Beschnitte und die Markierungen werden geteilt; jede Ausgabe misst ihren eigenen Text und platziert ihre eigenen Sprechblasen. Die Sprechblasen ändern ihre Größe mit dem Text, ohne dass jemand sie von Hand verschiebt.

## Seiten, Doppelseiten und Strips

Ein Comic kann eine Seite füllen, sich für ein Panorama über zwei gegenüberliegende Seiten erstrecken oder als **Strip** im Text stehen, so breit wie eine Spalte oder die Seite. Ein Strip verhält sich wie eine Abbildung: Er lässt sich nummerieren und beschriften, mit \`:ref\` zitieren und an den Kopf oder den Fuß einer Seite gleiten lassen.

## Musik als Text

:index{term="Notensatz"}Eine Partitur wird im Kapitel als abgegrenzter Block von Notation geschrieben. Postext liest vier Formate: **ABC**, kompakt und leicht zu tippen, für Melodien und Lieder; **MusicXML**, das die Notationsprogramme der Musiker exportieren; **MEI** für wissenschaftliche Ausgaben; und **Humdrum** für Choräle und Analyse. Die Engine sticht die Musik mit Verovio, der Notenstichbibliothek der Music Encoding Initiative, in der Breite der Spalte.

Die Melodie unten steht in fünf Zeilen ABC im Markdown dieses Kapitels. Die Engine sticht sie und setzt sie wie eine abgesetzte Formel, auf dem Grundlinienraster.

\`\`\`abc {alt="Eine kurze Melodie in G-Dur im Dreivierteltakt"}
X:1
M:3/4
L:1/8
K:G
D2 | G2 B2 d2 | c2 A2 F2 | G4 B2 | A4 D2 | G2 B2 d2 | e2 c2 A2 | G6 |]
\`\`\`

Eine lange Partitur wird in **Systeme** geteilt, die Notenzeilen, denen ein Leser folgt, und die Systeme laufen von Spalte zu Spalte und von Seite zu Seite weiter wie die Zeilen eines Absatzes, nie mitten durch ein Liniensystem geschnitten. Ein Notenbeispiel, das der Text zitiert, kann stattdessen eine Ressource sein, nummeriert und beschriftet wie eine Abbildung. Wie die Musik aussieht, ist eine Einstellung: die Größe der Liniensysteme, die Notenschrift, Taktzahlen und die Ränder um eine Partitur, mit benannten Formaten für kleinere Beispiele in einem Kasten.

Musik ist optional. Der Notenstecher wiegt mehrere Megabyte und wird nur von Büchern geladen, die Notation enthalten. Partituren werden in Canvas, HTML und PDF als Vektoren gezeichnet, im barrierefreien PDF als Abbildungen mit ihrem Alternativtext getaggt und ins EPUB übernommen.

# Übungen und Kurse {#exercises lead="Ein Lehrbuch verlangt von seinem Leser etwas: wählen, ergänzen, zuordnen, schreiben. Postext liest die Fragen und ihre Antworten aus dem Markdown, druckt die Übung für den Schüler und lässt die Bildschirmausgaben sie prüfen." summary="Übungsarten, Lösungsschlüssel, Lösungen, Bildschirmausgaben und SCORM"}

Die Übungen eines Schulbuchs gehören zu den mühsamsten Seiten, die man von Hand setzt. Jede Lücke muss lang genug zum Hineinschreiben sein und darf ihre Antwort nicht durch ihre Länge verraten, die Optionen einer Frage werden im Stil der Reihe bezeichnet, der Lösungsschlüssel hinten muss zu den Fragen vorn passen, und die Lehrerausgabe druckt dieselben Seiten mit eingetragenen Antworten. All das ergibt sich aus zwei Dingen: was die Frage ist und was ihre Antwort ist. Postext verlangt nichts anderes.

## Eine Übung im Markdown

:index{term="Übungen"}Eine Übung ist ein Block zwischen \`:::exercise\` und \`:::\`. Ihre ersten Absätze sind die Arbeitsanweisung; was folgt, ist die Frage, in Markdown geschrieben, das eine Lehrerin ohne Handbuch tippen könnte. Eine Aufgabenliste mit angekreuzten richtigen Optionen ist eine Multiple-Choice-Frage. Wörter in doppelten eckigen Klammern sind Lücken, und die Wörter darin sind die Antworten. Paare, die ein Pfeil verbindet, sind eine Zuordnungsübung. Die Engine liest die Art der Übung aus dem, was sie vorfindet, und ein Attribut \`type\` nennt sie, wenn der Inhalt nicht genügt.

Die drei Übungen unten handeln von diesem Buch. Sie stehen im Markdown dieses Kapitels, jede in wenigen Zeilen, und die Engine hat sie nummeriert, ihre Optionen bezeichnet, die Lücken gezogen und die Kästen gesetzt.

:::exercise{level=1}
Was davon entscheidet die Konfiguration und nicht das Markdown?

- [ ] Die Wörter einer Überschrift
- [x] Die Farbe des Kapitelbands
- [ ] Welche Abbildung ein Absatz erwähnt
:::

:::exercise{bank level=2}
Ergänzen Sie die Sätze mit den Wörtern aus dem Kasten.

1. Eine Abbildung gleitet an die erste freie Stelle nach ihrer [[Erwähnung]].
2. Die Engine bricht einen Absatz als [[Ganzes]] um, nicht Zeile für Zeile.
3. Eine zusammengesetzte Seite füllt die Rahmen einer [[Vorlage]].

::bank[Rand | Spalte]
:::

:::exercise{level=2}
Ordnen Sie jeder Ausgabe zu, wofür sie gedacht ist.

- PDF/X -> Die Druckerei
- EPUB -> Ein E-Reader
- SCORM -> Ein Kurs auf einer Lernplattform
:::

## Zwölf Arten

Postext kennt zwölf Arten von Übungen, genug für das meiste, was ein Lehrbuch druckt: Multiple Choice und Richtig oder Falsch; Lücken, mit oder ohne Wortspeicher, und Auswahlen mitten in der Zeile; Zuordnen, Sortieren in Gruppen, Ordnen von Elementen oder der Wörter eines Satzes; Markieren von Wörtern in einem Text; offene Fragen mit Linien oder einer linierten Fläche zum Schreiben; Suchsel und Kreuzworträtsel, deren Gitter die Engine aus der Wortliste baut; und Rechenaufgaben, in Spalten gesetzt, für die Arithmetik. Elemente werden gemischt, wo die Art es verlangt, immer auf dieselbe Weise, sodass PDF, Bildschirm und Lösungsschlüssel übereinstimmen.

Eine Schwierigkeitsstufe wird als Punkte nach der Nummer gedruckt, Aktivitätssymbole können Übungen für Partnerarbeit oder zum lauten Sprechen kennzeichnen, und das erste Element lässt sich als Muster beantwortet drucken. Wie all das aussieht, bestimmt ein **Übungsstil**: das Abzeichen der Nummer, die Bezeichnungen der Optionen, das Aussehen einer Lücke, die Lineatur einer Schreibfläche, der Kasten um die Übung, gebildet aus den Kastenformaten des Buches.

## Antworten und Lösungen

Jede bewertete Übung hat einen **Lösungsschlüssel**, gebildet aus ihren Antworten: die richtige Option, die Lücken der Reihe nach, die Paare. Ein Block \`:::solution\` in einer Übung fügt eine ausgearbeitete Lösung in beliebigem Markdown hinzu. Wo sie gedruckt werden, ist eine Einstellung für das ganze Buch: nirgends, direkt nach jeder Übung, auf dem Kopf stehend darunter wie in Rätselheften, am Ende des Kapitels, an einer Stelle des Kapitels, die sie anfordert, oder in einem Lösungskapitel am Ende des Buches. Dieser Leitfaden behält seine Antworten für den Bildschirm.

Eine **Lehrerausgabe** ist dasselbe Buch mit einer geänderten Einstellung: jede Antwort an ihrem Platz gedruckt, in der Farbe eines Korrekturstifts, Lücken gefüllt, Optionen eingekreist, Zuordnungslinien gezogen.

## Am Bildschirm

In der HTML-Ansicht und in einem EPUB lassen sich die Übungen beantworten. Der Leser tippt in die Lücken, kreuzt Optionen an und zieht die Zuordnungslinien, prüft dann die Antworten, bittet um einen Hinweis, sieht sich die Lösung an oder beginnt von vorn. Richtige und falsche Antworten werden mit einer Farbe und einem Zeichen markiert und Screenreadern angesagt, und die Antworten bleiben im Browser gespeichert, sodass ein Leser sie beim nächsten Besuch wiederfindet.

:::callout{type="try"}
Öffnen Sie die HTML-Ansicht bei diesem Kapitel und beantworten Sie die drei Übungen. Prüfen Sie sie und wechseln Sie dann zur PDF-Ansicht: dieselben Übungen, gesetzt für den Bleistift des Schülers.
:::

## Kurse

:index{term="SCORM"}Ein Buch mit Übungen kann zum Kurs werden. Die Ansicht **SCORM** der Sandbox packt die Kapitel und Abschnitte, die Sie auswählen, in ein SCORM-Paket, das Format, das Lernplattformen wie Moodle lesen. Jeder Teil des Buches, den die Plattform verfolgt, meldet eine Punktzahl aus den richtig beantworteten Übungen, ob er abgeschlossen ist, also jede Seite gesehen und jede Übung geprüft, und ob er bestanden ist, gemessen an einer Schwelle, die das Buch festlegt. Ein Test kann begrenzen, wie oft eine Übung geprüft wird, wie oft sie neu beginnt und wann ihre Lösung erscheint.

Das Paket trägt das Buch so, wie die HTML-Ansicht es zeigt, gesetzt von derselben Engine, sodass der Kurs aussieht wie das gedruckte Buch, das die Schüler auf dem Tisch haben.

:::part{number="IV" title="In der Praxis" palette="band=#c0452f"}
12. Schreiben für Postext
13. Die Sandbox
14. Ausgabe: Canvas, HTML, PDF und EPUB
15. Prüfen und in Druck geben
16. Das Buch in 3D
17. Werkzeuge rund um die Engine
18. Roadmap und Community
:::

# Schreiben für Postext {lead="Alles in diesem Buch wurde in einfachem Markdown mit einer Handvoll Erweiterungen geschrieben. Sie bleiben in jedem Texteditor lesbar und sagen, was der Text ist, nie, wohin er gehört." summary="Markdown, Direktiven, Kästen und Absatzformate"}

Postext-Dokumente sind zuerst Markdown.:index{term="Markdown"} Wer Markdown kennt, kann vom ersten Tag an für Postext schreiben; die Erweiterungen erscheinen nur dort, wo ein Buch etwas braucht, wofür Markdown nie Worte hatte.

## Einfaches Markdown

Überschriften mit einem bis sechs Rautenzeichen, Absätze, Blockzitate, Aufzählungen, nummerierte Listen und Aufgabenlisten – verschachtelt mit zwei Leerzeichen je Ebene, bis zu fünf Ebenen tief – und abgesetzte Formeln zwischen doppelten Dollarzeichen. Im Fließtext das übliche Fett und Kursiv, dazu Hochstellung zwischen Zirkumflexen wie in 10^-8^, Tiefstellung zwischen Tilden wie in H~2~O, Formeln im Text zwischen Dollarzeichen und Backslash-Escapes für Zeichen, die wörtlich erscheinen sollen.

Einige Details sind gut zu wissen. Aufeinanderfolgende Zeilen eines Absatzes werden zusammengefügt, Zeilenumbrüche im Quelltext erreichen die Seite also nie; ein neuer Absatz braucht eine Leerzeile. Listen vertragen eine einzelne Leerzeile zwischen den Einträgen, zwei Leerzeilen beenden sie jedoch. Nummerierte Listen behalten die Zahl, mit der sie beginnen, eine Liste kann also bei 0 oder 5 anfangen. Und eine Überschrift kann mit zwei Backslashes einen Zeilenumbruch in ihrem Titel erzwingen; das wirkt sich nur auf die Gestaltungen aus, die den Titel groß drucken – Kapitelauftakte und Teiltitelseiten –, während Kolumnentitel, Inhaltsverzeichnis und PDF-Lesezeichen ihn auf einer Zeile halten.

Manches aus Markdown fehlt mit Absicht, weil ein Buch andere Wege hat, es auszudrücken: Bilder sind Ressourcen statt eingebetteter Grafiken, Tabellen sind Ressourcen mit einem Modell statt Pipe-Tabellen, und rohes HTML hat auf einer gedruckten Seite keine Bedeutung. Links sind in der HTML-Ansicht und im PDF aktiv, und Code im Fließtext zwischen Backticks wird in der Codeschrift des Buches gesetzt, so wie die Syntax, die dieses Buch zitiert.

## Hervorhebungen, Kapitälchen und Tabulatoren

Drei weitere Marken ändern das Aussehen von Wörtern, ohne die Zeile zu verlassen. \`:mark[…]\` legt ein Farbband hinter eine Wortgruppe, :mark[so wie ein Lehrbuch das Wichtige anstreicht], und die Wörter darunter brechen um, werden getrennt und im Blocksatz ausgeglichen wie die übrigen, sodass das Markieren eines fertigen Buches keine seiner Seiten verschiebt. \`:smallcaps[…]\` setzt Kleinbuchstaben als Kapitälchen, etwa :smallcaps[Hamlet] im Personenverzeichnis eines Stücks oder ein Akronym wie :smallcaps[unesco], gebildet aus den Versalien der Schrift selbst und in jedem Ausgabeformat auf dieselbe Weise. Und \`:tab\` schickt den Rest einer Zeile an einen Tabulator, den die Konfiguration festlegt: einen Preis am Ende der Zeile hinter Punktführern oder die Punktzahl einer Prüfungsaufgabe am Rand.

## Direktiven und Container

Alles Übrige wird mit einem kleinen Vokabular von Direktiven ausgedrückt, das in :ref{id="document-format"} aufgeführt ist. Einzeilige Direktiven beginnen mit drei Doppelpunkten und wirken an der Stelle, an der sie stehen. Container umschließen Blöcke zwischen einer öffnenden Zeile mit Attributen und einer schließenden Zeile aus drei Doppelpunkten; sie lassen sich verschachteln, und ein nicht geschlossener Container wird am Ende des Kapitels geschlossen, mit einer Warnung.

Attributwerte können in doppelte oder einfache Anführungszeichen gesetzt werden oder ohne sie stehen, wenn sie aus einem einzigen Wort bestehen, und ein Schlüssel ohne Wert ist ein Schalter. Eine Direktive, die die Engine nicht kennt, wird nicht stillschweigend verworfen: Sie wird als Absatz gedruckt, damit nichts verschwindet, und das Bedienfeld Prüfungen meldet sie mit Kapitel und Zeile. Dasselbe geschieht mit einem Kastenformat oder einem Absatzformat, das die Konfiguration nicht definiert. Auch Kästen, Fußnoten und das Register werden mit Direktiven geschrieben; sie haben ein eigenes Kapitel, :ref{id="boxes"}.

## Ressourcen erwähnen

Verweise verdienen einen genaueren Blick, denn mit ihnen wird der größte Teil des Apparats eines Buches geschrieben. \`:ref{id="…"}\` druckt standardmäßig die Kurzbezeichnung und die Nummer – _Abb. 5.1_ in der deutschen Ausgabe dieses Buches – und bindet die Ressource ein, wenn sie zum ersten Mal erwähnt wird. Ein Attribut \`style\` druckt nur die Nummer oder die vollständige Bezeichnung, _Abbildung 5.1_; \`case\` setzt die Bezeichnung in Klein- oder Großbuchstaben oder mit großem Anfangsbuchstaben, damit ein Verweis am Satzanfang richtig steht; und \`text\` druckt einen beliebigen Wortlaut, bindet die Ressource aber trotzdem ein und verlinkt sie. Ein Verweis auf eine ID, die es nicht gibt, druckt ein Fragezeichen und löst eine Warnung aus, sodass fehlerhafte Verweise gefunden werden, bevor das Buch in Druck geht.

\`::resource{id="…"}\` auf einer eigenen Zeile bettet eine Ressource genau an dieser Stelle ein, wenn ihre Platzierung _hier_ lautet; andernfalls zählt die Direktive einfach als Erwähnung. Dieses Buch verwendet sie nirgends und lässt jede Abbildung gleiten – meist die bessere Wahl, weil die Engine dann jeder einen Platz nahe ihrer Erwähnung sucht.

## Querverweise und Zitate

:index{term="Zitate"}Dasselbe \`:ref\` benennt jede Stelle des Buches:index{term="Querverweise"}, die eine Kennung trägt: eine Überschrift, geschrieben als \`## Method {#method}\`, einen mit \`{#id}\` geöffneten Kasten oder eine als \`[these words]{#key}\` markierte Wortgruppe. Es druckt _Abschnitt 3.2_ oder _Kapitel 4_, mit \`style=title\` den Titel oder mit \`style=page\` die Seite, und die Seite stimmt, weil die Engine das Buch so lange neu umbricht, bis es zur Ruhe kommt. Jeder solche Verweis ist ein Link im PDF, im HTML und in diesen Vorschauen.

Werke werden so zitiert, wie Pandoc es schreibt, \`[@garcia2020, p. 33]\` oder \`@garcia2020\` im Satz, mit den Literaturangaben im Frontmatter oder in einem Block \`:::references\` im BibTeX-Format. Der Zitierstil ist eine Einstellung, keine Eigenschaft des Textes: APA, Chicago, MLA, IEEE, Vancouver, ISO 690, GB/T 7714 oder ein eigener Stil, ausgewählt unter Gestaltung › Zitate, wo eine Vorschau das Ergebnis zeigt. Das Literaturverzeichnis folgt auf das letzte Kapitel oder steht dort, wo \`:::bibliography\` geschrieben ist. Das Zitat eines Werkes, das in den Literaturangaben fehlt, wird so gedruckt, wie es geschrieben ist, und unter den Warnungen aufgeführt.

## Mathematik im Quelltext

Mathematik wird in LaTeX-Notation geschrieben. Formeln im Text stehen zwischen einfachen Dollarzeichen mitten im Satz; abgesetzte Formeln stehen zwischen doppelten Dollarzeichen, auf einer eigenen Zeile oder als Block über mehrere Zeilen. Ein Dollarzeichen, das als Dollarzeichen gedruckt werden soll, wird mit einem Backslash maskiert. Eine Formel, die nie geschlossen wird oder die MathJax nicht lesen kann, wird im Bedienfeld Prüfungen gemeldet und auf der Seite durch einen roten Platzhalter ersetzt, damit sie nicht unbemerkt ins PDF gelangt.

## Code

Ein längeres Stück Code ist ein **Listing**, geschrieben zwischen zwei Zeilen aus drei Backticks. Alles darin bleibt, wie es geschrieben ist, Leerzeichen und Leerzeilen eingeschlossen, und nichts davon wird als Markdown gelesen. Das Wort nach den öffnenden Backticks nennt die Sprache, und in einem Dutzend Sprachen färbt die Engine Schlüsselwörter, Zeichenketten, Zahlen und Kommentare ein; Attribute ergänzen einen Titel, Zeilennummern und eine Tönung hinter den Zeilen, auf die es ankommt:

\`\`\`js {title="chapter.js" lineNumbers highlight="4"}
import { buildDocument } from 'postext';
import { renderToPdf } from 'postext-pdf';

const doc = buildDocument(markdown, config);
const pdf = await renderToPdf(doc, { fontProvider });
\`\`\`

Eine Zeile, die breiter ist als ihre Spalte, läuft hinter einem kleinen Zeichen in der nächsten Zeile weiter, oder das ganze Listing wird etwas kleiner gesetzt, oder die Zeile wird am Rand abgeschnitten, je nachdem, was das Codeformat unter Gestaltung › Typografie › Code vorgibt. Ein langes Listing wird wie ein Kasten zwischen seinen Zeilen geteilt und lässt auf keiner Seite der Teilung weniger als zwei Zeilen stehen, und ein Codeblock kann auch über die ganze Seite reichen oder an den Kopf oder Fuß einer Spalte gleiten.

## Absatzformate

\`:::paragraphs{style="…"}\` wendet ein benanntes Absatzformat auf die Absätze an, die es umschließt: ein Motto, eine Widmung, ein Literaturverzeichnis, ein Impressum. Ein Format kann Schrift, Größe, Zeilenabstand, Farbe, Ausrichtung – auch zentriert und rechtsbündig –, Einzug und Abstände ändern. Die Signatur am Schluss des letzten Kapitels dieses Buches ist eines. Ein Format kann seinen ersten Absatz auch mit einer **Initiale** beginnen, einem Anfangsbuchstaben über zwei oder drei Zeilen, und das Attribut \`dropcap\` einer Überschrift schaltet sie für den folgenden Absatz ein oder aus.

## Gut für die Engine schreiben

Einige Gewohnheiten erleichtern der Engine die Arbeit und machen die Seiten besser. Leiten Sie jede Liste mit einem Satz ein, damit eine Liste nie das Erste unter einer Überschrift ist; das Bedienfeld **Prüfungen** kann die markieren, bei denen es doch so ist. Halten Sie die Überschriften in ihrer Ordnung, ohne Ebenen zu überspringen. Erwähnen Sie jede Abbildung und jede Tabelle im Text, nahe der Stelle, an der Sie sie haben möchten: Die Erwähnung entscheidet, wohin die Ressource kommen kann und welche Nummer sie erhält. Überlassen Sie die Platzierung der Konfiguration, es sei denn, eine Ressource braucht wirklich eine eigene Position. Markieren Sie die Begriffe des Registers dort, wo der Text sie behandelt, nicht überall, wo sie genannt werden. Und schreiben Sie für jede Abbildung einen Alternativtext, denn das barrierefreie PDF gibt ihn an Leser weiter, die das Bild nicht sehen können.

## Frontmatter

Die Metadaten eines Buches stehen im YAML-Frontmatter am Kopf seines ersten Kapitels: Titel, Untertitel, Autor und Erscheinungsdatum, die jedem Design-Slot als Platzhalter zur Verfügung stehen. Der Umschlag dieses Buches druckt Titel und Untertitel von dort. Jeder andere Schlüssel bleibt für die Host-Anwendung erhalten; Frontmatter in späteren Kapiteln wird ignoriert, mit einer Warnung.

# Die Sandbox {lead="Die Sandbox ist die Engine mit einem Editor darum herum: die Seite, die Sie gerade lesen, das Markdown, aus dem sie entstanden ist, und jede Einstellung, die sie geformt hat, nebeneinander und live." summary="Der Editor, die Bedienfelder, Projekte, Vorlagen und das Teilen"}

Alles, was dieses Buch beschreibt, lässt sich sofort ausprobieren, ohne Code zu schreiben. Die Sandbox ist keine Demo, die auf Postext aufsetzt; sie ist die Engine selbst, in einer Oberfläche für zwei Zielgruppen zugleich – Entwickler, die die Bibliothek prüfen, und Gestalter, die sehen wollen, was jede Option bewirkt.

## Ein Rundgang durch die Oberfläche

:index{term="Sandbox"}Die Oberfläche folgt dem vertrauten Aufbau eines Editors, skizziert in :ref{id="sandbox-ui"}. Eine **Aktivitätsleiste** links wechselt zwischen sieben Bedienfeldern – Bücher, Kapitel, Text, Ressourcen, Schriften, Gestaltung und Prüfungen, das letzte mit der Zahl der offenen Probleme. Eine **Seitenleiste** mit veränderbarer Breite enthält das aktive Bedienfeld; ein Klick auf das aktive Symbol klappt sie ein. Der **Anzeigebereich** rechts zeigt dasselbe Layout in sechs Tabs: Canvas, PDF, Folio, HTML, EPUB 3 und SCORM. Die Oberfläche spricht Englisch, Spanisch, Katalanisch, Französisch, Deutsch, Italienisch, brasilianisches Portugiesisch, vereinfachtes Chinesisch, Japanisch und Arabisch und läuft im Arabischen von rechts nach links; eine Einstellung für große Schaltflächen und Felder macht jedes Bedienelement leichter erreichbar, per Touch oder mit unsicherer Hand.

Seitenleiste und Anzeigebereich teilen sich das Fenster, und die Grenze zwischen ihnen lässt sich verschieben. Jedes Bedienfeld und der Anzeigebereich merken sich ihren Zustand zwischen zwei Besuchen: Zoom und Ansichtsmodus des Canvas, den Spaltenmodus der HTML-Ansicht, die geöffneten Gruppen im Bedienfeld Gestaltung. Farbschema und Sprache der Oberfläche werden am Fuß der Aktivitätsleiste umgeschaltet, und die Sprache der Oberfläche ist unabhängig von der Sprache des Buches.

## Ein Buch bearbeiten

Der Editor im Bedienfeld **Text** hebt Frontmatter und Formeln hervor, und seine Werkzeugleiste fügt Formatierungen, Listen, Seitenumbrüche und Wechsel der Seitenzählung ein. An seinem Kopf wechselt ein **Kapitelumschalter** zwischen den Kapiteln des Buches und zeigt ihre Seitenbereiche; jedes Kapitel hat seinen eigenen Rückgängig-Verlauf und seine eigene Cursorposition. Editor und Seiten bleiben in beide Richtungen synchron: Ein Klick auf ein Wort der Seite setzt den Cursor im Markdown darauf, und markierter Text wird auf der Seite hervorgehoben. Das Bedienfeld **Kapitel** zeigt das geöffnete Buch als Ganzes, seine Kapitel in ihrer Reihenfolge mit ihren Seitenbereichen.

Die Leiste über der Vorschau wechselt zwischen zwei Arbeitsweisen. Im Modus **Inhalt** wird der Text bearbeitet, im Bedienfeld Text und auf den Seiten; im Modus **Gestaltung** sind es die Formate und die Seitenvorlagen, und ein Klick auf die Seite wählt das Format oder den Rahmen, der gezeichnet hat, was unter dem Zeiger liegt. Ein zweiter Klick auf dieselbe Stelle steigt eine Ebene höher, von einem Wort zu seinem Absatz, seinem Kasten und seiner Seite, und :chip[⌘ Z] nimmt die letzte Änderung beider Arten zurück, ein getipptes Wort ebenso wie eine verschobene Einstellung, aus einem einzigen Verlauf.

Der Editor behält auch das Buch im Blick. Sein Kapitelmenü listet jedes Kapitel mit den Seiten auf, die es belegt, sobald sie bekannt sind, und der Wechsel zu einem anderen Kapitel schaltet die Vorschauen darauf um. Kapitel lassen sich anlegen, umbenennen, umsortieren, an ihren Überschriften der ersten Ebene teilen oder mit dem vorigen zusammenführen, und das ganze Kapitel kann als Markdown-Datei exportiert oder durch eine solche ersetzt werden. Ein Buch mit hundertzwanzig Kapiteln lässt sich bedienen wie ein kurzes: Das Menü listet sie unter ihren Teilen auf und beginnt ab dreißig Kapiteln mit einem Suchfeld, das ein Kapitel an seiner Nummer oder an einem Wort seines Titels findet.

## Konfiguration

Das Bedienfeld **Gestaltung** bearbeitet die gesamte Konfiguration – mehr als fünfhundert Felder – in Gruppen: Seite und Spalten, Schriftsystem, Farben, Typografie, Überschriften und Inhaltsverzeichnis, Listen, Abbildungen und Tabellen, Kästen, Übungen, Comics, Kopf- und Fußzeilen, Teile, Export, Folio (das Buch in 3D) und erweiterte Einstellungen. Ein Suchfeld findet jede Option über ihren Namen, und der Filter **Geändert** zeigt, was von den Standardwerten abweicht. Jedes Feld und jeder Abschnitt lässt sich einzeln zurücksetzen, und die Konfiguration kann als Datei exportiert und importiert werden. In einem Buch mit mehreren Sprachen wählt ein Schalter am Kopf des Bedienfelds zwischen den Einstellungen, die alle Ausgaben teilen, und denen der Ausgabe auf dem Bildschirm, wie :ref{id="languages"} erklärt.

## Die sechs Ansichten

Die Ansicht **Canvas** ist die Arbeitsvorschau: Sie zoomt von einem Viertel der wirklichen Größe bis zum Vierfachen, passt die Seite an die Breite oder die Höhe des Anzeigebereichs an und zeigt Einzel- oder Doppelseiten, wobei die erste Seite allein als rechte Seite steht, so wie sich ein gedrucktes Buch öffnet. Die Ansicht **PDF** erzeugt im Browser ein echtes PDF und zeigt es im browsereigenen Betrachter, mit Schaltflächen, um es neu zu erzeugen, herunterzuladen und zu drucken. Die Ansicht **Folio** zeigt das Buch gebunden und aufgeschlagen auf einem Schreibtisch, dreidimensional, mit Blättern, die sich unter der Hand umschlagen lassen; ihr ist ein eigenes Kapitel gewidmet, _Das Buch in 3D_. Die Ansicht **HTML** zeigt dasselbe Layout als positioniertes HTML, isoliert vom Rest der Seite, mit einem Regler für die Textgröße und zwei Lesemodi: eine einzige scrollende Spalte oder so viele Spalten, wie auf den Bildschirm passen. Die Ansicht **EPUB 3** schreibt das Buch im Browser als E-Book, in einem von zwei Layouts: Ein **festes Layout** bewahrt die gedruckten Seiten Zeile für Zeile, mit echtem Text, der sich markieren und durchsuchen lässt; ein **umfließendes** Buch lässt den Text dem Bildschirm und der Schriftgröße des Lesers folgen. Ein kleiner Reader im Tab zeigt die Datei, die Sie gleich herunterladen: Die Pfeiltasten, ein Wischen auf dem Smartphone oder die Schaltflächen blättern seine Seiten um, eine Liste springt zu jedem Kapitel, und ein umfließendes Buch lässt sich in größerer oder kleinerer Schrift lesen. Die Ansicht **SCORM** packt die Kapitel und Abschnitte, die Sie in einem Baum des Buchs ankreuzen, zu einem Kurs für eine Lernplattform wie Moodle, als feste Seiten oder umfließenden Text; ihre Übungen senden ihre Punktzahlen an die Plattform.

Die Ansichten Canvas, HTML und Folio können das aktuelle Kapitel oder das ganze Buch umbrechen; das PDF hat seine eigene Auswahl, sodass sich ein einzelnes Kapitel schnell prüfen lässt, während die Vorschauen das Buch zeigen; das EPUB und das SCORM-Paket werden immer aus dem ganzen Buch gesetzt. Dieser Leitfaden öffnet sich im Modus für das ganze Buch. Ein vertikal gesetztes Buch wie die chinesische Ausgabe dieses Leitfadens lässt sich in der HTML-Ansicht nur Seite für Seite lesen, weil eine einzige scrollende Spalte seine Zeilen quer legen würde.

## Auf dem Smartphone

Unterhalb der Breite eines Tablets ordnet sich die Sandbox neu an. Die Leiste der Bedienfelder wandert an den unteren Bildschirmrand, ein geöffnetes Bedienfeld überdeckt die Vorschau, statt neben ihr zu stehen, und wer das Bedienfeld schließt, findet die Vorschau auf der Seite wieder, die sie zuletzt zeigte. Die Werkzeugleisten der Vorschauen docken am unteren Rand an, wo der Daumen sie erreicht, und brechen auf schmalen Bildschirmen in eine zweite Zeile um. Ein Smartphone kann kein PDF innerhalb einer Seite anzeigen, daher bietet die PDF-Ansicht stattdessen an, die Datei zu öffnen; und da ein Smartphone einem Browser-Tab weniger Speicher gibt, als ein Buch in drei Dimensionen braucht, fehlt dort die Ansicht Folio.

## Ressourcen und Schriften

Das Bedienfeld **Ressourcen** listet die Ressourcen des Buches nach Typ auf. Bilder und SVG-Dateien lassen sich hineinziehen, Tabellen werden in einem Editor nach Art einer Tabellenkalkulation bearbeitet, mit verbundenen Zellen, Füllungen, Bildern, Spaltenbreiten und Einfügen aus einer Tabellenkalkulation, und der Text eines SVG-Diagramms lässt sich direkt an Ort und Stelle bearbeiten. Ein Klick auf eine Bildunterschrift, eine Anmerkung, eine Zelle oder den Text eines Diagramms in der Vorschau öffnet das Element im Bedienfeld. Das Bedienfeld Schriften fügt eigene Familien hinzu, Schnitt für Schnitt, in den üblichen Web- und Desktop-Formaten; eine eigene Familie hat Vorrang vor einem Google Font gleichen Namens.

Jede Ressource hat eine Detailansicht mit ihrer ID, ihrem Typ, ihrer Bildunterschrift, ihrer Anmerkung und ihrem Alternativtext, ihrer Platzierung – Position, Spannweite, Drehung, Breite, Ausrichtung und einer seitlichen Bildunterschrift – und einer Live-Vorschau. Wer eine Ressource löscht, wird gewarnt, wenn der Text sie noch erwähnt. Das Bedienfeld Schriften prüft seinerseits, ob jede Familie, die die Konfiguration nennt, die benötigten Schnitte und Stile hat, und warnt vor fehlenden oder doppelten Varianten.

## Warnungen

Das Bedienfeld **Prüfungen** listet alles auf, was der Engine beim Setzen des Buches aufgefallen ist: Schriften, die nicht geladen werden konnten, zu lockere Zeilen, übersprungene Überschriftenebenen, nicht geschlossene Container und unbekannte Direktiven, unbekannte Formate, Platzhalter, die nichts drucken, fehlende Ressourcen und Kästen, die für ihre Spalte zu hoch sind. Jede Warnung nennt Kapitel und Zeile, und ein Klick darauf springt dorthin.

## Projekte, Vorlagen und Teilen

Ihre Arbeit wird während des Tippens im Browser gespeichert. **Projekte** sind lokal gespeicherte Bücher, aufgeführt unter **Meine Bücher** im Bedienfeld **Bücher**, jedes mit Namen, Beschreibung und Titelbild; sie lassen sich duplizieren, exportieren und importieren. **Vorlagen** sind schreibgeschützte Bücher, mit denen Sie beginnen können, aufgeführt unter **Beispielbücher**: dieser Leitfaden und eine Galerie von Musterausgaben – ein Astronomiemagazin, ein illustrierter _Don Quijote_, ein Umweltmagazin, ein Ausstellungskatalog, zwei Hochschullehrbücher, _Der Traum der roten Kammer_ auf Chinesisch, _Tausendundeine Nacht_ auf Arabisch, rechts gebunden, und ein kommentiertes _Paradise Lost_ mit den Tafeln von Doré –, jede mit einer eigenen Gestaltung. **Eigene Kopie anlegen** macht daraus ein Projekt, das Ihnen gehört.

Vorlagen folgen ihrer Quelle. Ändert sich das Paket einer Vorlage auf dem Server, bemerkt die Sandbox es binnen Sekunden: Eine unberührte Vorlage wird von selbst neu geladen, und eine, die Sie bearbeitet haben, zeigt ein Banner, das das Neuladen anbietet, sodass laufende Arbeit nie überschrieben wird. Vorlagen lassen sich aus der Liste ausblenden und wieder einblenden, und jede lässt sich in jeder ihrer Sprachen öffnen, wenn sie mehr als eine hat, wie dieser Leitfaden, den es auf Englisch, Spanisch, Katalanisch, Französisch, Deutsch, Italienisch, brasilianischem Portugiesisch, vereinfachtem Chinesisch, Arabisch und Japanisch gibt.

:::callout{type="try"}
Blättern Sie zu einer Seite, die Ihnen gefällt, und kopieren Sie die Adresse aus dem Browser: Dieser Link öffnet dasselbe Buch im selben Betrachter auf derselben Seite.
:::

Ein Buch reist als eine einzige **.postext**-Datei: Kapitel, Konfiguration, Ressourcen und Schriften, dazu die bereits berechnete Paginierung, sodass es fertig umbrochen öffnet. Die Rezepte des Rezeptbuchs öffnen sich in der Sandbox auf dieselbe Weise, als Ihre eigenen Bücher; ein Rezept, das Sie schon einmal geöffnet haben, fragt, ob Ihre Kopie mit Ihren Änderungen geöffnet oder durch die veröffentlichte Fassung ersetzt werden soll, die inzwischen korrigiert worden sein kann. Und die Adressleiste enthält immer einen Permalink auf das, was Sie gerade ansehen – das Buch, die Sprache, den Betrachter, das Kapitel und die Seite.

## Die Sandbox einbetten

Die Sandbox ist selbst ein Paket, _postext-sandbox_, eine React-Komponente, die jede Webanwendung einbetten kann. Ihr Host bestimmt das anfängliche Markdown und die Konfiguration, die Sprache der Oberfläche und jede Beschriftung, die Quellen der angebotenen Vorlagen sowie den Theme-Umschalter, die Sprachauswahl und den Link zur Startseite, die sie zeigt. Die Sandbox, die Sie gerade benutzen, ist genau diese Komponente, eingebettet in die Website von Postext. Die Komponente stellt außerdem Werkzeuge für Agenten bereit: Ein Assistent im Browser kann ein Buch öffnen, den Text bearbeiten, die Konfiguration ändern und die Warnungen lesen.

# Ausgabe: Canvas, HTML, PDF und EPUB {#output lead="Ein Baum, vier Ausgaben. Der Canvas dient der Vorschau, das HTML liest man am Bildschirm, das PDF geht in Druck und das EPUB auf das Gerät des Lesers, und alle werden aus demselben Layout geschrieben." summary="Die Renderer, das barrierefreie PDF, EPUB-Bücher und die Bibliothek im Einsatz"}

Weil jeder Renderer denselben VDT liest, ist das Versprechen _what you see is what you get_ wörtlich zu nehmen: Zeilenumbrüche, Seitengrenzen und die Position jeder Abbildung stimmen in Canvas, HTML und PDF überein, und ein EPUB mit festem Layout bewahrt sie ebenfalls. Der Agenten-Skill, der bestehende Bücher nach Postext überträgt, prüft seine Arbeit mit diesen Ausgaben, wie :ref{id="skill-tutorial"} zeigt.

## Canvas

Der Canvas-Renderer zeichnet eine Seite auf ein HTML-Canvas, in jeder beliebigen Auflösung. In der Sandbox ist er die Live-Vorschau, mit Zoom, Anpassung an Breite oder Höhe, Einzel- oder Doppelseiten und Seiten, die erst gezeichnet werden, wenn sie ins Bild scrollen, sodass auch lange Bücher flüssig bleiben.

## HTML

Der HTML-Renderer liefert absolut positioniertes HTML mit satztechnischem CSS: jede Zeile dort, wo das Layout sie hingesetzt hat, in ihrer genauen Schrift, Größe und Grundlinie. Eine indizierte Variante teilt dem Host mit, welche Teile der Seite sich geändert haben, sodass ein Betrachter nur diese austauschen muss. In der Sandbox isoliert der Tab HTML die Ausgabe in einem Shadow DOM und ergänzt einen Lesemodus mit einer einzigen scrollenden Spalte oder so vielen Spalten, wie auf den Bildschirm passen, mit einem Regler für die Schriftgröße. Eine Reihe von Überschreibungen nur für den Bildschirm kann die Gestaltung für das Lesen am Bildschirm anpassen, ohne die Druckseiten anzutasten.

Der Renderer nimmt eine Funktion entgegen, die die Datei-ID einer Ressource in eine URL umwandelt, sodass Bilder von überall ausgeliefert werden können, und eine Hintergrundfarbe für die Seite. Seine Ausgabe ist reines Markup und CSS, ohne Skript.

## PDF

:index{term="PDF"}Das Paket _postext-pdf_ macht aus dem VDT ein echtes PDF, für ein einzelnes Dokument oder für ein ganzes Buch. Es misst nie erneut: Die Metriken des Canvas sind die maßgebliche Quelle, und das PDF transportiert sie nur, weshalb die Zeilen an genau denselben Stellen umbrechen. Zu den Seiten fügt es Lesezeichen aus den Überschriften und Teilen hinzu, Seitenbezeichnungen, die den gedruckten Zahlen entsprechen, anklickbare Verweise, SVG-Abbildungen als Vektoren und für den Druck die Wahl des Farbraums – RGB, CMYK oder Graustufen.

Die Schriften gelangen über einen **Font-Provider** ins PDF, eine Funktion, die die Bytes einer Familie in einer bestimmten Stärke und einem bestimmten Stil liefert. Die Bytes der Ressourcen werden auf dieselbe Weise übergeben, über die Datei-ID. Das Rendern meldet seinen Fortschritt, läuft auf Wunsch in einem eigenen Worker und nimmt ein ganzes Buch als Liste von Kapiteldokumenten entgegen, woraus ein einziges PDF mit durchgehenden Seitenbezeichnungen, Lesezeichen und Links entsteht.

## Standardmäßig barrierefrei

:index{term="PDF!barrierefrei (PDF/UA)"}Jedes PDF ist standardmäßig **getaggt**, nach dem Standard PDF/UA-1: ein Strukturbaum aus Überschriften, Absätzen, Listen, Tabellen und Abbildungen in Lesereihenfolge, Alternativtext für jede Abbildung, die Sprache des Dokuments und dekorative Elemente, die als Artefakte markiert sind, damit Screenreader sie überspringen.

Das Tagging folgt dem Layout, nicht dem Quelltext. Über Spalten und Seiten geteilte Absätze werden als ein Absatz getaggt, Listen halten ihre Einträge zusammen, Tabellen behalten ihre Kopfzellen, und Abbildungen tragen ihren Alternativtext – oder ihre Bildunterschrift oder ihre Bezeichnung, wenn kein Alternativtext geschrieben wurde. Verweise zwischen dem Text und den Abbildungen, die er erwähnt, sind echte Links.

## Farbe für den Druck

Farben werden in der Konfiguration als Hexadezimalwerte geschrieben, optional mit der Palette verknüpft, und genau das zeichnet das PDF standardmäßig. Ein PDF lässt sich auch auf CMYK für den Offsetdruck oder auf Graustufen für einfarbige Arbeiten festlegen, und ein für den Druck eingerichtetes Buch geht weiter: ein ICC-Profil, PDF/X, ein Schwarz, das mit einer einzigen Druckfarbe druckt, und ein Preflight jeder Seite. All das ist Thema von :ref{id="press"}.

## Ganze Bücher

Das PDF eines Buches ist keine Aneinanderreihung einzelner Dateien. Der Renderer erhält das Layout jedes Kapitels und schreibt ein einziges Dokument: Die Seitenbezeichnungen laufen über die Kapitel hinweg weiter, die Lesezeichen bilden einen Baum mit den Teilen über ihren Kapiteln, und die barrierefreie Struktur des ganzen Buches ist ein einziger Baum in Lesereihenfolge.

## Schriften im PDF

Postext bettet jeden Schnitt ein, den das Layout verwendet hat – eine statische Datei pro Stärke und Stil, sodass ein fettes Wort im echten fetten Schnitt und ein kursives im echten Kursiv steht, nie in einer schräg gestellten oder verdickten Nachahmung. TrueType-Schriften werden auf die Glyphen reduziert, die das Buch tatsächlich verwendet; OpenType-Schriften mit PostScript-Konturen werden vollständig eingebettet, weil manche Betrachter ihre Teilmengen nicht lesen können. Jede eingebettete Schrift trägt eine Zuordnung von den Glyphen zurück zu den Zeichen, Ligaturen eingeschlossen, sodass ein aus dem PDF kopierter Satz den Satz zurückgibt, der geschrieben wurde.

Eine Familie, die nur als WOFF vorliegt, akzeptiert das PDF nicht, weil sich das Format nicht zuverlässig einbetten lässt; WOFF2-, TrueType- und OpenType-Dateien funktionieren alle.

## EPUB 3

:index{term="EPUB"}Das Paket _postext-epub_ schreibt ein umbrochenes Buch als EPUB-3-Datei, das Format der E-Book-Shops, Bibliotheken und Lese-Apps. Es liest dieselben Kapiteldokumente wie das PDF eines ganzen Buches, sodass Seitenzahlen, Fußnoten, Zitate, Querverweise, Inhaltsverzeichnis und Register aufgelöst ankommen, und es liefert die Datei als Bytes, im Browser oder in Node, ohne Server. EPUB definiert zwei Darstellungsformen, nebeneinandergestellt in :ref{id="epub-renditions"}, und das Paket erzeugt jede der beiden aus demselben Layout.

Ein **festes Layout** bewahrt die gedruckte Seite. Jede Seite wird zu einem eigenen Dokument in Seitengröße, mit dem Text dort, wo das PDF ihn hinsetzt, und in den Schriften des Buches, sodass Spalten, Gleitobjekte, Kolumnentitel, Kapitelauftakte und jeder Zeilenumbruch erhalten bleiben. Der Text bleibt Text: Er lässt sich markieren, durchsuchen und vorlesen, und die Links des Buches funktionieren über die Seiten hinweg – Querverweise, Fußnoten, das gedruckte Inhaltsverzeichnis und das Register. Doppelseiten werden wie im Druck gepaart, und ein rechts gebundenes Buch, auf Arabisch oder in vertikalem Chinesisch, blättert von rechts nach links. Ein festes Layout eignet sich für Bücher, deren Seiten als Seiten gestaltet sind, etwa ein illustriertes Buch, ein Lehrbuch, einen Katalog oder ein Magazin, gelesen auf einem großen Bildschirm.

## Umfließende Bücher

Ein **umfließendes** Buch gibt die Seite auf und behält den Text. Jedes Kapitel wird zu einem Dokument, das das Lesesystem für seinen Bildschirm neu setzt, in der Schrift, der Größe und mit den Rändern, die der Leser wählt. Das Paket greift dabei nicht auf das Markdown zurück: Es baut jeden Absatz aus den Zeilen wieder auf, die die Engine gesetzt hat, entfernt die Trennstriche, die die Zeilenumbrüche hinzugefügt haben, und behält jene, die zum Wort gehören, sodass ein über zwei Spalten oder zwei Seiten geteilter Absatz wieder ein einziger Absatz ist. Abbildungen und Tabellen folgen dem Text, der sie zitiert, mit ihren nummerierten Beschriftungen und ihrem Alternativtext; Tabellen bleiben echte Tabellen, mit Kopfzeilen und verbundenen Zellen; Kästen werden zu Asides mit ihren Titeln; und Fußnoten verlinken auf das Ende des Kapitels und zurück. Jede gedruckte Seite hinterlässt eine Marke dort, wo ihr Text beginnt, sodass ein Leser Seite 112 der gedruckten Ausgabe finden kann, und das Register verweist auf diese Marken.

Das Aussehen kommt aus der Konfiguration. Ein daraus abgeleitetes Stylesheet gibt Überschriften, Kästen, Tabellen, Beschriftungen und Listen ihre Größen und Farben, relativ zum Grundtext, sodass die vom Leser gewählte Größe überall greift. In einem Absatzformat gesetzte Absätze behalten es, weil das Layout festhält, welches Format jeden Block gesetzt hat, und die Ebenen des Registers werden auf dieselbe Weise unterschieden; ein anders konfiguriertes Kapitel oder ein Teil, der das Buch umfärbt, fügt ein zweites Stylesheet hinzu, das nur die abweichenden Regeln enthält. Vertikales Chinesisch behält seine senkrechten Zeilen, und ein arabisches Buch läuft von rechts nach links.

Beide Darstellungsformen tragen dieselbe Navigation: ein Inhaltsverzeichnis aus den Überschriften und den Teilen, eine Liste der gedruckten Seitenzahlen und Landmarks für den Umschlag, das gedruckte Inhaltsverzeichnis und den Beginn des Textes. Jede Familie, die die Gestaltung nennt, wird eingebettet, sofern sie nicht als nicht weitergebbar markiert ist. Beide tragen die Metadaten von EPUB Accessibility 1.1, und beide bestehen W3C EPUBCheck, den Validator, den E-Book-Shops auf die eingehenden Dateien anwenden, ohne Fehler und ohne Warnungen, für diesen Leitfaden und für jedes Beispielbuch.

## Die Bibliothek im Einsatz

Die Engine erscheint auf npm als _postext_, für das Layout sowie die Canvas- und HTML-Renderer, mit einem eigenen Paket für jede schwerere Ausgabe: _postext-pdf_ für PDF, _postext-epub_ für EPUB 3 und _postext-folio_ für das Buch in 3D. Alle sind ES-Module unter der MIT-Lizenz und lassen sich auch direkt von einem CDN importieren. Die Dokumentation enthält Live-Beispiele, die eine Seite als Bild, als HTML und als PDF rendern, bereit zum Forken.

Die Layout-Engine läuft im Browser, wo sie mit den Schriften messen kann, die der Leser sieht; _postext-pdf_ und _postext-epub_ laufen ebenfalls im Browser und zusätzlich in Node, sodass ein PDF oder ein EPUB auf einem Server aus einem anderswo berechneten Layout erzeugt werden kann. Ein ganzes Buch geht denselben Weg: \`openBundle\` liest eine .postext-Datei, \`buildBundle\` bricht ihre Kapitel der Reihe nach um, und das Ergebnis geht direkt an \`renderToPdf\` oder \`renderToEpub\`. Die Pakete sind ausschließlich ES-Module, mit TypeScript-Typen, und manche Bundler brauchen eine einzeilige Einstellung für den WOFF2-Decoder, den das PDF-Paket verwendet.

:::callout{type="note" title="Vier Schritte"}
1. Die Schriften laden, die die Konfiguration nennt, damit der Browser sie messen kann
2. Das Dokument mit \`buildDocument(content, config)\` erzeugen
3. Seine Seiten mit \`renderPage\` zeichnen oder mit \`renderToHtml\` rendern
4. Für den Druck dasselbe Dokument mit einem Font-Provider an \`renderToPdf\` übergeben; für E-Books die Kapitel an \`renderToEpub\` übergeben
:::

## Seiten als Bilder, per Skript

Eine Seite braucht keinen Browser, um zum Bild zu werden. Der Canvas-Renderer zeichnet auf jedes Canvas, das die Zeichenschnittstelle des Browsers beherrscht, und in Node tut das ein vorkompiliertes Canvas: Buch umbrechen, Seite zeichnen und als JPEG oder PNG kodieren. So betrachtet der Agenten-Skill, der Bücher nach Postext überträgt, seine Arbeit. Nach jeder Änderung an Konfiguration oder Text bricht er das Buch neu um, zeichnet nur die Seiten, an denen er gerade arbeitet, und liest sie als Bilder, in ein, zwei Sekunden, ohne ein PDF zu erzeugen.

:ref{id="skill-tutorial"} zeigt den Skill von Anfang bis Ende: Er erhält das Referenz-PDF, die Schriften und die Originalillustrationen, schlägt ein Spezifikationsblatt vor, setzt das erste Kapitel und prüft jede Seite, die er setzt.

# Prüfen und in Druck geben {#press lead="Eine Druckerei stellt andere Fragen als ein Leser. Ist jedes Bild in seiner Druckgröße scharf genug, druckt das Schwarz des Textes mit einer einzigen Farbe, reicht die Grafik über den Beschnitt hinaus? Postext beantwortet sie, bevor die Datei den Browser verlässt." summary="Prüfungen, Kontrast, ICC-Farbe, PDF/X, Schwarz und Preflight"}

Ein Buch wird zweimal fertig. Für den Leser ist es fertig, wenn der Text stimmt und die Seiten aussehen, wie sie sollen; für die Druckerei, wenn die Datei den Regeln der Maschine gehorcht, die sie drucken wird. Postext führt beide Checklisten an derselben Stelle, sodass ein Problem zu sehen ist, solange noch Zeit bleibt, es im Markdown oder in der Konfiguration zu beheben.

## Das Bedienfeld Prüfungen

:index{term="Bedienfeld Prüfungen"}Alles, was der Engine auffällt, sammelt sich im Bedienfeld **Prüfungen**, geordnet in der Reihenfolge, in der ein Hersteller es abarbeiten würde: zuerst Schriften, dann Abbildungen und Tabellen, Text und Auszeichnung, Gestaltung, Kontrast, Satz, Preflight und der Browser. Jeder Eintrag nennt Kapitel und Zeile, und ein Klick springt dorthin. Welche Prüfungen laufen, ist eine Einstellung unter Gestaltung › Erweitert › Warnungen.

Manche Prüfungen betreffen den Text: eine lockere Zeile, eine übersprungene Überschriftenebene, eine unbekannte Direktive, ein Kasten, der für seine Spalte zu hoch ist. Andere betreffen die Gestaltung und stammen aus **Satzregeln**, beschrieben in :ref{id="columns"}, die eine Konfiguration auf _allow_, _warn_ oder _avoid_ setzt. Eine Regel auf _warn_ lässt die Seite in Ruhe und fügt einen Eintrag hinzu; auf _avoid_ ändert die Engine die Seite, und nichts wird gemeldet.

## Kontrast

:index{term="Kontrast"}Die Kontrastprüfung misst jedes Paar aus Text- und Hintergrundfarbe, das das Buch verwendet und meldet die Paare unter der verlangten Stufe: AA oder die strengere Stufe AAA der Richtlinien für Barrierefreiheit. Sie kann die Farben so beurteilen, wie ein Bildschirm sie zeigt, wie sie gedruckt werden, oder beides. Im Bedienfeld Gestaltung zeigt jedes Farbfeld seinen niedrigsten Kontrast neben dem Farbmuster.

Der Druck bringt ein Problem mit, das ein Bildschirm nie hat. Weißer Text, der aus einem dunklen Band ausgespart ist, wird als Fehlen von vier übereinanderliegenden Druckfarben gedruckt, und feine Striche laufen zu, wenn der Passer der Maschine um ein Haar danebenliegt. Die Prüfung markiert ausgesparten Text, der für den Druck zu klein oder zu dünn ist.

## Farbe, die eine Druckmaschine versteht

Die Farben einer Konfiguration sind für den Bildschirm geschrieben, und auf dem Weg in den Druck müssen sie in die vier Druckfarben der Druckbedingung umgerechnet werden. Diese Umrechnung beschreibt ein **ICC-Profil**:index{term="ICC-Profile"}, und Postext bringt fünfzehn davon mit, von FOGRA39 und FOGRA51 für gestrichenes Papier in Europa bis GRACoL und SWOP für Nordamerika, mit FOGRA39 als Voreinstellung.

Die Umrechnung erledigt Postext selbst, im Browser, mit einem Rendering Intent, relativ farbmetrisch oder perzeptiv, und mit Tiefenkompensierung. Auch Bilder lassen sich umrechnen, sodass ein Foto im PDF schon in den Druckfarben der Maschine steht, und eine **Farbauftragsgrenze** begrenzt die Gesamtdeckung der vier Farben dort, wo das Papier nicht trocknen würde. Die Druckeinstellungen verschieben nie eine Zeile: Das Layout ignoriert sie, und sie wirken nur im PDF, in der Druckvorschau und im Preflight.

## PDF/X

Druckereien verlangen **PDF/X**:index{term="PDF!PDF/X"}. Eine PDF/X-Datei sagt, für welche Druckbedingung sie erstellt wurde, bettet jede Schrift ein, trägt ihre Endformat- und Anschnittrahmen und lässt alles weg, was eine Druckmaschine nicht verwenden kann, etwa Links. Postext schreibt die beiden Fassungen, die Druckereien am häufigsten verlangen. PDF/X-1a ist die vorsichtige: nur vier Druckfarben und Grau, keine Transparenz. PDF/X-4 behält die Transparenz und ist heute die übliche Wahl. Beide werden unter Gestaltung › Export › Druckvorbereitung gewählt oder mit der Option \`--pdfx\` der Kommandozeile.

Ein Buch für den Druck braucht außerdem **Anschnitt**:index{term="Anschnitt"}: Bilder und Bänder, die über die Seite hinauslaufen, müssen einige Millimeter über das Endformat hinausreichen. Die Einstellungen der Schnittmarken fügen den Anschnitt hinzu und zeichnen Schnittmarken an den Ecken.

## Schwarz

Grundtext sollte allein in Schwarz drucken, weil Text aus vier Farben verschwimmt, sobald die Platten auseinanderlaufen. Grau- und Schwarztöne lassen sich auf die schwarze Druckfarbe allein beschränken, und volles Schwarz kann **überdrucken**, also auf das gedruckt werden, was darunter liegt. Große schwarze Flächen sind der umgekehrte Fall: Eine einzige Farbe wirkt dort ausgewaschen, deshalb unterlegt ein **Tiefschwarz**:index{term="Tiefschwarz"} sie mit den anderen drei Farben, ab einer Größe, die Text nie erreicht.

## Preflight

:index{term="Preflight"}Bevor eine Datei in Druck geht, lässt die Druckvorstufe einen **Preflight** laufen: eine maschinelle Prüfung jeder Seite gegen die Regeln des Auftrags. Postext führt einen eigenen aus, sobald ein Buch für den Druck eingerichtet ist, mit einem PDF/X-Standard, einem CMYK-PDF oder Schnittmarken, und listet die Befunde im Bedienfeld Prüfungen auf, die kritischen zuerst. Er meldet Bilder unter 300 Pixeln pro Zoll in ihrer Druckgröße, unter 150 als kritisch; Bilder, die noch in RGB vorliegen; Linien dünner als ein Viertelpunkt; kleinen Text aus mehreren Druckfarben; Farbauftrag über der Grenze; Text zu nah am Beschnitt.

Derselbe Preflight läuft auch außerhalb der Sandbox. Der Befehl \`check\` der Kommandozeile endet mit einem Fehlercode, wenn er ein kritisches Problem findet.

:::callout{type="try"}
Öffnen Sie Gestaltung › Export › Druckvorbereitung, wählen Sie PDF/X-4 und schalten Sie die Schnittmarken ein. Das Bedienfeld Prüfungen erhält eine Gruppe Preflight; die PDF-Ansicht zeichnet jetzt den Anschnitt und die Marken um jede Seite.
:::

## Ein Proof am Bildschirm

Die **Druckvorschau** zeigt:index{term="Druckvorschau"} die Seiten so, wie die Maschine sie drucken wird. Jede Farbe wird über das Profil des Auftrags separiert und auf dem Weiß des Papiers zurückgezeichnet, Tiefschwarz eingeschlossen. Sie ist ein Schalter in der Werkzeugleiste der Ansicht Canvas, geteilt mit der Ansicht Folio.

## Das barrierefreie PDF und das gedruckte

Das PDF für die Druckerei und das PDF für Leser können dieselbe Datei sein. Die getaggte Struktur, die ein PDF barrierefrei macht, beschrieben in :ref{id="output"}, steht ohne Konflikt neben den Regeln von PDF/X; nur die Links fallen weg, weil ein Druckstandard sie nicht zulässt.

# Das Buch in 3D {lead="Ein Layout ist eine Menge von Seiten, ein Buch aber ist ein Gegenstand: Papier von bestimmtem Gewicht und bestimmter Farbe, eine Bindung, die sich auf eine bestimmte Weise öffnet, eine Dicke, die die Hand spürt. Die Ansicht Folio zeigt die Seiten als diesen Gegenstand, bevor irgendetwas gedruckt ist." summary="Die Ansicht Folio, Papiersorten, Bindungen, Umschläge und das Licht"}

Korrekturabzüge am Bildschirm sind flach. Eine Doppelseite, als zwei Rechtecke betrachtet, sagt nichts darüber, wie sich das Buch aufgeschlagen auf einem Tisch anfühlen wird: ob der Bund den Bundsteg verschluckt, ob eine Tafel auf glänzendem Papier das Licht fängt, ob dreihundert Seiten cremefarbenes Papier einen Buchblock ergeben, der für die Bindung zu dick ist. Die Ansicht **Folio** beantwortet diese Fragen mit den Seiten, die Postext bereits gesetzt hat. Sie zeigt das Buch gebunden, aufgeschlagen auf einer Fläche liegend, beleuchtet, mit Blättern, die sich unter der Hand biegen und umschlagen.

Nichts darin ist ein zweites Layout. Die Seiten sind dieselben, die der Canvas malt, gezeichnet in den exakten Pixeln des Bildschirms, sodass der Text in Folio so scharf ist wie in der Ansicht Canvas und Zeile für Zeile derselbe. Was Folio hinzufügt, ist alles rund um die Seiten: das Papier, die Bindung, die Umschläge, der Tisch und das Licht. All das stammt aus einem Teil der Konfiguration, \`folio\`, den das Layout nie liest. Papier oder Bindung zu ändern zeichnet das Buch sofort neu und verschiebt nie eine Zeile.

## Umblättern

:index{term="Folio"}Eine Seite wird so umgeblättert, wie man eine Seite eben umblättert: am Rand fassen und hinüberziehen. Lässt man sie jenseits der Mitte los, landet sie auf der anderen Seite; lässt man sie davor los, fällt sie zurück. Auch ein Klick auf eine Seite blättert um, vorwärts auf der rechten Seite und zurück auf der linken, ebenso die Pfeile der Werkzeugleiste und die Pfeiltasten, Bild auf und Bild ab, Pos1 und Ende, wenn das Buch den Fokus hat. Das Seitenfeld der Werkzeugleiste nimmt eine Seitenzahl entgegen und blättert das Buch zu dieser Doppelseite.

Jedes Blatt biegt sich gemäß seinem Papier. Dünndruckpapier rollt sich in einer engen Kurve und lässt den Druck der Rückseite durchscheinen; Karton wendet sich in weitem Bogen; Pappe, wie bei einem Pappbilderbuch für kleine Kinder, dreht sich als starre Platte um ihr Scharnier. Auch die Umschlagdeckel wenden sich wie Pappe. Ein Sprung um mehr als zehn Seiten blättert sie nicht einzeln um: Der Block der dazwischenliegenden Seiten hebt sich als eine Platte, so dick wie diese Seiten, und wird auf der anderen Seite abgelegt.

Die Ansicht selbst lässt sich bewegen. Ziehen mit der rechten Maustaste kreist um das Buch, bis hinunter zu einem streifenden Blickwinkel, um den Rücken, den Vorderschnitt oder die Dicke des Blocks zu betrachten, und das geht auch, während sich noch Blätter wenden. Die Ansicht bleibt, wo man sie gelassen hat, bis **Ansicht zurücksetzen** sie auf den Winkel zurückbringt, den die Einstellungen vorgeben. In einem schmalen Fenster zeigt das Buch jeweils eine Seite und wendet sein Blatt dennoch über den Rücken; wenn das System reduzierte Bewegung verlangt, wechseln die Doppelseiten ohne Umblättern.

Vier Schaltflächen der Werkzeugleiste oder die Tasten H, O, S und M legen fest, was der Zeiger auf dem Buch tut: von Hand blättern, die Ansicht drehen, was ein Trackpad oder ein Tablet anstelle des Ziehens mit der rechten Maustaste braucht, Text auswählen oder eine Lupe halten. Die Auswahl funktioniert auf den Seiten so, wie sie zu sehen sind, geneigt oder gedreht, ganz wie in der Ansicht Canvas: Ein Klick setzt den Cursor im Editor auf dieses Wort, Ziehen markiert, ein Doppelklick erfasst ein Wort, und ein Link wird verfolgt. Es funktioniert auch umgekehrt: Cursor und Markierung des Editors werden auf die Seiten gezeichnet, und wandert der Cursor auf eine Seite, die gerade nicht zu sehen ist, blättert das Buch dorthin.

Die **Lupe** schwebt dort über dem Buch, wo der Zeiger steht, auf einem Touchscreen knapp über dem Finger: ein rundes Glas mit schwarzem Rand, das die Seite so zeigt, wie das Auge sie sieht, beleuchtet und gewölbt, wie sie daliegt, in der Mitte am stärksten vergrößert. Mausrad und die Tasten Plus und Minus ändern die Vergrößerung, von anderthalbfach bis zehnfach, und Esc legt die Lupe weg. Mit ihr lässt sich eine Fußnote oder die Mikroschrift einer Abbildung lesen, ohne die Ansicht zu verlassen.

Videos laufen auf der Seite. Im Blättermodus startet ein Klick auf das Vorschaubild eines Videos es an Ort und Stelle, und es läuft weiter, während sich das Blatt wendet. Ein weiterer Klick hält es an, das Starten eines anderen stoppt das erste, und ein Video stoppt, wenn das Buch auf einer Doppelseite zur Ruhe kommt, die es nicht mehr zeigt. Ein Video, das von selbst abspielen soll, startet, sobald seine Doppelseite zum ersten Mal gezeigt wird. YouTube- und Vimeo-Videos lassen sich nicht in eine Seite zeichnen: Ein Klick darauf blättert das Blatt um.

:::callout{type="try"}
Öffnen Sie den Tab Folio für diesen Leitfaden, blättern Sie ein paar Seiten um, indem Sie an ihren Ecken ziehen, und kreisen Sie dann durch Ziehen mit der rechten Maustaste um das Buch, um seinen gehefteten Falz zu sehen. Ansicht zurücksetzen bringt es zurück.
:::

## Papier

Das Papier wird so gewählt, wie eine Druckerei es bestellen würde: nach **Papiersorte**, der Art des Papiers, und nach **Grammatur**, seinem Gewicht in Gramm pro Quadratmeter. Jede Papiersorte bringt die für sie typischen Werte mit, aufgeführt in :ref{id="paper-stocks"}, und jeder davon lässt sich einzeln ändern: ein Werkdruckpapier mit 70 statt 80 Gramm, ein ungestrichenes Papier in einem wärmeren Ton.

Die Dicke ergibt sich aus zwei Zahlen. Das **Volumen** eines Papiers, in Kubikzentimetern pro Gramm, sagt, wie viel Raum ein Gramm davon einnimmt; Grammatur mal Volumen ergibt die **Dicke**, die Stärke eines Blattes in Mikrometern. Ein Buchblock ist die Zahl seiner Blätter mal diese Dicke, weshalb dieselben dreihundert Seiten auf gestrichenem Papier einen schlanken Band und auf voluminösem Werkdruckpapier einen dicken ergeben. Folio zählt das ganze Buch, sodass auch ein allein gezeigtes Kapitel zwischen den Seiten davor und danach liegt, in deren tatsächlicher Dicke.

Die Beschaffenheit des Papiers hat drei Einstellungen. Die **Oberfläche** sagt, ob das Papier ungestrichen ist, mit seinen Fasern und ohne Glanz, oder gestrichen und zu matt, seidenmatt oder glänzend kalandriert, was den Raum spiegelt. Die **Struktur** ist das Relief: glatt, die feine Körnung von leicht rauem Papier, das gleichmäßige Bild von Velin, die Linien von geripptem Papier, ein geprägtes Leinen oder die unregelmäßigen Spuren von Filz; ihre Stärke lässt sich verringern oder erhöhen. Der **Papierton** ist die Farbe des Papiers vor dem Druck, weiß, naturweiß oder cremefarben, und das **Durchscheinen** lässt den Druck der Rückseite auf dünnem Papier schwach sichtbar werden, immer weniger, je schwerer und opaker das Papier wird. Eine Zeitung braucht nichts davon: Ein Buch im Zeitungsformat, Nordisch, Berliner oder Tabloid, liegt als gefaltetes Zeitungspapier auf dem Tisch, sofern seine Einstellungen keine andere Papiersorte und Bindung wählen.

## Bindungen und Umschläge

Fünf Bindungen stehen zur Wahl. Ein **Hardcover** ist ein Deckenband, mit Deckeln, die etwas größer sind als die Seiten. Ein **Paperback** ist klebegebunden, sein Rücken gefräst und geleimt, und öffnet sich weniger flach. Eine **fadengeheftete Broschur** hält ihre Lagen unter einem weichen Umschlag vernäht und öffnet sich leichter. Eine **Lay-flat-Bindung** öffnet sich vollständig, ohne dass die Seiten zum Rücken hin absinken. Eine Broschüre mit **Rückendrahtheftung** besteht aus gefalzten Bogen, die durch den Falz geheftet sind, wie ein Magazin oder ein Programmheft, und hat keinen flachen Rücken. Ein dickes Buch öffnet sich, wie ein dickes Buch sich öffnet, mit seinem Rücken aufrecht zwischen den beiden Seitenblöcken. Ein rechts gebundenes Buch, ein arabisches oder ein vertikal gesetztes chinesisches oder japanisches, liegt gespiegelt, mit dem Rücken rechts, und seine Blätter und die Pfeiltasten wenden in die andere Richtung.

Die Umschläge kommen aus einer von zwei Quellen. Standardmäßig zeichnet Folio eine **Buchdecke** um die Seiten, aus Leinen, Karton oder Leder und in der Umschlagfarbe. Wenn das Dokument seine Umschläge bereits mitbringt, wie dieser Leitfaden, können es **die Seiten des Dokuments** sein: Die erste Seite wird zum vorderen Umschlag und die letzte, wenn sie auf eine linke Seite fällt, zum hinteren. Das Buch liegt dann geschlossen auf seinem Umschlag, bis der Leser es öffnet, der Umschlag wendet sich als steifer Deckel, und das Umblättern des letzten Blattes schließt das Buch wieder.

Der Rücken kann ein Bild tragen. Jedes Bild und jedes SVG aus dem Bedienfeld Ressourcen lässt sich darauf drucken, so ausgerichtet, wie man einen Buchrücken im Regal sieht, Kopf oben, mit dem vorderen Umschlag rechts; es wird so skaliert, dass es den Rücken bedeckt, und sollte deshalb an seinen Rändern etwas Luft lassen. Eine rückendrahtgeheftete Broschüre hat keinen Rücken, den man bedrucken könnte. Das Bild reist mit den Ressourcen des Buches in seiner .postext-Datei und erscheint, sobald die Ansicht zum Rücken gedreht wird.

## Tafeln auf anderem Papier

Bücher wechseln oft für einige Seiten das Papier: ein Teil mit Farbtafeln auf gestrichenem Papier in einem Roman auf Werkdruckpapier, ein Zwischenblatt aus Karton, ein paar Blätter getöntes Papier. In Postext ist das ein Container im Text:

:::callout{type="note" title="Ein Tafelteil"}
\`:::paper{type=coatedGloss grammage=130}\` öffnet den Abschnitt und \`:::\` schließt ihn. Alles dazwischen wird auf diesem Papier gedruckt.
:::

Eine Papiersorte umfasst ganze Bogen, deshalb beginnt der Inhalt des Abschnitts auf einer neuen Seite, und was ihm folgt, beginnt ebenfalls auf einer neuen Seite. Jede Seite, die aus dem Abschnitt heraus gesetzt wird, trägt ihr Papier im Layout, und die Ansicht Folio zeichnet diese Blätter mit Farbe, Oberfläche, Dicke und Steifigkeit dieses Papiers; Canvas, HTML und PDF setzen sie wie jede andere Seite. Weggelassene Attribute folgen dem Papier des Buches, und ein Abschnitt innerhalb eines anderen überschreibt nur, was er selbst festlegt.

## Tisch und Licht

Das Buch liegt auf einer **Unterlage**: Eiche, Nussbaum, Leinen, Filz, Leder, Marmor, eine einfache Farbe oder gar nichts, sodass der Hintergrund der Seite bleibt. Jede Unterlage ist eine fotografierte Textur, und eine Tönung färbt jede davon um. Fünf **Lichtstimmungen** bestimmen die Szene: ein Studio, Tageslicht, eine Leselampe, ein bedeckter Himmel und Nacht. Jede ist ein Paar: die Umgebung, die gestrichenes und glänzendes Papier spiegeln, während sich ein Blatt wendet, und ein Hauptlicht, das die Schatten des Blocks und einer angehobenen Seite auf die Seiten darunter wirft. Die **Belichtung** hellt die Szene auf oder dunkelt sie ab, und die Schatten lassen sich auf einem langsamen Rechner abschalten. Die **Neigung** legt fest, wie weit sich die Ansicht aus der Draufsicht neigt, bis zu siebzig Grad, und die **Drehung**, wie weit sie um das Buch herumgeht; Als Standardansicht speichern hält beides so fest, wie Sie es sehen.

Dieser Leitfaden ist als rückendrahtgeheftete Broschüre gesetzt, auf glänzend gestrichenem Papier von 170 Gramm, auf einer blauen Filzmatte im Studiolicht. Seine Umschläge sind seine eigene erste und letzte Seite, deshalb öffnet er sich auf dem Umschlag und schließt sich, wenn das letzte Blatt umgeblättert wird. All das steht in der Gruppe **Folio** des Bedienfelds Gestaltung, und nichts in dieser Gruppe ändert auch nur eine Zeile der Seiten.

## Wo Folio läuft

Folio zeichnet mit WebGL2, der dreidimensionalen Grafik des Browsers, mit einer Textur für jede Seite jedes gemalten Blattes. Da nur die Doppelseiten rund um die aufgeschlagene gemalt werden, bleibt der Speicherbedarf eines langen Buches auf dem weniger Seiten, doch ein Smartphone gibt einem Browser-Tab trotzdem weniger Speicher, als ein Buch braucht; deshalb bietet die Sandbox den Tab Folio auf Computern und Tablets an und lässt ihn auf Smartphones weg, ebenso in Browsern ohne WebGL2.

:::callout{type="note" title="Im Code"}
Der Betrachter ist ein eigenes Paket, _postext-folio_, aufgebaut auf three.js. \`createFolioFromDocument(container, doc)\` zeigt ein umbrochenes Dokument als Buch; \`setDocument\` zeigt das nächste Layout auf derselben Seite, \`setAppearance\` ändert Papier, Bindung oder Licht, und \`resetView\` bringt die Ansicht zurück. \`createFolio\` tut dasselbe mit beliebigen Seitenbildern.
:::

Dasselbe Paket blättert die Seiten der Rezepte im Rezeptbuch um, und es kann in jeder Webseite sitzen, die ein Buch als Buch zeigen will: im Katalog eines Verlags, in einem Korrekturabzug für einen Autor, in einer Vorschau, bevor der Auftrag an die Druckerei geht. Der Leuchttisch des Rezeptbuchs blättert die Seiten eines Rezepts mit demselben Paket um, flach, ohne die dritte Dimension. Eine Seite, die so ein Buch zeigt, braucht dafür nur die gerenderten Seiten.

# Werkzeuge rund um die Engine {#tools lead="Die Sandbox ist ein Weg zu Postext. Eine Kommandozeile setzt Bücher im Terminal, ein Dateiformat trägt sie als Ganzes, Word-Dokumente kommen herein und gehen hinaus, und Agenten können die Sandbox bedienen oder ein Buch aus seinem PDF übertragen." summary="Die Kommandozeile, die .postext-Datei, Word, WebMCP und der Skill zum Übertragen"}

Die Engine im Zentrum dieses Buches ist eine Bibliothek, und eine Bibliothek lässt sich von überall aufrufen. Die Sandbox ist der sichtbarste Ort, an dem sie läuft, doch ein Verlag mit einem ganzen Programm, ein Entwickler mit einer Build-Pipeline oder ein Assistent, der ein Manuskript setzen soll, braucht jeweils eine andere Tür.

## Die Kommandozeile

:index{term="Kommandozeile"}**postext** ist ein Programm für das Terminal, das ein Buch ohne Browser in ein PDF, ein EPUB, HTML, Seitenbilder oder ein Word-Dokument verwandelt. Es kommt als eine Datei pro System, für macOS, Linux und Windows, heruntergeladen von den Releases des Projekts, oder über npm als _postext-cli_. Alles, was es braucht, reist darin mit: die Engine, eine Zeichenbibliothek, ein Text-Shaper, die ICC-Profile des Druckkapitels und zwei Schriftfamilien. Andere Schriften werden einmal von Google Fonts oder aus einem Ordner, den Sie angeben, geholt und in einem Cache gehalten; die auf dem Rechner installierten Schriften werden nie verwendet, sodass ein Buch auf jedem Rechner gleich ausfällt.

Das Programm liest eine \`.postext\`-Datei, einen Ordner mit einem Buch oder lose Markdown-Dateien, die in der Reihenfolge ihrer Namen als Kapitel genommen werden. Jede Ausgabe hat ihren Befehl: \`pdf\`, \`epub\`, \`html\`, \`image\` und \`images\`, \`docx\`. Die Optionen decken ab, was die Sandbox in ihren Bedienfeldern anbietet: einen PDF/X-Standard und ein Profil, ein festes oder umfließendes EPUB, eine einzelne Seite oder einen Seitenbereich in der Zählung, die das Buch druckt. \`--set\` ändert jede Einstellung für einen Lauf, \`--locale\` wählt eine Ausgabe und \`--chapters\` einen Teil des Buches.

:::callout{type="note" title="Vom Manuskript zum PDF"}
1. \`postext pdf book.postext\` schreibt das ganze Buch als PDF
2. \`postext images book.postext --pages 12-15 --dpi 200\` zeichnet vier Seiten als Bilder
3. \`postext check book.postext --strict\` scheitert bei jeder Warnung
4. \`postext build book/ --watch\` setzt das Buch neu, sobald ein Kapitel gespeichert wird
:::

Zwei Befehle dienen der Automatisierung. \`check\` setzt das Buch und meldet, was das Bedienfeld Prüfungen melden würde, mit dem Preflight, wenn das Buch für den Druck eingerichtet ist, und endet mit einem Fehlercode. \`build --watch\` hält ein Buch offen und setzt es neu, wenn sich eine Datei ändert. Auf einem gewöhnlichen Laptop wird ein illustrierter Roman von 140 Seiten in etwa zehn Sekunden gesetzt und als PDF geschrieben.

## Ein Buch in einer Datei

:index{term="Dateiformat (.postext)"}Eine **.postext**-Datei ist ein reisefertig gepacktes Buch: ein ZIP-Archiv mit den Kapiteln als Markdown, der Konfiguration, den Ressourcen, den Schriften und einem Manifest, das sie zusammenhält. Sie kann auch die bereits berechnete Paginierung mitbringen, sodass ein Buch umbrochen öffnet und die erste Seite erscheint, bevor die Engine eine Zeile gesetzt hat. Die Sandbox lädt ein Buch in diesem Format im Bedienfeld Bücher herunter und öffnet eines an derselben Stelle; die Kommandozeile liest und schreibt es.

Eine Datei kann mehrere Sprachen enthalten, jede mit ihren Kapiteln, ihren Ressourcen und ihren Einstellungen, wie :ref{id="languages"} beschreibt. Programme lesen und schreiben das Format über eine kleine Schnittstelle der Engine, \`openBundle\`, \`createBundle\` und \`buildBundle\`, wobei Letzteres jedes Kapitel eines Pakets als ein Buch setzt, mit fortgeführten Zählern und Seitenzahlen. Eine Datei, die eine Version von Postext erzeugt hat, öffnet sich in der nächsten: Das Manifest hält die Version der Einstellungen fest, mit der sie geschrieben wurde, und ältere Dateien werden so gelesen, wie sie gemeint waren.

## Word-Dokumente

:index{term="Word-Dokumente"}Die meisten Manuskripte kommen als Word-Dateien. Das Bedienfeld Text importiert eine .docx im Browser und öffnet einen Dialog, bevor sich etwas ändert. Zuerst beurteilt es das Dokument: _gut formatiert_, wenn der Autor Absatzformate verwendet hat, _teilweise formatiert_ oder _ohne Formate_, wenn jede Überschrift von Hand fett gesetzt wurde. Dann zeigt es, wie jedes Word-Format gelesen wird, als Überschriftenebene, Absatzformat, Liste, Zitat oder einfacher Text, und lässt Sie jedes davon ändern; die Auswahl lässt sich als Vorlage speichern und wiederverwenden.

Bilder und Tabellen werden zu Ressourcen, Fußnoten zu Fußnoten, die Indexfelder von Word zu Registermarkierungen und seine Formeln zu Mathematik. Der Import kann das aktuelle Kapitel ersetzen, neue Kapitel danach hinzufügen oder das ganze Buch ersetzen, geteilt an seinen Überschriften der ersten Ebene.

Der Weg führt auch in die andere Richtung. **Nach Word exportieren** schreibt ein Kapitel oder das ganze Buch als .docx. Was Word nicht zeigen kann, eine Direktive oder ein Ressourcenverweis, bleibt in grauen Absätzen eines Formats namens _Postext Markup_ erhalten, und die Vorlage reist in der Datei mit, sodass das korrigierte Dokument ohne Verluste nach Postext zurückkehrt.

## Agenten in der Sandbox

Ein Assistent, der einen Browser bedienen kann, kann auch die Sandbox bedienen, über **WebMCP**:index{term="WebMCP"}, einen vorgeschlagenen Webstandard für Seiten, die Agenten Werkzeuge anbieten. Solange die Sandbox geöffnet ist, bietet sie mehr als fünfzig an: den Zustand des Buches lesen, ein Kapitel bearbeiten, eine Einstellung ändern, eine Seite als Bild rendern, ein PDF exportieren, rückgängig machen. Ein Agent, der ein Kapitel straffen soll, kann den Text bearbeiten, die entstandene Seite ansehen und es erneut versuchen, so wie ein Mensch es täte, und jede Änderung, die er vornimmt, steht auf dem Bildschirm und im Rückgängig-Verlauf.

Werkzeuge, die Arbeit zerstören sind als folgenreich markiert, sodass der Browser die Person fragt, bevor er sie ausführt.

## Ein Buch mit einem Agenten übertragen

Ein bestehendes Buch nach Postext zu bringen, ist vor allem eine Frage des Lesens seiner Gestaltung. Der Skill **postext-port**:index{term="postext-port (Skill)"} bringt einem Agenten bei, das aus dem zu tun, was der Verlag hat: einem PDF, einer Word- oder InDesign-Datei, einem EPUB, LaTeX, HTML oder gescannten Seiten. Er inventarisiert die Quelle, misst die Seiten, schlägt ein Spezifikationsblatt vor, schreibt die Konfiguration und die Kapitel und prüft dann seine eigene Arbeit: Er zeichnet jede gesetzte Seite als Bild und vergleicht sie Seite für Seite mit dem Original, bis sie übereinstimmen.

Der Skill wird in jedem Agenten, der Skills liest, mit einem Befehl installiert und in Claude Code als Plugin. Er kennt die Schriftsysteme dieses Buches, vertikalen Satz und Satz von rechts, neu geletterte Comics und Lehrbücher aus zusammengesetzten Seiten.

# Roadmap und Community {lead="Postext ist jung und offen. Die zentrale Pipeline, das Dokumentformat und das Konfigurationssystem sind ausgeliefert; was als Nächstes kommt, wird öffentlich entschieden." summary="Wo das Projekt steht und wie Sie mitmachen können"}

Postext will keine universelle Dokumentplattform sein. Es will eine sehr gute Layout-Engine für den redaktionellen Satz im Web sein, und es hält seinen Umfang bewusst eng, damit der Kern scharf bleibt. Sein langfristiges Ziel ist, die Standard-Layout-Engine für redaktionelle Inhalte im Web zu werden: etwas, das Verlage, Magazine, Buchplattformen und Entwicklungsteams übernehmen und weiterentwickeln können.

## Wo das Projekt steht

Die Arbeit ist in vier Phasen gegliedert, zusammengefasst in :ref{id="development-phases"}. Sie sind keine strengen Meilensteine; sie beschreiben die Reihenfolge, in der Fähigkeiten stabil genug für den Produktiveinsatz werden.

Die ersten beiden Phasen sind im Wesentlichen abgeschlossen: das Datenmodell, der Parser und die Messschicht, das Dokumentformat, die Spalten-Engine mit Spaltenausgleich, Gleitobjekten und Tabellen sowie die Buchmechanik aus Kapiteln, Teilen, Inhaltsverzeichnis und Kolumnentiteln. Die dritte Phase hat ihren Kern geliefert – optimalen Zeilenumbruch mit satztechnischen Strafwerten, Silbentrennung in acht Sprachen, Mathematik, Fußnoten und Kapitelendnoten, Zitate, ein Register, Chinesisch und Japanisch horizontal und vertikal gesetzt, Arabisch von rechts nach links mit Kaschida-Ausgleich, zusammengesetzte Seiten, Comics, Musik, Übungen und Text, der Bilder umfließt – und hat noch die Marginalien offen. Die vierte, die Ausgabe, hat Canvas, HTML, ein getaggtes, druckfertiges PDF, EPUB-3-Bücher und SCORM-Kurse ausgeliefert, zusammen mit dem Worker, der Sandbox und ihren Vorlagen, der Ansicht Folio, die ein Layout als gedrucktes Buch zeigt, und einer Kommandozeile, die Bücher ohne Browser setzt.

Was noch fehlt, ist so wichtig wie das, was ausgeliefert ist. **Marginalien** haben einen Platz im Datenmodell, werden aber noch nicht gesetzt. Text läuft noch nicht zu beiden Seiten eines Bildes, Koreanisch wird nach den chinesischen Regeln statt nach eigenen gesetzt, und die Kommandozeile formt Text ohne die Sprachformen, die ein Browser anwendet, sodass eine Zeile hin und wieder an einem anderen Wort umbricht als in der Sandbox. Das sind die nächsten Probleme, deren Lösung sich lohnt, und die, bei denen Hilfe am meisten zählt.

## Mitmachen

Das Projekt lebt auf GitHub, und jedes Gespräch findet öffentlich statt: **Issues** für Fehler, Wünsche und konkrete Aufgaben; **Pull-Requests** für Code, öffentlich begutachtet; **Discussions** für Ideen, Gestaltungsfragen und alles, was noch nicht konkret genug für ein Issue ist. Issues mit dem Label _good first issue_ sind der einfachste Einstieg.

Der übliche Weg von der Idee zum Code ist kurz: Ein Issue beschreibt das Problem, eine Diskussion klärt den Ansatz, wenn es mehr als einen gibt, ein Pull-Request setzt ihn um, und die Änderung wird in den Entwicklungszweig gemergt und von dort veröffentlicht. Vor einem großen Pull-Request ein Issue zu eröffnen spart allen Zeit, weil sich der Ansatz abstimmen lässt, bevor der Code geschrieben ist. Ein Issue ist auch der richtige Ort für einen Fehler im Satz: Ein Bildschirmfoto der Seite und der Markdown, der sie erzeugt, genügen meist, um ihn nachzustellen.

## Wo Hilfe zählt

Jeder Teil des Projekts freut sich über Mitwirkende. Die **Engine** hat tiefe Probleme – Zeilenumbruch, Spaltenausgleich, Nummerierung, Platzierung von Gleitobjekten – und zugängliche in ihren Tests und Benchmarks. Das **PDF-Backend** hat Schrifteinbettung, Farbmanagement und Barrierefreiheit. Die **Sandbox** hat ihre Bedienfelder, ihre Editoren und ihre Übersetzungen, so organisiert, dass jeder Text der Oberfläche in jeder Sprache auf dieselbe Weise hinzugefügt wird. **Gestaltung und Typografie** brauchen Menschen, die redaktionelle Traditionen kennen, besonders die von Schriftsystemen, denen die Engine noch nicht gut gerecht wird. Und die **Dokumentation** und ihre Übersetzungen, derzeit auf Englisch, Spanisch, Katalanisch, Französisch, Deutsch, Italienisch, brasilianischem Portugiesisch, vereinfachtem Chinesisch, Japanisch und Arabisch, stehen allen offen, die etwas klar erklären können.

Der beste erste Schritt ist klein: Lesen Sie die Anleitung für Beiträge im Repository, stellen Sie sich in den Discussions vor, nehmen Sie sich ein Issue mit dem Label _good first issue_ vor oder übersetzen Sie eine Seite der Dokumentation.

Die meisten Beiträge erfordern kein Programmieren:

- **Fehler melden**, mit einem minimalen Beispiel für Dokument und Konfiguration
- **Eigene Layouts teilen** und daraus Vorlagen machen, mit denen andere beginnen können
- **Die Dokumentation verbessern**, mit Tutorials, Beispielen und Erklärungen
- **Oberfläche und Dokumentation übersetzen**, in neue Sprachen
- **Typografisches Fachwissen einbringen**, besonders für Schriftsysteme und Traditionen, die noch nicht gut abgedeckt sind
- **Code beitragen**, zur Engine, zu den Renderern oder zur Sandbox

## Was draußen bleibt

Manches wird Postext bewusst nicht werden, und das auszusprechen gehört dazu, das Projekt ehrlich zu halten. Es wird keine Textverarbeitung: Es ist nicht geplant, die Seite direkt zu bearbeiten, denn die Seite ist das Ergebnis der Regeln, nicht ihre Eingabe. Es wird keine responsiven Breakpoints für seinen Host verwalten, denn diese Entscheidung gehört der Anwendung. Es wird keine Schriften selbst laden, denn das Laden von Schriften ist Sache der Seite, die es einbettet. Und es wird nicht zu einer allgemeinen Dokumentplattform mit Speicherung, Zusammenarbeit und Publikations-Workflows heranwachsen, wenn andere Werkzeuge das gut können und Postext sich in sie einbetten lässt.

Anderes ist schlicht noch nicht erledigt. Zusammenarbeit in Echtzeit, also eine Live-Sitzung per Link zu teilen, steht auf der Ideenliste der Sandbox, und Marginalien sind ebenso eine Frage der Gestaltung wie der Technik. Beides wird öffentlich diskutiert, bevor Code geschrieben wird.

## Lizenz

:index{term="Lizenz"}Postext erscheint unter der **MIT-Lizenz**: Die Engine, die PDF- und EPUB-Writer, der Folio-Betrachter und die Sandbox dürfen in offenen wie geschlossenen Projekten verwendet, verändert und eingebettet werden, kommerziell oder nicht, sofern der Lizenzhinweis mit dem Code mitreist. Die Schriften dieses Buches sind offene Schriften, die Google Fonts bereitstellt, die Diagramme sind Teil des Quellcodes der Sandbox, und der Text dieses Leitfadens gehört dem Projekt und seinen Mitwirkenden.

## Werte

Drei Werte leiten das Projekt, und sie sind zum Gebrauch gedacht, nicht zum Einrahmen: Wenn zwei gute Ideen in verschiedene Richtungen ziehen, wird mit ihnen die Wahl getroffen.

_Sorgfältige Gestaltung vor Tempo._ Die Typografie hat in Jahrhunderten Wissen angesammelt, und die Engine sollte es würdigen, statt es schlecht neu zu erfinden. Eine Funktion kommt hinzu, wenn sie auf einer echten Seite das Richtige tut, nicht wenn sie bloß in einer Demo funktioniert; eine aus dem Druck übernommene Regel wird in den Büchern studiert, die sie anwenden, bevor sie zu einer Option wird. Manche Funktionen dauern so länger. Die ausgelieferten müssen nicht zurückgenommen werden.

_Klarheit vor Raffinesse._ Code, Konfiguration und Dokumentation sollen leicht zu lesen, zu ändern und zu erklären sein. Eine Option, die einen Absatz voller Einschränkungen braucht, ist ein Zeichen, dass der Entwurf noch nicht fertig ist; eine Funktion, der nur ihr Autor folgen kann, übersteht dessen Urlaub nicht. Die Konfiguration behält echte Einheiten und schlichte Namen, das Dokumentformat bleibt in jedem Editor lesbar, und die Entscheidungen der Engine lassen sich immer auf eine Regel zurückführen, auf die jemand zeigen kann.

_Zusammenarbeit vor Revierdenken._ Entscheidungen fallen öffentlich, in Issues und Discussions, die alle lesen und an denen alle teilnehmen können, und kein Teil des Codes gehört einer einzelnen Person. Jeder Beitrag wird anerkannt – Code, Dokumentation, Übersetzungen, Fehlerberichte, typografischer Rat und die Beispielbücher, die zeigen, was die Engine kann –, denn eine Layout-Engine für alle können nur viele Menschen bauen.

Wenn Sie davon etwas anspricht, ist das Repository der nächste Schritt. Eröffnen Sie ein Issue, stellen Sie in den Discussions eine Frage oder ändern Sie etwas in diesem Buch und sehen Sie, was die Engine daraus macht.

:::paragraphs{style="signature"}
postext.dev · github.com/drnachio/postext
:::

::::page{template="sheet"}
## Postext auf einer Seite

Postext setzt Bücher aus zwei Eingaben: Markdown, das sagt, was der Text ist, und einer Konfiguration, die sagt, wie er aussieht. Ändert sich eines davon, werden die Seiten neu gesetzt, im Browser, in Sekundenbruchteilen.

:::frame{slot="card" label="Schreiben"}
Einfaches Markdown und ein paar Direktiven: \`:::callout\` für einen Kasten, \`:ref\` für eine Abbildung, \`[^id]\` für eine Fußnote, \`::::page\` für eine Seite wie diese. Der Text sagt nie, wohin etwas kommt.
:::

:::frame{slot="card" label="Gestalten"}
Über fünfhundert Einstellungen im Bedienfeld Gestaltung: Seite und Spalten, Schrift, Kästen, Auftakte, Kolumnentitel und eine Palette, die jeder Teil umfärben kann.
:::

:::frame{slot="card" label="Setzen"}
Absätze als Ganzes umbrochen, Spalten auf gleicher Höhe, Abbildungen an der ersten freien Stelle nach ihrer Erwähnung, ein Buch neu gesetzt, bis die Seitenzahlen stehen.
:::

:::frame{slot="card" label="Prüfen"}
Das Bedienfeld Prüfungen listet, was der Engine auffiel: eine lockere Zeile, eine fehlende Schrift, eine zu blasse Farbe, ein Bild zu grob für den Druck. Ein Klick springt zur Zeile.
:::

:::frame{slot="card" label="Ausgeben"}
Ein Layout, fünf Ausgaben: der Canvas, HTML für den Bildschirm, ein PDF für Druckerei oder Bibliothek, EPUB für E-Reader und ein SCORM-Paket für einen Kurs.
:::

:::frame{slot="card" label="Teilen"}
Ein Buch reist als eine .postext-Datei mit Kapiteln, Gestaltung, Bildern und Schriften. Die Kommandozeile setzt es auf einem Server, die Sandbox öffnet es in jedem Browser.
:::

:::frame{slot="key" label="Tasten"}
Dieses Blatt ist eine zusammengesetzte Seite: eine Vorlage mit Titel, Fließrahmen, einem Raster aus Karten und einem Kasten am Fuß, gefüllt aus dem Markdown des letzten Kapitels. Im Editor macht :chip[⌘ Z] rückgängig und :chip[⌘ F] sucht; :chip[Esc] schließt einen Dialog.
:::
::::

# Register {style="index" summary="Jeder Begriff, den dieser Leitfaden markiert, mit seinen Seiten"}

:::index

# Umschlagrückseite {style="back" toc="false" book="Postext" blurb="Postext setzt Markdown im Browser als Bücher, Magazine und Lehrbücher: jeder Absatz als Ganzes umbrochen, Spalten, die auf gleicher Höhe enden, Abbildungen nach den Worten platziert, die sie aufrufen, ein druckfertiges PDF und ein EPUB für E-Reader. Jede Seite dieses Leitfadens hat Postext selbst gesetzt." licence="Open Source · MIT-Lizenz"}
`;
