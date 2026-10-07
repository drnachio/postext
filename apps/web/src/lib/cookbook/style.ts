/**
 * Voice check: phrases and turns that make prose read as machine-written
 * ("delve into", "a testament to", "sumérgete en", "juega un papel
 * crucial", "¿El resultado?"). The owner does not want them in the
 * Cookbook: `hard` phrases fail the lint, `soft` ones warn, since they
 * can be fine in context (a literal journey, a bustling market in a
 * novel). Code, excerpts and MDX tags are ignored. Chinese prose, in a
 * write-up or in an original sample, is checked against a Chinese list
 * whatever the file's language (值得一提的是, 众所周知, 总而言之), and
 * Japanese prose against a Japanese one (と言えるでしょう, シームレス,
 * 重要な役割を果たす). A sentence with kana in it is Japanese, so the kanji
 * words both languages write (極致, 全方位) are judged by the Japanese list
 * alone. Quoted classics are left alone, since sample files are only
 * checked when the text is the recipe's own.
 *
 * Isomorphic and pure.
 */
import type { Locale } from "./types.ts";

export interface StyleFinding {
  severity: "fail" | "warn";
  /** The words as written. */
  phrase: string;
  /** Which rule matched (e.g. "let's dive in"). */
  rule: string;
  /** The sentence it occurs in, trimmed. */
  context: string;
}

type Rule = { re: RegExp; label: string };

const rule = (source: string, label = source): Rule => ({ re: new RegExp(source, "giu"), label });

/** An Arabic phrase as a whole word or words: `\\b` only sees ASCII letters. */
const arRule = (source: string, label = source): Rule => rule(`(?<!\\p{L})(?:${source})(?!\\p{L})`, label);

/** A Portuguese phrase as a whole word or words: `\\b` would cut "não" or
 *  "ênfase" at the accented letter. */
const ptRule = (source: string, label = source): Rule => rule(`(?<!\\p{L})(?:${source})(?!\\p{L})`, label);

