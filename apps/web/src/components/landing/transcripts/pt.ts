// The Brazilian Portuguese cut of each narrated video, block by block.
import type { TranscriptBlock, TranscriptVideo } from "../transcripts";

export const TRANSCRIPTS_PT: Record<TranscriptVideo, TranscriptBlock[]> = {
  showreel: [
    {
      time: "0:00",
      scene: "Sobre fundo escuro, “MOGÚNCIA · 1455” acima de um fio dourado. Atrás da manchete “Durante cinco séculos, a imprensa aprendeu a compor a página.”, o ano avança de 1455 a 2026 em grandes algarismos vazados, e termos do ofício vão caindo em volta: Justificação, Kerning, Viúvas, órfãs, Colunas equilibradas, Entrelinha, Grade de base, hi·fe·ni·za·ção, Medida, Flutuantes, Cabeços, Rios. A câmera entra no ponto final, que enche a tela de dourado.",
      narration: "Durante cinco séculos, a imprensa aprendeu a compor a página.",
    },
    {
      time: "0:06",
      scene: "Manchete: “A web aprendeu a diagramar interfaces. Nunca aprendeu a compor uma página.” Uma janela de navegador em example.com/longform/article mostra um artigo justificado em três colunas, “Por que a web falha”; etiquetas vermelhas apontam rios de branco, uma órfã, uma viúva, uma imagem que cai sobre o texto e uma última coluna desequilibrada. Ao lado, um chip de código diz “column-count: 3;”, seguido de “…e pouco mais.” e de uma lista riscada com os mesmos cinco defeitos: Rios de branco, Órfãs, Viúvas, Colisões, Colunas desequilibradas. A janela se distorce e desaba.",
      narration: "A web aprendeu a diagramar as interfaces. Nunca as páginas. Por isso o texto longo continua se quebrando: rios, viúvas, órfãs, colisões.",
    },
    {
      time: "0:20",
      scene: "Depois de um clarão branco e de uma varredura de faixas azul, dourada e vermelha, o logotipo do Postext sobe até o seu lugar com o lema “O tipógrafo programável para a web”. Embaixo: CÓDIGO ABERTO · LICENÇA MIT · v1.20.3 · FUNCIONA NO SEU NAVEGADOR.",
      narration: "Este é o Postext: o tipógrafo programável para a web.",
    },
    {
      time: "0:26",
      scene: "Seção 01 de 07, “Entra o conteúdo”: “O Markdown diz o que é cada coisa.” Um arquivo Markdown, 03-por-que-postext.md, se digita sozinho: uma diretiva de parte, o título “Por que Postext” com um lead, um parágrafo que cita a figura fig-flow com :ref, uma linha ::resource e um bloco :::callout. Ao lado, config.ts chama buildDocument com diagramação em duas colunas, texto justificado e hifenização para “pt-BR”, sob a frase “A configuração decide como fica. O texto não contém nenhuma decisão de diagramação.”",
      narration: "Você escreve Markdown semântico, que diz o que é cada coisa. A configuração decide como fica.",
    },
    {
      time: "0:34",
      scene: "Seção 02, “O Pretext mede”: “Medido sem tocar no DOM.” Um título, um parágrafo e um boxe são escaneados um depois do outro, e linhas de cota dão a altura de cada um em pontos; um painel de código mostra prepare(text, '25px Lora') e layout(prepared, width, 38), que devolve uma altura e um número de linhas. Duas barras disputam 10.000 parágrafos: “Reflow do navegador · DOM” mal sai do lugar e “Pretext · canvas + aritmética” se enche na hora, e um contador sobe até 600× acima de “mais rápido que o DOM para medir texto, para que um livro inteiro se recomponha enquanto você digita” e “Baseado em @chenglou/pretext”.",
      narration: "Cada parágrafo se mede sem tocar o DOM, até seiscentas vezes mais rápido, graças ao Pretext, a biblioteca que o tornou possível.",
    },
    {
      time: "0:44",
      scene: "Seção 03, “O Postext decide”: “Cada linha no lugar antes de pintar um pixel.” Um anel de sete segmentos se acende por turnos, Estrutura, Medição, Disposição, Flutuantes, Refino, Equilíbrio e Ritmo, cada um com uma linha de explicação, enquanto ao lado se monta uma página em duas colunas do guia do Postext: os blocos etiquetados voam para as suas colunas, uma figura desliza até o lugar com a nota “:ref{id=\"fig-flow\"} → pé da coluna”, a faixa de abertura desce, as linhas aparecem, as colunas se nivelam e a grade de base desce pela página. O anel percorre as iterações 1 a 3 e mostra “Estável em 3 iterações” com um visto; um boxe dá a caixa e a linha de base de uma linha.",
      narration: "Depois, o Postext decide. Sete passadas posicionam cada linha, levam cada figura ao seu lugar e equilibram as colunas, até que nada se mova.",
    },
    {
      time: "0:57",
      scene: "Seção 04, “O documento virtual”: “Mude uma palavra. Só se recompõe o que muda.”, com a nota “Como o virtual DOM do React, mas para páginas: o VDT, uma árvore de documento virtual.” Sete páginas, da p. 7 à p. 13, em fila; um cursor marca uma edição na p. 11, o resto dessa coluna fica dourado como SUJO e uma faixa passa para a p. 12, que recebe um visto e ESTÁVEL, enquanto as anteriores dizem PULADA e as seguintes INTACTA. Três marcadores explicam a regra, e um painel com o título renderToHtmlIndexed() marca como ATUALIZADO os nós da árvore que mudaram.",
      narration: "Tudo vive num documento virtual, como o virtual DOM do React. Você muda uma palavra, e só o que mudou é recomposto.",
    },
    {
      time: "1:07",
      scene: "“Um documento longo? Só se pinta o que está na tela.” Uma coluna de páginas passa por uma moldura dourada chamada VIEWPORT, com uma margem de 200 pixels acima e abaixo: as páginas de dentro são desenhadas inteiras e as de fora são contornos tracejados. Um contador grande indica quantas das 51 páginas estão pintadas a cada momento (IntersectionObserver · +200 px), ao lado de “Geometria: todas as páginas. Pixels: só o que você vê.”",
      narration: "E num livro longo, só são pintadas as páginas que estão visíveis na tela.",
    },
    {
      time: "1:14",
      scene: "Seção 05, “Justificação Knuth–Plass”: “Todas as formas de quebrar o parágrafo. Ao mesmo tempo.” À esquerda, sob “Gulosa · o navegador”, um parágrafo sobre a quebra de linhas é composto de forma gulosa, como faz o navegador, com as linhas mais frouxas em vermelho. Embaixo, cada palavra é um ponto sobre uma reta: arcos vermelhos para as quebras gulosas, arcos azuis tênues que testam todas as quebras possíveis e um caminho dourado com a melhor combinação. À direita, a versão “Knuth–Plass · Postext”, de espaçamento uniforme, com os deméritos de cada linha, a fórmula “(1 + feiura + penalidade)²” e uma soma de deméritos menor.",
      narration: "Um navegador quebra as linhas de forma gulosa, uma a uma. O Postext usa Knuth-Plass, o algoritmo do TeX: pesa todas as formas de quebrar o parágrafo inteiro e fica com a mais uniforme.",
    },
    {
      time: "1:29",
      scene: "Seção 06, “Uma diagramação, cinco saídas”: “O que você vê é o que vai para a gráfica.” Sob a linha de código const vdt = buildDocument(content, config); uma página se divide em cinco. Canvas (renderToCanvas(), bitmaps exatos ao pixel) ganha uma lupa sobre a sua grade de pixels; HTML (renderToHtml(), selecionável e responsivo) contorna cada bloco com a sua etiqueta <h1>, <p>, <figure> etc.; em PDF (renderToPdf(), para impressão, PDF/UA, CMYK) quatro chapas de cor entram em registro e aparecem marcas de corte e uma barra de cor. Em EPUB 3 (renderToEpub(), livro digital, fixo ou refluível) a página aparece num leitor de livros digitais com a etiqueta “Layout fixo”; a tela se estreita até o tamanho de um celular, o texto se redistribui e a etiqueta passa a “Refluível”. Em Folio (postext-folio, um livro em 3D que vira as páginas) a página se abre numa página dupla e uma folha gira sobre a lombada.",
      narration: "Uma diagramação, cinco saídas: canvas, HTML, PDF para impressão, EPUB 3, fixo ou refluível, e um livro em 3D. O que você vê é o que vai para a gráfica.",
    },
    {
      time: "1:45",
      scene: "Seção 07, “Por que um padrão aberto”: “LaTeX definiu o padrão do papel. Hoje a edição vive também em cada tela.” Dois cartões: LaTeX, 1984, com xis ao lado de “Pensado para a página impressa”, “Preso às fontes e pacotes de uma máquina”, “Compilar, esperar, repetir” e “Sem diagramação editorial na web responsiva”; Postext, 2026, com vistos ao lado de “Web, PDF para gráfica e EPUB 3, uma diagramação”, “Um só arquivo .postext leva tudo”, “Recompõe ao vivo enquanto você digita” e “Em qualquer navegador · sem servidores · MIT”. O cartão do Postext se acende.",
      narration: "O LaTeX definiu o padrão do papel. Mas hoje a edição vive em todas as telas.",
    },
    {
      time: "1:52",
      scene: "Chamada “Um arquivo, o livro inteiro” e manchete “Um padrão aberto para a edição, além de onde o LaTeX chega.” Um ícone de arquivo .postext se abre em cinco peças: preset.json (configuração e design), chapters/*.md (um Markdown por capítulo), fonts/*.woff2 (as próprias fontes), images/ · SVG (cada imagem, incluída) e resources (tabelas, figuras e legendas). Rodapé: “Um ZIP comum: aberto, documentado e com licença MIT. Qualquer ferramenta pode lê-lo e escrevê-lo.”",
      narration: "O Postext é um padrão aberto: um único arquivo portátil, documentado e com licença MIT, que qualquer ferramenta pode ler e escrever.",
    },
    {
      time: "2:03",
      scene: "“A amostra · composta pelo motor real”: um mural de páginas da edição brasileira do guia se afasta em perspectiva enquanto um contador chega a 51 páginas. Texto: “11 capítulos, 3 partes e as capas, diagramados em cerca de meio segundo. Cada página do guia do Postext, calculada em um navegador pelo postext v1.20.3 para esta peça. Nada posto à mão.” Depois, as etiquetas Livros didáticos, Revistas, Edições literárias, Catálogos.",
      narration: "Por isso ele consegue diagramar livros de centenas de páginas em décimos de segundo.",
    },
    {
      time: "2:10",
      scene: "Fechamento: o logotipo do Postext com o lema “O tipógrafo programável para a web”, o endereço postext.dev, uma linha de terminal que digita “$ pnpm add postext” e o rodapé “Código aberto · MIT · github.com/drnachio/postext”.",
      narration: "Postext. Código aberto, em postext.dev.",
    },
  ],
  tutorial: [
    {
      time: "0:00",
      scene: "Abertura: o logotipo do Postext, a chamada “Tutorial · 5 passos” e o título “Converta sua publicação em Postext com um agente de IA. Sem programar.”",
    },
    {
      time: "0:03",
      scene: "“Sua publicação já existe.” Três capas caem uma depois da outra com as suas etiquetas: um livro, Dom Casmurro, de Machado de Assis (Coleção Casuarina), marcado InDesign (IDML); um manual, o da chaleira elétrica Verra W1, marcado Word (DOCX); e uma revista, FALLOW, marcada PDF. Elas se agrupam à esquerda, uma seta dourada tracejada passa por um selo “Agente de IA” e aparece um ícone de arquivo, meu-livro.postext, sob “Um agente a converte em Postext. Cinco passos. Alguns pedidos bem escritos.”",
      narration: "Você já tem uma publicação: um livro, um manual, uma revista. Ela vive no InDesign, no Word ou num PDF. Neste tutorial, um agente de inteligência artificial vai convertê-la em Postext para você. Sem programar: cinco passos e alguns pedidos bem escritos.",
    },
    {
      time: "0:24",
      scene: "“O plano”: cinco cartões numerados aparecem à medida que cada passo é nomeado: 01 Prepare a pasta, 02 Reúna os originais vetoriais, 03 Adicione uma referência, 04 Peça ao agente, 05 Revise no Sandbox.",
      narration: "O plano: preparar a pasta, reunir os originais vetoriais, adicionar uma referência, pedir ao agente e revisar o resultado.",
    },
    {
      time: "0:34",
      scene: "Passo 01, a pasta: “Um projeto, uma pasta.” Uma pasta grande, meu-livro/, flutua entre dez arquivos soltos, como MinionPro-Regular.otf, capa.jpg, fig-2-1.ai, capitulo-01.docx, mapa.svg, livro.idml e grafico.pdf. Abre-se uma janela com a árvore da pasta, e cada arquivo voa para a sua subpasta quando ela é nomeada: referencia.pdf (como deve ficar → passo 03), fontes/ (Minion Pro, Myriad…, .otf .ttf .woff2), imagens/ (fotografias, .jpg .png), ilustracoes/ (originais vetoriais, .ai .svg .pdf) e textos/ (Word, InDesign IDML…).",
      narration: "Passo um: reúna tudo numa única pasta no seu computador. Um projeto, uma pasta. Dentro dela, dê a cada tipo de material a sua própria subpasta: as fontes, as imagens, as ilustrações e os textos.",
    },
    {
      time: "0:51",
      scene: "A linha fontes/ fica destacada e um cartão com o título “Fontes” mostra um “Aa” grande, os estilos Redondo, Itálico e Negrito, os formatos OTF, TTF e WOFF2 e a nota “Só dá para usar as que você incluir.” Depois, “Quanto mais organizada, menos ele adivinha.”, enquanto cada subpasta da árvore recebe um visto.",
      narration: "Não se esqueça das fontes: elas são a voz do design, e o agente só pode usar as que você incluir. Quanto mais organizada estiver a pasta, menos o agente vai ter que adivinhar.",
    },
    {
      time: "1:04",
      scene: "Passo 02, originais vetoriais: “Reúna os originais.” Um diagrama, um gráfico e um mapa são desenhados em traço, com os pontos de ancoragem à mostra, e aparecem três ícones de arquivo: .ai Illustrator, .svg SVG e .pdf PDF.",
      narration: "Passo dois: se as suas ilustrações são vetoriais, como diagramas, gráficos ou mapas, procure os arquivos originais: Illustrator, SVG ou PDF.",
    },
    {
      time: "1:15",
      scene: "Dois painéis mostram a mesma figura, um diagrama em que Manuscrito e Modelo apontam para Páginas, com a legenda “Fig. 2.1 Conteúdo e design se encontram.” À esquerda, “Recortada do PDF: uma foto do desenho” fica borrada e pixelada ao ser ampliada; à direita, “O original: o próprio desenho” continua nítido. O painel da esquerda se apaga, os rótulos do original são reescritos em inglês (Manuscript, Template, Pages), marcas de corte o enquadram e três vistos dizem “Nítida em qualquer tamanho”, “Rótulos como texto real” e “Original → gráfica”.",
      narration: "Uma figura recortada do PDF final é pouco mais que uma foto do desenho. O original é o próprio desenho. Com o original, o agente recompõe cada figura: nítida em qualquer tamanho, com seus rótulos como texto real, prontos para traduzir. E na gráfica, o original vai do jeito que está.",
    },
    {
      time: "1:37",
      scene: "Passo 03, a referência: “Mostre como deve ficar.” Na árvore da pasta, referencia.pdf fica destacado com a etiqueta “Na raiz”; dele sai uma página que se transforma numa página de livro grande, em duas colunas, marcada referencia.pdf.",
      narration: "O passo três é essencial: na raiz da pasta, coloque um arquivo que mostre com clareza como o produto final deve ficar. O ideal é um PDF.",
    },
    {
      time: "1:47",
      scene: "Sobre a página aparecem as medidas: o contorno das colunas, uma medianiz de 9 mm, uma margem de 20 mm, etiquetas para o título (Fraunces 28 pt), o texto (Lora 9,4/13,6 pt) e um boxe (fundo, 1 fio), e as linhas de base com entrelinha de 13,6 pt. Um arquivo, ficha-de-especificacoes.md, vai sendo preenchido: página 210 × 280 mm; margens 24 · 20 · 22 · 20 mm, simétricas; 2 colunas, medianiz 9 mm; grade de linhas de base 13,6 pt; texto Lora 9,4 / 13,6 pt, justificado; títulos Fraunces 28 pt · Geist; aberturas com faixa de cor de 101 mm; boxes com fundo e fio à esquerda. Depois a palavra “Adivinhar” é riscada e “Medir.” se acende em dourado.",
      narration: "O agente lê o design nessas páginas: mede margens, colunas, fontes e espaçamentos, e os anota como regras de diagramação. Sem referência, ele teria que adivinhar. Com ela, mede.",
    },
    {
      time: "2:03",
      scene: "Passo 04, o agente: “Peça com suas palavras.” Abre-se uma janela com o título “Agente · ~/meu-livro” ao lado dos selos Claude Code, Codex e “ou qualquer outro agente”. Na janela é digitada uma mensagem assinada VOCÊ: “Instale a skill do Postext: `npx skills add drnachio/postext --skill postext-port`”, e o agente responde “✓ Skill instalada: postext-port”. Um cartão da skill postext-port lista “Um método testado”, “Tudo sobre o Postext” e “Ferramentas para revisar o próprio trabalho”.",
      narration: "Passo quatro: abra o seu agente, Claude Code, Codex ou o que você usa, nessa pasta, e peça que ele instale a skill do Postext. Uma skill é um pacote de conhecimento especializado. Esta ensina o agente a converter uma publicação para Postext, e lhe dá ferramentas para revisar o próprio trabalho.",
    },
    {
      time: "2:24",
      scene: "O pedido seguinte é digitado: “Use a skill postext-port para converter este livro para Postext. O design está em referencia.pdf, as fontes em fontes/ e as ilustrações originais em ilustracoes/: use-as em vez de recortar as figuras do PDF. Comece só pelo capítulo 1 e me mostre a ficha de especificações antes de construí-lo.” Ao lado, referencia.pdf, fontes/ e ilustracoes/ se acendem na árvore da pasta à medida que a mensagem os cita, e aparece um cartão com “Cap. 1”.",
      narration: "Depois, peça o que você quer com as suas palavras. Diga onde estão a referência, as fontes e os originais, e que ele comece por um só capítulo.",
    },
    {
      time: "2:37",
      scene: "Uma grade de doze páginas esmaecidas; a primeira ganha um contorno dourado. Uma seta circular conta as rodadas de ajuste sobre ela até aparecer um visto, e então as outras onze se acendem. Embaixo: Capítulo de amostra → Refinar → Estender.",
      narration: "Se o conteúdo for longo, comece por um capítulo de amostra. Refine-o até ficar perfeito, e só então estenda-o ao resto.",
    },
    {
      time: "2:45",
      scene: "O agente pergunta “Cópia fiel ou redesenho?”, “Quais idiomas?” e “Papel, tela ou os dois?”. Uma lista de tarefas avança por Fazer o inventário, Medir o design, Extrair o texto, Fontes e imagens, Comparar página a página e Empacotar o arquivo, e aparece o arquivo meu-livro.postext. Um terceiro pedido é digitado: “O capítulo 1 está aprovado. Converta o resto dos capítulos com o mesmo design, compare cada um com referencia.pdf e empacote tudo num único arquivo .postext.” O agente responde “✓ 12 capítulos · 0 avisos · meu-livro.postext”.",
      narration: "O agente vai fazer algumas perguntas: cópia fiel ou redesenho, quais idiomas, papel ou tela. Depois mede, extrai, monta e confere, e entrega um arquivo Postext. Quando a amostra estiver boa, estendê-la ao livro inteiro é só mais um pedido.",
    },
    {
      time: "3:08",
      scene: "Passo 05, o Sandbox: “Revise página por página.” Numa janela de navegador é digitado o endereço postext.dev/pt/sandbox. O ponteiro clica em Livros na barra lateral, depois em Novo e em “Abrir um arquivo .postext…”; o arquivo entra voando, “Meu livro, 12 capítulos · 184 páginas” aparece no alto da lista e as primeiras páginas se abrem na visualização Canvas; as abas de visualização são Canvas, HTML, PDF, Folio e EPUB 3.",
      narration: "Passo cinco: abra o Sandbox do Postext, em postext.dev. Em Livros, escolha Novo e abra o seu arquivo.",
    },
    {
      time: "3:17",
      scene: "A página de referência e a do Postext ficam lado a lado, com as etiquetas Referência e Postext, e uma linha dourada as percorre de cima a baixo. Abre-se o painel Verificações, com um contador de 3 e a lista Viúva (p. 4), Linha frouxa (p. 7) e A figura não cabe (p. 9); caixas vermelhas marcam cada problema na página do Postext.",
      narration: "Revise página por página, ao lado da sua referência. O painel Verificações aponta os problemas: viúvas, linhas frouxas, figuras que não cabem.",
    },
    {
      time: "3:28",
      scene: "Duas fileiras de páginas esquemáticas, “Referência · PDF” e “Postext · fluido”. Na fileira fluida, uma figura passa da primeira página para o topo da segunda, e uma linha tracejada liga as suas duas posições. Texto: “As mesmas regras, não as mesmas páginas. O conteúdo flui: uma figura ou uma quebra de página podem cair em outro lugar.” Depois, um sinal de igual une cada par de páginas sob “O que precisa coincidir”: Margens e grade de linhas de base, Tipografia, Estilo de figuras e boxes, Páginas limpas: sem viúvas, colunas equilibradas. Um painel vermelho com o sinal ≠ diz “Decisões artesanais à mão: não são regras, não servem para um conteúdo que muda”.",
      narration: "Tenha em mente uma coisa: as páginas não precisam ser idênticas às do PDF. O Postext entendeu as regras de diagramação e agora o seu conteúdo é fluido, então uma figura ou uma quebra de página podem cair em outro lugar. O que precisa coincidir é a qualidade: os mesmos valores de produção. Quando diagramamos à mão, tomamos pequenas decisões artesanais que não são regras. E só com regras dá para diagramar um conteúdo que muda.",
    },
    {
      time: "3:59",
      scene: "A janela do agente volta com um quarto pedido: “No Sandbox, capítulo 2, página 7: o boxe ‘Lembre’ se divide em duas colunas e falta o cabeço. Verificações marca 3 linhas frouxas. Corrija isso e empacote o arquivo de novo.” Uma captura vai anexada, captura-cap2-p7.png. Depois, um ciclo entre Sandbox (revisar) e Agente (corrigir) dá as voltas 1 a 3 enquanto o número de avisos cai de 3 para 0, e termina com um visto e “Perfeito.”",
      narration: "Depois, conte ao agente o que você vê, com a maior precisão possível: o capítulo, a página e o que está errado. Uma captura de tela ajuda. Abra a nova versão, revise de novo e repita. Cada rodada chega mais perto, até que fique perfeito.",
    },
    {
      time: "4:20",
      scene: "“Não só uma versão Postext.” O arquivo meu-livro.postext se divide em dois ao longo de uma linha dourada. À esquerda, Conteúdo (o que diz): chapters/pt/02-a-celula.md, com o título “A célula”, uma frase que cita a figura fig-celula e um boxe “lembre”. À direita, Forma (como fica): um modelo deduzido do seu original, com página de 210 × 280 mm simétrica, 2 colunas com medianiz de 9 mm, texto Lora 9,4/13,6 justificado, títulos em Fraunces numerados, boxes “lembre” com fundo e fio, e figuras no topo da coluna.",
      narration: "E o melhor: você não só tem o seu conteúdo em Postext. Você separou o conteúdo da forma. O texto vive em capítulos limpos; o design, num modelo com as regras de diagramação deduzidas do seu original.",
    },
    {
      time: "4:34",
      scene: "Os chips Corrigir, Ampliar e Traduzir se acendem sobre uma fileira de páginas: uma linha fica destacada e um brilho percorre as páginas, entram mais duas páginas e as páginas viram para mostrar a edição em inglês. Um pedido é digitado: “Acrescente uma edição em inglês: traduza os capítulos, as legendas das figuras e os rótulos dos diagramas, e mantenha o mesmo design.” Rodapé: “As mesmas regras. Conteúdo novo. As páginas se compõem sozinhas.” Depois, “Um arquivo, o livro inteiro.”: um ícone .postext se ramifica para uma página com marcas de corte (PDF para impressão), um leitor de livros digitais com o texto ajustado à sua tela (Livro digital EPUB), uma janela de navegador (Leitor web) e um par de páginas (Cada página, composta).",
      narration: "Assim, quando o seu conteúdo mudar, quando você o corrigir, ampliar ou traduzir, não vai precisar se preocupar com o formato. O Postext o recompõe com as mesmas regras. Um só arquivo para o livro inteiro: um PDF pronto para impressão, um livro digital EPUB, um leitor para a web e páginas que se compõem sozinhas.",
    },
    {
      time: "4:59",
      scene: "Fechamento: o logotipo do Postext, o lema “O tipógrafo programável para a web”, postext.dev, um chip com “Os prompts deste vídeo estão na descrição ↓” e o rodapé “Código aberto · MIT · github.com/drnachio/postext”.",
      narration: "Postext. Código aberto, em postext.dev. Os prompts de exemplo estão na descrição.",
    },
  ],
};
