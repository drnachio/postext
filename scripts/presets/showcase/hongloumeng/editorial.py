"""Editorial matter of the `hongloumeng` bundle: the wording of the front and
back matter in each edition (zh-Hant, zh-Hans, en), the titles and labels the
design prints, and the characters of the index with the place of their first
appearance.

The Chinese texts are written for this edition, in each script (the
Traditional wording follows Taiwan usage); the English ones too. Every claim
is one a reader can check against the sources listed in the credits.
"""
from __future__ import annotations

LANGS = ("zh-Hant", "zh-Hans", "en")

# --- titles and labels ----------------------------------------------------------------

BOOK: dict[str, dict] = {
    "zh-Hant": {
        "title": "紅樓夢",
        # The book's metadata (the first file's front matter): `{title}`,
        # the PDF's /Title and /Author.
        "metadata": {"title": "紅樓夢", "author": "曹雪芹"},
        "title_vertical": "紅\n樓\n夢",
        "slip_note": "程乙本",
        "author": "曹雪芹　著",
        "editors": "程偉元　高鶚　整理",
        "cover": "封面",
        "title_page": "扉頁",
        "edition_title": "出版說明",
        "prefaces": {"cheng": "程偉元序", "gao": "高鶚敘", "yinyan": "引言"},
        "gallery_title": "繡像",
        "contents": "目錄",
        "index_title": "主要人物索引",
        "credits_title": "來源與版權",
        "part": ("卷{n}", "第{a}回至第{b}回"),
        "portrait_type": ("繡像", "像"),
        "plate_type": ("回圖", "圖"),
        "figure_type": ("圖", "圖"),
    },
    "zh-Hans": {
        "title": "红楼梦",
        "metadata": {"title": "红楼梦", "author": "曹雪芹"},
        "title_vertical": "红\n楼\n梦",
        "slip_note": "程乙本",
        "author": "曹雪芹　著",
        "editors": "程伟元　高鹗　整理",
        "cover": "封面",
        "title_page": "扉页",
        "edition_title": "出版说明",
        "prefaces": {"cheng": "程伟元序", "gao": "高鹗叙", "yinyan": "引言"},
        "gallery_title": "绣像",
        "contents": "目录",
        "index_title": "主要人物索引",
        "credits_title": "来源与版权",
        "part": ("卷{n}", "第{a}回至第{b}回"),
        "portrait_type": ("绣像", "像"),
        "plate_type": ("回图", "图"),
        "figure_type": ("图", "图"),
    },
    "en": {
        "title": "Hung Lou Meng",
        "subtitle": "or, The Dream of the Red Chamber",
        "metadata": {"title": "Hung Lou Meng", "subtitle": "or, The Dream of the Red Chamber", "author": "Cao Xueqin"},
        "author": "Cao Xueqin",
        "translator": "Translated by H. Bencraft Joly",
        "extent": "Chapters I–LVI",
        "cover": "Title page",
        "edition_title": "A Note on This Edition",
        "preface_title": "Translator’s Preface",
        "gallery_title": "Portraits",
        "contents": "Contents",
        "index_title": "Index of Characters",
        "credits_title": "Sources and Credits",
        "running_head": "THE DREAM OF THE RED CHAMBER",
        "chapter_label": "CHAPTER",
        # Joly published the translation in two books: I (chapters 1–24, 1892)
        # and II (25–56, 1893).
        "parts": [("I", "Chapters I–XXIV", 1, 24), ("II", "Chapters XXV–LVI", 25, 56)],
        "part_label": "BOOK",
        "portrait_type": ("Portrait", "Portrait"),
        "plate_type": ("Chapter plate", "Plate"),
        "figure_type": ("Figure", "Fig."),
    },
}

# --- front and back matter ----------------------------------------------------------------

