# Credits — ألف ليلة وليلة · One Thousand and One Nights

Showcase preset for the Postext sandbox: the whole of *Alf layla wa-layla*
(nights 1–1001 and the conclusion) in Arabic, set as a classical Egyptian
book. The editorial matter written for the preset (the edition note, the
headings added for unheaded tales and for the groups of short anecdotes,
the captions, the colophon and credits pages, this file) is released under
CC BY 4.0.

## Text

The Bulaq text (first printed at Būlāq, 1251/1835) in the Hindawi Foundation
edition, *Alf layla wa-layla*, six volumes, 2022 (مؤسسة هنداوي,
https://www.hindawi.org). The original text is in the public domain; Hindawi's
vocalisation and punctuation are licensed CC BY 4.0. The EPUBs were taken
from the Internet Archive's Wayback Machine (captures listed in
`scripts/presets/showcase/alf-layla/fetch.py`).

Changes: Unicode NFC; invisible direction marks removed; the heading of
night 136 corrected («فقال» → «فلما»); four paragraphs split where an
unheaded tale begins; headings added for those tales and for runs of short
anecdotes («… وحكايات أخرى»); the night headings «فلما كانت الليلة ١٢»
rewritten as ordinal words («الليلة الثانية عشرة»), the original kept as a
heading attribute; the edition's own illustrations left out.

## Pictures

- Abu'l-Hasan Ghaffari, Sani ol-Molk (1814–1866), and workshop: paintings
  for the Persian *Hazar-o yek shab*, vol. 1, 1849–56, Golestan Palace
  Library, Tehran, MS 2240. Photographs on Wikimedia Commons, public
  domain. Panels cut from the manuscript pages; the Arabic captions are
  ours, after the Persian captions of the manuscript.
- William Harvey (1796–1866): wood engravings for E. W. Lane's translation,
  *The Thousand and One Nights*, London 1839–41, engraved by Landells,
  Whimper, Jackson, the Williamses, Harriet Clarke and others. Public domain.
  Six from Wikimedia Commons; nineteen cut from the Internet Archive scans of
  Lane's volume 2 (1840, `thousandandonen01lanegoog`) and volume 3 (1841,
  `thousandandonen01harvgoog`), chosen from Lane's lists of illustrations for
  the tales of the later Bulaq volumes, set in grey.
- The headpiece (سرلوح) and the rosettes are drawn for this bundle
  (`ornaments.py`), CC0.