const HARD: Record<Locale, Rule[]> = {
  en: [
    rule("\\bdelv(e|es|ed|ing)\\b", "delve"),
    rule("\\btapestr(y|ies)\\b", "tapestry"),
    rule("\\ba testament to\\b", "a testament to"),
    rule("\\bin today['’]s (fast-paced|digital|modern) world\\b", "in today's … world"),
    rule("\\bever-(evolving|changing) (world|landscape)\\b", "ever-evolving landscape"),
    rule("\\bseamless(ly)?\\b", "seamless"),
    rule("\\b(unlock|unleash)(es|ed|ing)? (the|your|its|a) (full )?(power|potential)\\b", "unlock the power/potential"),
    rule("\\bgame[- ]changer\\b", "game-changer"),
    rule("\\blook no further\\b", "look no further"),
    rule("\\b(let['’]s|let us) (dive|delve|explore|take a (closer )?look)\\b", "let's dive in"),
    rule("\\b(deep dive|dive (deep )?into)\\b", "dive into"),
    rule("\\bembark(s|ed|ing)? on\\b", "embark on"),
    rule("\\bharness(es|ed|ing)? the power\\b", "harness the power"),
    rule("\\ba (symphony|treasure trove|masterclass) (of|in)\\b", "a symphony/treasure trove of"),
    rule("\\bwhether you['’]re an? \\w+ or\\b", "whether you're a … or …"),
    rule("\\b(picture this|imagine a world)\\b", "picture this"),
    rule("\\bin the realm of\\b", "in the realm of"),
    rule("\\bnavigat(e|es|ing) the (complexities|intricacies|world)\\b", "navigate the complexities"),
    rule("\\bplays? an? (crucial|vital|key|pivotal|essential) role\\b", "plays a crucial role"),
    rule("\\b(in conclusion|in summary|to sum up)\\b", "in conclusion"),
    rule("\\bempower(s|ed|ing)?\\b", "empower"),
    rule("\\beffortless(ly)?\\b", "effortless"),
    rule("\\bnestled\\b", "nestled"),
    rule("\\bstands? as a\\b", "stands as a"),
    rule("\\bit['’]?s (not just|more than just)\\b", "it's not just"),
    rule("\\b(elevate|elevates|elevating) (your|the|any)\\b", "elevate your"),
  ],
  es: [
    rule("\\b(sumérge(te|nos)|sumergirnos|sumergirte|adentr(é|e)monos|adentrarnos en el (fascinante|apasionante))\\b", "sumérgete / adentrémonos"),
    rule("\\ben (el|este) (vertiginoso|cambiante) mundo\\b", "en el vertiginoso mundo"),
    rule("\\ben (el mundo actual|la era digital|constante evolución)\\b", "en el mundo actual / en constante evolución"),
    rule("\\bsin fisuras\\b", "sin fisuras"),
    rule("\\bdesbloque(a|ar|an)\\b", "desbloquear"),
    rule("\\b(es )?un (verdadero |auténtico )?testimonio de\\b", "un testimonio de"),
    rule("\\bjuega(n)? un papel (crucial|fundamental|clave|vital|esencial)\\b", "juega un papel crucial"),
    rule("\\b(cabe|vale la pena) (destacar|señalar|mencionar|resaltar)\\b", "cabe destacar"),
    rule("\\bes (importante|fundamental) (destacar|señalar|mencionar|resaltar)\\b", "es importante destacar"),
    rule("\\b(en resumen|en conclusión|en definitiva|para concluir)\\b", "en resumen / en conclusión"),
    rule("\\b(toda una experiencia|una auténtica joya|una verdadera joya)\\b", "toda una experiencia"),
    rule("\\b(al siguiente|a otro) nivel\\b", "llevar al siguiente nivel"),
    rule("\\bun (amplio )?abanico de (posibilidades|opciones|recursos|herramientas|estilos)\\b", "un abanico de posibilidades"),
    rule("\\bun sinfín de\\b", "un sinfín de"),
    rule("\\baprovecha(r)? al máximo\\b", "aprovechar al máximo"),
  ],
  ca: [
    rule("\\b(submergeix-te|submergim-nos|endinsem-nos|endinsar-nos en el (fascinant|apassionant))\\b", "submergeix-te / endinsem-nos"),
    rule("\\ben (el|aquest) (vertiginós|canviant) món\\b", "en el vertiginós món"),
    rule("\\ben (el món actual|l['’]era digital|constant evolució)\\b", "en el món actual / en constant evolució"),
    rule("\\bsense fissures\\b", "sense fissures"),
    rule("\\bdesbloque(ja|jar|gen)\\b", "desbloquejar"),
    rule("\\b(és )?un (veritable |autèntic )?testimoni de\\b", "un testimoni de"),
    rule("\\b(juga|juguen|jugar) un paper (crucial|fonamental|clau|vital|essencial)\\b", "juga un paper crucial"),
    rule("\\b(cal|val la pena) (destacar|assenyalar|esmentar|remarcar)\\b", "cal destacar"),
    rule("(?<!\\p{L})és (important|fonamental) (destacar|assenyalar|esmentar|remarcar)\\b", "és important destacar"),
    rule("\\b(en resum|en conclusió|en definitiva|per concloure)\\b", "en resum / en conclusió"),
    rule("\\b(tota una experiència|una autèntica joia|una veritable joia)\\b", "tota una experiència"),
    rule("\\b(al següent|a un altre) nivell\\b", "portar al següent nivell"),
    rule("\\bun (ampli )?ventall de (possibilitats|opcions|recursos|eines|estils)\\b", "un ventall de possibilitats"),
    rule("\\buna infinitat de\\b", "una infinitat de"),
    rule("\\btreure(-ne)? el màxim (profit|partit)\\b", "treure el màxim profit"),
  ],
  pt: [
    ptRule("mergulh(e|ar|emos|amos) (em|no|na|nos|nas|fundo)|vamos mergulhar", "mergulhe em / vamos mergulhar"),
    ptRule("no (vertiginoso|mundo) (mundo )?(atual|digital|em constante (evolução|mudança))", "no mundo atual / em constante evolução"),
    ptRule("na era digital|em constante evolução", "na era digital / em constante evolução"),
    ptRule("(de forma|de maneira) (perfeita|impecável)mente integrad[ao]|perfeitamente integrad[ao]s?|sem esforço", "perfeitamente integrado / sem esforço"),
    ptRule("desbloque(ie|ar|ia|iam)", "desbloquear"),
    ptRule("(é )?um (verdadeiro |autêntico )?testemunho d[eoa]", "um testemunho de"),
    ptRule("desempenh(a|am|ar) um papel (crucial|fundamental|chave|vital|essencial)", "desempenha um papel crucial"),
    ptRule("vale (a pena )?(ressaltar|destacar|mencionar|notar)", "vale ressaltar"),
    ptRule("é (importante|fundamental) (ressaltar|destacar|mencionar|notar)", "é importante ressaltar"),
    ptRule("em (resumo|suma|conclusão)|para concluir", "em resumo / em conclusão"),
    ptRule("uma verdadeira joia|uma experiência única", "uma verdadeira joia"),
    ptRule("(ao|a outro|para o próximo) nível", "levar ao próximo nível"),
    ptRule("uma (ampla )?gama de (possibilidades|opções|recursos|ferramentas|estilos)", "uma gama de possibilidades"),
    ptRule("uma infinidade de", "uma infinidade de"),
    ptRule("aproveit(e|ar) ao máximo", "aproveitar ao máximo"),
  ],
  // HARD_ZH, below, checks Chinese prose in every locale.
  zh: [],
  ar: [
    arRule("في (?:عالم|عصر) [^.؟!،]{0,30}(?:المتسارع|المتغير|المتطور|الرقمي)", "في عالم … المتسارع"),
    arRule("(?:انطلق|لننطلق|ننطلق) في رحلة", "انطلق في رحلة"),
    arRule("(?:غني|غنيّ) عن (?:القول|البيان)", "غني عن القول"),
    arRule("لا يخفى على (?:أحد|أحدٍ)", "لا يخفى على أحد"),
    arRule("(?:تجدر|وتجدر) الإشارة (?:إلى|الى) أن", "تجدر الإشارة إلى أن"),
    arRule("(?:في|وفي) (?:الختام|نهاية المطاف|خلاصة القول)", "في الختام"),
    arRule("(?:يلعب|تلعب|يؤدي|تؤدي) دورًا (?:محوريًا|حاسمًا|حيويًا|جوهريًا)", "يلعب دورًا محوريًا"),
    arRule("إطلاق العنان", "إطلاق العنان"),
    arRule("نقلة نوعية", "نقلة نوعية"),
    arRule("(?:ب|ب)كل سلاسة", "بكل سلاسة"),
    arRule("(?:إلى|الى) (?:المستوى|مستوى) (?:التالي|آخر)", "إلى المستوى التالي"),
    arRule("(?:عالم|عالمًا) من الإمكانيات", "عالم من الإمكانيات"),
  ],
  // HARD_JA, below, checks Japanese prose (sentences with kana) in every
  // locale, a ja write-up included.
  ja: [],
};

