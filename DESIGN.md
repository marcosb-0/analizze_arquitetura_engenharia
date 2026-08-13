---
name: Analizze
description: Sistema de gestão de obras — precisão de engenharia com estética de catálogo
colors:
  azul-heliografico: "#2563eb"
  azul-heliografico-hover: "#1d4ed8"
  azul-heliografico-ativo: "#1e40af"
  azul-halo: "#eff6ff"
  azul-foco: "#3b82f6"
  perigo: "#e11d48"
  positivo: "#047857"
  informativo: "#0369a1"
  atencao: "#b45309"
  destaque: "#8b5cf6"
  alternativo: "#6366f1"
  concreto-titulo: "#0f172a"
  concreto-corpo: "#1e293b"
  concreto-controle: "#334155"
  concreto-legenda: "#64748b"
  concreto-borda: "#e2e8f0"
  concreto-camada: "#f1f5f9"
  concreto-fundo: "#f8fafc"
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
    rounded: "{rounded.controle}"
    padding: "{spacing.cartao}"
---

# Design System: Analizze

## Overview

**Creative North Star: "Catálogo de Alta Precisão"**

O Analizze lê como um catálogo técnico impecavelmente diagramado: foco total no
conteúdo, tipografia tratada como instrumento de precisão, cantos suavemente
arredondados (8px em tudo), contrastes de superfície sutis e zero ruído visual.
A referência de acabamento é a estética Apple — o que aparece na tela é o dado
da obra, e a interface recua para o papel de papel: a página rola como um
documento, as seções se separam por título e espaço em branco (nunca por
moldura), e o número — a coisa que alguém lê de longe — recebe o espaço que as
caixas ocupavam antes.

A sutileza tem um limite medido: "contraste sutil" vale para superfícies
(bordas finas `#e2e8f0`, faixas tonais de cinza), nunca para texto ou elemento
informativo — esses têm piso de contraste verificado por teste automatizado
(`estilo.test.ts`, 11 regras). É a marca da casa: **nenhum valor visual entra
no sistema sem ter sido medido no navegador real** — altura de controle, área
de clique, razão de contraste e geometria de `sticky` são tokens porque a soma
"no papel" errou em silêncio todas as vezes que foi tentada.

Firmeza tátil nos controles: peso de fonte forte (600–700), resposta visível a
hover/active/focus, alvos de 44px sob `pointer-coarse` — o app roda em canteiro,
com luva e sol na tela, e em monitor de escritório a 70cm.

**Key Characteristics:**
- Página que rola como documento; seções abertas separadas por título + espaço.
- Um azul só para ação (`#2563eb`); todo o resto é a escala de cinza slate.
- Números em fonte mono (JetBrains Mono) — dado se distingue de prosa à distância.
- Corpo de 14px como piso de leitura; 12px restrito a rótulo e metadado.
- Cada token com valor medido na tela, não deduzido por soma.
- Zero decoração: sem gradientes, sem chips de ícone coloridos, sem caixas por hábito.

## Colors

Uma cor de trabalho sobre uma escala de concreto: o azul aparece apenas onde há
ação, e os cinzas slate fazem todo o resto — texto, borda, fundo, camada.