| id | caption | tale | source | licence |
| --- | --- | --- | --- | --- |
| `sani-01a` | الصياد يحمل السمك الملوَّن إلى الملك | حكاية الصياد مع العفريت | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_1_-_Saniolmolk.jpg) | Public domain |
| `sani-01b` | الصبية تخرج من الحائط وتكلِّم السمك في المقلاة | حكاية الصياد مع العفريت | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_1_-_Saniolmolk.jpg) | Public domain |
| `sani-01c` | السمك في المقلاة بين يدي الملك والوزير | حكاية الصياد مع العفريت | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_1_-_Saniolmolk.jpg) | Public domain |
| `sani-12a` | بنت العم تضرب زوجها المسحور، ونصفه حجر | حكاية الشاب المسحور صاحب الجزائر السود | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_12_-_Saniolmolk.jpg) | Public domain |
| `sani-12b` | الساحرة تسحر المدينة بحيرةً وأهلها سمكًا | حكاية الشاب المسحور صاحب الجزائر السود | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_12_-_Saniolmolk.jpg) | Public domain |
| `sani-12c` | الملك والشاب يتزوجان ابنتَي الصياد | حكاية الشاب المسحور صاحب الجزائر السود | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_12_-_Saniolmolk.jpg) | Public domain |
| `sani-11a` | ابن الملك فوق الشجرة والعبيد يقبلون من البحر | حكاية الصعلوك الثالث | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_11_-_Saniolmolk.jpg) | Public domain |
| `sani-11b` | الفرس الطائر يحمل ابن الملك | حكاية الصعلوك الثالث | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_11_-_Saniolmolk.jpg) | Public domain |
| `sani-11c` | الخليفة والبنات والكلبتان في الديوان | حكاية الحمَّال مع البنات | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_11_-_Saniolmolk.jpg) | Public domain |
| `sani-15a` | العفريتة تحضر مجلس الخليفة وتفكّ سحر الكلبتين | حكاية البنت الأولى زبيدة | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_15_-_Saniolmolk.jpg) | Public domain |
| `sani-15b` | زفاف البنات الثلاث | حكاية الحمَّال مع البنات | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_15_-_Saniolmolk.jpg) | Public domain |
| `sani-15c` | الصياد يرمي شبكته بين يدي الخليفة | حكاية الصبية والتفاح وريحان العبد | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_15_-_Saniolmolk.jpg) | Public domain |
| `sani-06a` | جعفر يُساق إلى المشنقة | حكاية الصبية والتفاح وريحان العبد | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_6_-_Saniolmolk.jpg) | Public domain |
| `sani-06b` | الشيخ والشاب واقفان بين يدي الخليفة | حكاية الصبية والتفاح وريحان العبد | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_6_-_Saniolmolk.jpg) | Public domain |
| `sani-04a` | بدر الدين حسن عند الخان | حكاية نور الدين مع أخيه شمس الدين | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_4_-_Saniolmolk.jpg) | Public domain |
| `sani-04b` | ليلة العرس: بدر الدين حسن مكان الأحدب | حكاية نور الدين مع أخيه شمس الدين | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_4_-_Saniolmolk.jpg) | Public domain |
| `sani-04c` | بدر الدين حسن نائم | حكاية نور الدين مع أخيه شمس الدين | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_4_-_Saniolmolk.jpg) | Public domain |
| `sani-03a` | الجواري في الحمّام | حكاية أنيس الجليس وعلي نور | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_3_-_Saniolmolk.jpg) | Public domain |
| `sani-03b` | علي نور الدين وأنيس الجليس | حكاية أنيس الجليس وعلي نور | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_3_-_Saniolmolk.jpg) | Public domain |
| `sani-09a` | الطبيب اليهودي يعود الشاب المريض | حكاية الطبيب اليهودي | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_9_-_Saniolmolk.jpg) | Public domain |
| `sani-09b` | الشاب والصبية في مجلس الشراب | حكاية الطبيب اليهودي | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_9_-_Saniolmolk.jpg) | Public domain |
| `sani-10a` | العجوز تحدِّث بنت القاضي | حكاية الأعرج مع مزين بغداد | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_10_-_Saniolmolk.jpg) | Public domain |
| `sani-10c` | المزيِّن يأخذ ارتفاع الشمس بالأسطرلاب | حكاية الأعرج مع مزين بغداد | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_10_-_Saniolmolk.jpg) | Public domain |
| `sani-14a` | الطحّان يضرب الخياط بالسوط وهو يدير الطاحون | حكاية الأخ الأكبر | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_14_-_Saniolmolk.jpg) | Public domain |
| `sani-14b` | المرأة تكلِّم الخياط من الطاقة | حكاية الأخ الأكبر | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_14_-_Saniolmolk.jpg) | Public domain |
| `sani-19a` | الشاب والصبية والصندوق | حكاية المباشِر | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_19_-_Saniolmolk.jpg) | Public domain |
| `sani-19b` | السيدة زبيدة وجواريها يرين الشاب | حكاية المباشِر | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_19_-_Saniolmolk.jpg) | Public domain |
| `sani-07a` | عزيزة تطعم عزيزًا | حكاية الشاب عزيز | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_7_-_Saniolmolk.jpg) | Public domain |
| `sani-07c` | عزيز وعزيزة | حكاية الشاب عزيز | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_7_-_Saniolmolk.jpg) | Public domain |
| `sani-05b` | السيدة دنيا تكتب الرسالة | حكاية الأميرة دنيا مع تاج الملوك | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_5_-_Saniolmolk.jpg) | Public domain |
| `sani-05c` | العجوز تكلِّم تاج الملوك في السوق | حكاية الأميرة دنيا مع تاج الملوك | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_5_-_Saniolmolk.jpg) | Public domain |
| `sani-13a` | تاج الملوك والوزير وعزيز في دكان السوق | حكاية الأميرة دنيا مع تاج الملوك | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_13_-_Saniolmolk.jpg) | Public domain |
| `sani-13b` | تاج الملوك والوزير وعزيز في الحمّام | حكاية الأميرة دنيا مع تاج الملوك | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_13_-_Saniolmolk.jpg) | Public domain |
| `sani-08a` | الملك شركان يسير وحده | حكاية الملك عمر النعمان مع ولدَيْه بشركان وضوء المكان | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_8_-_Saniolmolk.jpg) | Public domain |
| `sani-08b` | قتال الملك شركان | حكاية الملك عمر النعمان مع ولدَيْه بشركان وضوء المكان | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_8_-_Saniolmolk.jpg) | Public domain |
| `sani-20a` | الملكة إبريزة تحدِّث الملك شركان | حكاية الملك عمر النعمان مع ولدَيْه بشركان وضوء المكان | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_20_-_Saniolmolk.jpg) | Public domain |
| `sani-20c` | شركان وإبريزة في ضوء القمر | حكاية الملك عمر النعمان مع ولدَيْه بشركان وضوء المكان | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_20_-_Saniolmolk.jpg) | Public domain |
| `sani-02a` | ضوء المكان مريضًا في بيت الوقّاد | حكاية الملك عمر النعمان مع ولدَيْه بشركان وضوء المكان | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_2_-_Saniolmolk.jpg) | Public domain |
| `sani-18b` | زينة المدينة بالمصابيح | زفاف نزهة الزمان إلى الملك شركان | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_18_-_Saniolmolk.jpg) | Public domain |
| `sani-18c` | نزهة الزمان والملك شركان في ليلة الزفاف | زفاف نزهة الزمان إلى الملك شركان | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_18_-_Saniolmolk.jpg) | Public domain |
| `sani-16a` | ضوء المكان يقاتل الروم | حكاية الدير | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_16_-_Saniolmolk.jpg) | Public domain |
| `sani-16b` | الملك حردوب يشاور ذات الدواهي | حكاية مقتل الملك عمر النعمان | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_16_-_Saniolmolk.jpg) | Public domain |
| `sani-17b` | أهل بغداد يستقبلون الملك ضوء المكان | مغامرة كان ما كان ابن ضوء المكان | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_17_-_Saniolmolk.jpg) | Public domain |
| `sani-21c` | مأتم الملك ضوء المكان | مغامرة كان ما كان ابن ضوء المكان | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_21_-_Saniolmolk.jpg) | Public domain |
| `sani-22b` | غانم فوق الشجرة والعبيد الثلاثة يحملون الصندوق | حكاية غانم المتيَّم المسلوب | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_22_-_Saniolmolk.jpg) | Public domain |
| `sani-22c` | العبيد الثلاثة يتحادثون | حكاية غانم المتيَّم المسلوب | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_22_-_Saniolmolk.jpg) | Public domain |
| `sani-23a` | أم غانم وأخته وقوت القلوب عند فراشه | حكاية التاجر أيوب وابنه غانم وابنته فتنة | [Commons](https://commons.wikimedia.org/wiki/File:One_Thousand_and_One_Nights_MS_23_-_Saniolmolk.jpg) | Public domain |
| `harvey-23` | العفريت يرفع سيفه على التاجر | حكاية التاجر مع العفريت | [Commons](https://commons.wikimedia.org/wiki/File:Harvey_W,_1001_nights_(23).jpg) | Public domain |
| `harvey-12` | شيخ البحر على كتفَي السندباد | حكاية سندباد البحري | [Commons](https://commons.wikimedia.org/wiki/File:Harvey_W,_1001_nights_(12).jpg) | Public domain |
| `harvey-08` | قمر الزمان | حكاية قمر الزمان مع الملكة بدور | [Commons](https://commons.wikimedia.org/wiki/File:Harvey_W,_1001_nights_(8).jpg) | Public domain |
| `harvey-10` | أنس الوجود | حكاية أنس الوجود والورد في الأكمام | [Commons](https://commons.wikimedia.org/wiki/File:Harvey_W,_1001_nights_(10).jpg) | Public domain |
| `harvey-21` | عبد الله البرّي وعبد الله البحري | حكاية عبد الله البحري وعبد الله البرِّي | [Commons](https://commons.wikimedia.org/wiki/File:Harvey_W,_1001_nights_(21).jpg) | Public domain |
| `harvey-03` | الدخان يخرج من القمقم ويصير عفريتًا | حكاية الصياد مع العفريت | [Commons](https://commons.wikimedia.org/wiki/File:Harvey_W,_1001_nights_(3).jpg) | Public domain |
| `lane-nima` | نُعم تفيق حين ترى ورقة نعمة | حكاية نعمة ونِعَم | [Internet Archive](https://archive.org/details/thousandandonen01lanegoog/page/n217/mode/1up) | Public domain |
| `lane-alaeddin` | علاء الدين يطلع من الطابق على مجلس أمه | حكاية علاء الدين أبي الشامات | [Internet Archive](https://archive.org/details/thousandandonen01lanegoog/page/n273/mode/1up) | Public domain |
| `lane-hatim` | قبر حاتم الطائي على رأس الجبل | حكاية حاتم الطائي | [Internet Archive](https://archive.org/details/thousandandonen01lanegoog/page/n355/mode/1up) | Public domain |
| `lane-false-caliph` | الخليفة المزوَّر يدخل قصره في موكبه | حكاية الخليفة المزوَّر | [Internet Archive](https://archive.org/details/thousandandonen01lanegoog/page/n407/mode/1up) | Public domain |
| `lane-zumurrud` | زمرد تتدلى من الطاقة بحبل | حكاية علي شار وزمرد | [Internet Archive](https://archive.org/details/thousandandonen01lanegoog/page/n471/mode/1up) | Public domain |
| `lane-jubayr` | عقد جبير بن عمير على الست بدور | حكاية جبير بن عمير والست بدور | [Internet Archive](https://archive.org/details/thousandandonen01lanegoog/page/n512/mode/1up) | Public domain |
| `lane-ebony-horse` | ابن الملك على الفرس الأبنوس بين العسكر | حكاية الفرس الطائر | [Internet Archive](https://archive.org/details/thousandandonen01lanegoog/page/n548/mode/1up) | Public domain |
| `lane-ali-misri` | علي المصري يفتح الصناديق | حكاية علي المصري التاجر من بغداد | [Internet Archive](https://archive.org/details/thousandandonen01lanegoog/page/n644/mode/1up) | Public domain |
| `lane-brass` | فارس النحاس على الرابية | حكاية مدينة النحاس | [Internet Archive](https://archive.org/details/thousandandonen01harvgoog/page/n146/mode/1up) | Public domain |
| `lane-judar` | جودر والمغربي عند البركة | حكاية جودر الصياد وأخويه | [Internet Archive](https://archive.org/details/thousandandonen01harvgoog/page/n210/mode/1up) | Public domain |
| `lane-lab` | الملكة لاب الساحرة | حكاية جلناز وبدر باسم | [Internet Archive](https://archive.org/details/thousandandonen01harvgoog/page/n316/mode/1up) | Public domain |
| `lane-sayf` | ابن الملك الأزرق يختطف دولة خاتون | حكاية سيف الملوك وبديعة الجمال | [Internet Archive](https://archive.org/details/thousandandonen01harvgoog/page/n359/mode/1up) | Public domain |
| `lane-bahram` | بهرام المجوسي | حكاية حسن الصائغ | [Internet Archive](https://archive.org/details/thousandandonen01harvgoog/page/n413/mode/1up) | Public domain |
| `lane-dahnash` | حسن على كتفَي العفريت دهنش | حكاية حسن الصائغ | [Internet Archive](https://archive.org/details/thousandandonen01harvgoog/page/n473/mode/1up) | Public domain |
| `lane-khalifa` | الرشيد وجعفر يريان خليفة الصياد | خليفة الصياد | [Internet Archive](https://archive.org/details/thousandandonen01harvgoog/page/n559/mode/1up) | Public domain |
| `lane-abu-sir` | الملك يشير بإلقاء أبي صير في البحر | حكاية أبي قِير وأبي صِير | [Internet Archive](https://archive.org/details/thousandandonen01harvgoog/page/n625/mode/1up) | Public domain |
| `lane-jamila` | السيدة جميلة ترقص | حكاية إبراهيم وجميلة | [Internet Archive](https://archive.org/details/thousandandonen01harvgoog/page/n678/mode/1up) | Public domain |
| `lane-maruf-jinni` | أبو السعادات خادم الخاتم يظهر لمعروف | حكاية الإسكافي معروف | [Internet Archive](https://archive.org/details/thousandandonen01harvgoog/page/n695/mode/1up) | Public domain |
| `lane-maruf-plough` | معروف يحرث أرض الفلاح | حكاية الإسكافي معروف | [Internet Archive](https://archive.org/details/thousandandonen01harvgoog/page/n718/mode/1up) | Public domain |

## Fonts

SIL Open Font License 1.1 (licence texts in `fonts/`): Amiri 1.003 (Khaled
Hosny), Aref Ruqaa (Abdullah Aref, Khaled Hosny). Subset to the Arabic block,
Latin-1 and the characters of the text.

## Build

`scripts/presets/showcase/alf-layla/` in the Postext repository: `fetch.py`
downloads the sources, `text.py`, `markup.py` and `plates.py` prepare the
text and the pictures, `ornaments.py` draws the ornaments, `build.py` writes
this bundle.