const SOFT: Record<Locale, Rule[]> = {
  en: [
    rule("\\b(vibrant|bustling|breathtaking|stunning|captivating|intricate|meticulous(ly)?)\\b", "vivid-adjective"),
    rule("\\b(crucial|pivotal|paramount)\\b", "crucial/pivotal"),
    rule("\\b(robust|leverag(e|es|ed|ing)|cutting-edge|state-of-the-art)\\b", "robust/leverage/cutting-edge"),
    rule("(^|[.!?]\\s+)(Moreover|Furthermore|Additionally|Notably|Ultimately|Importantly),", "Moreover/Furthermore,"),
    rule("\\b(in essence|at its core|it['’]?s worth noting|it is worth noting)\\b", "in essence / worth noting"),
    rule("\\bnot only\\b[^.!?]{1,80}\\bbut also\\b", "not only … but also"),
    rule("\\bThe (result|answer|catch|trick|twist|secret|payoff)\\?", "The result? (reveal)"),
    rule("(^|[.!?]\\s+)Here['’]s (the thing|why|how|what)\\b", "Here's why"),
    rule("\\bthe (art|magic|beauty) of\\b", "the art/magic of"),
    rule("\\b(journey|realm)\\b", "journey/realm"),
  ],
  es: [
    rule("\\b(fascinante|apasionante|vibrante|impresionante|cautivador(a)?|meticulos(o|a|amente))\\b", "fascinante/vibrante"),
    rule("\\b(crucial|robust(o|a)|de vanguardia|a la vanguardia)\\b", "crucial/robusto/vanguardia"),
    rule("\\bsin lugar a dudas\\b", "sin lugar a dudas"),
    rule("\\bno (solo|sólo)\\b[^.!?]{1,80}\\bsino (también|que)\\b", "no solo … sino también"),
    rule("¿(El|La) (resultado|clave|truco|secreto|respuesta)\\?", "¿El resultado? (revelación)"),
    rule("(^|[.!?]\\s+)Imagina\\b", "Imagina…"),
    rule("\\b(en el corazón de|el arte de|la magia de)\\b", "en el corazón de / el arte de"),
    rule("\\bun viaje\\b", "un viaje"),
    rule("\\bde manera (fluida|eficiente|efectiva)\\b", "de manera fluida"),
    rule("\\bdescubre (cómo|todo)\\b", "descubre cómo"),
    rule("\\bno es (solo|sólo|simplemente) un\\b", "no es solo un"),
    rule("\\bpotencia(r)? (tu|su|sus|tus)\\b", "potenciar"),
  ],
  ca: [
    rule("\\b(fascinant|apassionant|vibrant|impressionant|captivador(a)?|meticulos(a|ament))\\b", "fascinant/vibrant"),
    rule("\\b(crucial|robust(a|os|es)?|d['’]avantguarda|a l['’]avantguarda)\\b", "crucial/robust/avantguarda"),
    rule("\\bsens(e)? cap mena de dubte\\b", "sense cap mena de dubte"),
    rule("\\bno (només|sols)\\b[^.!?]{1,80}\\bsinó (també|que)\\b", "no només … sinó també"),
    rule("¿?(El|La) (resultat|clau|truc|secret|resposta)\\?", "El resultat? (revelació)"),
    rule("(^|[.!?]\\s+)Imagina\\b", "Imagina…"),
    rule("\\b(al cor de|l['’]art de|la màgia de)\\b", "al cor de / l'art de"),
    rule("\\bun viatge\\b", "un viatge"),
    rule("\\bde manera (fluida|eficient|efectiva)\\b", "de manera fluida"),
    rule("\\bdescobreix (com|tot)\\b", "descobreix com"),
    rule("\\bno és (només|simplement) un\\b", "no és només un"),
    rule("\\bpotencia(r)? (el teu|la teva|els teus|les teves|el seu|la seva)\\b", "potenciar"),
  ],
  pt: [
    ptRule("fascinantes?|apaixonantes?|vibrantes?|impressionantes?|cativantes?|meticulos(o|a|os|as|amente)", "fascinante/vibrante"),
    ptRule("crucia(l|is)|robust(o|a|os|as)|de ponta|de vanguarda", "crucial/robusto/de ponta"),
    ptRule("sem sombra de dúvida(s)?", "sem sombra de dúvida"),
    ptRule("não (só|apenas|somente)[^.!?]{1,80}mas (também|sim)", "não apenas … mas também"),
    rule("(O|A) (resultado|chave|truque|segredo|resposta)\\?", "O resultado? (revelação)"),
    rule("(^|[.!?]\\s+)Imagine\\b", "Imagine…"),
    ptRule("no coração d[eoa]|a arte de|a magia d[eoa]", "no coração de / a arte de"),
    ptRule("uma jornada", "uma jornada"),
    ptRule("de (forma|maneira) (fluida|eficiente|eficaz)", "de forma fluida"),
    ptRule("descubra (como|tudo)", "descubra como"),
    ptRule("não é (só|apenas|simplesmente) um", "não é apenas um"),
    ptRule("potencializ(e|ar) (seu|sua|seus|suas)", "potencializar"),
  ],
  // SOFT_ZH, below, checks Chinese prose in every locale.
  zh: [],
  ar: [
    arRule("(?:مذهل|مذهلة|رائع|رائعة|ساحر|ساحرة|مبهر|مبهرة|فريد من نوعه)", "مذهل/رائع/مبهر"),
    arRule("(?:اكتشف|اكتشفوا) كيف", "اكتشف كيف"),
    arRule("ليس (?:مجرد|فقط)[^.؟!]{1,80}بل", "ليس مجرد … بل"),
    arRule("(?:في قلب|فن|سحر) (?:ال)", "في قلب / فن / سحر"),
    arRule("(?:تخيّل|تخيل)", "تخيّل…"),
    arRule("بلا شك|دون أدنى شك", "بلا شك"),
    arRule("رحلة", "رحلة"),
  ],
  // SOFT_JA, below, checks Japanese prose in every locale.
  ja: [],
};

