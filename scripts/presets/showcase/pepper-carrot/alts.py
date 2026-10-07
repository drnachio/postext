"""Alternative text for the 21 panels and the cover art, in every language
of the bundle (Pepper&Carrot language codes, `cn` = Simplified Chinese).

What each picture shows, for a reader who cannot see it: one or two
sentences, the balloons left out (the reader gets them as text). Pepper and
Carrot carry the names each translation gives them (Pimienta and Zanahoria
in Spanish, 小辣椒 and 萝卜头 in Chinese, فُلفُل and جزر in Arabic). The three
witches of page 2 are named only in English and French, the languages
whose names for them are David Revoy's own; this episode never names them,
so the other editions describe them instead of guessing a translation.

manifest.py takes the English texts (`manifest.json` `panels[].alt`);
build.py writes every edition's texts as `::panel{… alt="…"}` and the
cover's as the edition's `localized[…].resources` wording.
"""
from __future__ import annotations

COVER_ID = "e08-cover"

ALT: dict[str, dict[str, str]] = {
    COVER_ID: {
        "en": "Pepper, arms raised in joy, and Carrot at a low table set for a party: a teapot, cupcakes and a birthday cake with candles under strings of bunting.",
        "fr": "Pepper, les bras levés de joie, et Carrot devant une table basse dressée pour une fête : une théière, des petits gâteaux et un gâteau d’anniversaire avec ses bougies, sous des guirlandes de fanions.",
        "es": "Pimienta, con los brazos en alto de alegría, y Zanahoria ante una mesa baja preparada para una fiesta: una tetera, magdalenas y una tarta de cumpleaños con velas, bajo guirnaldas de banderines.",
        "ca": "La Pepper, amb els braços enlaire d’alegria, i en Carrot davant d’una taula baixa parada per a una festa: una tetera, magdalenes i un pastís d’aniversari amb espelmes, sota garlandes de banderetes.",
        "ja": "パーティーの支度ができた低いテーブルの前で、ペッパーが喜んで両手を上げ、キャロットも笑っている。テーブルにはティーポットとカップケーキ、ろうそくを立てたバースデーケーキ。頭上には三角の旗飾り。",
        "cn": "小辣椒高兴地举起双手，萝卜头坐在一张布置好派对的矮桌旁。桌上有茶壶、纸杯蛋糕和插着蜡烛的生日蛋糕，头顶挂着一串串彩旗。",
        "ar": "فُلفُل ترفع ذراعيها فرحًا، وجزر أمام طاولة منخفضة أُعدّت لحفلة: إبريق شاي وكعكات صغيرة وكعكة عيد ميلاد بشموعها، تحت أشرطة من الرايات الملوّنة.",
    },
    "e08p01-1": {
        "en": "Pepper sits on the edge of her bed in an attic lit by a skylight, her hands on her knees. Carrot watches her from the floor.",
        "fr": "Pepper est assise au bord de son lit, dans un grenier éclairé par une lucarne, les mains sur les genoux. Carrot la regarde depuis le plancher.",
        "es": "Pimienta está sentada en el borde de la cama, en una buhardilla iluminada por un tragaluz, con las manos sobre las rodillas. Zanahoria la mira desde el suelo.",
        "ca": "La Pepper seu a la vora del llit, en unes golfes il·luminades per un tragaluç, amb les mans als genolls. En Carrot la mira des de terra.",
        "ja": "天窓から光が差しこむ屋根裏部屋で、ペッパーがベッドの端に座り、ひざに手を置いている。キャロットが床から見上げている。",
        "cn": "阳光从天窗照进阁楼，小辣椒坐在床边，双手放在膝上。萝卜头在地板上望着她。",
        "ar": "فُلفُل جالسة على حافة سريرها في علّية يضيئها شبّاك في السقف، ويداها على ركبتيها، وجزر يراقبها من الأرض.",
    },
    "e08p01-2": {
        "en": "Close-up: Pepper gazes into the distance, downcast. Carrot, at her shoulder, looks up at her.",
        "fr": "Gros plan : Pepper regarde au loin, abattue. Carrot, contre son épaule, lève les yeux vers elle.",
        "es": "Primer plano: Pimienta mira a lo lejos, abatida. Zanahoria, junto a su hombro, la mira desde abajo.",
        "ca": "Primer pla: la Pepper mira lluny, abatuda. En Carrot, arran de la seva espatlla, alça els ulls cap a ella.",
        "ja": "アップ。ペッパーが沈んだ顔で遠くを見つめ、肩のそばのキャロットが彼女を見上げている。",
        "cn": "特写：小辣椒神情低落，望向远方。萝卜头靠在她肩边，抬头看着她。",
        "ar": "لقطة قريبة: فُلفُل تحدّق في البعيد حزينة، وجزر عند كتفها يرفع عينيه إليها.",
    },
    "e08p01-3": {
        "en": "Pepper buries her face in her hand, a few tears falling. Carrot clings to her arm, worried.",
        "fr": "Pepper enfouit son visage dans sa main, quelques larmes tombent. Carrot s’accroche à son bras, inquiet.",
        "es": "Pimienta hunde la cara en la mano y se le escapan unas lágrimas. Zanahoria se agarra a su brazo, preocupado.",
        "ca": "La Pepper amaga la cara a la mà i li cauen unes llàgrimes. En Carrot s’aferra al seu braç, amoïnat.",
        "ja": "ペッパーが手で顔をおおい、涙がこぼれる。キャロットが心配そうに彼女の腕にしがみついている。",
        "cn": "小辣椒用手捂住脸，落下几滴眼泪。萝卜头担心地抱住她的胳膊。",
        "ar": "فُلفُل تدفن وجهها في يدها وتسقط منها دموع قليلة، وجزر يتشبّث بذراعها قلقًا.",
    },
    "e08p01-4": {
        "en": "Carrot, wide-eyed, points at a framed drawing of the witches of the Potion Contest, propped beside the winner’s gold coin.",
        "fr": "Carrot, les yeux écarquillés, montre du doigt un dessin encadré des sorcières du concours de potion, posé à côté de la pièce d’or de la gagnante.",
        "es": "Zanahoria, con los ojos muy abiertos, señala un dibujo enmarcado de las brujas del concurso de pociones, junto a la moneda de oro de la ganadora.",
        "ca": "En Carrot, amb els ulls ben oberts, assenyala un dibuix emmarcat de les bruixes del torneig de pocions, al costat de la moneda d’or de la guanyadora.",
        "ja": "キャロットが目を丸くして、魔法薬コンテストの魔女たちを描いた額入りの絵を指さす。絵の横には優勝の金貨が立てかけてある。",
        "cn": "萝卜头瞪大眼睛，指着一幅装在相框里的画，画的是魔药大赛上的魔女们，旁边立着冠军的金币。",
        "ar": "جزر، بعينين واسعتين، يشير إلى رسم مؤطَّر لساحرات مسابقة الجُرعات، وبجانبه عملة الفائزة الذهبية.",
    },
    "e08p02-1": {
        "en": "Pepper sits up on her bed and lifts her hands, delighted by the idea. Carrot sits facing her, smiling.",
        "fr": "Pepper, assise sur son lit, lève les mains, ravie de l’idée. Carrot, assis face à elle, sourit.",
        "es": "Pimienta, sentada en la cama, levanta las manos, encantada con la idea. Zanahoria, sentado frente a ella, sonríe.",
        "ca": "La Pepper, asseguda al llit, aixeca les mans, encantada amb la idea. En Carrot, assegut davant seu, somriu.",
        "ja": "ベッドに座ったペッパーが、名案に目を輝かせて両手を上げる。向かいに座ったキャロットがにっこりしている。",
        "cn": "小辣椒坐在床上，举起双手，为这个主意高兴不已。萝卜头坐在她对面，笑眯眯的。",
        "ar": "فُلفُل جالسة على سريرها ترفع يديها مسرورة بالفكرة، وجزر جالس قبالتها مبتسمًا.",
    },
    "e08p02-2": {
        "en": "Pepper, smiling, writes invitations with a quill while Carrot holds up an envelope. A small white bird waits on the windowsill.",
        "fr": "Pepper, souriante, écrit les invitations à la plume pendant que Carrot tient une enveloppe. Un petit oiseau blanc attend sur le rebord de la fenêtre.",
        "es": "Pimienta, sonriente, escribe las invitaciones con una pluma mientras Zanahoria sostiene un sobre. Un pajarito blanco espera en el alféizar.",
        "ca": "La Pepper, somrient, escriu les invitacions amb una ploma mentre en Carrot aguanta un sobre. Un ocellet blanc espera a l’ampit de la finestra.",
        "ja": "ペッパーがほほえみながら羽ペンで招待状を書き、キャロットが封筒を掲げている。窓辺では小さな白い鳥が待っている。",
        "cn": "小辣椒微笑着用羽毛笔写邀请函，萝卜头举着一个信封。窗台上停着一只白色的小鸟。",
        "ar": "فُلفُل تكتب الدعوات بريشة وهي تبتسم، وجزر يرفع ظرفًا. وعلى حافة النافذة طائر أبيض صغير ينتظر.",
    },
    "e08p02-3": {
        "en": "Coriander, at her window with her invitation, gives a thumbs-up as Pepper and Carrot fly past on a broom. A grumpy black hen sits beside her.",
        "fr": "Coriandre, à sa fenêtre, son invitation à la main, lève le pouce tandis que Pepper et Carrot passent sur un balai. Une poule noire renfrognée se tient à côté d’elle.",
        "es": "Una bruja de pelo rizado, en su ventana y con la invitación en la mano, levanta el pulgar mientras Pimienta y Zanahoria pasan volando en una escoba. A su lado, una gallina negra con cara de pocos amigos.",
        "ca": "Una bruixa de cabells arrissats, a la finestra i amb la invitació a la mà, alça el polze mentre la Pepper i en Carrot passen volant amb una escombra. Al seu costat, una gallina negra amb cara de pocs amics.",
        "ja": "巻き毛の魔女が窓辺で招待状を手に親指を立て、ほうきで飛んでいくペッパーとキャロットを見送る。そばには不機嫌そうな黒いめんどり。",
        "cn": "一位卷发魔女拿着邀请函站在窗前，竖起大拇指，小辣椒和萝卜头骑着扫帚从窗外飞过。她身旁蹲着一只板着脸的黑母鸡。",
        "ar": "ساحرة ذات شعر مجعّد عند نافذتها والدعوة في يدها، ترفع إبهامها بينما تمرّ فُلفُل وجزر طائرين على مكنسة. وبجانبها دجاجة سوداء عابسة.",
    },
    "e08p02-4": {
        "en": "Seen from above, Shichimi waves from a green clearing by a steaming cauldron, her invitation in her other hand and her fox at her feet. Pepper waves back from her broom.",
        "fr": "Vue d’en haut, Shichimi salue de la main depuis une clairière verte, près d’un chaudron fumant, son invitation dans l’autre main et son renard à ses pieds. Pepper lui répond depuis son balai.",
        "es": "Vista desde arriba: una joven bruja de pelo claro saluda desde un claro verde junto a un caldero humeante, con la invitación en la otra mano y su zorro a los pies. Pimienta le devuelve el saludo desde la escoba.",
        "ca": "Vista des de dalt: una bruixa jove de cabells clars saluda des d’una clariana verda, al costat d’una olla fumejant, amb la invitació a l’altra mà i la seva guineu als peus. La Pepper li torna la salutació des de l’escombra.",
        "ja": "上から見たところ。緑の空き地で、淡い色の髪の若い魔女が湯気の立つ大釜のそばから手を振る。もう片方の手には招待状、足もとには狐。ほうきに乗ったペッパーが手を振り返す。",
        "cn": "俯视：一位浅色头发的年轻魔女站在绿色林间空地上冒着热气的大锅旁挥手，另一只手拿着邀请函，脚边跑着她的狐狸。骑在扫帚上的小辣椒也向她挥手。",
        "ar": "من الأعلى: ساحرة شابة فاتحة الشعر تلوّح من فسحة خضراء بجانب قِدر يتصاعد منه البخار، والدعوة في يدها الأخرى وثعلبها عند قدميها. وفُلفُل تردّ التحية من على مكنستها.",
    },
    "e08p02-5": {
        "en": "Saffron reads her invitation with a smile on a balcony above the rooftops, her white cat beside her. Pepper and Carrot fly off towards the setting sun.",
        "fr": "Safran lit son invitation en souriant, sur un balcon au-dessus des toits, son chat blanc à côté d’elle. Pepper et Carrot s’envolent vers le soleil couchant.",
        "es": "Una bruja pelirroja lee sonriente su invitación en un balcón sobre los tejados, con su gato blanco al lado. Pimienta y Zanahoria se alejan volando hacia la puesta de sol.",
        "ca": "Una bruixa pèl-roja llegeix somrient la invitació en un balcó sobre les teulades, amb el seu gat blanc al costat. La Pepper i en Carrot se’n van volant cap a la posta de sol.",
        "ja": "赤毛の魔女が、街の屋根を見下ろすバルコニーで招待状を読んでほほえむ。そばには白い猫。ペッパーとキャロットは夕日に向かって飛び去っていく。",
        "cn": "一位红发魔女站在俯瞰屋顶的阳台上，微笑着读邀请函，身旁坐着她的白猫。小辣椒和萝卜头朝着落日飞去。",
        "ar": "ساحرة صهباء تقرأ دعوتها مبتسمة على شرفة تطلّ على أسطح المدينة، وقطّها الأبيض بجانبها. وتبتعد فُلفُل وجزر طائرين نحو الشمس الغاربة.",
    },
    "e08p03-1": {
        "en": "Pepper’s cottage, its roof overgrown with greenery, stands at the edge of a wood beside a pond on a fine day. Bunting hangs across the porch.",
        "fr": "La maisonnette de Pepper, au toit envahi de verdure, se dresse à l’orée d’un bois, au bord d’un étang, par une belle journée. Des fanions pendent sous le porche.",
        "es": "La casita de Pimienta, con el tejado cubierto de plantas, se alza en la linde de un bosque junto a un estanque en un día soleado. Del porche cuelgan banderines.",
        "ca": "La caseta de la Pepper, amb la teulada coberta de plantes, s’alça a la vora d’un bosc al costat d’un estany, en un dia assolellat. Del porxo pengen banderetes.",
        "ja": "晴れた日。森のはずれ、池のほとりに、屋根が緑におおわれたペッパーの小さな家が建っている。玄関先には旗飾りが下がっている。",
        "cn": "晴朗的一天。小辣椒的小屋坐落在树林边、池塘旁，屋顶长满了绿植，门廊下挂着彩旗。",
        "ar": "بيت فُلفُل الصغير، وقد كسا الخضار سقفه، قائم عند طرف غابة بجانب بركة في يوم صحو، والرايات تتدلّى عند مدخله.",
    },
    "e08p03-2": {
        "en": "Inside, bunting hangs from the beams and cupcakes, a cake and a teapot wait on the low table. Pepper throws up her arms; Carrot grins.",
        "fr": "À l’intérieur, des fanions pendent des poutres ; petits gâteaux, gâteau et théière attendent sur la table basse. Pepper lève les bras au ciel, Carrot rayonne.",
        "es": "Dentro, cuelgan banderines de las vigas, y en la mesa baja esperan magdalenas, una tarta y una tetera. Pimienta levanta los brazos; Zanahoria sonríe de oreja a oreja.",
        "ca": "A dins, pengen banderetes de les bigues, i a la taula baixa esperen magdalenes, un pastís i una tetera. La Pepper aixeca els braços; en Carrot somriu d’orella a orella.",
        "ja": "家の中。梁から旗飾りが下がり、低いテーブルにはカップケーキとケーキとティーポットが並ぶ。ペッパーが両手を上げ、キャロットは満面の笑み。",
        "cn": "屋里，房梁上挂满彩旗，矮桌上摆着纸杯蛋糕、蛋糕和茶壶。小辣椒高举双臂，萝卜头笑得合不拢嘴。",
        "ar": "في الداخل تتدلّى الرايات من العوارض، وعلى الطاولة المنخفضة كعكات صغيرة وكعكة وإبريق شاي. فُلفُل ترفع ذراعيها، وجزر يبتسم ملء وجهه.",
    },
    "e08p03-3": {
        "en": "Later: Pepper waits at the table, chin in one hand, a cupcake in the other. Carrot dozes with his head on the table.",
        "fr": "Plus tard : Pepper attend à table, le menton dans une main, un petit gâteau dans l’autre. Carrot somnole, la tête sur la table.",
        "es": "Más tarde: Pimienta espera a la mesa, con la barbilla apoyada en una mano y una magdalena en la otra. Zanahoria dormita con la cabeza sobre la mesa.",
        "ca": "Més tard: la Pepper espera a taula, amb la barbeta a la mà i una magdalena a l’altra. En Carrot fa becaines amb el cap damunt la taula.",
        "ja": "しばらくして。ペッパーが片手でほおづえをつき、もう片方の手にカップケーキを持って待っている。キャロットはテーブルに頭をのせてうとうとしている。",
        "cn": "过了一会儿：小辣椒一手托着下巴，一手拿着纸杯蛋糕，坐在桌边等着。萝卜头把头搁在桌上打起了瞌睡。",
        "ar": "بعد حين: فُلفُل تنتظر إلى الطاولة، ذقنها على يدها وفي الأخرى كعكة صغيرة، وجزر يغفو ورأسه على الطاولة.",
    },
    "e08p04-1": {
        "en": "Rain pours down around the awning over the party table. Pepper, anxious, holds out a hand to the rain; Carrot sits soaked beside the table.",
        "fr": "La pluie tombe à verse autour de l’auvent tendu au-dessus de la table. Pepper, inquiète, tend la main sous la pluie ; Carrot, trempé, est assis près de la table.",
        "es": "Llueve a cántaros alrededor del toldo que cubre la mesa de la fiesta. Pimienta, inquieta, saca la mano bajo la lluvia; Zanahoria, empapado, está sentado junto a la mesa.",
        "ca": "Plou a bots i barrals al voltant del tendal que cobreix la taula de la festa. La Pepper, neguitosa, treu la mà sota la pluja; en Carrot, xop, seu al costat de la taula.",
        "ja": "パーティーのテーブルにかけた日よけのまわりに、雨が激しく降っている。ペッパーが不安げに雨へ手を差し出し、ずぶぬれのキャロットがテーブルのそばに座っている。",
        "cn": "大雨倾盆，打在派对桌上方的遮雨棚四周。小辣椒不安地伸手接雨，浑身湿透的萝卜头坐在桌边。",
        "ar": "المطر ينهمر حول المظلّة المنصوبة فوق طاولة الحفلة. فُلفُل تمدّ يدها إلى المطر قلقة، وجزر جالس بجانب الطاولة وقد ابتلّ تمامًا.",
    },
    "e08p04-2": {
        "en": "Night and rain: Pepper sits alone by a lantern at the party table, scowling. Carrot sleeps curled up on the table.",
        "fr": "La nuit, sous la pluie : Pepper, seule près d’une lanterne à la table de fête, fronce les sourcils. Carrot dort, roulé en boule sur la table.",
        "es": "Noche y lluvia: Pimienta, sola junto a un farol en la mesa de la fiesta, frunce el ceño. Zanahoria duerme hecho un ovillo sobre la mesa.",
        "ca": "Nit i pluja: la Pepper, sola al costat d’un fanal a la taula de la festa, arrufa les celles. En Carrot dorm arraulit damunt la taula.",
        "ja": "夜の雨。ペッパーがパーティーのテーブルでランタンのそばにひとり座り、顔をしかめている。キャロットはテーブルの上で丸くなって眠っている。",
        "cn": "夜晚，下着雨：小辣椒独自坐在派对桌旁的提灯边，眉头紧锁。萝卜头蜷在桌上睡着了。",
        "ar": "ليل ومطر: فُلفُل وحدها عند فانوس على طاولة الحفلة، عابسة، وجزر نائم ملتفًّا على الطاولة.",
    },
    "e08p04-3": {
        "en": "Close-up of Pepper’s face under her hat in the rain, her eyes burning red, her mouth set in anger.",
        "fr": "Gros plan sur le visage de Pepper sous son chapeau, dans la pluie : ses yeux brûlent de rouge, sa bouche se serre de colère.",
        "es": "Primer plano del rostro de Pimienta bajo el sombrero, en la lluvia: los ojos le arden en rojo y aprieta la boca con rabia.",
        "ca": "Primer pla de la cara de la Pepper sota el barret, sota la pluja: els ulls li cremen de vermell i estreny la boca de ràbia.",
        "ja": "雨の中、帽子の下のペッパーの顔のアップ。目が赤く燃え、怒りに口を引き結んでいる。",
        "cn": "雨中，帽檐下小辣椒的面部特写：双眼燃着红光，嘴唇紧抿，满脸怒意。",
        "ar": "لقطة قريبة لوجه فُلفُل تحت قبّعتها في المطر: عيناها تتّقدان احمرارًا، وفمها مطبق من الغضب.",
    },
    "e08p05-1": {
        "en": "Lightning. Pepper, furious, pulls a book with a demon’s face on its cover from the shelf. Carrot is terrified.",
        "fr": "Des éclairs. Pepper, furieuse, tire de l’étagère un livre dont la couverture porte un visage de démon. Carrot est terrifié.",
        "es": "Relámpagos. Pimienta, furiosa, saca de la estantería un libro con la cara de un demonio en la tapa. Zanahoria está aterrado.",
        "ca": "Llamps. La Pepper, furiosa, treu del prestatge un llibre amb la cara d’un dimoni a la coberta. En Carrot està aterrit.",
        "ja": "稲妻。怒ったペッパーが、表紙に悪魔の顔のある本を棚から引き抜く。キャロットはおびえている。",
        "cn": "电闪雷鸣。小辣椒怒气冲冲地从书架上抽出一本封面有恶魔脸的书。萝卜头吓坏了。",
        "ar": "برق. فُلفُل غاضبة تسحب من الرفّ كتابًا على غلافه وجه شيطان، وجزر مذعور.",
    },
    "e08p05-2": {
        "en": "From above, in the rain, Pepper draws three glowing red magic circles on the ground with her wand, the open book in her other hand. Carrot watches.",
        "fr": "Vue d’en haut, sous la pluie, Pepper trace à la baguette trois cercles magiques rouges et lumineux sur le sol, le livre ouvert dans l’autre main. Carrot regarde.",
        "es": "Desde arriba, bajo la lluvia, Pimienta traza con su varita tres círculos mágicos rojos y brillantes en el suelo, con el libro abierto en la otra mano. Zanahoria mira.",
        "ca": "Des de dalt, sota la pluja, la Pepper traça amb la vareta tres cercles màgics vermells i brillants a terra, amb el llibre obert a l’altra mà. En Carrot mira.",
        "ja": "上から見たところ。雨の中、ペッパーが片手に開いた本を持ち、杖で地面に赤く光る魔法陣を三つ描く。キャロットが見ている。",
        "cn": "俯视：雨中，小辣椒一手捧着打开的书，一手用魔杖在地上画出三个发光的红色魔法阵。萝卜头在一旁看着。",
        "ar": "من الأعلى، تحت المطر، ترسم فُلفُل بعصاها ثلاث دوائر سحرية حمراء متوهّجة على الأرض، والكتاب مفتوح في يدها الأخرى، وجزر يراقب.",
    },
    "e08p05-3": {
        "en": "Red light from the circles floods the scene. Pepper, grim, holds the open book in the rain.",
        "fr": "La lumière rouge des cercles envahit la scène. Pepper, l’air sombre, tient le livre ouvert sous la pluie.",
        "es": "La luz roja de los círculos lo inunda todo. Pimienta, seria, sostiene el libro abierto bajo la lluvia.",
        "ca": "La llum vermella dels cercles ho inunda tot. La Pepper, seriosa, aguanta el llibre obert sota la pluja.",
        "ja": "魔法陣の赤い光があたりを満たす。ペッパーが険しい顔で、雨の中、開いた本を持っている。",
        "cn": "魔法阵的红光笼罩一切。小辣椒神情严峻，在雨中捧着打开的书。",
        "ar": "ضوء الدوائر الأحمر يغمر المشهد، وفُلفُل متجهّمة تمسك الكتاب مفتوحًا تحت المطر.",
    },
    "e08p06-1": {
        "en": "Seen from behind, Pepper, the book in her hand, faces three huge demons with glowing red eyes rising in the storm, one holding a trident. Carrot, at her feet, is terrified.",
        "fr": "Vue de dos, Pepper, le livre à la main, fait face à trois démons gigantesques aux yeux rouges luisants, dressés dans l’orage ; l’un tient un trident. Carrot, à ses pieds, est terrifié.",
        "es": "De espaldas, Pimienta, con el libro en la mano, se enfrenta a tres demonios enormes de ojos rojos y brillantes que se alzan en la tormenta; uno empuña un tridente. Zanahoria, a sus pies, está aterrado.",
        "ca": "D’esquena, la Pepper, amb el llibre a la mà, s’encara a tres dimonis enormes d’ulls vermells i brillants que s’alcen en la tempesta; un empunya un trident. En Carrot, als seus peus, està aterrit.",
        "ja": "後ろ姿のペッパーが本を手に、嵐の中に現れた赤い目の巨大な悪魔三体と向き合う。一体は三叉の矛を持っている。足もとのキャロットはおびえきっている。",
        "cn": "小辣椒背对着我们，手拿那本书，面对暴风雨中升起的三个红眼巨魔，其中一个握着三叉戟。她脚边的萝卜头吓得魂飞魄散。",
        "ar": "فُلفُل من الخلف، والكتاب في يدها، تواجه ثلاثة شياطين ضخمة بعيون حمراء متوهّجة تنهض في العاصفة، أحدها يحمل رمحًا ثلاثي الشُّعب، وجزر عند قدميها مذعور.",
    },
    "e08p06-2": {
        "en": "Pepper, lit red, smiles a sly smile.",
        "fr": "Pepper, éclairée de rouge, esquisse un sourire malicieux.",
        "es": "Pimienta, iluminada de rojo, esboza una sonrisa maliciosa.",
        "ca": "La Pepper, il·luminada de vermell, fa un somriure entremaliat.",
        "ja": "赤い光に照らされたペッパーが、にやりと笑う。",
        "cn": "被红光映照的小辣椒狡黠地一笑。",
        "ar": "فُلفُل، والضوء الأحمر على وجهها، تبتسم ابتسامة ماكرة.",
    },
    "e08p06-3": {
        "en": "The party after all: by candlelight, Pepper clinks teacups with the biggest demon while Carrot laughs, and the other two demons smile around the table.",
        "fr": "La fête a bien lieu : à la lueur des bougies, Pepper trinque avec le plus grand démon, tasse de thé contre tasse de thé, pendant que Carrot rit ; les deux autres démons sourient autour de la table.",
        "es": "Al final hay fiesta: a la luz de las velas, Pimienta brinda con su taza de té con el demonio más grande mientras Zanahoria se ríe, y los otros dos demonios sonríen alrededor de la mesa.",
        "ca": "Al final hi ha festa: a la llum de les espelmes, la Pepper brinda amb la tassa de te amb el dimoni més gran mentre en Carrot riu, i els altres dos dimonis somriuen al voltant de la taula.",
        "ja": "結局パーティーは開かれた。ろうそくの明かりの中、ペッパーがいちばん大きな悪魔とティーカップで乾杯し、キャロットが笑う。ほかの二体の悪魔もテーブルを囲んでほほえんでいる。",
        "cn": "派对终究开成了：烛光下，小辣椒和最大的恶魔碰杯喝茶，萝卜头哈哈大笑，另外两个恶魔也围坐在桌边，笑眯眯的。",
        "ar": "الحفلة تُقام في النهاية: على ضوء الشموع تقرع فُلفُل فنجان شايها بفنجان أكبر الشياطين بينما يضحك جزر، والشيطانان الآخران يبتسمان حول الطاولة.",
    },
}


def attr(text: str) -> str:
    """`text` as the value of a `::panel{alt="…"}` attribute: the grammar
    reads `"…"` up to the next ASCII double quote, and a panel line ends at
    its first `}`, so neither may appear (nor a line break)."""
    if any(c in text for c in '"{}\n\\'):
        raise SystemExit(f"alt text unfit for an attribute value: {text!r}")
    return text
