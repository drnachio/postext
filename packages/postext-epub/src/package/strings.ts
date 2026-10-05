// The few words the package writes itself: navigation headings and
// landmark names, in the book's language (English when it has none here).

export interface NavStrings {
  contents: string;
  landmarks: string;
  pages: string;
  cover: string;
  bodymatter: string;
  /** Prefix of a page-list entry (`Page 12`) where a label needs one. */
  page: string;
  /** Landmarks of a book's back matter. */
  index: string;
  bibliography: string;
}

const STRINGS: Readonly<Record<string, NavStrings>> = {
  en: { contents: 'Contents', landmarks: 'Landmarks', pages: 'Pages', cover: 'Cover', bodymatter: 'Start of content', page: 'Page', index: 'Index', bibliography: 'Bibliography' },
  es: { contents: 'Índice', landmarks: 'Puntos de referencia', pages: 'Páginas', cover: 'Cubierta', bodymatter: 'Inicio del contenido', page: 'Página', index: 'Índice alfabético', bibliography: 'Bibliografía' },
  ca: { contents: 'Índex', landmarks: 'Punts de referència', pages: 'Pàgines', cover: 'Coberta', bodymatter: 'Inici del contingut', page: 'Pàgina', index: 'Índex alfabètic', bibliography: 'Bibliografia' },
  fr: { contents: 'Table des matières', landmarks: 'Repères', pages: 'Pages', cover: 'Couverture', bodymatter: 'Début du contenu', page: 'Page', index: 'Index', bibliography: 'Bibliographie' },
  pt: { contents: 'Sumário', landmarks: 'Pontos de referência', pages: 'Páginas', cover: 'Capa', bodymatter: 'Início do conteúdo', page: 'Página', index: 'Índice remissivo', bibliography: 'Bibliografia' },
  it: { contents: 'Indice', landmarks: 'Punti di riferimento', pages: 'Pagine', cover: 'Copertina', bodymatter: 'Inizio del contenuto', page: 'Pagina', index: 'Indice analitico', bibliography: 'Bibliografia' },
  de: { contents: 'Inhalt', landmarks: 'Orientierungspunkte', pages: 'Seiten', cover: 'Umschlag', bodymatter: 'Beginn des Inhalts', page: 'Seite', index: 'Register', bibliography: 'Literaturverzeichnis' },
  zh: { contents: '目录', landmarks: '导航', pages: '页码', cover: '封面', bodymatter: '正文', page: '第', index: '索引', bibliography: '参考文献' },
  ja: { contents: '目次', landmarks: 'ランドマーク', pages: 'ページ', cover: '表紙', bodymatter: '本文', page: 'p.', index: '索引', bibliography: '参考文献' },
  ar: { contents: 'المحتويات', landmarks: 'معالم الكتاب', pages: 'الصفحات', cover: 'الغلاف', bodymatter: 'بداية المحتوى', page: 'صفحة', index: 'الفهرس الأبجدي', bibliography: 'المراجع' },
};

/** The navigation strings of a BCP 47 language tag. */
export function navStrings(language: string): NavStrings {
  const primary = language.toLowerCase().split(/[-_]/)[0] ?? 'en';
  return STRINGS[primary] ?? STRINGS.en!;
}

/** Whether a language is written right to left (its base direction). */
export function isRtlLanguage(language: string): boolean {
  const primary = language.toLowerCase().split(/[-_]/)[0] ?? '';
  return ['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb'].includes(primary);
}