/** Stock phrases of Chinese prose written by machine, in Simplified and
 *  Traditional characters. Chinese has no word boundaries, so the rules
 *  match characters, not words (no `\b`, which never fires between two
 *  Han characters). */
const HARD_ZH: Rule[] = [
  rule("值得一提的是", "值得一提的是"),
  rule("值得注意的是|值得[关關]注的是", "值得注意的是"),
  rule("[众眾]所周知", "众所周知"),
  rule("不言而喻", "不言而喻"),
  rule("[总總]而言之|[总總]的[来來][说說]", "总而言之"),
  rule("[综綜]上所述", "综上所述"),
  rule("在[当當]今[^，。！？、\\s]{0,12}?(?:[时時]代|世界|社[会會])", "在当今…时代"),
  rule("[让讓]我[们們]一起(?:来[看探]|[来來]?探索|走[进進]|深入)", "让我们一起"),
  rule("[让讓]我[们們](?:[来來])?(?:看看|探索|探[讨討]|深入|走[进進]|揭[开開])", "让我们…"),
  rule("深入探[讨討]", "深入探讨"),
  rule("一站式", "一站式"),
  rule("完美(?:地|的)?(?:[实實]现|解[决決]|呈[现現]|融合|契合|平衡)", "完美地"),
  rule("(?:开启|開啟)[^，。！？]{0,10}?(?:之旅|的旅程|新篇章)", "开启…之旅"),
  rule("(?:释放|釋放)[^，。！？]{0,8}?(?:潜力|潛力|力量)", "释放…的潜力"),
  rule("改[变變]游[戏戲][规規][则則]|[颠顛][覆]性", "改变游戏规则"),
  rule("扮演[着著][^，。！？]{0,8}?(?:重要|[关關][键鍵]|至[关關]重要)的?角色", "扮演着重要的角色"),
  // 无缝 only with the verb it props up: 天衣无缝 is an idiom and 毫无缝隙
  // reads 毫无 + 缝隙. 赋能 is not 天赋 + 能力 or 禀赋 + 能力.
  rule("[无無][缝縫](?:衔接|銜接|集成|对接|對接|切换|切換|连接|連接|整合|体验|體驗)", "无缝"),
  rule("(?<![天禀稟])[赋賦]能(?!力)", "赋能"),
];