EDITION_NOTE: dict[str, list[str]] = {
    "zh-Hans": [
        "《红楼梦》一百二十回。前八十回出自曹雪芹之手，乾隆年间以《石头记》之名在抄本中流传；程伟元、高鹗搜集整理后四十回，与前八十回合为全帙，于乾隆五十六年（1791）用木活字排印，世称“程甲本”。次年（1792）二人再加修订重印，即“程乙本”。后四十回的作者是谁，学界至今没有定论。",
        "本书以程乙本为底本，文字据维基文库《红楼梦（程乙本）》录入本。原书刊行于十八世纪，属于公有领域；录入本的文字与标点出自维基文库编者，按知识共享“署名—相同方式共享”4.0协议（CC BY-SA 4.0）发布，本书正文沿用同一协议。",
        "整理时作了以下处理：录入本中简繁转换留下的错字（如“巨集”“空雲”“泥幹”）逐一改正；系与係、繫，干与乾、幹，云与雲等容易混淆的字，凡录入本与维基文库所收程甲本在同一处用字不同的，依程甲本改定，共二百处；段首的空格一律删去，缩进交由版式处理。诗词韵语依维基文库主本的分行标记，并参照五言、七言的句式单独排出。",
        "简体字本由繁体本经 OpenCC 转换而成，引号改用“”‘’。少数字经转换会成为类推简化字，而所用字体没有收这些字形，本书保留原字，如“圞”“爇”。",
        "本书另有英文版，采用乔利（H. Bencraft Joly）的译本。乔利译本于1892年、1893年分两册出版，只译到第五十六回，英文版也就到此为止；文字据古登堡计划（Project Gutenberg）的录入本。",
        "每回回首的插图采自光绪十年（1884）上海同文书局石印本《增评补图石头记》。原书每回有图两幅，分题回目的上下句，本书取题上句的一幅，底本为大学数字图书馆国际合作计划（CADAL）扫描、经维基共享资源发布的影印本；第四十六回、第五十二回两幅取自东京大学所藏《增评补图大观琐录》。卷首绣像二十四幅出自改琦绘《红楼梦图咏》（光绪五年，1879年刊）。图版均属公有领域，只作了裁切和灰度处理。",
        "本书用 Postext 排版，开本140×203毫米，正文用思源宋体（Noto Serif SC），每行二十八字，每面二十八行；诗词、回目用霞鹜文楷。同书的繁体字本竖排右翻，每行三十八字。",
    ],
    # The vertical edition writes its numbers in Chinese numerals (a year of
    # four Arabic digits would run sideways down the column) and marks the
    # names of people, places, reigns and institutions with the proper-name
    # line (專名號, `:name[…]`), left of the column: every occurrence, the
    # whole name (東京大學, not 東京), two names that meet each marked apart
    # (上海 同文書局).
    "zh-Hant": [
        "《紅樓夢》一百二十回。前八十回出自:name[曹雪芹]之手，:name[乾隆]年間以《石頭記》之名在抄本中流傳；:name[程偉元]、:name[高鶚]蒐集整理後四十回，與前八十回合為全帙，於:name[乾隆]五十六年（一七九一）用木活字排印，世稱「程甲本」。次年（一七九二）二人再加修訂重印，即「程乙本」。後四十回的作者是誰，學界至今沒有定論。",
        "本書以程乙本為底本，文字據:name[維基文庫]《紅樓夢（程乙本）》錄入本。原書刊行於十八世紀，屬於公有領域；錄入本的文字與標點出自:name[維基文庫]編者，按:name[知識共享]「姓名標示—相同方式分享」4.0授權（CC BY-SA 4.0）釋出，本書正文沿用同一授權。",
        "整理時作了以下處理：錄入本中簡繁轉換留下的錯字（如「巨集」「空雲」「泥幹」）逐一改正；系與係、繫，干與乾、幹，云與雲等容易混淆的字，凡錄入本與:name[維基文庫]所收程甲本在同一處用字不同的，依程甲本改定，共二百處；段首的空格一律刪去，縮排交由版式處理。詩詞韻語依:name[維基文庫]主本的分行標記，並參照五言、七言的句式單獨排出。",
        "本書另有英文版，採用:name[喬利]（H. Bencraft Joly）的譯本。:name[喬利]譯本於一八九二年、一八九三年分兩冊出版，只譯到第五十六回，英文版也就到此為止；文字據:name[古騰堡計畫]（Project Gutenberg）的錄入本。",
        "每回回目前一頁的插圖採自:name[光緒]十年（一八八四）:name[上海]:name[同文書局]石印本《增評補圖石頭記》。原書每回有圖兩幅，分題回目的上下句，本書取題上句的一幅，底本為:name[大學數字圖書館國際合作計劃]（CADAL）掃描、經:name[維基共享資源]釋出的影印本；第四十六回、第五十二回兩幅取自:name[東京大學]所藏《增評補圖大觀瑣錄》。卷首繡像二十四幅出自:name[改琦]繪《紅樓夢圖詠》（:name[光緒]五年，一八七九年刊）。圖版均屬公有領域，只作了裁切和灰度處理。",
        "本書用 Postext 排版，開本一四八×二一〇毫米（二十五開），直排右翻。正文用思源宋體（Noto Serif TC），每行三十八字，每面十五行，標點依:name[臺灣]通行的體例置於字身正中；詩詞、回目用霞鶩文楷（LXGW WenKai TC）。",
    ],
    "en": [
        "*Hung Lou Meng*, the Dream of the Red Chamber, is a novel in 120 chapters. Cao Xueqin wrote the first eighty, which circulated in manuscript under the title *Shitou ji*, the Story of the Stone. Cheng Weiyuan and Gao E collected and edited the last forty and printed all 120 chapters with movable type in 1791; the next year they printed a revised text, known as the Cheng B edition (*Cheng yi ben*). Who wrote the last forty chapters is still debated.",
        "The translation is H. Bencraft Joly’s, published in two books in 1892 and 1893 and transcribed by Project Gutenberg (eBooks #9603 and #9604). Joly translated chapters 1 to 56, and this edition ends where he did; the Chinese editions in the same book carry all 120 chapters, the one in Traditional characters set vertically and bound on the right, as Chinese books were. His romanisation is kept as he printed it, with *ü* restored where the transcription wrote *ue* for it (Pao-yü, Hsüeh); the few names it spells without the diaeresis, hyphen or apostrophe they carry everywhere else take their usual form (She Yüeh, Tai-yü, Hsüeh P’an). The transcribers’ notes and the list of errata are left out, and straight quotation marks are curled.",
        "Each chapter opens with a plate, the Chinese couplet of the 1792 text and Joly’s two title lines. The plates come from the *Zengping butu Shitou ji*, lithographed by the Tongwen Press in Shanghai in 1884, which gives every chapter two pictures, one for each half of its couplet, with that half written on the picture. The first of each pair is reproduced here from the CADAL scans on Wikimedia Commons; the plates of chapters 46 and 52 come from the University of Tokyo copy of a related edition. The portraits at the front are twenty-four of Gai Qi’s drawings of the characters, cut in wood and published in 1879 as *Honglou meng tuyong*.",
        "The book was set with Postext: EB Garamond for the English, LXGW WenKai TC for the Chinese couplets.",
    ],
}

