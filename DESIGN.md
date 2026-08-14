---
name: Analizze
description: Sistema de gestão de obras — precisão de engenharia com estética de catálogo
colors:
  azul-heliografico: "#2f5cf6"
  azul-heliografico-hover: "#1f3fc4"
  azul-heliografico-ativo: "#1a2f8f"
  azul-halo: "#eef2ff"
  azul-foco: "#5478f8"
  perigo: "#e11d48"
  positivo: "#047857"
  informativo: "#0369a1"
  atencao: "#b45309"
  destaque: "#8b5cf6"
  alternativo: "#6366f1"
  concreto-titulo: "#101828"
  concreto-corpo: "#1d2939"
  concreto-controle: "#344054"
  concreto-legenda: "#667085"
  concreto-borda: "#eef1f6"
  concreto-camada: "#f2f4f7"
  concreto-fundo: "#fbfbfd"
  branco: "#ffffff"
typography:
  titulo:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    lineHeight: "1.375rem"
  corpo:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  rotulo:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: "1rem"
  numero:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "1.25rem"
    fontWeight: 700
rounded:
  controle: "8px"
  superficie: "16px"
  circulo: "9999px"
spacing:
  base: "4px"
  campo-x: "10px"
  botao-x: "14px"
  cartao: "16px"
  pagina: "24px"
  secao: "32px"
components:
  button-primario:
    backgroundColor: "{colors.azul-heliografico}"
    textColor: "{colors.branco}"
    rounded: "{rounded.controle}"
    height: "40px"
    padding: "0 14px"
  button-primario-hover:
    backgroundColor: "{colors.azul-heliografico-hover}"
  button-secundario:
    backgroundColor: "{colors.branco}"
    textColor: "{colors.concreto-controle}"
    rounded: "{rounded.controle}"
    height: "40px"
    padding: "0 14px"
  button-perigo:
    backgroundColor: "{colors.perigo}"
    textColor: "{colors.branco}"
    rounded: "{rounded.controle}"
    height: "40px"
    padding: "0 14px"
  button-acao:
    textColor: "{colors.concreto-legenda}"
    rounded: "{rounded.controle}"
    height: "40px"
    padding: "0 14px"
  button-acao-hover:
    backgroundColor: "{colors.azul-halo}"
    textColor: "{colors.azul-heliografico}"
  input:
    backgroundColor: "{colors.branco}"
    textColor: "{colors.concreto-corpo}"
    rounded: "{rounded.controle}"
    height: "40px"
    padding: "0 10px"
  card:
    backgroundColor: "{colors.branco}"
    rounded: "{rounded.superficie}"
    padding: "{spacing.cartao}"
---

# Design System: Analizze

## Overview

**Creative North Star: "Catálogo de Alta Precisão", pele redesenhada em
14/ago/2026**

O Analizze lê como um catálogo técnico impecavelmente diagramado: foco total no
conteúdo, tipografia tratada como instrumento de precisão, contrastes de
superfície sutis. A referência de acabamento é a estética Apple — o que
aparece na tela é o dado da obra, e a interface recua para o papel de papel: a
página rola como um documento, as seções se separam por título e espaço em
branco (nunca por moldura), e o número — a coisa que alguém lê de longe —
recebe o espaço que as caixas ocupavam antes. Nada disso mudou no refactor de
14/ago/2026.

O que mudou é a PELE, a partir de um mockup desenhado no Claude Design
("Analizze - App"): a escala de cinza trocou de Tailwind `slate` para a
"Untitled UI Gray" (mais fria), o azul de ação ficou mais vivo (`#2f5cf6`), o
raio deixou de ser único e virou um sistema de DUAS camadas — 16px em
cartão/painel/modal, 8px em controle —, e a decoração que era proibida por
princípio (chip de ícone colorido, pill de status com bolinha, anel de
percentual) passou a ser permitida, mas sempre presa a um token (`CHIP`,
`PREENCHIMENTO`), nunca escolhida a olho na tela — é o mesmo mecanismo de
sempre, só que agora autoriza mais.

A sutileza tem um limite medido: "contraste sutil" vale para superfícies
(bordas finas `#eef1f6`, faixas tonais de cinza), nunca para texto ou elemento
informativo — esses têm piso de contraste verificado por teste automatizado
(`estilo.test.ts`, 20 regras). É a marca da casa: **nenhum valor visual entra
no sistema sem ter sido medido no navegador real** — altura de controle, área
de clique, razão de contraste e geometria de `sticky` são tokens porque a soma
"no papel" errou em silêncio todas as vezes que foi tentada. O refactor de
paleta seguiu a mesma régua: cada tom novo foi recalculado por contraste WCAG
antes de entrar, e onde o mockup reprovava (o `#a86a00` de atenção, os tons de
ponto/barra `#12a172`/`#e4576f`/`#e8a33d`), o valor que entrou foi o já
verificado, não o mais bonito.

