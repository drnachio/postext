export const DEFAULT_MARKDOWN_IT = `---
title: "Postext"
subtitle: "Un compositore programmabile per il web"
author: "Ignacio Ferro"
publishDate: "2026-10-04"
---

# Postext {style="cover" toc="false" kicker="Motore di impaginazione open source · La guida" publisher="postext.dev · Licenza MIT · Ogni pagina di questo libro è stata composta da Postext nel tuo browser"}

:::pagebreak

:::paragraphs{style="colophon"}
**La guida di Postext** è il libro di esempio che accompagna la Sandbox. È insieme una visita al motore e una sua dimostrazione: la copertina, l’indice che si numera da sé, le pagine di parte, le aperture di capitolo, le testatine, ogni figura e ogni tabella flottante sono impaginate da Postext, nel tuo browser, a partire dal Markdown che puoi aprire nell’editor.

Composto in Fraunces, Lora, Bricolage Grotesque, Geist e Geist Mono, forniti da Google Fonts. I diagrammi sono semplici file SVG, disegnati come vettori nel canvas, nella vista HTML e nel PDF. Cambia qualsiasi cosa (una parola, un margine, un colore della palette) e il libro si ricompone.

Postext è open source, con licenza MIT. Testo © 2026 Ignacio Ferro e i contributori di Postext.
:::

# Indice {style="contents" toc="false"}

:::toc

:::part{number="I" title="Fondamenti" palette="band=#2b4acb"}
1. Perché Postext
2. Come funziona il motore
:::

# Perché Postext {lead="La tipografia a stampa ha impiegato cinque secoli a imparare come si compone una pagina; i browser hanno imparato a disporre un’interfaccia. Postext porta la prima nei secondi: un motore di impaginazione che trasforma il Markdown in pagine composte secondo le regole dell’editoria." summary="La distanza tra il web e la pagina, e che cosa la colma"}

Postext è un **motore di impaginazione open source** che porta sul web il mestiere della tipografia professionale a stampa. Riceve **contenuto semantico**, scritto in Markdown arricchito, e un oggetto di configurazione, e calcola un’impaginazione completamente risolta in cui ogni riga, ogni titolo, ogni figura e ogni tabella ha una posizione precisa, misurata in vere unità tipografiche. Quell’impaginazione viene poi disegnata da tre renderer (un’anteprima dal vivo su canvas, HTML posizionato e un PDF pronto per la stampa) che leggono tutti la stessa geometria, così ciò che vedi sullo schermo è esattamente ciò che va in stampa; dalle stesse pagine si scrive anche un e-book EPUB 3.

Questo libro è la dimostrazione di sé stesso. La copertina, l’indice che si numera da solo, le pagine di parte in tre colori, la fascia che apre ogni capitolo, le testatine in cima a queste pagine e ogni figura che va da sola al suo posto sono stati impaginati da Postext, nel tuo browser, un momento fa. Niente qui è stato collocato a mano: il Markdown dice soltanto che cosa sono le cose, e la configurazione decide che aspetto hanno.

:::callout{type="try"}
Apri il pannello **Testo** e scegli questo capitolo nel selettore dei capitoli, in cima al pannello. Cambia una parola di questo paragrafo, o cancella una frase: la pagina si ricompone, le colonne si ribilanciano e i numeri di pagina dei capitoli successivi si adeguano.
:::

Se preferisci prima guardare, il :ref{id="postext-showreel"} racconta tutto in due minuti; nella vista Folio si riproduce sulla pagina stessa.

## Come leggere questo libro

Il libro è diviso in tre parti. **Fondamenti**, la parte in cui ti trovi, spiega il problema che Postext risolve e come è costruito il motore: che cosa entra, che cosa esce e che cosa succede nel mezzo. **Il mestiere** riguarda la tipografia: come si compone una riga, come si inquadra una pagina, dove vanno figure e tabelle e come una serie di capitoli diventa un libro. **In pratica** passa agli strumenti: il formato del documento, la Sandbox, i quattro formati di output (canvas, HTML, PDF ed EPUB) e il progetto che li circonda.

Ogni capitolo si apre con una breve introduzione sulla sua fascia, e quasi tutti chiudono le loro sezioni con un riquadro intitolato _Provalo nella Sandbox_: un piccolo esperimento che puoi fare su questo stesso libro, subito, per vedere la funzione all’opera. Niente di ciò che fai può rompere qualcosa (**Ripristina l’originale…**, nel menu della riga della guida nel pannello **Libri**, lo riporta com’era all’origine), quindi cambia pure liberamente. I capitoli si possono leggere in qualsiasi ordine; quando uno dipende da un altro, lo dice.

## Layout applicativo e impaginazione editoriale

Il CSS moderno è uno strumento notevole per costruire interfacce utente. Flexbox, Grid, le container query e l’anchor positioning danno agli sviluppatori un controllo fine sulla disposizione dei componenti in una viewport. Ma il CSS è nato per il _layout applicativo_, mentre la lettura di testi lunghi ha bisogno di _impaginazione editoriale_. Sono due problemi diversi:

- **Il layout applicativo** dispone componenti interattivi (pulsanti, moduli, schede, menu di navigazione) dentro una viewport che il lettore scorre liberamente
- **L’impaginazione editoriale** fa scorrere testo, figure, tabelle e riquadri attraverso una sequenza di pagine e colonne fisse, seguendo regole affinate in secoli di stampa

Il confronto della :ref{id="feature-comparison"} riassume dove i due approcci divergono quando il documento è lungo. (Basta citarla: la tabella va da sola nel primo spazio libero dopo questo paragrafo, e non la collochi mai due volte.)

La differenza è di natura, non di grado. Un’interfaccia si adatta alla finestra che la contiene, e il lettore la percorre a piacere; una pagina, invece, ha una dimensione fissa, un inizio e una fine, e tutto ciò che contiene deve essere risolto entro quei limiti: che cosa entra in questa colonna e che cosa passa alla successiva, dove va ogni figura, come finisce ogni riga e ogni paragrafo. Sono queste decisioni a fare la qualità di un libro, e nessuna si può prendere guardando un singolo elemento isolato, per quanta cura si metta nello stile di ciascuno.

Il CSS risolve il primo caso in modo brillante. Per il secondo, la piattaforma non ha mai offerto le primitive che contano:

1. **Colonne bilanciate che conoscono il proprio contenuto.** La proprietà CSS _columns_ fa scorrere il testo, ma non sa pareggiare le colonne regolando lo spazio sopra i titoli o la spaziatura di un paragrafo; non ha la nozione di una figura o di una tabella che deve flottare in testa alla prossima colonna libera, e non sa tenere un titolo insieme al paragrafo che introduce quando cade un cambio di colonna.
2. **Difetti di fine paragrafo e di fine colonna.** _Orfane_ e _vedove_ esistono in CSS, ma i browser le supportano in modo disomogeneo e non vedono la geometria dell’intera pagina; e non c’è alcuna regola per la _riga finale troppo corta_, la parola breve rimasta sola sull’ultima riga di un paragrafo.
3. **Divisione in righe dell’intero paragrafo.** I browser vanno a capo in modo greedy, una riga alla volta, e possono solo distribuire lo spazio avanzato dentro ciascuna riga, mentre una giustificazione equilibrata richiede di valutare tutto il paragrafo in una volta.
4. **Un ritmo verticale condiviso.** Libri e riviste posano ogni riga su una griglia della linea di base comune a tutte le colonne della pagina, e il CSS non ha una primitiva che agganci le righe a una griglia attraverso colonne e pagine.
5. **L’apparato di un libro.** Testatine che conoscono il capitolo, numeri di pagina in sequenze romane o arabe, capitoli che iniziano su una pagina pari o dispari e un indice con i veri numeri di pagina: niente di tutto questo esiste in un documento che scorre.

:::callout{type="quote" placement="top"}
_La tipografia editoriale è un problema di soddisfacimento di vincoli. Al browser non è mai stato dato il linguaggio per enunciarli._
:::

Il CSS descrive con grande dettaglio l’_aspetto_ di una singola porzione di testo. Ciò che gli manca è l’_ottimizzazione globale_: la capacità di valutare un intero paragrafo, un’intera colonna e un’intera pagina prima di fissarne una. Un browser sistema ogni riquadro appena lo incontra, e non torna mai indietro a spostare una riga una volta impaginato il riquadro successivo; un compositore torna indietro di continuo, perché una decisione presa al piede di una pagina può annullarne una presa in testa.

## Che cosa manca agli strumenti esistenti

Altri strumenti affrontano parti del problema. I programmi di videoscrittura impaginano. Adobe InDesign offre un controllo editoriale completo. LaTeX resta il riferimento per la composizione accademica e matematica. Ma nessuno di loro è stato pensato per il web, e i loro presupposti li rendono difficili da inserire in un flusso di sviluppo moderno:

- Non si possono incorporare come componente di un’applicazione web
- Il loro output è statico, e raramente conserva la struttura semantica su cui si basano gli strumenti di accessibilità
- I loro formati sorgente sono proprietari, binari o difficili da generare da codice
- Vivono fuori dalla catena di strumenti frontend che un team web usa già

Postext prende una posizione diversa, riassunta nella :ref{id="tools-comparison"}. È una **libreria JavaScript** che gira nel browser, legge il Markdown, applica le regole della tipografia professionale e restituisce un’impaginazione che puoi disegnare come canvas, HTML o PDF, oppure scrivere come e-book EPUB. È fatta per essere incorporata, configurata ed estesa dagli sviluppatori che vogliono pagine di qualità editoriale senza lasciare i propri strumenti, e configurata dai grafici, che non hanno mai bisogno di toccare il codice.

## Un mestiere dalla lunga memoria

Le regole che Postext segue non sono state inventate per lui. Una riga comoda contiene tra 45 e 75 caratteri, ed è per questo che i testi lunghi si compongono in colonne e non in righe larghe quanto la pagina. Il testo è giustificato o in bandiera, ma in entrambi i casi la sua tessitura deve essere uniforme, senza i vuoti che si aprono in canali di bianco quando troppe righe lasche si accumulano una sull’altra. Ogni riga della pagina poggia su una griglia della linea di base comune, così le righe si fronteggiano attraverso l’intercolonna e, in trasparenza, coincidono con quelle del retro del foglio. I titoli restano con il testo che annunciano, un paragrafo non lascia sola la sua prima o la sua ultima riga sul bordo di una colonna, e una figura compare dopo la frase che la cita, mai prima.

Per secoli queste regole sono state applicate a mano, da compositori che leggevano ogni pagina prima che andasse in stampa. L’editoria da scrivania ne ha trasformate molte in software, ma quel software è rimasto un mondo a parte, con i suoi file e i suoi strumenti. Ciò che non è mai esistito è un motore che le applicasse automaticamente, a partire da testo strutturato, nell’ambiente in cui oggi si legge di più. È di questo vuoto che parla questo libro.

## A chi serve Postext

Postext è utile ovunque un testo lungo e strutturato debba sembrare progettato e non semplicemente mostrato:

- **Editori e redazioni** che vogliono ottenere dalla stessa sorgente un PDF pronto per la stampa, un’edizione fedele a schermo e un e-book, senza tenere allineate impaginazioni separate
- **Piattaforme di documentazione e di formazione** i cui libri di testo, manuali e corsi hanno bisogno di figure, tabelle, rimandi numerati e matematica composti a dovere su ogni pagina
- **Sviluppatori** che costruiscono esperienze di lettura (rapporti, riviste, cataloghi, documenti generati) e vogliono la qualità editoriale da una libreria anziché da un’applicazione desktop
- **Grafici e tipografi** che vogliono descrivere un progetto una sola volta, come insieme di regole, e vederlo applicato con coerenza su centinaia di pagine

Ciò che li accomuna è la preferenza per descrivere il risultato anziché collocarlo a mano, e il bisogno che il risultato sia buono quanto quello di un compositore attento.

## Che cosa Postext non è

Postext non sostituisce il CSS per le interfacce; è un motore specializzato per contenuti lunghi e strutturati. Non è un editor WYSIWYG: scrivi Markdown e descrivi il progetto grafico, e il motore compone le pagine. Non gestisce i breakpoint responsive: scegliere una configurazione per ogni dimensione di schermo spetta all’applicazione che lo ospita. Non carica i font al posto tuo: il motore misura con i font che il browser ha già, quindi una pagina deve caricare i suoi caratteri prima di impaginare. E per ora il motore di impaginazione funziona solo nel browser, perché le sue misure vengono dalle metriche dei font del canvas di un browser reale; i writer PDF ed EPUB, invece, funzionano anche in Node.

La stessa modestia vale per il contenuto. Postext non cerca di capire il testo che compone; applica regole alla struttura che riceve. In cambio, non si sostituisce mai all’autore: niente viene spostato, rinominato o riscritto, e ogni decisione che il motore prende è visibile nell’impaginazione e riconducibile a una regola della configurazione. Se una pagina viene male, la causa sta nel testo o nella configurazione, ed è lì che si corregge; a parità di testo e di configurazione il motore restituisce sempre le stesse pagine, così una correzione non va mai rifatta dopo l’impaginazione successiva.

# Come funziona il motore {lead="Entrano il Markdown e un oggetto di configurazione; esce un albero in cui ogni riga ha una posizione in unità reali. In mezzo c’è una breve pipeline che misura il testo senza toccare il DOM e itera finché la pagina non si assesta." summary="Analisi, misura, impaginazione, convergenza"}

Il modo più rapido per capire che cosa sa fare Postext è seguire un documento mentre lo attraversa. Il motore è una pipeline, schematizzata nella :ref{id="layout-pipeline"}, in cui ogni fase affina un’unica rappresentazione del documento condivisa in memoria. Nessuna fase si nasconde dietro un formato opaco e nessuna tocca il disco. La pipeline è anche pura: a parità di contenuto e di configurazione produce sempre la stessa impaginazione, le stesse pagine riga per riga.

## Contenuto e configurazione

Nella pipeline entrano due cose, ed entrambe sono fatte per essere lette e modificate da persone:

1. **Contenuto** in Markdown arricchito
   - Titoli, paragrafi, elenchi, enfasi, citazioni in blocco e matematica
   - Direttive per interruzioni di pagina, numerazione delle pagine, parti, riquadri e indice
   - Rimandi a risorse (figure, diagrammi SVG e tabelle) dichiarate per id fuori dal testo
   - Un front matter YAML facoltativo con titolo, sottotitolo, autore e data
2. **Configurazione** che descrive il progetto grafico
   - Formato della pagina, margini, abbondanza e numerazione delle pagine
   - Struttura delle colonne, intercolonna e filetti tra le colonne
   - Testo corrente, titoli, elenchi, didascalie, tabelle e matematica
   - Stili dei titoli, stili di paragrafo, stili dei riquadri, parti e pagina dell’indice
   - Testatine, una palette di colori con nome e le opzioni di output del PDF

Tenerli separati è una scelta deliberata. Lo stesso Markdown può diventare un tascabile, una rivista a due colonne o un libro di testo con una colonna laterale, cambiando soltanto la configurazione. È questo il motivo per cui il motore si rifiuta di fissare decisioni visive dentro il contenuto.

## Analisi

Il parser legge il Markdown arricchito e produce un elenco piatto di blocchi: titoli, paragrafi, citazioni in blocco, voci di elenco, formule in display e le direttive che danno forma al libro. Non decide nulla sull’impaginazione. Ciò che fa è strutturare con cura l’input: unisce le righe di un paragrafo, tiene traccia dell’annidamento degli elenchi, separa il testo di un titolo dai suoi attributi, risolve ogni \`:ref\` rispetto alle risorse dichiarate fuori dal testo e registra, per ogni blocco, l’intervallo esatto della sorgente da cui proviene.

Nello stesso momento si analizza la formattazione in linea. Grassetto, corsivo e la loro combinazione, apici e pedici, matematica in linea, campioni di colore e rimandi diventano porzioni tipizzate all’interno del paragrafo, così la fase di misura può dare a ciascuna il proprio font e il proprio colore. Il front matter in testa al documento viene letto come metadati (titolo, sottotitolo, autore e data) e messo a disposizione di ogni slot grafico.

## Misurare senza il DOM

Prima di collocare qualunque cosa, il motore deve sapere quanto spazio occupa ogni elemento, ed è qui che comincia l’intero progetto. Misurare il testo in un browser di solito significa disegnarlo nella pagina e rileggerne le dimensioni, un reflow che su un documento lungo può bloccare il thread principale per centinaia di millisecondi.

Postext misura attraverso _pretext_, una libreria di misura del testo senza DOM che usa le metriche dei font del canvas e pura aritmetica. Il suo passo costoso, preparare un testo per un dato font, viene messo in cache; impaginarlo a una data larghezza non costa quasi nulla. Questo approccio è da 300 a 600 volte più veloce della misura tramite reflow, come rende evidente la :ref{id="measurement-speed"}, e sopra di esso il modulo di misura del motore aggiunge le sequenze miste di grassetto, corsivo e matematica, la sillabazione, la giustificazione e la divisione ottimale in righe. Ogni risultato viene messo in cache sotto una chiave che comprende il testo, i font, la larghezza e ogni opzione che può cambiare una riga, così scrivere in un paragrafo fa rimisurare quel paragrafo e nient’altro.

Il caricamento dei font è l’unica parte della misura che il motore lascia a chi lo ospita. Misurare con un font non ancora arrivato significherebbe misurare il font di ripiego, e ogni riga si sposterebbe all’arrivo del carattere vero. La libreria si aspetta quindi che i font siano caricati prima della prima costruzione, e offre un modo per svuotare le sue cache di misura quando un font arriva in ritardo, così la costruzione successiva misura di nuovo con le metriche giuste. La Sandbox lo fa automaticamente: carica ogni famiglia nominata dalla configurazione, da Google Fonts o dal pannello Font, prima di impaginare una pagina.

## Sette passaggi e un ciclo

L’impaginazione vera e propria si svolge in sette passaggi:

1. **Strutturazione del contenuto**: analizza il Markdown in un elenco piatto di blocchi e risolve le risorse per id
2. **Misura del testo**: compone ogni paragrafo in righe alla larghezza che occuperà
3. **Collocazione in pagine e colonne**: riempie pagine e colonne, riservando lo spazio per le testatine e per i riquadri a tutta larghezza
4. **Collocazione delle risorse**: fa flottare ogni figura e tabella citata nel primo spazio libero dopo il suo rimando
5. **Rifinitura tipografica**: applica le regole che tengono i titoli con il loro testo e gli elenchi con la frase che li introduce
6. **Bilanciamento delle colonne**: pareggia le colonne di ogni pagina
7. **Ritmo verticale**: riporta il testo sulla griglia della linea di base dopo ogni elemento che la interrompe

Questi passaggi dipendono l’uno dall’altro in modo circolare. Tenere un titolo con il suo paragrafo può spingerli entrambi nella colonna successiva; quello spostamento può lasciare una vedova; correggere la vedova riporta indietro una riga, il che può separare di nuovo il titolo. Postext risolve il circolo con il **ciclo di convergenza** della :ref{id="convergence-loop"}: i passaggi dal terzo al settimo si ripetono, segnando solo ciò che è cambiato, finché nulla si muove più. Il ciclo è limitato a cinque iterazioni e i documenti tipici si assestano in una o due. Dopo ogni iterazione si calcola un punteggio delle violazioni tipografiche, così, se mai si arriva al limite, il motore tiene la migliore impaginazione trovata, non l’ultima.

Le regole applicate in questi passaggi sono volutamente poche e rigide. Un titolo resta sempre con le prime righe di ciò che lo segue. Un paragrafo che finisce con i due punti resta con l’elenco che introduce. Una figura e la sua didascalia non vengono mai separate. Un riquadro a tutta larghezza divide la pagina in fasce, e le colonne di ogni fascia si bilanciano per conto loro, così il testo sopra una tabella larga si legge giù per entrambe le colonne prima di passare sotto di essa. Quando due di queste regole non si possono soddisfare entrambe, vince quella che danneggia meno la pagina, e la scelta si fa ogni volta allo stesso modo. Per questo due impaginazioni dello stesso capitolo non differiscono mai, neppure di una riga.

## Un tasto, passo dopo passo

Conviene vedere che cosa succede quando scrivi una sola lettera in un paragrafo di questo libro. L’editor registra la modifica e il Markdown del capitolo viene analizzato di nuovo, il che costa poco. Ogni blocco tranne quello che hai toccato trova la sua misura in cache; il paragrafo modificato viene ricomposto alla larghezza della sua colonna, magari guadagnando o perdendo una riga. L’impaginazione del capitolo viene ricostruita a partire da quelle misure, fuori dal thread principale, e il ciclo gira finché la pagina non si assesta (di solito una volta sola) prima che l’anteprima disegni il risultato.

Poiché ogni capitolo viene impaginato per conto suo, in continuità con quelli che lo precedono, il resto del libro non viene toccato a meno che non cambi il numero di pagine del capitolo. Quando cambia, i capitoli successivi vengono reimpaginati in background, e la pagina dell’indice raccoglie i loro nuovi numeri di pagina.

:::callout{type="figures" title="Il motore in cifre" placement="top"}
:::columns{count=3 breaks="3,5"}
**300–600×** più veloce la misura del testo rispetto al reflow del DOM. Pretext misura con le metriche dei font del canvas e semplice aritmetica, ed è questo che permette di ricomporre un intero capitolo tra un tasto e l’altro.

**7 passaggi** trasformano il Markdown in pagine posizionate: strutturazione, misura, collocazione in pagine e colonne, collocazione delle risorse, rifinitura tipografica, bilanciamento delle colonne e ritmo verticale.

**5 iterazioni** al massimo nel ciclo di convergenza, e di solito una o due. Se mai si raggiunge il limite, il motore tiene la migliore impaginazione trovata lungo il percorso, non l’ultima.

**8 lingue** sillabate con i pattern di Liang che TeX usa dal 1983: inglese, spagnolo, francese, tedesco, italiano, portoghese, catalano e olandese.

**4 output** (canvas, HTML, PDF ed EPUB 3) nascono da un’unica impaginazione, così la pagina che controlli sullo schermo è la pagina che va in stampa.

**0 reflow** della pagina durante l’impaginazione. Tutto si calcola in memoria, in un worker quando chi ospita il motore lo chiede, e lo stesso input dà sempre le stesse pagine.
:::
:::

Il bilanciamento converge segmento per segmento, tra un’apertura di capitolo e l’altra e tra le interruzioni di pagina esplicite. Il risultato è una garanzia che per i libri conta: un capitolo impaginato da solo e lo stesso capitolo dentro l’intero libro escono identici, pagina per pagina.

## L’albero virtuale del documento

Ciò che sopravvive al ciclo è il **VDT**, l’albero virtuale del documento: pagine che contengono colonne, colonne che contengono blocchi, blocchi che contengono righe, ciascuno con il suo riquadro in unità reali, accanto a un elenco piatto di tutti i blocchi per accedervi rapidamente. L’albero è pura geometria (non sa nulla di canvas, HTML, PDF o EPUB) ed è proprio questo che permette a ogni renderer di disegnare un output coerente con gli altri. Ogni riga ricorda anche il tratto di Markdown da cui proviene, ed è così che un clic sulla pagina porta il cursore dell’editor sulla parola giusta.

Le pagine registrano anche a che cosa servono. Una pagina può essere una pagina di testo, un’apertura di capitolo, una pagina di parte o una pagina bianca inserita per arrivare alla parità giusta, ed è questo ruolo che permette a testatine, folio e decorazioni di scegliere dove comparire. Le etichette di pagina (il numero di pagina stampato, nella sua sequenza) si calcolano una sola volta, nell’albero, così il canvas, l’HTML e il PDF concordano senza fare ciascuno il proprio conteggio. Una prefazione numerata in cifre romane e un corpo che riparte da uno non richiedono casi speciali in nessun renderer: ognuno stampa l’etichetta che l’albero gli dà.

## Fuori dal thread principale

Un’impaginazione può durare più di un tasto premuto, perciò il motore può girare in un Web Worker. Il worker conserva la propria cache di misura tra una costruzione e l’altra e si annulla in modo cooperativo: quando si chiede una nuova costruzione, la precedente si ferma al suo prossimo punto di controllo e vince l’ultima richiesta. La Sandbox impagina ogni vista in questo modo, e i writer PDF ed EPUB hanno worker propri, così l’interfaccia resta reattiva mentre un intero libro viene composto o scritto. Il calcolo è lo stesso del thread principale e dà le stesse pagine, al pixel. Un libro di qualche centinaio di pagine si reimpagina così senza bloccare la scrittura, nemmeno su un portatile.

:::callout{type="note" title="Nel codice"}
\`buildDocument(content, config)\` restituisce il VDT. \`renderPage\` disegna una pagina su un canvas, \`renderToHtml\` restituisce HTML posizionato e \`renderToPdf\` del pacchetto _postext-pdf_ restituisce i byte di un PDF, di un solo documento o di un intero libro passato come array di capitoli. \`renderToEpub\` di _postext-epub_ scrive gli stessi capitoli come file EPUB 3. \`createLayoutWorker\` di _postext/worker_ esegue la costruzione fuori dal thread principale.
:::

:::part{number="II" title="Il mestiere" palette="band=#b7820f"}
3. Comporre la riga
4. La pagina e le sue colonne
5. Figure, tabelle ed elementi flottanti
6. Libri, parti e testatine
:::

# Comporre la riga {lead="Un paragrafo si compone tutto insieme, non una riga alla volta. Postext valuta ogni modo possibile di dividerlo, dà un prezzo a spaziature, trattini e parole isolate, e sceglie l’insieme di a capo che costa meno." summary="Divisione ottimale in righe, sillabazione, spaziatura e i difetti che evita"}

La qualità di una pagina si decide prima di tutto nei suoi paragrafi. Un browser va a capo in modo greedy: riempie una riga con tutte le parole che ci stanno, passa oltre, e può solo distribuire lo spazio avanzato dentro ciascuna riga. Postext implementa l’**algoritmo di Knuth-Plass**, il divisore ottimale di righe su cui TeX si basa dal 1981. Valuta ogni modo praticabile di dividere l’intero paragrafo e sceglie quello che minimizza il costo totale, così la spaziatura resta uniforme dalla prima riga all’ultima, e nessuna riga paga per le sue vicine.

## Scatole, colla e penalità

L’algoritmo vede un paragrafo come una sequenza di tre primitive, disegnate a tutta larghezza nella :ref{id="knuth-plass-model"}:

- Le **scatole** (box) sono parole o parti di parole, con una larghezza fissa
- La **colla** (glue) è lo spazio tra le parole, con una larghezza naturale e una capacità di allungarsi o accorciarsi
- Le **penalità** sono possibili punti di a capo con un costo; una penalità _marcata_ indica un punto di sillabazione e disegna un trattino quando viene usata

Per ogni riga candidata il motore calcola un rapporto di adattamento $r$, cioè quanto la colla deve allungarsi o accorciarsi per riempire la giustezza, e una «bruttezza» (badness) che cresce con il suo cubo, $b = 100\\,|r|^3$. Le righe si dividono in quattro classi di adattamento (strette, normali, lasche e molto lasche) e a ogni a capo si addebitano i suoi demeriti:

$$
d = (1 + b + p)^2
$$

dove $p$ è la penalità dell’a capo. Due righe sillabate di seguito costano 3.000 in più, e un salto di più di una classe di adattamento tra righe vicine costa 100, così l’ottimizzatore preferisce paragrafi la cui tessitura cambia con dolcezza. Se non esiste alcun insieme praticabile di a capo, il motore ripiega sulla divisione greedy invece di fallire.

## Perché conta l’intero paragrafo

Prendi un paragrafo la cui prima riga finisce, per caso, subito dopo una parola lunga. Un divisore greedy accetta l’a capo, perché la parola ci sta, e passa oltre. La seconda riga comincia allora con una serie di parole brevi, non riesce a riempirsi del tutto e deve essere allargata; la terza eredita il problema e finisce con un trattino; l’ultima riga si ritrova a contenere una sola parola. Nessuno di questi difetti è visibile dalla prima riga, l’unica che il divisore greedy ha guardato.

Il divisore ottimale vede l’intera catena. Può decidere di chiudere la prima riga una parola prima, un po’ più lasca di quanto potrebbe essere, perché quella scelta permette alla seconda riga di riempirsi in modo naturale, toglie il trattino dalla terza e porta una seconda parola sull’ultima riga. Il paragrafo nel suo insieme è migliore anche se la sua prima riga, presa da sola, non lo è. È questa l’essenza dell’algoritmo di Knuth-Plass, e il motivo per cui produce quel grigio uniforme che i lettori associano ai libri ben composti.

## Sillabazione

La sillabazione usa gli stessi **pattern di Liang** su cui TeX si basa dal 1983, forniti dalla libreria _Hypher_, in otto lingue: inglese, spagnolo, francese, tedesco, italiano, portoghese, catalano e olandese. La lingua del documento si imposta una volta sola, in cima alla configurazione, e serve anche a contrassegnare il PDF per i lettori di schermo. I pattern lasciano almeno due lettere prima di un trattino e tre dopo, quindi le parole di meno di cinque lettere non vengono mai divise, e ogni trattino è una penalità marcata di 50 che l’ottimizzatore può accettare o rifiutare.

La sillabazione agisce solo sul testo giustificato, dove si guadagna il suo posto. Due occasioni di a capo sono sempre disponibili, qualunque sia l’impostazione: un trattino esplicito tra due lettere è un punto di a capo legittimo, e una parola più larga dell’intera giustezza viene divisa all’ultima sillaba che ci sta, o all’ultimo carattere se necessario.

I trattini facoltativi (soft hyphen) scritti nel testo sono rispettati come punti di a capo, allo stesso prezzo di quelli dei pattern. Il catalano segue le regole dell’Institut d’Estudis Catalans: una parola con la _l·l_ geminata, come _col·lecció_, si divide tra le due _l_, e il trattino prende il posto del punto in alto, _col-_ alla fine di una riga e _lecció_ all’inizio della successiva. La lingua può anche cambiare all’interno di un libro: tutti i capitoli condividono la lingua della configurazione, quindi un’edizione in più lingue, come questa, si configura una volta per lingua, e ogni versione della guida va a capo secondo le proprie regole.

## Spaziatura tra le parole e righe in bandiera

Due impostazioni limitano quanto uno spazio può allargarsi o restringersi: \`maxWordSpacing\`, per impostazione predefinita il doppio dello spazio naturale, e \`minWordSpacing\`, 0,6 volte lo spazio naturale. Allargare oltre il massimo ha un prezzo più alto di qualunque altro difetto, così il divisore preferisce sillabare, spostare una parola o accettare una riga finale troppo corta piuttosto che aprire un canale di bianco. Alcune righe non si possono riempire affatto (un URL lungo, la coda indivisibile di una voce di elenco) e invece di aprirle con vuoti tre volte più larghi dello spazio naturale, il motore le compone in bandiera, con la spaziatura naturale. L’ultima riga di un paragrafo è sempre in bandiera, tranne quando è troppo piena: allora i suoi spazi si comprimono per farla entrare, esattamente come TeX tratta la colla.

## Cinese e testi dell’Asia orientale

Il cinese si scrive senza spazi tra le parole e non si sillaba mai: una riga può finire tra quasi due caratteri qualsiasi. Un paragrafo che contiene più caratteri cinesi, giapponesi o coreani che spazi tra le parole non passa per Knuth-Plass; lo compone una riga dopo l’altra il **compositore CJK**. Ciò che deve rispettare sono le regole di inizio e fine riga: una virgola, un punto o una parentesi chiusa non aprono mai una riga, e una parentesi aperta non ne chiude mai una. Quanto siano rigide dipende dalla regione, che si ricava dalla lingua del documento (\`zh-Hans\` segue lo standard della Cina continentale, GB/T 15834, e \`zh-Hant\` l’uso di Taiwan e Hong Kong) e \`cjk.lineBreak\` ne fissa il livello a mano. Alcune sequenze non si dividono mai: una lineetta o un’ellissi lunghe due em, un numero con la sua unità. Una parola latina o un indirizzo web in mezzo ai caratteri passa intero alla riga successiva, a meno che non sia più largo della riga; allora la parola viene divisa, e l’indirizzo viene spezzato dopo una barra o prima di un punto.

Ogni segno di punteggiatura cinese occupa un quadrato tutto suo, per metà inchiostro e per metà bianco, e quanta parte del bianco un libro conservi è una questione di stile della casa editrice, illustrata nella :ref{id="cjk-composition"}. Taiwan conserva ogni segno a quadrato pieno. Anche Hong Kong compone i suoi segni a quadrato pieno, ma stringe la maggior parte delle coppie di segni che si incontrano, e una parentesi che apre o chiude una riga perde la sua metà esterna. Lo stile Kaiming della Cina continentale, predefinito per \`zh-Hans\`, compone virgole, parentesi e virgolette su mezzo quadrato e lascia intero il punto, tranne a fine riga; dove due segni si incontrano, sparisce anche il bianco tra di loro. Lo stile si imposta con \`cjk.punctuationWidth\`, e le due correzioni si attivano con \`cjk.compressAdjacent\` e \`cjk.trimLineStart\`; \`cjk.hangingPunctuation\` lascia che una virgola o un punto sporgano oltre la fine della riga. Le impostazioni \`cjk\`, con la lingua del documento e la direzione di scrittura, si trovano nel gruppo **Sistema di scrittura** del pannello **Grafica**.

Una riga cinese giustificata si riempie in un ordine fisso: prima gli spazi tra le parole occidentali, poi il quarto di em che il motore inserisce tra testo cinese e testo latino (\`cjk.latinSpacing\`; non si digita mai), e per ultimi tutti gli intervalli tra due caratteri, mai all’interno di una parola latina o di un numero. Quando un carattere non può aprire la riga successiva, il compositore prova prima a farlo entrare nella riga togliendo bianco ai segni che vi si trovano già, e solo se non ci riesce porta a capo il carattere che lo precede. Una riga che richiederebbe più di mezzo em tra i suoi caratteri resta corta, e il pannello **Verifiche** la segnala come riga CJK lasciata corta.

Il resto di un libro cinese segue le stesse impostazioni. I modelli di capitolo, i numeri di pagina, gli elenchi e i contatori accettano gli stili di numerazione cinesi, tra cui \`simp-chinese-informal\`, \`trad-chinese-informal\` e \`cjk-decimal\`, così i capitoli possono essere chiamati con i loro ordinali cinesi; figure e tabelle prendono i loro nomi cinesi e sono numerate per capitolo con un trattino. \`cjk.grid\` definisce la gabbia del testo come un numero di caratteri per riga e di righe per pagina, la griglia su cui si progettano i libri cinesi. L’edizione cinese di questa guida è composta in verticale e rilegata a destra, come si sono stampati per secoli i libri cinesi: chiama i suoi capitoli con gli ordinali cinesi, stampa i folio in numeri cinesi e numera figure e tabelle per capitolo; la sua riga nel pannello **Libri** ha un pulsante di lingua tutto suo. Tra i libri di esempio, _Il sogno della camera rossa_ è un intero romanzo composto in cinese, e la sua edizione in caratteri tradizionali è composta in verticale su una griglia di 38 caratteri per 15 righe.

\`layout.writingMode: 'vertical-rl'\` compone un libro in verticale. Le righe scorrono dall’alto verso il basso e si susseguono da destra verso sinistra, due colonne diventano due registri sovrapposti sulla pagina, figure e tabelle restano diritte, le parole latine e i numeri lunghi si girano su un fianco, e ogni segno prende la posizione o la forma che ha nel testo verticale: parentesi e virgolette assumono le loro forme verticali, e il punto si sposta in alto a destra nella sua cella nella Cina continentale e resta centrato a Taiwan e a Hong Kong. Un libro così si rilega a destra (\`page.binding\`): la prima pagina sta da sola a sinistra del dorso, e la Sandbox mostra le doppie pagine da destra verso sinistra. Il canvas e il PDF compongono le stesse righe verticali; la vista HTML divide le proprie righe all’altezza della sua pagina, e mette diritto o gira ogni carattere come fanno loro. Per impostazione predefinita \`cjk.uprightDigits\` mette diritto in una sola cella un numero fino a due cifre, e si può portare a tre o quattro; \`:tcy[…]\` fa lo stesso con qualsiasi breve sequenza.

I libri cinesi, poi, segnano il testo in modi di cui la composizione latina non ha bisogno. L’enfasi si indica con un punto accanto a ogni carattere, non con il corsivo, quindi in un documento cinese \`*…*\` mette i punti di enfasi sui caratteri cinesi che contiene, come fa \`:dots[…]\`; \`cjk.emphasis: 'italic'\` mantiene il corsivo. \`:name[…]\` traccia la linea diritta dei nomi propri, \`:book[…]\` segna il titolo di un libro e \`cjk.bookTitleMark\` sceglie come: con le doppie parentesi angolari della Cina continentale o con la linea ondulata di Taiwan e Hong Kong. \`:ruby[…]{rt="…"}\` compone una lettura, il pinyin sopra i caratteri o lo zhuyin a destra di ciascuno, e \`:warichu[…]\` compone una nota su due righe di corpo dimezzato all’interno della riga, che prosegue nella riga o nella pagina successiva quando non ci sta. Nessuno di questi cambia l’interlinea: il pannello **Verifiche** avverte quando punti, linee o letture hanno bisogno di più spazio tra le righe di quanto il paragrafo ne lasci. Nel testo verticale i punti passano a destra della colonna, le linee alla sua sinistra, e la riga destra di una nota si legge per prima.

## Arabo e testi da destra a sinistra

Arabo, persiano, urdu ed ebraico si scrivono da destra a sinistra, e Postext li compone a partire dallo stesso Markdown e dalla stessa configurazione di qualunque altra lingua. Lo decide la lingua del documento: con \`locale: 'ar'\` le righe cominciano a destra, la prima colonna è quella di destra, il libro è rilegato sul margine destro e le sue doppie pagine si leggono da destra verso sinistra. Il motore impagina una pagina simile come una pagina da sinistra a destra e poi la rispecchia tutta intera, disegnando ogni parola, immagine e formula nel verso giusto, così un progetto grafico pensato per un libro inglese funziona senza modifiche: un’impostazione che nomina un lato si riferisce a un lato del testo, e \`start\` ed \`end\` sono accettati come nomi semplici per indicarlo. Testatine e folio restano sul foglio, dove un grafico se li aspetta.

All’interno di una riga, numeri, parole latine e citazioni si leggono comunque da sinistra a destra. L’ordine di quelle sequenze lo decide l’algoritmo bidirezionale di Unicode, implementato per intero; il testo si conserva, si cerca e si copia nell’ordine in cui è stato scritto, e solo il disegno viene riordinato. Parentesi e caporali vengono rispecchiati nelle sequenze da destra a sinistra. Un blocco composto in direzione opposta a quella del libro prende \`{dir=ltr}\` o \`{dir=rtl}\`, e una porzione di testo \`:ltr[…]\` o \`:rtl[…]\`, un isolamento il cui punto finale non vaga più verso l’estremità sbagliata della riga.

Le lettere arabe si legano tra loro, e ciascuna prende la forma che le chiedono le vicine, quindi una parola si misura e si disegna come un’unica stringa sagomata, mai lettera per lettera; il PDF la sagoma con HarfBuzz e riconduce ogni glifo ai suoi caratteri, così il testo copiato e i lettori di schermo ricevono le parole che sono state scritte. Ne seguono tre regole: niente sillabazione, niente spaziatura tra le lettere e nessun taglio all’interno di una parola, che sborda dalla riga e viene segnalata invece di essere divisa. Le righe giustificate si allargano prima negli spazi, poi con la **kashida**, l’allungamento dei legami che un calligrafo traccia tra due lettere unite, inserita solo dove le regole del naskh lo consentono e lasciata fuori dal testo copiato. Il divisore di righe conta quell’allungamento come elasticità, così sceglie i suoi a capo sapendo dove una riga può allargarsi. L’enfasi si compone in grassetto, perché i caratteri arabi non hanno corsivo, e il motore non inclina mai una lettera araba.

I segni vocalici si impilano sopra e sotto le lettere, nell’interlinea, che non cresce mai da sola: il pannello **Verifiche** segnala un paragrafo i cui segni toccherebbero la riga di sopra, con l’interlinea di cui avrebbe bisogno. I numeri generati (folio, numeri di capitolo, di figura e di nota) prendono le cifre della regione, indo-arabe nell’oriente del mondo arabo ed europee nel Maghreb, mentre i numeri che scrive l’autore non vengono mai riscritti; un titolo può scrivere il suo numero come ordinale in lettere, e le pagine preliminari possono contare nell’ordine abjad dei manoscritti. Le poesie classiche si scrivono in \`:::verse\`, un verso per riga con i due emistichi separati da \`||\`: ogni emistichio viene portato a una stessa larghezza, prima con le kashide, così le rime si allineano lungo tutta la poesia. L’edizione araba di questa guida è composta così, rilegata a destra, e tra i libri di esempio _Le mille e una notte_ compone l’opera intera in arabo, alla maniera della stamperia di Bulaq.

## Enfasi e porzioni di testo

Un paragrafo è raramente una sola porzione di testo. Grassetto, corsivo e grassetto corsivo si compongono con i veri caratteri della famiglia (un corsivo autentico, non un tondo inclinato), ciascuno misurato con le proprie metriche, così una parola in grassetto occupa esattamente lo spazio di cui ha bisogno. Il colore del testo in grassetto, del testo in corsivo e dei rimandi si può impostare separatamente; in questo libro i rimandi a figure e tabelle sono in grassetto nel colore della parte, così si trovano facilmente sulla pagina e nel PDF, dove sono anche link.

Apici e pedici si compongono più piccoli e spostati rispetto alla linea di base senza alterare l’interlinea, e i campioni di colore in linea poggiano sulla linea di base come una lettera. Sono tutti atomici: il divisore di righe può andare a capo prima o dopo di essi ma mai al loro interno, quindi una formula o un campione di colore non finisce mai spezzato su due righe.

Altre due porzioni distinguono le parole senza un carattere proprio. \`:smallcaps[…]\` compone in maiuscoletto ricavato dalle maiuscole del carattere, allo stesso modo in ogni output, per le sigle e i nomi dei personaggi di un’opera teatrale. \`:chip[…]\` mette una parola in un piccolo riquadro arrotondato che scorre con la riga (tasti della tastiera, etichette, la banca di parole di un esercizio), con uno stile scelto per nome, mai spezzato al suo interno, e con parole che restano vero testo nell’HTML e nel PDF.

## Orfane, vedove e righe corte

Un’**orfana** è la prima riga di un paragrafo rimasta sola al piede di una colonna; una **vedova** è la sua ultima riga portata da sola in testa alla colonna successiva. Entrambe spezzano il ritmo della lettura, e la :ref{id="orphan-widow"} le mostra ai due lati di un cambio di colonna. Un terzo difetto, la **riga corta**, è un’ultima riga che contiene una sola parola breve, abbandonata sotto un paragrafo pieno.

Postext dà un prezzo a tutti e tre. Quando un paragrafo attraversa una colonna, il motore confronta tutte le divisioni possibili e fa pagare a ciascuna lo spazio che lascia inutilizzato, un’eventuale orfana e un’eventuale vedova (1.000 per impostazione predefinita, ciascuna), con almeno due righe da entrambe le parti. Le righe corte hanno un prezzo all’interno dello stesso divisore di righe, come bruttezza, ogni volta che l’ultima riga è più corta dello spazio di venti caratteri. Quando una riga corta non si può evitare dividendo il paragrafo in un altro modo, il motore può invece comporre il paragrafo con una riga in meno, stringendo gli spazi tra le parole entro il loro minimo e, se serve, la spaziatura tra le lettere di non più di dieci millesimi di em. Le voci di elenco seguono le stesse regole, con interruttori propri.

## Elenchi

Gli elenchi seguono la stessa disciplina dei paragrafi, con una tipografia tutta loro. Gli elenchi puntati scelgono il carattere del punto elenco, la sua dimensione, il peso e il colore, e la distanza e il rientro sporgente che tengono allineato il testo di ogni voce; gli elenchi numerati scelgono tra numeri arabi, lettere minuscole o maiuscole e numeri romani minuscoli o maiuscoli, con un separatore che si può stilizzare a parte e numeri allineati a destra, così le voci 9 e 10 si allineano. L’annidamento arriva a cinque livelli, ciascuno con i propri rientri e i propri marcatori, e gli elenchi di attività disegnano una casella di controllo per ogni voce, spuntata o no. Le voci possono essere strette o spaziate, e il motore usa la fine di un elenco come una delle sue leve quando bilancia le colonne.

:::callout{type="try"}
Nel pannello **Grafica**, cerca _lasche_ e attiva **Evidenzia le righe lasche**, nel gruppo **Avanzate**. Poi restringi le colonne o aumenta \`maxWordSpacing\` e osserva quali righe il motore è costretto ad aprire, e come l’ottimizzatore le redistribuisce.
:::

## Matematica

Le formule sono cittadine a pieno titolo. Le espressioni in linea come $e^{i\\pi}+1=0$ scorrono con il testo, composte da MathJax come tracciati vettoriali che restano nitidi a qualsiasi ingrandimento. Quando una formula è più alta di quanto la riga consenta, viene ridotta in modo uniforme perché la griglia della linea di base sopravviva, e il lettore conserva il ritmo del testo per quanto densa sia la notazione. Le formule in display stanno su righe proprie, centrate nella colonna, con i propri margini, e il testo che segue torna sulla griglia:

$$
\\int_0^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

Gli stessi tracciati vengono disegnati dal canvas, dalla vista HTML e dal PDF, così le formule coincidono nei tre output e restano vettoriali in stampa.

Qualche altro esempio mostra la gamma di notazioni che il motore gestisce, e che cosa fa con ciascuna perché la formula possa convivere con il testo. Il primo è una serie infinita, la somma degli inversi dei quadrati che Eulero risolse nel 1734. In una formula in display gli estremi della sommatoria si compongono sopra e sotto il simbolo, come in un manuale di analisi, e la frazione del risultato prende la sua dimensione piena invece della forma ridotta usata dentro una riga.

$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

Le matrici sono un’altra prova comune, perché richiedono che righe e colonne si allineino e che le parentesi crescano fino all’altezza del contenuto. MathJax compone la matrice come una tabella di celle centrate e allunga i delimitatori per abbracciarla; Postext riceve il risultato come tracciati, ne misura l’intero riquadro e riserva esattamente quello spazio prima di riportare il testo sulla griglia. Il determinante di una matrice due per due si legge così.

$$
\\det \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc
$$

La distribuzione normale raccoglie in una sola espressione quasi tutto ciò che rende difficile la composizione matematica: una radice con la sua barra, lettere greche e un’intera frazione dentro un esponente, che deve rimpicciolirsi due volte senza diventare illeggibile. È la formula che si trova in qualsiasi manuale di statistica, e qui è composta con le stesse regole che userebbe TeX.

$$
f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}
$$

Le definizioni per casi chiudono la serie. Una graffa raggruppa i rami della definizione, ciascuno con la sua condizione allineata a destra, e la graffa cresce con il numero dei casi.

$$
|x| = \\begin{cases} x & \\text{if } x \\ge 0 \\\\ -x & \\text{if } x < 0 \\end{cases}
$$

Le formule in linea seguono altre regole, perché devono convivere con le parole che le circondano. Le radici di $ax^2+bx+c=0$ sono $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$, il prodotto di Eulero si scrive $\\prod_p (1-p^{-s})^{-1} = \\zeta(s)$, e anche la trasformata di Fourier $\\hat f(\\xi) = \\int f(x)\\,e^{-2\\pi i x \\xi}\\,dx$ resta sulla sua riga. In tutti e tre i casi il motore misura l’altezza della formula e, quando supera ciò che l’interlinea consente, la riduce solo quanto basta, così le righe intorno conservano il loro posto sulla griglia e il paragrafo la sua tessitura.

# La pagina e le sue colonne {lead="Le pagine sono fisse, le colonne finite, e ogni riga dovrebbe poggiare su un ritmo condiviso in tutta la doppia pagina. Questo capitolo parla della cornice: la geometria della pagina, le strutture a colonne, la griglia della linea di base e il modo di chiudere le colonne alla stessa altezza." summary="Geometria della pagina, colonne, griglia della linea di base e bilanciamento"}

Le colonne sono l’espressione più visibile del progetto editoriale, e il punto in cui le soluzioni fatte in casa cedono per prime. Postext tratta la pagina e le sue colonne come oggetti a pieno titolo, con la propria geometria, il proprio ritmo e le proprie regole per chiudere bene.

## Geometria della pagina

Una pagina comincia dal suo formato. Postext offre come preset i formati abituali di libri e riviste, elencati nella :ref{id="preset-sizes"}, e qualsiasi formato personalizzato in centimetri, millimetri, pollici o punti; questa guida è composta sul formato 21 × 28 cm. I margini possono essere **speculari**, così il margine sinistro diventa quello interno, verso il dorso, e cambia lato su ogni verso. Per la produzione di stampa, la pagina può avere un’abbondanza e i segni di taglio, e un’impostazione in DPI controlla la risoluzione delle misure in pixel.

I numeri di pagina seguono delle sequenze: arabi, romani minuscoli o maiuscoli, alfabetici minuscoli o maiuscoli, ciascuna con il proprio numero di partenza, così un libro può numerare le pagine preliminari i, ii, iii e cominciare il primo capitolo da 1. Il PDF registra le stesse sequenze come etichette di pagina, così il riquadro della pagina di un visualizzatore riporta esattamente ciò che è stampato al piede.

## Giustezza e interlinea

I due numeri che più decidono come si legge una pagina sono la lunghezza delle sue righe e la distanza tra di esse. La configurazione fissa il corpo e l’interlinea del testo in unità reali (questo libro usa 9,4 punti su 13,6) e la larghezza della colonna discende dalla pagina, dai margini, dalla struttura delle colonne e dall’intercolonna. Una riga da 45 a 75 caratteri è l’obiettivo classico; molto più corta e l’occhio salta troppo spesso, molto più lunga e fatica a ritrovare l’inizio della riga successiva. Due colonne su una pagina di 21 cm rientrano comodamente in quell’intervallo, ed è uno dei motivi per cui il formato è così diffuso per riviste e libri tecnici.

L’interlinea è anche l’unità della griglia della linea di base. Ogni distanza verticale che conta (lo spazio sopra e sotto un titolo, intorno a una figura, tra le voci di un elenco) è meglio espressa come un numero intero di righe della griglia, o viene corretta fino a esserlo, così la pagina mantiene un unico ritmo dall’alto in basso.

## Strutture a colonne

Tre strutture coprono la maggior parte delle pubblicazioni, schematizzate come miniature di pagina nella :ref{id="column-layouts"}:

1. **Una colonna** per romanzi, saggi e letture concentrate
2. **Due colonne** per riviste, rapporti e libri come questo
3. **Una colonna e mezza**, una colonna principale accanto a una colonna laterale più stretta
   - La colonna laterale può contenere testo che continua dalla colonna principale
   - Oppure può essere un **canale per gli elementi flottanti** che accoglie solo figure, tabelle, didascalie e riquadri, come nei libri di testo con una colonna esterna di note e diagrammi

L’intercolonna è configurabile, e al suo interno si può tracciare un filetto facoltativo, con il proprio spessore e il proprio colore. Gli elementi a tutta larghezza (una figura, una tabella, un riquadro) tagliano le colonne: il testo sopra di essi si divide in parti uguali tra le colonne, e le colonne riprendono sotto.

## Titoli

I titoli si configurano livello per livello, fino a sei livelli: carattere, corpo, interlinea, peso, corsivo, maiuscole, colore, allineamento e lo spazio sopra e sotto ciascuno. Un livello può essere numerato con un modello: \`{1}.{2}\` stampa 4.3 per la terza sezione del capitolo 4, e formati come \`{1:I}\` o \`{1:a}\` passano un livello ai numeri romani o alle lettere. Un livello può anche cominciare su una nuova pagina, con la parità che richiede, e occupare tutta la larghezza della pagina invece di una colonna: è questo che fa di un titolo di primo livello un’apertura di capitolo.

I titoli restano con ciò che li segue, così un titolo di sezione non aspetta mai da solo al piede di una colonna. Si agganciano anche alla griglia della linea di base: un titolo più grande del testo prende lo spazio che gli serve, e il testo che lo segue torna sulla griglia, così le colonne ai due lati dell’intercolonna continuano a fronteggiarsi riga per riga.

## La griglia della linea di base

I libri professionali allineano la prima linea di base di ogni colonna a un ritmo verticale comune, e ogni riga successiva cade sulla stessa griglia, così le righe si fronteggiano attraverso l’intercolonna. Postext aggancia il testo a una griglia della linea di base ricavata dall’interlinea del testo corrente, come illustra la :ref{id="baseline-grid"}. Gli elementi che interrompono la griglia (un titolo più grande del testo, una figura, una formula in display) sono seguiti dallo spazio necessario a riportarvi la riga successiva. Mentre lavori, la griglia si può mostrare in sovrimpressione, dovunque ci sia testo.

## Chiudere le colonne alla stessa altezza

Quando una pagina finisce in mezzo al testo, le sue colonne dovrebbero finire alla stessa altezza. È il **bilanciamento delle colonne**, ed è più difficile di quanto sembri: le righe avanzano per passi interi della griglia, le figure non si possono spezzare, i titoli devono restare con il loro testo e i paragrafi non devono lasciare orfane. Postext pareggia una colonna corta con tre leve, usate in ordine di preferenza e disegnate nella :ref{id="column-balancing"}:

1. **Lo spazio sopra i titoli**, una riga intera della griglia alla volta, distribuito secondo l’importanza e mai in testa a una colonna
2. **Una riga dopo la fine di un elenco**
3. **Paragrafi più lenti**: un paragrafo composto con una riga in più, la _looseness_ di TeX, accettata solo se nessuna delle sue righe si allarga oltre il limite della spaziatura tra le parole; se aiuta, un tocco di spaziatura tra le lettere, al massimo dieci millesimi di em

Ogni correzione si verifica reimpaginando la pagina, fino a otto volte, e vince il risultato migliore. Un paragrafo composto con una riga in più conserva le parole e allarga solo gli spazi, perciò un paragrafo breve, con pochi spazi da allargare, viene scelto di rado. Alcune colonne vengono lasciate stare di proposito: l’ultima colonna prima di un’interruzione di pagina forzata o di un’apertura di capitolo, l’ultima pagina del documento, una colonna in cui non c’è niente da allargare. Due regole affini pareggiano le colonne finali di un capitolo, e le colonne sopra un riquadro a tutta larghezza che si sposta o si divide.

## Fasce e riquadri a tutta larghezza

Una pagina non è sempre un’unica serie di colonne dall’alto in basso. Una figura, una tabella o un riquadro a tutta larghezza la taglia in **fasce**: il testo sopra il riquadro riempie le sue colonne come una fascia a sé, il riquadro attraversa la pagina, e le colonne ricominciano sotto di esso. Ogni fascia si bilancia per conto suo, così il lettore scende lungo la prima colonna e risale in testa alla seconda prima di oltrepassare il riquadro, come in un quotidiano. Quando una fascia finirebbe in modo irregolare, un **limite di fascia** accorcia le sue colonne allo stesso numero di righe, e il testo che non ci sta più prosegue sotto.

Le colonne finali di un capitolo ricevono lo stesso trattamento. Invece di lasciare l’ultima pagina con una colonna piena e una quasi vuota, un limite finale divide tra loro le righe rimaste, e le leve del bilanciamento fanno il resto. Le interruzioni di colonna esplicite sono rispettate: \`:::columnbreak\` chiude una colonna dove l’autore la vuole chiusa, e il bilanciamento lascia stare il piede di quella colonna. Nessuna di queste leve tocca il testo: aggiungono spazio o allungano un paragrafo di una riga. Le leve si provano nello stesso ordine su ogni pagina, così due impaginazioni dello stesso capitolo finiscono allo stesso modo, ogni volta che le si ripete.

:::callout{type="try"}
Nel pannello **Grafica**, apri **Titoli e indice** e disattiva **Bilancia le colonne**. Guarda il piede delle colonne di questo capitolo, poi riattivalo e osserva quale leva ha usato il motore su ogni pagina.
:::

# Figure, tabelle ed elementi flottanti {lead="Un rimando è una promessa, non una posizione. Cita una figura e Postext le trova una casa: il primo spazio libero dopo la citazione, numerata nell’ordine di lettura, con la sua didascalia, mai prima delle parole che la chiamano." summary="Dove finiscono le risorse, come si numerano, tabelle che si dividono"}

Tutto ciò che non è testo che scorre (immagini, diagrammi SVG, tabelle) è una **risorsa**. Le risorse si dichiarano fuori dal testo, ciascuna con un id, un tipo, una didascalia e le sue preferenze di collocazione, e il Markdown si limita a citarle. Nella Sandbox si trovano nel pannello Risorse.

## Basta una citazione

Scrivere \`:ref{id="…"}\` in una frase fa due cose: stampa l’etichetta della risorsa e, la prima volta, _incorpora_ la risorsa, che poi flotta nel primo spazio libero dopo il rimando. Gli spazi si provano in ordine, come mostra la :ref{id="float-slots"}: il piede della colonna che contiene il rimando, poi la testa e il piede della prossima colonna libera, poi una fascia nella pagina successiva. Il testo non viene mai interrotto.

Poche regole tengono in riga gli elementi flottanti:

- Un elemento flottante non finisce mai prima del suo rimando e non viene mai rimpicciolito per entrare
- Gli elementi flottanti di una stessa sequenza di numerazione mantengono il loro ordine, così la figura 12 non compare mai prima della figura 11; una tabella che aspetta spazio non trattiene le figure
- Gli elementi flottanti non escono mai dal loro capitolo: aperture di capitolo, pagine di parte e fine del documento sono barriere
- Un elemento flottante che lascerebbe meno di tre righe di testo su una pagina nuova aspetta la successiva
- Le fasce di testa e di piede sono allineate alla griglia della linea di base, e la didascalia di un elemento flottante al piede condivide la linea di base dell’ultima riga di testo

## Collocazione

Ogni risorsa può indicare dove preferisce andare, e ogni tipo di risorsa ha un valore predefinito; i campi sono raccolti nella :ref{id="placement-options"}. Una risorsa può anche essere inserita in linea in un punto preciso, quando la sua posizione è _qui_. E una tabella o una figura troppo larga per la pagina si può ruotare di un quarto di giro: occupa allora una pagina tutta sua, allineata al dorso.

## Numeri ed etichette

I tipi di risorsa definiscono le proprie sequenze di numerazione. Figure e tabelle sono predefinite e localizzate nella lingua del documento; un tipo può aggiungere un prefisso, un’etichetta breve, un modello come \`{h1}.{n}\` per numeri relativi al capitolo (la figura 5.2 è la seconda figura del capitolo 5), una regola di azzeramento e un formato del contatore. I numeri seguono il **primo rimando nell’ordine di lettura**: inserisci una citazione precedente e tutti i numeri successivi si spostano. Un rimando può stampare il solo numero, l’etichetta completa o quella breve, cambiarne le maiuscole, oppure stampare un testo proprio.

La numerazione resta corretta in tutto il libro perché fa parte di ciò che ogni capitolo eredita dai capitoli precedenti. Il sesto capitolo di questa guida comincia le sue figure da 6.1 perché lo dice il contatore dei capitoli, non perché qualcuno abbia scritto il numero, e spostare un capitolo rinumera tutto ciò che viene dopo la volta successiva che il libro viene impaginato.

## Tipi su misura

Figure e tabelle sono solo i due tipi di cui ogni libro ha bisogno. Una configurazione può dichiarare tutti i tipi di risorsa che una pubblicazione usa (mappe, tavole, riquadri, grafici, documenti), ciascuno con un nome singolare e uno plurale, un’etichetta breve per i rimandi, un prefisso per le didascalie e una propria sequenza di numerazione. Un catalogo può numerare le sue tavole 1, 2, 3 per tutto il libro mentre le figure ripartono a ogni capitolo; un libro di testo può numerare i suoi riquadri 1-1, 1-2 nel primo capitolo e 2-1 nel secondo. Ogni tipo può anche avere la propria collocazione predefinita e adattare lo stile della didascalia, così le tavole possono occupare un’intera pagina con la didascalia sopra mentre le figure flottano alla larghezza della colonna.

Anche un tipo con il prefisso vuoto e senza didascalia è utile: trasforma un’immagine in un ornamento, una vignetta o un logo da inserire esattamente dove viene citato, senza numero e senza mai entrare nell’elenco delle figure. Anche una risorsa così si sposta, si ridimensiona e si allinea dal pannello **Risorse**, come qualsiasi figura, e in ogni edizione del libro resta la stessa immagine.

## Tabelle

Le tabelle portano con sé il loro modello: righe di celle con estensioni su più colonne e su più righe, righe di intestazione, allineamento e larghezze relative delle colonne. Le celle accettano Markdown in linea, paragrafi ed elenchi semplici, un riempimento proprio (i tre colori delle parti di questo libro sono :swatch{color="#2b4acb"} blu, :swatch{color="#b7820f"} oro antico e :swatch{color="#c0452f"} vermiglione) e perfino un’immagine. Le tabelle si stilizzano una volta sola, per tutto il documento: tipografia del corpo e dell’intestazione, riempimento dell’intestazione, filetti a griglia, solo orizzontali, solo esterni o nessuno.

Le tabelle si modificano nel pannello Risorse, in un editor che funziona come un piccolo foglio di calcolo: aggiungi o togli righe e colonne, unisci e dividi celle, segna righe e colonne di intestazione, allinea le celle, imposta riempimenti e larghezze delle colonne, trascina un’immagine in una cella e incolla un blocco di celle copiato da un foglio di calcolo. Ogni modifica si può annullare, e la tabella sulla pagina segue mentre scrivi.

Una tabella più alta della pagina si divide su più pagine. Le sue righe di intestazione si ripetono su ogni parte, la didascalia di ogni continuazione riceve il suffisso _(segue)_, un’indicazione _Continua_ chiude ogni parte tranne l’ultima, e nessuna divisione taglia mai una cella estesa su più righe. Una tabella ruotata si divide allo stesso modo, pagina dopo pagina.

## Figure accanto al testo

In un’impaginazione a una colonna e mezza la cui colonna laterale contiene solo elementi flottanti, le risorse possono stare accanto al testo invece che al suo interno. Una figura con estensione _side_ si impila nella colonna laterale accanto al paragrafo che la cita; un riquadro può fare lo stesso, così i libri di testo possono tenere definizioni, concetti chiave e figure a margine accanto alle righe che spiegano. Una figura larga può anche tenere la didascalia accanto a sé, nella colonna laterale, che è la disposizione classica dei libri di testo illustrati e dei cataloghi di mostre. Tra i preset di esempio ci sono un manuale di biochimica e un’edizione letteraria composti proprio così.

## Didascalie e crediti

Una didascalia è il prefisso del tipo, il numero e il testo della didascalia, che accetta Markdown in linea e rimandi propri. Le didascalie stanno sopra o sotto la loro risorsa, facoltativamente su una barra colorata, nel carattere e nel corpo dello stile delle didascalie; l’etichetta può essere in grassetto o colorata, come in questo libro. Una risorsa può anche portare una nota: una riga di credito o di fonte, più piccola, composta sotto di essa.

## Ruotate di un quarto

Alcune risorse sono più larghe di quanto la pagina sia alta: una cronologia, un’ampia tabella di risultati, una tavola panoramica. Una risorsa del genere si può ruotare di un quarto di giro, in senso orario o antiorario. Occupa allora una pagina tutta sua, allineata al dorso, così girare il libro per leggerla viene naturale, e viene dimensionata sull’altezza della pagina anziché sulla sua larghezza. Una tabella ruotata più alta di una pagina ruotata (cioè più larga dell’altezza della pagina) si divide su tutte le pagine che le servono, ripetendo le righe di intestazione, come farebbe una tabella diritta.

## Figure vettoriali

I diagrammi SVG si disegnano come vettori dappertutto. Il PDF converte il sottoinsieme comune di SVG (forme, tracciati, gruppi, tracciati di ritaglio, riempimenti e contorni a tinta piatta, opacità e testo) in operazioni di disegno native, e rasterizza a 600 dpi tutto ciò che va oltre; una figura può anche portare un proprio originale PDF, incorporato così com’è. Per la stampa a un solo colore, un interruttore ricolora ogni diagramma come tinte di un unico inchiostro, in base alla luminanza, in tutti e tre i renderer.

Tre figure composte qui lo dimostrano. Il rosone della :ref{id="vector-rosette"} è fatto di curve di Bézier, contorni sottilissimi e una riga di microtesto alta due punti e mezzo; il grafico della :ref{id="vector-chart"} combina un’area piena, una linea tratteggiata ed etichette di testo; e la :ref{id="vector-clip"} usa un tracciato di ritaglio, un gruppo disegnato con trasparenza e una forma riusata cinque volte. Apri il PDF, ingrandiscile più volte e guarda i bordi: restano nitidi come il testo che le circonda, perché sono disegnate con gli stessi operatori, non incollate come immagini. Prova a selezionare le etichette del grafico, o a cercarle: sono testo.

Il testo dentro un SVG resta testo. Nel PDF è composto con font veri e si può selezionare e cercare, e nella Sandbox si può modificare sul posto: il pannello Risorse apre la sorgente del diagramma con solo il testo modificabile (il disegno resta bloccato, a meno che tu non lo sblocchi), così un’etichetta si può correggere o tradurre senza aprire un programma di disegno. I diagrammi di questo libro sono generati per ogni lingua, ed è per questo che le loro etichette sono in spagnolo nell’edizione spagnola, in catalano in quella catalana, in cinese in quella cinese, in arabo in quella araba e in italiano in questa.

:::callout{type="try"}
Fai clic sulla didascalia di una figura qualsiasi nel canvas: il pannello Risorse si apre su quella risorsa, con il campo della didascalia pronto. Cambia la sua collocazione da _auto_ a _top_ e guardala spostarsi.
:::

## Video

Un video è una risorsa come le altre. Si cita, ha una numerazione propria (Video 1.1 accanto a Figura 1.1) e flotta nel primo spazio libero come una figura. Può venire da YouTube o Vimeo, da un file conservato nel libro o da un indirizzo web: un file MP4 o WebM, o uno stream HLS.

In stampa compare la sua copertina, un fotogramma scelto, con un segno di riproduzione e un codice QR che apre il video; nel PDF la copertina è anche un link. La vista HTML e l’EPUB lo riproducono, tranne i video di YouTube, Vimeo e HLS, a cui un e-book può solo rimandare con un link. Nella vista Folio un clic sulla copertina lo avvia sulla pagina, e il video continua mentre il foglio gira. I video di questo libro, come il :ref{id="postext-showreel"}, sono stream HLS.

# Libri, parti e testatine {lead="Un libro è più dei suoi capitoli: una copertina, un indice che si aggiorna da sé, pagine di parte, aperture che annunciano ogni capitolo e testatine che sanno dove si trova il lettore. Tutto questo è configurazione." summary="Capitoli, stili dei titoli, slot grafici, parti, indice e numeri di pagina"}

Questa guida è un libro di tredici capitoli, e ogni capitolo è un documento Markdown a sé. Un progetto nella Sandbox è sempre un libro: configurazione, risorse e font sono condivisi, e i capitoli si susseguono, come mostra la :ref{id="book-anatomy"}.

## I capitoli fanno un libro

Ogni capitolo viene impaginato per conto suo, _in continuità_ con i capitoli che lo precedono: ne eredita il numero di pagine e la parità della pagina, i contatori dei capitoli e delle figure, la parte aperta e le testatine. È per questo che le figure di questo capitolo sono numerate da 6.1, e per questo modificare un capitolo non costringe mai il motore a ricomporre l’intero libro. Le anteprime possono mostrare il capitolo corrente o tutto il libro; il PDF si può generare per l’uno o per l’altro. I capitoli si possono aggiungere, rinominare, riordinare, dividere ai loro titoli di primo livello o unire al precedente.

## Che cosa eredita un capitolo

La continuazione che un capitolo riceve è piccola e precisa. Porta il numero di pagine e la parità della pagina successiva, così un’apertura che deve cadere su un verso sa se le serve una pagina bianca prima. Porta i contatori: il numero del capitolo, i numeri di ogni sequenza di risorse, la sequenza di numerazione delle etichette di pagina. Porta la parte aperta, con titolo, numero e palette, così un capitolo a metà di una parte conserva i suoi colori. E porta lo schema del libro, così un indice nel secondo capitolo può stampare la pagina in cui comincia il decimo.

Poiché la continuazione è tutto ciò di cui un capitolo ha bisogno dal resto del libro, i capitoli si possono impaginare in modo indipendente, in background, e cucire insieme per la vista dell’intero libro e per il PDF. Il risultato è lo stesso che si otterrebbe impaginando tutto il libro in una volta, pagina per pagina: una proprietà che il motore è costruito per garantire.

## Stili dei titoli

Un titolo può avere degli attributi, scritti tra graffe alla fine della sua riga. Il più potente è lo **stile**: \`{style="cover"}\` applica uno stile di titolo con nome, che cambia la tipografia e la grafica del titolo e, per la sezione che il titolo apre, può cambiare le testatine, i margini della pagina, la disposizione delle colonne, la tipografia del testo e la palette. La copertina di questo libro è uno stile di titolo con margini propri, senza testatine e con una grafica a piena pagina; la pagina dell’indice è un altro. Uno stile può anche lasciare i suoi titoli senza numero, così una prefazione non sposta i numeri dei capitoli, e tenerli fuori dall’indice.

## Uno sguardo alla configurazione di questo libro

Vale la pena vedere come sono costruite le pagine che stai leggendo. La copertina è il titolo di primo livello del primo capitolo, con lo stile _cover_. Lo stile dà a quella sezione margini che spingono il testo al piede della pagina, toglie le testatine e disegna una grafica a piena pagina: un riquadro che riempie l’abbondanza con il colore notte, l’illustrazione di copertina come elemento immagine ancorato al bordo superiore dell’abbondanza, un occhiello in maiuscole dorate con un’ampia spaziatura tra le lettere, il titolo preso dal front matter in Fraunces a 88 punti, un breve filetto dorato, il sottotitolo in Lora corsivo e una riga di crediti al piede. L’occhiello e i crediti vengono da attributi del titolo, scritti sulla sua riga nel Markdown.

Le aperture di capitolo sono una grafica del primo livello di titolo. Un riquadro riempie la parte alta dell’abbondanza nel colore della parte; il numero del capitolo è stampato in grande sul bordo esterno, l’occhiello unisce la parola _Capitolo_, il numero e il titolo della parte, e sotto un breve filetto bianco vengono il titolo e l’introduzione del capitolo, presa dall’attributo \`lead\` del titolo. L’attributo \`summary\` dello stesso titolo è ciò che la pagina dell’indice stampa sotto ogni voce. Niente in queste grafiche è specifico di questo libro: qualsiasi configurazione può comporre le proprie.

## Slot grafici

Testatine, piè di pagina, aperture di capitolo e pagine di parte sono disegnati da **slot grafici**: piccole composizioni libere di testo, filetti, riquadri e immagini. Ogni elemento è ancorato alla pagina, all’abbondanza, alla gabbia del testo o a un altro elemento, con scostamenti e dimensioni in unità reali, e il suo testo può contenere **segnaposto** come \`{pageNumber}\`, \`{chapterTitle}\`, \`{partTitle}\` o qualsiasi attributo del titolo, come il \`{attr.lead}\` che compone l’introduzione sulla fascia di questo capitolo. Gli elementi si possono limitare alle pagine dispari o pari, e alle pagine di un certo ruolo (testo, apertura, parte o bianca), ed è così che le testatine di questo libro spariscono sulle aperture di capitolo mentre al loro piede compare un folio. Gli elementi di testo possono andare a capo, sillabare, troncarsi con un’ellissi, disegnare un riquadro dietro di sé e aprirsi con un capolettera.

Le testatine sono un normale slot grafico con elementi filtrati per parità e ruolo. Sui versi di questo libro, il folio nel colore della parte e il titolo del libro stanno sul bordo esterno; sui recti, il titolo del capitolo e il folio. Compaiono solo sulle pagine di testo; le aperture portano invece un folio al piede, e le pagine di parte non portano nulla. Anche la pagina nera di fronte a ogni pagina di parte è un elemento grafico: un riquadro che riempie l’abbondanza, mostrato solo sui versi bianchi, che, in un libro i cui capitoli si aprono sul verso e le cui parti si aprono sul recto, sono esattamente le pagine di fronte a una parte.

## Parti e palette

\`:::part\` apre una pagina di parte: una pagina a sé, che comincia con la parità chiesta dalla configurazione, disegnata dalla grafica delle parti e seguita da un corpo, di solito l’elenco dei suoi capitoli. Le parti si trasmettono in avanti, così le testatine e le aperture dei capitoli successivi possono nominare la parte a cui appartengono, e compaiono sia nell’indice sia nei segnalibri del PDF.

In questo libro ogni parte si apre su una doppia pagina: un verso tutto nero a sinistra, la pagina di parte a destra. Le parti cominciano con la parità _sempre dispari_, che mette un foglio bianco prima di ogni pagina di parte e ne aggiunge un secondo quando il capitolo precedente finisce su un verso, così la pagina di parte cade sempre su un recto con un verso bianco di fronte. Il primo capitolo della parte si apre poi sul retro della pagina di parte, su un verso, come ogni capitolo.

Una parte può anche ricolorare il libro. I colori della configurazione si possono collegare a voci con nome della **palette**, e l’attributo \`palette\` di una parte sostituisce quelle voci fino alla parte successiva. Questo libro definisce una voce, il _colore della parte_, e ogni parte lo imposta: blu per i fondamenti, oro antico per il mestiere, vermiglione per la pratica. Le fasce dei capitoli, i numeri dei titoli, i folio delle testatine e le didascalie lo seguono tutti.

## Un indice che si tiene aggiornato

\`:::toc\` stampa l’indice: una voce per ogni titolo dei livelli indicati e una riga per ogni parte, con numeri, titoli, puntini di guida, numeri di pagina e, facoltativamente, una riga presa da un attributo del titolo (in questo libro, il sommario di ogni capitolo). I numeri di pagina sono veri: il motore impagina il libro, legge dove è finito ogni titolo e ricompone l’indice finché i numeri non si assestano, il che richiede al massimo tre passaggi in più. Nel PDF le voci sono link.

## Interruzioni e numerazione delle pagine

\`:::pagebreak\` comincia una nuova pagina, e può chiederne una dispari o una pari, aggiungendo una pagina bianca quando serve. \`:::numbering\` cambia la sequenza dei numeri di pagina a partire dalla pagina successiva, ed è così che le pagine preliminari numerate in cifre romane passano ai numeri arabi al primo capitolo. Le aperture di capitolo possono chiedere una parità propria, e le pagine bianche sono riconosciute come tali, così le testatine le lasciano bianche. E dove un passo vuole un po’ più di aria sopra di sé, \`:::space\` lascia una riga vuota, o \`:::space{lines=2}\` due; le righe vuote in più nel Markdown non aggiungono nulla, come in qualsiasi Markdown.

:::part{number="III" title="In pratica" palette="band=#c0452f"}
7. Scrivere per Postext
8. La Sandbox
9. Output: canvas, HTML, PDF ed EPUB
10. Il libro in 3D
11. Roadmap e comunità
:::

# Scrivere per Postext {lead="Tutto questo libro è stato scritto in Markdown semplice, con una manciata di estensioni. Restano leggibili in qualsiasi editor di testo e dicono che cosa è il testo, mai dove va." summary="Markdown, direttive, riquadri e stili di paragrafo"}

I documenti Postext sono prima di tutto Markdown. Chi conosce il Markdown può scrivere per Postext fin dal primo giorno; le estensioni compaiono solo dove un libro ha bisogno di qualcosa per cui il Markdown non ha mai avuto parole.

## Markdown semplice

Titoli da uno a sei cancelletti, paragrafi, citazioni in blocco, elenchi puntati, numerati e di attività (annidati di due spazi per livello, fino a cinque livelli) e formule fuori testo tra doppi segni di dollaro. Nel corpo del testo, i soliti grassetto e corsivo, più l’apice tra accenti circonflessi, come in 10^-8^, il pedice tra tilde, come in H~2~O, la matematica in linea tra segni di dollaro e l’escape con la barra rovesciata per i caratteri letterali.

Conviene conoscere alcuni dettagli. Le righe consecutive di un paragrafo vengono unite, quindi gli a capo del sorgente non arrivano mai sulla pagina; un nuovo paragrafo richiede una riga vuota. Gli elenchi tollerano una sola riga vuota tra le voci, ma due righe vuote li chiudono. Gli elenchi numerati conservano il numero da cui partono, così un elenco può cominciare da 0 o da 5. E un titolo può forzare un a capo nel suo testo con due barre rovesciate, il che incide solo sui progetti grafici che stampano il titolo in grande (aperture e pagine di parte), mentre le testatine, l’indice e i segnalibri del PDF lo tengono su una sola riga.

Una parte del Markdown è lasciata fuori di proposito, perché un libro ha altri modi di dire le stesse cose: le immagini sono risorse anziché figure in linea, le tabelle sono risorse con un modello anziché tabelle disegnate con le barre verticali, e l’HTML grezzo non ha significato su una pagina stampata. I link sono attivi nella vista HTML e nel PDF; dare al codice in linea uno stile proprio è nella roadmap.

## Direttive e contenitori

Tutto il resto si esprime con un piccolo vocabolario di direttive, raccolte nella :ref{id="document-format"}. Le direttive di una riga cominciano con tre due punti e agiscono nel punto in cui compaiono. I contenitori racchiudono dei blocchi tra una riga di apertura con gli attributi e una riga di chiusura di tre due punti; si possono annidare, e uno rimasto aperto viene chiuso alla fine del capitolo, con un avviso.

I valori degli attributi si possono racchiudere tra virgolette doppie o semplici, o lasciare senza virgolette quando sono una sola parola, e una chiave da sola fa da flag. Una direttiva che il motore non conosce non viene scartata in silenzio: si stampa come un paragrafo, così nulla scompare, e il pannello **Verifiche** la segnala con il suo capitolo e la sua riga. Lo stesso accade con uno stile di riquadro o uno stile di paragrafo che la configurazione non definisce.

## Richiamare le risorse

I rimandi meritano uno sguardo più attento, perché è con loro che si scrive la maggior parte dell’apparato di un libro. \`:ref{id="…"}\` stampa per impostazione predefinita l’etichetta breve e il numero (_Fig. 5.1_ nell’edizione italiana di questo libro) e incorpora la risorsa la prima volta che compare. Un attributo \`style\` stampa il solo numero o l’etichetta completa, _Figura 5.1_; \`case\` porta l’etichetta in minuscolo, in maiuscolo o con l’iniziale maiuscola, perché un rimando a inizio frase si legga correttamente; e \`text\` stampa qualsiasi formulazione, pur incorporando la risorsa e collegandola. Un rimando a un id che non esiste stampa un punto interrogativo e un avviso, così i rimandi rotti si scoprono prima che il libro vada in stampa.

\`::resource{id="…"}\` su una riga a sé inserisce una risorsa esattamente in quel punto, quando la sua collocazione dice _qui_; altrimenti vale semplicemente come menzione. Questo libro non lo usa da nessuna parte e lascia flottare ogni figura, che di solito è la scelta migliore, perché così il motore trova a ciascuna un posto vicino alla sua menzione.

## Rimandi e citazioni

Lo stesso \`:ref\` richiama qualsiasi punto del libro che porti un identificatore: un titolo scritto \`## Metodo {#method}\`, un riquadro aperto con \`{#id}\` o un’espressione marcata \`[queste parole]{#key}\`. Stampa _sezione 3.2_ o _capitolo 4_, il titolo con \`style=title\` o la pagina con \`style=page\`, e la pagina è quella giusta perché il motore impagina di nuovo il libro finché non si stabilizza. Ognuno di questi rimandi è un link nel PDF, nell’HTML e in queste anteprime.

Le opere si citano come fa Pandoc: tra parentesi quadre, \`[@garcia2020, p. 33]\`, o dentro la frase, \`@garcia2020\`, con i riferimenti nell’intestazione YAML o in un blocco \`:::references\` in BibTeX. Lo stile di citazione è un’impostazione, non una proprietà del testo: APA, Chicago, MLA, IEEE, Vancouver, ISO 690, GB/T 7714 o uno stile tuo, scelto in **Grafica › Citazioni**, dove un’anteprima mostra il risultato. La bibliografia segue l’ultimo capitolo, oppure si colloca dove è scritto \`:::bibliography\`. La citazione di un’opera assente dai riferimenti si stampa così come è scritta e compare tra gli avvisi.

## Note a piè di pagina

Una nota si richiama con \`[^id]\` subito dopo la parola o la punteggiatura a cui si riferisce, e si scrive in qualsiasi punto del capitolo, come un paragrafo che comincia con \`[^id]:\`. Le note sono numerate nell’ordine del loro primo richiamo, ripartendo da uno in ogni capitolo; \`footnotes.numbering\` può numerarle di seguito per tutto il libro o farle ripartire a ogni pagina, come fanno i libri cinesi e arabi classici, e i numeri si possono stampare come cifre cerchiate o tra parentesi quadre. Una nota si compone al piede della colonna che contiene la riga in cui è richiamata, sotto un breve filetto, e la riga e la sua nota stanno sempre nella stessa colonna: quando la nota non ci sta, la riga si sposta insieme a lei. \`footnotes.placement: 'chapterEnd'\` raccoglie invece le note di un capitolo dopo il suo ultimo blocco. Un richiamo senza nota e una nota che nulla richiama vengono entrambi segnalati nel pannello **Verifiche**. Questa guida non ha note; tra i libri di esempio, _Il paradiso perduto_ ne porta ottocento, contrassegnate da lettere che ricominciano a ogni pagina.

## Un indice analitico in fondo al libro

L’indice analitico si scrive là dove il testo tratta ciascuna voce. \`:index[anemia]\` stampa la parola e la registra; \`:index{term="Cuore!valvole"}\` non stampa nulla e registra la pagina sotto una sottovoce. Un flag \`main\` mette la pagina in grassetto, \`range="start"\` e \`range="end"\` delimitano una trattazione che si estende su più pagine, e \`see\` e \`seealso\` scrivono i rinvii. \`:::index\` stampa l’indice nel punto in cui si trova, di solito sotto un titolo il cui stile lo compone su due colonne, e gli indici con un nome, dei nomi di persona o dei luoghi, convivono accanto a quello principale.

Il motore legge la pagina di ogni marca dopo l’impaginazione, così i numeri seguono il testo: aggiungi un paragrafo, sposta un capitolo o cambia il formato, e l’indice stampa le pagine nuove. Le voci sono ordinate secondo l’ordine alfabetico della lingua del documento e raggruppate sotto le loro iniziali, le pagine consecutive si uniscono in un intervallo e ogni numero è un link nel PDF. Un indice arabo ignora l’articolo _al-_ quando ordina, e uno cinese ordina secondo la lettura di ciascun carattere.

## Riquadri

\`:::callout\` compone un riquadro con un titolo facoltativo, in uno degli stili che la configurazione definisce. Questo libro ne definisce quattro: i riquadri _Provalo_ che ti mandano alla Sandbox, le note tecniche, le citazioni in evidenza composte in corsivo da titolo e un pannello scuro a tutta larghezza con i numeri chiave. Uno stile decide lo sfondo del riquadro, il bordo, la banda laterale e il raggio degli angoli, un’icona o un marcatore facoltativi, la tipografia del titolo, del corpo e degli elenchi, e dove va il riquadro: nel flusso, in testa o al piede di una colonna, a tutta pagina, nella colonna laterale di un’impaginazione a colonna e mezza, o fisso in una posizione della pagina.

Un riquadro lungo può dividersi tra i suoi paragrafi, o perfino tra le sue righe, tenendone almeno due da ciascuna parte; la continuazione omette il titolo. Dentro un riquadro, \`:::columns\` compone il contenuto in colonne bilanciate, come il pannello di numeri del capitolo 2.

Gli attributi di un riquadro possono scavalcarne lo stile per quel solo riquadro: un \`title\`, un \`placement\`, uno \`span\` di colonna, di pagina o laterale, e un \`label\` stampato in una linguetta nell’angolo superiore, come le etichette _Riquadro 1-1_ di un manuale. Gli stili possono anche fermare gli elementi flottanti al proprio bordo, così una figura citata dentro un riquadro non scappa mai oltre, e possono decidere se un riquadro troppo alto per la sua colonna debba dividersi o dare un avviso.

:::callout{type="note" title="Perché un vocabolario così ridotto"}
Ogni estensione risponde a una domanda che un libro pone e a cui il Markdown non sa rispondere: dove finisce una pagina, come si numerano le pagine, che cos’è una parte, quali paragrafi appartengono a un riquadro. Tutto ciò che riguarda il loro aspetto vive nella configurazione, così lo stesso testo si può comporre come tascabile o come rivista senza ritoccarne una riga.
:::

## La matematica nel sorgente

La matematica si scrive in notazione LaTeX. Le formule in linea vanno tra singoli segni di dollaro, nel mezzo di una frase; le formule fuori testo vanno tra doppi segni di dollaro, su una riga a sé o come blocco di più righe. Un segno di dollaro che deve stamparsi come tale si fa precedere da una barra rovesciata. Una formula mai chiusa, o che MathJax non riesce a leggere, viene segnalata nel pannello **Verifiche** e sostituita sulla pagina da un segnaposto rosso, così non può finire inosservata nel PDF.

## Stili di paragrafo

\`:::paragraphs{style="…"}\` applica uno stile di paragrafo con nome ai paragrafi che racchiude: un’epigrafe, una dedica, una bibliografia, un colophon. Uno stile può cambiare il carattere, il corpo, l’interlinea, il colore, l’allineamento (compresi il centrato e l’allineamento a destra), il rientro e la spaziatura. Il colophon sul retro della copertina di questo libro è uno di questi.

## Scrivere bene per il motore

Alcune abitudini rendono più facile il lavoro del motore e migliori le pagine. Introduci ogni elenco con una frase, così l’elenco non è mai la prima cosa sotto un titolo; il pannello **Verifiche** può segnalare quelli che lo sono. Tieni i titoli in ordine, senza saltare livelli. Cita ogni figura e ogni tabella nel testo, vicino a dove la vuoi: la menzione decide dove può andare la risorsa e quale numero riceve. Lascia la collocazione alla configurazione, a meno che una risorsa non abbia davvero bisogno di una posizione tutta sua. E scrivi un testo alternativo per ogni figura, perché il PDF accessibile lo offre a chi non può vedere l’immagine.

## L’intestazione YAML

I metadati di un libro stanno nell’intestazione YAML (il front matter) in testa al primo capitolo: titolo, sottotitolo, autore e data di pubblicazione, a disposizione di ogni slot grafico come segnaposto. La copertina di questo libro prende da lì il titolo e il sottotitolo. Qualsiasi altra chiave viene conservata per l’applicazione ospite; l’intestazione YAML dei capitoli successivi viene ignorata, con un avviso.

# La Sandbox {lead="La Sandbox è il motore con un editor intorno: la pagina che stai leggendo, il Markdown da cui viene e ogni impostazione che le ha dato forma, fianco a fianco e in diretta." summary="L’editor, i pannelli, i progetti, i preset e la condivisione"}

Tutto ciò che questo libro descrive si può provare subito, senza scrivere codice. La Sandbox non è una demo costruita sopra Postext; è il motore stesso, in un’interfaccia pensata per due pubblici insieme: chi sviluppa e sta valutando la libreria, e chi progetta e vuole vedere che cosa fa ogni opzione.

## Visita guidata dell’interfaccia

L’interfaccia segue la disposizione di un editor familiare, abbozzata nella :ref{id="sandbox-ui"}. Una **barra delle attività** a sinistra passa da un pannello all’altro tra sette: Libri, Capitoli, Testo, Risorse, Font, Grafica e Verifiche, quest’ultimo con il numero dei problemi aperti. Una **barra laterale** ridimensionabile ospita il pannello attivo; un clic sull’icona attiva la richiude. L’**area di visualizzazione**, a destra, mostra la stessa impaginazione in sei schede: Canvas, PDF, Folio, HTML, EPUB 3 e SCORM. L’interfaccia parla inglese, spagnolo, catalano, francese, tedesco, italiano, portoghese del Brasile, cinese semplificato, giapponese e arabo, e in arabo va da destra a sinistra; un’impostazione per pulsanti e campi grandi rende ogni comando più facile da raggiungere al tocco o con una mano poco ferma.

La barra laterale e l’area di visualizzazione si dividono la finestra, e il confine tra le due si può trascinare. Ogni pannello e l’area di visualizzazione ricordano il proprio stato da una visita all’altra: lo zoom e la modalità di visualizzazione del canvas, la modalità a colonne della vista HTML, i gruppi aperti nel pannello **Grafica**. Il tema e la lingua dell’interfaccia si cambiano dal piede della barra delle attività, e la lingua dell’interfaccia è indipendente da quella del libro.

## Modificare un libro

L’editor del pannello **Testo** evidenzia il front matter e la matematica, e la sua barra degli strumenti inserisce formattazione, elenchi, interruzioni di pagina e cambi di numerazione. In cima, un **selettore dei capitoli** passa da un capitolo all’altro del libro e ne mostra gli intervalli di pagine; ogni capitolo conserva la propria cronologia degli annullamenti e il proprio cursore. Editor e pagine restano allineati nei due sensi: un clic su una parola della pagina porta il cursore su quella parola nel Markdown, e selezionare del testo lo evidenzia sulla pagina. Il pannello **Capitoli** mostra il libro aperto nel suo insieme, con i capitoli in ordine e i loro intervalli di pagine.

L’editor tiene d’occhio anche il libro. Il suo menu dei capitoli elenca ogni capitolo con le pagine che occupa, non appena sono note, e passare a un altro capitolo sposta su di esso le anteprime. I capitoli si possono creare, rinominare, riordinare, dividere ai titoli di primo livello o unire al precedente, e il capitolo intero si può esportare come file Markdown o sostituire con uno.

## Configurazione

Il pannello **Grafica** modifica l’intera configurazione (più di cinquecento campi) per gruppi: pagina e colonne, sistema di scrittura, colori, tipografia, titoli e indice, elenchi, figure e tabelle, riquadri, esercizi, fumetti, intestazioni e piè di pagina, parti, esportazione, Folio (il libro in 3D) e impostazioni avanzate. Una casella di ricerca trova qualsiasi opzione per nome, e il filtro **Modificate** mostra ciò che differisce dai valori predefiniti. Ogni campo e ogni sezione si possono reimpostare singolarmente, e la configurazione si può esportare e importare come file.

## Le sei viste

La vista **canvas** è l’anteprima di lavoro: ingrandisce da un quarto delle dimensioni reali fino a quattro volte, adatta la pagina alla larghezza o all’altezza dell’area di visualizzazione e mostra pagine singole o doppie pagine, con la prima pagina da sola come recto, come si apre un libro stampato. La vista **PDF** genera un vero PDF nel browser e lo mostra nel visualizzatore del browser stesso, con i pulsanti per rigenerarlo, scaricarlo e stamparlo. La vista **Folio** mostra il libro rilegato e aperto su una scrivania, in tre dimensioni, con fogli che girano sotto la mano; ha un capitolo tutto suo, _Il libro in 3D_. La vista **HTML** mostra la stessa impaginazione come HTML posizionato, isolato dal resto della pagina, con un comando per la dimensione del testo e due modalità di lettura: una sola colonna che scorre, o tante colonne quante ne entrano nello schermo. La vista **EPUB 3** scrive il libro come e-book, nel browser, in uno di due layout: un **layout fisso** conserva le pagine stampate riga per riga, con testo vero che si può selezionare e cercare; un libro **a layout fluido** lascia che il testo si adatti allo schermo e alla dimensione dei caratteri scelti da chi legge. Un piccolo lettore dentro la scheda mostra il file che stai per scaricare: i tasti freccia, uno scorrimento sul telefono o i pulsanti ne girano le pagine, un elenco porta a qualsiasi capitolo, e un libro a layout fluido si può leggere in un corpo più grande o più piccolo. La vista **SCORM** raccoglie i capitoli e le sezioni che selezioni in un albero del libro in un corso per una piattaforma di apprendimento come Moodle, a pagine fisse o a layout fluido; i suoi esercizi inviano i punteggi alla piattaforma.

Le viste canvas, HTML e Folio possono impaginare il capitolo corrente o l’intero libro; il PDF ha una scelta propria, così un singolo capitolo si può controllare in bozza rapidamente mentre le anteprime mostrano il libro; l’EPUB e il pacchetto SCORM si impaginano sempre a partire dal libro intero. Questa guida si apre in modalità libro intero. Un libro composto in verticale, come l’edizione cinese di questa guida, si legge nella vista HTML solo pagina per pagina, perché un’unica colonna a scorrimento ne coricherebbe le righe su un fianco.

## Sul telefono

Sotto la larghezza di un tablet la Sandbox si riorganizza. La barra dei pannelli si sposta al piede dello schermo, un pannello aperto copre l’anteprima invece di affiancarla, e chiudendo il pannello si ritrova l’anteprima alla pagina che mostrava. Le barre degli strumenti delle anteprime si agganciano lungo il bordo inferiore, dove arriva il pollice, e vanno a capo su una seconda riga quando lo schermo è stretto. Un telefono non può mostrare un PDF dentro una pagina, quindi la vista PDF propone invece di aprire il file; e poiché un telefono concede a una scheda del browser meno memoria di quanta ne serva a un libro in tre dimensioni, lì la vista Folio non c’è.

## Risorse e font

Il pannello **Risorse** elenca le risorse del libro per tipo. Le immagini e i file SVG si possono trascinare dentro, le tabelle si modificano in un editor simile a un foglio di calcolo, con celle unite, riempimenti, immagini, larghezze di colonna e incolla da un foglio di calcolo, e il testo di un diagramma SVG si può modificare sul posto. Un clic su una didascalia, una nota, una cella o il testo di un diagramma nell’anteprima lo apre nel pannello. Il pannello **Font** aggiunge famiglie tue, peso per peso, nei consueti formati per il web e per il desktop; una famiglia personalizzata ha la precedenza su un Google Font con lo stesso nome.

Ogni risorsa ha una vista di dettaglio con il suo id, il tipo, la didascalia, la nota e il testo alternativo, la collocazione (posizione, estensione, rotazione, larghezza, allineamento e una didascalia a lato) e un’anteprima dal vivo. Quando elimini una risorsa che il testo cita ancora, ricevi un avviso. Il pannello **Font**, dal canto suo, verifica che ogni famiglia nominata dalla configurazione abbia i pesi e gli stili che le servono, e avvisa delle varianti mancanti o duplicate.

## Avvisi

Il pannello **Verifiche** elenca tutto ciò che il motore ha notato mentre componeva il libro: font che non si sono caricati, righe troppo spaziate, livelli di titolo saltati, contenitori non chiusi e direttive sconosciute, stili sconosciuti, segnaposto che non stampano nulla, risorse mancanti e riquadri troppo alti per la loro colonna. Ogni avviso indica il suo capitolo e la sua riga, e un clic ti porta lì.

## Progetti, preset e condivisione

Il tuo lavoro si salva nel browser mentre scrivi. I **progetti** sono libri conservati in locale, elencati sotto **I miei libri** nel pannello **Libri**, ognuno con nome, descrizione e immagine di copertina; si possono duplicare, esportare e importare. I **preset** sono libri in sola lettura da cui partire, elencati sotto **Libri di esempio**: questa guida e una galleria di edizioni dimostrative (una rivista di astronomia, un _Don Chisciotte_ illustrato, una rivista di ambiente, un catalogo di mostra, due manuali universitari, _Il sogno della camera rossa_ in cinese, _Le mille e una notte_ in arabo, rilegate a destra, e un _Paradiso perduto_ annotato con le tavole di Doré), ciascuna composta con un progetto grafico tutto suo. **Crea una mia copia** trasforma uno di questi in un tuo progetto.

I preset seguono la loro fonte. Quando il pacchetto di un preset cambia sul server, la Sandbox se ne accorge in pochi secondi: un preset mai toccato si ricarica da solo, e uno che hai modificato mostra un banner che propone di ricaricarlo, così il lavoro in corso non viene mai sovrascritto. I preset si possono nascondere dall’elenco e mostrare di nuovo, e ognuno si può aprire in una qualsiasi delle sue lingue quando ne ha più d’una, come questa guida, che esiste in inglese, spagnolo, catalano, francese, tedesco, italiano, portoghese del Brasile, cinese semplificato, arabo e giapponese.

Un libro viaggia come un unico file **.postext**: i suoi capitoli, la configurazione, le risorse e i font, più l’impaginazione già calcolata, così si apre già impaginato. Le ricette del Ricettario si aprono nella Sandbox allo stesso modo, come libri tuoi; una ricetta che hai già aperto ti chiede se aprire la tua copia, con le tue modifiche, o sostituirla con la versione pubblicata, che nel frattempo potrebbe essere stata corretta. E la barra degli indirizzi contiene sempre un permalink a ciò che stai guardando: il libro, la lingua, il visualizzatore, il capitolo e la pagina.

:::callout{type="try"}
Scorri fino a una pagina che ti piace e copia l’indirizzo dal browser: aprendo quel link vedrai lo stesso libro, nello stesso visualizzatore, alla stessa pagina.
:::

## Incorporare la Sandbox

La Sandbox è essa stessa un pacchetto, _postext-sandbox_, un componente React che qualsiasi applicazione web può incorporare. L’applicazione ospite decide il Markdown e la configurazione iniziali, la lingua dell’interfaccia e ogni etichetta, le fonti dei preset che offre, e il selettore del tema, il selettore della lingua e il link alla home che mostra. La Sandbox che stai usando è esattamente quel componente, incorporato nel sito di Postext.

Il componente pubblica inoltre nella pagina i suoi strumenti per gli agenti: un assistente che lavora nel browser può aprire un libro, modificarne il testo, cambiare la configurazione e leggerne gli avvisi con gli stessi comandi di chi scrive. Ogni strumento risponde con ciò che mostra l’interfaccia: le pagine a cui arriva ogni capitolo e gli avvisi del pannello **Verifiche**.

# Output: canvas, HTML, PDF ed EPUB {lead="Un albero, quattro output. Il canvas fa da anteprima, l’HTML si legge a schermo, il PDF va in stampa e l’EPUB arriva sul dispositivo di chi legge, e tutti si scrivono a partire dalla stessa impaginazione." summary="I renderer, il PDF accessibile, i libri EPUB e l’uso della libreria"}

Poiché ogni renderer legge lo stesso VDT, la promessa _ciò che vedi è ciò che ottieni_ va presa alla lettera: gli a capo, i confini di pagina e la posizione di ogni figura coincidono tra canvas, HTML e PDF, e un EPUB a layout fisso li conserva anch’esso. Un EPUB a layout fluido rinuncia di proposito alla pagina e conserva tutto il resto che l’impaginazione ha risolto: i numeri, le note, i rimandi e i numeri delle pagine stampate. La skill per agenti che porta in Postext libri già esistenti verifica il proprio lavoro con questi output, come mostra il :ref{id="skill-tutorial"}.

## Canvas

Il renderer canvas disegna una pagina su un canvas HTML, a qualsiasi risoluzione. Nella Sandbox è l’anteprima dal vivo, con zoom, adattamento alla larghezza o all’altezza, pagine singole o doppie pagine, e pagine disegnate solo quando entrano nella vista con lo scorrimento, così i libri lunghi restano reattivi.

Le immagini delle risorse si registrano presso il renderer una sola volta, per id di file, e si riusano in ogni pagina. Le pagine si possono disegnare su qualsiasi canvas e a qualsiasi scala, il che rende lo stesso renderer utile per miniature, anteprime di stampa ed esportazione di immagini: gli esempi dal vivo della documentazione disegnano una pagina e la trasformano in un PNG.

## HTML

Il renderer HTML restituisce HTML posizionato in modo assoluto, con CSS editoriale: ogni riga dove l’ha messa l’impaginazione, nel suo font esatto, nel suo corpo e sulla sua linea di base. Una variante indicizzata dice all’applicazione ospite quali parti della pagina sono cambiate, così un visualizzatore può aggiornare solo quelle. Nella Sandbox, la scheda HTML isola l’output in uno Shadow DOM e aggiunge una modalità di lettura con una sola colonna a scorrimento o tante colonne quante ne entrano nello schermo, con un comando per la scala del testo. Un insieme di modifiche valide solo a schermo può adattare il progetto grafico alla lettura su schermo senza toccare le pagine di stampa.

Il renderer accetta una funzione che trasforma l’id di file di una risorsa in un URL, così le immagini si possono servire da qualsiasi luogo, e un colore di sfondo per la pagina. Il suo output è semplice markup con CSS, senza script, il che lo rende adatto all’hosting statico, alle anteprime nelle e-mail o all’archiviazione lato server, una volta che l’impaginazione è stata calcolata in un browser.

## PDF

Il pacchetto _postext-pdf_ trasforma il VDT in un vero PDF, per un documento o per un libro intero. Non misura mai di nuovo: le metriche del canvas sono la fonte di verità e il PDF si limita a trasportarle, ed è per questo che le righe vanno a capo esattamente negli stessi punti. Incorpora font veri, un file statico per ogni peso, così il grassetto è grassetto e il corsivo è corsivo, e il testo resta selezionabile. Alle pagine aggiunge i segnalibri ricavati dai titoli e dalle parti, etichette di pagina che corrispondono ai numeri stampati, rimandi cliccabili, figure SVG vettoriali e la scelta dello spazio colore (RGB, CMYK o scala di grigi) per la stampa.

I font arrivano al PDF tramite un **fornitore di font**, una funzione che restituisce i byte di una famiglia in un dato peso e stile. Il fornitore della Sandbox scarica i file statici da Fontsource, uno per peso, e li decomprime dal WOFF2; i font personalizzati arrivano dal pannello **Font**. I byte delle risorse si consegnano allo stesso modo, per id di file. Il rendering riferisce i suoi progressi, gira in un worker tutto suo quando glielo si chiede, e accetta un libro intero come elenco di documenti di capitolo, producendo un solo PDF con etichette di pagina, segnalibri e link continui. Ci sono anche le pagine bianche che la parità dei capitoli richiede, così il PDF può andare in tipografia senza ritoccarne la paginazione, e ogni pagina conserva il numero che le dà il libro.

## Accessibile per impostazione predefinita

Ogni PDF è **taggato** per impostazione predefinita, secondo lo standard PDF/UA-1: un albero di struttura di titoli, paragrafi, elenchi, tabelle e figure in ordine di lettura, un testo alternativo per ogni figura, la lingua del documento, e gli elementi decorativi marcati come artefatti perché gli screen reader li saltino. L’accessibilità non è un’opzione di esportazione da ricordarsi di attivare; è il modo in cui il file è fatto.

Il tagging segue l’impaginazione anziché il sorgente. I paragrafi divisi tra colonne e pagine sono taggati come un unico paragrafo, gli elenchi tengono insieme le loro voci, le tabelle conservano le celle di intestazione, e le figure portano il loro testo alternativo (oppure la didascalia, o l’etichetta, quando non è stato scritto alcun testo alternativo). Il titolo e la lingua del documento viaggiano nei suoi metadati, le testatine e le decorazioni di pagina sono marcate come artefatti, e i rimandi tra il testo e le figure che cita sono link veri.

## Il colore per la stampa

I colori della configurazione si scrivono come valori esadecimali, eventualmente collegati alla palette, ed è ciò che il PDF disegna per impostazione predefinita. Per la produzione di stampa il PDF si può forzare in uno spazio colore: CMYK per la stampa offset o scala di grigi per i lavori a un solo colore. Insieme ai diagrammi a inchiostro singolo, un libro può passare da un’edizione a schermo a colori a un’edizione di stampa a un colore cambiando due impostazioni, senza toccare il testo né le figure.

## Libri interi

Il PDF di un libro non è una concatenazione di file separati. Il renderer riceve l’impaginazione di ogni capitolo e scrive un unico documento: le etichette di pagina proseguono da un capitolo all’altro, i segnalibri formano un solo albero con le parti sopra i loro capitoli, e la struttura accessibile dell’intero libro è un unico albero in ordine di lettura. Poiché ogni capitolo è stato impaginato come continuazione dei precedenti, le pagine del capitolo sette nel PDF del libro sono esattamente le pagine del capitolo sette stampato da solo.

La Sandbox offre entrambe le possibilità: la vista PDF si può alternare tra il capitolo corrente, per le bozze rapide, e il libro intero, per il file definitivo. Costruire il libro intero richiede più tempo, quindi avviene nel worker del PDF, che ne riferisce l’avanzamento pagina per pagina.

## I font nel PDF

Un PDF vale quanto i font che contiene. Postext incorpora ogni carattere usato dall’impaginazione (un file statico per peso e per stile), così una parola in grassetto è composta nel vero grassetto e una in corsivo nel vero corsivo, mai in un’imitazione inclinata o ingrossata. I font TrueType vengono ridotti ai soli glifi che il libro usa davvero, il che mantiene i file leggeri anche con quattro famiglie; i font OpenType con contorni PostScript si incorporano interi, perché alcuni visualizzatori non sanno leggerne i sottoinsiemi. Ogni font incorporato porta una mappa che riconduce i glifi ai caratteri, legature comprese, così copiando una frase dal PDF si ottiene la frase che era stata scritta, e una ricerca nel documento trova ogni parola.

Le famiglie arrivano da dove la Sandbox le ha trovate. I Google Font si scaricano un file alla volta da Fontsource e si decomprimono al volo; le famiglie caricate nel pannello **Font** si incorporano dai file che hai fornito. Una famiglia disponibile solo in WOFF non è accettata dal PDF, perché quel formato non si può incorporare in modo affidabile; i file WOFF2, TrueType e OpenType funzionano tutti.

## EPUB 3

Il pacchetto _postext-epub_ scrive un libro impaginato come file EPUB 3, il formato delle librerie digitali, delle biblioteche e delle app di lettura. Legge gli stessi documenti di capitolo del PDF di un libro intero, così numeri di pagina, note, citazioni, rimandi, sommario e indice analitico arrivano già risolti, e restituisce il file come byte, nel browser o in Node, senza server. EPUB definisce due versioni, messe a confronto nella :ref{id="epub-renditions"}, e il generatore produce l’una o l’altra a partire dalla stessa impaginazione.

Un **layout fisso** conserva la pagina stampata. Ogni pagina diventa un documento a sé, delle dimensioni della pagina, con il testo dove lo mette il PDF e nei font del libro, così colonne, elementi flottanti, testatine, aperture e ogni a capo sopravvivono. Il testo resta testo: si può selezionare, cercare e far leggere ad alta voce, e i link del libro funzionano da una pagina all’altra (rimandi, note, il sommario stampato e l’indice analitico). Le doppie pagine si accoppiano come in stampa, e un libro rilegato a destra, in arabo o in cinese verticale, si sfoglia da destra a sinistra. È adatto ai libri le cui pagine sono progettate come pagine, un libro illustrato, un manuale, un catalogo o una rivista, letti su uno schermo grande; su un telefono la pagina viene rimpicciolita e chi legge deve ingrandirla per leggerla.

## Libri a layout fluido

Un libro **a layout fluido** rinuncia alla pagina e conserva il testo. Ogni capitolo diventa un unico documento che il sistema di lettura ricompone per il proprio schermo, nel carattere, nel corpo e con i margini scelti da chi legge. Il generatore non torna al Markdown: ricostruisce ogni paragrafo dalle righe composte dal motore, togliendo i trattini aggiunti dagli a capo e tenendo quelli che appartengono alla parola, così un paragrafo diviso tra due colonne o tra due pagine torna a essere un solo paragrafo. Figure e tabelle seguono il testo che le cita, con le loro didascalie numerate e il testo alternativo; le tabelle restano tabelle vere, con righe di intestazione e celle unite; i riquadri diventano aside con i loro titoli; e le note rimandano alla fine del capitolo, con un link per tornare indietro. Ogni pagina stampata lascia un marcatore dove comincia il suo testo, così chi legge può trovare la pagina 112 dell’edizione stampata, e l’indice analitico punta a quei marcatori.

L’aspetto viene dalla configurazione. Un foglio di stile che ne deriva dà ai titoli, ai riquadri, alle tabelle, alle didascalie e agli elenchi i loro corpi e i loro colori, in proporzione al testo corrente, così la dimensione scelta da chi legge si riflette su tutto. I paragrafi composti in uno stile di paragrafo lo conservano, perché l’impaginazione registra quale stile ha composto ciascun blocco, e i livelli dell’indice analitico si distinguono allo stesso modo; un capitolo configurato diversamente, o una parte che ricolora il libro, aggiunge un secondo foglio con le sole regole che cambiano. Una citazione in evidenza ripete parole del testo, quindi si vede ma è nascosta agli screen reader e alla lettura ad alta voce, e le sue parole si leggono una volta sola. Il cinese verticale mantiene le sue righe verticali, e un libro arabo va da destra a sinistra.

Entrambe le versioni hanno la stessa navigazione: un sommario ricavato dai titoli e dalle parti, un elenco dei numeri delle pagine stampate e punti di riferimento per la copertina, il sommario stampato e l’inizio del testo. Ogni famiglia nominata dal progetto grafico viene incorporata, a meno che non sia contrassegnata come non ridistribuibile, e ogni immagine entra una sola volta. Entrambe portano i metadati di EPUB Accessibility 1.1, ed entrambe superano W3C EPUBCheck, il validatore che le librerie digitali applicano ai file che ricevono, senza errori né avvisi, per questa guida e per ogni libro di esempio. Nella Sandbox, la scheda **EPUB 3** scrive il file in un worker, così la pagina resta reattiva mentre si scrive un libro lungo. Tutto ciò che il file non può contenere, come un’immagine senza un file memorizzato, compare tra i suoi avvisi.

## Scegliere un output

I quattro output condividono l’impaginazione ma servono momenti diversi della vita di un libro. Il **canvas** è la vista di lavoro: veloce, fedele, ed è quella che la Sandbox tiene aperta mentre scrivi e progetti. L’**HTML** serve per leggere a schermo e per pubblicare dentro un’applicazione web: le stesse pagine come markup posizionato, o il testo ricomposto nelle modalità di lettura del visualizzatore, isolato dagli stili della pagina che lo circonda. Il **PDF** è il prodotto finito: il file che va in tipografia, in archivio o sul dispositivo di chi legge, taggato, con i segnalibri e ricercabile. L’**EPUB** è per i lettori di e-book e le librerie digitali: un layout fisso quando conta la pagina, un libro a layout fluido quando conta il testo.

Nulla obbliga a scegliere tra loro. Un libro si può scrivere nella Sandbox con il canvas aperto, essere rivisto nel visualizzatore HTML da qualcuno che legge sul telefono, andare in stampa come PDF e in una libreria digitale come EPUB nello stesso pomeriggio, dalla stessa fonte e con la stessa configurazione, senza che nessuno di essi si discosti dagli altri. Nessuna di queste uscite richiede una nuova impaginazione: leggono tutte la stessa VDT, e cambia solo il disegno finale.

## Usare la libreria

Il motore è distribuito su npm come _postext_, per l’impaginazione e i renderer canvas e HTML, con un pacchetto per ciascun output più pesante: _postext-pdf_ per il PDF, _postext-epub_ per l’EPUB 3 e _postext-folio_ per il libro in 3D. Sono tutti moduli ES con licenza MIT e si possono anche importare direttamente da un CDN. La documentazione include esempi dal vivo che trasformano una pagina in immagine, in HTML e in PDF, pronti per un fork.

Il motore di impaginazione gira nel browser, dove può misurare con i font che vede chi legge; anche _postext-pdf_ e _postext-epub_ girano nel browser, ma pure in Node, così un PDF o un EPUB si può produrre su un server a partire da un’impaginazione calcolata altrove. Un libro intero viaggia allo stesso modo: \`openBundle\` legge un file .postext, \`buildBundle\` ne impagina i capitoli in ordine, e il risultato va dritto a \`renderToPdf\` o a \`renderToEpub\`. I pacchetti sono solo moduli ES, con i tipi TypeScript inclusi, e alcuni bundler richiedono un’impostazione di una riga per il decodificatore WOFF2 usato dal pacchetto PDF. La documentazione percorre l’intero cammino, dall’installazione dei pacchetti al primo PDF, e nessun passaggio richiede la Sandbox. Le stesse funzioni girano anche in un worker, così una pagina web può impaginare un libro intero senza fermare l’interfaccia.

:::callout{type="note" title="Quattro passaggi"}
1. Carica i font nominati dalla configurazione, così il browser può misurarli
2. Costruisci il documento con \`buildDocument(content, config)\`
3. Disegna le sue pagine con \`renderPage\`, oppure trasformale in HTML con \`renderToHtml\`
4. Per la stampa, passa lo stesso documento a \`renderToPdf\` con un fornitore di font; per gli e-book, passa i capitoli a \`renderToEpub\`
:::

Il motore e il suo renderer PDF escono insieme, con lo stesso numero di versione, così i due concordano sempre sulla forma dell’impaginazione che condividono. Il generatore EPUB e il visualizzatore Folio hanno numeri di versione propri e indicano il motore come dipendenza peer, così un progetto li aggiorna insieme.

## Pagine come immagini, da uno script

Una pagina non ha bisogno di un browser per diventare un’immagine. Il renderer canvas disegna su qualsiasi canvas che parli l’interfaccia di disegno del browser, e in Node un canvas precompilato lo fa: impagina il libro, disegna la pagina e codificala come JPEG o PNG. È così che la skill per agenti che porta i libri in Postext guarda il proprio lavoro. Dopo ogni modifica alla configurazione o al testo impagina di nuovo il libro, disegna solo le pagine su cui sta lavorando e le legge come immagini, in un secondo o due, senza generare alcun PDF. Il PDF si costruisce alla fine, per le verifiche a cui solo un PDF può rispondere: font incorporati, immagini alla loro risoluzione, struttura taggata.

Il :ref{id="skill-tutorial"} mostra la skill dall’inizio alla fine: riceve il PDF di riferimento, i font e le illustrazioni originali, propone una scheda tecnica, compone il primo capitolo e verifica ogni pagina che compone.

# Il libro in 3D {lead="Un’impaginazione è un insieme di pagine, ma un libro è un oggetto: carta di una certa grammatura e di un certo colore, una rilegatura che si apre in un certo modo, uno spessore che la mano avverte. La vista Folio mostra le pagine come quell’oggetto, prima che si stampi qualcosa." summary="La vista Folio, le carte, le rilegature, le copertine e la luce"}

Le bozze a schermo sono piatte. Una doppia pagina vista come due rettangoli non dice nulla di come starà il libro aperto su una scrivania: se la piega della rilegatura inghiotte il margine interno, se una tavola su carta lucida cattura la luce, se trecento pagine di carta avorio fanno un blocco troppo spesso per la rilegatura. La vista **Folio** risponde a queste domande con le pagine che Postext ha già composto. Mostra il libro rilegato, aperto su una superficie, illuminato, con fogli che si curvano e girano sotto la mano.

Niente, in questa vista, è una seconda impaginazione. Le pagine sono quelle che dipinge il canvas, disegnate ai pixel esatti dello schermo, così il testo in Folio è nitido come nella vista Canvas e identico riga per riga. Ciò che Folio aggiunge è tutto quello che sta intorno alle pagine: la carta, la rilegatura, le copertine, la scrivania e la luce. Tutto questo viene da una sola parte della configurazione, \`folio\`, che l’impaginazione non legge mai. Cambiare la carta o la rilegatura ridisegna subito il libro e non sposta mai una riga.

## Girare le pagine

Una pagina si gira come si gira una pagina: prendila per il bordo e portala dall’altra parte. Se la lasci andare oltre la metà, ricade sull’altro lato; se la lasci prima, torna indietro. Anche un clic su una pagina la gira, in avanti sulla pagina di destra e indietro su quella di sinistra, e lo stesso fanno le frecce della barra degli strumenti e i tasti freccia, Pagina su e Pagina giù, Inizio e Fine quando il libro ha il focus. Il campo della pagina, nella barra degli strumenti, accetta un numero di pagina e porta il libro a quella doppia pagina.

Ogni foglio si piega secondo la sua carta. La sottile carta bibbia si arrotola in una curva stretta e lascia trasparire la stampa del retro; il cartoncino gira con un arco ampio; il cartone, come in un libro cartonato per bambini piccoli, gira come una lastra rigida sulla sua cerniera. Anche le copertine girano come piatti rigidi. Un salto di più di dieci pagine non le gira una a una: il blocco di pagine intermedio si solleva come un’unica lastra, spessa quanto quelle pagine, e si posa sull’altro lato.

Anche la vista si può muovere. Un trascinamento con il tasto destro del mouse ruota intorno al libro, fino a un angolo radente, per guardare il dorso, il taglio anteriore o lo spessore del blocco, e si può fare anche mentre alcuni fogli stanno ancora girando. La vista resta dove l’hai lasciata finché **Reimposta la vista** non la riporta all’angolo indicato dalle impostazioni. In una finestra stretta il libro mostra una pagina alla volta, girando comunque il foglio sopra il dorso; quando il sistema chiede di ridurre il movimento, le doppie pagine cambiano senza l’animazione del foglio.

Tre pulsanti della barra degli strumenti scelgono che cosa fa il puntatore sul libro: girare le pagine a mano, ruotare la vista (ciò di cui un trackpad o un tablet ha bisogno al posto del trascinamento con il tasto destro) oppure selezionare il testo. La selezione funziona sulle pagine così come si vedono, inclinate o ruotate, come nella vista Canvas: un clic mette il cursore nell’editor su quella parola, un trascinamento seleziona, un doppio clic prende una parola, e un link si segue. Funziona anche nell’altro senso: il cursore e la selezione dell’editor sono disegnati sulle pagine, e spostare il cursore su una pagina che non è in vista porta il libro fino a lei.

I video si riproducono sulla pagina. In modalità sfoglio, un clic sull’immagine di anteprima di un video lo avvia lì, e il video continua a scorrere mentre il foglio gira. Un altro clic lo mette in pausa, avviarne un altro ferma il primo, e un video si ferma quando il libro si posa su una doppia pagina che non lo mostra più. I video di YouTube e Vimeo non si possono disegnare dentro una pagina: un clic su uno di essi gira il foglio, e il video si apre nella sua pagina, dove si può guardare per intero.

:::callout{type="try"}
Apri la scheda Folio su questa guida, gira qualche pagina trascinandone gli angoli, poi ruota il libro trascinando con il tasto destro per vederne la piega con i punti metallici. Reimposta la vista lo rimette a posto.
:::

## Carta

La carta si sceglie come la ordinerebbe un tipografo: per **tipo**, il genere di carta, e per **grammatura**, il suo peso in grammi per metro quadrato. Ogni tipo porta con sé i valori che gli sono propri, elencati nella :ref{id="paper-stocks"}, e ognuno si può cambiare per conto suo: una carta usomano da 70 grammi anziché da 80, una carta non patinata in una tinta più calda.

Lo spessore deriva da due numeri. La **mano** di una carta, in centimetri cubi per grammo, dice quanto spazio occupa un grammo di quella carta; la grammatura moltiplicata per la mano dà lo **spessore** di un singolo foglio, in micrometri. Il blocco di un libro è il numero dei suoi fogli moltiplicato per quello spessore, ed è per questo che le stesse trecento pagine fanno un volume sottile su carta patinata e uno grosso su una carta usomano voluminosa. Folio conta l’intero libro, così un capitolo mostrato da solo sta comunque tra le pagine che lo precedono e lo seguono, al loro spessore reale.

La superficie ha tre impostazioni. La **finitura** dice se la carta è non patinata, con le sue fibre e senza lucentezza, oppure patinata e calandrata opaca, satinata o lucida, e allora riflette l’ambiente. La **texture** è il rilievo: liscia, la grana fine della pergamena, la trama uniforme della carta velina, le linee della carta vergata, una telatura goffrata o i segni irregolari del feltro; la sua intensità si può abbassare o alzare. La **tinta** è il colore della carta prima della stampa, bianco, naturale o avorio, e la **trasparenza** lascia apparire debolmente la stampa del retro sulla carta sottile, sempre meno man mano che la carta diventa più pesante e più opaca.

## Rilegature e copertine

Sono disponibili cinque rilegature. Un **cartonato** ha la copertina rigida, con i piatti leggermente più grandi delle pagine. Una **brossura fresata** ha il dorso fresato e incollato, e si apre meno piatta. Una **brossura cucita** tiene le segnature cucite sotto una copertina morbida e si apre più facilmente. Una rilegatura **lay-flat** si apre del tutto, senza che le pagine si incurvino verso il dorso. Un fascicolo **a punto metallico** è fatto di fogli piegati e graffati lungo la piega, come una rivista o un programma di sala, e non ha un dorso piatto. Un libro spesso si apre come si apre un libro spesso, con il dorso che si alza tra i due blocchi di pagine.

Le copertine vengono da una di due fonti. Per impostazione predefinita Folio disegna una **coperta** intorno alle pagine, in tela, cartoncino o pelle e nel colore della copertina. Quando il documento ha già le sue copertine, come questa guida, possono essere **le pagine stesse del documento**: la prima pagina diventa la copertina anteriore e l’ultima, quando cade su una pagina sinistra, la quarta di copertina. Il libro allora resta chiuso sulla copertina finché chi legge non lo apre, la copertina gira come un piatto rigido, e girare l’ultimo foglio richiude il libro.

Il dorso può portare un’immagine. Qualsiasi immagine o SVG del pannello **Risorse** si può stampare sul dorso, vista come si vede un dorso su uno scaffale, con la testa in alto e la copertina anteriore a destra; viene scalata per coprire tutto il dorso, quindi conviene che lasci un po’ di spazio ai bordi. Un fascicolo a punto metallico non ha un dorso su cui stampare. L’immagine viaggia con le risorse del libro nel suo file .postext, e compare ogni volta che la vista ruota fino al dorso.

## Tavole su un’altra carta

Spesso i libri cambiano carta per qualche pagina: una sezione di tavole a colori su carta patinata in un romanzo stampato su carta usomano, un divisorio in cartoncino, qualche foglio di carta colorata. In Postext è un contenitore nel testo:

:::callout{type="note" title="Una sezione di tavole"}
\`:::paper{type=coatedGloss grammage=130}\` apre la sequenza e \`:::\` la chiude. Tutto ciò che sta in mezzo si stampa su quella carta.
:::

Una carta copre fogli interi, così il contenuto della sequenza comincia su una nuova pagina e anche ciò che la segue comincia su una nuova pagina. Ogni pagina composta dentro la sequenza porta con sé la sua carta nell’impaginazione, e la vista Folio disegna quei fogli con il colore, la superficie, lo spessore e la rigidità di quella carta; canvas, HTML e PDF li compongono come qualsiasi altra pagina. Gli attributi omessi seguono la carta del libro, e una sequenza dentro un’altra sovrascrive solo ciò che imposta.

## La scrivania e la luce

Il libro poggia su una **superficie**: rovere, noce, lino, feltro, cuoio, marmo, un colore uniforme, o niente del tutto, il che lascia vedere lo sfondo della pagina. Ogni superficie è una texture fotografata, e una tinta può ricolorarle tutte. Cinque **luci** creano la scena: uno studio, la luce del giorno, una lampada da lettura, un cielo coperto e la notte. Ognuna è una coppia: l’ambiente che la carta patinata e lucida riflette quando un foglio gira, e una luce principale che proietta le ombre del blocco e di una pagina sollevata sulle pagine sottostanti. L’**esposizione** schiarisce o scurisce la scena, e le ombre si possono disattivare su un computer lento. L’**inclinazione** stabilisce quanto la vista si discosta dalla verticale, fino a settanta gradi, e la **rotazione** quanto gira intorno al libro; Salva come vista predefinita memorizza entrambe così come le vedi.

Questa guida è un fascicolo a punto metallico, su carta patinata lucida da 170 grammi, posato su un tappetino di feltro blu in luce da studio. Le sue copertine sono la sua prima e la sua ultima pagina, così si apre sulla copertina e si chiude quando gira l’ultimo foglio. Tutto questo si trova nel gruppo **Folio** del pannello **Grafica**, e nulla in quel gruppo cambia una sola riga delle pagine.

## Dove funziona Folio

Folio disegna con WebGL2, la grafica tridimensionale del browser, con una texture per ogni lato di ogni pagina dipinta. Dipingere solo le doppie pagine intorno a quella aperta riduce la memoria di un libro lungo a quella di poche pagine, ma un telefono concede comunque a una scheda del browser meno memoria di quanta ne serva a un libro, così la Sandbox offre la scheda Folio su computer e tablet e la omette sui telefoni e nei browser senza WebGL2. Su un telefono le altre viste restano: il canvas, l’HTML e l’EPUB si leggono nella pagina, e il PDF si apre nel lettore del sistema. Il libro non cambia per questo: sono le stesse pagine, e le sue impostazioni di carta e di legatura lo aspettano per il giorno in cui lo si apre su un computer o su un tablet, dove la scheda Folio c’è. Anche lì le pagine sono quelle della vista Canvas, riga per riga, e nessuna impostazione di Folio sposta una riga.

:::callout{type="note" title="Nel codice"}
Il visualizzatore è un pacchetto a sé, _postext-folio_, costruito su three.js. \`createFolioFromDocument(container, doc)\` mostra un documento impaginato come un libro; \`setDocument\` mostra l’impaginazione successiva nella stessa pagina, \`setAppearance\` cambia la carta, la rilegatura o la luce, e \`resetView\` riporta la vista all’inizio. \`createFolio\` fa lo stesso con qualsiasi insieme di immagini di pagina.
:::

Lo stesso pacchetto sfoglia le pagine delle ricette del Ricettario, e può stare in qualsiasi pagina web che voglia presentare un libro come un libro: il catalogo di un editore, una bozza inviata a un autore, un’anteprima prima che l’ordine parta per la tipografia.

# Roadmap e comunità {lead="Postext è giovane e aperto. La pipeline principale, il formato del documento e il sistema di configurazione sono già disponibili; ciò che viene dopo si decide in pubblico." summary="A che punto è il progetto e come partecipare"}

Postext non cerca di essere una piattaforma documentale universale. Punta a essere un ottimo motore di impaginazione editoriale per il web, e mantiene un perimetro ristretto perché il nucleo possa restare affilato. La sua ambizione a lungo termine è diventare il motore di impaginazione di riferimento per i contenuti editoriali sul web: qualcosa che editori, riviste, piattaforme di libri e team di sviluppo possano adottare e su cui possano costruire.

## A che punto è il progetto

Il lavoro è organizzato in quattro fasi, riassunte nella :ref{id="development-phases"}. Non sono traguardi rigidi; descrivono l’ordine in cui le funzionalità diventano abbastanza stabili per la produzione.

Le prime due fasi sono sostanzialmente complete: il modello dei dati, il parser e il livello di misurazione, il formato del documento, il motore delle colonne con il bilanciamento, gli elementi flottanti e le tabelle, e il meccanismo del libro fatto di capitoli, parti, indice e testatine. La terza fase ha consegnato il suo nucleo (divisione ottimale in righe con penalità editoriali, sillabazione in otto lingue, matematica, note a piè di pagina e note di fine capitolo, citazioni, un indice analitico, cinese e giapponese composti in orizzontale e in verticale, e arabo composto da destra a sinistra con giustificazione a kashida) e ha ancora aperte le note a margine. La quarta, l’output, ha prodotto canvas, HTML, un PDF taggato e libri EPUB 3, insieme al worker, alla Sandbox con i suoi preset e alla vista Folio, che mostra un’impaginazione come un libro stampato.

Ciò che ancora manca conta quanto ciò che è già disponibile. Le **note a margine** hanno un posto nel modello dei dati ma non vengono ancora impaginate. Il codice in linea non ha uno stile proprio, il testo non scorre ancora intorno agli ostacoli, il coreano si compone con le regole del cinese anziché con le sue, e l’impaginazione avviene solo nel browser. Sono questi i prossimi problemi da risolvere, e quelli in cui l’aiuto conta di più.

## Come partecipare

Il progetto vive su GitHub, e ogni conversazione avviene apertamente: le **issue** per bug, richieste e compiti concreti; le **pull request** per il codice, revisionate in pubblico; le **discussioni** per le idee, le questioni di progettazione e tutto ciò che non è ancora abbastanza concreto da diventare una issue. Le issue etichettate _good first issue_ sono il modo più facile per cominciare.

Il percorso abituale dall’idea al codice è breve: una issue descrive il problema, una discussione stabilisce l’approccio quando ce n’è più d’uno, una pull request lo implementa, e la modifica viene unita al ramo di sviluppo e rilasciata da lì. Aprire una issue prima di una pull request corposa fa risparmiare tempo a tutti, perché ci si può accordare sull’approccio prima di scrivere il codice.

## Dove l’aiuto conta

Ogni parte del progetto accoglie chi vuole contribuire. Il **motore** ha problemi profondi (divisione in righe, bilanciamento, numerazione, collocazione degli elementi flottanti) e altri più accessibili nei test e nei benchmark. Il **backend PDF** ha l’incorporazione dei font, la gestione del colore e l’accessibilità. La **Sandbox** ha i suoi pannelli, i suoi editor e le sue traduzioni, organizzate in modo che ogni stringa dell’interfaccia si aggiunga allo stesso modo in ogni lingua. La **grafica e la tipografia** hanno bisogno di persone che conoscano le tradizioni editoriali, soprattutto quelle delle scritture che il motore non serve ancora bene. E la **documentazione** e le sue traduzioni, oggi in inglese, spagnolo, catalano, francese, tedesco, italiano, portoghese del Brasile, cinese semplificato, giapponese e arabo, sono aperte a chiunque sappia spiegare le cose con chiarezza.

Il primo passo migliore è piccolo: leggi la guida per chi contribuisce nel repository, presentati nelle discussioni, scegli una issue etichettata _good first issue_ o traduci una pagina della documentazione.

La maggior parte dei contributi non richiede di scrivere codice:

- **Segnala i problemi** con un esempio minimo del documento e della configurazione
- **Condividi le tue impaginazioni**, e trasformale in preset da cui altri possano partire
- **Migliora la documentazione** con tutorial, esempi e spiegazioni
- **Traduci** l’interfaccia e la documentazione in nuove lingue
- **Porta competenze tipografiche**, soprattutto per scritture e tradizioni ancora poco servite
- **Contribuisci con il codice** al motore, ai renderer o alla Sandbox

## Che cosa resterà fuori

Ci sono cose che Postext di proposito non diventerà, e dirlo fa parte del mantenere onesto il progetto. Non sarà un elaboratore di testi: non è previsto di modificare la pagina direttamente, perché la pagina è il risultato delle regole, non il loro punto di partenza. Non gestirà i breakpoint responsive della sua applicazione ospite, perché quella decisione spetta all’applicazione. Non caricherà i font da solo, perché il caricamento dei font riguarda la pagina che lo incorpora. E non crescerà fino a diventare una piattaforma documentale generica, con archiviazione, collaborazione e flussi di pubblicazione, quando altri strumenti fanno bene queste cose e Postext può esservi incorporato.

Altre cose semplicemente non sono ancora state fatte. Impaginare su un server, senza browser, è un obiettivo successivo: oggi il motore misura con le metriche di un browser reale, e una versione per server avrebbe bisogno delle stesse metriche per produrre le stesse pagine. La collaborazione in tempo reale, cioè condividere una sessione dal vivo tramite un link, è nell’elenco delle idee per la Sandbox. Di entrambe si discuterà apertamente prima di scrivere una riga di codice.

## Licenza

Postext è pubblicato con **licenza MIT**: il motore, i generatori PDF ed EPUB, il visualizzatore Folio e la Sandbox si possono usare, modificare e incorporare in progetti aperti come in progetti chiusi, commerciali o no, purché la nota di licenza accompagni il codice. I caratteri di questo libro sono font aperti serviti da Google Fonts, i diagrammi fanno parte del sorgente della Sandbox, e il testo di questa guida appartiene al progetto e a chi vi ha contribuito.

## Valori

Tre valori guidano il progetto, e sono fatti per essere usati, non incorniciati: quando due buone idee tirano in direzioni diverse, sono il criterio con cui si sceglie.

_La cura del progetto prima della velocità._ La tipografia ha secoli di sapere accumulato, e il motore dovrebbe onorarlo anziché reinventarlo male. Una funzionalità arriva quando fa la cosa giusta su una pagina vera, non quando si limita a funzionare in una demo; una regola presa in prestito dalla stampa viene studiata nei libri che la usano prima di diventare un’opzione. Così alcune funzionalità richiedono più tempo. Quelle che escono non vanno ritirate.

_La chiarezza prima dell’astuzia._ Codice, configurazione e documentazione devono essere facili da leggere, da modificare e da spiegare. Un’opzione che richiede un paragrafo di avvertenze è il segno che il progetto non è ancora finito; una funzione che solo il suo autore sa seguire non sopravvivrà alle sue vacanze. La configurazione mantiene unità reali e nomi semplici, il formato del documento resta leggibile in qualsiasi editor, e le decisioni del motore si possono sempre ricondurre a una regola che qualcuno sa indicare.

_La collaborazione prima del territorio._ Le decisioni si prendono in pubblico, in issue e discussioni che chiunque può leggere e a cui chiunque può partecipare, e nessuna parte del codice appartiene a una sola persona. Ogni contributo viene riconosciuto (codice, documentazione, traduzioni, segnalazioni di bug, consigli tipografici e i libri di esempio che mostrano che cosa sa fare il motore), perché un motore di impaginazione per tutti può essere costruito solo da molte persone.

Se qualcosa di tutto questo ti parla, il repository è il passo successivo. Apri una issue, fai una domanda nelle discussioni, o cambia qualcosa in questo libro e guarda che cosa ne fa il motore.

:::paragraphs{style="signature"}
postext.dev · github.com/drnachio/postext
:::

# Quarta di copertina {style="back" toc="false" book="Postext" blurb="Postext compone il Markdown in libri, riviste e manuali, nel browser: ogni paragrafo diviso in righe come un tutto, colonne che finiscono alla stessa altezza, figure collocate dopo le parole che le richiamano, un PDF pronto per la stampa e un EPUB per gli e-reader. Ogni pagina di questa guida è stata composta da Postext stesso." licence="Open source · licenza MIT"}
`;