GALLERY_INTRO: dict[str, str] = {
    "zh-Hans": "绣像二十四幅，采自改琦《红楼梦图咏》。首幅为通灵宝玉与绛珠仙草，其后是金陵十二钗，再后为贾宝玉、警幻仙子及书中其他人物。",
    "zh-Hant": "繡像二十四幅，採自改琦《紅樓夢圖詠》。首幅為通靈寶玉與絳珠仙草，其後是金陵十二釵，再後為賈寶玉、警幻仙子及書中其他人物。",
    "en": "Twenty-four portraits from Gai Qi’s *Honglou meng tuyong* (1879): first the Stone and the Crimson Pearl Flower, then the Twelve Beauties of Chin Ling, then Pao-yü, the Monitory Vision Fairy and nine other characters of the novel.",
}

# `{count}` is the number of characters in the index.
INDEX_NOTE: dict[str, str] = {
    "zh-Hans": "收书中主要人物{count}人，页码指书中首次提到该人物之处。",
    "zh-Hant": "收書中主要人物{count}人，頁碼指書中首次提到該人物之處。",
    "en": "{count} characters, with the page on which each is first mentioned. Names are spelled as Joly spells them.",
}

CREDITS: dict[str, list[str]] = {
    "zh-Hans": [
        "正文：维基文库《红楼梦（程乙本）》，zh.wikisource.org/wiki/紅樓夢（程乙本），共十二个分卷页面；知识共享“署名—相同方式共享”4.0协议。诗词分行参照维基文库《红楼梦》，用字核对参照维基文库《红楼梦（程甲本）》。",
        "程伟元序、高鹗叙、引言：同上首页。据程甲本录入本改正五处录入错字（如“付剞”补作“付剞劂”）。",
        "回首插图：光绪十年（1884）上海同文书局石印本《增评补图石头记》，大学数字图书馆国际合作计划（CADAL）扫描本，维基共享资源“CADAL07015047 增評補圖石頭記（上冊）”“CADAL07018893 增評補圖石頭記（下冊）”；第四十六回、第五十二回据东京大学藏《增评补图大观琐录》卷四十六、卷五十二。公有领域。",
        "绣像：改琦绘《红楼梦图咏》（1879），维基共享资源分类“Portraits of the Dream of the Red Chamber by Gai Qi”。公有领域。",
        "封面、书脊：Generated With Diffusion Models。",
        "字体：思源宋体、思源黑体（Noto Serif SC、Noto Sans SC），霞鹜文楷（LXGW WenKai），均按 SIL 开源字体许可证 1.1 发布；个别缺字补自 Chiron Sung HK（SIL 开源字体许可证 1.1）与字云 Jigmo（CC0 1.0）。许可证全文见本书 fonts 目录。",
        "出版说明、绣像说明、索引、本页等编者文字按知识共享“署名—相同方式共享”4.0协议发布。排版：Postext，postext.dev。",
    ],
    "zh-Hant": [
        "正文：維基文庫《紅樓夢（程乙本）》，zh.wikisource.org/wiki/紅樓夢（程乙本），共十二個分卷頁面；知識共享「姓名標示—相同方式分享」4.0授權。詩詞分行參照維基文庫《紅樓夢》，用字核對參照維基文庫《紅樓夢（程甲本）》。",
        "程偉元序、高鶚敘、引言：同上首頁。據程甲本錄入本改正五處錄入錯字（如「付剞」補作「付剞劂」）。",
        "回圖：光緒十年（一八八四）上海同文書局石印本《增評補圖石頭記》，大學數字圖書館國際合作計劃（CADAL）掃描本，維基共享資源「CADAL07015047 增評補圖石頭記（上冊）」「CADAL07018893 增評補圖石頭記（下冊）」；第四十六回、第五十二回據東京大學藏《增評補圖大觀瑣錄》卷四十六、卷五十二。公有領域。",
        "繡像：改琦繪《紅樓夢圖詠》（一八七九），維基共享資源分類「Portraits of the Dream of the Red Chamber by Gai Qi」。公有領域。",
        "封面、書脊：Generated With Diffusion Models。",
        "字型：思源宋體、思源黑體（Noto Serif TC、Noto Sans TC），霞鶩文楷（LXGW WenKai TC），均按 SIL 開源字型授權 1.1 釋出；個別缺字補自 Noto Serif SC、Chiron Sung HK（SIL 開源字型授權 1.1）與字雲 Jigmo（CC0 1.0）。授權全文見本書 fonts 目錄。",
        "出版說明、繡像說明、索引、本頁等編者文字按知識共享「姓名標示—相同方式分享」4.0授權釋出。排版：Postext，postext.dev。",
    ],
    "en": [
        "Translation: H. Bencraft Joly, *Hung Lou Meng, or, the Dream of the Red Chamber, a Chinese Novel*, Book I (1892) and Book II (1893). Project Gutenberg eBooks #9603 and #9604, gutenberg.org/ebooks/9603 and gutenberg.org/ebooks/9604. Public domain.",
        "Chinese couplets: the 1792 Cheng B text as transcribed on Chinese Wikisource, zh.wikisource.org/wiki/紅樓夢（程乙本）, licensed under Creative Commons Attribution-ShareAlike 4.0.",
        "Chapter plates: *Zengping butu Shitou ji* (Shanghai: Tongwen shuju, 1884), from the CADAL scans on Wikimedia Commons (“CADAL07015047 增評補圖石頭記（上冊）” and “CADAL07018893 增評補圖石頭記（下冊）”); chapters 46 and 52 from the University of Tokyo copy of *Zengping butu Daguan suolu*, volumes 46 and 52. Public domain.",
        "Portraits: Gai Qi, *Honglou meng tuyong* (1879), Wikimedia Commons category “Portraits of the Dream of the Red Chamber by Gai Qi”. Public domain.",
        "Spine: Generated With Diffusion Models.",
        "Fonts: EB Garamond (Georg Duffner, Octavio Pardo) and LXGW WenKai TC, under the SIL Open Font License 1.1; the licence texts are in the fonts folder of this book.",
        "The editorial matter (the note on this edition, the introductions, the index and this page) is released under Creative Commons Attribution-ShareAlike 4.0. Set with Postext, postext.dev.",
    ],
}