### Primary
- **Azul Heliográfico** (#2563eb, `blue-600`): a única cor de marca. Botão
  primário, segmento ativo do alternador, link de ação, realce de hover em
  linha/KPI clicável. Escurece em interação (#1d4ed8 hover, #1e40af active) e
  ganha halo claro (#eff6ff) no hover de ações fantasma.
- **Azul Foco** (#3b82f6, `blue-500`): exclusivo do anel de foco de teclado
  (`FOCO`), compartilhado por botão, campo e KPI clicável.

### Neutral
- **Cinza de Concreto** — a escala slate inteira, com papéis fixos:
  - **Título** (#0f172a, `slate-900`): headings e o número de KPI.
  - **Corpo** (#1e293b, `slate-800`): texto base do app (definido no shell).
  - **Controle** (#334155, `slate-700`): texto de botão secundário.
  - **Legenda** (#64748b, `slate-500`): texto secundário, rótulos, ícones de
    campo, placeholder. É o tom mais claro permitido para texto — `slate-400`
    (2,56:1) e `slate-300` são proibidos por teste.
  - **Borda** (#e2e8f0, `slate-200`): a borda universal — card, campo, divisor
    de seção, moldura de alternador. `slate-150` não existe; já causou bug.
  - **Camada** (#f1f5f9, `slate-100`) e **Fundo** (#f8fafc, `slate-50`): as
    superfícies tonais — fundo do shell, faixa de cabeçalho/rodapé de modal,
    campo dentro de cartão, trilha de barra de progresso.

### Estado (semânticas, nunca em botão)
- **Perigo** (#e11d48, `rose-600`): destrutivo — o único estado que vira botão.
- **Positivo** (#047857, `emerald-700`), **Informativo** (#0369a1, `sky-700`),
  **Atenção** (#b45309, `amber-700`), **Destaque** (#8b5cf6, `violet-500`),
  **Alternativo** (#6366f1, `indigo-500`): preenchimento de barra, selo e marcador
  de legenda, via token `PREENCHIMENTO`. Os dígitos do Tailwind variam
  (emerald-700 vs violet-500) porque o critério é o contraste medido, não a
  simetria do nome.

### Named Rules
**A Regra do Papel.** A cor de um botão vem do seu papel — primário, neutro,
ação, perigo — nunca do estado que ele afeta. Botão verde de "aprovar" e âmbar
de "a vencer" foram recusados de propósito: cor de status vaza para selo e
barra, não para controle.

**A Regra do Piso Medido.** Elemento não textual informativo mantém ≥3:1 nos
três fundos do app (branco, slate-100, slate-200). Os tons aprovados moram em
`PREENCHIMENTO` (tokens.ts) com a tabela de medição; escolher tom "a olho" é
proibido por teste.

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

### Named Rules
**A Regra da Página que Rola.** Nenhuma tela trava a própria altura em
`h-[calc(100vh-…)]` — isso multiplicava barras de rolagem aninhadas (eram 53).
As duas únicas rolagens internas legítimas são `COLUNA_ANCORADA` (lista mestre)
e `TableWrap rolagem="propria"` (tabela que é a razão da tela existir, e a única
forma de cabeçalho fixo funcionar). Imposto por teste.

**A Regra da Grade Medida.** Grade de cartões não declara contagem de colunas
por breakpoint (`md:grid-cols-2 lg:grid-cols-3…`): declara a largura mínima
que o conteúdo do cartão pede — medida no navegador — e o número de colunas é
consequência (`GRADE_CARTOES`, `auto-fill` + `minmax(min(Npx,100%),1fr)`). A
escada de breakpoints decide pela janela, que o cartão não conhece, e cada
monitor novo pede outro degrau; a grade medida flui em qualquer largura,
inclusive as que nenhum breakpoint previu (sidebar recolhida, janela lado a
lado, zoom). Cartão novo → medir o mínimo dele e registrar no token, nunca
adivinhar. Diretriz de 13/ago/2026, aplicada tela a tela — Obras foi a
primeira; seções lado a lado só quando os blocos se comparam entre si (par de
alertas, entrada vs saída), nunca como moldura dupla para assuntos em sequência.

## Elevation & Depth

Híbrido com preferência tonal: **plano por padrão, profundidade por camada de
cinza, sombra só estrutural**. O conteúdo assenta direto no fundo `#f8fafc`;
assuntos se separam por título e espaço, não por elevação. Onde profundidade é
necessária, a primeira ferramenta é a camada tonal — `slate-50` para campo
dentro de cartão e faixas de cabeçalho/rodapé de modal, `slate-100` para trilhas
e superfícies rebaixadas — e essa é a direção a expandir (decisão de
13/ago/2026). Sombra fica reservada ao que flutua ou ao que é alvo.

### Shadow Vocabulary
- **xs** (`shadow-xs`): botão secundário — o mínimo para destacá-lo do fundo branco.
- **sm** (`shadow-sm`): Card e botão primário em repouso.
- **md** (`shadow-md`): hover de Card interativo — a resposta tátil do alvo.
- **xl** (`shadow-xl`): Modal e Drawer — o que de fato flutua sobre a página,
  com backdrop `slate-900/60` + blur.

### Named Rules
**A Regra da Sombra Estrutural.** Sombra marca o que flutua (diálogo, gaveta,
toast) ou o que é alvo clicável (Card interativo). Profundidade de assunto é
camada tonal; sombra decorativa em bloco de conteúdo não existe.

## Shapes

Um raio só: **8px** (`rounded-lg`) em botão, campo, cartão, modal, alternador —
o canto suavemente arredondado do North Star, aplicado sem variação. O círculo
(`rounded-full`) existe apenas para o botão que flutua sobre uma borda (a alça
de recolher o menu), e é prop (`forma="circulo"`), não classe — `rounded-full`
na className perde a disputa de utilitários. Bordas de 1px em `#e2e8f0` são a
linha universal; `rounded-xl`/`2xl` eram dialeto e foram apagados.

## Components

Controles firmes e táteis: presença clara, peso 600–700, resposta visível em
hover/active/focus, alvo de toque garantido. O comportamento é idêntico em todo
lugar — a variação mora em prop, nunca em className (largura, altura, forma e
padding vertical passados por className **perdem** para o token e viram
declaração morta; imposto por teste).

### Buttons
- **Shape:** 8px de raio, altura tokenizada (`CONTROLE_ALTURA`: md 40px, sm 28px)
  — a altura não é soma de padding, é declarada; borda não empurra mais nada.
- **Primário** (azul #2563eb, texto branco, shadow-sm, 600): a ação principal da
  tela. Hover #1d4ed8, active #1e40af.
- **Secundário** (branco, texto #334155, borda #e2e8f0, shadow-xs): ação de
  apoio. Hover: fundo #f8fafc, borda slate-300.
- **Fantasma** (transparente, texto #64748b): fechar, alternar. Hover slate-100.
- **Ação** (transparente → halo azul #eff6ff + texto #2563eb no hover): editar,
  abrir, ver detalhe em linha de tabela/cartão — o azul do primário sem o fundo.
- **Perigo** (rose-600, anel de foco rose): destrutivo. Ganha separação extra do
  vizinho (`ALVO_PERIGO_SEPARADO`) — errar o clique por 4px não pode apagar registro.
- **Hover / Focus:** todo botão foca com o mesmo anel `FOCO` (ring 2px blue-500,
  offset 1) — só em `focus-visible`, nunca no clique de mouse.
- **IconButton:** exige `rotulo` (aria-label) por contrato; carrega área mínima
  de clique (`ALVO`: 28px md, 24px sm, 44px sob `pointer-coarse` — WCAG 2.5.8/2.5.5).

### Inputs / Fields
- **Style:** borda #e2e8f0, raio 8px, altura 40px (md) / 28px (sm), texto
  #1e293b, placeholder #64748b. Fundo `branco` ou `suave` (#f8fafc, para campo
  dentro de cartão) — por prop, nunca por className.
- **Largura por tipo de conteúdo** (`CAMPO_LARGURA`): `quantidade` (min 110px),
  `dinheiro` (min 120px), `percentual` (80px fixo), `busca` (min 160px). O piso
  é do tipo do dado — campo estreito que esconde dígito é risco de erro de
  orçamento, não estética.
- **Focus:** o mesmo anel `FOCO` do botão + borda blue-500.
- **Error / Disabled:** `aria-invalid` → borda rose-400; disabled → fundo
  slate-50, texto slate-400 (única exceção permitida do slate-400).
- **Select:** seta como background-image (stroke #64748b escrito à mão — data
  URI não lê variável de tema; mudou a cor dos ícones, mude lá também).

### Cards / Containers
- **Régua de uso:** a moldura delimita um **alvo**, não um assunto — item
  clicável, cartão de obra/tarefa/kanban, bloco de alerta colorido, lista mestre
  que rola por dentro, faixa de aviso de uma linha. Agrupamento por assunto é
  `<Secao>` (título + divisor `border-b` + 32px de espaço), sem caixa nenhuma.
- **Corner Style:** 8px. **Background:** branco. **Border:** 1px #e2e8f0.
- **Shadow Strategy:** sm em repouso; interativo ganha hover shadow-md + borda
  blue-300 + cursor-pointer.
- **Internal Padding:** 16px (`p-4`); `semPadding` para tabela colada às bordas.

### Navigation
- Topbar branca de 56px (`h-14`, borda inferior slate-100) sobre shell #f8fafc;
  sidebar recolhível; skip-link visível em foco (fundo azul). A URL é
  caminho real (aba + obra), sem router.
- **Item ativo de navegação vertical:** `bg-blue-50/50` + texto azul +
  `border-l-2 border-blue-600` com `rounded-l-none` — o filete esquerdo marca
  ESTADO selecionado, nunca decoração de card. É o mesmo tratamento no Sidebar
  e na lista de pastas de Documentos; listas de navegação novas o reutilizam.

### Tabela (componente de assinatura)
- Fonte `text-xs` (14px), `border-collapse`, scroll horizontal sempre no próprio
  contêiner (`TableWrap`) — tabela nunca estoura a página. Todo `<th>` declara
  `scope` (imposto por teste). Cabeçalho fixo só via `rolagem="propria"`
  (max-h 70vh) — `sticky` escrito à mão numa célula não gruda e é proibido por
  teste. Primeira coluna pode ser `fixa` (sticky left, fundo opaco, sombra de
  1px à direita marcando a divisão).

### Alternador segmentado (`CONTROLE_GRUPO`)
- Moldura única (borda #e2e8f0, raio 8px, min-h 40px, `overflow-hidden`),
  segmentos colados (`items-stretch`): ativo = azul sólido + branco; inativo =
  branco + slate-600, hover slate-100. Min-h e não h: sob `pointer-coarse` o
  alvo cresce para 44px.

### KPI (componente de assinatura)
- Sem caixa: rótulo 12px bold uppercase slate-500 + número 20px mono bold
  slate-900 + detalhe 12px slate-500. Clicável vira `<button>` de verdade e
  ganha seta `ArrowUpRight` — o affordance não depende de hover.

### Named Rules
**A Regra do Foco Único.** Tudo foca igual: o anel `FOCO` (blue-500) é
compartilhado por botão, campo, KPI e segmento; destrutivo troca para
`FOCO_PERIGO` (rose-500). Um foco novo por componente é regressão.

## Do's and Don'ts

### Do:
- **Do** agrupar por título e espaço (`<Secao>` + 32px); a moldura é só para
  alvo clicável, alerta colorido ou lista que rola por dentro.
- **Do** usar os primitivos de `components/ui` para todo controle novo — campo,
  botão, tabela, KPI; as ~30 grafias de botão que existiam são o contraexemplo.
- **Do** escrever número em JetBrains Mono (`.data-font` / `mono`) e escolher a
  largura do campo pelo tipo do dado (`CAMPO_LARGURA`).
- **Do** tirar tom de barra/selo de `PREENCHIMENTO` — os valores já foram
  medidos ≥3:1 nos três fundos.
- **Do** manter 44px de alvo sob `pointer-coarse` — o app roda com luva e sol
  na tela.
- **Do** respeitar `prefers-reduced-motion`: entrada vira aparecimento
  imediato; saída vira fade curto (zerar duração quebra o `animationend`).

### Don't:
- **Don't** voltar à moldura por assunto: card dentro de card, dez blocos
  emoldurados por tela, `h-[calc(100vh-…)]` com rolagem aninhada.
- **Don't** usar estética de admin template: KPI em caixinha colorida, ícone em
  chip, gradiente em header, sombra decorativa.
- **Don't** colorir botão com cor de estado (verde "aprovar", âmbar "a vencer")
  — estado vive em selo e barra; botão tem papel.
- **Don't** descer texto abaixo de 12px, usar `text-[Npx]` arbitrário, ou
  `text-slate-400`/`300` em texto (2,56:1 e 1,48:1 — reprovam em qualquer fundo).
- **Don't** passar largura, altura, forma ou padding vertical de controle por
  className — perdem a disputa de utilitários para o token e viram declaração
  morta que engana quem lê o JSX.
- **Don't** declarar contagem de colunas de grade de cartões por breakpoint —
  a largura mínima medida do cartão decide (`GRADE_CARTOES`); a escada
  `md:2 lg:3 2xl:4` é o remendo que a Regra da Grade Medida aposentou.
- **Don't** escrever `sticky` à mão em célula de tabela, `outline-none` sem
  repor foco, ou `<button>` de ícone sem `aria-label` — os três são barrados
  por `estilo.test.ts`.