const SOFT_ZH: Rule[] = [
  rule("至[关關]重要|不可或缺", "至关重要"),
  rule("[随隨][着著][^，。！？]{0,16}?的?(?:不[断斷]|飞速|飛速|迅速|快速)?(?:[发發]展|普及|[进進]步)", "随着…的发展"),
  // Not 借助 + 力量 or 辅助 + 力.
  rule("精心打造|打造|(?<![借辅輔])助力(?!量)", "打造/助力"),
  rule("独特的魅力|獨特的魅力|璀璨|[画畫]卷", "独特的魅力/画卷"),
  rule("(?:^|[。！？]\\s*)此外，", "此外，"),
  rule("不[仅僅]仅?[^。！？]{1,40}?(?:更|而且|[还還])", "不仅……更"),
  rule("需要注意的是", "需要注意的是"),
  rule("(?:锦上添花|錦上添花|画龙点睛|畫龍點睛|事半功倍|游刃有余|遊刃有餘)", "锦上添花/画龙点睛"),
  rule("全方位|极致|極致|轻松(?:实现|搞定|打造)|輕鬆(?:實現|搞定|打造)", "全方位/极致/轻松实现"),
  rule("(?:^|[。！？]\\s*)(?:首先|其次|最后|最後)，[^。！？]*[。！？]\\s*(?:其次|最后|最後)，", "首先……其次……最后"),
];

/** Stock phrases of Japanese prose written by machine: the hedged close
 *  (と言えるでしょう), the importance formula (することが重要です, 重要な
 *  役割を果たす), the reader invited along (一緒に見ていきましょう), the
 *  welcome and the wrap-up (の世界へようこそ, いかがでしたか, まとめると、)
 *  and the katakana of marketing copy (シームレス, ゲームチェンジャー). They
 *  are judged in Japanese sentences only (see `styleFindings`), and match
 *  characters, as the Chinese rules do. */