Firmeza tátil nos controles: peso de fonte forte (600–700), resposta visível a
hover/active/focus, alvos de 44px sob `pointer-coarse` — o app roda em canteiro,
com luva e sol na tela, e em monitor de escritório a 70cm. O mockup usa botões
de 34px; o app continua em 40px/28px (`CONTROLE_ALTURA`) — é medição de
WCAG 2.5.5/2.5.8 já feita no app real, não um número que uma imagem estática
tem como resolver.

**Key Characteristics:**
- Página que rola como documento; seções abertas separadas por título + espaço.
- Um azul só para ação (`#2f5cf6`); todo o resto é a escala de cinza (Untitled UI Gray).
- Números em fonte mono (JetBrains Mono) — dado se distingue de prosa à distância.
- Corpo de 14px como piso de leitura; 12px restrito a rótulo e metadado.
- Cada token com valor medido na tela, não deduzido por soma.
- Dois raios, não um: 16px em superfície (cartão/painel/modal), 8px em controle.
- Decoração tokenizada, não proibida: chip de ícone, pill de status com
  bolinha e anel `conic-gradient` de percentual são permitidos — sempre via
  `CHIP`/`PREENCHIMENTO`, nunca cor livre na tela.

## Colors

Uma cor de trabalho sobre uma escala de concreto: o azul aparece apenas onde há
ação, e os cinzas (Untitled UI Gray, desde 14/ago/2026) fazem todo o resto —
texto, borda, fundo, camada. Os degraus e os PAPÉIS são os mesmos de sempre;
só o hex por trás mudou, remapeado em `index.css` (`@theme`) — nenhum arquivo
de tela foi tocado para isso, porque nenhum hardcoda hex (confirmado por grep).