COLOPHON: dict[str, list[str]] = {
    "zh-Hans": [
        "红楼梦",
        "曹雪芹　著　　程伟元　高鹗　整理",
        "底本：程乙本（1792），维基文库录入",
        "插图：《增评补图石头记》（1884）、改琦《红楼梦图咏》（1879）",
        "正文按知识共享 CC BY-SA 4.0 协议发布",
        "Postext 排版　二〇二六年",
    ],
    "zh-Hant": [
        "紅樓夢",
        "曹雪芹　著　　程偉元　高鶚　整理",
        "底本：程乙本（一七九二），維基文庫錄入",
        "插圖：《增評補圖石頭記》（一八八四）、改琦《紅樓夢圖詠》（一八七九）",
        "正文按知識共享 CC BY-SA 4.0 授權釋出",
        "Postext 排版　二〇二六年",
    ],
    "en": [
        "*Hung Lou Meng, or, The Dream of the Red Chamber*, chapters I–LVI, translated by H. Bencraft Joly (1892–93).",
        "Chinese couplets from the 1792 Cheng B text, Chinese Wikisource (CC BY-SA 4.0). Plates from the 1884 Tongwen Press edition; portraits by Gai Qi (1879).",
        "Set with Postext, 2026.",
    ],
}

# English names in the gallery: as Joly writes them.
EN_PORTRAIT_NAMES = {
    "portrait-jia-yuanchun": "Yüan Ch’un",
    "portrait-jia-tanchun": "T’an Ch’un",
    "portrait-jia-yingchun": "Ying Ch’un",
    "portrait-jia-xichun": "Hsi Ch’un",
    "portrait-qin-keqing": "Mrs. Ch’in (Ch’in K’o-ch’ing)",
    "portrait-jinghuan-xianzi": "The Monitory Vision Fairy",
    "portrait-hua-xiren": "Hsi Jen",
}

