// The table helpers and the tables that compare: what editorial layout
// needs in plain CSS and in Postext, Postext beside the established tools,
// and a resource's placement fields (#1276: split out of index.ts).
import type { TableCell, TableModel } from 'postext';
import type { GuideLang } from './lang.js';

// ───────────────────────────────────────────────────────────────────────────
// Tables
//
// Cell content is plain text / inline markdown (bold, inline code). Content
// follows the document locale so a Spanish document gets Spanish tables.
// ───────────────────────────────────────────────────────────────────────────

const h = (content: string): TableCell => ({ content, isHeader: true });
const c = (content: string): TableCell => ({ content });

/** Build a {@link TableModel} from a header row and body rows of strings. */
export function table(headers: string[], body: string[][]): TableModel {
  return {
    headerRowCount: 1,
    rows: [headers.map(h), ...body.map((row) => row.map(c))],
  };
}

export function featureTableModel(lang: GuideLang): TableModel {
  if (lang === 'ar') {
    const yes = '**نعم**';
    return table(
      ['القدرة', 'CSS', 'Postext'],
      [
        ['أعمدة متوازنة بحسب محتواها', 'جزئيًا', yes],
        ['الأرامل واليتامى والأسطر القصيرة', 'متفاوت', yes],
        ['قطع الفقرة الأمثل (Knuth-Plass)', 'لا', yes],
        ['أشكال تطفو بعد الإحالة إليها', 'لا', yes],
        ['شبكة خطوط قاعدة عبر الأعمدة', 'لا', yes],
        ['ترويسات وأرقام صفحات وفهرس مرقّم', 'لا', yes],
        ['PDF موسوم من المصدر نفسه', 'لا', yes],
      ],
    );
  }
  if (lang === 'ja') {
    // ○ △ × as Japanese comparison tables mark them.
    const yes = '**○**';
    return table(
      ['機能', 'CSS', 'Postext'],
      [
        ['内容に応じた段末そろえ', '△', yes],
        ['オーファン、ウィドウ、孤立した最終行', '△', yes],
        ['段落全体での最適な行分割（Knuth–Plass）', '×', yes],
        ['参照のあとに置かれる図', '×', yes],
        ['段をまたぐベースライングリッド', '×', yes],
        ['柱、ノンブル、ページ番号入りの目次', '×', yes],
        ['同じ原稿から作るタグ付きPDF', '×', yes],
      ],
    );
  }
  if (lang === 'zh-Hans') {
    const yes = '**支持**';
    return table(
      ['能力', 'CSS', 'Postext'],
      [
        ['按内容平衡各栏', '部分支持', yes],
        ['段首孤行、段末孤行与孤字', '参差不齐', yes],
        ['最优断行（Knuth–Plass）', '不支持', yes],
        ['图在引用之后浮动到位', '不支持', yes],
        ['跨栏的基线网格', '不支持', yes],
        ['书眉、页码和带页码的目录', '不支持', yes],
        ['同一份源文本生成带标签的PDF', '不支持', yes],
      ],
    );
  }
  if (lang === 'de') {
    const yes = '**Ja**';
    return table(
      ['Fähigkeit', 'CSS', 'Postext'],
      [
        ['Spalten, nach ihrem Inhalt ausgeglichen', 'Teilweise', yes],
        ['Waisen, Witwen und zu kurze Ausgangszeilen', 'Uneinheitlich', yes],
        ['Optimaler Absatzumbruch (Knuth-Plass)', 'Nein', yes],
        ['Abbildungen, die nach ihrem Verweis gleiten', 'Nein', yes],
        ['Grundlinienraster über die Spalten hinweg', 'Nein', yes],
        ['Kolumnentitel, Seitenzahlen und ein paginiertes Inhaltsverzeichnis', 'Nein', yes],
        ['Getaggtes PDF aus derselben Quelle', 'Nein', yes],
      ],
    );
  }
  if (lang === 'fr') {
    const yes = '**Oui**';
    return table(
      ['Fonctionnalité', 'CSS', 'Postext'],
      [
        ['Colonnes équilibrées selon leur contenu', 'Partiel', yes],
        ['Orphelines, veuves et lignes trop courtes', 'Inégal', yes],
        ['Coupure optimale des paragraphes (Knuth-Plass)', 'Non', yes],
        ['Figures qui flottent après leur renvoi', 'Non', yes],
        ['Grille de ligne de base entre colonnes', 'Non', yes],
        ['Titres courants, folios et table des matières paginée', 'Non', yes],
        ['PDF balisé à partir de la même source', 'Non', yes],
      ],
    );
  }
  if (lang === 'it') {
    const yes = '**Sì**';
    return table(
      ['Funzionalità', 'CSS', 'Postext'],
      [
        ['Colonne bilanciate in base al contenuto', 'Parziale', yes],
        ['Orfane, vedove e righe finali troppo corte', 'Irregolare', yes],
        ['Divisione ottimale dei paragrafi (Knuth-Plass)', 'No', yes],
        ['Figure che flottano dopo il loro rimando', 'No', yes],
        ['Griglia della linea di base tra le colonne', 'No', yes],
        ['Testatine, folio e indice con i numeri di pagina', 'No', yes],
        ['PDF con tag dalla stessa sorgente', 'No', yes],
      ],
    );
  }
  if (lang === 'pt-BR') {
    const yes = '**Sim**';
    return table(
      ['Recurso', 'CSS', 'Postext'],
      [
        ['Colunas balanceadas pelo conteúdo', 'Parcial', yes],
        ['Órfãs, viúvas e linhas curtas', 'Irregular', yes],
        ['Quebra ótima de parágrafo (Knuth-Plass)', 'Não', yes],
        ['Figuras que flutuam depois da referência', 'Não', yes],
        ['Grade de linhas de base entre colunas', 'Não', yes],
        ['Cabeços, fólios e sumário paginado', 'Não', yes],
        ['PDF com tags a partir da mesma fonte', 'Não', yes],
      ],
    );
  }
  if (lang === 'ca') {
    const yes = '**Sí**';
    return table(
      ['Capacitat', 'CSS', 'Postext'],
      [
        ['Columnes equilibrades segons el contingut', 'Parcial', yes],
        ['Òrfenes, vídues i línies curtes', 'Desigual', yes],
        ['Tall de paràgraf òptim (Knuth-Plass)', 'No', yes],
        ['Figures que floten després de la referència', 'No', yes],
        ['Retícula de línia de base entre columnes', 'No', yes],
        ['Capçaleres, folis i índex paginat', 'No', yes],
        ['PDF etiquetat des de la mateixa font', 'No', yes],
      ],
    );
  }
  const es = lang === 'es';
  const yes = es ? '**Sí**' : '**Yes**';
  return es
    ? table(
        ['Capacidad', 'CSS', 'Postext'],
        [
          ['Columnas equilibradas según su contenido', 'Parcial', yes],
          ['Huérfanas, viudas y líneas cortas', 'Desigual', yes],
          ['Corte de párrafo óptimo (Knuth-Plass)', 'No', yes],
          ['Figuras que flotan tras su referencia', 'No', yes],
          ['Rejilla de línea base entre columnas', 'No', yes],
          ['Cabeceras, folios e índice paginado', 'No', yes],
          ['PDF etiquetado desde la misma fuente', 'No', yes],
        ],
      )
    : table(
        ['Capability', 'CSS', 'Postext'],
        [
          ['Columns balanced by their content', 'Partial', yes],
          ['Orphans, widows and runts', 'Uneven', yes],
          ['Optimal paragraph breaking (Knuth-Plass)', 'No', yes],
          ['Figures that float after their reference', 'No', yes],
          ['Baseline grid across columns', 'No', yes],
          ['Running heads, folios and a paginated contents', 'No', yes],
          ['Tagged PDF from the same source', 'No', yes],
        ],
      );
}

