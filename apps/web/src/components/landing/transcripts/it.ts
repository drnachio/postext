// The Italian cut of each narrated video, block by block.
import type { TranscriptBlock, TranscriptVideo } from "../transcripts";

export const TRANSCRIPTS_IT: Record<TranscriptVideo, TranscriptBlock[]> = {
  showreel: [
    {
      time: "0:00",
      scene: "Una scheda scura riporta «MAGONZA · 1455» sopra un sottile filetto dorato. Dietro il titolo «Per cinque secoli, la stampa ha imparato a comporre la pagina.», l’anno scorre da 1455 a 2026 in enormi cifre contornate, e attorno si posano termini di tipografia: Giustificazione, Crenatura, Vedove, orfane, Colonne bilanciate, Interlinea, Griglia di base, sil·la·ba·zio·ne, Giustezza, Flottanti, Testatine, Canali. La telecamera si tuffa nel punto finale, che inonda lo schermo d’oro.",
      narration: "Nel corso di cinque secoli, la stampa ha imparato a comporre la pagina.",
    },
    {
      time: "0:06",
      scene: "Titolo: «Il web ha imparato a impaginare interfacce. Non ha mai imparato a comporre una pagina.» Una finestra del browser aperta su example.com/longform/article contiene un articolo giustificato su tre colonne, «Perché il web fallisce»; etichette rosse segnalano canali di bianco, un’orfana, una vedova, un’immagine che cade sul testo e un’ultima colonna sbilanciata. Accanto, un riquadro di codice mostra «column-count: 3;», poi «…e poco altro.» e un elenco barrato degli stessi cinque difetti: Canali di bianco, Orfane, Vedove, Collisioni, Colonne sbilanciate. La finestra si disturba e crolla.",
      narration: "Il web ha imparato a impaginare interfacce. Mai pagine. Per questo il testo lungo continua a rompersi: canali di bianco, vedove, orfane, collisioni.",
    },
    {
      time: "0:19",
      scene: "Dopo un lampo bianco e una passata di strisce blu, oro e rosse, il logo e il nome di Postext salgono al loro posto con lo slogan «Il compositore programmabile per il web». Sotto: OPEN SOURCE · LICENZA MIT · v1.33.8 · FUNZIONA NEL TUO BROWSER.",
      narration: "Questo è Postext: il compositore programmabile per il web.",
    },
    {
      time: "0:25",
      scene: "Sezione 01 di 07, «Entra il contenuto»: «Il Markdown dice cos’è ogni cosa.» Un file Markdown, 03-perche-postext.md, si scrive da solo: una direttiva di parte, il titolo «Perché Postext» con un sommario, un paragrafo che rimanda alla figura fig-flow con :ref, una riga ::resource e un blocco :::callout. Accanto, config.ts chiama buildDocument con un’impaginazione a due colonne, il testo corrente giustificato e la sillabazione per \"it\", sotto la frase «La configurazione decide come appare. Il testo non contiene decisioni di impaginazione.»",
      narration: "Scrivi Markdown semantico, che dice che cos’è ogni cosa. La configurazione decide come appare.",
    },
    {
      time: "0:33",
      scene: "Sezione 02, «Pretext misura»: «Misurato senza toccare il DOM.» Un titolo, un paragrafo e un riquadro vengono scansionati uno dopo l’altro, e linee di quota ne danno l’altezza in punti; un pannello di codice mostra prepare(text, '25px Lora') e layout(prepared, width, 38), che restituiscono un’altezza e un numero di righe. Due barre gareggiano su 10.000 paragrafi: «Reflow del browser · DOM» si muove appena, mentre «Pretext · canvas + aritmetica» si riempie in un attimo, e un contatore sale fino a 600× sopra «più veloce del DOM nel misurare il testo, così un libro intero si ricompone mentre scrivi.» e «Basato su @chenglou/pretext».",
      narration: "Ogni paragrafo si misura senza toccare il DOM, fino a seicento volte più in fretta, grazie a Pretext, la libreria che l’ha reso possibile.",
    },
    {
      time: "0:44",
      scene: "Sezione 03, «Postext decide»: «Ogni riga al suo posto prima di disegnare un pixel.» Un anello di sette segmenti si accende a turno, Struttura, Misura, Collocazione, Flottanti, Rifinitura, Equilibrio e Ritmo, ognuno con una descrizione di una riga, mentre accanto si compone una pagina a due colonne della guida di Postext: blocchi etichettati volano nelle loro colonne, una figura scivola al suo posto sotto la nota «:ref{id=\"fig-flow\"} → piede della colonna», la fascia d’apertura scende, compaiono le righe, le colonne si pareggiano e una griglia della linea di base scorre dall’alto in basso. L’anello ripete le iterazioni da 1 a 3 e mostra «Stabile in 3 iterazioni» con un segno di spunta; un fumetto indica il riquadro di delimitazione e la linea di base di una riga.",
      narration: "Poi Postext decide. Sette passate collocano ogni riga, portano ogni figura al suo posto e bilanciano le colonne, finché nulla si muove più.",
    },
    {
      time: "0:57",
      scene: "Sezione 04, «Il documento virtuale»: «Cambia una parola. Si ricompone solo ciò che cambia.», con la nota «Come il virtual DOM di React, ma per le pagine: il VDT, un albero virtuale del documento.» Sette pagine, da p. 7 a p. 13, stanno in fila; un cursore segna una modifica a pagina 11, il resto di quella colonna diventa oro con la scritta DA RIFARE e un filo di testo trabocca a pagina 12, che riceve un segno di spunta e STABILE, mentre le pagine precedenti riportano SALTATA e quelle successive INTATTA. Tre punti enunciano la regola, e un pannello intitolato renderToHtmlIndexed() segna come AGGIORNATO i nodi modificati dell’albero del documento.",
      narration: "Tutto vive in un documento virtuale, come il virtual DOM di React. Cambi una parola, e si ricompone solo ciò che cambia.",
    },
    {
      time: "1:06",
      scene: "«Un documento lungo? Si disegna solo ciò che è sullo schermo.» Una colonna di pagine di libro scorre dentro una cornice dorata con la scritta VIEWPORT, con un margine di 200 pixel sopra e sotto: le pagine all’interno sono disegnate per intero, quelle all’esterno sono contorni tratteggiati. Un grande contatore mostra quante delle 51 pagine sono disegnate in quel momento (IntersectionObserver · +200 px), accanto a «Geometria: tutte le pagine. Pixel: solo ciò che vedi.»",
      narration: "E in un libro lungo, si disegnano soltanto le pagine che sono visibili sullo schermo.",
    },
    {
      time: "1:13",
      scene: "Sezione 05, «Giustificazione Knuth–Plass»: «Tutti i modi di dividere il paragrafo. Insieme.» A sinistra, sotto «Greedy · il browser», un paragrafo sulla divisione in righe è composto in modo greedy, come fa un browser, e le sue righe più larghe diventano rosse. Sotto, ogni parola diventa un punto su una linea: archi rossi segnano gli a capo greedy, tenui archi blu provano ogni a capo possibile e un percorso dorato sceglie l’insieme migliore. A destra, la versione «Knuth–Plass · Postext» ha una spaziatura uniforme, con i demeriti di ogni riga, la formula «(1 + badness + penalità)²» e un totale di demeriti più basso.",
      narration: "Un browser spezza le righe in modo ingordo, una alla volta. Postext usa Knuth-Plass, l’algoritmo di TeX: soppesa tutti i modi di spezzare l’intero paragrafo e tiene il più uniforme.",
    },
    {
      time: "1:28",
      scene: "Sezione 06, «Un’impaginazione, cinque output»: «Ciò che vedi è ciò che va in stampa.» Sotto la riga di codice const vdt = buildDocument(content, config); una pagina si divide in cinque. Canvas (renderToCanvas(), bitmap esatte al pixel) riceve una lente d’ingrandimento sulla sua griglia di pixel; HTML (renderToHtml(), selezionabile e responsive) vede ogni blocco contornato ed etichettato <h1>, <p>, <figure> e così via; PDF (renderToPdf(), per la stampa, PDF/UA, CMYK) fa scivolare quattro lastre di colore fino al registro, poi compaiono i segni di taglio e una scala colori. EPUB 3 (renderToEpub(), e-book, fisso o fluido) mostra la pagina in un lettore di e-book con l’etichetta «Layout fisso»; lo schermo si restringe alle dimensioni di un telefono, il testo si ricompone e l’etichetta diventa «Layout fluido». Folio (postext-folio, un libro 3D che si sfoglia) apre la pagina in una doppia pagina e gira un foglio sopra il dorso.",
      narration: "Un’impaginazione, cinque output: canvas, HTML, PDF per la stampa, EPUB 3, fisso o fluido, e un libro in 3D. Quello che vedi è quello che va in stampa.",
    },
    {
      time: "1:43",
      scene: "Sezione 07, «Perché uno standard aperto»: «LaTeX ha fatto scuola sulla carta. Oggi l’editoria vive anche su ogni schermo.» Due schede: LaTeX, 1984, con delle croci accanto a «Pensato per la pagina stampata», «Legato ai font e ai pacchetti di una macchina», «Compilare, aspettare, ripetere» e «Niente impaginazione editoriale nel web responsive»; Postext, 2026, con dei segni di spunta accanto a «Web, PDF per la stampa ed EPUB 3, un’impaginazione», «Un solo file .postext contiene tutto», «Si ricompone dal vivo mentre scrivi» e «In ogni browser · senza server · MIT». La scheda di Postext si illumina.",
      narration: "LaTeX ha fissato lo standard della carta. Ma oggi l’editoria vive su tutti gli schermi.",
    },
    {
      time: "1:50",
      scene: "Occhiello «Un file, l’intero libro», titolo «Uno standard aperto per l’editoria, oltre i confini di LaTeX.» L’icona di un file .postext si apre in cinque parti: preset.json (configurazione e grafica), chapters/*.md (un Markdown per capitolo), fonts/*.woff2 (i font stessi), images/ · SVG (ogni immagine, inclusa) e resources (tabelle, figure e didascalie). Didascalia: «Un normale ZIP: aperto, documentato e con licenza MIT. Qualsiasi strumento può leggerlo e scriverlo.»",
      narration: "Postext è uno standard aperto: un unico file portabile, documentato e con licenza MIT, che qualunque strumento può leggere e scrivere.",
    },
    {
      time: "2:02",
      scene: "«La vetrina · composta dal vero motore»: un muro di pagine dell’edizione italiana della guida si allontana in prospettiva mentre un contatore arriva a 51 pagine. Testo: «11 capitoli, 3 parti e le copertine, impaginati in meno di un secondo. Ogni pagina della guida di Postext, calcolata in un browser da postext v1.33.8 per questo video. Nulla messo a mano.» Seguono le etichette Libri di testo, Riviste, Edizioni letterarie, Cataloghi.",
      narration: "Per questo riesce a impaginare libri di centinaia di pagine in pochi decimi di secondo.",
    },
    {
      time: "2:10",
      scene: "Scheda finale: il logo di Postext con lo slogan «Il compositore programmabile per il web», l’indirizzo postext.dev, una riga di terminale che digita «$ pnpm add postext», e il piede «Open source · MIT · github.com/drnachio/postext».",
      narration: "Postext. Open source, su postext.dev.",
    },
  ],
  tutorial: [
    {
      time: "0:00",
      scene: "Scheda del titolo: il logo di Postext, l’occhiello «Tutorial · 5 passi» e il titolo «Trasforma la tua pubblicazione in Postext con un agente di IA. Senza codice.»",
    },
    {
      time: "0:03",
      scene: "«La tua pubblicazione esiste già.» Tre copertine arrivano una dopo l’altra, ognuna con la sua etichetta: un libro, Pinocchio di Carlo Collodi, etichettato InDesign (IDML); un manuale, le istruzioni per l’uso del bollitore elettrico Verra W1, etichettato Word (DOCX); e una rivista, FALLOW, etichettata PDF. Si raccolgono a sinistra, una freccia dorata tratteggiata attraversa un badge «Agente di IA» e compare l’icona di un file chiamato mio-libro.postext, sotto «Un agente la trasforma in Postext. Cinque passi. Poche richieste scritte bene.»",
      narration: "Hai già una pubblicazione: un libro, un manuale, una rivista. Vive in InDesign, in Word, oppure in un file PDF. In questo tutorial, un agente di intelligenza artificiale la trasformerà in Postext per te. Senza programmare: cinque passi e qualche richiesta scritta bene.",
    },
    {
      time: "0:24",
      scene: "«Il piano»: cinque schede numerate compaiono man mano che ogni passo viene nominato: 01 Prepara la cartella, 02 Raccogli gli originali vettoriali, 03 Aggiungi un riferimento, 04 Chiedilo all’agente, 05 Verifica nella Sandbox.",
      narration: "Il piano: preparare la cartella, raccogliere gli originali vettoriali, aggiungere un riferimento, chiederlo all’agente e verificare il risultato.",
    },
    {
      time: "0:35",
      scene: "Passo 01, la cartella: «Un progetto, una cartella.» Una grande cartella, mio-libro/, fluttua tra dieci file sparsi come MinionPro-Regular.otf, copertina.jpg, fig-2-1.ai, capitolo-01.docx, mappa.svg, libro.idml e grafico.pdf. Si apre una finestra sull’albero della cartella e ogni file vola nella sua sottocartella man mano che viene nominato: riferimento.pdf (come deve apparire → passo 03), font/ (Minion Pro, Myriad…, .otf .ttf .woff2), immagini/ (fotografie, .jpg .png), illustrazioni/ (originali vettoriali, .ai .svg .pdf) e testi/ (Word, InDesign IDML…).",
      narration: "Primo passo: riunisci tutto in un’unica cartella sul tuo computer. Un progetto, una cartella. Dentro, dai a ogni tipo di materiale la sua sottocartella: i font, le immagini, le illustrazioni e i testi.",
    },
    {
      time: "0:50",
      scene: "La riga font/ viene evidenziata e una scheda intitolata «Font» mostra una grande «Aa», gli stili Tondo, Corsivo e Grassetto, i formati OTF, TTF e WOFF2, e la nota «Si possono usare solo quelli che includi.» Poi «Più è ordinata, meno deve indovinare.», mentre ogni sottocartella dell’albero riceve un segno di spunta.",
      narration: "Non dimenticare i font: sono la voce del progetto grafico, e l’agente può usare solo quelli che includi. Quanto più ordinata sarà la cartella, tanto meno l’agente dovrà indovinare.",
    },
    {
      time: "1:02",
      scene: "Passo 02, gli originali vettoriali: «Raccogli gli originali.» Uno schema, un grafico e una mappa vengono disegnati al tratto, con i punti di ancoraggio in vista, e compaiono tre icone di file: .ai Illustrator, .svg SVG e .pdf PDF.",
      narration: "Secondo passo: se le tue illustrazioni sono vettoriali, come schemi, grafici o mappe, cerca i file originali: Illustrator, SVG o PDF.",
    },
    {
      time: "1:13",
      scene: "Due pannelli mostrano la stessa figura, uno schema in cui Manoscritto e Modello puntano entrambi a Pagine, con la didascalia «Fig. 2.1 Contenuto e grafica si incontrano.» A sinistra, «Ritagliata dal PDF: una foto del disegno» diventa sfocata e quadrettata man mano che la vista si ingrandisce; a destra, «L’originale: il disegno stesso» resta nitida. Il pannello di sinistra svanisce, le etichette dell’originale vengono riscritte in inglese (Manuscript, Template, Pages), i segni di taglio la incorniciano e tre segni di spunta indicano «Nitida a ogni dimensione», «Etichette come testo vero» e «Originale → stampa».",
      narration: "Una figura ritagliata dal PDF finale è poco più di una foto del disegno. L’originale è il disegno stesso. Con l’originale, l’agente ricompone ogni figura: nitida a qualsiasi dimensione, con le etichette come testo vero, pronte da tradurre. E in stampa, l’originale va così com’è.",
    },
    {
      time: "1:34",
      scene: "Passo 03, il riferimento: «Mostra come deve apparire.» Nell’albero della cartella, riferimento.pdf viene evidenziato ed etichettato «Nella radice»; ne esce una pagina che diventa una grande pagina di libro a due colonne con la scritta riferimento.pdf.",
      narration: "Il terzo passo è essenziale: nella radice della cartella, metti un file che mostri con chiarezza come deve apparire il prodotto finale. L’ideale è un PDF.",
    },
    {
      time: "1:45",
      scene: "Sulla pagina compaiono delle misure: i contorni delle colonne, un’intercolonna di 9 mm, un margine di 20 mm, le etichette del titolo (Fraunces 28 pt), del testo (Lora 9,4/13,6 pt) e di un riquadro (fondo, 1 filetto), e le linee di base con un’interlinea di 13,6 pt. Un file, scheda-tecnica.md, si riempie: pagina 210 × 280 mm; margini 24 · 20 · 22 · 20 mm, speculari; 2 colonne, intercolonna 9 mm; griglia di base 13,6 pt; testo Lora 9,4 / 13,6 pt, giustificato; titoli Fraunces 28 pt · Geist; aperture con una fascia di colore di 101 mm; riquadri con fondo e filetto a sinistra. Poi la parola «Indovinare» viene barrata e «Misurare.» si accende in oro.",
      narration: "L’agente legge la grafica in quelle pagine: misura margini, colonne, font e spaziature, e li annota come regole di impaginazione. Senza riferimento, dovrebbe indovinare. Con il riferimento, misura.",
    },
    {
      time: "2:00",
      scene: "Passo 04, l’agente: «Chiediglielo con parole tue.» Si apre una finestra intitolata «Agente · ~/mio-libro» accanto ai badge Claude Code, Codex e «o qualsiasi altro agente». Si scrive un messaggio firmato TU: «Installa la skill di Postext: `npx skills add drnachio/postext --skill postext-port`», e l’agente risponde «✓ Skill installata: postext-port». Una scheda della skill postext-port elenca «Un metodo collaudato», «Tutto su Postext» e «Strumenti per verificare il proprio lavoro».",
      narration: "Quarto passo: apri il tuo agente, Claude Code, Codex o quello che usi, in quella cartella, e chiedigli di installare la skill di Postext. Una skill è un pacchetto di competenze da esperto. Questa insegna all’agente a convertire una pubblicazione in Postext, e gli dà gli strumenti per controllare il proprio lavoro.",
    },
    {
      time: "2:21",
      scene: "Si scrive la richiesta successiva: «Usa la skill postext-port per convertire questo libro in Postext. La grafica è in riferimento.pdf, i font in font/ e le illustrazioni originali in illustrazioni/: usale invece di ritagliare le figure dal PDF. Comincia solo dal capitolo 1 e mostrami la scheda tecnica prima di costruirlo.» Accanto, riferimento.pdf, font/ e illustrazioni/ si accendono nell’albero della cartella man mano che la richiesta li nomina, e spunta una scheda con la scritta «Cap. 1».",
      narration: "Poi chiedigli quello che vuoi, con parole tue. Digli dove sono il riferimento, i font e gli originali, e di cominciare da un solo capitolo.",
    },
    {
      time: "2:34",
      scene: "Una griglia di dodici pagine di libro attenuate; la prima è contornata d’oro. Una freccia circolare conta su di essa i giri di rifinitura finché compare un segno di spunta, poi si accendono le altre undici. Sotto: Capitolo di prova → Rifinire → Estendere.",
      narration: "Se il contenuto è lungo, comincia da un capitolo di prova. Rifiniscilo finché non è perfetto, e soltanto allora estendilo al resto.",
    },
    {
      time: "2:43",
      scene: "L’agente chiede «Copia fedele o restyling?», «Quali lingue?» e «Carta, schermo o entrambi?». Una lista di controllo scorre Fare l’inventario, Misurare la grafica, Estrarre il testo, Font e immagini, Confrontare le pagine e Impacchettare il file, e compare il file mio-libro.postext. Si scrive una terza richiesta: «Il capitolo 1 è approvato. Converti gli altri capitoli con la stessa grafica, confronta ognuno con riferimento.pdf e impacchetta tutto in un unico file .postext.» L’agente risponde «✓ 12 capitoli · 0 avvisi · mio-libro.postext».",
      narration: "L’agente ti farà qualche domanda: copia fedele o nuova grafica, quali lingue, carta o schermo. Poi misura, estrae, assembla e verifica, e ti consegna un file Postext. Quando il capitolo di prova è a posto, estenderlo a tutto il libro è solo una richiesta in più.",
    },
    {
      time: "3:06",
      scene: "Passo 05, la Sandbox: «Verificalo pagina per pagina.» Una finestra del browser digita l’indirizzo postext.dev/it/sandbox. Il puntatore fa clic su Libri nella barra laterale, poi su Nuovo, poi su «Apri un file .postext…»; il file arriva in volo, «Il mio libro, 12 capitoli · 184 pagine» compare in cima all’elenco e le sue prime pagine si aprono nella vista Canvas; le schede delle viste riportano Canvas, HTML, PDF, Folio ed EPUB 3.",
      narration: "Quinto passo: apri la Sandbox di Postext, su postext.dev. In Libri, scegli Nuovo e apri il tuo file.",
    },
    {
      time: "3:15",
      scene: "La pagina di riferimento e la pagina di Postext stanno una accanto all’altra, etichettate Riferimento e Postext, e una linea dorata le percorre dall’alto in basso. Il pannello Verifiche si apre con un badge a 3 ed elenca Vedova (p. 4), Riga lasca (p. 7) e La figura non entra (p. 9); dei riquadri rossi segnano ogni problema sulla pagina di Postext.",
      narration: "Controllalo pagina per pagina accanto al tuo riferimento. Il pannello Verifiche ti segnala i problemi: vedove, righe lasche, figure che non ci stanno.",
    },
    {
      time: "3:26",
      scene: "Due file di pagine in wireframe, «Riferimento · PDF» e «Postext · fluido». Nella fila fluida, una figura passa dalla prima pagina alla cima della seconda, e una linea tratteggiata collega le sue due posizioni. Testo: «Le stesse regole, non le stesse pagine. Il contenuto scorre: una figura o un salto pagina possono cadere altrove.» Poi un segno di uguale unisce ogni coppia di pagine sotto «Ciò che deve coincidere»: Margini e griglia di base, Tipografia, Stile di figure e riquadri, Pagine pulite: niente vedove, colonne bilanciate. Un pannello rosso con il segno ≠ dice «Scelte artigianali a mano» e, sotto, «non sono regole: non valgono per un contenuto che cambia».",
      narration: "Tieni presente una cosa: le pagine non devono essere identiche a quelle del PDF. Postext ha capito le regole di impaginazione e ora il tuo contenuto è fluido, quindi una figura o un salto pagina possono cadere altrove. Ciò che deve coincidere è la qualità: gli stessi valori di produzione. Quando impaginiamo a mano, prendiamo piccole decisioni artigianali che non sono regole. E solo con le regole si può impaginare un contenuto che cambia.",
    },
    {
      time: "3:56",
      scene: "Torna la finestra dell’agente con una quarta richiesta: «Nella Sandbox, capitolo 2, pagina 7: il riquadro “Ricorda” si spezza su due colonne e manca la testatina. Verifiche segnala 3 righe lasche. Correggilo e impacchetta di nuovo il file.» È allegata una schermata, schermata-cap2-p7.png. Poi un ciclo tra Sandbox (verificare) e Agente (correggere) percorre i giri da 1 a 3 mentre il numero di avvisi scende da 3 a 0, e termina con un segno di spunta e «Perfetto.»",
      narration: "Poi racconta all’agente quello che vedi, con la massima precisione: il capitolo, la pagina e che cosa non va. Una schermata aiuta. Apri la nuova versione, controlla di nuovo e ripeti. A ogni giro ci si avvicina, finché non è perfetto.",
    },
    {
      time: "4:15",
      scene: "«Non solo una versione Postext.» Il file mio-libro.postext si divide in due lungo una linea dorata. A sinistra, Contenuto (che cosa dice): chapters/it/02-la-cellula.md, con il titolo «La cellula», una frase che rimanda alla figura fig-celula e un riquadro «ricorda». A destra, Forma (come appare): un «modello · ricavato dal tuo originale», con pagina di 210 × 280 mm speculare, 2 colonne con un’intercolonna di 9 mm, testo Lora 9,4/13,6 giustificato, titoli in Fraunces numerati, riquadri «ricorda» con fondo e filetto, e figure in testa alla colonna.",
      narration: "E il bello è questo: non hai solo il tuo contenuto in Postext. Hai separato il contenuto dalla forma. Il testo vive in capitoli puliti; la grafica, in un modello con le regole di impaginazione dedotte dal tuo originale.",
    },
    {
      time: "4:30",
      scene: "Si accendono i chip Correggere, Ampliare e Tradurre sopra una fila di pagine di libro: una riga viene evidenziata e un riflesso attraversa le pagine, scivolano dentro altre due pagine, e le pagine si girano sull’edizione inglese. Si scrive una richiesta: «Aggiungi un’edizione in inglese: traduci i capitoli, le didascalie delle figure e le etichette degli schemi, e mantieni la stessa grafica.» Didascalia: «Stesse regole. Contenuto nuovo. Le pagine si compongono da sole.» Poi «Un file, l’intero libro.»: un’icona .postext si dirama verso una pagina con i segni di taglio (PDF per la stampa), un lettore di e-book con il testo ricomposto sul suo schermo (Libro EPUB), una finestra del browser (Lettore web) e una coppia di pagine (Ogni pagina, composta).",
      narration: "Così, quando il tuo contenuto cambierà, quando lo correggerai, lo amplierai o lo tradurrai, non dovrai preoccuparti dell’impaginazione. Postext lo ricompone con le stesse regole. Un solo file per tutto il libro: un PDF pronto per la stampa, un libro digitale EPUB, un lettore per il web e pagine che si compongono da sole.",
    },
    {
      time: "4:54",
      scene: "Scheda finale: il logo di Postext, lo slogan «Il compositore programmabile per il web», postext.dev, una pillola con la scritta «I prompt di questo video sono nella descrizione ↓» e il piede «Open source · MIT · github.com/drnachio/postext».",
      narration: "Postext. Open source, su postext.dev. Trovi i prompt di esempio nella descrizione.",
    },
  ],
};
