// The table of the chapter on languages (#1296): how many settings each
// edition of the guide sets for itself over the general ones. The counts
// are held to the configurations by `guideClaims.test.ts`.
import type { TableModel } from 'postext';
import type { GuideLang } from './lang.js';
import { table } from './featureTables.js';

/** Settings each group of editions sets for itself (`editionOverride`):
 *  the fewest and the most among the Latin editions (English leaves its
 *  hyphenation to its locale), then each edition in a script of its own.
 *  `general` is the size of the layer they share. */
export const EDITION_OVERRIDES = { general: 1213, latin: [36, 37], ar: 305, zh: 472, ja: 499 };

const WORDS: Record<GuideLang, { head: [string, string, string]; latin: [string, string, string]; ar: [string, string]; zh: [string, string]; ja: [string, string] }> = {
  en: {
    head: ['Editions', 'Script and direction', 'Settings of their own'],
    latin: ['English, Spanish, Catalan, Brazilian Portuguese, French, German, Italian', 'Latin, left to right', 'words only'],
    ar: ['Arabic', 'Arabic, right to left, bound on the right'],
    zh: ['Simplified Chinese', 'Han, vertical, bound on the right'],
    ja: ['Japanese', 'Kanji and kana, vertical, bound on the right'],
  },
  es: {
    head: ['Ediciones', 'Escritura y dirección', 'Ajustes propios'],
    latin: ['Inglés, español, catalán, portugués de Brasil, francés, alemán, italiano', 'Latina, de izquierda a derecha', 'solo palabras'],
    ar: ['Árabe', 'Árabe, de derecha a izquierda, encuadernada a la derecha'],
    zh: ['Chino simplificado', 'Caracteres han, en vertical, encuadernada a la derecha'],
    ja: ['Japonés', 'Kanji y kana, en vertical, encuadernada a la derecha'],
  },
  ca: {
    head: ['Edicions', 'Escriptura i direcció', 'Ajustos propis'],
    latin: ['Anglès, castellà, català, portuguès del Brasil, francès, alemany, italià', 'Llatina, d\'esquerra a dreta', 'només paraules'],
    ar: ['Àrab', 'Àrab, de dreta a esquerra, enquadernat per la dreta'],
    zh: ['Xinès simplificat', 'Han, vertical, enquadernat per la dreta'],
    ja: ['Japonès', 'Kanji i kana, vertical, enquadernat per la dreta'],
  },
  'pt-BR': {
    head: ['Edições', 'Escrita e direção', 'Configurações próprias'],
    latin: ['Inglês, espanhol, catalão, português do Brasil, francês, alemão, italiano', 'Latina, da esquerda para a direita', 'só palavras'],
    ar: ['Árabe', 'Árabe, da direita para a esquerda, encadernada pela direita'],
    zh: ['Chinês simplificado', 'Han, vertical, encadernada pela direita'],
    ja: ['Japonês', 'Kanji e kana, vertical, encadernada pela direita'],
  },
  fr: {
    head: ['Éditions', 'Écriture et sens de lecture', 'Réglages propres'],
    latin: ['Anglais, espagnol, catalan, français, allemand, italien, portugais du Brésil', 'Latine, de gauche à droite', 'des mots seulement'],
    ar: ['Arabe', 'Arabe, de droite à gauche, reliure à droite'],
    zh: ['Chinois simplifié', 'Han, verticale, reliure à droite'],
    ja: ['Japonais', 'Kanji et kana, verticale, reliure à droite'],
  },
  de: {
    head: ['Ausgaben', 'Schrift und Richtung', 'Eigene Einstellungen'],
    latin: ['Englisch, Spanisch, Katalanisch, brasilianisches Portugiesisch, Französisch, Deutsch, Italienisch', 'Lateinisch, von links nach rechts', 'nur Wörter'],
    ar: ['Arabisch', 'Arabisch, von rechts nach links, rechts gebunden'],
    zh: ['Vereinfachtes Chinesisch', 'Han, vertikal, rechts gebunden'],
    ja: ['Japanisch', 'Kanji und Kana, vertikal, rechts gebunden'],
  },
  it: {
    head: ['Edizioni', 'Scrittura e direzione', 'Impostazioni proprie'],
    latin: ['Inglese, spagnolo, catalano, francese, tedesco, italiano, portoghese del Brasile', 'Latina, da sinistra a destra', 'solo parole'],
    ar: ['Arabo', 'Araba, da destra a sinistra, rilegatura a destra'],
    zh: ['Cinese semplificato', 'Caratteri han, in verticale, rilegatura a destra'],
    ja: ['Giapponese', 'Kanji e kana, in verticale, rilegatura a destra'],
  },
  ar: {
    head: ['الطبعات', 'الكتابة والاتجاه', 'إعدادات خاصة بها'],
    latin: ['الإنجليزية، والإسبانية، والكتالانية، والفرنسية، والألمانية، والإيطالية، والبرتغالية البرازيلية', 'لاتينية، من اليسار إلى اليمين', 'كلمات فقط'],
    ar: ['العربية', 'عربية، من اليمين إلى اليسار، مجلَّدة من اليمين'],
    zh: ['الصينية المبسّطة', 'صينية، عمودية، مجلَّدة من اليمين'],
    ja: ['اليابانية', 'كانجي وكانا، عمودية، مجلَّدة من اليمين'],
  },
  'zh-Hans': {
    head: ['版本', '文字与方向', '各自设置的项目'],
    latin: ['英文、西班牙文、加泰罗尼亚文、巴西葡萄牙文、法文、德文、意大利文', '拉丁字母，从左到右', '只有文字'],
    ar: ['阿拉伯文', '阿拉伯字母，从右到左，右侧装订'],
    zh: ['简体中文', '汉字，竖排，右侧装订'],
    ja: ['日文', '汉字和假名，竖排，右侧装订'],
  },
  ja: {
    head: ['版', '文字と組方向', '独自の設定'],
    latin: ['英語、スペイン語、カタルーニャ語、ブラジル・ポルトガル語、フランス語、ドイツ語、イタリア語', 'ラテン文字、左から右', '言葉だけ'],
    ar: ['アラビア語', 'アラビア文字、右から左、右綴じ'],
    zh: ['簡体字中国語', '漢字、縦組み、右綴じ'],
    ja: ['日本語', '漢字と仮名、縦組み、右綴じ'],
  },
};

export function editionLayersTableModel(lang: GuideLang): TableModel {
  const w = WORDS[lang];
  const n = EDITION_OVERRIDES;
  return table(w.head, [
    [w.latin[0], w.latin[1], `${n.latin[0]}–${n.latin[1]} (${w.latin[2]})`],
    [w.ar[0], w.ar[1], String(n.ar)],
    [w.zh[0], w.zh[1], String(n.zh)],
    [w.ja[0], w.ja[1], String(n.ja)],
  ]);
}