export function toolsTableModel(lang: GuideLang): TableModel {
  if (lang === 'ar') {
    const full = '**كامل**';
    const yes = '**نعم**';
    return table(
      ['الأداة', 'التحكم التحريري', 'على الويب', 'قابلة للتضمين', 'مفتوحة المصدر'],
      [
        ['معالجات النصوص', 'أساسي', 'جزئيًا', 'لا', 'لا'],
        ['Adobe InDesign', full, 'لا', 'لا', 'لا'],
        ['LaTeX', full, 'لا', 'لا', yes],
        ['CSS المرقّم صفحاتٍ', 'جزئيًا', yes, 'جزئيًا', yes],
        ['Postext', full, yes, yes, yes],
      ],
    );
  }
  if (lang === 'ja') {
    const yes = '**○**';
    return table(
      ['ツール', '組版の制御', 'Webで動く', '組み込める', 'オープンソース'],
      [
        ['ワープロ', '△', '△', '×', '×'],
        ['Adobe InDesign', yes, '×', '×', '×'],
        ['LaTeX', yes, '×', '×', yes],
        ['ページ組みのCSS', '△', yes, '△', yes],
        ['Postext', yes, yes, yes, yes],
      ],
    );
  }
  if (lang === 'zh-Hans') {
    const full = '**完整**';
    const yes = '**是**';
    const basic = '基本';
    const partial = '部分';
    return table(
      ['工具', '出版级控制', '用于网页', '可嵌入', '开源'],
      [
        ['文字处理软件', basic, partial, '否', '否'],
        ['Adobe InDesign', full, '否', '否', '否'],
        ['LaTeX', full, '否', '否', yes],
        ['分页CSS', partial, yes, partial, yes],
        ['Postext', full, yes, yes, yes],
      ],
    );
  }
  if (lang === 'de') {
    const full = '**Voll**';
    const yes = '**Ja**';
    const basic = 'Einfach';
    const partial = 'Teilweise';
    return table(
      ['Werkzeug', 'Satzkontrolle', 'Im Web', 'Einbettbar', 'Open Source'],
      [
        ['Textverarbeitungen', basic, partial, 'Nein', 'Nein'],
        ['Adobe InDesign', full, 'Nein', 'Nein', 'Nein'],
        ['LaTeX', full, 'Nein', 'Nein', yes],
        ['Paginiertes CSS', partial, yes, partial, yes],
        ['Postext', full, yes, yes, yes],
      ],
    );
  }
  if (lang === 'fr') {
    const full = '**Complet**';
    const yes = '**Oui**';
    const basic = 'Basique';
    const partial = 'Partiel';
    return table(
      ['Outil', 'Contrôle éditorial', 'Sur le web', 'Intégrable', 'Open source'],
      [
        ['Traitements de texte', basic, partial, 'Non', 'Non'],
        ['Adobe InDesign', full, 'Non', 'Non', 'Non'],
        ['LaTeX', full, 'Non', 'Non', yes],
        ['CSS paginé', partial, yes, partial, yes],
        ['Postext', full, yes, yes, yes],
      ],
    );
  }
  if (lang === 'it') {
    const full = '**Completo**';
    const yes = '**Sì**';
    const basic = 'Di base';
    const partial = 'Parziale';
    return table(
      ['Strumento', 'Controllo editoriale', 'Sul web', 'Integrabile', 'Open source'],
      [
        ['Elaboratori di testi', basic, partial, 'No', 'No'],
        ['Adobe InDesign', full, 'No', 'No', 'No'],
        ['LaTeX', full, 'No', 'No', yes],
        ['CSS paginato', partial, yes, partial, yes],
        ['Postext', full, yes, yes, yes],
      ],
    );
  }
  if (lang === 'pt-BR') {
    const full = '**Completo**';
    const yes = '**Sim**';
    const basic = 'Básico';
    const partial = 'Parcial';
    return table(
      ['Ferramenta', 'Controle editorial', 'Na web', 'Incorporável', 'Código aberto'],
      [
        ['Processadores de texto', basic, partial, 'Não', 'Não'],
        ['Adobe InDesign', full, 'Não', 'Não', 'Não'],
        ['LaTeX', full, 'Não', 'Não', yes],
        ['CSS paginado', partial, yes, partial, yes],
        ['Postext', full, yes, yes, yes],
      ],
    );
  }
  if (lang === 'ca') {
    const full = '**Complet**';
    const yes = '**Sí**';
    const basic = 'Bàsic';
    const partial = 'Parcial';
    return table(
      ['Eina', 'Control editorial', 'Al web', 'Incrustable', 'Codi obert'],
      [
        ['Processadors de text', basic, partial, 'No', 'No'],
        ['Adobe InDesign', full, 'No', 'No', 'No'],
        ['LaTeX', full, 'No', 'No', yes],
        ['CSS paginat', partial, yes, partial, yes],
        ['Postext', full, yes, yes, yes],
      ],
    );
  }
  const es = lang === 'es';
  const full = es ? '**Completo**' : '**Full**';
  const yes = es ? '**Sí**' : '**Yes**';
  const basic = es ? 'Básico' : 'Basic';
  const partial = es ? 'Parcial' : 'Partial';
  return es
    ? table(
        ['Herramienta', 'Control editorial', 'En la web', 'Incrustable', 'Fuente abierta'],
        [
          ['Procesadores de texto', basic, partial, 'No', 'No'],
          ['Adobe InDesign', full, 'No', 'No', 'No'],
          ['LaTeX', full, 'No', 'No', yes],
          ['CSS paginado', partial, yes, partial, yes],
          ['Postext', full, yes, yes, yes],
        ],
      )
    : table(
        ['Tool', 'Editorial control', 'On the web', 'Embeddable', 'Open source'],
        [
          ['Word processors', basic, partial, 'No', 'No'],
          ['Adobe InDesign', full, 'No', 'No', 'No'],
          ['LaTeX', full, 'No', 'No', yes],
          ['Paged CSS', partial, yes, partial, yes],
          ['Postext', full, yes, yes, yes],
        ],
      );
}