const HARD_JA: Rule[] = [
  rule("と(?:言|い)える(?:でしょう|だろう)", "と言えるでしょう"),
  rule("と(?:言|い)っても過言では(?:ありません|ない)", "と言っても過言ではありません"),
  rule("(?:こと|の)が(?:重要|大切|肝要|不可欠)(?:です|である|となります)", "することが重要です"),
  rule("(?:重要|大切|大き|中心的|不可欠|決定的|欠かせない|極めて重要)な?役割を(?:果た|担)", "重要な役割を果たす"),
  rule("(?:の世界|の旅|の旅路)へようこそ", "の世界へようこそ"),
  rule("いかがでしたか", "いかがでしたか"),
  rule("(?:^|[。！？\\s])(?:まとめると|結論として|要約すると|総じて言えば)、", "まとめると、"),
  rule("言うまでもなく|言うまでもありません", "言うまでもなく"),
  rule("(?:周知の|ご存じの|ご存知の)(?:とおり|通り)", "周知のとおり"),
  rule("(?:特筆|注目)すべき(?:点|こと)?は", "特筆すべきは"),
  rule("(?:今日|現代|昨今)の[^、。！？\\s]{0,12}?(?:社会|時代|世界)(?:において|では)", "現代の…社会において"),
  rule("(?:一緒に|共に|ともに)(?:見て|探って|学んで|考えて|掘り下げて)(?:いきましょう|みましょう)", "一緒に見ていきましょう"),
  rule("(?:掘り下げ|深掘り)(?:して)?(?:て)?(?:いきましょう|みましょう)", "掘り下げていきましょう"),
  rule("想像してみて(?:ください|下さい)", "想像してみてください"),
  rule("(?:可能性|潜在能力|ポテンシャル|真価)を(?:解き放|最大限に引き出)", "可能性を解き放つ"),
  rule("新たな(?:扉|地平|次元|可能性)を(?:開|拓|切り開|切り拓)", "新たな扉を開く"),
  rule("次の(?:レベル|ステージ)(?:へ|に)", "次のレベルへ"),
  rule("シームレス", "シームレス"),
  rule("ゲームチェンジャー|エンパワー", "ゲームチェンジャー/エンパワー"),
  rule("ワンストップ", "ワンストップ"),
  rule("の宝庫", "の宝庫"),
  rule("徹底(?:解説|解剖)", "徹底解説"),
];

const SOFT_JA: Rule[] = [
  rule("まさに", "まさに"),
  rule("(?:革新|画期|魅力|圧倒|包括)的な", "革新的な/魅力的な"),
  rule("唯一無二|比類(?:の|な)き", "唯一無二"),
  rule("堅牢な|ロバストな|最先端の", "堅牢な/最先端の"),
  rule("不可欠|極めて重要", "不可欠"),
  rule("(?:鍵|カギ)(?:となる|を握る)|重要な(?:鍵|カギ)", "鍵となる"),
  rule("を実現(?:します|できます|しました)", "を実現します"),
  rule("ではないでしょうか", "ではないでしょうか"),
  rule("単に[^。！？]{1,30}?(?:だけ|のみ)で(?:は)?なく", "単に…だけでなく"),
  rule("(?:その)?(?:答え|結果|秘密|秘訣|鍵|カギ)は[？?]", "その答えは？（種明かし）"),
  rule("奥深い世界|の奥深さ|の魅力に迫", "奥深い世界/魅力に迫る"),
  rule("魔法の(?:よう|ように|ような)", "魔法のよう"),
  rule("まず、[^。！？]*[。！？][\\s\\S]{0,200}?次に、[\\s\\S]{0,200}?最後に、", "まず……次に……最後に"),
];

/** Letters of Chinese and Japanese writing (Han, kana with the long-vowel
 *  mark ー, bopomofo): what a Chinese reader counts as characters. Korean
 *  spaces its words, so hangul is counted in words like Latin text. */
