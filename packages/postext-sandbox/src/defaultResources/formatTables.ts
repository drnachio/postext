// The tables of the document format's extensions and of the Folio paper
// stocks (#1276: split out of index.ts).
import type { TableModel } from 'postext';
import type { GuideLang } from './lang.js';
import { table } from './featureTables.js';

export function documentFormatTableModel(lang: GuideLang): TableModel {
  if (lang === 'ar') {
    return table(
      ['الصيغة', 'ما تفعله'],
      [
        ['`:::pagebreak`', 'صفحة جديدة؛ `parity="odd"` أو `"even"` تطلب صفحة فردية أو زوجية'],
        ['`:::columnbreak`', 'تُنهي العمود الحالي'],
        ['`:::space`', 'سطر فارغ؛ `lines=2` تترك سطرين'],
        ['`:::numbering`', 'تبدّل تسلسل أرقام الصفحات: الصيغة والبداية'],
        ['`:::toc`', 'تطبع فهرس المحتويات بأرقام صفحات حقيقية'],
        ['`:::part`', 'تفتح صفحة جزء بعنوان ورقم ولوحة ألوان'],
        ['`:::callout`', 'إطار بأحد أنماط الإطارات: ملاحظة، اقتباس، أرقام…'],
        ['`:::columns`', 'أعمدة متوازنة داخل إطار'],
        ['`:::paragraphs`', 'تطبّق نمط فقرة على ما تحيط به'],
        ['`:::paper`', 'صفحات مطبوعة على ورق آخر، يعرضها عارض Folio'],
        ['`:ref`', 'تذكر موردًا، فترقّمه وتجعله يطفو'],
        ['`::resource`', 'تُدرج موردًا في النقطة نفسها'],
        ['`:swatch`', 'عيّنة لون داخل السطر'],
        ['`[^id]`', 'علامة حاشية؛ و`[^id]:` تفتح نصها'],
        ['`:index`', 'تُدرج مصطلحًا في الفهرس الأبجدي'],
        ['`:::index`', 'تطبع الفهرس الأبجدي بأرقام صفحات حقيقية'],
        ['`:::verse`', 'قصيدة عمودية، يفصل `||` بين شطري البيت'],
        ['`:::page` · `::panel`', 'صفحة قصة مصوّرة تقسّمها `split` إلى إطارات، ويحمل كل `::panel` رسمًا ونصّه'],
        ['`المتحدث{…}: النص`', 'فقاعة من نص القصة؛ والمفاتيح المحجوزة `caption:` و`sfx:` و`note:`'],
        ['`:chip`', 'كلمة في إطار صغير يجري مع السطر'],
        ['`:ltr` · `:rtl`', 'مقطع من اليسار إلى اليمين أو من اليمين إلى اليسار'],
        ['`# العنوان {style="…"}`', 'نمط عنوان، وسمات تستعملها التصاميم'],
      ],
    );
  }
  if (lang === 'ja') {
    // The Japanese edition adds the marks its text describes; as inline
    // code, the compact ruby is printed as written.
    return table(
      ['記法', 'はたらき'],
      [
        ['`:::pagebreak`', '改ページ。`parity="odd"`か`"even"`で奇数ページか偶数ページを指定する'],
        ['`:::columnbreak`', 'いまの段を終える'],
        ['`:::space`', '1行アキ。`lines=2`で2行アキ'],
        ['`:::numbering`', 'ノンブルの系列を切り替える：書式と開始番号'],
        ['`:::toc`', '実際のページ番号の入った目次を組む'],
        ['`:::part`', '部扉を開く。タイトル、番号、パレット付き'],
        ['`:::callout`', '囲みのスタイルの一つで組む囲み：メモ、引用、数字など'],
        ['`:::columns`', '囲みの中でそろえて組む段'],
        ['`:::paragraphs`', '囲んだ段落に段落スタイルを適用する'],
        ['`:::paper`', '別の用紙に刷るページ。Folioビューで表示される'],
        ['`:ref`', 'リソースに言及し、番号を振ってフロートさせる'],
        ['`::resource`', 'リソースをその位置に埋め込む'],
        ['`:swatch`', '行内の色見本'],
        ['`[^id]`', '注の合印。`[^id]:`で注の本文を始める'],
        ['`:index`', '用語を巻末索引に登録する。`yomi`で読みを与える'],
        ['`:::index`', '実際のページ番号の入った索引を組む'],
        ['`{漢字|かん|じ}`', 'ルビ。読みを一字ずつ、または語全体に'],
        ['`:sideline` · `:dots`', '傍線と圏点'],
        ['`:tcy` · `:warichu`', '縦中横と割注'],
        ['`:::verse`', 'アラビア語の古典詩。前半句と後半句を`||`で区切る'],
        ['`:::page` · `::panel`', 'マンガのページ。`split`でコマに割り、`::panel`ごとに絵と台本を置く'],
        ['`話し手{…}: テキスト`', '台本のフキダシ一つ。`caption:`、`sfx:`、`note:`は予約されたキー'],
        ['`:chip`', '行と一緒に流れる小さな枠の中の語'],
        ['`:ltr` · `:rtl`', '左から右、または右から左に組む一続きの文字'],
        ['`# 見出し {style="…"}`', '見出しスタイルと、デザインが使う属性'],
      ],
    );
  }
  if (lang === 'zh-Hans') {
    return table(
      ['语法', '作用'],
      [
        ['`:::pagebreak`', '另起一页；`parity="odd"`或`"even"`指定单页码或双页码'],
        ['`:::columnbreak`', '结束当前栏'],
        ['`:::space`', '空一行；`lines=2`空两行'],
        ['`:::numbering`', '切换页码序列：格式与起始页码'],
        ['`:::toc`', '排出目录，页码都是真实的'],
        ['`:::part`', '开始一个篇章页，带标题、编号和调色板'],
        ['`:::callout`', '某种标注框样式的框：说明、引文、数字……'],
        ['`:::columns`', '标注框里彼此平衡的分栏'],
        ['`:::paragraphs`', '给它包住的段落套用段落样式'],
        ['`:::paper`', '另换纸张印刷的一组页面，在Folio三维视图中显示'],
        ['`:ref`', '提及一个资源，为它编号并让它浮动'],
        ['`::resource`', '把资源嵌在确切的位置'],
        ['`:swatch`', '行内色样'],
        ['`[^id]`', '脚注标记；`[^id]:`开始注文'],
        ['`:index`', '把词条收进书末索引'],
        ['`:::index`', '排出索引，页码都是真实的'],
        ['`:::verse`', '阿拉伯古典诗，上下半句用`||`隔开'],
        ['`:::page` · `::panel`', '漫画页，用`split`切成分格；每个`::panel`放一幅画和它的台词'],
        ['`角色{…}: 文字`', '漫画脚本里的一个对白框；`caption:`、`sfx:`和`note:`是保留的键'],
        ['`:chip`', '随行排进小框里的词'],
        ['`:ltr` · `:rtl`', '从左到右或从右到左排的一段文字'],
        ['`# 标题 {style="…"}`', '标题样式，以及供版面设计取用的属性'],
      ],
    );
  }
  if (lang === 'de') {
    return table(
      ['Syntax', 'Was sie bewirkt'],
      [
        ['`:::pagebreak`', 'Eine neue Seite; `parity="odd"` oder `"even"` verlangt eine rechte oder eine linke Seite'],
        ['`:::columnbreak`', 'Beendet die aktuelle Spalte'],
        ['`:::space`', 'Eine Leerzeile; `lines=2` lässt zwei frei'],
        ['`:::numbering`', 'Wechselt die Folge der Seitenzahlen: Format und Beginn'],
        ['`:::toc`', 'Druckt das Inhaltsverzeichnis mit echten Seitenzahlen'],
        ['`:::part`', 'Öffnet einen Teiltitel mit Titel, Nummer und Palette'],
        ['`:::callout`', 'Ein Kasten in einem der Kastenformate: Anmerkung, Zitat, Kennzahlen …'],
        ['`:::columns`', 'Ausgeglichene Spalten in einem Kasten'],
        ['`:::paragraphs`', 'Wendet ein Absatzformat auf das an, was es umschließt'],
        ['`:::paper`', 'Seiten auf einem anderen Papier, gezeigt vom Betrachter Folio'],
        ['`:ref`', 'Erwähnt eine Ressource, nummeriert sie und lässt sie gleiten'],
        ['`::resource`', 'Bettet eine Ressource genau an dieser Stelle ein'],
        ['`:swatch`', 'Ein Farbfeld in der Zeile'],
        ['`[^id]`', 'Ein Fußnotenzeichen; `[^id]:` eröffnet ihren Text'],
        ['`:index`', 'Nimmt einen Begriff in das Register auf'],
        ['`:::index`', 'Druckt das Register mit echten Seitenzahlen'],
        ['`:::verse`', 'Ein klassisches Gedicht, seine Vershälften durch `||` getrennt'],
        ['`:::page` · `::panel`', 'Eine Comicseite, durch `split` in Panels geteilt; jedes `::panel` trägt ein Bild und sein Skript'],
        ['`Sprecher{…}: Text`', 'Eine Sprechblase des Comicskripts; `caption:`, `sfx:` und `note:` sind die reservierten Schlüssel'],
        ['`:chip`', 'Ein Wort in einem kleinen Kasten, der mit der Zeile läuft'],
        ['`:ltr` · `:rtl`', 'Ein Abschnitt, von links nach rechts oder von rechts nach links gesetzt'],
        ['`# Überschrift {style="…"}`', 'Ein Überschriftenstil und Attribute für die Designs'],
      ],
    );
  }
  if (lang === 'fr') {
    return table(
      ['Syntaxe', 'Ce qu’elle fait'],
      [
        ['`:::pagebreak`', 'Une nouvelle page ; `parity="odd"` ou `"even"` demande un recto ou un verso'],
        ['`:::columnbreak`', 'Termine la colonne en cours'],
        ['`:::space`', 'Une ligne blanche ; `lines=2` en laisse deux'],
        ['`:::numbering`', 'Change la séquence des numéros de page : format et début'],
        ['`:::toc`', 'Imprime la table des matières, avec les vrais numéros de page'],
        ['`:::part`', 'Ouvre une page de partie, avec un titre, un numéro et une palette'],
        ['`:::callout`', 'Un encadré dans l’un des styles d’encadré : note, citation, chiffres…'],
        ['`:::columns`', 'Des colonnes équilibrées dans un encadré'],
        ['`:::paragraphs`', 'Applique un style de paragraphe à ce qu’il entoure'],
        ['`:::paper`', 'Des pages imprimées sur un autre papier, montrées par la visionneuse Folio'],
        ['`:ref`', 'Mentionne une ressource, la numérote et la fait flotter'],
        ['`::resource`', 'Insère une ressource au point exact'],
        ['`:swatch`', 'Une pastille de couleur dans la ligne'],
        ['`[^id]`', 'Un appel de note ; `[^id]:` ouvre son texte'],
        ['`:index`', 'Inscrit un terme dans l’index'],
        ['`:::index`', 'Imprime l’index, avec les vrais numéros de page'],
        ['`:::verse`', 'Un poème classique, ses hémistiches séparés par `||`'],
        ['`:::page` · `::panel`', 'Une page de bande dessinée découpée en cases par `split` ; chaque `::panel` porte un dessin et son scénario'],
        ['`personnage{…}: texte`', 'Une bulle du scénario ; `caption:`, `sfx:` et `note:` sont les clés réservées'],
        ['`:chip`', 'Un mot dans un petit cadre qui suit la ligne'],
        ['`:ltr` · `:rtl`', 'Un passage composé de gauche à droite ou de droite à gauche'],
        ['`# Titre {style="…"}`', 'Un style de titre, et des attributs pour les maquettes'],
      ],
    );
  }
  if (lang === 'it') {
    return table(
      ['Sintassi', 'Che cosa fa'],
      [
        ['`:::pagebreak`', 'Una pagina nuova; `parity="odd"` o `"even"` chiede un recto o un verso'],
        ['`:::columnbreak`', 'Chiude la colonna in corso'],
        ['`:::space`', 'Una riga bianca; `lines=2` ne lascia due'],
        ['`:::numbering`', 'Cambia la sequenza dei numeri di pagina: formato e inizio'],
        ['`:::toc`', 'Stampa l’indice, con i veri numeri di pagina'],
        ['`:::part`', 'Apre una pagina di parte, con titolo, numero e palette'],
        ['`:::callout`', 'Un riquadro in uno degli stili di riquadro: nota, citazione, cifre…'],
        ['`:::columns`', 'Colonne bilanciate dentro un riquadro'],
        ['`:::paragraphs`', 'Applica uno stile di paragrafo a ciò che racchiude'],
        ['`:::paper`', 'Pagine stampate su un’altra carta, mostrate dal visualizzatore Folio'],
        ['`:ref`', 'Cita una risorsa, la numera e la fa flottare'],
        ['`::resource`', 'Inserisce una risorsa nel punto esatto'],
        ['`:swatch`', 'Un campione di colore nella riga'],
        ['`[^id]`', 'Un richiamo di nota; `[^id]:` ne apre il testo'],
        ['`:index`', 'Registra un termine nell’indice analitico'],
        ['`:::index`', 'Stampa l’indice analitico, con i veri numeri di pagina'],
        ['`:::verse`', 'Una poesia classica, con gli emistichi separati da `||`'],
        ['`:::page` · `::panel`', 'Una pagina di fumetto divisa in vignette da `split`; ogni `::panel` porta un disegno e la sua sceneggiatura'],
        ['`personaggio{…}: testo`', 'Una nuvoletta della sceneggiatura; `caption:`, `sfx:` e `note:` sono le chiavi riservate'],
        ['`:chip`', 'Una parola in una piccola cornice che scorre con la riga'],
        ['`:ltr` · `:rtl`', 'Un tratto composto da sinistra a destra o da destra a sinistra'],
        ['`# Titolo {style="…"}`', 'Uno stile di titolo, e attributi per i progetti grafici'],
      ],
    );
  }
  if (lang === 'pt-BR') {
    return table(
      ['Sintaxe', 'O que faz'],
      [
        ['`:::pagebreak`', 'Uma página nova; `parity="odd"` ou `"even"` pede uma página ímpar ou par'],
        ['`:::columnbreak`', 'Encerra a coluna atual'],
        ['`:::space`', 'Uma linha em branco; `lines=2` deixa duas'],
        ['`:::numbering`', 'Troca a sequência de fólios: formato e número inicial'],
        ['`:::toc`', 'Imprime o sumário, com os números de página reais'],
        ['`:::part`', 'Abre uma página de parte, com título, número e paleta'],
        ['`:::callout`', 'Um boxe em um dos estilos: nota, citação, números…'],
        ['`:::columns`', 'Colunas balanceadas dentro de um boxe'],
        ['`:::paragraphs`', 'Aplica um estilo de parágrafo ao que envolve'],
        ['`:::paper`', 'Páginas impressas em outro papel, mostradas pelo visualizador Folio'],
        ['`:ref`', 'Cita um recurso, numera-o e faz que ele flutue'],
        ['`::resource`', 'Insere um recurso no ponto exato'],
        ['`:swatch`', 'Uma amostra de cor na linha'],
        ['`[^id]`', 'Chamada de nota; `[^id]:` abre o seu texto'],
        ['`:index`', 'Registra um termo no índice remissivo'],
        ['`:::index`', 'Imprime o índice remissivo, com os números de página reais'],
        ['`:::verse`', 'Um poema clássico, com os hemistíquios separados por `||`'],
        ['`:::page` · `::panel`', 'Uma página de quadrinhos dividida em quadros por `split`; cada `::panel` traz um desenho e o seu roteiro'],
        ['`personagem{…}: texto`', 'Um balão do roteiro; `caption:`, `sfx:` e `note:` são as chaves reservadas'],
        ['`:chip`', 'Uma palavra numa caixinha que corre com a linha'],
        ['`:ltr` · `:rtl`', 'Um trecho da esquerda para a direita ou da direita para a esquerda'],
        ['`# Título {style="…"}`', 'Estilo de título e atributos para os designs'],
      ],
    );
  }
  if (lang === 'ca') {
    return table(
      ['Sintaxi', 'Què fa'],
      [
        ['`:::pagebreak`', 'Pàgina nova; `parity="odd"` o `"even"` força recto o verso'],
        ['`:::columnbreak`', 'Acaba la columna actual'],
        ['`:::space`', 'Una línia en blanc; `lines=2` en deixa dues'],
        ['`:::numbering`', 'Canvia la seqüència de folis: format i número inicial'],
        ['`:::toc`', 'Imprimeix l\'índex, amb folis reals'],
        ['`:::part`', 'Obre una portadella de part, amb títol, número i paleta'],
        ['`:::callout`', 'Requadre d\'un estil: nota, cita, xifres…'],
        ['`:::columns`', 'Columnes equilibrades dins d\'un requadre'],
        ['`:::paragraphs`', 'Aplica un estil de paràgraf al que embolcalla'],
        ['`:::paper`', 'Pàgines impreses en un altre paper; es veuen al visor Folio'],
        ['`:ref`', 'Cita un recurs, el numera i el fa flotar'],
        ['`::resource`', 'Insereix un recurs al punt exacte'],
        ['`:swatch`', 'Mostra de color en línia'],
        ['`[^id]`', 'Crida de nota; `[^id]:` n\'obre el text'],
        ['`:index`', 'Registra un terme a l\'índex analític'],
        ['`:::index`', 'Imprimeix l\'índex analític, amb folis reals'],
        ['`:::verse`', 'Un poema clàssic, amb els hemistiquis separats per `||`'],
        ['`:::page` · `::panel`', 'Una pàgina de còmic dividida en vinyetes per `split`; cada `::panel` porta un dibuix i el seu guió'],
        ['`personatge{…}: text`', 'Una bafarada del guió; `caption:`, `sfx:` i `note:` són les claus reservades'],
        ['`:chip`', 'Una paraula en una capseta que flueix amb la línia'],
        ['`:ltr` · `:rtl`', 'Un tram d\'esquerra a dreta o de dreta a esquerra'],
        ['`# Títol {style="…"}`', 'Estil de títol i atributs per als dissenys'],
      ],
    );
  }
  return lang === 'es'
    ? table(
        ['Sintaxis', 'Qué hace'],
        [
          ['`:::pagebreak`', 'Nueva página; `parity="odd"` u `"even"` fuerza recto o verso'],
          ['`:::columnbreak`', 'Termina la columna actual'],
          ['`:::space`', 'Una línea en blanco; `lines=2` deja dos'],
          ['`:::numbering`', 'Cambia la secuencia de folios: formato y número inicial'],
          ['`:::toc`', 'Imprime el índice, con folios reales'],
          ['`:::part`', 'Abre una portadilla de parte, con título, número y paleta'],
          ['`:::callout`', 'Recuadro de un estilo: nota, cita, cifras…'],
          ['`:::columns`', 'Columnas equilibradas dentro de un recuadro'],
          ['`:::paragraphs`', 'Aplica un estilo de párrafo a lo que envuelve'],
          ['`:::paper`', 'Páginas impresas en otro papel; se ven en el visor Folio'],
          ['`:ref`', 'Cita un recurso, lo numera y lo hace flotar'],
          ['`::resource`', 'Inserta un recurso en el punto exacto'],
          ['`:swatch`', 'Muestra de color en línea'],
          ['`[^id]`', 'Llamada de nota; `[^id]:` abre su texto'],
          ['`:index`', 'Registra un término en el índice analítico'],
          ['`:::index`', 'Imprime el índice analítico, con folios reales'],
          ['`:::verse`', 'Un poema clásico, con los hemistiquios separados por `||`'],
          ['`:::page` · `::panel`', 'Una página de cómic dividida en viñetas por `split`; cada `::panel` lleva un dibujo y su guion'],
          ['`personaje{…}: texto`', 'Un globo del guion; `caption:`, `sfx:` y `note:` son las claves reservadas'],
          ['`:chip`', 'Una palabra en una cajita que fluye con la línea'],
          ['`:ltr` · `:rtl`', 'Un tramo de izquierda a derecha o de derecha a izquierda'],
          ['`# Título {style="…"}`', 'Estilo de título y atributos para los diseños'],
        ],
      )
    : table(
        ['Syntax', 'What it does'],
        [
          ['`:::pagebreak`', 'A new page; `parity="odd"` or `"even"` asks for a recto or verso'],
          ['`:::columnbreak`', 'Ends the current column'],
          ['`:::space`', 'A blank line; `lines=2` leaves two'],
          ['`:::numbering`', 'Switches the page-number sequence: format and start'],
          ['`:::toc`', 'Prints the table of contents, with real page numbers'],
          ['`:::part`', 'Opens a part divider, with a title, number and palette'],
          ['`:::callout`', 'A box in one of the callout styles: note, quote, figures…'],
          ['`:::columns`', 'Balanced columns inside a callout'],
          ['`:::paragraphs`', 'Applies a paragraph style to what it wraps'],
          ['`:::paper`', 'Pages printed on another paper stock, shown by the Folio viewer'],
          ['`:ref`', 'Mentions a resource, numbers it and floats it'],
          ['`::resource`', 'Embeds a resource at the exact point'],
          ['`:swatch`', 'An inline colour swatch'],
          ['`[^id]`', 'A footnote marker; `[^id]:` opens its text'],
          ['`:index`', 'Files a term in the back-of-book index'],
          ['`:::index`', 'Prints the index, with real page numbers'],
          ['`:::verse`', 'A classical poem, its halves split by `||`'],
          ['`:::page` · `::panel`', 'A comic page cut into panels by `split`; each `::panel` holds a picture and its script'],
          ['`speaker{…}: text`', 'A balloon of the comic script; `caption:`, `sfx:` and `note:` are the reserved keys'],
          ['`:chip`', 'A word in a small box that flows with the line'],
          ['`:ltr` · `:rtl`', 'A run set left to right or right to left'],
          ['`# Title {style="…"}`', 'A heading style, and attributes for the designs'],
        ],
      );
}