### Primary
- **Azul Heliográfico** (#2f5cf6, `blue-600`): a única cor de marca. Botão
  primário, segmento ativo do alternador, link de ação, realce de hover em
  linha/KPI clicável. Escurece em interação (#1f3fc4 hover, #1a2f8f active) e
  ganha halo claro (#eef2ff) no hover de ações fantasma.
- **Azul Foco** (#5478f8, `blue-500`): exclusivo do anel de foco de teclado
  (`FOCO`), compartilhado por botão, campo e KPI clicável.

### Neutral
- **Cinza de Concreto** — a escala Untitled UI Gray inteira, com papéis fixos:
  - **Título** (#101828, `slate-900`): headings e o número de KPI.
  - **Corpo** (#1d2939, `slate-800`): texto base do app (definido no shell).
  - **Controle** (#344054, `slate-700`): texto de botão secundário.
  - **Legenda** (#667085, `slate-500`): texto secundário, rótulos, ícones de
    campo, placeholder. É o tom mais claro permitido para texto (4,51:1 na
    superfície mais escura do app — recalculado por WCAG, não a olho) —
    `slate-400` (2,3–2,6:1) e `slate-300` são proibidos por teste.
  - **Borda** (#eef1f6, `slate-200`): a borda universal — card, campo, divisor
    de seção, moldura de alternador. `slate-150` não existe; já causou bug.
  - **Camada** (#f2f4f7, `slate-100`) e **Fundo** (#fbfbfd, `slate-50`): as
    superfícies tonais — fundo do shell, faixa de cabeçalho/rodapé de modal,
    campo dentro de cartão, trilha de barra de progresso.

### Estado (semânticas, nunca em botão)
- **Perigo** (#e11d48, `rose-600`): destrutivo — o único estado que vira botão.
- **Positivo** (#047857, `emerald-700`), **Informativo** (#0369a1, `sky-700`),
  **Atenção** (#b45309, `amber-700`), **Destaque** (#8b5cf6, `violet-500`),
  **Alternativo** (#6366f1, `indigo-500`): preenchimento de barra, selo e marcador
  de legenda, via token `PREENCHIMENTO`. Os dígitos do Tailwind variam
  (emerald-700 vs violet-500) porque o critério é o contraste medido, não a
  simetria do nome. **Não mudaram no refactor de paleta**: o mockup usa tons
  mais vivos para este mesmo papel (`#12a172`/`#e4576f`/`#e8a33d`), e eles
  reprovam o piso de 3:1 nas superfícies mais escuras do app — manter o que já
  está medido venceu ficar mais bonito e menos seguro.

### Chip de status (novo, 14/ago/2026)
- **`CHIP`** (`tokens.ts`) — a trinca fundo/texto/ponto do pill de status
  (situação de obra, status de etapa, prioridade de tarefa, procedência de
  insumo), via o primitivo `<Chip tom="…">`. O fundo é pálido (`#e8f7f0`,
  `#fdecef`, `#fff5e5`, `#eef2ff`, `#f2f4ff`, `#f2f4f7`) — pálido o bastante
  que quem precisa passar em contraste é o TEXTO sobre ele, não ele sobre a
  página. O texto **não** reusa os tons de `PREENCHIMENTO` (aqueles são para
  elemento não textual, piso 3:1; texto pede 4,5:1) — são tons próprios,
  amostrados do mockup e recalculados, com a mesma exceção de `atencao` (usa
  o `amber-700` já verificado, não o `#a86a00` do mockup, que reprova).
- **`DESTAQUE_PAINEL`** — o painel azul-escuro sólido (`#dfe6ff` fundo,
  `#1b2a6b` texto) para CTA financeiro, via `<Card variante="destaque">`. É o
  único bloco do app com cor de fundo saturada por trás de texto — não é
  status, é um convite de ação, e por isso não usa `CHIP`.

### Named Rules
**A Regra do Papel.** A cor de um botão vem do seu papel — primário, neutro,
ação, perigo — nunca do estado que ele afeta. Botão verde de "aprovar" e âmbar
de "a vencer" foram recusados de propósito: cor de status vaza para selo e
barra, não para controle. **A decoração liberada em 14/ago/2026 (chip de
ícone, pill com bolinha, anel de percentual) segue a mesma regra**: veste
CARTÃO, SELO e KPI — nunca o controle que age sobre eles.

**A Regra do Piso Medido.** Elemento não textual informativo mantém ≥3:1 nos
três fundos do app (branco, slate-100, slate-200). Os tons aprovados moram em
`PREENCHIMENTO` (tokens.ts) com a tabela de medição; escolher tom "a olho" é
proibido por teste. Texto (piso 4,5:1) segue a mesma régua com tons próprios —
ver `CHIP` acima.

## Typography

**Display Font:** Inter (variável, auto-hospedada; fallback ui-sans-serif, system-ui)
**Body Font:** Inter — a mesma família; a hierarquia vem de tamanho e peso
**Label/Mono Font:** JetBrains Mono (variável, auto-hospedada) — exclusiva de números e dados

**Character:** Neutra e instrumental, como convém a um catálogo técnico: a Inter
desaparece atrás do conteúdo, e a JetBrains Mono dá aos números o alinhamento
tabular e a identidade que os separam da prosa. A personalidade está na
disciplina da escala, não na fonte.

### Hierarchy
- **Número/Display** (700, 1.25rem/20px, mono): o valor de KPI — a maior voz da
  página. Sempre `.data-font`.
- **Título de seção** (700, 0.9375rem/15px — `text-sm`): o `<h2>` da `<Secao>`,
  única âncora visual de agrupamento.
- **Título de cartão/modal** (700, 0.875rem/14px — `text-xs`): headings internos.
- **Corpo** (400, 0.875rem/14px, lh 1.25rem — `text-xs`): o texto do app. 14px é
  o piso confortável para o usuário real (40+, canteiro, monitor a 70cm).
- **Rótulo/Metadado** (400–700, 0.75rem/12px — `text-2xs`): o piso absoluto.
  Rótulo de KPI é 700 + uppercase + `tracking-wider`.

### Named Rules
**A Regra dos 14px.** Corpo de texto nunca abaixo de 0.875rem. Os cinco tamanhos
arbitrários de 8–11px que existiam colapsaram em `text-2xs` (12px), restrito a
rótulo e metadado. Tamanho arbitrário (`text-[Npx]`) é proibido por teste — a
escala mora em `index.css` e a densidade do app inteiro se ajusta em três números.

**A Regra do Número Mono.** Todo valor de dado — dinheiro, quantidade,
percentual, código SINAPI — usa JetBrains Mono (`.data-font` ou `mono` no
Input). Prosa nunca; número sempre.

## Layout

A página é um documento que rola. `#tab-viewport` é o único scroller da casca
(padding de 24px); cada aba declara a própria largura via `PaginaAba`:
**leitura** (960px, formulário e texto corrido), **painel** (1440px, dashboards
e mestre/detalhe) ou **cheia** (planilha orçamentária, Gantt, kanban). O ritmo
entre seções é 32px (`SECAO_ESPACO`) — sem moldura, o espaço em branco é o único
separador, e 24px não bastavam.

Grid de base 4px em tudo. Mestre/detalhe: o detalhe rola com a página e só a
lista fica presa (`COLUNA_ANCORADA` — `sticky` com teto de `calc(100vh-104px)`,
número medido: 56px de topbar + 24px de padding do scroller + 24px de respiro).
Abaixo de `lg` (1024px) tudo colapsa em uma coluna e rola junto. KPIs em fileira
de 2–4 colunas com `gap-x` de 32px — o espaço faz o papel que a borda fazia.

**Painel + trilho** (desde 14/ago/2026, desenho do mockup): as telas de
vitrine — Início, painel do Financeiro, Obra · Geral — usam
`lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]` com `items-start`. À esquerda o
que se **acompanha** (números, listas, gráficos); à direita, num trilho de
300px, o que se **consulta** (calendário, endereço, contas) e o que **pede
ação** (próximo passo, medições a faturar, atalhos). Abaixo de `lg` colapsa em
uma coluna e o trilho vai para o fim. Antes esses blocos eram uma pilha única,
e a única coisa clicável da tela ficava no rodapé, embaixo de dois gráficos.

**Nessas três telas o bloco é CARTÃO, não `<Secao>` aberta** — exceção
consciente ao redesenho de 13/ago. A régua da `<Secao>` é "agrupar por assunto,
separando com título e espaço"; num painel de vitrine não há assunto a
agrupar, há indicadores independentes lado a lado, e sem moldura eles se
fundem num muro de texto. A régua original continua valendo em toda tela de
trabalho (formulário, lista, ficha).

### Named Rules
**A Regra da Página que Rola.** Nenhuma tela trava a própria altura em
`h-[calc(100vh-…)]` — isso multiplicava barras de rolagem aninhadas (eram 53).
As duas únicas rolagens internas legítimas são `COLUNA_ANCORADA` (lista mestre)
e `TableWrap rolagem="propria"` (tabela que é a razão da tela existir, e a única
forma de cabeçalho fixo funcionar). Imposto por teste.

**A Regra da Grade Medida.** Nada que se repete numa linha declara contagem de
colunas por breakpoint (`md:grid-cols-2 lg:grid-cols-3…`): declara a largura
mínima que o conteúdo pede — medida no navegador — e o número de colunas é
consequência. A escada decide pela janela, que o conteúdo não conhece, e cada
monitor novo pede outro degrau; a grade medida flui em qualquer largura,
inclusive as que nenhum breakpoint previu (sidebar recolhida, janela lado a
lado, zoom). São três tokens, e a diferença entre eles não é estilo:

- **Cartões** (`GRADE_CARTOES`, `auto-fill`): uma obra sozinha continua do
  tamanho de um cartão. A trilha vazia fica.
- **Painéis irmãos** (`GRADE_PAINEIS`, `auto-fit`): dois painéis numa linha de
  três lugares dividem a linha — assunto não tem largura natural. A trilha
  vazia colapsa. Pisos medidos: 604px com faixa de 3 KPIs de dinheiro (o valor
  em mono mede 180px), 340px para painel de lista.
- **Painel largo + estreito** (`GRADE_PAINEL_ASSIMETRICO`): trilhas explícitas
  `minmax(0,2fr) minmax(340px,1fr)`, e o `lg:` continua — "empilhar ou não" com
  proporção assimétrica é a única decisão desta família que a janela decide de
  verdade. `auto-fit` aqui tornaria o `col-span` dependente de quantas trilhas
  couberam, e a mesma tela renderia proporções diferentes sem dizer.

O que a escada custava, medido: em 996px de largura útil, `lg:grid-cols-2`
punha lado a lado dois painéis de 482px cujo conteúdo pedia 604px — o número
quebrava exatamente na tela que existe para mostrá-lo. Conteúdo novo → medir o
mínimo dele e registrar no token, nunca adivinhar. Seções lado a lado só quando
os blocos se comparam entre si (par de alertas, a pagar vs a receber), nunca
como moldura dupla para assuntos em sequência.

## Elevation & Depth

Híbrido com preferência tonal: **plano por padrão, profundidade por camada de
cinza, sombra só estrutural**. O conteúdo assenta direto no fundo `#fbfbfd`;
assuntos se separam por título e espaço, não por elevação. Onde profundidade é
necessária, a primeira ferramenta é a camada tonal — `slate-50` para campo
dentro de cartão e faixas de cabeçalho/rodapé de modal, `slate-100` para trilhas
e superfícies rebaixadas — e essa é a direção a expandir (decisão de
13/ago/2026).

**Card perdeu a sombra de repouso em 14/ago/2026** (era `shadow-sm`), a partir
do mockup: nenhum cartão do "Analizze - App" tem sombra parado, só borda —
sombra ficou exclusiva de quem flutua de verdade (Modal, Drawer, toast) ou
responde ao hover de um alvo clicável.

### Shadow Vocabulary
- **xs** (`shadow-xs`): botão secundário — o mínimo para destacá-lo do fundo branco.
- **sm** (`shadow-sm`): botão primário em repouso. Card **não** leva mais —
  ver acima.
- **hover de Card interativo**: não é mais `shadow-md` — é o valor exato do
  mockup, maior e mais suave, com o tinte do próprio `slate-900` novo em vez
  do preto neutro: `0 12px 24px -8px rgba(16,24,40,.14)`. A resposta tátil do
  alvo ficou mais perceptível, de propósito — é a única sombra decorativa que
  o app usa, e só aparece na interação.
- **xl** (`shadow-xl`): Modal — o que de fato flutua sobre a página, com
  backdrop `slate-900/60` + blur. **2xl** (`shadow-2xl`): Drawer, mais pesada
  porque cobre a altura inteira da tela.

### Named Rules
**A Regra da Sombra Estrutural.** Sombra marca o que flutua (diálogo, gaveta,
toast) ou o que é alvo clicável (Card interativo) — mesmo depois do card
perder a sombra de repouso, ela continua reservada a ESTADO (flutuar, ser
alvo), nunca decorando um bloco parado.

## Shapes

Dois raios, não um mais — mudou em 14/ago/2026, a partir do mockup, que usa
16px em TODO cartão/painel/modal e mantém o controle discreto:

- **Superfície** (`rounded-2xl`, 16px): cartão, painel, modal — o bloco que
  contém outras coisas. `Card.tsx`/`Modal.tsx` são a fonte; nada mais declara
  este raio à mão.
- **Controle** (`rounded-lg`, 8px): botão, campo, alternador — não subiu. O
  mockup usa ~9-10px aqui, perto o bastante de 8px que introduzir um valor
  fora da escala do Tailwind (`rounded-[9px]`) trocaria precisão por uma
  diferença que ninguém vê.

O círculo (`rounded-full`) existe para pill de status/chip e para o botão que
flutua sobre uma borda (a alça de recolher o menu), e é prop
(`forma="circulo"` no IconButton), não classe — `rounded-full` na className
perde a disputa de utilitários. Bordas de 1px em `#eef1f6` são a linha
universal.

**A exceção deliberada:** `Drawer` continua sem raio nenhum. Ele é colado ao
viewport (`h-screen`, encostado à borda direita) — arredondar os quatro cantos
criaria um vão visível contra a borda da tela nos dois cantos que tocam
topo/base. É geometria, não gosto: a mesma régua que já mediu `sticky` e
`scrollbar-gutter` neste projeto.

## Components

Controles firmes e táteis: presença clara, peso 600–700, resposta visível em
hover/active/focus, alvo de toque garantido. O comportamento é idêntico em todo
lugar — a variação mora em prop, nunca em className (largura, altura, forma e
padding vertical passados por className **perdem** para o token e viram
declaração morta; imposto por teste).

### Buttons
- **Shape:** 8px de raio (não subiu com o cartão — ver Shapes), altura
  tokenizada (`CONTROLE_ALTURA`: md 40px, sm 28px) — a altura não é soma de
  padding, é declarada; borda não empurra mais nada.
- **Primário** (azul #2f5cf6, texto branco, shadow-sm, 600): a ação principal da
  tela. Hover #1f3fc4, active #1a2f8f.
- **Secundário** (branco, texto #344054, borda #eef1f6, shadow-xs): ação de
  apoio. Hover: fundo #fbfbfd, borda slate-300.
- **Fantasma** (transparente, texto #667085): fechar, alternar. Hover slate-100.
- **Ação** (transparente → halo azul #eef2ff + texto #2f5cf6 no hover): editar,
  abrir, ver detalhe em linha de tabela/cartão — o azul do primário sem o fundo.
- **Suave** (halo azul #eef2ff já aceso em repouso, texto #2f5cf6): o "abrir"
  que se repete numa grade de cartões. `primario` ali vira parede de azul
  sólido e `acao` some no repouso, deixando o único caminho para dentro do
  cartão sem marca nenhuma.
- **Perigo** (rose-600, anel de foco rose): destrutivo. Ganha separação extra do
  vizinho (`ALVO_PERIGO_SEPARADO`) — errar o clique por 4px não pode apagar registro.
- **Hover / Focus:** todo botão foca com o mesmo anel `FOCO` (ring 2px blue-500,
  offset 1) — só em `focus-visible`, nunca no clique de mouse.
- **IconButton:** exige `rotulo` (aria-label) por contrato; carrega área mínima
  de clique (`ALVO`: 28px md, 24px sm, 44px sob `pointer-coarse` — WCAG 2.5.8/2.5.5).

### Inputs / Fields
- **Style:** borda #eef1f6, raio 8px, altura 40px (md) / 28px (sm), texto
  #1d2939, placeholder #667085. Fundo `branco` ou `suave` (#fbfbfd, para campo
  dentro de cartão) — por prop, nunca por className.
- **Largura por tipo de conteúdo** (`CAMPO_LARGURA`): `quantidade` (min 110px),
  `dinheiro` (min 120px), `percentual` (80px fixo), `busca` (min 160px). O piso
  é do tipo do dado — campo estreito que esconde dígito é risco de erro de
  orçamento, não estética.
- **Focus:** o mesmo anel `FOCO` do botão + borda blue-500.
- **Error / Disabled:** `aria-invalid` → borda rose-400; disabled → fundo
  slate-50, texto slate-400 (única exceção permitida do slate-400).
- **Select:** seta como background-image (stroke #667085 escrito à mão — data
  URI não lê variável de tema; mudou a cor dos ícones, mude lá também).

### Cards / Containers
- **Régua de uso:** a moldura delimita um **alvo**, não um assunto — item
  clicável, cartão de obra/tarefa/kanban, bloco de alerta colorido, lista mestre
  que rola por dentro, faixa de aviso de uma linha. Agrupamento por assunto é
  `<Secao>` (título + divisor `border-b` + 32px de espaço), sem caixa nenhuma.
- **Corner Style:** 16px (`rounded-2xl`, ver Shapes — subiu de 8px em
  14/ago/2026). **Background:** branco. **Border:** 1px #eef1f6.
- **Shadow Strategy:** nenhuma em repouso (só a borda, desde 14/ago/2026);
  interativo ganha hover com sombra grande e suave (ver Elevation) + borda
  blue-300 + cursor-pointer.
- **Internal Padding:** 16px (`p-4`); `semPadding` para tabela colada às bordas.
- **Variante `destaque`:** fundo `#dfe6ff` sólido, texto `#1b2a6b` por padrão,
  sem borda — o painel de CTA financeiro (ver `DESTAQUE_PAINEL` em Colors). É
  a única variante de cor do Card; não crie uma nova sem um caso do tamanho de
  "faturamento" para justificar.

### Navigation
- Topbar branca de 56px (`h-14`, borda inferior slate-100) sobre shell #fbfbfd;
  sidebar recolhível (240px / 64px, `MENU_LARGURA`); skip-link visível em foco
  (fundo azul). A URL é caminho real — **aba + obra + seção da obra** — sem
  router.
- **A topbar tem três zonas** (desenho do mockup, 14/ago/2026): migalhas à
  esquerda, **busca global ao centro** (`max-w-[460px]`, `mx-auto`) e o avatar
  da sessão à direita. O avatar não é enfeite: é ele que ancora a direita e
  deixa a busca opticamente centrada.
- **Os 56px não subiram para os 60 do mockup**, e isso é deliberado:
  `COLUNA_ANCORADA` é `calc(100vh-104px)` = 56 da topbar + 24 do padding do
  scroller + 24 de respiro, um número **medido no navegador**. Mudar a barra
  sem refazer a medição desloca em silêncio a lista ancorada de quatro telas
  mestre/detalhe.
- **A busca é botão com cara de campo, não `<input>`** (`BuscaGlobal`): o
  comportamento é uma palheta que abre por cima (`Ctrl/⌘ K`), e um input de
  verdade prometeria digitação no lugar — ao primeiro caractere o foco saltaria
  para dentro do diálogo. A palheta só é montada quando abre, então a topbar
  não assina domínio de dado nenhum enquanto está fechada.
- **A palheta diz o que ela NÃO alcança.** Ela filtra o que já foi carregado na
  sessão (o app busca dado por aba visitada, `dadosAtivos`), e o rodapé dela
  declara isso. Busca que devolve menos do que existe sem avisar ensina que o
  dado não está no sistema — pior do que não ter busca.
- **O menu lê o fluxo, não o inventário.** Indicadores/Tarefas, `Comercial`,
  `Obras`, `Custos`, `Administração`: a ordem é proposta → obra → custo →
  retaguarda, e o agrupamento mora em `constants/menu.ts` (ordem + ícone; o
  rótulo vem de `TAB_LABELS`, num lugar só). `Obras` é o único destino sem
  família — fica isolado, sem cabeçalho, com 24px extras acima
  (`MENU_GRUPO_ESPACO.semCabecalho`, o espaço que um cabeçalho ocuparia). Um
  cabeçalho "OBRAS" sobre um item "Obras" empilhava a palavra duas vezes.
- **A obra aberta assume o topo do menu**, com as seis seções do console
  (`MENU_OBRA`) e "← Todas as obras"; o item `Obras` sai enquanto o bloco
  existe. O cabeçalho do bloco é o **nome da obra em 14px bold, não caixa
  alta** — categoria é rótulo de 12px maiúsculo, conteúdo é título: nome
  próprio em maiúsculas perde a silhueta. O bloco só monta quando a obra foi
  **encontrada**, a mesma condição do conteúdo: com id de obra apagada os dois
  caem na lista, em vez de o menu prometer seções que não abrem.
- **Altura do item é declarada** (`MENU_ITEM`, 40px), nunca somada de padding —
  e o item ativo paga 2px a menos de padding à esquerda, que o filete devolve.
  Sem isso, ícone e rótulo pulavam 2px ao serem selecionados (medido: 26px nos
  dois estados depois da correção).
- **A calha de rolagem do menu é reservada nos dois lados** (`MENU_ROLAGEM`,
  `scrollbar-gutter: stable both-edges`). A barra do Chrome mede 15px e sai de
  um lado só: o menu inteiro saltava 15px quando ela aparecia — abrir uma obra
  basta — e, recolhido, a fileira de ícones ficava 5,5px fora do eixo da coluna
  de 64px. Terceiro sítio do mesmo modo de falha do `COLUNA_ANCORADA`:
  geometria de rolagem deduzida no papel erra em silêncio.
- **Selo de menu conta pendência, nunca acervo.** Minhas tarefas em aberto,
  propostas aguardando o cliente, boletins a aprovar na obra. Total de cadastro
  não é ação de ninguém, e um menu com número em quase toda linha treina o olho
  a pular todos. Zero não desenha: para pendência, "0" e "ainda não carreguei"
  são indistinguíveis, e a versão silenciosa não mente.
- **Item ativo de navegação vertical:** `bg-blue-50/50` + texto azul +
  `border-l-2 border-blue-600` com `rounded-l-none` — o filete esquerdo marca
  ESTADO selecionado, nunca decoração de card. São três donos hoje, com o mesmo
  tratamento: o `Sidebar` do app — destinos globais E seções da obra aberta, sem
  realce próprio para o segundo nível —, a lista de pastas de Documentos e a
  lista de categorias do Catálogo (`SidebarCatalogo`); listas de navegação novas
  o reutilizam em vez de inventar outro realce.

### Tabela (componente de assinatura)
- Fonte `text-xs` (14px), `border-collapse`, scroll horizontal sempre no próprio
  contêiner (`TableWrap`) — tabela nunca estoura a página. Todo `<th>` declara
  `scope` (imposto por teste). Cabeçalho fixo só via `rolagem="propria"`
  (max-h 70vh) — `sticky` escrito à mão numa célula não gruda e é proibido por
  teste. Primeira coluna pode ser `fixa` (sticky left, fundo opaco, sombra de
  1px à direita marcando a divisão).

### Alternador segmentado (`CONTROLE_GRUPO`)
- **Calha cinza com a tecla acesa** (desenho do mockup, desde 14/ago/2026):
  fundo `slate-200`, padding de 3px, raio 10px; segmento ativo = **branco**
  com sombra de 1px (`0 1px 2px rgba(16,24,40,.06)`) e texto slate-900 bold;
  inativo = transparente + slate-500. Min-h e não h: sob `pointer-coarse` o
  alvo cresce para 44px.
- O ativo deixou de ser azul sólido: um alternador ao lado de um `Button`
  primário punha dois azuis cheios disputando a mesma atenção, e só um deles é
  a ação da tela.

### Filtro em pílula
- Conjunto FECHADO e curto de opções mutuamente exclusivas (situação da obra,
  categoria do catálogo) vira fileira de pílulas, não `<select>`: o valor de
  ver todas de uma vez é saber que existem — dentro do select, "Pausado" só
  aparece para quem abre o menu. Ativo = `slate-900` sólido + branco; inativo =
  branco + borda slate-200 + slate-600.
- **Não usa o filete azul** de item ativo: aquilo significa *seção
  selecionada* em navegação vertical (menu, pastas de Documentos), e gastá-lo
  em filtro apaga a distinção.
- Conjunto aberto ou infinito (nome, código) continua sendo campo de busca.

### KPI (componente de assinatura)
- Sem caixa: rótulo 12px bold uppercase slate-500 + número 20px mono bold
  slate-900 + detalhe 12px slate-500. Clicável vira `<button>` de verdade e
  ganha seta `ArrowUpRight` — o affordance não depende de hover.

### Chip (novo, 14/ago/2026)
- Pill de status: `<Chip tom="…">`, fundo pálido + texto tokenizado (`CHIP`),
  bolinha de 6px opcional à esquerda (`ponto`). Substitui a pill escrita à mão
  que existia em 15+ telas antes desta rodada, cada uma com sua própria lógica
  de cor — o mesmo defeito que `Button`/`Input` já resolveram para botão e
  campo.
- **Não é** o preenchimento de barra/selo de `PREENCHIMENTO` (aquele é para
  elemento não textual, piso 3:1) — o texto do chip usa tons próprios, piso
  4,5:1, porque é texto de verdade.

### Anel de progresso (novo, 14/ago/2026)
- `<AnelProgresso percentual tom tamanho>`: `conic-gradient` puro CSS, miolo
  branco com o valor centrado. Cor do arco vem de `PREENCHIMENTO_HEX` (mesmo
  motivo de sempre — CSS calculado em JS não lê `var()` de tema). Usa-se onde
  o mockup usa: percentual de execução financeira, avanço de obra em cartão,
  resumo de "medições a faturar" — nunca como decoração solta num canto vazio.

### Movimento
- **Todo movimento é CSS, e mora em `index.css`.** Seis pares de keyframes
  cobrem o vocabulário inteiro: `fade`, `dialogo`, `gaveta`, `toast`, `cartao`
  (entrada de grade, sobe 12px) e `lista` (entrada de lista mestre, entra 10px
  pela esquerda). Saída sempre mais curta que entrada; `usePresenca` segura o nó
  montado enquanto a saída roda. Não há biblioteca de animação — o `motion` foi
  removido em 13/ago/2026 por custar 126 KB para reproduzir esses mesmos efeitos.
- **`prefers-reduced-motion` é atendido em toda a camada**, sem exceção: entrada
  vira aparecimento imediato, saída vira fade curto de 100ms (zerar a duração
  quebra o `animationend` e o nó nunca desmonta).
- **Entrada escalonada usa `atrasoEntrada()` e exige `backwards`.** Sem o
  fill-mode o item fica visível durante o atraso e salta para o quadro inicial —
  um piscar por item. O teto do atraso não é opcional: sem ele uma lista longa
  faz o último item entrar segundos depois do primeiro.

### Gráficos
- **Cor de série e piso de fonte saem do token, não da biblioteca.** Recharts e
  SVG recebem cor e tamanho por prop, então escapam da escala do Tailwind e do
  guarda do `estilo.test.ts`, que varre `className`. A série usa
  `PREENCHIMENTO_HEX` (os mesmos tons medidos ≥3:1 do `PREENCHIMENTO`) e o
  texto usa `GRAFICO_FONTE` (12px, o piso do app). Sem isso a série escolhe
  sozinha — foi assim que o fluxo de caixa ficou com `emerald-500`/`red-500`,
  os dois tons que a tabela de contraste reprova, e o eixo em 10px.
- **A legenda sai do mesmo token da barra que ela nomeia.** Marcador escrito à
  mão diverge em silêncio, e legenda que não bate com o gráfico atribui o
  número à série errada.

### Named Rules
**A Regra do Foco Único.** Tudo foca igual: o anel `FOCO` (blue-500) é
compartilhado por botão, campo, KPI e segmento; destrutivo troca para
`FOCO_PERIGO` (rose-500). Um foco novo por componente é regressão.

## Do's and Don'ts

### Do:
- **Do** agrupar por título e espaço (`<Secao>` + 32px); a moldura é só para
  alvo clicável, alerta colorido ou lista que rola por dentro.
- **Do** usar os primitivos de `components/ui` para todo controle novo — campo,
  botão, tabela, KPI, chip, anel de progresso; as ~30 grafias de botão que
  existiam são o contraexemplo, e as 15+ pills feitas à mão eram o mesmo
  defeito no status.
- **Do** escrever número em JetBrains Mono (`.data-font` / `mono`) e escolher a
  largura do campo pelo tipo do dado (`CAMPO_LARGURA`).
- **Do** tirar tom de barra/selo de `PREENCHIMENTO` e tom de chip de `CHIP` —
  os dois já foram medidos por contraste; escolher "a olho" reprova o mesmo
  tipo de piso que o mockup reprovou em três lugares (ver Colors).
- **Do** manter 44px de alvo sob `pointer-coarse` — o app roda com luva e sol
  na tela. O botão de 34px do mockup não entra: é imagem estática, o app tem
  WCAG 2.5.5/2.5.8 já resolvido em `CONTROLE_ALTURA`/`ALVO`.
- **Do** usar `rounded-2xl` (16px) em cartão/painel/modal e deixar `rounded-lg`
  (8px) em botão/campo — dois raios, não um; ver Shapes.
- **Do** respeitar `prefers-reduced-motion`: entrada vira aparecimento
  imediato; saída vira fade curto (zerar duração quebra o `animationend`).

### Don't:
- **Don't** voltar à moldura por assunto: card dentro de card, dez blocos
  emoldurados por tela, `h-[calc(100vh-…)]` com rolagem aninhada.
- **Don't** colorir botão com cor de estado (verde "aprovar", âmbar "a vencer")
  — estado vive em selo, barra e chip; botão tem papel. A decoração liberada
  em 14/ago/2026 é para CARTÃO/SELO/KPI, não para controle — um botão com
  ícone colorido de fundo continua errado.
- **Don't** descer texto abaixo de 12px, usar `text-[Npx]` arbitrário, ou
  `text-slate-400`/`300` em texto (2,3–2,6:1 e mais claro ainda — reprovam em
  qualquer fundo, mesmo depois da troca de paleta).
- **Don't** passar largura, altura, forma ou padding vertical de controle por
  className — perdem a disputa de utilitários para o token e viram declaração
  morta que engana quem lê o JSX.
- **Don't** declarar contagem de colunas de grade de cartões por breakpoint —
  a largura mínima medida do cartão decide (`GRADE_CARTOES`); a escada
  `md:2 lg:3 2xl:4` é o remendo que a Regra da Grade Medida aposentou.
- **Don't** escrever `sticky` à mão em célula de tabela, `outline-none` sem
  repor foco, ou `<button>` de ícone sem `aria-label` — os três são barrados
  por `estilo.test.ts`.
- **Don't** escrever cor em hex arbitrário (`bg-[#FBFBFD]`) quando a escala já
  tem o tom: é o mesmo valor hoje e sai de sincronia na primeira mudança de
  paleta. O fundo do shell é `bg-slate-50`. Chip/painel-destaque são a
  exceção documentada — o tom não existe na escala Tailwind, e por isso vive
  em `tokens.ts` (`CHIP`, `DESTAQUE_PAINEL`), não solto na tela.
- **Don't** usar `border-slate-100` como borda de cartão sobre o fundo da
  página — contraste insuficiente contra `slate-50`, uma borda que não
  desenha. `slate-100` é camada (fundo), `slate-200` é borda; a linha
  estrutural do shell (topbar, sidebar) é a única exceção, e é deliberada.
- **Don't** arredondar o `Drawer` — ele é colado ao viewport, não flutua como
  Card/Modal; arredondar criaria vão contra a borda da tela (ver Shapes).