const CJK_LETTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}\u30fc\uff70]/gu;
/** Fullwidth digits and Latin letters (Ａ, １): words, set wide. */
const FULLWIDTH_ALNUM = /[\uff10-\uff19\uff21-\uff3a\uff41-\uff5a]/gu;
const HANGUL = /\p{Script=Hangul}/u;
/** CJK letters and the punctuation and fullwidth forms set with them
 *  (hangul included: an em dash against it is Korean punctuation). */
const CJK_TEXT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u30fc\u3000-\u303f\uff00-\uffef\ufe10-\ufe1f\ufe30-\ufe4f]/gu;

/** Hiragana and katakana, the kana supplement and the half-width forms
 *  included: no Chinese text writes them, so a sentence holding one is
 *  Japanese. (ー and ・ are shared with Chinese typography: not counted.) */
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** How many CJK characters a text of one English word runs to: a Chinese
 *  translation takes about 1.7 characters for each English word, so the
 *  Cookbook's 2,500-word sample holds about 4,250 characters. */
export const CJK_CHARS_PER_WORD = 1.7;

/** The same for Japanese, whose kana spell out the particles, endings and
 *  loanwords Chinese writes in one character or leaves out. Translators
 *  bill 2 to 2.5 Japanese characters (punctuation included, about 7 % of
 *  them) to the English word; counted in letters as here, that is 1.9–2.3.
 *  Two literary pairs measured with this module's letter count: Akutagawa's
 *  羅生門 (Aozora 127) against Kojima Takashi's 1952 translation, 5,087
 *  letters for 2,270 words (2.24); Sōseki's 坊っちゃん (Aozora 752) against
 *  Morri's freer 1919 version, 82,063 for 47,719 (1.72). 2.2 sits in the
 *  translators' range and near the closer translation, so a Japanese
 *  sample holds about 5,500 letters. */
export const JAPANESE_CHARS_PER_WORD = 2.2;

/** The sentences of a text (cut after 。！？ and at line ends) and whether
 *  each is Japanese: it holds kana, or it is all kanji (a heading, a
 *  kanbun line) in a text whose kana sentences outweigh the others. */
function sentences(text: string): { start: number; end: number; japanese: boolean }[] {
  const out: { start: number; end: number; japanese: boolean; letters: number }[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i < text.length && !"。！？\n".includes(text[i])) continue;
    const end = Math.min(i + 1, text.length);
    if (end > start) {
      const slice = text.slice(start, end);
      out.push({ start, end, japanese: KANA.test(slice), letters: (slice.match(CJK_LETTER) ?? []).length });
    }
    start = end;
  }
  const sum = (japanese: boolean) => out.reduce((n, s) => n + (s.japanese === japanese ? s.letters : 0), 0);
  if (sum(true) > sum(false)) for (const s of out) if (s.letters) s.japanese = true;
  return out;
}

/** The length of a text for the Cookbook's caps: `words` counts the
 *  whitespace-separated tokens holding a letter or a digit once Chinese and
 *  Japanese text is taken out (fullwidth Ａ１ read as A1, Korean by its
 *  spaced words), `cjk` the Han, kana and bopomofo characters, `japanese`
 *  those of them in Japanese sentences, and `total` all in words (Chinese
 *  `/ 1.7`, Japanese `/ 2.2`, rounded). */
export function textLength(text: string): { words: number; cjk: number; japanese: number; total: number } {
  const cjk = (text.match(CJK_LETTER) ?? []).length;
  const japanese = sentences(text)
    .filter((s) => s.japanese)
    .reduce((n, s) => n + (text.slice(s.start, s.end).match(CJK_LETTER) ?? []).length, 0);
  const latin = text
    .replace(FULLWIDTH_ALNUM, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(CJK_TEXT, (ch) => (HANGUL.test(ch) ? ch : " "));
  const words = latin.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
  const total = words + (cjk - japanese) / CJK_CHARS_PER_WORD + japanese / JAPANESE_CHARS_PER_WORD;
  return { words, cjk, japanese, total: Math.round(total) };
}

/** `prose` split for the language lists: `japanese` keeps its Japanese
 *  sentences and blanks the rest, `other` the reverse. Blanking keeps every
 *  offset, so a match points into `prose` for its context. */
function splitJapanese(prose: string): { japanese: string; other: string } {
  const blank = (s: string) => " ".repeat(s.length);
  let japanese = "";
  let other = "";
  for (const s of sentences(prose)) {
    const slice = prose.slice(s.start, s.end);
    japanese += s.japanese ? slice : blank(slice);
    other += s.japanese ? blank(slice) : slice;
  }
  return { japanese, other };
}

/** Prose only: drops fenced code, inline code, MDX/HTML tags, frontmatter
 *  delimiters and Postext directives, so identifiers never trigger a rule. */
export function proseOf(text: string): string {
  return text
    .replace(/^---\n[\s\S]*?\n---\n/, (fm) => fm.replace(/^[a-zA-Z]+:\s*/gm, "")) // keep frontmatter values
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/<[^>\n]*>/g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/^:{2,3}.*$/gm, " ")
    .replace(/:(ref|chip|swatch)(\[[^\]]*\])?\{[^}]*\}/g, " ")
    .replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g, " ");
}