/** The Folio paper stocks and what each sets (`FOLIO_PAPER_STOCKS`). */
export function paperStocksTableModel(lang: GuideLang): TableModel {
  if (lang === 'ar') {
    return table(
      ['الورق', 'الغراماج', 'السُّمك', 'التشطيب', 'الاستعمال المعتاد'],
      [
        ['أوفست غير مطلي', '90 g/m²', '113 µm', 'غير مطلي', 'الكتب والتقارير'],
        ['ورق كتب كريمي عالي الحجم', '80 g/m²', '128 µm', 'غير مطلي', 'الروايات والمقالات'],
        ['مطلي مطفأ', '115 g/m²', '115 µm', 'مطفأ', 'الكتب المدرسية وكتب الفن'],
        ['مطلي حريري', '115 g/m²', '104 µm', 'حريري', 'الكتالوجات والمجلات'],
        ['مطلي لامع', '115 g/m²', '92 µm', 'لامع', 'المجلات واللوحات'],
        ['ورق الكتاب المقدس', '40 g/m²', '44 µm', 'غير مطلي', 'المعاجم والكتب التراثية'],
        ['ورق الصحف', '48 g/m²', '72 µm', 'غير مطلي', 'الصحف'],
        ['ورق مقوّى', '250 g/m²', '300 µm', 'غير مطلي', 'الأغلفة والفواصل'],
        ['كرتون', '1250 g/m²', '2000 µm', 'حريري', 'كتب الأطفال الكرتونية'],
      ],
    );
  }
  if (lang === 'ja') {
    return table(
      ['用紙', '坪量', '紙厚', '表面', '主な用途'],
      [
        ['上質紙', '90 g/m²', '113 µm', '非塗工', '書籍と報告書'],
        ['書籍用紙（クリーム、嵩高）', '80 g/m²', '128 µm', '非塗工', '小説と随筆'],
        ['マットコート紙', '115 g/m²', '115 µm', 'マット', '教科書と美術書'],
        ['ダルコート紙', '115 g/m²', '104 µm', 'ダル', 'カタログと雑誌'],
        ['グロスコート紙', '115 g/m²', '92 µm', 'グロス', '雑誌と図版'],
        ['インディア紙', '40 g/m²', '44 µm', '非塗工', '辞書と古典'],
        ['新聞用紙', '48 g/m²', '72 µm', '非塗工', '新聞'],
        ['厚紙', '250 g/m²', '300 µm', '非塗工', '表紙と仕切り'],
        ['板紙', '1250 g/m²', '2000 µm', 'ダル', '幼児向けのボードブック'],
      ],
    );
  }
  if (lang === 'zh-Hans') {
    return table(
      ['纸种', '克重', '单张厚度', '表面', '常见用途'],
      [
        ['胶版纸', '90 g/m²', '113 µm', '非涂布', '书籍和报告'],
        ['书纸（米黄，高松厚）', '80 g/m²', '128 µm', '非涂布', '小说和随笔'],
        ['哑光涂布纸', '115 g/m²', '115 µm', '哑光', '教材和画册'],
        ['丝光涂布纸', '115 g/m²', '104 µm', '丝光', '图录和杂志'],
        ['光面涂布纸', '115 g/m²', '92 µm', '光面', '杂志和图版'],
        ['字典纸', '40 g/m²', '44 µm', '非涂布', '字典和经典文集'],
        ['新闻纸', '48 g/m²', '72 µm', '非涂布', '报纸'],
        ['卡纸', '250 g/m²', '300 µm', '非涂布', '封面和隔页'],
        ['纸板', '1250 g/m²', '2000 µm', '丝光', '幼儿纸板书'],
      ],
    );
  }
  if (lang === 'de') {
    return table(
      ['Papier', 'Grammatur', 'Dicke', 'Oberfläche', 'Typische Verwendung'],
      [
        ['Ungestrichenes Offsetpapier', '90 g/m²', '113 µm', 'Ungestrichen', 'Bücher und Berichte'],
        ['Werkdruck, chamois, voluminös', '80 g/m²', '128 µm', 'Ungestrichen', 'Romane und Essays'],
        ['Matt gestrichen', '115 g/m²', '115 µm', 'Matt', 'Lehrbücher, Kunstbücher'],
        ['Seidenmatt gestrichen', '115 g/m²', '104 µm', 'Seidenmatt', 'Kataloge und Magazine'],
        ['Glänzend gestrichen', '115 g/m²', '92 µm', 'Glänzend', 'Magazine und Bildtafeln'],
        ['Dünndruckpapier', '40 g/m²', '44 µm', 'Ungestrichen', 'Wörterbücher und Klassiker'],
        ['Zeitungspapier', '48 g/m²', '72 µm', 'Ungestrichen', 'Zeitungen'],
        ['Karton', '250 g/m²', '300 µm', 'Ungestrichen', 'Umschläge und Trennblätter'],
        ['Pappe', '1250 g/m²', '2000 µm', 'Seidenmatt', 'Pappbilderbücher für Kinder'],
      ],
    );
  }
  if (lang === 'fr') {
    return table(
      ['Papier', 'Grammage', 'Épaisseur', 'Finition', 'Usage courant'],
      [
        ['Offset non couché', '90 g/m²', '113 µm', 'Non couché', 'Livres et rapports'],
        ['Bouffant ivoire', '80 g/m²', '128 µm', 'Non couché', 'Romans et essais'],
        ['Couché mat', '115 g/m²', '115 µm', 'Mat', 'Manuels, livres d’art'],
        ['Couché satiné', '115 g/m²', '104 µm', 'Satiné', 'Catalogues et magazines'],
        ['Couché brillant', '115 g/m²', '92 µm', 'Brillant', 'Magazines et planches'],
        ['Papier bible', '40 g/m²', '44 µm', 'Non couché', 'Dictionnaires et classiques'],
        ['Papier journal', '48 g/m²', '72 µm', 'Non couché', 'Journaux'],
        ['Carte', '250 g/m²', '300 µm', 'Non couché', 'Couvertures et intercalaires'],
        ['Carton', '1250 g/m²', '2000 µm', 'Satiné', 'Livres cartonnés pour enfants'],
      ],
    );
  }
  if (lang === 'it') {
    return table(
      ['Carta', 'Grammatura', 'Spessore', 'Finitura', 'Uso tipico'],
      [
        ['Offset non patinata', '90 g/m²', '113 µm', 'Non patinata', 'Libri e relazioni'],
        ['Usomano avoriata', '80 g/m²', '128 µm', 'Non patinata', 'Romanzi e saggi'],
        ['Patinata opaca', '115 g/m²', '115 µm', 'Opaca', 'Testi scolastici, libri d’arte'],
        ['Patinata satinata', '115 g/m²', '104 µm', 'Satinata', 'Cataloghi e riviste'],
        ['Patinata lucida', '115 g/m²', '92 µm', 'Lucida', 'Riviste e tavole'],
        ['Carta bibbia', '40 g/m²', '44 µm', 'Non patinata', 'Dizionari e classici'],
        ['Carta da giornale', '48 g/m²', '72 µm', 'Non patinata', 'Quotidiani'],
        ['Cartoncino', '250 g/m²', '300 µm', 'Non patinata', 'Copertine e separatori'],
        ['Cartone', '1250 g/m²', '2000 µm', 'Satinata', 'Libri cartonati per bambini'],
      ],
    );
  }
  if (lang === 'pt-BR') {
    return table(
      ['Papel', 'Gramatura', 'Espessura', 'Acabamento', 'Uso habitual'],
      [
        ['Offset', '90 g/m²', '113 µm', 'Não revestido', 'Livros e relatórios'],
        ['Pólen de alto volume', '80 g/m²', '128 µm', 'Não revestido', 'Romances e ensaios'],
        ['Couché fosco', '115 g/m²', '115 µm', 'Fosco', 'Livros didáticos, livros de arte'],
        ['Couché seda', '115 g/m²', '104 µm', 'Seda', 'Catálogos e revistas'],
        ['Couché brilho', '115 g/m²', '92 µm', 'Brilho', 'Revistas e pranchas'],
        ['Bíblia', '40 g/m²', '44 µm', 'Não revestido', 'Dicionários e clássicos'],
        ['Jornal', '48 g/m²', '72 µm', 'Não revestido', 'Jornais'],
        ['Cartão', '250 g/m²', '300 µm', 'Não revestido', 'Capas e divisórias'],
        ['Papelão', '1250 g/m²', '2000 µm', 'Seda', 'Livros cartonados infantis'],
      ],
    );
  }
  if (lang === 'ca') {
    return table(
      ['Paper', 'Gramatge', 'Gruix', 'Acabat', 'Ús habitual'],
      [
        ['Òfset sense estucar', '90 g/m²', '113 µm', 'Sense estucar', 'Llibres i informes'],
        ['Ivori d\'alt volum', '80 g/m²', '128 µm', 'Sense estucar', 'Novel·la i assaig'],
        ['Estucat mat', '115 g/m²', '115 µm', 'Mat', 'Llibres de text, llibres d\'art'],
        ['Estucat setinat', '115 g/m²', '104 µm', 'Setinat', 'Catàlegs i revistes'],
        ['Estucat brillant', '115 g/m²', '92 µm', 'Brillant', 'Revistes i làmines'],
        ['Bíblia', '40 g/m²', '44 µm', 'Sense estucar', 'Diccionaris i clàssics'],
        ['Premsa', '48 g/m²', '72 µm', 'Sense estucar', 'Diaris'],
        ['Cartolina', '250 g/m²', '300 µm', 'Sense estucar', 'Cobertes i separadors'],
        ['Cartó', '1250 g/m²', '2000 µm', 'Setinat', 'Llibres de cartró infantils'],
      ],
    );
  }
  return lang === 'es'
    ? table(
        ['Papel', 'Gramaje', 'Grosor', 'Acabado', 'Uso habitual'],
        [
          ['Offset sin estucar', '90 g/m²', '113 µm', 'Sin estucar', 'Libros e informes'],
          ['Ahuesado de alto volumen', '80 g/m²', '128 µm', 'Sin estucar', 'Novela y ensayo'],
          ['Estucado mate', '115 g/m²', '115 µm', 'Mate', 'Libros de texto, libros de arte'],
          ['Estucado seda', '115 g/m²', '104 µm', 'Seda', 'Catálogos y revistas'],
          ['Estucado brillo', '115 g/m²', '92 µm', 'Brillo', 'Revistas y láminas'],
          ['Biblia', '40 g/m²', '44 µm', 'Sin estucar', 'Diccionarios y clásicos'],
          ['Prensa', '48 g/m²', '72 µm', 'Sin estucar', 'Periódicos'],
          ['Cartulina', '250 g/m²', '300 µm', 'Sin estucar', 'Cubiertas y separadores'],
          ['Cartón', '1250 g/m²', '2000 µm', 'Seda', 'Libros de cartón infantiles'],
        ],
      )
    : table(
        ['Stock', 'Weight', 'Caliper', 'Finish', 'Typical use'],
        [
          ['Uncoated offset', '90 g/m²', '113 µm', 'Uncoated', 'Books and reports'],
          ['Book wove, cream', '80 g/m²', '128 µm', 'Uncoated', 'Novels and essays'],
          ['Coated matte', '115 g/m²', '115 µm', 'Matte', 'Textbooks, art books'],
          ['Coated silk', '115 g/m²', '104 µm', 'Silk', 'Catalogues and magazines'],
          ['Coated gloss', '115 g/m²', '92 µm', 'Gloss', 'Magazines and plates'],
          ['Bible', '40 g/m²', '44 µm', 'Uncoated', 'Dictionaries and classics'],
          ['Newsprint', '48 g/m²', '72 µm', 'Uncoated', 'Newspapers'],
          ['Card', '250 g/m²', '300 µm', 'Uncoated', 'Covers and dividers'],
          ['Board', '1250 g/m²', '2000 µm', 'Silk', 'Board books for children'],
        ],
      );
}