export function placementTableModel(lang: GuideLang): TableModel {
  if (lang === 'ar') {
    return table(
      ['الحقل', 'القيم', 'الأثر'],
      [
        ['`position`', '`auto` · `top` · `bottom` · `here`', 'أول مكان شاغر، أو رأس العمود أو ذيله، أو النقطة نفسها'],
        ['`span`', '`column` · `page` · `side`', 'عمود واحد، أو الصفحة كلها، أو العمود الجانبي'],
        ['`width`', '0–1', 'نسبة من العرض المتاح'],
        ['`align`', '`left` · `center` · `right`', 'الموضع داخل ذلك العرض'],
        ['`rotate`', '`ccw` · `cw`', 'ربع دورة، في صفحة خاصة به'],
        ['`captionSide`', 'نعم · لا', 'التعليق في العمود الجانبي'],
      ],
    );
  }
  if (lang === 'ja') {
    return table(
      ['フィールド', '値', '効果'],
      [
        ['`position`', '`auto` · `top` · `bottom` · `here`', '最初の空き、段頭か段末、またはその場'],
        ['`span`', '`column` · `page` · `side`', '1段分、版面の全幅、または脇段'],
        ['`width`', '0–1', '使える幅に対する割合'],
        ['`align`', '`left` · `center` · `right`', 'その幅の中での位置'],
        ['`rotate`', '`ccw` · `cw`', '90度回して専用のページに置く'],
        ['`captionSide`', '`true` · `false`', 'キャプションを脇段に置く'],
      ],
    );
  }
  if (lang === 'zh-Hans') {
    return table(
      ['字段', '取值', '作用'],
      [
        ['`position`', '`auto` · `top` · `bottom` · `here`', '第一个空位、栏顶或栏底，或者正好在引用处'],
        ['`span`', '`column` · `page` · `side`', '一栏宽、通栏或边栏'],
        ['`width`', '0–1', '占可用宽度的比例'],
        ['`align`', '`left` · `center` · `right`', '在这个宽度内的位置'],
        ['`rotate`', '`ccw` · `cw`', '转90度，单独占一页'],
        ['`captionSide`', '`true` · `false`', '题注排在边栏'],
      ],
    );
  }
  if (lang === 'de') {
    return table(
      ['Feld', 'Werte', 'Wirkung'],
      [
        ['`position`', '`auto` · `top` · `bottom` · `here`', 'Erste freie Stelle, Kopf oder Fuß einer Spalte oder genau an der Stelle'],
        ['`span`', '`column` · `page` · `side`', 'Eine Spalte, die ganze Seite oder die Nebenspalte'],
        ['`width`', '0–1', 'Anteil an der verfügbaren Breite'],
        ['`align`', '`left` · `center` · `right`', 'Position innerhalb dieser Breite'],
        ['`rotate`', '`ccw` · `cw`', 'Eine Vierteldrehung, auf einer eigenen Seite'],
        ['`captionSide`', 'ja · nein', 'Legende in der Nebenspalte'],
      ],
    );
  }
  if (lang === 'fr') {
    return table(
      ['Champ', 'Valeurs', 'Effet'],
      [
        ['`position`', '`auto` · `top` · `bottom` · `here`', 'Premier emplacement libre, haut ou pied de colonne, ou le point exact'],
        ['`span`', '`column` · `page` · `side`', 'Une colonne, toute la page ou la colonne latérale'],
        ['`width`', '0–1', 'Fraction de la largeur disponible'],
        ['`align`', '`left` · `center` · `right`', 'Position dans cette largeur'],
        ['`rotate`', '`ccw` · `cw`', 'Un quart de tour, sur une page à part'],
        ['`captionSide`', 'oui · non', 'Légende dans la colonne latérale'],
      ],
    );
  }
  if (lang === 'it') {
    return table(
      ['Campo', 'Valori', 'Effetto'],
      [
        ['`position`', '`auto` · `top` · `bottom` · `here`', 'Prima posizione libera, testa o piede della colonna, o il punto esatto'],
        ['`span`', '`column` · `page` · `side`', 'Una colonna, tutta la pagina o la colonna laterale'],
        ['`width`', '0–1', 'Frazione della larghezza disponibile'],
        ['`align`', '`left` · `center` · `right`', 'Posizione entro quella larghezza'],
        ['`rotate`', '`ccw` · `cw`', 'Un quarto di giro, su una pagina a sé'],
        ['`captionSide`', 'sì · no', 'Didascalia nella colonna laterale'],
      ],
    );
  }
  if (lang === 'pt-BR') {
    return table(
      ['Campo', 'Valores', 'Efeito'],
      [
        ['`position`', '`auto` · `top` · `bottom` · `here`', 'Primeiro espaço livre, topo ou pé da coluna, ou o ponto exato'],
        ['`span`', '`column` · `page` · `side`', 'Uma coluna, a página inteira ou a coluna lateral'],
        ['`width`', '0–1', 'Fração da largura disponível'],
        ['`align`', '`left` · `center` · `right`', 'Posição dentro dessa largura'],
        ['`rotate`', '`ccw` · `cw`', 'Um quarto de volta, numa página própria'],
        ['`captionSide`', 'sim · não', 'Legenda na coluna lateral'],
      ],
    );
  }
  if (lang === 'ca') {
    return table(
      ['Camp', 'Valors', 'Efecte'],
      [
        ['`position`', '`auto` · `top` · `bottom` · `here`', 'Primer espai lliure, capdamunt o peu de columna, o al punt exacte'],
        ['`span`', '`column` · `page` · `side`', 'Una columna, tota la pàgina o la columna lateral'],
        ['`width`', '0–1', 'Fracció de l\'amplada disponible'],
        ['`align`', '`left` · `center` · `right`', 'Posició dins d\'aquesta amplada'],
        ['`rotate`', '`ccw` · `cw`', 'Un quart de volta, en una pàgina pròpia'],
        ['`captionSide`', 'sí · no', 'Peu a la columna lateral'],
      ],
    );
  }
  return lang === 'es'
    ? table(
        ['Campo', 'Valores', 'Efecto'],
        [
          ['`position`', '`auto` · `top` · `bottom` · `here`', 'Primer hueco libre, cabeza o pie de columna, o en el punto exacto'],
          ['`span`', '`column` · `page` · `side`', 'Una columna, toda la página o la columna lateral'],
          ['`width`', '0–1', 'Fracción del ancho disponible'],
          ['`align`', '`left` · `center` · `right`', 'Posición dentro de ese ancho'],
          ['`rotate`', '`ccw` · `cw`', 'Un cuarto de vuelta, en página propia'],
          ['`captionSide`', 'sí · no', 'Pie en la columna lateral'],
        ],
      )
    : table(
        ['Field', 'Values', 'Effect'],
        [
          ['`position`', '`auto` · `top` · `bottom` · `here`', 'First free slot, head or foot of a column, or the exact point'],
          ['`span`', '`column` · `page` · `side`', 'One column, the whole page or the side column'],
          ['`width`', '0–1', 'Fraction of the width available'],
          ['`align`', '`left` · `center` · `right`', 'Position within that width'],
          ['`rotate`', '`ccw` · `cw`', 'A quarter turn, on a page of its own'],
          ['`captionSide`', 'yes · no', 'Caption in the side column'],
        ],
      );
}