/** Where sentences end: a full stop, a line break, or a Chinese or
 *  Japanese stop mark. */
const SENTENCE_END = [".", "\n", "。", "！", "？"];

function sentenceAround(text: string, index: number): string {
  const start = Math.max(...SENTENCE_END.map((mark) => text.lastIndexOf(mark, index))) + 1;
  const end = SENTENCE_END.map((mark) => text.indexOf(mark, index)).filter((n) => n >= 0).reduce((a, b) => Math.min(a, b), text.length);
  return text.slice(start, end + 1).trim().slice(0, 160);
}

/** Em dashes that are not Chinese punctuation: the 破折号 is two of them
 *  (——), and one set against a CJK character belongs to that text. */
function latinDashes(prose: string): number {
  const cjk = CJK_TEXT.source;
  const chinese = new RegExp(`—{2,}|(?<=${cjk})—|—(?=${cjk})`, "gu");
  return (prose.replace(chinese, "").match(/—/g) ?? []).length;
}

/** Findings for one text in one language. `emDashLimit` warns when the
 *  prose uses more em dashes than one per that many words (a strong tell
 *  outside dialogue; set it to 0 for dialogue-heavy samples). */
export function styleFindings(text: string, locale: Locale, { emDashLimit = 90 }: { emDashLimit?: number } = {}): StyleFinding[] {
  const prose = proseOf(text);
  const findings: StyleFinding[] = [];
  const scan = (rules: Rule[], severity: StyleFinding["severity"], source = prose) => {
    for (const { re, label } of rules) {
      re.lastIndex = 0;
      for (const match of source.matchAll(re)) {
        findings.push({ severity, phrase: match[0].replace(/^[.!?。！？\s]+/, "").trim(), rule: label, context: sentenceAround(prose, match.index ?? 0) });
      }
    }
  };
  // Chinese rules outside the Japanese sentences, Japanese rules inside them.
  const { japanese, other } = splitJapanese(prose);
  scan(HARD[locale], "fail");
  scan(HARD_ZH, "fail", other);
  scan(HARD_JA, "fail", japanese);
  scan(SOFT[locale], "warn");
  scan(SOFT_ZH, "warn", other);
  scan(SOFT_JA, "warn", japanese);
  if (emDashLimit > 0) {
    const words = textLength(prose).total;
    const dashes = latinDashes(prose);
    if (dashes > 2 && dashes > words / emDashLimit) {
      findings.push({ severity: "warn", phrase: `${dashes} em dashes in ${words} words`, rule: "em dashes", context: "use commas, colons, parentheses or full stops instead of most em dashes" });
    }
  }
  return findings;
}

/** Lint messages for a file, deduplicated by phrase. */
export function styleMessages(file: string, text: string, locale: Locale, options?: { emDashLimit?: number }): { fails: string[]; warns: string[] } {
  const fails = new Map<string, string>();
  const warns = new Map<string, string>();
  for (const f of styleFindings(text, locale, options)) {
    const target = f.severity === "fail" ? fails : warns;
    const key = f.phrase.toLowerCase();
    if (!target.has(key)) {
      target.set(key, `${file}: reads machine-written ("${f.phrase}" in “${f.context}”); rewrite it plainly (cookbook/README.md › Voice)`);
    }
  }
  return { fails: [...fails.values()], warns: [...warns.values()] };
}