# --- index of characters -----------------------------------------------------------------
#
# Each entry: the index term in each edition, the name forms searched for the
# first mention and where the search starts: `from` in the Chinese text,
# `en_from` in Joly's (by default the chapter of `from`), a chapter or a
# (chapter, paragraph) pair. A later start
# skips a homograph (寶玉 in 通靈寶玉 in chapter 1, the word 鴛鴦 in a poem)
# or the author's prologue, where 甄士隱 and 賈雨村 are puns on 真事隱 and
# 假語村言 rather than the two men. The English forms are matched with a hyphen
# or a space between syllables and either case of their first letter (Joly
# writes Pao Ch’ai and Pao-ch’ai); `None` for a character Joly never reaches.
# The build fails when a form is not found, and when the English mark falls
# in another chapter than the Chinese one, unless EN_CHAPTER_DIFFERS says why.

CHARACTERS: list[dict] = [
    {"hant": "賈寶玉", "hans": "贾宝玉", "en": "Chia Pao-yü", "forms": ["寶玉"], "from": 2, "en_forms": ["Pao-yü"]},
    {"hant": "林黛玉", "hans": "林黛玉", "en": "Lin Tai-yü", "forms": ["黛玉"], "from": 2, "en_forms": ["Tai-yü"]},
    {"hant": "薛寶釵", "hans": "薛宝钗", "en": "Hsüeh Pao-ch’ai", "forms": ["寶釵"], "from": 4, "en_forms": ["Pao-ch’ai"]},
    {"hant": "王熙鳳", "hans": "王熙凤", "en": "Wang Hsi-feng (lady Feng)", "forms": ["王熙鳳", "鳳姐"], "from": 3, "en_forms": ["Hsi-feng", "lady Feng"]},
    {"hant": "賈母", "hans": "贾母", "en": "Dowager lady Chia", "forms": ["賈母", "太夫人"], "from": 2, "en_forms": ["dowager lady"]},
    {"hant": "賈政", "hans": "贾政", "en": "Chia Cheng", "forms": ["賈政"], "from": 2, "en_forms": ["Chia Cheng"]},
    {"hant": "王夫人", "hans": "王夫人", "en": "Madame Wang", "forms": ["王夫人"], "from": 3, "en_forms": ["Madame Wang"]},
    {"hant": "賈赦", "hans": "贾赦", "en": "Chia She", "forms": ["賈赦"], "from": 2, "en_forms": ["Chia She"]},
    {"hant": "邢夫人", "hans": "邢夫人", "en": "Madame Hsing", "forms": ["邢夫人"], "from": 3, "en_forms": ["Madame Hsing"]},
    {"hant": "賈璉", "hans": "贾琏", "en": "Chia Lien", "forms": ["賈璉"], "from": 2, "en_forms": ["Chia Lien"]},
    {"hant": "賈珍", "hans": "贾珍", "en": "Chia Chen", "forms": ["賈珍"], "from": 2, "en_forms": ["Chia Chen"]},
    {"hant": "尤氏", "hans": "尤氏", "en": "Mrs. Yu", "forms": ["尤氏"], "from": 5, "en_forms": ["Mrs. Yu"]},
    {"hant": "賈蓉", "hans": "贾蓉", "en": "Chia Jung", "forms": ["賈蓉"], "from": 2, "en_forms": ["Chia Jung"]},
    {"hant": "秦可卿", "hans": "秦可卿", "en": "Mrs. Ch’in", "forms": ["秦氏"], "from": 5, "en_forms": ["Mrs. Ch’in"]},
    {"hant": "賈元春", "hans": "贾元春", "en": "Yüan Ch’un", "forms": ["元春"], "from": 2, "en_forms": ["Yüan Ch’un"]},
    {"hant": "賈迎春", "hans": "贾迎春", "en": "Ying Ch’un", "forms": ["迎春"], "from": 2, "en_forms": ["Ying Ch’un"]},
    {"hant": "賈探春", "hans": "贾探春", "en": "T’an Ch’un", "forms": ["探春"], "from": 2, "en_forms": ["T’an Ch’un"]},
    {"hant": "賈惜春", "hans": "贾惜春", "en": "Hsi Ch’un", "forms": ["惜春"], "from": 2, "en_forms": ["Hsi Ch’un"]},
    {"hant": "李紈", "hans": "李纨", "en": "Li Wan", "forms": ["李紈"], "from": 3, "en_forms": ["Li Wan"]},
    {"hant": "賈蘭", "hans": "贾兰", "en": "Chia Lan", "forms": ["賈蘭"], "from": 4, "en_forms": ["Chia Lan"]},
    {"hant": "史湘雲", "hans": "史湘云", "en": "Shih Hsiang-yün", "forms": ["湘雲"], "from": 1, "en_forms": ["Hsiang-yün"]},
    {"hant": "妙玉", "hans": "妙玉", "en": "Miao Yü", "forms": ["妙玉"], "from": 17, "en_forms": ["Miao Yü"]},
    {"hant": "巧姐", "hans": "巧姐", "en": "Ch’iao Chieh", "forms": ["巧姐"], "from": 42, "en_forms": ["Ch’iao Chieh-erh"]},
    {"hant": "薛姨媽", "hans": "薛姨妈", "en": "Mrs. Hsüeh", "forms": ["薛姨媽"], "from": 4, "en_forms": ["Mrs. Hsüeh"]},
    {"hant": "薛蟠", "hans": "薛蟠", "en": "Hsüeh P’an", "forms": ["薛蟠"], "from": 3, "en_forms": ["Hsüeh P’an"]},
    {"hant": "薛寶琴", "hans": "薛宝琴", "en": "Hsüeh Pao-ch’in", "forms": ["薛寶琴", "寶琴"], "from": 49, "en_forms": ["Pao-ch’in"]},
    {"hant": "甄士隱", "hans": "甄士隐", "en": "Chen Shih-yin", "forms": ["甄士隱", "士隱"], "from": (1, 1), "en_from": (1, 6), "en_forms": ["Chen Shih-yin", "Shih-yin"]},
    {"hant": "賈雨村", "hans": "贾雨村", "en": "Chia Yü-ts’un", "forms": ["賈雨村", "雨村"], "from": (1, 1), "en_from": (1, 6), "en_forms": ["Chia Yü-ts’un", "Yü-ts’un"]},
    {"hant": "香菱", "hans": "香菱", "en": "Hsiang Ling (Ying Lien)", "forms": ["英蓮", "香菱"], "from": 1, "en_forms": ["Ying Lien", "Hsiang Ling"]},
    {"hant": "林如海", "hans": "林如海", "en": "Lin Ju-hai", "forms": ["林如海"], "from": 2, "en_forms": ["Lin Ju-hai"]},
    {"hant": "秦鍾", "hans": "秦钟", "en": "Ch’in Chung", "forms": ["秦鍾"], "from": 7, "en_forms": ["Ch’in Chung"]},
    {"hant": "賈環", "hans": "贾环", "en": "Chia Huan", "forms": ["賈環"], "from": 2, "en_forms": ["Chia Huan"]},
    {"hant": "趙姨娘", "hans": "赵姨娘", "en": "Mrs. Chao", "forms": ["趙姨娘"], "from": 2, "en_forms": ["Mrs. Chao"]},
    {"hant": "劉姥姥", "hans": "刘姥姥", "en": "Goody Liu", "forms": ["劉姥姥"], "from": 6, "en_forms": ["goody Liu"]},
    {"hant": "襲人", "hans": "袭人", "en": "Hsi Jen", "forms": ["襲人"], "from": 3, "en_forms": ["Hsi Jen"]},
    {"hant": "晴雯", "hans": "晴雯", "en": "Ch’ing Wen", "forms": ["晴雯"], "from": 5, "en_forms": ["Ch’ing Wen"]},
    {"hant": "平兒", "hans": "平儿", "en": "P’ing Erh", "forms": ["平兒"], "from": 6, "en_forms": ["P’ing Erh"]},
    {"hant": "鴛鴦", "hans": "鸳鸯", "en": "Yüan Yang", "forms": ["鴛鴦"], "from": 20, "prose": True, "en_forms": ["Yüan Yang"]},
    {"hant": "紫鵑", "hans": "紫鹃", "en": "Tzu Chüan", "forms": ["紫鵑"], "from": 8, "en_from": 1, "en_forms": ["Tzu Chüan"]},
    {"hant": "警幻仙子", "hans": "警幻仙子", "en": "Monitory Vision Fairy", "forms": ["警幻仙子", "警幻"], "from": 1, "en_forms": ["Monitory Vision"]},
    {"hant": "尤三姐", "hans": "尤三姐", "en": None, "forms": ["尤三姐"], "from": 63, "en_forms": []},
]

# Characters whose English mark falls in another chapter than the Chinese
# one because Joly's text differs there.
EN_CHAPTER_DIFFERS = {
    # 程乙本 ch. 3 calls her 賈珠之妻李氏 before it names her 李紈; Joly has
    # "Chia Chu’s wife, nee Li" and first writes Li Wan in chapter 4.
    "李紈": "Joly first names her in chapter 4",
    # 賈母 gives 黛玉 a maid called 鸚哥 in chapter 3, renamed 紫鵑 later; Joly
    # names the maids Tzu Chüan and Ying Ko already in chapter 3.
    "紫鵑": "Joly uses the later name in chapter 3",
}
