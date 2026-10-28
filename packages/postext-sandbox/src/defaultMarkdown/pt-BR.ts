export const DEFAULT_MARKDOWN_PT_BR = `---
title: "Postext"
subtitle: "Um compositor programável para a web"
author: "Ignacio Ferro"
publishDate: "2026-10-04"
---

# Postext {style="cover" toc="false" kicker="Motor de layout de código aberto · O guia" publisher="postext.dev · Licença MIT · Cada página deste livro foi composta pelo Postext no seu navegador"}

:::pagebreak

:::paragraphs{style="colophon"}
**O guia do Postext** é o livro de exemplo que acompanha o Sandbox. É ao mesmo tempo um passeio pelo motor e uma demonstração do que ele faz: a capa, o sumário que se numera sozinho, as folhas de rosto das partes, as aberturas de capítulo, os cabeços, cada figura e cada tabela que flutua até o seu lugar, tudo isso é diagramado pelo Postext, no seu navegador, a partir do Markdown que você pode abrir no editor.

Composto em Fraunces, Lora, Bricolage Grotesque, Geist e Geist Mono, servidas pelo Google Fonts. Os diagramas são arquivos SVG simples, desenhados como vetores no canvas, na visualização HTML e no PDF. Mude o que quiser (uma palavra, uma margem, uma cor da paleta) e o livro se compõe de novo.

O Postext é de código aberto, sob a licença MIT. Texto © 2026 Ignacio Ferro e os colaboradores do Postext.
:::

# Sumário {style="contents" toc="false"}

:::toc

:::part{number="I" title="Fundamentos" palette="band=#2b4acb"}
1. Por que o Postext
2. Como o motor funciona
:::

# Por que o Postext {lead="A tipografia impressa passou cinco séculos aprendendo a compor uma página; os navegadores aprenderam a dispor uma interface. O Postext leva a primeira ao segundo: um motor de layout que transforma Markdown em páginas compostas com padrão editorial." summary="A distância entre a web e a página, e o que a preenche"}

O Postext é um **motor de layout de código aberto** que leva para a web o ofício da tipografia impressa profissional. Ele recebe **conteúdo semântico** escrito em Markdown enriquecido e um objeto de configuração, e calcula um layout totalmente resolvido:index{term="configuração"} em que cada linha, título, figura e tabela tem uma posição precisa, medida em unidades tipográficas reais. Esse layout é então desenhado por três renderizadores (uma visualização ao vivo em canvas, HTML posicionado e um PDF pronto para impressão), que leem a mesma geometria, de modo que o que você vê na tela é exatamente o que vai para a gráfica; com essas mesmas páginas se escreve ainda um livro digital EPUB 3.

Este livro é a sua própria demonstração. A capa, o sumário que se numera sozinho, as folhas de rosto das partes em quatro cores, a faixa que abre cada capítulo, os cabeços no alto destas páginas e cada figura que flutua até o seu lugar foram diagramados pelo Postext, no seu navegador, há um instante. Nada aqui foi posicionado à mão: o Markdown só diz o que cada coisa é, e a configuração decide como ela aparece.

:::callout{type="try"}
Abra o painel **Texto** e escolha este capítulo no seletor de capítulos, no topo do painel. Mude uma palavra deste parágrafo ou apague uma frase: a página se compõe de novo, as colunas se reequilibram e os números de página dos capítulos seguintes acompanham a mudança.
:::

Se você prefere ver antes de ler, :ref{id="postext-showreel"} mostra tudo em dois minutos; na visualização Folio, o vídeo é reproduzido na própria página.

## Como ler este livro

O livro está organizado em quatro partes. **Fundamentos**, a parte em que você está, explica o problema que o Postext resolve e como o motor é construído: o que entra, o que sai e o que acontece no meio do caminho. **O ofício** trata de tipografia: como se compõe uma linha, como se enquadra uma página, para onde vão as figuras, as tabelas e os boxes, como um conjunto de capítulos vira um livro e como um mesmo livro vive em vários idiomas. **Além do texto corrido** compõe páginas que não são um fluxo de colunas: páginas compostas, quadrinhos, música e exercícios. **Na prática** se volta para as ferramentas: o formato do documento, o Sandbox, as saídas e a gráfica, a linha de comando e os agentes, e o projeto em torno deles.

Cada capítulo abre com uma breve introdução sobre a sua faixa, e a maioria encerra suas seções com um boxe intitulado _Experimente no Sandbox_: um pequeno experimento que você pode fazer neste mesmo livro, agora mesmo, para ver o recurso em funcionamento. Nada do que eles propõem estraga coisa alguma (**Restaurar o original…**, no menu da linha do guia no painel **Livros**, devolve o livro ao estado em que foi distribuído), então mude à vontade. Os capítulos podem ser lidos em qualquer ordem; quando um depende de outro, ele avisa.

## Layout de aplicação e layout editorial

O CSS moderno é uma ferramenta notável para construir interfaces. Flexbox, Grid, container queries e o posicionamento por âncoras dão aos desenvolvedores um controle fino sobre a disposição dos componentes numa janela. Mas o CSS foi projetado para o _layout de aplicação_, e a leitura de textos longos precisa de _layout editorial_. São problemas diferentes:

- **O layout de aplicação** dispõe componentes interativos (botões, formulários, cartões, navegação) dentro de uma janela que o leitor rola livremente
- **O layout editorial** faz texto, figuras, tabelas e boxes correrem por uma sequência de páginas e colunas fixas, segundo regras apuradas ao longo de séculos de impressão

O contraste da :ref{id="feature-comparison"} resume onde as duas abordagens divergem nos documentos longos. (Basta mencioná-la: a tabela flutua sozinha até o primeiro espaço livre depois deste parágrafo, e você nunca precisa posicioná-la duas vezes.)

A diferença é de natureza, não de grau. Uma interface se adapta à janela que a contém, e o leitor a percorre como quiser; uma página, ao contrário, tem um tamanho fixo, um começo e um fim, e tudo o que ela contém precisa se resolver dentro desses limites: o que cabe nesta coluna e o que passa para a próxima, onde vai cada figura, como termina cada linha e cada parágrafo. São essas decisões que fazem a qualidade de um livro, e nenhuma delas pode ser tomada olhando um único elemento isolado, por mais cuidado que se tenha ao estilizar cada um.

O CSS resolve o primeiro caso de forma brilhante. Para o segundo, a plataforma nunca ofereceu as primitivas que importam:

1. **Colunas equilibradas que conhecem o seu conteúdo.** A propriedade _columns_ do CSS faz o texto correr, mas não consegue nivelar colunas ajustando o espaço acima dos títulos ou a folga de um parágrafo; ela não sabe o que é uma figura ou tabela que deve flutuar para o topo da próxima coluna livre, e não consegue manter um título junto do parágrafo que ele introduz através de uma quebra de coluna.
2. **Defeitos de fim de parágrafo e de fim de coluna.** _Órfãs_ e _viúvas_ existem no CSS, mas o suporte dos navegadores é desigual e elas não enxergam a geometria da página inteira; e não há regra nenhuma para a _linha curta_, a palavra breve deixada sozinha na última linha de um parágrafo.
3. **Quebra de linhas pelo parágrafo inteiro.** Os navegadores quebram as linhas de forma gulosa, uma de cada vez, e só conseguem distribuir o espaço que sobra dentro de cada linha, enquanto uma justificação equilibrada exige pesar o parágrafo inteiro de uma vez.
4. **Um ritmo vertical compartilhado.** Livros e revistas assentam cada linha numa grade de linhas de base comum a todas as colunas da página, e o CSS não tem nenhuma primitiva que encaixe as linhas numa grade entre colunas e páginas.
5. **O aparato de um livro.** Cabeços que sabem em que capítulo estão, números de página em sequências romanas ou arábicas, quebras de capítulo que respeitam a paridade e um sumário com números de página reais: nada disso existe num documento que rola sem fim na tela.

:::callout{type="quote" placement="top"}
_A tipografia editorial é um problema de satisfação de restrições. O navegador nunca recebeu a linguagem para enunciá-las._
:::

O CSS descreve com grande detalhe a _aparência_ de qualquer região de texto. O que lhe falta é _otimização global_: a capacidade de pesar um parágrafo, uma coluna e uma página inteiros antes de se comprometer com qualquer um deles. Um navegador resolve cada caixa assim que a encontra, e nunca volta atrás para mover uma linha depois que a caixa seguinte foi disposta; um compositor volta atrás o tempo todo, porque uma decisão tomada no pé de uma página pode desfazer outra tomada no alto dela.

## O que as ferramentas existentes não resolvem

Outras ferramentas atacam partes do problema. Os processadores de texto paginam. O Adobe InDesign oferece controle editorial completo. O LaTeX continua sendo a referência da composição acadêmica e matemática. Mas nenhum deles foi projetado para a web, e as suas premissas os tornam difíceis de encaixar num fluxo de desenvolvimento moderno:

- Não podem ser incorporados como componente de uma aplicação web
- A saída deles é estática e raramente preserva a estrutura semântica de que as ferramentas de acessibilidade dependem
- Os seus formatos de origem são proprietários, binários ou difíceis de gerar por programa
- Vivem fora das ferramentas de frontend que uma equipe web já usa

O Postext adota outra posição, resumida na :ref{id="tools-comparison"}. É uma **biblioteca JavaScript** que roda no navegador, lê Markdown, aplica as regras da tipografia profissional e devolve um layout que você pode renderizar como canvas, HTML ou PDF, ou escrever como livro digital EPUB. Foi feita para ser incorporada, configurada e estendida por desenvolvedores que querem páginas com qualidade de publicação sem sair das suas ferramentas, e configurada por designers que nunca precisam tocar no código.

## Um ofício de longa memória

As regras que o Postext segue não foram inventadas para ele. Uma linha confortável tem entre 45 e 75 caracteres, e é por isso que os textos longos são compostos em colunas, e não em linhas tão largas quanto a página. O texto é justificado ou em bandeira, mas nos dois casos a sua textura precisa ser uniforme, sem os vãos que viram rios quando se empilham linhas frouxas demais. Todas as linhas de uma página se assentam numa grade de linhas de base comum, para que se olhem de frente através da medianiz e apareçam em registro através do papel. Os títulos ficam com o texto que anunciam, um parágrafo não deixa a sua primeira nem a sua última linha sozinha na borda de uma coluna, e uma figura aparece depois da frase que a menciona, nunca antes.

Durante séculos, essas regras foram aplicadas à mão, por tipógrafos que liam cada página antes de ela ir para a máquina. A editoração eletrônica transformou muitas delas em software, mas esse software continuou sendo um mundo à parte, com os seus próprios arquivos e as suas próprias ferramentas. O que nunca existiu foi um motor que as aplicasse automaticamente, a partir de texto estruturado, dentro do ambiente onde hoje acontece a maior parte da leitura. É dessa lacuna que trata este livro.

## Para quem é o Postext

O Postext é útil onde quer que um texto longo e estruturado precise parecer projetado, e não apenas exibido:

- **Editoras e equipes editoriais** que querem que a mesma fonte produza um PDF pronto para impressão, uma edição fiel na tela e um livro digital, sem manter diagramações separadas em sincronia
- **Plataformas de documentação e de ensino** cujos livros didáticos, manuais e cursos precisam de figuras, tabelas, referências numeradas e matemática bem compostas em cada página
- **Desenvolvedores** que constroem experiências de leitura (relatórios, revistas, catálogos, documentos gerados) e querem qualidade editorial vinda de uma biblioteca, e não de um aplicativo de desktop
- **Designers e tipógrafos** que querem descrever um projeto gráfico uma única vez, como regras, e vê-lo aplicado com coerência ao longo de centenas de páginas

O que eles têm em comum é a preferência por descrever o resultado em vez de posicioná-lo à mão, e a necessidade de que esse resultado seja tão bom quanto o que um tipógrafo cuidadoso teria produzido.

## O que o Postext não é

Ter clareza sobre o alcance mantém o núcleo afiado. O Postext não substitui o CSS nas interfaces; é um motor especializado em conteúdo longo e estruturado. Não é um editor WYSIWYG: você escreve Markdown e descreve o design, e o motor compõe as páginas. Não gerencia breakpoints responsivos: escolher uma configuração para cada tamanho de tela cabe à aplicação que o hospeda. Não carrega as fontes por você: o motor mede com as fontes que o navegador já tem, então uma página precisa carregar os seus tipos antes de diagramar. E, por enquanto, o motor de layout só funciona no navegador, porque as suas medidas vêm das métricas de fonte do canvas de um navegador real; os geradores de PDF e de EPUB, por outro lado, também rodam no Node.

A mesma modéstia vale para o conteúdo. O Postext não tenta entender o texto que compõe; aplica regras à estrutura que recebe. Um título precisa estar marcado como título, uma figura é declarada como recurso e uma tabela tem de ser uma tabela. Em troca, nunca corrige o autor por conta própria: nada é movido, renomeado ou reescrito, e cada decisão que o motor toma é visível no layout e pode ser rastreada até uma regra da configuração. Se uma decisão não convence, muda-se a regra, não o texto, e o livro é composto de novo.

# Como o motor funciona {#engine lead="Entram Markdown e um objeto de configuração; sai uma árvore em que cada linha tem uma posição em unidades reais. No meio, um pipeline curto que mede o texto sem tocar no DOM e itera até a página se assentar." summary="Analisar, medir, diagramar, convergir"}

O jeito mais rápido de entender o que o Postext sabe fazer é acompanhar um documento através dele. O motor é um pipeline, esboçado na :ref{id="layout-pipeline"}, em que cada etapa refina uma única representação do documento em memória, compartilhada por todas. Nenhuma etapa se esconde atrás de um formato opaco e nenhuma toca o disco. O pipeline também é puro: com o mesmo conteúdo e a mesma configuração, produz sempre o mesmo layout, as mesmas páginas, linha por linha.

## Conteúdo e configuração

Duas coisas entram no pipeline, e as duas foram pensadas para serem lidas e editadas por pessoas:

1. **Conteúdo** em Markdown enriquecido
   - Títulos, parágrafos, listas, ênfase, citações em bloco e matemática
   - Diretivas para quebras de página, numeração de páginas, partes, boxes e o sumário
   - Referências a recursos (figuras, diagramas SVG e tabelas) declarados por id fora do texto
   - Metadados YAML opcionais com o título, o subtítulo, o autor e a data
2. **Configuração** que descreve o design
   - Tamanho da página, margens, sangria e numeração de páginas
   - Estrutura de colunas, medianiz e fios entre colunas
   - Texto do corpo, títulos, listas, legendas, tabelas e matemática
   - Estilos de título, estilos de parágrafo, estilos de boxe, partes e a página de sumário
   - Cabeços, uma paleta de cores com nomes e as opções de saída do PDF

Mantê-los separados é proposital. O mesmo Markdown pode virar um livro de bolso, uma revista em duas colunas ou um livro didático com coluna lateral só com a troca da configuração. É por isso que o motor se recusa a embutir decisões visuais no conteúdo.

## Análise

O analisador lê o Markdown enriquecido e produz uma lista plana de blocos: títulos, parágrafos, citações em bloco, itens de lista, fórmulas em destaque e as diretivas que dão forma ao livro. Ele não decide nada sobre o layout. O que faz é estruturar a entrada com cuidado: junta as linhas de um parágrafo, acompanha o aninhamento das listas, separa o texto de um título dos seus atributos, resolve cada \`:ref\` contra os recursos declarados fora do texto e registra, para cada bloco, o trecho exato da fonte de onde ele veio.

A formatação em linha é analisada ao mesmo tempo. Negrito, itálico e a combinação dos dois, sobrescritos e subscritos, matemática em linha, amostras de cor e referências viram trechos tipados dentro do parágrafo, para que a etapa de medição possa dar a cada um a sua própria fonte e a sua própria cor. Os metadados no início do documento são lidos como tal (o título, o subtítulo, o autor e a data) e ficam disponíveis para todos os slots de design.

## Medir sem o DOM

Antes de posicionar qualquer coisa, o motor precisa saber quanto espaço cada elemento ocupa, e é aqui que todo o projeto começa. Medir texto num navegador normalmente significa renderizá-lo na página e ler de volta o seu tamanho, um reflow que pode bloquear a thread principal por centenas de milissegundos num documento longo.

O Postext mede com o _pretext_:index{term="pretext"}, uma biblioteca de medição de texto sem DOM que usa as métricas de fonte do canvas e aritmética pura. O seu passo caro, preparar um texto para uma fonte específica, fica em cache; dispô-lo numa largura específica sai quase de graça. O método é de 300 a 600 vezes mais rápido que medir por reflow, como a :ref{id="measurement-speed"} deixa claro, e sobre ele o módulo de medição do próprio motor acrescenta trechos ricos de negrito, itálico e matemática, hifenização, justificação e quebra ótima de linhas. Cada resultado fica em cache sob uma chave que inclui o texto, as fontes, a largura e todas as opções capazes de mudar uma linha, de modo que digitar num parágrafo mede de novo esse parágrafo e nenhum outro.

O carregamento das fontes é a única parte da medição que o motor deixa para quem o hospeda. Medir com uma fonte que ainda não chegou mediria, na verdade, a fonte substituta, e todas as linhas se moveriam quando a definitiva aparecesse. Por isso a biblioteca espera que as fontes estejam carregadas antes da primeira compilação, e oferece um meio de limpar os seus caches de medição quando uma fonte chega atrasada, para que a compilação seguinte meça de novo com as métricas certas. O Sandbox faz isso automaticamente: carrega todas as famílias que a configuração nomeia, do Google Fonts ou do painel Fontes, antes de diagramar uma página.

## Um quebrador de linhas em WebAssembly

A parte do motor que mais faz contas é o quebrador de linhas, que pesa todas as maneiras de quebrar um parágrafo. Ele é escrito em Rust e compilado para WebAssembly:index{term="WebAssembly"}, um módulo de uns trinta kilobytes dentro do pacote, e escolhe exatamente as mesmas quebras que a versão em TypeScript escolheria, de modo que um livro sai igual com qualquer um dos dois. Assim, o quebrador roda de duas a três vezes mais rápido, e um livro inteiro é diagramado uns quinze por cento mais depressa. Onde o WebAssembly está bloqueado, quem responde é o quebrador em TypeScript, e nada muda na página.

## Sete passadas e um loop

O layout propriamente dito é feito em sete passadas:

1. **Estruturação do conteúdo**: analisa o Markdown numa lista plana de blocos e resolve os recursos pelo id
2. **Medição do texto**: compõe cada parágrafo em linhas na largura que ele vai ocupar
3. **Posicionamento em páginas e colunas**: preenche páginas e colunas, reservando espaço para os cabeços e os boxes da largura da página
4. **Posicionamento de recursos**: faz cada figura e tabela referenciada flutuar até o primeiro espaço livre depois da sua referência
5. **Refinamento tipográfico**: aplica as regras que mantêm os títulos com o seu texto e as listas com a sua introdução
6. **Equilíbrio de colunas**: nivela as colunas de cada página
7. **Ritmo vertical**: devolve o texto à grade de linhas de base depois de tudo o que a quebra

Essas passadas dependem umas das outras em círculo. Manter um título com o seu parágrafo pode empurrar os dois para a coluna seguinte; esse movimento pode deixar uma viúva; corrigir a viúva puxa uma linha de volta, o que pode separar de novo o título. O Postext resolve o círculo com o **loop de convergência**:index{term="loop de convergência"} da :ref{id="convergence-loop"}: as passadas três a sete se repetem, marcando só o que mudou, até que nada mais se mova. O loop tem um limite de cinco iterações, e os documentos típicos se assentam em uma ou duas. Uma pontuação de infrações tipográficas acompanha cada iteração, então, se o limite chegar a ser atingido, o motor fica com o melhor layout que encontrou, e não com o último.

As regras aplicadas nessas passadas são, de propósito, poucas e rígidas. Um título fica sempre com as primeiras linhas do que vem depois dele. Um parágrafo que termina em dois-pontos fica com a lista que introduz. Uma figura e a sua legenda nunca se separam. Um boxe da largura da página divide a página em faixas, e as colunas de cada faixa são equilibradas por conta própria, de modo que o texto acima de uma tabela larga é lido de cima a baixo nas duas colunas antes de passar para baixo dela. Quando duas dessas regras não podem ser cumpridas ao mesmo tempo, vence a que menos prejudica a página, e a escolha é feita sempre da mesma maneira.

## Uma tecla, passo a passo

Ajuda ver o que acontece quando você digita uma única letra num parágrafo deste livro. O editor registra a mudança e o Markdown do capítulo é analisado de novo, o que é barato. Todos os blocos, exceto o que você alterou, encontram a sua medição no cache; o parágrafo editado é composto de novo na largura da sua coluna, talvez ganhando ou perdendo uma linha. O layout do capítulo é reconstruído a partir dessas medições, fora da thread principal, e o loop roda até a página se assentar (em geral, uma vez) antes que a visualização desenhe o resultado.

Como cada capítulo é diagramado por si só, continuando a partir dos anteriores, o resto do livro não é tocado, a não ser que o número de páginas do capítulo mude. Quando muda, os capítulos seguintes são paginados de novo em segundo plano, e o sumário recebe os seus novos números de página.

:::callout{type="figures" title="O motor em números" placement="top"}
:::columns{count=3 breaks="3,5"}
**300–600×** mais rápida a medição do texto do que com reflow do DOM. O Pretext mede com as métricas de fonte do canvas e aritmética simples, e é isso que permite compor de novo um capítulo inteiro entre duas teclas.

**7 passadas** transformam o Markdown em páginas posicionadas: estruturação, medição, posicionamento em páginas e colunas, posicionamento de recursos, refinamento tipográfico, equilíbrio de colunas e ritmo vertical.

**5 iterações** no máximo no loop de convergência, e em geral uma ou duas. Se o limite chegar a ser atingido, o motor fica com o melhor layout que encontrou pelo caminho, e não com o último.

**8 idiomas** hifenizados com os padrões de Liang que o TeX usa desde 1983: inglês, espanhol, francês, alemão, italiano, português, catalão e holandês.

**4 saídas** (canvas, HTML, PDF e EPUB 3) saem de um mesmo layout, de modo que a página que você revisa na tela é a página que vai para a gráfica.

**0 reflows** da página durante a diagramação. Tudo é calculado em memória, num worker quando o hospedeiro pede, e a mesma entrada produz sempre as mesmas páginas.
:::
:::

O equilíbrio converge trecho a trecho, entre aberturas de capítulo e quebras de página explícitas. O resultado é uma garantia que importa nos livros: um capítulo diagramado sozinho e o mesmo capítulo dentro do livro inteiro saem idênticos, página por página.

## A árvore virtual do documento

:index{term="VDT (árvore virtual do documento)"}O que sobrevive ao loop é a **VDT**, a árvore virtual do documento: páginas que contêm colunas, colunas que contêm blocos, blocos que contêm linhas, cada um com a sua caixa em unidades reais, ao lado de uma lista plana de todos os blocos para acesso rápido. A árvore é pura geometria (não sabe nada de canvas, HTML, PDF ou EPUB), e é exatamente isso que permite a todos os renderizadores desenharem saídas idênticas. Cada linha também guarda o trecho de Markdown de onde veio, e é assim que um clique na página leva o cursor do editor à palavra certa.

As páginas também registram para que servem. Uma página pode ser de miolo, uma abertura de capítulo, uma folha de rosto de parte ou uma página em branco inserida para chegar à paridade certa, e esse papel é o que permite aos cabeços, aos fólios e aos ornamentos escolher onde aparecer. Os rótulos de página (o número de página impresso, dentro da sua sequência) são calculados uma única vez, na árvore, para que o canvas, o HTML e o PDF concordem sobre eles sem cada um fazer a sua própria contagem. Um prefácio numerado em algarismos romanos e um miolo que recomeça em um não exigem nenhum caso especial em nenhum renderizador: cada um imprime o rótulo que a árvore lhe dá. O leitor de PDF mostra esses mesmos rótulos na sua caixa de página, e o sumário do livro e as referências a páginas os repetem tais como saem impressos.

## Fora da thread principal

Um layout pode levar mais tempo que uma tecla, então o motor pode rodar num Web Worker:index{term="Web Worker"}. O worker mantém o seu próprio cache de medição entre compilações e é cancelado de forma cooperativa: quando se pede uma compilação nova, a anterior para no seu próximo ponto de verificação e o último pedido vence. O Sandbox diagrama todas as visualizações assim, e os geradores de PDF e de EPUB têm workers próprios, de modo que a interface continua respondendo enquanto um livro inteiro é composto ou escrito.

:::callout{type="note" title="No código"}
\`buildDocument(content, config)\` devolve a VDT. \`renderPage\` desenha uma página num canvas, \`renderToHtml\` devolve HTML posicionado e \`renderToPdf\`, do pacote _postext-pdf_, devolve os bytes de um PDF, de um documento ou de um livro inteiro passado como um array de capítulos. \`renderToEpub\`, do _postext-epub_, escreve os mesmos capítulos como um arquivo EPUB 3. \`createLayoutWorker\`, do _postext/worker_, roda a compilação fora da thread principal.
:::

:::part{number="II" title="O ofício" palette="band=#8f6408"}
3. Compor a linha
4. A página e suas colunas
5. Figuras, tabelas e flutuantes
6. Boxes, notas e marcas
7. Livros, partes e cabeços
8. Um livro, muitos idiomas
:::

# Compor a linha {lead="Um parágrafo é composto inteiro, não uma linha de cada vez. O Postext pesa todas as maneiras possíveis de quebrá-lo, põe preço no espaçamento, nos hífens e nas palavras soltas, e escolhe o conjunto de quebras que custa menos." summary="Quebra ótima de linhas, hifenização, espaçamento e os defeitos que ela evita"}

A qualidade de uma página se decide primeiro nos seus parágrafos. Um navegador quebra as linhas de forma gulosa: enche uma linha com todas as palavras que cabem, passa para a seguinte e só consegue distribuir o espaço que sobra dentro de cada linha. O Postext implementa o **algoritmo de Knuth-Plass**, o quebrador de linhas ótimo que move o TeX desde 1981. Ele avalia todas as maneiras viáveis de quebrar o parágrafo inteiro e escolhe a que minimiza o custo total, de modo que o espaçamento se mantém uniforme da primeira à última linha e nenhuma linha paga pelas vizinhas.

## Caixas, colas e penalidades

:index{term="quebra de linhas de Knuth-Plass"}O algoritmo vê um parágrafo como uma sequência de três primitivas, desenhadas na largura toda na :ref{id="knuth-plass-model"}:

- **Caixas** são palavras ou pedaços de palavras, com largura fixa
- **Colas** são o espaço entre as palavras, com uma largura natural e a capacidade de esticar ou encolher
- **Penalidades** são possíveis pontos de quebra com um custo; uma penalidade _marcada_ indica um ponto de hifenização e desenha um hífen quando é usada

Para cada linha candidata, o motor calcula uma razão de ajuste $r$, o quanto as colas precisam esticar ou encolher para preencher a medida, e uma “maldade” que cresce com o cubo dela, $b = 100\\,|r|^3$. As linhas são classificadas em quatro classes de ajuste (apertada, normal, frouxa e muito frouxa), e cada quebra recebe os seus deméritos:

$$
d = (1 + b + p)^2
$$

em que $p$ é a penalidade da quebra. Duas linhas hifenizadas seguidas custam 3000 a mais, e um salto de mais de uma classe de ajuste entre linhas vizinhas custa 100, então o otimizador prefere parágrafos cuja textura muda suavemente. Se não existir nenhum conjunto viável de quebras, o motor recorre à quebra gulosa em vez de falhar.

## Por que o parágrafo inteiro importa

Pense num parágrafo cuja primeira linha termina logo depois de uma palavra longa. Um quebrador guloso aceita a quebra, porque cabe, e segue em frente. A segunda linha então começa com uma série de palavras curtas, não chega a se encher e precisa ser esticada; a terceira herda o problema e termina com um hífen; a última acaba com uma única palavra. Nenhum desses defeitos é visível a partir da primeira linha, que é a única para a qual o quebrador guloso olhou.

O quebrador ótimo vê a cadeia inteira. Ele pode decidir terminar a primeira linha uma palavra antes, um pouco mais frouxa do que poderia ficar, porque essa escolha deixa a segunda linha se encher naturalmente, tira o hífen da terceira e traz uma segunda palavra para a última. O parágrafo como um todo fica melhor, mesmo que a sua primeira linha, sozinha, não fique. Essa é a essência do algoritmo de Knuth-Plass, e a razão de ele produzir a textura cinza e uniforme que os leitores associam aos livros bem compostos.

## Hifenização

:index{term="hifenização"}A hifenização usa os mesmos **padrões de Liang** em que o TeX confia desde 1983, servidos pela biblioteca _Hypher_, em oito idiomas: inglês, espanhol, francês, alemão, italiano, português, catalão e holandês. O idioma do documento é definido uma vez, no topo da configuração, e também marca o PDF para os leitores de tela. Os padrões deixam pelo menos duas letras antes do hífen e três depois dele, de modo que palavras com menos de cinco letras nunca são divididas, e cada hífen é uma penalidade marcada de 50 que o otimizador pode aceitar ou recusar.

A hifenização só atua no texto justificado, onde ela compensa. Duas oportunidades de quebra estão sempre disponíveis, qualquer que seja a configuração: um hífen de verdade entre duas letras é uma quebra legítima, e uma palavra mais larga que a medida inteira é dividida na última sílaba que cabe ou, se não houver outro jeito, no último caractere.

Os hífens opcionais digitados no texto são respeitados como pontos de quebra, e pelo mesmo preço dos hífens do padrão. O catalão segue as normas do Institut d'Estudis Catalans: uma palavra com _l·l_ geminado, como _col·lecció_, é dividida entre os dois _l_, e o hífen ocupa o lugar do ponto: _col-_ no fim de uma linha e _lecció_ no início da seguinte. O idioma também pode mudar dentro de um livro: todos os capítulos compartilham o idioma da configuração, então uma edição em vários idiomas, como esta, é configurada uma vez por idioma, e cada versão do guia hifeniza segundo as suas próprias regras.

## Espaçamento entre palavras e linhas em bandeira

Duas configurações limitam o quanto um espaço pode esticar ou encolher: \`maxWordSpacing\`, por padrão o dobro do espaço natural, e \`minWordSpacing\`, 0,6 dele. Esticar além do máximo custa mais caro que qualquer outro defeito, então o quebrador prefere hifenizar, mover uma palavra ou aceitar uma linha curta a abrir um rio. Algumas linhas não podem ser preenchidas de jeito nenhum (uma URL longa, a cauda inquebrável de um item de lista), e, em vez de abri-las com vãos de três vezes o espaço natural, o motor as compõe em bandeira, com o espaçamento natural. A última linha de um parágrafo fica sempre em bandeira, exceto quando transborda: então os seus espaços se comprimem para que ela caiba, exatamente como o TeX faz com as colas.

## Chinês e escritas do Leste Asiático

:index{term="composição em chinês"}O chinês é escrito sem espaços entre as palavras e nunca é hifenizado: uma linha pode terminar entre quase quaisquer dois caracteres. Um parágrafo com mais caracteres chineses, japoneses ou coreanos do que espaços entre palavras não passa pelo Knuth-Plass; quem o compõe, uma linha depois da outra, é o **compositor CJK**. O que ele precisa respeitar são as regras de início e fim de linha: uma vírgula, um ponto final ou um sinal de fechamento nunca abrem uma linha, e um sinal de abertura nunca a encerra. O rigor dessas regras depende da região, dada pelo idioma do documento (\`zh-Hans\` segue a norma da China continental, GB/T 15834, e \`zh-Hant\` a prática de Taiwan e Hong Kong), e \`cjk.lineBreak\` define o nível à mão. Alguns trechos nunca são divididos: um travessão ou reticências de dois quadratins, um número com a sua unidade. Uma palavra latina ou um endereço web no meio dos caracteres passa inteiro para a linha seguinte, a menos que seja mais largo que a linha; nesse caso a palavra é dividida, e o endereço é cortado depois de uma barra ou antes de um ponto.

Cada sinal de pontuação chinês ocupa um quadrado próprio, metade tinta e metade branco, e quanto desse branco um livro mantém é questão de estilo da casa, como mostra a :ref{id="cjk-composition"}. Taiwan mantém cada sinal num quadrado inteiro. Hong Kong também compõe os seus sinais em quadrado inteiro, mas aproxima a maioria dos pares de sinais que se encontram, e um parêntese que abre ou fecha uma linha perde a sua metade externa. O estilo Kaiming da China continental, o padrão para \`zh-Hans\`, compõe vírgulas, parênteses e aspas em meio quadrado e mantém o ponto final inteiro, exceto no fim da linha; onde dois sinais se encontram, o branco entre eles também desaparece. O estilo é definido com \`cjk.punctuationWidth\`, e os dois ajustes são ligados com \`cjk.compressAdjacent\` e \`cjk.trimLineStart\`; \`cjk.hangingPunctuation\` deixa uma vírgula ou um ponto final pendurados além do fim da linha. As configurações \`cjk\`, junto com o idioma do documento e o modo de escrita, ficam no grupo **Sistema de escrita** do painel **Design**.

Uma linha chinesa justificada é preenchida numa ordem fixa: primeiro os espaços entre palavras ocidentais, depois o quarto de quadratim que o motor coloca entre o texto chinês e o latino (\`cjk.latinSpacing\`; nunca é digitado) e, por último, cada vão entre dois caracteres, nunca dentro de uma palavra latina ou de um número. Quando um caractere não pode abrir a linha seguinte, o compositor tenta primeiro trazê-lo para a linha, cedendo branco dos sinais que já estão nela, e só quando isso falha leva junto com ele para a linha seguinte o caractere anterior. Uma linha que precisaria de mais de meio quadratim de branco entre os caracteres fica curta, e o painel **Verificações** a aponta na lista de avisos como linha CJK aquém da medida.

O restante de um livro chinês segue as mesmas configurações. Modelos de capítulo, números de página, listas e contadores aceitam os estilos de numerais chineses, entre eles \`simp-chinese-informal\`, \`trad-chinese-informal\` e \`cjk-decimal\`, de modo que os capítulos podem ser nomeados pelos seus ordinais chineses; figuras e tabelas recebem os seus nomes chineses e são numeradas por capítulo com um hífen. \`cjk.grid\` define a mancha como um número de caracteres por linha e de linhas por página, a grade sobre a qual se projetam os livros chineses. A edição chinesa deste guia é composta na vertical e encadernada pela direita, como os livros chineses foram impressos durante séculos: nomeia os seus capítulos pelos ordinais chineses, imprime os seus fólios em numerais chineses e numera as suas figuras e tabelas por capítulo; a linha dela no painel **Livros** tem um botão de idioma próprio. Entre os livros de exemplo, _O sonho da câmara vermelha_ é um romance inteiro composto em chinês, e a sua edição tradicional é composta na vertical sobre uma grade de 38 caracteres por 15 linhas.

\`layout.writingMode: 'vertical-rl'\` compõe um livro na vertical. As linhas correm de cima para baixo e se sucedem da direita para a esquerda, duas colunas viram dois andares empilhados na página, figuras e tabelas ficam em pé, palavras latinas e números longos deitam de lado, e cada sinal assume o lugar ou a forma que tem no texto vertical: parênteses e aspas assumem as suas formas verticais, e o ponto final vai para o canto superior direito da sua casa na China continental e fica centralizado em Taiwan e Hong Kong. Um livro assim é encadernado pela direita (\`page.binding\`): a sua primeira página fica sozinha à esquerda da lombada, e o Sandbox mostra as suas páginas duplas da direita para a esquerda. O canvas e o PDF compõem as mesmas linhas verticais; a visualização HTML quebra as suas próprias linhas na altura da sua página e põe cada caractere em pé ou deitado como eles fazem. Por padrão, \`cjk.uprightDigits\` põe em pé, numa única casa, um número de até dois dígitos, e pode subir para três ou quatro; \`:tcy[…]\` faz o mesmo com qualquer trecho curto.

Os livros chineses também marcam o texto de maneiras que a tipografia latina não usa. A ênfase é indicada por um ponto ao lado de cada caractere, e não por itálico, então num documento chinês \`*…*\` coloca pontos de ênfase nos caracteres chineses que abrange, como faz \`:dots[…]\`; \`cjk.emphasis: 'italic'\` mantém o itálico. \`:name[…]\` traça a linha reta dos nomes próprios, \`:book[…]\` marca o título de uma obra, e \`cjk.bookTitleMark\` escolhe como: com os sinais angulares duplos da China continental ou com a linha ondulada de Taiwan e Hong Kong. \`:ruby[…]{rt="…"}\` compõe uma leitura, em pinyin sobre os caracteres ou em zhuyin à direita de cada um, e \`:warichu[…]\` compõe uma nota em duas fileiras de meio corpo dentro da linha, que continua na linha ou na página seguinte quando não cabe. Nenhum deles muda a entrelinha: o painel **Verificações** avisa quando os pontos, as linhas ou as leituras precisam de mais espaço entre as linhas do que o parágrafo deixa. No texto vertical, os pontos passam para a direita da coluna, as linhas para a esquerda, e numa nota lê-se primeiro a fileira da direita.

## Árabe e texto da direita para a esquerda

:index{term="composição em árabe"}Árabe, persa, urdu e hebraico são escritos da direita para a esquerda, e o Postext os compõe a partir do mesmo Markdown e da mesma configuração que qualquer outro idioma. Quem decide é o idioma do documento: com \`locale: 'ar'\`, as linhas começam à direita, a primeira coluna é a da direita, o livro é encadernado pela borda direita e as páginas duplas são lidas da direita para a esquerda. O motor diagrama uma página assim como se fosse da esquerda para a direita e depois a espelha inteira, pintando cada palavra, imagem e fórmula do lado certo, de modo que um design feito para um livro em português funciona sem mudanças: uma configuração que nomeia um lado se refere a um lado do texto, e \`start\` e \`end\` são aceitos como nomes explícitos desse lado. Os cabeços e os fólios ficam na folha, onde o designer espera encontrá-los.

Dentro de uma linha, números, palavras latinas e citações continuam sendo lidos da esquerda para a direita. A ordem desses trechos é decidida pelo Algoritmo Bidirecional do Unicode, implementado por completo; o texto é guardado, pesquisado e copiado na ordem em que foi digitado, e só a pintura é reordenada. Parênteses e aspas angulares são espelhados nos trechos da direita para a esquerda. Um bloco composto contra a direção do livro leva \`{dir=ltr}\` ou \`{dir=rtl}\`, e um trecho de texto, \`:ltr[…]\` ou \`:rtl[…]\`, um isolamento com o qual o ponto final deixa de ir parar na ponta errada da linha.

As letras árabes se ligam, e cada uma assume a forma que as vizinhas pedem, então uma palavra é medida e pintada como uma única sequência modelada, nunca letra por letra; o PDF a modela com o HarfBuzz e relaciona cada glifo com os seus caracteres, de modo que o texto copiado e os leitores de tela recebem as palavras que foram digitadas. Daí vêm três regras: nada de hifenização, nada de espaçamento entre letras e nenhum corte dentro de uma palavra, que transborda a linha e é apontada em vez de dividida. As linhas justificadas são esticadas primeiro nos espaços e depois com a **kashida**, as ligações alongadas que o calígrafo traça entre duas letras unidas, colocadas só onde as regras do naskh permitem e deixadas fora do texto copiado. O quebrador de linhas conta esse alongamento como esticamento, então escolhe as quebras sabendo onde uma linha pode se alargar. A ênfase é composta em negrito, já que a tipografia árabe não tem itálico, e o motor nunca inclina uma letra árabe.

As vogais se empilham acima e abaixo das letras, dentro da entrelinha, que nunca cresce sozinha: o painel **Verificações** aponta o parágrafo cujos sinais tocariam a linha de cima, com a entrelinha de que ele precisaria. Os números gerados (fólios, números de capítulo, de figura e de nota) usam os algarismos da região, os arábico-índicos no leste do mundo árabe e os europeus no Magreb, enquanto os números digitados pelo autor nunca são reescritos; um título pode escrever o seu número como um ordinal por extenso, e os elementos pré-textuais podem contar na ordem abjad dos manuscritos. Os poemas clássicos são escritos em \`:::verse\`, um verso por linha, com os dois hemistíquios separados por \`||\`: cada hemistíquio é levado a uma mesma largura, primeiro com kashidas, de modo que as rimas se alinham ao longo do poema. A edição árabe deste guia é composta assim, encadernada pela direita, e entre os livros de exemplo _As mil e uma noites_ traz a obra inteira em árabe, à maneira da imprensa de Bulaq.

## Ênfase e trechos

Um parágrafo raramente é um único trecho de texto. Negrito, itálico e negrito itálico são compostos nos estilos reais da família (um itálico verdadeiro, não um redondo inclinado), cada um medido com as suas próprias métricas, de modo que uma palavra em negrito ocupa exatamente o espaço de que precisa. A cor do texto em negrito, do texto em itálico e das referências pode ser definida separadamente; neste livro, as referências a figuras e tabelas são compostas em negrito na cor da parte, para que sejam fáceis de encontrar na página e no PDF, onde também são links.

Sobrescritos e subscritos são compostos menores e deslocados da linha de base sem alterar a entrelinha, e as amostras de cor em linha se assentam na linha de base como uma letra. Todos eles são atômicos: o quebrador de linhas pode quebrar antes ou depois deles, mas nunca dentro, então uma fórmula ou uma amostra de cor nunca acaba dividida entre duas linhas.

Outros dois trechos destacam palavras sem recorrer a um estilo próprio da fonte. \`:smallcaps[…]\` compõe versaletes desenhados a partir das maiúsculas da fonte, da mesma forma em todas as saídas, para siglas e para os nomes dos personagens de uma peça de teatro. \`:chip[…]\` põe uma palavra numa pequena caixa arredondada que corre com a linha (teclas do teclado, etiquetas, o banco de palavras de um exercício), com um estilo nomeado, nunca quebrada por dentro e com palavras que continuam sendo texto real no HTML e no PDF.

Os números também têm estilos.:index{term="estilos de algarismos"} Uma fonte pode desenhar os seus algarismos alinhados, da altura das maiúsculas, ou de estilo antigo, que sobem e descem como as minúsculas, e proporcionais ou tabulares, todos da mesma largura, para que as colunas de números se alinhem. \`figureStyle\` escolhe entre eles para o corpo, um estilo de parágrafo, um nível de título, uma tabela ou uma legenda: algarismos de estilo antigo no texto corrido, onde os alinhados gritariam, e algarismos alinhados tabulares numa tabela de resultados. Uma fonte que não desenha o estilo pedido mantém os seus próprios algarismos.

## Órfãs, viúvas e linhas curtas

:index{term="órfãs e viúvas"}Uma **órfã** é a primeira linha de um parágrafo deixada sozinha no pé de uma coluna; uma **viúva** é a sua última linha levada sozinha para o topo da seguinte. As duas quebram o ritmo da leitura, e a :ref{id="orphan-widow"} mostra as duas, uma de cada lado de uma quebra de coluna. Um terceiro defeito, a **linha curta**, é uma última linha com uma única palavra breve, encalhada debaixo de um parágrafo cheio.

O Postext põe preço nas três. Quando um parágrafo atravessa uma coluna, o motor compara todas as divisões possíveis e cobra de cada uma o espaço que ela deixa sem uso, a órfã e a viúva: 1000 por padrão, cada uma, com pelo menos duas linhas de cada lado. As linhas curtas são cobradas dentro do próprio quebrador de linhas, como “maldade”, sempre que a última linha ocupa menos que o espaço de vinte caracteres. Quando uma linha curta não pode ser evitada quebrando o parágrafo de outra maneira, o motor pode compor o parágrafo com uma linha a menos, apertando os espaços entre palavras dentro do seu mínimo e, se for preciso, o espaçamento entre letras em no máximo dez milésimos de quadratim. Os itens de lista seguem as mesmas regras, com chaves próprias.

## Listas

As listas seguem a mesma disciplina dos parágrafos, com uma tipografia própria. As listas com marcadores escolhem o caractere do marcador, o seu tamanho, peso e cor, e o espaço e o recuo deslocado que mantêm alinhado o texto de cada item; as listas numeradas escolhem entre números arábicos, letras minúsculas ou maiúsculas e algarismos romanos minúsculos ou maiúsculos, com um separador que pode ter estilo próprio e números alinhados à direita, para que os itens 9 e 10 fiquem alinhados. O aninhamento chega a cinco níveis, cada um com o seu próprio recuo e os seus próprios marcadores, e as listas de tarefas desenham uma caixa de seleção para cada item, marcada ou não. Os itens podem ficar juntos ou espaçados, e o motor trata o fim de uma lista como uma das suas alavancas quando equilibra as colunas.

:::callout{type="try"}
No painel **Design**, procure _frouxas_ e ative **Destacar linhas frouxas**, no grupo **Avançado**. Depois estreite as colunas ou aumente \`maxWordSpacing\` e observe quais linhas o motor precisa abrir e como o otimizador as redistribui.
:::

## Matemática

:index{term="matemática"}As fórmulas são cidadãs de primeira classe. Expressões em linha como $e^{i\\pi}+1=0$ correm com o texto, compostas pelo MathJax como traçados vetoriais que continuam nítidos em qualquer zoom. Quando uma fórmula é mais alta do que a linha permite, ela é reduzida uniformemente para que a grade de linhas de base sobreviva, e o leitor mantém o ritmo do texto por mais densa que seja a notação. As fórmulas em destaque ficam em linhas próprias, centralizadas na coluna, com as suas próprias margens, e o texto que vem depois volta à grade:

$$
\\int_0^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

Os mesmos traçados são desenhados pelo canvas, pela visualização HTML e pelo PDF, de modo que as fórmulas coincidem nas três saídas e continuam vetoriais na impressão.

Mais alguns exemplos mostram a variedade de notação que o motor trata, e o que ele faz com cada uma para que a fórmula conviva com o texto. O primeiro é uma série infinita, a soma dos inversos dos quadrados que Euler resolveu em 1734. Numa fórmula em destaque, os limites do somatório ficam acima e abaixo do símbolo, como num livro de análise, e a fração do resultado assume o seu tamanho completo, em vez da forma reduzida usada dentro de uma linha.

$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

As matrizes são outro teste comum, porque exigem que linhas e colunas se alinhem e que os parênteses cresçam até a altura do conteúdo. O MathJax compõe a matriz como uma tabela de células centralizadas e estica os delimitadores para abrangê-la; o Postext recebe o resultado como traçados, mede a sua caixa inteira e reserva exatamente esse espaço antes de devolver o texto à grade. O determinante de uma matriz dois por dois fica assim.

$$
\\det \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc
$$

A distribuição normal reúne numa só expressão quase tudo o que torna difícil a composição matemática: uma raiz com a sua barra, letras gregas e uma fração inteira dentro de um expoente, que precisa ser reduzida duas vezes sem ficar ilegível. É a fórmula que aparece em qualquer livro de estatística, e aqui ela é composta pelas mesmas regras que o TeX usaria.

$$
f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}
$$

As definições por casos fecham a série. Uma chave agrupa os ramos da definição, cada um com a sua condição alinhada à direita, e a chave cresce com o número de casos. É um recurso frequente nos textos de matemática e de computação, e um bom exemplo de fórmula que não caberia dentro de uma linha de texto.

$$
|x| = \\begin{cases} x & \\text{se } x \\ge 0 \\\\ -x & \\text{se } x < 0 \\end{cases}
$$

As fórmulas em linha seguem outras regras, porque precisam conviver com as palavras ao redor. As raízes de $ax^2+bx+c=0$ são $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$, o produto de Euler se escreve $\\prod_p (1-p^{-s})^{-1} = \\zeta(s)$ e a transformada de Fourier $\\hat f(\\xi) = \\int f(x)\\,e^{-2\\pi i x \\xi}\\,dx$ também fica na sua linha. Nos três casos, o motor mede a altura da fórmula e, quando ela excede o que a entrelinha permite, reduz a fórmula só o necessário, de modo que as linhas ao redor mantêm o seu lugar na grade e o parágrafo mantém a sua textura. Uma fórmula que já cabe na entrelinha é composta no seu tamanho natural, sem nenhuma redução. Nenhuma fórmula quebra o ritmo da página. A forma de escrevê-las no Markdown, entre cifrões, está no capítulo Escrever para o Postext.

# A página e suas colunas {#columns lead="As páginas são fixas, as colunas são finitas, e cada linha deveria se assentar num ritmo compartilhado por toda a página dupla. Este capítulo trata da moldura: a geometria da página, as estruturas de colunas, a grade de linhas de base e a arte de terminar as colunas niveladas." summary="Geometria da página, colunas, grade de linhas de base e equilíbrio"}

As colunas são a expressão mais visível do design editorial, e o lugar onde as soluções caseiras são as primeiras a falhar. O Postext trata a página e as suas colunas como objetos de primeira classe, com geometria própria, ritmo próprio e regras próprias para terminar bem.

## Geometria da página

Uma página começa pelo seu tamanho. O Postext oferece como predefinições os formatos habituais de livro e de revista, listados na :ref{id="preset-sizes"}, e qualquer tamanho personalizado em centímetros, milímetros, polegadas ou pontos; este guia é composto no formato de 21 × 28 cm. As margens podem ser **espelhadas**: a margem esquerda passa a ser a interna, junto à lombada, e troca de lado em cada verso. Para a produção gráfica, a página pode levar sangria e marcas de corte, e uma configuração de DPI controla a resolução das medidas baseadas em pixels.

Os números de página seguem sequências: arábicos, romanos minúsculos ou maiúsculos, alfabéticos minúsculos ou maiúsculos, cada uma com o seu próprio número inicial, de modo que um livro pode numerar os elementos pré-textuais como i, ii, iii e começar o capítulo um em 1. O PDF registra as mesmas sequências como rótulos de página, e assim o campo de página de um visualizador mostra exatamente o que está impresso no pé.

## Medida e entrelinha

Os dois números que mais decidem como uma página se lê são o comprimento das suas linhas e a distância entre elas. A configuração define o corpo e a entrelinha em unidades reais (este livro usa 9,4 pontos sobre 13,6), e a largura da coluna decorre da página, das margens, da estrutura de colunas e da medianiz. Uma linha de 45 a 75 caracteres é o alvo clássico; muito mais curta, e o olho salta com frequência demais; muito mais longa, e ele se perde no caminho de volta para a linha seguinte. Duas colunas numa página de 21 cm ficam com folga dentro desse intervalo, e essa é uma das razões de o formato ser tão comum em revistas e livros técnicos.

A entrelinha também é a unidade da grade de linhas de base. Toda distância vertical que importa (o espaço acima e abaixo de um título, em volta de uma figura, entre os itens de uma lista) é mais bem expressa como um número inteiro de linhas da grade, ou é corrigida até sê-lo, para que a página mantenha um único ritmo de cima a baixo. Assim, as linhas de duas colunas vizinhas ficam sempre na mesma altura, também dos dois lados de uma figura.

## Estruturas de colunas

Três estruturas cobrem a maioria das publicações, esboçadas como miniaturas de página na :ref{id="column-layouts"}:

1. **Uma coluna**, para romances, ensaios e leitura concentrada
2. **Duas colunas**, para revistas, relatórios e livros como este
3. **Coluna e meia**, uma coluna principal ao lado de uma coluna lateral mais estreita
   - A coluna lateral pode levar texto que continua da coluna principal
   - Ou pode ser um **canal de flutuantes**, que só recebe figuras, tabelas, legendas e boxes, como nos livros didáticos com uma coluna externa de notas e diagramas

A medianiz entre as colunas é configurável, e nela pode ser desenhado um fio opcional, com espessura e cor próprias. Os elementos da largura da página (uma figura, uma tabela, um boxe) atravessam as colunas: o texto acima deles se divide por igual entre as colunas, e as colunas continuam abaixo.

## Títulos

Os títulos são configurados nível por nível, até seis níveis: tipo, corpo, entrelinha, peso, itálico, maiúsculas, cor, alinhamento e o espaço acima e abaixo de cada um. Um nível pode ser numerado com um modelo: \`{1}.{2}\` imprime 4.3 na terceira seção do capítulo 4, e formatos como \`{1:I}\` ou \`{1:a}\` passam um nível para algarismos romanos ou letras. Um nível também pode saltar para uma nova página, com a paridade que pedir, e ocupar a largura toda da página em vez de uma coluna: é isso que faz de um título de nível 1 uma abertura de capítulo.

Os títulos ficam com o que vem depois deles, então um título de seção nunca fica esperando sozinho no pé de uma coluna. Eles também se encaixam na grade de linhas de base: um título maior que o corpo ocupa o espaço de que precisa, e o texto depois dele volta à grade, de modo que as colunas dos dois lados da medianiz continuam se olhando de frente, linha por linha.

## A grade de linhas de base

:index{term="grade de linhas de base"}Os livros profissionais alinham a primeira linha de base de cada coluna a um ritmo vertical comum, e todas as linhas seguintes caem na mesma grade, de modo que as linhas se olham de frente através da medianiz. O Postext encaixa o texto numa grade de linhas de base derivada da entrelinha do corpo, como ilustra a :ref{id="baseline-grid"}. Os elementos que quebram a grade (um título maior que o corpo, uma figura, uma fórmula em destaque) são seguidos do espaço necessário para devolver a próxima linha a ela. A grade pode ser desenhada sobreposta enquanto você trabalha, onde quer que haja texto.

## Colunas que terminam niveladas

Quando uma página termina no meio do texto, as suas colunas devem terminar na mesma altura. Isso é o **equilíbrio de colunas**:index{term="equilíbrio de colunas"}, e é mais difícil do que parece: as linhas vêm em passos inteiros da grade, as figuras não podem ser divididas, os títulos precisam ficar com o seu texto e os parágrafos não podem deixar órfãs para trás. O Postext nivela uma coluna curta com três alavancas, usadas por ordem de preferência e desenhadas na :ref{id="column-balancing"}:

1. **Espaço acima dos títulos**, uma linha inteira da grade de cada vez, distribuído por importância e nunca no topo de uma coluna
2. **Uma linha depois do fim de uma lista**
3. **Parágrafos mais frouxos**: um parágrafo composto com uma linha a mais, a _looseness_ do TeX, aceito só se nenhuma das suas linhas esticar além do limite de espaçamento entre palavras; se ajudar, um toque de espaçamento entre letras, no máximo dez milésimos de quadratim

Cada correção é verificada diagramando a página de novo, até oito vezes, e o melhor resultado vence. Um parágrafo composto com uma linha a mais conserva as palavras e só alarga os espaços, por isso um parágrafo curto, com poucos espaços para alargar, raramente é o escolhido. Algumas colunas são deixadas em paz de propósito: a última coluna antes de uma quebra de página forçada ou de uma abertura de capítulo, a última página do documento, uma coluna sem nada para esticar. Duas regras relacionadas nivelam as colunas finais de um capítulo e as colunas acima de um boxe da largura da página que se move ou se divide.

## Faixas e boxes da largura da página

Uma página nem sempre é um único conjunto de colunas de cima a baixo. Uma figura, uma tabela ou um boxe da largura da página a corta em **faixas**:index{term="faixas"}: o texto acima do boxe preenche as suas colunas como uma faixa própria, o boxe atravessa a página e as colunas recomeçam abaixo dele. Cada faixa é equilibrada por conta própria, de modo que o leitor desce pela primeira coluna e sobe ao topo da segunda antes de atravessar o boxe, como num jornal. Quando uma faixa terminaria desigual, um **limite de faixa** encurta as suas colunas para o mesmo número de linhas, e o texto que já não cabe continua abaixo.

As colunas finais de um capítulo recebem o mesmo tratamento. Em vez de deixar a última página com uma coluna cheia e outra quase vazia, um limite final reparte entre elas as linhas que restam, e as alavancas de equilíbrio fazem o resto. A última página deste capítulo mostra isso: as suas duas colunas terminam niveladas. As quebras de coluna explícitas são respeitadas: \`:::columnbreak\` termina uma coluna onde o autor quer, e o equilíbrio deixa em paz o pé dessa coluna.

:::callout{type="try"}
No painel **Design**, abra **Títulos e sumário** e desative **Equilibrar colunas**. Olhe o pé das colunas deste capítulo, depois ative de novo e veja qual alavanca o motor usou em cada página.
:::

## Regras que você escolhe

Algumas decisões são questão de estilo da casa, e não de certo ou errado, e a configuração as deixa para o livro. Uma lista curta de três itens pode se dividir entre duas colunas? Uma figura pode flutuar para uma abertura de capítulo? Cada **regra de composição** desse tipo assume um de três valores.:index{term="regras de composição"} :chip[allow]{style="state"} deixa o motor fazer, :chip[warn]{style="state"} deixa acontecer e acrescenta uma entrada no painel Verificações, e :chip[avoid]{style="state"} faz o motor mudar a página para que aquilo nunca aconteça: a lista inteira segue adiante com a sua introdução, o flutuante espera pela página depois da abertura. Uma regra em _warn_ é como um editor descobre quantas vezes um livro a quebraria antes de decidir.

# Figuras, tabelas e flutuantes {lead="Uma referência é uma promessa, não uma posição. Mencione uma figura e o Postext encontra um lugar para ela: o primeiro espaço livre depois da menção, numerada na ordem de leitura, com legenda, nunca antes das palavras que a chamam." summary="Onde os recursos vão parar, como são numerados, tabelas que se dividem"}

Tudo o que não é texto corrido (imagens, diagramas SVG, tabelas) é um **recurso**. Os recursos são declarados fora do texto, cada um com um id, um tipo, uma legenda e as suas preferências de posicionamento, e o Markdown simplesmente os menciona. No Sandbox, eles ficam no painel Recursos.

## Basta uma menção

:index{term="flutuantes"}Escrever \`:ref{id="…"}\` numa frase faz duas coisas: imprime o rótulo do recurso e, na primeira vez, _incorpora_ o recurso, que então flutua até o primeiro espaço livre depois da referência. Os espaços são tentados em ordem, como mostra a :ref{id="float-slots"}: o pé da coluna que contém a referência, depois o topo e o pé da próxima coluna livre, depois uma faixa na página seguinte. O texto nunca é interrompido.

Algumas regras mantêm os flutuantes na linha:

- Um flutuante nunca cai antes da sua referência e nunca é reduzido para caber
- Os flutuantes de uma mesma sequência de numeração mantêm a sua ordem, então a figura 12 nunca aparece antes da figura 11; uma tabela esperando espaço não segura as figuras
- Os flutuantes nunca escapam do seu capítulo: aberturas de capítulo, folhas de rosto de parte e o fim do documento são barreiras
- Um flutuante que deixaria menos de três linhas de texto numa página nova espera pela seguinte
- As faixas de topo e de pé se alinham à grade de linhas de base, e a legenda de um flutuante de pé compartilha a linha de base da última linha de texto

## Posicionamento

Cada recurso pode dizer onde prefere ficar, e cada tipo de recurso tem um padrão; os campos estão reunidos na :ref{id="placement-options"}. Um recurso também pode ser inserido em linha num ponto preciso, quando a sua posição é _here_. E uma tabela ou figura larga demais para a página pode girar um quarto de volta: ela então ocupa uma página só sua, encostada na lombada.

## Números e rótulos

Os tipos de recurso definem as suas próprias sequências de numeração. Figuras e tabelas vêm de fábrica e são localizadas no idioma do documento; um tipo pode acrescentar um prefixo, um rótulo curto, um modelo como \`{h1}.{n}\` para números relativos ao capítulo (a figura 5.2 é a segunda figura do capítulo 5), uma regra de reinício e um formato de contador. Os números seguem a **primeira referência na ordem de leitura**: insira uma menção anterior e todos os números depois dela mudam. Uma referência pode imprimir só o número, o rótulo completo ou o curto, mudar a caixa das letras ou imprimir um texto próprio.

A numeração continua correta ao longo de um livro inteiro porque faz parte do que cada capítulo herda dos capítulos anteriores. O sétimo capítulo deste guia começa as suas figuras em 7.1 porque o contador de capítulos diz isso, e não porque alguém digitou o número, e mover um capítulo renumera tudo o que vem depois dele na próxima vez que o livro for diagramado.

## Tipos próprios

Figuras e tabelas são apenas os dois tipos de que qualquer livro precisa. Uma configuração pode declarar quantos tipos de recurso uma publicação usar (mapas, pranchas, boxes, gráficos, documentos), cada um com um nome no singular e no plural, um rótulo curto para as referências, um prefixo para as suas legendas e uma sequência de numeração própria. Um catálogo pode numerar as suas pranchas 1, 2, 3 ao longo do livro inteiro enquanto as suas figuras recomeçam a cada capítulo; um livro didático pode numerar os seus boxes 1-1, 1-2 no capítulo um e 2-1 no capítulo dois. Cada tipo também pode trazer o seu posicionamento padrão e ajustar o estilo da legenda, de modo que as pranchas ocupem uma página inteira com a legenda em cima enquanto as figuras flutuam na largura da coluna.

Um tipo com prefixo vazio e sem legenda também é útil: transforma uma imagem num ornamento, numa vinheta ou num logotipo que pode ser inserido exatamente onde é mencionado, sem número e sem nunca entrar na lista de figuras.

## Tabelas

:index{term="tabelas"}As tabelas trazem o seu modelo consigo: linhas de células com mesclagens de colunas e de linhas, linhas de cabeçalho, alinhamento e larguras relativas de coluna. As células aceitam Markdown em linha, parágrafos e listas simples, um preenchimento próprio (as quatro cores de parte deste livro são :swatch{color="#2b4acb"} azul, :swatch{color="#8f6408"} dourado, :swatch{color="#1f7a6d"} verde-petróleo e :swatch{color="#c0452f"} vermelhão) e até uma imagem. O estilo das tabelas é definido uma vez, para o documento inteiro: tipografia do corpo e do cabeçalho, preenchimento do cabeçalho, fios em grade, só horizontais, só externos ou nenhum.

As tabelas são editadas no painel Recursos, num editor que funciona como uma pequena planilha: adicione ou remova linhas e colunas, mescle e divida células, marque linhas e colunas de cabeçalho, alinhe células, defina preenchimentos e larguras de coluna, solte uma imagem numa célula e cole um bloco de células copiado de uma planilha. Toda alteração pode ser desfeita, e a tabela na página acompanha enquanto você digita.

Uma tabela mais alta que a página se divide entre páginas. As suas linhas de cabeçalho se repetem em cada parte, a legenda de cada continuação ganha o sufixo _(cont.)_, um aviso _Continua_ fecha cada parte menos a última, e nenhuma divisão corta uma mesclagem de linhas. Uma tabela girada se divide da mesma maneira, página após página.

## Figuras ao lado do texto

Num layout de coluna e meia cuja coluna lateral só leva flutuantes, os recursos podem ficar ao lado do texto em vez de dentro dele. Uma figura com a extensão _side_ se empilha na coluna lateral junto ao parágrafo que a cita; um boxe pode fazer o mesmo, e assim os livros didáticos podem manter definições, conceitos-chave e figuras marginais ao lado das linhas que eles explicam. Uma figura larga também pode manter a sua legenda ao lado, na coluna lateral, que é a disposição clássica dos livros didáticos ilustrados e dos catálogos de exposição. As predefinições de exemplo incluem um livro didático de bioquímica e uma edição literária compostos exatamente assim.

## Texto que contorna a imagem

:index{term="contorno de texto"}Uma imagem ou um boxe mais estreito que a sua coluna pode ficar num dos lados dela, com o texto correndo ao lado na medida que sobra e voltando à medida inteira embaixo, como numa revista. As linhas continuam na grade de linhas de base, e o parágrafo que começa ao lado da imagem e termina embaixo dela continua sendo um único parágrafo. Um desenho recortado pode ir além: com o contorno do tipo **Contorno**, cada linha é composta tão curta quanto o desenho é largo naquela altura, de modo que o texto segue o recorte, e não a caixa. Títulos, fórmulas e outras figuras não correm ao lado de um item contornado; esperam embaixo dele.

## Áreas seguras

Uma fotografia raramente precisa de si mesma inteira. Uma imagem pode marcar a sua **área segura**:index{term="área segura"}, o retângulo que guarda o que importa, e o motor pode então recortá-la em qualquer ponto entre a imagem inteira e esse retângulo, mantendo a sua largura. Ele usa essa liberdade para manter uma imagem numa coluna que de outro modo ficaria curta, para encaixar uma imagem mais alta que a página e para equilibrar colunas: uma imagem com área segura pode crescer linhas inteiras para preencher o pé de uma coluna curta, sem deixar nenhum buraco visível. A área segura é desenhada sobre a imagem no painel Recursos, e os quadros dos quadrinhos usam a mesma marca para saber o que nunca cortar.

## Legendas e créditos

Uma legenda é o prefixo do tipo, o número e o texto da legenda, que aceita Markdown em linha e referências próprias. As legendas ficam acima ou abaixo do seu recurso, opcionalmente sobre uma barra colorida, no tipo e no corpo do estilo de legenda; o rótulo pode ser em negrito ou em cor, como neste livro. Um recurso também pode levar uma nota: uma linha menor de crédito ou de fonte composta abaixo dele.

## Um quarto de volta

Alguns recursos são mais largos do que a página é alta: uma linha do tempo, uma tabela larga de resultados, uma prancha panorâmica. Um recurso assim pode girar um quarto de volta, no sentido horário ou anti-horário. Ele então ocupa uma página só sua, encostada na lombada, para que virar o livro para lê-lo pareça natural, e é dimensionado pela altura da página, e não pela largura. Uma tabela girada mais alta que uma página girada (ou seja, mais larga que a altura da página) se divide em quantas páginas precisar, repetindo as suas linhas de cabeçalho, como faria uma tabela em pé.

## Figuras vetoriais

Os diagramas SVG são desenhados como vetores em toda parte. O PDF converte o subconjunto comum do SVG (formas, traçados, grupos, traçados de recorte, preenchimentos e contornos sólidos, opacidade e texto) em operações de desenho nativas, e rasteriza a 600 dpi o que fica fora dele; uma figura também pode trazer uma matriz em PDF própria, incorporada tal como está. Para impressão a uma cor, uma chave recolore todos os diagramas como tons de uma única tinta, pela luminância, nos três renderizadores.

O texto dentro de um SVG continua sendo texto. No PDF ele é composto em fontes reais e pode ser selecionado e pesquisado, e no Sandbox pode ser editado no lugar: o painel Recursos abre o código do diagrama com só o texto editável (o desenho em si fica bloqueado, a menos que você o desbloqueie), de modo que um rótulo pode ser corrigido ou traduzido sem abrir um programa de desenho. Os diagramas deste livro são gerados para cada idioma, e é por isso que os seus rótulos estão em espanhol na edição espanhola, em catalão na catalã, em chinês na chinesa, em árabe na árabe e em português nesta.

Três figuras compostas aqui comprovam isso. A roseta da :ref{id="vector-rosette"} é feita de curvas de Bézier, contornos finíssimos e uma linha de microtexto com dois pontos e meio de altura; o gráfico da :ref{id="vector-chart"} combina uma área preenchida, uma linha tracejada e rótulos de texto; e a :ref{id="vector-clip"} usa um traçado de recorte, um grupo desenhado com transparência e uma forma reutilizada cinco vezes. Abra o PDF, amplie várias vezes o tamanho delas e olhe as bordas: continuam tão nítidas quanto o texto ao redor, porque são desenhadas com os mesmos operadores, e não coladas como imagens. Experimente selecionar os rótulos do gráfico, ou pesquisá-los: são texto. No papel, a diferença aparece nas linhas finas e no microtexto, que uma imagem de baixa resolução borraria. No canvas e na visualização HTML, as mesmas três figuras são o SVG original, desenhado pelo próprio navegador.

:::callout{type="try"}
Clique na legenda de qualquer figura no canvas: o painel Recursos se abre nesse recurso, com o campo da legenda pronto. Mude o posicionamento dele de _auto_ para _top_ e veja a figura se mover.
:::

## Vídeos

:index{term="vídeos"}Um vídeo é mais um recurso. Ele é mencionado, numerado à parte (Vídeo 1.1 ao lado de Figura 1.1) e flutua até o primeiro espaço livre como uma figura. Pode vir do YouTube ou do Vimeo, de um arquivo guardado no livro ou de um endereço web: um arquivo MP4 ou WebM num servidor, ou um stream HLS, a playlist \`.m3u8\` que serve um vídeo longo em segmentos e em várias qualidades.

O impresso leva o seu pôster, um quadro escolhido, com um sinal de reprodução e um QR code que abre o vídeo; no PDF, o pôster também é um link. A visualização HTML e o EPUB o reproduzem no seu próprio player, exceto os vídeos do YouTube e do Vimeo e os streams HLS, para os quais um livro digital só pode apontar um link. Na visualização Folio, um clique no pôster reproduz o vídeo na página, e ele continua tocando enquanto a folha é virada. Os vídeos deste livro, como o :ref{id="postext-showreel"}, são streams HLS servidos a partir de uma rede de distribuição de conteúdo.

Um vídeo pode tocar só um trecho, do segundo em que começa ao segundo em que termina, e o link impresso também abre nesse ponto. A marca de reprodução e o QR code vêm da configuração: a marca pode ser um círculo, um retângulo arredondado ou só o triângulo, e os dois podem ir para qualquer canto do pôster. O QR code mantém o tamanho escolhido e, quando o endereço é curto, aproveita a sobra para corrigir mais erros. Um vídeo guardado no livro sem endereço na web não imprime código nenhum, e o painel **Verificações** avisa.

# Boxes, notas e marcas {#boxes lead="Em volta do texto corrido, um livro mantém uma segunda camada: boxes que separam um comentário, notas no pé da coluna, pequenas marcas dentro da linha e um índice que lembra cada página. Tudo isso se escreve no Markdown e se desenha pela configuração." summary="Boxes, boxes aninhados e flutuantes, chips, notas de rodapé e o índice remissivo"}

O texto corrido é só uma parte do que o leitor encontra numa página. Os livros didáticos emolduram definições e exercícios, os ensaios mandam as suas fontes para o pé da página, os manuais marcam teclas e estados no meio da frase e os livros longos terminam com um índice remissivo. O Postext trata cada uma dessas coisas como conteúdo com nome, escrito no ponto do texto a que pertence, e deixa a aparência para a configuração. Este capítulo usa todas elas nas suas próprias páginas.

## Boxes

:index{term="boxes"}\`:::callout\` compõe uma caixa com um título opcional, num dos estilos que a configuração define. Este livro define cinco: os boxes _Experimente_ que mandam você ao Sandbox, as notas técnicas, as citações em destaque compostas em itálico de títulos, o painel escuro na largura da página com números-chave e, novo neste capítulo, um comentário à margem marcado por um fio. Um estilo decide o fundo, a borda, a faixa lateral e o raio dos cantos da caixa, um ícone ou marca opcional, a tipografia do título, do corpo e das listas, e onde o boxe vai: no fluxo do texto, no alto ou no pé de uma coluna, atravessando a página, na coluna lateral de uma diagramação de coluna e meia ou fixo numa posição da página.

Um boxe longo pode se dividir entre seus parágrafos, ou até entre suas linhas, deixando pelo menos duas de cada lado; a continuação omite o título. Dentro de um boxe, \`:::columns\` compõe o conteúdo em colunas equilibradas, como o painel de números do :ref{id="engine"}.

Os atributos de um boxe podem substituir o estilo dele para uma única caixa: um \`title\`, um \`placement\`, um \`span\` de coluna, de página ou lateral, e um \`label\` impresso numa aba no canto superior, como os rótulos _Boxe 1-1_ de um livro didático. Os estilos também podem deter os flutuantes na sua borda, para que uma figura mencionada dentro de uma caixa nunca escape para além dela, e podem decidir se uma caixa alta demais para a sua coluna deve se dividir ou gerar um aviso.

## Boxes dentro de boxes

:index{term="boxes!aninhados"}Um boxe pode conter outro. Um exemplo resolvido dentro de uma lição, um alerta dentro de um procedimento: o boxe interno é aberto dentro do externo e fechado antes dele, e cada \`:::\` sozinho numa linha fecha o boxe mais interno que ainda estiver aberto. O boxe interno ocupa a largura do seu pai, menos o recuo interno dele, e mantém o seu próprio estilo, de modo que uma nota técnica pode levar um boxe _Experimente_ sem que nenhum dos dois perca as suas cores.

:::callout{type="note" title="Dois boxes, um bloco"}
O boxe externo é uma nota técnica. Ele fica junto com o que contém, então o motor posiciona os dois como um único bloco: nunca deixa o boxe interno sozinho no topo da coluna seguinte.

:::callout{type="try"}
Abra o painel Texto neste capítulo e apague a linha que fecha o boxe interno. O boxe externo passa a terminar onde termina o capítulo, e o painel Verificações avisa.
:::

O boxe externo continua depois do interno, no seu próprio estilo.
:::

## Boxes que flutuam

Um boxe costuma ficar onde foi escrito, entre os parágrafos em volta. Alguns boxes não têm motivo para interromper a leitura: um quadro lateral, um perfil, um resumo de números. Com um \`placement\` _top_ ou _bottom_, um boxe assim flutua como uma figura até o topo ou o pé da primeira coluna com espaço para ele, e o texto que vem depois dele no Markdown preenche a página acima ou abaixo. O boxe sob este parágrafo foi escrito aqui, no meio da seção, e composto no pé de uma coluna.

:::callout{type="aside" placement="bottom" title="Onde cai um boxe flutuante"}
No primeiro espaço livre a partir do ponto onde foi escrito, a mesma regra que uma figura segue. Um boxe que precisa ficar inteiro cede aos boxes e às figuras já posicionados, nunca o contrário.
:::

Um boxe flutuante conserva todas as outras regras do seu estilo. Pode ser mais largo que uma coluna, pode levar um rótulo e nunca se move para antes do ponto onde foi escrito, de modo que quem o encontra já leu o parágrafo que leva até ele.

## Marcadores e boxes desenhados

Um estilo pode desenhar um **marcador** fora do boxe, numa coluna estreita só dele, ao lado: um ícone, um glifo, uma forma ou uma imagem dos recursos, com um fio que desce por toda a altura do boxe. O comentário que flutuou na seção anterior usa um: um ponto dourado sobre um fio da mesma cor.

Quando um marcador não basta, um estilo pode desenhar o boxe inteiro com um **design**, os mesmos blocos de texto, caixas, fios e imagens que desenham as aberturas de capítulo deste livro. O texto do boxe vira um elemento entre os outros, e os atributos escritos no boxe podem ser impressos no design: um número num selo, um nível numa aba, um nome numa faixa no pé. O caderno de caligrafia entre as receitas da seção Receitas desenha assim as suas linhas de cobrir.

## Marcas dentro da linha

:index{term="chips"}Algum conteúdo é menor que um boxe. \`:chip[…]\` põe uma palavra numa pequena caixa arredondada que corre com o texto, para teclas, estados e etiquetas: uma configuração que pode valer :chip[allow]{style="state"}, :chip[warn]{style="state"} ou :chip[avoid]{style="state"}, ou uma tecla como :chip[Esc]. Um chip tem um estilo, como um boxe: o fundo, a borda, o raio, a fonte e a cor, e o espaço em volta, tudo vindo da configuração. Os chips quebram com a linha e nunca se dividem por dentro, e o motor conta a largura deles quando escolhe as quebras do parágrafo.

As amostras de cor são um segundo tipo. Escrita \`:swatch{color="#c0452f"}\`, uma amostra põe um pequeno quadrado dessa cor dentro da linha, :swatch{color="#c0452f"} como este, e é assim que um guia de estilo ou uma tabela de tintas nomeia uma cor e a mostra ao mesmo tempo.

## Notas de rodapé

:index{term="notas de rodapé"}Uma nota é chamada com \`[^id]\` logo depois da palavra ou do sinal de pontuação a que pertence,[^first-note] e escrita em qualquer lugar do capítulo como um parágrafo que começa com \`[^id]:\`. As notas são numeradas na ordem em que são chamadas pela primeira vez, recomeçando em um a cada capítulo; \`footnotes.numbering\` pode seguir a numeração ao longo do livro ou reiniciá-la a cada página, como fazem os livros chineses e os árabes clássicos, e os números podem ser impressos dentro de círculos ou entre colchetes.

[^first-note]: Esta é uma. Foi escrita algumas linhas mais abaixo no Markdown, como um parágrafo próprio, e composta no pé da coluna que contém a linha que a chama.

A nota é composta no pé da coluna que contém a linha que a chama, sob um fio curto, e a linha e sua nota ficam sempre na mesma coluna: quando a nota não cabe, a linha passa com ela para a coluna seguinte.[^second-note] \`footnotes.placement: 'chapterEnd'\` reúne, em vez disso, as notas de um capítulo depois do seu último bloco. Uma chamada sem nota e uma nota que nada chama aparecem no painel **Verificações**. Entre os livros de exemplo, _Paraíso perdido_ traz oitocentas, marcadas com letras que recomeçam a cada página.

[^second-note]: O motor equilibra a coluna contando as linhas da nota, de modo que uma página com notas também termina nivelada.

## Um índice no fim

:index{term="índice remissivo"}O índice remissivo é escrito onde o texto trata de cada termo. \`:index[anaemia]\` imprime a palavra e a registra; \`:index{term="Heart!valves"}\` não imprime nada e registra a página sob uma subentrada. O indicador \`main\` põe a página em negrito, \`range="start"\` e \`range="end"\` delimitam um trecho que ocupa várias páginas, e \`see\` e \`seealso\` escrevem as remissões. \`:::index\` imprime o índice onde está, normalmente sob um título cujo estilo o compõe em duas colunas, e ao lado do principal podem conviver índices com nome, de pessoas ou de lugares.

O motor lê a página de cada marca depois da diagramação, então os números acompanham o texto: acrescente um parágrafo, mova um capítulo ou mude o formato do refile, e o índice imprime as páginas novas. As entradas são ordenadas segundo a ordem alfabética do idioma do documento e agrupadas sob a letra inicial, as páginas seguidas se juntam num intervalo e cada número é um link no PDF. Um índice árabe ignora o artigo _al-_ ao ordenar, e um chinês ordena pela leitura de cada caractere. Este livro tem um, no fim, construído com marcas escritas em todos os capítulos.

# Livros, partes e cabeços {lead="Um livro é mais que seus capítulos: uma capa, um sumário que se mantém em dia, divisórias de parte, aberturas que anunciam cada capítulo e cabeços que sabem onde o leitor está. Tudo isso é configuração." summary="Capítulos, estilos de título, blocos de design, partes, sumário e fólios"}

Este guia é um livro de vinte e um capítulos, e cada capítulo é um documento Markdown próprio. Um projeto no Sandbox é sempre um livro: a configuração, os recursos e as fontes são compartilhados, e os capítulos se sucedem, como mostra :ref{id="book-anatomy"}.

## Os capítulos fazem o livro

Cada capítulo é diagramado separadamente, _continuando_ os anteriores: herda deles a contagem de páginas e a paridade, os contadores de capítulos e de figuras, a parte aberta e os cabeços. Por isso as figuras deste capítulo são numeradas a partir de 7.1, e por isso editar um capítulo nunca obriga o motor a compor de novo o livro inteiro. As visualizações podem mostrar o capítulo atual ou o livro completo, e o PDF pode ser gerado de qualquer um dos dois. Os capítulos podem ser acrescentados, renomeados, reordenados, divididos nos seus títulos de primeiro nível ou fundidos com o anterior.

## O que um capítulo herda

A continuação que um capítulo recebe é pequena e precisa. Ela traz a contagem de páginas e a paridade da página seguinte, para que uma abertura que precisa cair numa página par saiba se precisa de uma página em branco antes dela. Traz os contadores: o número do capítulo, os números de cada sequência de recursos, a sequência de numeração dos rótulos de página. Traz a parte aberta, com seu título, seu número e sua paleta, para que um capítulo no meio de uma parte conserve as cores dela. E traz o esquema do livro, para que um sumário no capítulo dois possa imprimir a página em que começa o capítulo dez.

Como a continuação é tudo o que um capítulo precisa do resto do livro, os capítulos podem ser diagramados de forma independente, em segundo plano, e costurados uns aos outros para a visualização do livro completo e para o PDF. O resultado é o mesmo que diagramar o livro inteiro de uma vez, página por página: o motor foi construído para garantir essa propriedade.

## Estilos de título

Um título pode levar atributos, escritos entre chaves no fim da sua linha. O mais poderoso é o **estilo**: \`{style="cover"}\` aplica um estilo de título com nome, que muda a tipografia e o design do título e, na seção que ele abre, pode mudar os cabeços, as margens da página, a disposição das colunas, a tipografia do texto corrido e a paleta. A capa deste livro é um estilo de título com margens próprias, sem cabeços e com um design de página inteira; o sumário é outro. Um estilo também pode deixar seus títulos sem número, para que um prefácio não desloque a numeração dos capítulos, e mantê-los fora do sumário.

## Um olhar sobre a configuração deste livro

Vale a pena ver como são construídas as páginas que você está lendo. A capa é o título de primeiro nível do primeiro capítulo, com o estilo _cover_. O estilo dá a essa seção margens que empurram qualquer texto para o pé da página, retira os cabeços e desenha um design de página inteira: uma caixa que preenche a sangria com a cor noturna, a ilustração da capa como elemento de imagem ancorado no alto da sangria, um antetítulo em versais douradas com espaçamento generoso, o título dos metadados em Fraunces a 88 pontos, um fio dourado curto, o subtítulo em Lora itálico e uma linha de créditos no pé. O antetítulo e os créditos vêm de atributos do título, escritos na linha dele no Markdown.

As aberturas de capítulo são um design do primeiro nível de título. Uma caixa preenche o alto da sangria com a cor da parte; o número do capítulo é impresso em tamanho grande junto à borda externa, o antetítulo combina a palavra _Capítulo_, o número e o título da parte, e abaixo de um fio branco curto vêm o título e a introdução do capítulo, tirada do atributo \`lead\` do título. O atributo \`summary\` do mesmo título é o que o sumário imprime sob cada entrada. Nada nesses designs é exclusivo deste livro: qualquer configuração pode compor os seus.

## Blocos de design

:index{term="blocos de design"}Cabeços, rodapés, aberturas de capítulo e páginas de parte são desenhados por **blocos de design**: pequenas composições livres de textos, fios, caixas e imagens. Cada elemento é ancorado à página, à sangria, à mancha gráfica ou a outro elemento, com deslocamentos e tamanhos em unidades reais, e o texto dele pode conter **marcadores** como \`{pageNumber}\`, \`{chapterTitle}\`, \`{partTitle}\` ou qualquer atributo do título, como o \`{attr.lead}\` que coloca a introdução na faixa deste capítulo. Os elementos podem ser limitados às páginas ímpares ou pares e às páginas de um papel específico (texto, abertura, parte ou em branco), e é assim que os cabeços deste livro desaparecem nas aberturas de capítulo enquanto um fólio aparece no pé delas. Os elementos de texto podem quebrar linha, hifenizar, ser cortados com reticências, desenhar uma caixa por trás de si e abrir com uma capitular.

Os cabeços são um bloco de design comum, com elementos filtrados por paridade e por papel. Nas páginas pares deste livro, o fólio na cor da parte e o título do livro ficam junto à borda externa; nas ímpares, o título do capítulo e o fólio. Eles só aparecem nas páginas de texto; as aberturas levam um fólio no pé, e as divisórias de parte não levam nada. A página preta diante de cada divisória de parte também é um elemento de design: uma caixa que preenche a sangria, mostrada apenas nas páginas pares em branco, que, num livro cujos capítulos abrem em página par e cujas partes abrem em página ímpar, são exatamente as páginas que ficam diante de uma parte.

## Partes e paletas

:index{term="partes"}\`:::part\` abre uma divisória de parte: uma página própria, levada à paridade que a configuração pede, desenhada pelo design de parte e seguida de um corpo, em geral a lista dos seus capítulos. As partes seguem adiante, de modo que os cabeços e as aberturas dos capítulos seguintes podem nomear a parte a que pertencem, e aparecem tanto no sumário quanto nos marcadores do PDF.

Neste livro cada parte abre como uma página dupla: uma página par toda preta à esquerda e a divisória à direita. As partes saltam com a paridade _sempre ímpar_, que põe uma folha em branco antes de cada divisória e acrescenta uma segunda quando o capítulo anterior termina numa página par, de modo que a divisória cai sempre numa página ímpar com uma página par em branco diante dela. O primeiro capítulo da parte abre então no verso da divisória, numa página par, como todos os capítulos.

Uma parte também pode mudar as cores do livro. As cores da configuração podem ser vinculadas a entradas com nome da **paleta**:index{term="paleta"}, e o atributo \`palette\` de uma parte substitui entradas até a parte seguinte. Este livro define uma entrada, a _cor da parte_, e cada parte lhe dá um valor: azul para os fundamentos, dourado para o ofício, verde-petróleo para as páginas além do texto corrido, vermelhão para a prática. As faixas dos capítulos, os números dos títulos, os fólios e as legendas acompanham a mudança.

## Um sumário que se mantém em dia

:index{term="sumário"}\`:::toc\` imprime o sumário: uma entrada para cada título dos níveis indicados e uma linha para cada parte, com números, títulos, linhas de pontos, números de página e, se você quiser, uma linha tirada de um atributo do título; neste livro, o resumo de cada capítulo. Os números de página são reais: o motor diagrama o livro, lê onde cada título caiu e compõe o sumário de novo até os números se estabilizarem, o que leva no máximo três passadas a mais. No PDF, as entradas são links. Basta mudar um título no Markdown para que o sumário o mostre na diagramação seguinte, com o número da página onde ele caiu. O mesmo vale para as partes, que entram no sumário com o seu número e o seu título.

## Quebras de página e numeração

\`:::pagebreak\` começa uma página nova e pode pedir que ela seja ímpar ou par, acrescentando uma página em branco quando necessário. \`:::numbering\` troca a sequência de numeração das páginas a partir da página seguinte; é assim que os elementos pré-textuais numerados em algarismos romanos passam a vez aos algarismos arábicos no capítulo um. As aberturas de capítulo podem pedir uma paridade própria, e as páginas em branco são reconhecidas como tais, de modo que os cabeços as deixam limpas. E onde um trecho pede um pouco mais de ar acima dele, \`:::space\` deixa uma linha em branco, ou \`:::space{lines=2}\` duas; linhas em branco a mais no Markdown não acrescentam nada, como em qualquer Markdown.

# Um livro, muitos idiomas {#languages lead="Este guia existe em dez edições, em quatro sistemas de escrita e em duas direções, e todas compartilham um mesmo design. Cada edição guarda só o que o seu idioma precisa dizer de outro jeito." summary="Edições, configurações gerais, ajustes próprios, escritas e direções"}

Um livro traduzido costuma ser um segundo livro. O designer abre o primeiro, salva uma cópia e começa a mudar coisas, e a partir daí cada correção no design precisa ser feita duas vezes, ou dez, à mão. O Postext mantém juntas as edições de um livro: um único projeto com um conjunto de capítulos para cada idioma, um design compartilhado e, para cada idioma, uma pequena lista das configurações que ele define de outro modo.

## Edições

:index{term="edições"}Um livro no Sandbox pode conter vários idiomas. Cada **edição** tem os seus capítulos, o seu nome e a sua descrição e, onde uma figura precisa, a sua própria arte; os recursos, as fontes e o design são do livro. O painel Livros mostra uma etiqueta para cada idioma que um livro contém, e o endereço da página nomeia o que está na tela, de modo que um link abre a edição de onde foi copiado. O canvas pode diagramar duas edições lado a lado, e é assim que um tradutor confere se o capítulo em espanhol ainda cabe nas páginas que o inglês preenche.

Uma edição nova começa como cópia da que está na tela, ainda sem traduzir, a partir de **Adicionar um idioma…** no menu do livro. Quando o idioma novo é o árabe, o chinês ou o japonês, a cópia recebe no caminho os padrões desse idioma: a direção, o modo de escrita, as fontes e as regras da sua tipografia, que diferem demais das de um livro latino para ficar ao acaso.

## Configurações gerais e ajustes próprios

O design de um livro em vários idiomas fica em duas camadas. As **configurações gerais** são as que todas as edições usam:index{term="configurações gerais"}; cada idioma tem então os seus **ajustes próprios**, que nomeiam só os campos que ele define de outro modo e se mesclam campo a campo sobre os gerais. Uma cor, um tamanho ou uma margem mudados na camada geral chegam a todas as edições de uma vez; mudados nos ajustes próprios de um idioma, chegam só a essa edição.

O painel Design mostra as duas camadas com uma chave no alto, entre _Todos os idiomas_ e só o idioma atual. Com a chave num idioma, um campo que esse idioma define para si leva uma marca, e o painel pode mandar um valor para a camada geral ou trazer uma edição de volta a ela. Uma lista curta no alto do painel nomeia cada configuração que o idioma define para si, de modo que um ajuste próprio nunca se esconde num canto de quinhentos campos.

:::callout{type="note" title="Como este guia é composto"}
As sete edições em escrita latina compartilham quase tudo: das configurações que fazem o design, cada uma define umas poucas dezenas para si, e todas são palavras, os títulos dos seus boxes, os nomes das suas cores, estilos e figuras, o título nos seus cabeços e o idioma da sua hifenização. As edições em árabe, chinês e japonês conservam a mesma página, a mesma paleta e as mesmas partes, e definem o tipo, a direção e o modo de escrita para as suas escritas.
:::

Esses números estão na :ref{id="edition-layers"}. A divisão não é um acaso da forma como o guia foi escrito: é o menor conjunto de ajustes próprios que cada edição pode ter, calculado pelo motor a partir das próprias edições.

## O que um idioma muda

O idioma do documento é uma configuração, \`locale\`, e vai além da hifenização. Ele escolhe os padrões de hifenização, que vêm prontos para oito idiomas; os nomes dos tipos de figura e de tabela de fábrica, _Figure_ em inglês, _Figura_ em espanhol, _Abbildung_ em alemão; as palavras que uma tabela dividida ou um boxe continuado imprime; a ordem de um índice remissivo; e os algarismos, que um livro árabe pode compor em algarismos arábico-índicos. Um título ou um parágrafo pode mudar de idioma por conta própria, e algumas palavras em outro idioma podem ser marcadas no meio da linha, de modo que uma citação em francês num capítulo em português quebra pelas regras do francês.

## Quatro escritas, duas direções

As edições deste guia usam todos os tipos de composição que o motor conhece. As edições latinas são compostas da esquerda para a direita, justificadas e hifenizadas. A edição **árabe** é lida a partir da direita e encadernada pela direita: as suas linhas são justificadas alongando as letras com kashida onde a escrita permite, e não só alargando os espaços, os números e as palavras latinas mantêm a sua própria direção dentro da linha, e as figuras são desenhadas espelhadas onde a sua disposição segue a ordem de leitura.

As edições em **chinês** e em **japonês** são compostas na vertical, em colunas que correm de cima para baixo e da direita para a esquerda, encadernadas pela direita como a árabe. As suas linhas seguem as regras que cada idioma escreveu para si: que sinais de pontuação podem abrir ou fechar uma linha, quanto espaço ocupa uma vírgula, onde as palavras latinas deitam de lado e onde os números curtos ficam em pé na coluna. O japonês acrescenta o **ruby**:index{term="ruby"}, pequenas leituras compostas ao lado dos caracteres difíceis, escritas no Markdown como \`:ruby[…]{rt="…"}\` ou numa forma mais curta entre chaves, que dá a cada caractere a sua própria leitura, com uma barra antes de cada leitura.

## Traduzir com o motor à vista

Como as páginas são compostas enquanto se digita, uma tradução pode ser julgada à medida que é escrita. Uma frase em alemão um terço mais longa que o original em inglês mostra o seu custo na hora, numa coluna que passa uma linha da conta ou num título que já não cabe na sua faixa. Cada edição deste guia foi composta página por página com o painel Verificações aberto e as colunas lidas em busca de buracos e de finais curtos, do mesmo jeito que um tipógrafo as comporia à mão.

:::callout{type="try"}
Abra o painel Livros e troque o idioma deste guia com os botões da linha dele. Depois abra o painel Design, ponha a chave do alto só no idioma atual e leia a lista do que esta edição define para si.
:::

:::part{number="III" title="Além do texto corrido" palette="band=#1f7a6d"}
9. Páginas compostas
10. Quadrinhos e partituras
11. Exercícios e cursos
:::

# Páginas compostas {#composed lead="Nem toda página é um rio de texto. Uma página dupla de livro didático, a abertura de uma revista ou uma folha de consulta rápida são construídas com blocos, cada um com a sua peça. O Postext guarda os blocos num modelo e as palavras no Markdown." summary="Modelos de página, blocos, slots, páginas duplas e texto que não cabe"}

Os capítulos até aqui compõem o texto em colunas que correm de página em página, e o motor decide onde cai cada linha. Uma grande família de livros funciona ao contrário. Num livro escolar, cada página dupla é desenhada primeiro: uma faixa para o título, um boxe para a definição, uma tira de fotografias, uma coluna de exercícios, um mapa com legendas. As palavras são escritas para caber nos blocos, e quando não cabem alguém as encurta ou move um bloco. O Postext também compõe essas páginas, com o nome de **páginas compostas**, e segue a regra que o resto do motor segue: o Markdown diz o que é o conteúdo, a configuração diz onde ele vai.

## Modelos e blocos

:index{term="páginas compostas"}Um **modelo de página** faz parte da configuração:index{term="modelos de página"}, em \`pageTemplates\`. Ele nomeia um conjunto de **blocos**: retângulos posicionados na página por uma âncora e um deslocamento ou por uma célula de uma grade, com uma largura, uma altura e um estilo de caixa tirado dos estilos de boxe do livro. Um bloco pode ser tão alto quanto o seu conteúdo, ter altura fixa ou ir até a borda da página; os blocos podem ser empilhados ou postos numa fileira como um **grupo**, de modo que quando um cresce os outros se movem junto. Um modelo também leva uma **decoração**: fios, faixas, imagens e textos curtos posicionados depois que os blocos estão no lugar, de modo que uma faixa pode pender de um boxe e acompanhá-lo.

Nenhuma palavra mora num modelo. Um bloco tem um nome, um tamanho e uma aparência; o título que ele imprime, o texto que contém e a imagem que emoldura vêm todos da página que o usa. É isso que permite às dez edições deste guia compartilharem um único modelo para a página que fecha este capítulo: cada uma preenche os mesmos blocos com as suas próprias palavras.

## Preencher os blocos a partir do Markdown

Uma página composta é uma cerca de quatro sinais de dois-pontos que nomeia o seu modelo. Dentro dela, \`:::frame{slot="…"}\` manda o seu conteúdo para o bloco com esse nome, e um título, um recurso ou um boxe podem nomear um slot próprio. O conteúdo que não nomeia nada vai para o bloco marcado como **bloco de fluxo** do modelo, e o primeiro título vai para o bloco que recebe os títulos do seu nível. A última página deste capítulo foi escrita assim, e o Markdown dela se lê como o de qualquer outro capítulo.

:::callout{type="note" title="A cerca da última página"}
\`::::page{template="sheet"}\` a abre e \`::::\` a fecha. Entre as duas, um título para o alto da folha, um parágrafo para o bloco de fluxo, seis blocos \`:::frame\` para os cartões e um para a legenda de teclas no pé da página. As posições, os tamanhos e as cores estão no modelo, em Design › Página e colunas › Modelos de página.
:::

## Como uma página é composta

Uma página composta ocupa uma página só dela, ou duas numa página dupla, e o texto depois da sua cerca começa na seguinte. O motor posiciona os blocos um a um, preenche cada um com a tipografia do resto do livro, os mesmos estilos de parágrafo, títulos, listas e chips, e desenha a sua caixa no tamanho final. Os blocos são lidos na ordem em que o seu conteúdo aparece no Markdown, e não na ordem em que são pintados, de modo que um leitor de tela, o PDF etiquetado e o EPUB refluível leem o título, depois o texto, depois os boxes, como uma pessoa faria.

## Quando as palavras não cabem

Um texto escrito para um bloco nunca cabe na primeira tentativa. Um modelo diz o que a página pode fazer a respeito, e o motor tenta cada passo em ordem e para no primeiro que funciona. Um bloco que acompanha o seu conteúdo cresce no espaço que o seu grupo deixa; os blocos abaixo dele descem; os blocos marcados para ceder encolhem; o texto pode ser composto um pouco mais apertado. Quando nada disso basta, o texto continua em outro bloco, encadeado como as caixas de texto vinculadas de um programa de editoração, ou numa página acrescentada depois desta, sob uma marca que diz onde ele continua.

O que a página não conseguiu resolver aparece no painel Verificações com as suas propostas: qual bloco transborda, em quantas linhas e o que o faria caber. Um **registro de rearranjo** anota cada movimento que o motor fez na página, para que um designer veja por que um boxe acabou mais baixo do que o modelo o pôs. No Sandbox, um clique no aviso mostra o bloco, e os campos do bloco ficam a um clique.

## Páginas duplas e conectores

:index{term="páginas duplas"}Um modelo pode cobrir duas páginas que se olham como uma única folha. Uma **página dupla** abre numa página par, acrescenta uma página em branco antes dela quando o texto anterior termina numa página par, e deixa os blocos e a decoração atravessarem a lombada onde o modelo permite; uma medianiz mantém todo o resto longe da dobra. Linhas do tempo, mapas e aberturas em página dupla são compostos assim, e cada página da dupla continua imprimindo o seu próprio cabeço e o seu fólio.

Os blocos também podem ser ligados por **conectores**: linhas, cotovelos e curvas desenhados entre dois blocos, que continuam presos a eles por mais que as palavras os movam, para organogramas, árvores genealógicas e mapas com legendas. As imagens de um bloco podem levar rótulos ancorados em pontos da imagem, com linhas de chamada e indicadores, de modo que um mapa de rios mantém os nomes sobre os rios quando o mapa é redimensionado ou traduzido.

## Modelos no Sandbox

Os modelos são editados no painel Design, onde cada um é desenhado com os seus blocos e listado com o número de páginas que o usam. Com a visualização no modo **Design**, uma página composta mostra a sua grade e as suas margens, tocar num bloco o seleciona, arrastá-lo o move e as suas alças o redimensionam; a caixa é gravada de volta no modelo em milímetros. Quando outras páginas usam o mesmo modelo, o Sandbox pergunta se a mudança vale para todas ou só para esta página, o que cria um modelo novo baseado no primeiro.

O caminho inverso também existe. Uma página diagramada à mão pode ser salva como modelo, e um livro cujos estilos antigos guardavam as suas palavras pode levá-las para o Markdown, onde é o lugar delas, com um único comando para o livro inteiro.

:::callout{type="try"}
Passe a visualização para o modo Design, vá até a última página deste capítulo e arraste um dos cartões para baixo. O Sandbox pergunta se deve mudar o modelo ou só esta página; escolha só esta página e abra o painel Texto para ver a cerca, que agora nomeia um modelo novo.
:::

::::page{template="sheet"}
## O Postext numa página

O Postext compõe livros a partir de duas entradas: Markdown que diz o que é o texto e uma configuração que diz como ele aparece. Mude qualquer uma das duas e as páginas se compõem de novo, no navegador, numa fração de segundo.

:::frame{slot="card" label="Escrever"}
Markdown comum e algumas diretivas: \`:::callout\` para um boxe, \`:ref\` para uma figura, \`[^id]\` para uma nota, \`::::page\` para uma página como esta. O texto nunca diz onde as coisas vão.
:::

:::frame{slot="card" label="Desenhar"}
Mais de quinhentas configurações no painel Design: a página e suas colunas, o tipo, os boxes, as aberturas, os cabeços e uma paleta que cada parte pode recolorir.
:::

:::frame{slot="card" label="Compor"}
Cada parágrafo quebrado como um todo, colunas niveladas, figuras no primeiro espaço livre depois da menção, um livro diagramado de novo até os fólios se firmarem.
:::

:::frame{slot="card" label="Verificar"}
O painel Verificações lista o que o motor notou: uma linha frouxa, uma fonte que falta, uma cor clara demais, uma imagem grosseira demais para a gráfica. Um clique leva à linha.
:::

:::frame{slot="card" label="Publicar"}
Uma diagramação, cinco saídas: o canvas, HTML para a tela, um PDF para a gráfica ou a biblioteca, EPUB para leitores digitais e um pacote SCORM para um curso.
:::

:::frame{slot="card" label="Compartilhar"}
Um livro viaja num único arquivo .postext, com capítulos, design, imagens e fontes. A linha de comando o compõe num servidor; o Sandbox o abre em qualquer navegador.
:::

:::frame{slot="key" label="Teclas"}
Esta folha é uma página composta: um modelo com um título, um bloco de fluxo, uma grade de cartões e um boxe no pé da página, preenchido com o Markdown deste capítulo. No editor, :chip[⌘ Z] desfaz e :chip[⌘ F] busca; :chip[Esc] fecha uma caixa de diálogo.
:::
::::

# Quadrinhos e partituras {#comics lead="Alguns livros falam por imagens e outros por notas. Um quadrinho é um conjunto de desenhos e um roteiro; uma partitura é música escrita como texto. Nos dois casos, o Postext guarda as palavras no Markdown e faz ele mesmo o letreiramento e a gravura musical." summary="Quadros, balões, letreiramento, tiras e notação musical"}

Os quadrinhos e a música parecem o oposto daquilo para que serve um motor de texto. Uma página de quadrinhos é desenhada, uma partitura é gravada, e nenhuma das duas é uma coluna de linhas justificadas. No fundo, porém, as duas são feitas de texto. Cada balão de um quadrinho é uma fala que precisa ser traduzida, letreirada e encaixada num desenho, e cada compasso de uma partitura é uma notação que um músico pode escrever num editor de texto. O Postext as trata assim: os desenhos e as regras são recursos e configurações, as falas e a música estão no capítulo.

## Imagens sem palavras

:index{term="quadrinhos"}Um quadrinho no Postext parte de desenhos sem nenhum letreiramento. Cada imagem pode marcar o que nunca deve ser cortado, a sua **área segura**, e onde estão os seus personagens: um ponto para a boca de cada um que fala, uma caixa para cada rosto, zonas que os balões devem evitar. Essas marcas são feitas uma vez, no painel Recursos, e todas as edições do quadrinho as usam.

O roteiro é o Markdown do capítulo. Um bloco \`:::page\` corta uma página em quadros com uma fórmula curta, \`30 [30 | 20 | *] / *\` para uma fileira de três quadros sobre um grande, dá a cada quadro a sua imagem e lista sob cada quadro o que se diz nele, uma linha por balão: \`maya: Grandpa! I'm here!\`. Uma legenda, um pensamento, um sussurro, um grito ou uma onomatopeia são a mesma linha com outra chave ou outro estilo.

## Letreiramento

:index{term="letreiramento"}O motor letreira cada balão num único tamanho, na fonte de letreiramento do livro, do jeito que um letrista trabalha. Ele quebra as palavras em linhas que formam um contorno arredondado, curtas no alto e embaixo, depois desenha o balão em volta delas com o mesmo respiro de todos os lados, posiciona-o na ordem de leitura dentro do quadro, longe dos rostos e das zonas que a imagem marca, e aponta o rabicho para a boca de quem fala. Duas falas seguidas do mesmo personagem se unem num único balão de dois lóbulos. O texto nunca é reduzido para caber: um balão que não cabe muda de forma, se move ou é apontado no painel Verificações.

A tira da :ref{id="guide-strip"} foi letreirada assim. Os seus três desenhos não levam palavras; as falas são três linhas de Markdown neste capítulo, e cada edição deste guia as letreira no seu próprio idioma.

:::strip{split="* | * | *" span=page placement=top caption="Uma tira letreirada pelo motor. Os desenhos são compartilhados por todas as edições deste guia; os balões são escritos no Markdown de cada edição." type=figure id=guide-strip}
::panel{art=strip-proof}
editor: A edição alemã passa uma linha da conta na página 212.
::panel{art=strip-screen}
designer: Então aperte o parágrafo, não a página.
::panel{art=strip-book}
sfx: FLAP
:::

## Direção de leitura e tradução

Um quadrinho ocidental é lido da esquerda para a direita; um mangá e um quadrinho árabe, da direita para a esquerda. O Postext tira a direção do idioma da edição: uma edição em árabe ou em japonês dispõe os quadros de cada fileira a partir da direita, espelha os cantos e as inclinações e encaderna o livro pela direita, enquanto as imagens ficam como foram desenhadas. Os balões japoneses são letreirados em colunas verticais, com a pontuação girada para a coluna.

Uma tradução é o mesmo Markdown com outras palavras. As imagens, os recortes e as marcas são compartilhados; cada edição mede o seu próprio texto e posiciona os seus próprios balões. O espanhol corre cerca de um quinto mais longo que o inglês e o chinês bem mais curto, e os balões mudam de tamanho com ele, sem que ninguém os mova à mão.

## Páginas, páginas duplas e tiras

Um quadrinho pode ocupar uma página, correr por duas páginas que se olham num panorama ou ficar no texto como uma **tira**, da largura de uma coluna ou da página, como a tira diária de um jornal. Uma tira se comporta como uma figura: pode ser numerada e levar legenda, ser citada com \`:ref\` e flutuar até o topo ou o pé de uma página. As receitas de jornal da seção Receitas compõem tiras assim, entre as matérias.

## Música como texto

:index{term="notação musical"}Uma partitura é escrita no capítulo como um bloco cercado de notação, do jeito que se escreve código num livro técnico. O Postext lê quatro formatos: **ABC**, compacto e fácil de digitar, para melodias e canções; **MusicXML**, exportado pelos programas de notação que os músicos usam; **MEI**, para edições acadêmicas; e **Humdrum**, para corais e análise. O motor grava a música com o Verovio, a biblioteca de gravura da Music Encoding Initiative, na largura da coluna.

A melodia abaixo está escrita em cinco linhas de ABC no Markdown deste capítulo. O motor a grava e a compõe como uma fórmula em destaque, sobre a grade de linhas de base, e o texto continua depois dela.

\`\`\`abc {alt="Uma melodia curta em sol maior, em compasso de três por quatro"}
X:1
M:3/4
L:1/8
K:G
D2 | G2 B2 d2 | c2 A2 F2 | G4 B2 | A4 D2 | G2 B2 d2 | e2 c2 A2 | G6 |]
\`\`\`

Uma partitura longa é cortada em **sistemas**, as linhas de música que um leitor acompanha, e os sistemas seguem de coluna em coluna e de página em página como as linhas de um parágrafo, sem nunca cortar uma pauta. Um exemplo musical que o texto cita pode, em vez disso, ser um recurso, numerado e com legenda como uma figura. A aparência da música é uma configuração: o tamanho das pautas, a fonte musical, os números de compasso e as margens em volta de uma partitura, com estilos nomeados para exemplos menores dentro de um boxe.

A música é opcional. O gravador pesa vários megabytes e só é carregado pelos livros que contêm notação, de modo que um romance nunca paga por ele. As partituras são desenhadas como vetores no canvas, no HTML e no PDF, etiquetadas como figuras com o seu texto alternativo no PDF acessível, e levadas para o EPUB.

# Exercícios e cursos {#exercises lead="Um livro didático pede ao leitor que faça algo: escolher, completar, relacionar, escrever. O Postext lê as perguntas e as respostas no Markdown, imprime o exercício para o aluno e deixa as edições de tela corrigi-lo." summary="Tipos de exercício, gabaritos, soluções, edições de tela e SCORM"}

Os exercícios de um livro escolar estão entre as páginas mais tediosas de compor à mão. Cada lacuna precisa ser longa o bastante para se escrever nela e não pode entregar a resposta pelo seu comprimento, as opções de uma questão levam rótulos no estilo da coleção, o gabarito no fim precisa corresponder às questões do começo, e o livro do professor imprime as mesmas páginas com as respostas preenchidas. Tudo isso decorre de duas coisas: o que é a pergunta e qual é a sua resposta. O Postext não pede mais nada.

## Um exercício no Markdown

:index{term="exercícios"}Um exercício é um bloco entre \`:::exercise\` e \`:::\`. Os seus primeiros parágrafos são o enunciado; o que vem depois é a questão, escrita num Markdown que um professor conseguiria digitar sem manual. Uma lista de tarefas com as opções certas marcadas é uma questão de múltipla escolha. As palavras entre colchetes duplos são lacunas, e as palavras dentro delas são as respostas. Pares ligados por uma seta são um exercício de relacionar. O motor deduz o tipo de exercício pelo que encontra, e um atributo \`type\` o declara quando o conteúdo não basta.

Os três exercícios abaixo tratam deste livro. Foram escritos no Markdown deste capítulo, em poucas linhas cada um, e o motor os numerou, deu rótulos às opções, desenhou as lacunas e compôs os boxes.

:::exercise{level=1}
Qual destas coisas a configuração decide, e não o Markdown?

- [ ] As palavras de um título
- [x] A cor da faixa do capítulo
- [ ] Que figura um parágrafo menciona
:::

:::exercise{bank level=2}
Complete as frases com as palavras do quadro.

1. Uma figura flutua até o primeiro espaço livre depois da sua [[menção]].
2. O motor quebra um parágrafo como um [[todo]], não uma linha de cada vez.
3. Uma página composta preenche os blocos de um [[modelo]].

::bank[margem | coluna]
:::

:::exercise{level=2}
Relacione cada saída com o seu destino.

- PDF/X -> A gráfica
- EPUB -> Um leitor digital
- SCORM -> Um curso numa plataforma de ensino
:::

## Doze tipos

O Postext conhece doze tipos de exercício, o bastante para quase tudo o que um livro didático imprime: múltipla escolha e verdadeiro ou falso; lacunas, com ou sem banco de palavras, e escolhas dentro da linha; relacionar, classificar em grupos, ordenar itens ou as palavras de uma frase; marcar palavras num texto; perguntas abertas com linhas ou uma área pautada para escrever; caça-palavras e palavras cruzadas, cujas grades o motor monta a partir da lista de palavras; e contas armadas, para a aritmética. Os itens são embaralhados onde o tipo pede, sempre do mesmo jeito, para que o PDF, a tela e o gabarito concordem.

Um nível de dificuldade é impresso como pontos depois do número, ícones de atividade podem marcar os exercícios feitos em dupla ou em voz alta, e o primeiro item pode ser impresso já respondido, como modelo. A aparência de cada uma dessas coisas é um **estilo de exercício**: o selo do número, os rótulos das opções, o aspecto de uma lacuna, as pautas de uma área de escrita, o boxe em volta do exercício, tirado dos estilos de boxe do livro.

## Respostas e soluções

Todo exercício corrigível tem um **gabarito** montado a partir das suas respostas: a opção certa, as lacunas em ordem, os pares. Um bloco \`:::solution\` dentro de um exercício acrescenta uma solução comentada em qualquer Markdown. Onde elas são impressas é uma configuração do livro inteiro: em lugar nenhum, logo depois de cada exercício, de cabeça para baixo embaixo dele como nos livros de passatempos, no fim do capítulo, num ponto do capítulo que as pede ou num capítulo de respostas no fim do livro. Este guia guarda as suas respostas para a tela.

Um **livro do professor** é o mesmo livro com uma configuração mudada: cada resposta impressa no seu lugar, na cor de uma caneta de correção, lacunas preenchidas, opções circuladas, linhas de relacionar traçadas.

## Na tela

Na visualização HTML e num EPUB, os exercícios podem ser respondidos. O leitor digita nas lacunas, marca opções e traça as linhas de relacionar, depois confere as respostas, pede uma dica, vê a solução ou começa de novo. As respostas certas e erradas são marcadas com uma cor e um sinal e anunciadas aos leitores de tela, e as respostas ficam guardadas no navegador, de modo que o leitor as encontra de novo na próxima visita.

:::callout{type="try"}
Abra a visualização HTML neste capítulo e responda aos três exercícios. Confira as respostas e depois passe para a visualização PDF: os mesmos exercícios, compostos para o lápis do aluno.
:::

## Cursos

:index{term="SCORM"}Um livro com exercícios pode virar um curso. A visualização **SCORM** do Sandbox empacota os capítulos e as seções que você escolher num pacote SCORM, o formato que plataformas de ensino como o Moodle leem. Cada parte do livro que a plataforma acompanha informa uma nota, tirada dos exercícios respondidos certo, se está concluída, com cada página vista e cada exercício conferido, e se foi aprovada, segundo uma nota mínima que o livro define. Uma avaliação pode limitar quantas vezes um exercício é conferido, quantas vezes recomeça e quando a sua solução aparece.

O pacote leva o livro como a visualização HTML o mostra, diagramado pelo mesmo motor, de modo que o curso se parece com o livro impresso que os alunos têm sobre a mesa.

:::part{number="IV" title="Na prática" palette="band=#c0452f"}
12. Escrever para o Postext
13. O Sandbox
14. Saída: canvas, HTML, PDF e EPUB
15. Da prova à gráfica
16. O livro em 3D
17. Ferramentas em torno do motor
18. Roteiro e comunidade
:::

# Escrever para o Postext {lead="Tudo neste livro foi escrito em Markdown comum, com um punhado de extensões. Elas continuam legíveis em qualquer editor de texto e dizem o que o texto é, nunca onde ele vai." summary="Markdown, diretivas, boxes e estilos de parágrafo"}

Os documentos do Postext são, antes de tudo, Markdown.:index{term="Markdown"} Quem sabe Markdown pode escrever para o Postext desde o primeiro dia; as extensões só aparecem onde um livro precisa de algo para o qual o Markdown nunca teve palavras.

## Markdown comum

Títulos de uma a seis cerquilhas, parágrafos, citações em bloco, listas com marcadores, numeradas e de tarefas (aninhadas com dois espaços por nível, até cinco níveis) e matemática em destaque entre cifrões duplos. No meio do texto, o negrito e o itálico de sempre, mais sobrescritos entre acentos circunflexos, como em 10^-8^, subscritos entre tis, como em H~2~O, matemática entre cifrões simples e barras invertidas para escrever caracteres literais.

Alguns detalhes merecem atenção. As linhas consecutivas de um parágrafo são unidas, então as quebras de linha do original nunca chegam à página; um parágrafo novo precisa de uma linha em branco. As listas toleram uma única linha em branco entre os itens, mas duas linhas em branco as encerram. As listas numeradas conservam o número com que começam, de modo que uma lista pode começar em 0 ou em 5. E um título pode forçar uma quebra de linha no seu texto com duas barras invertidas, o que só afeta os designs que imprimem o título em tamanho grande (aberturas e páginas de parte), enquanto os cabeços, o sumário e os marcadores do PDF o mantêm numa linha só.

Parte do Markdown fica de fora de propósito, porque um livro tem outras maneiras de dizer o mesmo: as imagens são recursos, e não figuras soltas no meio do texto; as tabelas são recursos com um modelo, e não tabelas de barras verticais; e o HTML bruto não significa nada numa página impressa. Os links funcionam na visualização HTML e no PDF, e o código no meio do texto, entre crases, é composto na fonte de código do livro, como a sintaxe citada neste livro.

## Diretivas e contêineres

Todo o resto se expressa com um pequeno vocabulário de diretivas, reunido em :ref{id="document-format"}. As diretivas de uma linha começam com três sinais de dois-pontos e agem no ponto onde aparecem. Os contêineres envolvem blocos entre uma linha de abertura com atributos e uma linha de fechamento com três sinais de dois-pontos; eles podem ser aninhados, e um contêiner que fica aberto é fechado no fim do capítulo, com um aviso.

Os valores dos atributos podem vir entre aspas duplas ou simples, ou sem aspas quando são uma única palavra, e uma chave sem valor é um indicador. Uma diretiva que o motor não conhece não é descartada em silêncio: ela é impressa como um parágrafo, para que nada desapareça, e o painel Verificações a aponta com o capítulo e a linha. O mesmo acontece com um estilo de boxe ou um estilo de parágrafo que a configuração não define. Os boxes, as notas de rodapé e o índice remissivo também se escrevem com diretivas, e têm um capítulo próprio, o :ref{id="boxes"}.

## Mencionar recursos

As referências merecem um olhar mais atento, porque é com elas que se escreve a maior parte do aparato de um livro. \`:ref{id="…"}\` imprime, por padrão, o rótulo abreviado e o número (_Fig. 5.1_ na edição brasileira deste livro) e incorpora o recurso na primeira vez que ele aparece. Um atributo \`style\` imprime só o número ou o rótulo completo, _Figura 5.1_; \`case\` passa o rótulo para minúsculas, maiúsculas ou inicial maiúscula, para que uma referência no começo de uma frase fique correta; e \`text\` imprime qualquer texto sem deixar de incorporar o recurso e criar o link para ele. Uma referência a um id que não existe imprime um ponto de interrogação e um aviso, de modo que as referências quebradas são encontradas antes de o livro ir para a gráfica.

\`::resource{id="…"}\`, numa linha própria, insere um recurso nesse ponto exato quando a posição dele diz _here_; caso contrário, conta apenas como uma menção. Este livro não o usa em lugar nenhum e deixa todas as figuras flutuarem, o que costuma ser a melhor escolha, já que o motor então encontra para cada uma um lugar perto da sua menção.

## Referências cruzadas e citações

:index{term="citações"}O mesmo \`:ref\` nomeia qualquer lugar do livro:index{term="referências cruzadas"} que leve um identificador: um título escrito \`## Method {#method}\`, um boxe aberto com \`{#id}\` ou uma expressão marcada \`[these words]{#key}\`. Ele imprime _seção 3.2_ ou _capítulo 4_, o título com \`style=title\` ou a página com \`style=page\`, e a página está certa porque o motor diagrama o livro de novo até ele se estabilizar. Cada uma dessas referências é um link no PDF, no HTML e nestas visualizações.

As obras são citadas como o Pandoc as escreve, \`[@garcia2020, p. 33]\` ou \`@garcia2020\` no meio da frase, com as referências nos metadados iniciais ou num bloco \`:::references\` de BibTeX. O estilo de citação é uma configuração, não uma propriedade do texto: APA, Chicago, MLA, IEEE, Vancouver, ISO 690, GB/T 7714 ou um estilo próprio, escolhido em Design › Citações, onde uma visualização mostra o resultado. A bibliografia vem depois do último capítulo, ou fica onde quer que se escreva \`:::bibliography\`. A citação de uma obra que não está nas referências é impressa como foi escrita e aparece entre os avisos.

## Matemática no original

A matemática é escrita em notação LaTeX. As fórmulas no meio do texto vão entre cifrões simples, no meio de uma frase; as fórmulas em destaque vão entre cifrões duplos, numa linha própria ou como um bloco de várias linhas. Um cifrão que deva ser impresso como cifrão é escapado com uma barra invertida. Uma fórmula que nunca é fechada, ou que o MathJax não consegue ler, é apontada no painel Verificações e substituída na página por um marcador vermelho, para que não chegue ao PDF sem ninguém perceber.

## Estilos de parágrafo

\`:::paragraphs{style="…"}\` aplica um estilo de parágrafo com nome aos parágrafos que envolve: uma epígrafe, uma dedicatória, uma bibliografia, um colofão. Um estilo pode mudar a família tipográfica, o corpo, a entrelinha, a cor, o alinhamento (inclusive centralizado e à direita), o recuo e o espaçamento. O colofão no verso da capa deste livro é um deles.

## Escrever bem para o motor

Alguns hábitos facilitam o trabalho do motor e melhoram as páginas. Apresente cada lista com uma frase, para que a lista nunca seja a primeira coisa sob um título; o painel **Verificações** pode apontar as que são. Mantenha os títulos em ordem, sem pular níveis. Mencione cada figura e cada tabela no texto, perto de onde você as quer: a menção decide para onde o recurso pode ir e que número recebe. Deixe a posição por conta da configuração, a menos que um recurso realmente precise de uma posição própria. E escreva um texto alternativo para cada figura, porque o PDF acessível o oferece aos leitores que não podem ver a imagem.

## Metadados iniciais

Os metadados de um livro ficam num bloco YAML no início do seu primeiro capítulo: título, subtítulo, autor e data de publicação, disponíveis como marcadores em todos os blocos de design. A capa deste livro imprime dali o título e o subtítulo. Qualquer outra chave é guardada para a aplicação que hospeda o motor; os metadados dos capítulos seguintes são ignorados, com um aviso.

# O Sandbox {lead="O Sandbox é o motor com um editor em volta: a página que você está lendo, o Markdown de onde ela saiu e cada configuração que lhe deu forma, lado a lado e ao vivo." summary="O editor, os painéis, projetos, predefinições e compartilhamento"}

Tudo o que este livro descreve pode ser experimentado agora mesmo, sem escrever código. O Sandbox não é uma demonstração construída sobre o Postext; é o próprio motor, numa interface pensada para dois públicos ao mesmo tempo: quem desenvolve e está avaliando a biblioteca, e quem desenha e quer ver o que cada opção faz.

## Um passeio pela interface

:index{term="Sandbox"}A interface segue a disposição de um editor conhecido, esboçada em :ref{id="sandbox-ui"}. Uma **barra de atividades** à esquerda alterna entre sete painéis: Livros, Capítulos, Texto, Recursos, Fontes, Design e Verificações, este último com o número de pendências em aberto. Uma **barra lateral** redimensionável abriga o painel ativo; clicar no ícone ativo a recolhe. A **área de visualização**, à direita, mostra a mesma diagramação em seis abas: Canvas, PDF, Folio, HTML, EPUB 3 e SCORM. A interface está em inglês, espanhol, catalão, francês, alemão, italiano, português do Brasil, chinês simplificado, japonês e árabe, e em árabe corre da direita para a esquerda; uma opção de botões e campos grandes deixa cada controle mais fácil de alcançar com o dedo ou com uma mão pouco firme.

A barra lateral e a área de visualização dividem a janela, e a fronteira entre elas pode ser arrastada. Cada painel e a área de visualização lembram o seu estado entre uma visita e outra: o zoom e o modo de exibição do canvas, o modo de colunas da visualização HTML, os grupos abertos no painel Design. O tema e o idioma da interface são trocados no pé da barra de atividades, e o idioma da interface é independente do idioma do livro.

## Editar um livro

O editor do painel **Texto** destaca os metadados e a matemática, e sua barra de ferramentas insere formatação, listas, quebras de página e mudanças de numeração. No alto dele, um **seletor de capítulos** percorre os capítulos do livro e mostra as páginas de cada um; cada capítulo guarda o próprio histórico de desfazer e a posição do cursor. Editor e páginas andam juntos nos dois sentidos: clicar numa palavra da página leva o cursor até ela no Markdown, e selecionar um texto o destaca na página. O painel **Capítulos** mostra o livro aberto como um todo, com os capítulos em ordem e as páginas de cada um.

O editor também fica de olho no livro inteiro. O menu de capítulos lista cada capítulo com as páginas que ele ocupa assim que elas são conhecidas, e passar para outro capítulo leva as visualizações até ele. Os capítulos podem ser criados, renomeados, reordenados, divididos nos seus títulos de primeiro nível ou fundidos com o anterior, e o capítulo inteiro pode ser exportado como arquivo Markdown ou substituído por um.

## Configuração

O painel **Design** edita a configuração inteira (mais de quinhentos campos) por grupos: página e colunas, sistema de escrita, cores, tipografia, títulos e sumário, listas, figuras e tabelas, boxes, exercícios, quadrinhos, cabeçalhos e rodapés, partes, exportação, Folio (o livro em 3D) e configurações de nível avançado. Uma caixa de busca encontra qualquer opção pelo nome, e o filtro **Alteradas** mostra o que difere dos valores padrão. Cada campo e cada seção podem ser restaurados separadamente, e a configuração pode ser exportada e importada como arquivo. Num livro com vários idiomas, uma chave no alto do painel escolhe entre as configurações que todas as edições compartilham e as da edição que está na tela, como explica o :ref{id="languages"}.

## As seis visualizações

A visualização **canvas** é a de trabalho: vai de um quarto do tamanho real até quatro vezes, ajusta a página à largura ou à altura da área de visualização e mostra páginas avulsas ou páginas duplas, com a primeira página sozinha como página ímpar, do jeito que um livro impresso abre. A visualização **PDF** gera um PDF de verdade no navegador e o mostra no visualizador do próprio navegador, com botões para gerá-lo de novo, baixá-lo e imprimi-lo. A visualização **Folio** mostra o livro encadernado e aberto sobre uma mesa, em três dimensões, com folhas que viram sob a mão; ela tem um capítulo próprio, _O livro em 3D_. A visualização **HTML** mostra a mesma diagramação como HTML posicionado, isolado do resto da página, com um controle do tamanho do texto e dois modos de leitura: uma coluna única com rolagem, ou tantas colunas quantas couberem na tela. A visualização **EPUB 3** escreve o livro como e-book, no navegador, num de dois layouts: o **layout fixo** conserva as páginas impressas linha por linha, com texto de verdade que pode ser selecionado e pesquisado; o livro **refluível** deixa o texto se adaptar à tela e ao tamanho de letra de quem lê. Um pequeno leitor dentro da aba mostra o arquivo que você vai baixar: as setas do teclado, um deslizar do dedo no celular ou os botões viram as páginas, uma lista salta para qualquer capítulo, e um livro refluível pode ser lido com letra maior ou menor. A visualização **SCORM** transforma num curso para uma plataforma de ensino como o Moodle os capítulos e as seções que você marcar numa árvore do livro, com páginas fixas ou texto refluível; os exercícios enviam as notas para a plataforma.

As visualizações Canvas, HTML e Folio podem diagramar o capítulo atual ou o livro completo; o PDF tem a sua própria escolha, de modo que um único capítulo pode ser revisado rapidamente enquanto as visualizações mostram o livro; o EPUB e o pacote SCORM são sempre diagramados a partir do livro completo. Este guia abre no modo de livro completo. Um livro composto na vertical, como a edição chinesa deste guia, só pode ser lido página a página na visualização HTML, porque numa única coluna com rolagem as suas linhas ficariam deitadas.

## No celular

Abaixo da largura de um tablet, o Sandbox se reorganiza. A barra de painéis vai para o pé da tela, um painel aberto cobre a visualização em vez de ficar ao lado dela, e ao fechar o painel a visualização continua na página que mostrava. As barras de ferramentas das visualizações se encaixam ao longo da borda inferior, onde o polegar alcança, e passam para uma segunda fileira quando a tela é estreita. Um celular não consegue mostrar um PDF dentro de uma página, então a visualização PDF oferece abrir o arquivo; e como um celular dá a uma aba do navegador menos memória do que um livro em três dimensões precisa, a visualização Folio fica de fora ali.

## Recursos e fontes

O painel **Recursos** lista os recursos do livro por tipo. Imagens e arquivos SVG podem ser arrastados para dentro dele, as tabelas são editadas num editor parecido com uma planilha, com células mescladas, preenchimentos, imagens, larguras de coluna e colagem a partir de uma planilha, e o texto de um diagrama SVG pode ser editado no lugar. Clicar numa legenda, numa nota, numa célula ou no texto de um diagrama na visualização abre o item no painel. O painel Fontes acrescenta famílias próprias, peso a peso, nos formatos de web e de desktop habituais; uma família personalizada tem prioridade sobre uma Google Font de mesmo nome.

Cada recurso tem uma visualização de detalhe com o id, o tipo, a legenda, a nota e o texto alternativo, a posição (lugar, extensão, rotação, largura, alinhamento e uma legenda ao lado) e uma prévia ao vivo. Excluir um recurso gera um aviso quando o texto ainda o menciona. O painel Fontes, por sua vez, verifica se cada família que a configuração nomeia tem os pesos e estilos de que precisa, e avisa sobre variantes que faltam ou estão duplicadas.

## Avisos

O painel **Verificações** lista tudo o que o motor notou ao compor o livro: fontes que não carregaram, linhas frouxas, níveis de título pulados, contêineres sem fechamento e diretivas desconhecidas, estilos que não existem, marcadores que não imprimem nada, recursos que faltam e boxes altos demais para a sua coluna. Cada aviso indica o capítulo e a linha, e clicar nele leva até lá.

## Projetos, predefinições e compartilhamento

O seu trabalho é salvo no navegador enquanto você digita. Os **projetos** são livros guardados localmente, listados em **Meus livros** no painel **Livros**, cada um com nome, descrição e imagem de capa; eles podem ser duplicados, exportados e importados. As **predefinições** são livros somente leitura de onde partir, listados em **Livros de exemplo**: este guia e uma galeria de edições de demonstração (uma revista de astronomia, um _Dom Quixote_ ilustrado, uma revista de meio ambiente, um catálogo de exposição, dois livros didáticos universitários, _O sonho do pavilhão vermelho_ em chinês, _As mil e uma noites_ em árabe, encadernado pela direita, e um _Paraíso perdido_ anotado com as gravuras de Doré), cada uma com um design próprio. **Fazer minha própria cópia** transforma uma delas num projeto seu.

As predefinições acompanham a sua origem. Quando o pacote de uma predefinição muda no servidor, o Sandbox percebe em poucos segundos: uma predefinição que você não tocou é recarregada sozinha, e uma que você editou mostra um aviso que oferece recarregá-la, de modo que o trabalho em andamento nunca é sobrescrito. As predefinições podem ser ocultadas da lista e mostradas de novo, e cada uma pode ser aberta em qualquer um dos seus idiomas quando tem mais de um, como este guia, que está em inglês, espanhol, catalão, francês, alemão, italiano, português do Brasil, chinês simplificado, árabe e japonês.

Um livro viaja como um único arquivo **.postext**: seus capítulos, configuração, recursos e fontes, mais a paginação já calculada, de modo que ele abre paginado. As receitas da seção Receitas abrem no Sandbox do mesmo jeito, como livros seus; uma receita que você já abriu antes pergunta se você quer **Abrir minha cópia**, com as suas alterações, ou **Substituir pela versão publicada**, que pode ter sido corrigida desde então. E a barra de endereços sempre guarda um link permanente para o que você está vendo: o livro, o idioma, a visualização, o capítulo e a página.

:::callout{type="try"}
Role até uma página de que você goste e copie o endereço do navegador: abrir esse link mostra o mesmo livro, na mesma visualização, na mesma página.
:::

## Incorporar o Sandbox

O próprio Sandbox é um pacote, _postext-sandbox_, um componente React que qualquer aplicação web pode incorporar. A aplicação que o hospeda decide o Markdown e a configuração iniciais, o idioma da interface e cada rótulo, as origens das predefinições que ele oferece, e o seletor de tema, o seletor de idioma e o link para a página inicial que ele mostra. Os rótulos que ela deixa sem traduzir mantêm o texto original, em inglês. Tudo o que o leitor salva fica no navegador dele, no armazenamento daquele site: o componente não precisa de um servidor próprio. E a diagramação roda num _worker_, de modo que a página que o hospeda continua respondendo enquanto o livro é composto. O Sandbox que você está usando é exatamente esse componente, incorporado no site do Postext.

# Saída: canvas, HTML, PDF e EPUB {#output lead="Uma árvore, quatro saídas. O canvas mostra a prévia, o HTML se lê na tela, o PDF vai para a gráfica e o EPUB vai para o aparelho de quem lê, e todos são escritos a partir da mesma diagramação." summary="Os renderizadores, o PDF acessível, os livros EPUB e o uso da biblioteca"}

Como todos os renderizadores leem a mesma VDT, a promessa _o que você vê é o que você obtém_ vale ao pé da letra: as quebras de linha, os limites de página e a posição de cada figura coincidem no canvas, no HTML e no PDF, e um EPUB de layout fixo também os conserva. Um EPUB refluível abre mão da página de propósito e conserva todo o resto que a diagramação resolveu: os números, as notas, as referências e os fólios impressos. A skill para agentes que traz livros existentes para o Postext confere o próprio trabalho com essas saídas, como mostra :ref{id="skill-tutorial"}.

## Canvas

O renderizador de canvas desenha uma página num canvas HTML, em qualquer resolução. No Sandbox, ele é a prévia ao vivo, com zoom, ajuste à largura ou à altura, páginas avulsas ou páginas duplas, e páginas desenhadas sob demanda à medida que entram na tela, de modo que os livros longos continuam respondendo.

As imagens dos recursos são registradas no renderizador uma única vez, pelo id do arquivo, e reutilizadas em todas as páginas. As páginas podem ser desenhadas em qualquer canvas, em qualquer escala, o que torna o mesmo renderizador útil para miniaturas, prévias de impressão e exportação como imagem: os exemplos ao vivo da documentação desenham uma página e a transformam num PNG.

## HTML

O renderizador HTML devolve HTML com posicionamento absoluto e CSS editorial: cada linha onde a diagramação a pôs, com a fonte, o corpo e a linha de base exatos. Uma variante indexada informa à aplicação que o hospeda quais partes da página mudaram, para que um visualizador atualize só essas. No Sandbox, a aba HTML isola a saída num Shadow DOM e acrescenta um modo de leitura com uma única coluna com rolagem ou tantas colunas quantas couberem na tela, com um controle de escala da fonte. Um conjunto de ajustes só para a tela pode adaptar o design à leitura na tela sem tocar nas páginas impressas.

O renderizador recebe uma função que transforma o id de arquivo de um recurso numa URL, para que as imagens possam ser servidas de qualquer lugar, e uma cor de fundo para a página. A saída dele é marcação e CSS simples, sem nenhum script, o que a torna adequada para hospedagem estática, prévias de e-mail ou armazenamento no servidor depois que a diagramação foi calculada num navegador.

## PDF

:index{term="PDF"}O pacote _postext-pdf_ transforma a VDT num PDF de verdade, de um documento ou de um livro inteiro. Ele nunca mede de novo: as métricas do canvas são a fonte da verdade e o PDF apenas as transporta, e é por isso que as linhas quebram exatamente nos mesmos lugares. Ele incorpora fontes reais, uma fonte estática por peso, então o negrito é negrito e o itálico é itálico, e o texto continua selecionável. Por cima das páginas, acrescenta marcadores a partir dos títulos e das partes, rótulos de página que coincidem com os fólios impressos, referências clicáveis, figuras SVG como vetores e uma escolha de espaço de cor (RGB, CMYK ou escala de cinza) para a impressão.

As fontes chegam ao PDF por meio de um **provedor de fontes**, uma função que devolve os bytes de uma família num peso e num estilo determinados. O provedor do Sandbox baixa fontes estáticas da Fontsource, um arquivo por peso, e as descomprime do WOFF2; as fontes personalizadas vêm dos arquivos carregados no painel Fontes. Num servidor, o provedor pode ler esses mesmos arquivos direto do disco. Os bytes dos recursos são entregues da mesma maneira, pelo id do arquivo. A renderização informa o seu progresso, roda num worker próprio quando isso é pedido e aceita um livro inteiro como uma lista de documentos de capítulo, produzindo um único PDF com rótulos de página contínuos, marcadores e links que levam de um capítulo a qualquer outro.

## Acessível por padrão

:index{term="PDF!acessível (PDF/UA)"}Todo PDF sai **etiquetado** por padrão, seguindo a norma PDF/UA-1: uma árvore de estrutura com títulos, parágrafos, listas, tabelas e figuras em ordem de leitura, texto alternativo para cada figura, o idioma do documento e os elementos decorativos marcados como artefatos, para que os leitores de tela os pulem. A acessibilidade não é uma opção de exportação que se precisa lembrar de ligar; é o modo como o arquivo é feito.

A etiquetagem segue a diagramação, e não o original. Os parágrafos divididos entre colunas e páginas são etiquetados como um único parágrafo, as listas mantêm seus itens juntos, as tabelas conservam suas células de cabeçalho e as figuras levam o seu texto alternativo (ou a sua legenda, ou o seu rótulo, quando não se escreveu texto alternativo). O título e o idioma do documento viajam nos metadados, os cabeços e os ornamentos de página são marcados como artefatos, e as referências entre o texto e as figuras que ele menciona são links de verdade.

## Cor para impressão

As cores da configuração são escritas como valores hexadecimais, vinculados ou não à paleta, e é isso que o PDF desenha por padrão. Um PDF também pode ser forçado a CMYK, para impressão offset, ou à escala de cinza, para trabalhos a uma cor, e um livro preparado para a gráfica vai além: um perfil ICC, PDF/X, um preto que sai numa única tinta e um preflight de cada página. Tudo isso é o assunto do :ref{id="press"}.

## Livros inteiros

O PDF de um livro não é uma concatenação de arquivos separados. O renderizador recebe a diagramação de cada capítulo e escreve um único documento: os rótulos de página continuam de um capítulo para o outro, os marcadores formam uma única árvore com as partes acima dos seus capítulos, e a estrutura acessível do livro inteiro é uma única árvore em ordem de leitura. Como cada capítulo foi diagramado como continuação dos anteriores, as páginas do capítulo sete no PDF do livro são exatamente as páginas do capítulo sete impresso sozinho.

O Sandbox oferece as duas coisas: a visualização PDF pode alternar entre o capítulo atual, para provas rápidas, e o livro completo, para o arquivo final. Gerar o livro inteiro leva mais tempo, por isso roda no worker de PDF e informa o progresso página por página.

## Fontes no PDF

Um PDF vale o que valem as fontes que leva dentro. O Postext incorpora cada fonte que a diagramação usou (um arquivo estático por peso e estilo), de modo que uma palavra em negrito sai no negrito real e uma em itálico no itálico real, nunca numa imitação inclinada ou engrossada. As fontes TrueType são reduzidas aos glifos que o livro realmente usa, o que mantém os arquivos pequenos mesmo com quatro famílias; as fontes OpenType com contornos PostScript são incorporadas inteiras, porque alguns visualizadores não sabem ler os subconjuntos delas. Cada fonte incorporada leva um mapa dos glifos de volta para os caracteres, ligaduras incluídas, de modo que copiar uma frase do PDF devolve a frase que foi escrita, e uma busca no documento encontra todas as palavras.

As famílias vêm de onde o Sandbox as encontrou. As Google Fonts são baixadas fonte a fonte da Fontsource e descomprimidas na hora; as famílias enviadas pelo painel Fontes são incorporadas a partir dos arquivos que você forneceu. Uma família disponível só em WOFF não é aceita no PDF, porque esse formato não pode ser incorporado com segurança; arquivos WOFF2, TrueType e OpenType funcionam.

## EPUB 3

:index{term="EPUB"}O pacote _postext-epub_ escreve um livro diagramado como arquivo EPUB 3, o formato das lojas de e-books, das bibliotecas e dos aplicativos de leitura. Ele lê os mesmos documentos de capítulo que o PDF de um livro inteiro, então os fólios, as notas, as citações, as referências cruzadas, o sumário e o índice remissivo chegam resolvidos, e devolve o arquivo como bytes, no navegador ou no Node, sem servidor. O EPUB define duas versões de apresentação, comparadas lado a lado em :ref{id="epub-renditions"}, e o gerador produz qualquer uma das duas a partir da mesma diagramação.

O **layout fixo** conserva a página impressa. Cada página vira um documento próprio, do tamanho da página, com o texto onde o PDF o coloca e nas fontes do próprio livro, de modo que as colunas, os flutuantes, os cabeços, as aberturas e todas as quebras de linha se mantêm. O texto continua sendo texto: pode ser selecionado, pesquisado e lido em voz alta, e os links do livro funcionam entre as páginas (referências cruzadas, notas, o sumário impresso e o índice remissivo). As páginas duplas se formam como no papel, e um livro encadernado pela direita, em árabe ou em chinês vertical, vira as páginas da direita para a esquerda. Ele serve para livros cujas páginas foram desenhadas como páginas, como um livro ilustrado, um livro didático, um catálogo ou uma revista, lidos numa tela grande; num celular, a página é reduzida e o leitor precisa ampliá-la para ler.

## Livros refluíveis

Um livro **refluível** abre mão da página e conserva o texto. Cada capítulo vira um documento que o sistema de leitura compõe de novo para a sua tela, na família tipográfica, no tamanho e nas margens que o leitor escolhe. O gerador não volta ao Markdown: ele reconstrói cada parágrafo a partir das linhas que o motor compôs, retirando os hífens que as quebras de linha acrescentaram e mantendo os que pertencem à palavra, de modo que um parágrafo dividido entre duas colunas ou duas páginas volta a ser um único parágrafo. As figuras e as tabelas acompanham o texto que as cita, com as legendas numeradas e o texto alternativo; as tabelas continuam sendo tabelas de verdade, com linhas de cabeçalho e células mescladas; os boxes viram blocos laterais (asides) com os seus títulos; e as notas levam ao fim do capítulo e voltam. Cada página impressa deixa uma marca onde começa o seu texto, para que um leitor possa encontrar a página 112 da edição impressa, e o índice remissivo aponta para essas marcas.

A aparência vem da configuração. Uma folha de estilos derivada dela dá aos títulos, boxes, tabelas, legendas e listas os seus tamanhos e cores, relativos ao texto corrido, para que o tamanho escolhido pelo leitor valha para tudo. Os parágrafos compostos com um estilo de parágrafo o conservam, porque a diagramação registra qual estilo compôs cada bloco, e os níveis do índice remissivo se distinguem do mesmo modo; um capítulo configurado de outra maneira, ou uma parte que muda as cores do livro, acrescenta uma segunda folha só com as regras que mudam. Uma citação em destaque repete palavras do texto, por isso é mostrada mas fica oculta para os leitores de tela e para a leitura em voz alta, e as suas palavras são lidas uma única vez. O chinês vertical conserva as suas linhas verticais, e um livro árabe corre da direita para a esquerda.

As duas versões levam a mesma navegação: um sumário a partir dos títulos e das partes, uma lista dos fólios impressos e pontos de referência para a capa, o sumário impresso e o começo do texto. Toda família que o design nomeia é incorporada, a menos que esteja marcada como não redistribuível, e cada imagem entra uma única vez. As duas levam os metadados do EPUB Accessibility 1.1, e as duas passam no EPUBCheck do W3C, o validador que as lojas de e-books aplicam aos arquivos que recebem, sem erros e sem avisos, tanto este guia quanto todos os livros de exemplo. No Sandbox, a aba **EPUB 3** escreve o arquivo num worker, para que a página continue respondendo enquanto um livro longo é escrito. O que o arquivo não consegue levar, como uma imagem sem arquivo guardado, aparece entre os avisos dele.

## Escolher uma saída

As quatro saídas compartilham a diagramação, mas servem a momentos diferentes da vida de um livro. O **canvas** é a visualização de trabalho: rápida, fiel, e a que o Sandbox mantém aberta enquanto você escreve e desenha. O **HTML** serve para ler na tela e para publicar dentro de uma aplicação web: as mesmas páginas como marcação posicionada, ou o texto refluído nos modos de leitura do visualizador, isolado dos estilos da página em volta. O **PDF** é o artefato acabado: o arquivo que vai para a gráfica, para um arquivo de guarda ou para o aparelho de um leitor, etiquetado, com marcadores e pesquisável. O **EPUB** é para os leitores de e-books e para as lojas: layout fixo quando o que importa é a página, refluível quando o que importa é o texto.

Nada obriga a escolher entre elas. Um livro pode ser escrito no Sandbox com o canvas aberto, revisado no visualizador HTML por alguém que lê no celular e enviado na mesma tarde à gráfica como PDF e a uma loja de e-books como EPUB, a partir do mesmo original e da mesma configuração, sem que nenhuma saída se afaste das outras. Nenhuma dessas saídas pede uma nova diagramação: todas leem a mesma VDT, e só o desenho final muda de uma para outra.

## Usar a biblioteca

O motor é distribuído no npm como _postext_, para a diagramação e os renderizadores de canvas e HTML, com um pacote para cada saída mais pesada: _postext-pdf_ para o PDF, _postext-epub_ para o EPUB 3 e _postext-folio_ para o livro em 3D. Todos são módulos ES sob a licença MIT e também podem ser importados diretamente de uma CDN. A documentação traz exemplos ao vivo que renderizam uma página como imagem, como HTML e como PDF, prontos para copiar e modificar.

O motor de diagramação roda no navegador, onde pode medir com as fontes que o leitor vê; _postext-pdf_ e _postext-epub_ também rodam no navegador, e além disso no Node, de modo que um PDF ou um EPUB pode ser produzido num servidor a partir de uma diagramação calculada em outro lugar. Um livro inteiro viaja do mesmo jeito: \`openBundle\` lê um arquivo .postext, \`buildBundle\` diagrama os seus capítulos em ordem, e o resultado vai direto para \`renderToPdf\` ou \`renderToEpub\`. Os pacotes são apenas módulos ES, com os tipos de TypeScript incluídos, e alguns empacotadores precisam de uma configuração de uma linha para o decodificador de WOFF2 que o pacote de PDF usa. A documentação percorre todo o caminho, da instalação dos pacotes ao primeiro PDF, e nenhuma etapa dele precisa do Sandbox.

:::callout{type="note" title="Quatro passos"}
1. Carregue as fontes que a configuração nomeia, para que o navegador possa medi-las
2. Construa o documento com \`buildDocument(content, config)\`
3. Desenhe as páginas com \`renderPage\` ou renderize-as com \`renderToHtml\`
4. Para impressão, passe o mesmo documento para \`renderToPdf\` com um provedor de fontes; para e-books, passe os capítulos para \`renderToEpub\`
:::

O motor e o seu renderizador de PDF são lançados juntos, com o mesmo número de versão, para que os dois sempre concordem sobre a forma da diagramação que compartilham. O gerador de EPUB e o visualizador Folio têm números de versão próprios e declaram o motor como dependência de par (peer dependency), de modo que um projeto os atualiza juntos.

## Páginas como imagens, a partir de um script

Uma página não precisa de um navegador para virar imagem. O renderizador de canvas desenha em qualquer canvas que fale a interface de desenho do navegador, e no Node um canvas pré-compilado faz isso: diagrama-se o livro, desenha-se a página e codifica-se o resultado como JPEG ou PNG. É assim que a skill para agentes que porta livros para o Postext examina o próprio trabalho. Depois de cada mudança na configuração ou no texto, ela diagrama o livro de novo, desenha só as páginas em que está trabalhando e as lê como imagens, em um ou dois segundos, sem gerar nenhum PDF. O PDF é gerado no fim, para as verificações que só um PDF pode responder: fontes incorporadas, imagens na sua resolução, a estrutura etiquetada.

:ref{id="skill-tutorial"} mostra a skill do começo ao fim: ela recebe o PDF de referência, as fontes e as ilustrações originais, propõe uma ficha de especificações, compõe o primeiro capítulo e confere cada página que compõe.

# Da prova à gráfica {#press lead="Uma gráfica faz perguntas diferentes das de um leitor. Cada imagem tem nitidez suficiente no tamanho em que será impressa, o preto do texto usa uma única tinta, a arte passa da linha de corte? O Postext as responde antes de o arquivo sair do navegador." summary="Verificações, contraste, cor ICC, PDF/X, preto e preflight"}

Um livro fica pronto duas vezes. Fica pronto para o leitor quando o texto está certo e as páginas têm a aparência que devem ter; fica pronto para a gráfica quando o arquivo obedece às regras da máquina que vai imprimi-lo. O primeiro se julga na tela, o segundo num departamento de pré-impressão com uma lista de conferência. O Postext guarda as duas listas no mesmo lugar, para que um problema apareça enquanto ainda há tempo de corrigi-lo no Markdown ou na configuração, e não num telefonema da gráfica.

## O painel Verificações

:index{term="painel Verificações"}Tudo o que o motor nota é reunido no painel **Verificações**, na ordem em que um editor de produção trataria cada coisa: primeiro as fontes, depois figuras e tabelas, texto e marcação, design, contraste, composição, preflight e o navegador. Cada entrada indica o capítulo e a linha, e clicar nela leva até lá; quando nada está errado, o painel diz _Tudo certo_. Quais verificações rodam é uma configuração, em Design › Avançado › Avisos, para que um livro possa silenciar um aviso que aceita de propósito.

Algumas verificações tratam do texto: uma linha frouxa, um nível de título pulado, uma diretiva desconhecida, um boxe alto demais para a sua coluna. Outras tratam do design e vêm das **regras de composição**, descritas no :ref{id="columns"}, que uma configuração define como _allow_, _warn_ ou _avoid_. Uma regra em _warn_ deixa a página em paz e acrescenta uma entrada; em _avoid_, o motor muda a página e nada é apontado.

## Contraste

:index{term="contraste"}A cor numa página é questão de legibilidade antes de ser questão de gosto. A verificação de contraste mede cada par de cores de texto e de fundo que o livro usa, inclusive o texto dos boxes, das legendas, dos cabeços e dos blocos de design, e aponta os pares abaixo do nível pedido: AA ou o AAA, mais exigente, das diretrizes de acessibilidade. Ela pode julgar as cores como uma tela as mostra, como elas vão sair impressas, ou das duas maneiras. No painel Design, cada campo de cor mostra o seu contraste mais baixo ao lado da amostra, para que uma mudança de paleta mostre o seu custo antes de qualquer coisa ser diagramada.

A impressão acrescenta um problema que a tela nunca tem. Um texto branco vazado numa faixa escura é impresso como a ausência de quatro tintas sobrepostas, e os traços finos se fecham quando o registro da impressora sai um fio do lugar. A verificação aponta o texto vazado pequeno ou fino demais para a gráfica, o tipo de defeito que parece bem num monitor e se fecha no papel.

## Cor que uma gráfica entende

Uma tela mistura luz; uma impressora deposita tinta. As cores de uma configuração são escritas para a tela, e no caminho para a gráfica precisam ser convertidas nas quatro tintas da condição de impressão: um papel, uma impressora, uma norma. Essa conversão é o que um **perfil ICC** descreve:index{term="perfis ICC"}, e o Postext traz quinze deles, do FOGRA39 e do FOGRA51 para papel couché na Europa ao GRACoL e ao SWOP para a América do Norte, com o FOGRA39 como padrão. Uma editora com um perfil próprio pode enviar o arquivo e nomear a sua condição de impressão.

A conversão é feita pelo próprio Postext, no navegador, com uma intenção de renderização, relativa ou perceptiva, e compensação do ponto preto. As imagens também podem ser convertidas, de modo que uma fotografia no PDF já está nas tintas da gráfica, e um **limite de tinta** restringe a cobertura total das quatro tintas onde o papel não secaria. As configurações de impressão nunca movem uma linha: a diagramação as ignora, e elas só atuam no PDF, na simulação de impressão e no preflight.

## PDF/X

As gráficas pedem **PDF/X**:index{term="PDF!PDF/X"} porque ele elimina as suposições. Um arquivo PDF/X diz para que condição de impressão foi feito, incorpora todas as fontes, leva as suas caixas de refile e de sangria e deixa de fora tudo o que uma impressora não pode usar, como os links. O Postext escreve as duas versões que as gráficas mais pedem. O PDF/X-1a é o conservador: só as quatro tintas e o cinza, sem transparência. O PDF/X-4 conserva a transparência e é a escolha habitual hoje. Qualquer um dos dois é escolhido em Design › Exportação › Preparação para impressão, ou com a opção \`--pdfx\` da linha de comando.

Um livro para impressão também precisa de **sangria**:index{term="sangria"}: as imagens e as faixas que saem da página precisam passar alguns milímetros da linha de corte, para que uma lâmina um fio fora do lugar nunca deixe uma borda branca. As configurações de marcas de corte acrescentam a sangria e desenham as marcas nos cantos, na cor de registro, que sai em todas as chapas. Este guia é composto com sangria: a capa, as faixas dos capítulos e as páginas de parte passam da linha de corte.

## Preto

O preto é a cor que mais preocupa uma gráfica. O texto do corpo deve sair só na tinta preta, porque um texto composto em quatro tintas fica borrado assim que as chapas se desalinham. Os cinzas e os pretos podem ser mantidos só na tinta preta, e o preto chapado pode ser **sobreimpresso**, posto por cima do que está embaixo, para que nunca apareça um fio branco em volta de uma letra preta sobre uma faixa colorida. As grandes áreas de preto são o caso oposto: uma tinta sozinha parece desbotada, então um **preto composto** acrescenta:index{term="preto composto"} as outras três tintas por baixo, acima de um tamanho que o texto nunca alcança. O texto nunca vira preto composto.

## Preflight

:index{term="preflight"}Antes que um arquivo vá para a gráfica, a pré-impressão faz um **preflight**: uma leitura mecânica de cada página contra as regras do trabalho. O Postext faz o seu sempre que um livro está preparado para impressão, com uma norma PDF/X, um PDF em CMYK ou marcas de corte, e lista o que encontrou no painel Verificações, os itens críticos primeiro. Ele aponta imagens abaixo de 300 pixels por polegada no tamanho impresso, e abaixo de 150 como críticas; imagens que ainda estão em RGB; fios mais finos que um quarto de ponto; texto pequeno em várias tintas; tinta acima do limite; texto perto demais da linha de corte; arte que termina pouco antes da linha de corte, quando deveria ficar longe dela ou entrar na sangria; e, num PDF posicionado como imagem, fontes não incorporadas, cor RGB e transparência.

O mesmo preflight roda fora do Sandbox. O comando \`check\` da linha de comando sai com um código de erro quando encontra um problema crítico, para que um fluxo de publicação possa se recusar a mandar um arquivo que voltaria da gráfica.

:::callout{type="try"}
Abra Design › Exportação › Preparação para impressão, escolha PDF/X-4 e ative as marcas de corte. O painel Verificações ganha um grupo Preflight; a visualização PDF passa a desenhar a sangria e as marcas em volta de cada página.
:::

## Uma prova na tela

A **simulação de impressão** mostra:index{term="simulação de impressão"} as páginas como a gráfica vai imprimi-las. Cada cor é separada pelo perfil do trabalho e desenhada de volta sobre o branco do papel, pretos compostos incluídos; um livro em escala de cinza aparece só na tinta preta. As guias e os contornos desaparecem, e nada é diagramado de novo: a simulação só repinta. É uma chave na barra de ferramentas da visualização Canvas, compartilhada com a visualização Folio, onde as páginas também podem ser vistas no papel em que o livro vai ser impresso.

Nenhuma tela é uma prova contratual, e um livro que importa ainda merece uma prova impressa no papel certo. Mas a simulação pega cedo as surpresas mais comuns: um azul saturado que fica roxo em CMYK, um cinza claro que desaparece, uma faixa que parecia preta e sai de um marrom barrento.

## O PDF acessível e o impresso

O PDF para a gráfica e o PDF para os leitores podem ser o mesmo arquivo. A estrutura etiquetada que torna um PDF acessível, descrita no :ref{id="output"}, convive com as regras do PDF/X sem conflito; só os links ficam de fora, porque uma norma de impressão não os permite. Uma editora que queira os dois pode exportar o PDF duas vezes a partir da mesma diagramação, um para a gráfica e outro para a biblioteca, e cada linha vai cair no mesmo lugar nos dois.

# O livro em 3D {lead="Uma diagramação é um conjunto de páginas, mas um livro é um objeto: um papel de certa gramatura e cor, uma encadernação que abre de certo jeito, uma espessura que a mão sente. A visualização Folio mostra as páginas como esse objeto, antes de qualquer coisa ser impressa." summary="A visualização Folio, os papéis, as encadernações, as capas e a luz"}

As provas na tela são planas. Uma página dupla vista como dois retângulos não diz nada sobre como o livro vai ficar aberto sobre uma mesa: se a lombada engole a margem interna, se uma prancha em papel brilhante pega a luz, se trezentas páginas de papel creme formam um miolo grosso demais para a encadernação. A visualização **Folio** responde a essas perguntas com as páginas que o Postext já compôs. Ela mostra o livro encadernado, aberto sobre uma superfície, iluminado, com folhas que se curvam e viram sob a mão.

Nada nela é uma segunda diagramação. As páginas são as mesmas que o canvas pinta, desenhadas nos pixels exatos da tela, então o texto no Folio é tão nítido quanto na visualização Canvas e idêntico linha por linha. O que o Folio acrescenta é tudo o que fica em volta das páginas: o papel, a encadernação, as capas, a mesa e a luz. Tudo isso vem de uma parte da configuração, \`folio\`, que a diagramação nunca lê. Mudar o papel ou a encadernação redesenha o livro na hora e nunca move uma linha.

## Virar as páginas

:index{term="Folio"}Uma página se vira do jeito que se vira uma página: pegue-a pela borda e arraste-a para o outro lado. Solte-a depois da metade e ela cai do outro lado; solte-a antes e ela volta. Um clique numa página também a vira, para a frente na página da direita e para trás na da esquerda, e o mesmo fazem as setas da barra de ferramentas e, quando o livro tem o foco, as teclas de seta, Page Up e Page Down, Home e End. O campo de página da barra de ferramentas aceita um número de página e leva o livro até essa página dupla.

Cada folha se curva de acordo com o seu papel. O papel bíblia, fino, se enrola numa curva fechada e deixa ver o que está impresso do outro lado; o cartão vira num arco amplo; o papelão, como num livro cartonado para crianças pequenas, vira como uma placa rígida sobre a dobradiça. As capas também viram como papelão. Um salto de mais de dez páginas não as vira uma a uma: o bloco de páginas intermediário se levanta como uma peça só, tão grossa quanto essas páginas, e é pousado do outro lado.

A própria vista pode se mover. Arrastar com o botão direito do mouse gira em volta do livro, até um ângulo rasante, para ver a lombada, o corte da frente ou a espessura do miolo, e isso pode ser feito enquanto as folhas ainda estão virando. A vista fica onde foi deixada até que **Redefinir visualização** a traga de volta ao ângulo que as configurações definem. Numa janela estreita, o livro mostra uma página de cada vez e continua virando a folha por cima da lombada; quando o sistema pede movimento reduzido, as páginas duplas mudam sem a virada.

Três botões da barra de ferramentas escolhem o que o ponteiro faz sobre o livro: virar as páginas à mão, girar a vista, que é o que um trackpad ou um tablet precisa no lugar do arraste com o botão direito, ou selecionar texto. A seleção funciona nas páginas do jeito que elas são vistas, inclinadas ou giradas, como funciona na visualização Canvas: um clique põe o cursor do editor naquela palavra, um arraste seleciona, um clique duplo pega uma palavra e um link é seguido. Também funciona no sentido inverso: o cursor e a seleção do editor são desenhados nas páginas, e levar o cursor a uma página que não está à vista vira o livro até ela.

Os vídeos tocam na página. No modo de virar páginas, um clique no pôster de um vídeo o inicia ali mesmo, e ele continua tocando enquanto a folha vira. Outro clique o pausa, iniciar outro para o primeiro, e um vídeo para quando o livro se acomoda numa página dupla que já não o mostra. Vídeos do YouTube e do Vimeo não podem ser desenhados dentro de uma página: um clique num deles vira a folha.

:::callout{type="try"}
Abra a aba Folio com este guia, vire algumas páginas arrastando os cantos e depois gire o livro arrastando com o botão direito para ver a dobra grampeada. Redefinir visualização o traz de volta.
:::

## Papel

O papel é escolhido como um gráfico o encomendaria: pelo **tipo**, a espécie de papel, e pela **gramatura**, o seu peso em gramas por metro quadrado. Cada tipo traz os valores típicos dele, listados em :ref{id="paper-stocks"}, e qualquer um pode ser alterado separadamente: um papel para livro de 70 gramas em vez de 80, um offset não revestido num tom mais quente.

A espessura sai de dois números. O **volume específico** de um papel, em centímetros cúbicos por grama, diz quanto espaço um grama dele ocupa; a gramatura vezes o volume específico dá a **espessura** de uma folha, em micrômetros. O miolo de um livro é o seu número de folhas vezes essa espessura, e é por isso que as mesmas trezentas páginas fazem um volume fino em papel couché e um volume grosso em papel para livro de alto volume. O Folio conta o livro inteiro, então um capítulo mostrado sozinho continua entre as páginas anteriores e as seguintes, com a espessura real delas.

A superfície tem três ajustes. O **acabamento** diz se o papel é não revestido, com as suas fibras e sem brilho, ou couché e calandrado até ficar fosco, semibrilho ou brilho, que reflete o ambiente. A **textura** é o relevo: lisa, o grão fino do velino, a trama regular do papel uniforme (wove), as linhas do vergê, um linho gofrado ou as marcas irregulares do feltro; a intensidade dela pode ser diminuída ou aumentada. O **tom** é a cor do papel antes da impressão (branco, natural ou creme), e a **transparência** deixa o que está impresso no verso aparecer de leve no papel fino, cada vez menos à medida que o papel fica mais pesado e mais opaco.

## Encadernações e capas

Há cinco encadernações disponíveis. A **capa dura** tem capas de papelão um pouco maiores que as páginas. A **brochura colada** tem a lombada fresada e colada, e abre menos. A **brochura costurada** mantém os cadernos costurados sob uma capa mole e abre com mais facilidade. A encadernação de **abertura plana** abre por inteiro, sem que as páginas afundem em direção à lombada. O **grampo canoa** forma um livreto de folhas dobradas e grampeadas pela dobra, como uma revista ou um programa de teatro, e não tem lombada quadrada. Um livro grosso abre como abre um livro grosso, com a lombada em pé entre os dois blocos de páginas.

As capas vêm de um de dois lugares. Por padrão, o Folio desenha **uma capa dura em volta das páginas**, de tecido, cartão ou couro e na cor da capa. Quando o documento já traz as suas capas, como este guia, elas podem ser **as páginas do próprio documento**: a primeira página vira a capa e a última, quando cai numa página par, a quarta capa. O livro então fica fechado sobre a capa até que o leitor o abra, a capa vira como um papelão rígido, e virar a última folha fecha o livro de novo.

A lombada pode levar uma imagem. Qualquer imagem ou SVG do painel Recursos pode ser impressa nela, vista como se vê uma lombada numa estante, com a cabeça para cima e a capa à direita; ela é escalada para cobrir a lombada, então convém que deixe uma pequena folga nas bordas. Um livreto em grampo canoa não tem lombada onde imprimir. A imagem viaja com os recursos do livro no seu arquivo .postext, e aparece sempre que a vista é girada até a lombada.

## Pranchas em outro papel

Os livros muitas vezes mudam de papel por algumas páginas: um caderno de pranchas coloridas em couché num romance impresso em papel para livro, uma divisória de cartão, algumas folhas de papel colorido. No Postext, isso é um contêiner no texto:

:::callout{type="note" title="Um caderno de pranchas"}
\`:::paper{type=coatedGloss grammage=130}\` abre o trecho e \`:::\` o fecha. Tudo o que fica entre os dois é impresso nesse papel.
:::

Um papel ocupa folhas inteiras, então o conteúdo dentro do trecho começa numa página nova e o que vem depois dele também. Cada página composta dentro do trecho leva o seu papel na diagramação, e a visualização Folio desenha essas folhas com a cor, a superfície, a espessura e a rigidez desse papel; o canvas, o HTML e o PDF as compõem como qualquer outra página. Os atributos omitidos seguem o papel do livro, e um trecho dentro de outro só substitui o que define.

## A mesa e a luz

O livro fica sobre uma **superfície**: carvalho, nogueira, linho, feltro, couro, mármore, uma cor lisa ou nenhuma, o que deixa à mostra o fundo da página. Cada superfície é uma textura fotografada, e uma tonalidade muda a cor de qualquer uma delas. Cinco **luzes** montam a cena: estúdio, luz do dia, luminária de leitura, céu nublado e noite. Cada uma é um par: o ambiente que os papéis couché e brilho refletem quando uma folha vira, e uma luz principal que projeta as sombras do miolo e de uma página levantada sobre as páginas de baixo. A **exposição** clareia ou escurece a cena, e as sombras podem ser desativadas num computador lento. A **inclinação** define quanto a vista se afasta da visão de cima, até setenta graus, e o **giro**, quanto ela dá a volta no livro; Salvar como visualização padrão guarda os dois do jeito que você os vê.

Este guia está montado como um livreto em grampo canoa, em papel couché brilho de 170 gramas, sobre um feltro azul, com luz de estúdio. As suas capas são a sua própria primeira e última página, então ele abre na capa e se fecha quando a última folha vira. Tudo isso está no grupo **Folio** do painel Design, e nada nesse grupo muda uma única linha das páginas.

## Onde o Folio roda

O Folio desenha com WebGL2, os gráficos tridimensionais do navegador, com uma textura para cada lado de cada página pintada. Pintar só as páginas duplas em volta da que está aberta mantém a memória de um livro longo na de poucas páginas, mas um celular ainda dá a uma aba do navegador menos memória do que um livro precisa, então o Sandbox oferece a aba Folio em computadores e tablets e a deixa de fora nos celulares e nos navegadores sem WebGL2.

:::callout{type="note" title="No código"}
O visualizador é um pacote próprio, _postext-folio_, construído sobre o three.js. \`createFolioFromDocument(container, doc)\` mostra um documento diagramado como um livro; \`setDocument\` mostra a diagramação seguinte na mesma página, \`setAppearance\` muda o papel, a encadernação ou a luz, e \`resetView\` traz a vista de volta. \`createFolio\` faz o mesmo com quaisquer imagens de página.
:::

O mesmo pacote vira as páginas das receitas da seção Receitas, e pode ficar em qualquer página web que queira apresentar um livro como um livro: o catálogo de uma editora, a vitrine de uma livraria, uma prova enviada a um autor, uma prévia antes de o pedido ir para a gráfica. Como o visualizador recebe a diagramação já pronta, cada mudança no texto ou no design chega ao livro assim que o Postext volta a compor as suas páginas.

# Ferramentas em torno do motor {#tools lead="O Sandbox é uma das portas de entrada do Postext. Uma linha de comando compõe livros a partir de um terminal, um formato de arquivo os leva inteiros, documentos do Word entram e saem, e agentes podem operar o Sandbox ou portar um livro a partir do seu PDF." summary="A linha de comando, o arquivo .postext, o Word, o WebMCP e a skill de portabilidade"}

O motor no centro deste livro é uma biblioteca, e uma biblioteca pode ser chamada de qualquer lugar. O Sandbox é o lugar mais visível onde ele roda, mas uma editora com um catálogo para produzir, um desenvolvedor com um pipeline de compilação ou um assistente encarregado de compor um manuscrito precisa, cada um, de outra porta. Este capítulo passa por elas, do terminal aos agentes.

## A linha de comando

:index{term="linha de comando"}**postext** é um programa de terminal que transforma um livro em PDF, EPUB, HTML, imagens de página ou documento do Word, sem navegador. Ele vem como um único arquivo por sistema, para macOS, Linux e Windows, baixado das versões publicadas do projeto, ou pelo npm como _postext-cli_. Tudo de que ele precisa viaja dentro dele: o motor, uma biblioteca de desenho, um modelador de texto, os perfis ICC do capítulo sobre impressão e duas famílias de fontes. As outras fontes são baixadas uma vez do Google Fonts ou de uma pasta que você indicar e guardadas num cache; as fontes instaladas no computador nunca são usadas, de modo que um livro sai igual em qualquer máquina.

O programa lê um arquivo \`.postext\`, uma pasta que contém um livro ou arquivos Markdown soltos, tomados como capítulos na ordem dos seus nomes. Cada saída tem o seu comando: \`pdf\`, \`epub\`, \`html\`, \`image\` e \`images\`, \`docx\`. As opções cobrem o que o Sandbox oferece nos seus painéis: uma norma PDF/X e um perfil, um EPUB fixo ou refluível, uma única página ou um intervalo de páginas na numeração que o livro imprime, uma resolução, uma simulação de impressão. \`--set\` muda qualquer configuração para uma execução, \`--locale\` escolhe uma edição e \`--chapters\` uma parte do livro.

:::callout{type="note" title="De um manuscrito a um PDF"}
1. \`postext pdf book.postext\` escreve o livro inteiro como PDF
2. \`postext images book.postext --pages 12-15 --dpi 200\` desenha quatro páginas como imagens
3. \`postext check book.postext --strict\` falha diante de qualquer aviso
4. \`postext build book/ --watch\` compõe o livro de novo sempre que um capítulo é salvo
:::

Dois comandos servem à automação. \`check\` diagrama o livro e informa o que o painel Verificações informaria, com o preflight quando o livro está preparado para impressão, e termina com um código de erro que um script pode testar. \`build --watch\` mantém um livro aberto e o compõe de novo quando um arquivo muda, de modo que um editor e um visualizador de PDF lado a lado se comportam como o Sandbox. Num notebook comum, um romance ilustrado de 140 páginas é composto e escrito como PDF em cerca de dez segundos.

## Um livro num arquivo

:index{term="formato de arquivo (.postext)"}Um arquivo **.postext** é um livro empacotado para viagem: um arquivo zip com os capítulos em Markdown, a configuração, os recursos, as fontes e um manifesto que liga tudo. Ele também pode levar a paginação já calculada, de modo que um livro abre diagramado e a primeira página aparece antes que o motor tenha composto uma linha. O Sandbox baixa um livro nesse formato a partir do painel Livros e o abre a partir do mesmo lugar; a linha de comando lê e escreve esses arquivos; os livros de exemplo do site são servidos como arquivos .postext.

Um arquivo pode conter vários idiomas, cada um com os seus capítulos, os seus recursos e as suas configurações, como descreve o :ref{id="languages"}. Os programas leem e escrevem o formato por meio de uma pequena interface do motor, \`openBundle\`, \`createBundle\` e \`buildBundle\`, que diagrama todos os capítulos de um pacote como um único livro, com os contadores e os fólios continuados. Um arquivo feito por uma versão do Postext abre na seguinte: o manifesto registra a versão das configurações com que foi escrito, e os arquivos mais antigos são lidos do jeito que foram pensados.

## Documentos do Word

:index{term="documentos do Word"}A maioria dos manuscritos chega como arquivo do Word. O painel Texto importa um .docx no navegador, sem enviá-lo a lugar nenhum, e abre uma caixa de diálogo antes de mudar qualquer coisa. Primeiro ele avalia o documento: _estilos bem aplicados_ quando o autor usou estilos de parágrafo, _estilos aplicados em parte_, ou _sem estilos_ quando cada título foi posto em negrito à mão. Depois mostra como cada estilo do Word vai ser lido, como nível de título, estilo de parágrafo, lista, citação ou texto simples, e deixa você mudar qualquer um; as escolhas podem ser salvas como modelo e usadas no próximo manuscrito do mesmo autor ou da mesma editora. Uma prévia do Markdown resultante se atualiza à medida que você avança.

As imagens e as tabelas viram recursos, as notas de rodapé viram notas, os campos de índice do Word viram marcas de índice e as suas equações viram matemática. A importação pode substituir o capítulo atual, acrescentar capítulos novos depois dele ou substituir o livro inteiro, cortado nos seus títulos de primeiro nível.

O caminho também vale ao contrário. **Exportar para o Word** escreve um capítulo ou o livro inteiro como .docx para um autor ou um editor que trabalha no Word. O que o Word não sabe mostrar, uma diretiva ou uma referência a um recurso, fica em parágrafos cinzentos de um estilo chamado _Postext Markup_, e o modelo viaja dentro do arquivo, de modo que o documento corrigido volta para o Postext sem perder nada.

## Agentes no Sandbox

Um assistente que sabe usar um navegador também sabe usar o Sandbox, por meio do **WebMCP**:index{term="WebMCP"}, uma proposta de padrão web para páginas que oferecem ferramentas a agentes. Enquanto está aberto, o Sandbox oferece mais de cinquenta: ler o estado do livro, editar um capítulo, mudar uma configuração, acrescentar um recurso, renderizar uma página como imagem, ler os avisos, exportar um PDF, desfazer. Um agente encarregado de apertar um capítulo pode editar o texto, olhar a página que produziu e tentar de novo, como uma pessoa faria, e cada mudança que ele faz fica na tela e no histórico de desfazer.

As ferramentas que destroem trabalho, como excluir um capítulo, um recurso ou um livro, são marcadas como de consequência, então o navegador pergunta à pessoa antes de executá-las. Uma aplicação que incorpora o Sandbox pode desligar as ferramentas.

## Portar um livro com um agente

Trazer um livro existente para o Postext é sobretudo uma questão de ler o seu design: o formato, as margens, as colunas, os corpos, o jeito como os capítulos abrem e as figuras se assentam. A skill **postext-port**:index{term="skill postext-port"} ensina um agente a fazer isso a partir do que a editora tiver: um PDF, um arquivo do Word ou do InDesign, um EPUB, LaTeX, HTML ou páginas digitalizadas. Ela faz o inventário do original, mede as páginas, propõe uma ficha de especificações, escreve a configuração e os capítulos e então confere o próprio trabalho: desenha cada página que compõe como imagem e a compara com o original, página por página, até as duas coincidirem. O resultado é um arquivo .postext que abre no Sandbox como qualquer outro livro.

A skill se instala com um único comando em qualquer agente que leia skills, e no Claude Code como plugin. Ela conhece as escritas deste livro: livros chineses e japoneses compostos na vertical, livros árabes compostos a partir da direita, quadrinhos letreirados de novo em outro idioma, livros didáticos construídos com páginas compostas.

## Incorporação e a biblioteca

Por fim, o próprio Sandbox é um componente React que uma aplicação pode incorporar com o seu próprio Markdown, a sua própria configuração, o seu próprio idioma de interface e os seus próprios livros de exemplo. Abaixo dele, as bibliotecas descritas no :ref{id="output"} diagramam, desenham e escrevem livros sem nenhuma interface. O Sandbox, a linha de comando, o formato de arquivo e os agentes são todos construídos a partir desses mesmos pacotes, e é por isso que uma página sai igual qualquer que seja a porta por onde entrou.

# Roteiro e comunidade {lead="O Postext é jovem e aberto. O pipeline principal, o formato do documento e o sistema de configuração já foram entregues; o que vem a seguir se decide em público." summary="Onde o projeto está e como participar"}

O Postext não pretende ser uma plataforma universal de documentos. Ele quer ser um motor de diagramação editorial muito bom para a web, e mantém um escopo estreito para que o núcleo continue afiado. A sua ambição a longo prazo é tornar-se o motor de diagramação de referência para o conteúdo editorial na web: algo que editoras, revistas, plataformas de livros e equipes de desenvolvimento possam adotar e sobre o qual possam construir.

## Onde o projeto está

O trabalho se organiza em quatro fases, resumidas em :ref{id="development-phases"}. Elas não são marcos rígidos; descrevem a ordem em que as capacidades ficam estáveis o bastante para produção.

As duas primeiras fases estão praticamente concluídas: o modelo de dados, o analisador e a camada de medição, o formato do documento, o motor de colunas com o seu balanceamento, os flutuantes e as tabelas, e a maquinaria de livro com capítulos, partes, sumário e cabeços. A terceira fase entregou o seu núcleo (quebra de linhas ótima com penalidades editoriais, hifenização em oito idiomas, matemática, notas de rodapé e notas de fim de capítulo, citações, um índice remissivo, chinês e japonês compostos na horizontal e na vertical, árabe composto da direita para a esquerda com justificação por kashida, páginas compostas, quadrinhos, música, exercícios e texto que contorna imagens) e ainda tem pendentes as notas de margem. A quarta, a saída, entregou canvas, HTML, um PDF etiquetado pronto para a gráfica, livros EPUB 3 e cursos SCORM, junto com o worker, o Sandbox e as suas predefinições, a visualização Folio, que mostra uma diagramação como um livro impresso, e uma linha de comando que compõe livros sem navegador.

O que ainda falta importa tanto quanto o que já foi entregue. As **notas de margem** têm um lugar no modelo de dados, mas ainda não são diagramadas. O texto ainda não corre dos dois lados de uma imagem, o coreano é composto com as regras do chinês e não com as suas, e a linha de comando modela o texto sem as formas próprias de cada idioma que um navegador aplica, de modo que uma linha pode, de vez em quando, quebrar numa palavra diferente da do Sandbox. Esses são os próximos problemas que vale a pena resolver, e aqueles em que a ajuda mais conta.

## Como participar

O projeto vive no GitHub, e todas as conversas acontecem à vista de todos: **issues** para bugs, pedidos e tarefas concretas; **pull requests** para o código, revisado em público; **discussions** para ideias, questões de design e tudo o que ainda não está concreto o bastante para virar uma issue. As issues com a etiqueta _good first issue_ são a porta de entrada mais fácil.

O caminho habitual da ideia ao código é curto: uma issue descreve o problema, uma discussion define a abordagem quando há mais de uma, uma pull request a implementa, e a mudança é mesclada no branch de desenvolvimento e lançada a partir dali. Abrir uma issue antes de uma pull request grande poupa o tempo de todos, porque a abordagem pode ser combinada antes de o código ser escrito.

## Onde a ajuda conta

Todas as partes do projeto recebem bem quem quiser contribuir. O **motor** tem problemas profundos (quebra de linhas, balanceamento, numeração, posicionamento de flutuantes) e outros mais acessíveis nos seus testes e benchmarks. O **backend de PDF** tem a incorporação de fontes, a gestão de cor e a acessibilidade. O **Sandbox** tem os seus painéis, os seus editores e as suas traduções, organizados para que cada texto da interface seja acrescentado da mesma maneira em todos os idiomas. **Design e tipografia** precisam de pessoas que conheçam as tradições editoriais, sobretudo as de sistemas de escrita que o motor ainda não atende bem. E a **documentação** e as suas traduções, hoje em inglês, espanhol, catalão, francês, alemão, italiano, português do Brasil, chinês simplificado, japonês e árabe, estão abertas a qualquer pessoa que saiba explicar algo com clareza.

O melhor primeiro passo é pequeno: leia o guia de contribuição do repositório, apresente-se nas discussions, escolha uma issue com a etiqueta _good first issue_ ou traduza uma página da documentação.

A maioria das contribuições não exige escrever código:

- **Relatar problemas** com um exemplo mínimo do documento e da configuração
- **Compartilhar as suas diagramações** e transformá-las em predefinições a partir das quais outras pessoas possam começar
- **Melhorar a documentação** com tutoriais, exemplos e explicações
- **Traduzir** a interface e a documentação para novos idiomas
- **Trazer conhecimento tipográfico**, sobretudo de sistemas de escrita e tradições ainda pouco atendidos
- **Contribuir com código** para o motor, os renderizadores ou o Sandbox

## O que vai ficar de fora

Há coisas que o Postext deliberadamente não vai se tornar, e dizer isso faz parte de manter o projeto honesto. Ele não será um processador de texto: não há plano de editar a página diretamente, porque a página é o resultado das regras, não a entrada delas. Não vai gerenciar os breakpoints responsivos da aplicação que o hospeda, porque essa decisão cabe à aplicação. Não vai carregar fontes por conta própria, porque o carregamento de fontes é assunto da página que o incorpora. E não vai crescer até virar uma plataforma geral de documentos, com armazenamento, colaboração e fluxos de publicação, quando outras ferramentas fazem bem essas coisas e o Postext pode ser incorporado nelas.

Outras coisas simplesmente ainda não foram feitas. A colaboração em tempo real, compartilhar uma sessão ao vivo por meio de um link, está na lista de ideias do Sandbox, e as notas de margem são tanto uma questão de design quanto uma questão técnica. As duas serão discutidas abertamente antes que se escreva qualquer código.

## Licença

:index{term="licença"}O Postext é lançado sob a **licença MIT**: o motor, os geradores de PDF e de EPUB, o visualizador Folio e o Sandbox podem ser usados, modificados e incorporados tanto em projetos abertos quanto fechados, com fins comerciais ou não, desde que o aviso de licença acompanhe o código. As famílias tipográficas deste livro são fontes abertas servidas pelo Google Fonts, os diagramas fazem parte do código-fonte do Sandbox e o texto deste guia pertence ao projeto e a quem contribui com ele.

## Valores

Três valores guiam o projeto, e eles existem para ser usados, não para ser emoldurados: quando duas boas ideias puxam para lados diferentes, é por eles que se faz a escolha.

_Design pensado antes da pressa._ A tipografia acumula séculos de sabedoria, e o motor deve honrá-la em vez de reinventá-la mal. Uma funcionalidade entra quando faz a coisa certa numa página real, não quando apenas funciona numa demonstração; uma regra emprestada da tradição gráfica é estudada nos livros que a usam antes de virar uma opção. Algumas funcionalidades demoram mais assim. As que são lançadas não precisam ser retiradas depois.

_Clareza antes da esperteza._ O código, a configuração e a documentação devem ser fáceis de ler, mudar e explicar. Uma opção que precisa de um parágrafo de ressalvas é sinal de que o design ainda não está terminado; uma função que só o autor consegue acompanhar não sobrevive às férias dele. A configuração usa unidades reais e nomes simples, o formato do documento continua legível em qualquer editor, e as decisões do motor sempre podem ser rastreadas até uma regra que alguém consegue apontar.

_Colaboração antes de território._ As decisões são tomadas em público, em issues e discussions que qualquer pessoa pode ler e das quais pode participar, e nenhuma parte do código pertence a uma só pessoa. Toda contribuição é reconhecida (código, documentação, traduções, relatos de bugs, conselhos tipográficos e os livros de exemplo que mostram o que o motor sabe fazer), porque um motor de diagramação para todos só pode ser construído por muitas pessoas.

Se algo disso faz sentido para você, o repositório é o próximo passo. Abra uma issue, faça uma pergunta nas discussions ou mude algo neste livro e veja o que o motor faz com isso.

:::paragraphs{style="signature"}
postext.dev · github.com/drnachio/postext
:::

# Índice remissivo {style="index" summary="Todos os termos que este guia marca, com as suas páginas"}

:::index

# Quarta capa {style="back" toc="false" book="Postext" blurb="O Postext compõe Markdown como livros, revistas e livros didáticos, no navegador: cada parágrafo quebrado como um todo, colunas que terminam na mesma altura, figuras colocadas depois das palavras que as chamam, um PDF pronto para a gráfica e um EPUB para leitores digitais. Cada página deste guia foi composta pelo próprio Postext." licence="Código aberto · Licença MIT"}
`;
