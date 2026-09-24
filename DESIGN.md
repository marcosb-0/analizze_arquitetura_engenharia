---
name: Analizze
description: Gestão de obras — a trena da construtora: carcaça grafite, fita amarela que mede, ciano que age
colors:
  azul-acao: "#2ac6e2"
  azul-acao-hover: "#21b5d0"
  azul-acao-ativo: "#119db7"
  azul-foco: "#119db7"
  azul-acao-texto: "#05252d"
  amarelo-trena: "#f5c400"
  tinta-trena: "#161719"
  carcaca: "#161719"
  carcaca-borda: "#2c2e31"
  perigo: "#d0231b"
  perigo-hover: "#a81c15"
  grafite-titulo: "#161615"
  grafite-corpo: "#262624"
  grafite-controle: "#3b3b38"
  grafite-legenda: "#62625e"
  grafite-decorativo: "#9b9b94"
  grafite-borda-forte: "#c8c8c2"
  grafite-borda: "#e0e0db"
  grafite-camada: "#ececE9"
  grafite-fundo: "#f4f4f2"
  superficie: "#ffffff"
  escuro-fundo: "#0f1011"
  escuro-superficie: "#17181a"
  escuro-camada: "#1f2023"
  escuro-borda: "#2c2e32"
  escuro-legenda: "#9a9da3"
  escuro-titulo: "#f2f3f4"
  escuro-acao-texto: "#2ac6e2"
  positivo: "#047857"
  informativo: "#0369a1"
  atencao: "#b45309"
  destaque: "#7c4dff"
typography:
  display:
    fontFamily: "Barlow Semi Condensed, Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: "2.125rem"
    letterSpacing: "-0.01em"
  numero:
    fontFamily: "Barlow Semi Condensed, Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "\"tnum\" 1"
  titulo:
    fontFamily: "Barlow Semi Condensed, Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.25
  corpo:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  rotulo:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.08em"
rounded:
  fita: "3px"
  etiqueta: "6px"
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
    backgroundColor: "{colors.azul-acao}"
    textColor: "{colors.azul-acao-texto}"
    rounded: "{rounded.controle}"
    height: "40px"
    padding: "0 14px"
  button-primario-hover:
    backgroundColor: "{colors.azul-acao-hover}"
  button-secundario:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.grafite-corpo}"
    rounded: "{rounded.controle}"
    height: "40px"
    padding: "0 14px"
  button-perigo:
    backgroundColor: "{colors.perigo}"
    textColor: "{colors.superficie}"
    rounded: "{rounded.controle}"
    height: "40px"
    padding: "0 14px"
  input:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.grafite-corpo}"
    rounded: "{rounded.controle}"
    height: "40px"
    padding: "0 10px"
  card:
    backgroundColor: "{colors.superficie}"
    rounded: "{rounded.superficie}"
    padding: "{spacing.cartao}"
  chip:
    rounded: "{rounded.etiqueta}"
    padding: "2px 8px"
  trena:
    backgroundColor: "{colors.amarelo-trena}"
    rounded: "{rounded.fita}"
    height: "10px"
  menu:
    backgroundColor: "{colors.escuro-superficie}"
    textColor: "{colors.escuro-titulo}"
    width: "240px"
  menu-item-ativo:
    backgroundColor: "{colors.escuro-camada}"
    textColor: "{colors.escuro-titulo}"
    rounded: "{rounded.controle}"
    height: "40px"
---

# Design System: Analizze

## Overview

**Creative North Star: "A Trena"** — redesenho de 22/set/2026, que substituiu
por inteiro o "Catálogo de Alta Precisão" (cinza azulado Untitled UI + Inter).

O Analizze é a ferramenta que a construtora carrega no bolso: **carcaça
grafite** (o menu), **fita amarela que mede** (todo avanço físico) e o **azul
da marca que age** (todo botão, link e foco). A trena foi escolhida porque o
mecanismo do produto é MEDIR — medição de campo que vira avanço físico e
faturamento — e porque é o objeto que qualquer pessoa da obra lê de longe, sem
legenda: marca curta a cada 10, marca longa na metade, gancho na ponta.

A página continua sendo um documento que rola (herança mantida do sistema
anterior: seções abertas separadas por título e espaço, moldura só em alvo),
mas agora com **uma voz de display** (Barlow Semi Condensed, a grotesca de
placa de estrada) e títulos de página de verdade em todo destino do menu —
metade das abas não tinha título nenhum.

Claro e escuro são temas completos. O claro é o padrão do escritório; o escuro
é escolha do usuário (alternador na barra superior) ou do sistema operacional.
Nenhuma tela usa `dark:` — o tema inteiro é troca de variáveis (ver Colors).

**Key Characteristics:**
- Menu lateral grafite em qualquer tema (ilha escura); página clara ou escura.
- Três materiais com papéis que não se misturam: grafite = estrutura,
  amarelo = medida, ciano = ação.
- Avanço físico sempre como `<Trena>` graduada (ou `<AnelProgresso>` graduado
  onde o espaço é quadrado), nunca barra lisa nos lugares de assinatura.
- Barlow no corpo, Barlow Semi Condensed nos títulos e em todo número
  (algarismos tabulares). A JetBrains Mono saiu.
- Cada destino do menu abre com `<CabecalhoPagina>`: título display de 30px,
  descrição de uma linha, ação principal à direita.

## Colors

Estratégia **restrita com assinatura**: neutros grafite fazem quase tudo, o ciano
aparece só onde há ação, e o amarelo só onde há medida ou "você está aqui".

### Os três materiais
- **Ciano Ação** (`#2AC6E2`, token `acao`; hover `#21B5D0`, ativo `#119DB7`):
  cor base da marca e botão primário, com texto petróleo `#05252d`. Links e
  texto de hover usam `blue-600` (`#086D81`) no claro e `#2AC6E2` no escuro;
  o anel de foco usa `blue-500`. Texto escuro sobre o ciano: 7,85:1.
- **Amarelo Trena** (`#f5c400`, token `trena`) com **Tinta Trena**
  (`#161719`, `trena-tinta`): a fita. Preenchimento da `<Trena>`, lingueta do
  item de menu ativo, selo de pendência do item ativo, a marca. **Nunca texto
  sobre fundo claro** (1,6:1) e nunca botão. Tinta sobre amarelo: 10,9:1.
- **Grafite Carcaça** (`#161719`, `carcaca`): o menu, o placar de Indicadores,
  o bloco de emissão de contrato e o véu de modal/gaveta.

### Neutros — escala `slate` redefinida (grafite levemente quente)
Os PAPÉIS dos degraus são os mesmos do sistema anterior; só o hex mudou:
`50` fundo `#f4f4f2` · `100` camada `#ececE9` · `200` borda `#e0e0db` ·
`300` borda forte `#c8c8c2` · `400` decorativo/desabilitado `#9b9b94` ·
`500` **piso de texto** `#62625e` (4,55:1 sobre o `200`) · `600` `#4d4d49` ·
`700` controle `#3b3b38` · `800` corpo `#262624` · `900` título `#161615`.
`superficie` (`#ffffff` no claro) substitui `bg-white` em todo o app.

### Estado
Escalas do Tailwind (`emerald`, `rose`, `amber`, `sky`, `violet`, `indigo`…)
no claro; `PREENCHIMENTO`/`PREENCHIMENTO_HEX` para barra e série (≥3:1),
`CHIP` para selo (texto ≥4,5:1). `perigo` (`#d0231b`) é o único estado que vira
botão.

### Como o tema escuro funciona (tema.css)
No Tailwind 4 cada utilitário lê a variável em tempo de execução, então o
escuro é só redefinir `--color-*`:
- `slate` inverte mantendo o papel (50 = fundo `#0f1011`, 900 = título
  `#f2f3f4`); `superficie` vira `#17181a`.
- As escalas de estado espelham (`700` ← `300`, `50` ← `950` misturado à
  superfície): texto claro sobre fundo escuro tingido.
- `blue` também espelha (texto de ação `#2AC6E2` no escuro). `bg-acao` usa
  o ciano com texto petróleo nos dois temas; `bg-perigo` mantém texto branco.
  Escrever `bg-blue-600 text-white` num controle novo quebra o escuro — num
  `<button>` isso é barrado por `estilo.test.ts` (use `<Button>`).
- `CHIP`, `PREENCHIMENTO_HEX`, `GRAFICO_NEUTRO_HEX` e `DESTAQUE_PAINEL` são
  `var(--…)` com valor por tema, e funcionam em `style` inline e em atributo
  SVG do Recharts.

### Ilhas
- `data-ilha="escura"`: aplica o escuro a uma região (menu, painel de login).
  Os primitivos dentro dela se pintam sozinhos.
- `data-ilha="clara"`: o PAPEL. Prévia de proposta e contrato continuam folha
  branca com o app no escuro.

### Named Rules
**A Regra dos Três Materiais.** Azul age, amarelo mede, grafite estrutura. Um
botão amarelo, uma barra de avanço azul lisa num lugar de assinatura, ou um
título em azul são o mesmo erro: material no papel de outro.

**A Regra do Sólido Fixo.** Fundo sólido com texto branco usa token fixo
(`acao`, `perigo`, `carcaca`), nunca um degrau de escala — degraus invertem no
escuro.

**A Regra do Piso Medido** (herdada). Texto ≥4,5:1, elemento não textual
informativo ≥3:1 nos fundos do tema. `text-slate-400`/`300` continuam proibidos
por teste.

## Typography

**Display / Número:** Barlow Semi Condensed 500–700 (auto-hospedada, com `tnum`)
**Corpo:** Barlow 400–700 (auto-hospedada)

Barlow nasceu da sinalização rodoviária: legível a distância e sob luz forte. A
Semi Condensed é o numeral da trena — estreita, firme, e com algarismos
tabulares para que colunas de dinheiro alinhem. `font-mono`, `.data-font` e o
`--font-mono` do tema apontam para ela; "mono" no código significa "número",
não monoespaçada.

### Hierarchy
- **Título de página** (`.titulo-pagina`, 30px/700, −0,01em; 24px abaixo de
  640px): o h1 de cada destino, via `<CabecalhoPagina>`.
- **Número de KPI** (`text-2xl lg:text-3xl`, 700, `.data-font`): a maior voz
  dentro da página. No placar, `text-4xl sm:text-5xl`.
- **Título de seção** (`<Secao>`, `text-lg`/700, display): h2/h3 herdam a
  família display por regra global.
- **Corpo** (14px/400, `text-xs` — a escala do app começa deslocada, ver
  `index.css`). Piso confortável mantido.
- **Rótulo** (12px/600, maiúsculas, `tracking-[0.08em]`): rótulo de KPI e
  cabeçalho de tabela.

### Named Rules
**A Regra dos 14px** (herdada). Corpo nunca abaixo de 0,875rem; `text-[Npx]`
proibido por teste.

**A Regra do Número Condensado.** Todo valor de dado — dinheiro, quantidade,
percentual, código — usa `.data-font`/`font-mono` (Barlow Semi Condensed
tabular). Prosa nunca.

## Layout

Inalterado na estrutura: `#tab-viewport` é o único scroller (padding 24px);
`PaginaAba` declara **leitura** (960px), **painel** (1440px) ou **cheia**;
ritmo entre seções 32px; grades medidas (`GRADE_CARTOES`, `GRADE_PAINEIS`,
`GRADE_PAINEL_ASSIMETRICO`); `COLUNA_ANCORADA` com teto de
`calc(100vh-104px)` (topbar de 56px mantida por isso).

O que mudou: **todo destino abre com `<CabecalhoPagina>`**. Nas telas
mestre/detalhe (Clientes, Equipe, Fornecedores, Contratos) ele é o primeiro
filho da grade, com `col-span-full`. O console da obra abre com o nome da obra
no mesmo título display, e o botão de voltar ao lado.

**Indicadores (22/set/2026):** faixa escura "Precisa de você" (fila única de
ações, máx. 3) → três pilares em cartões lado a lado (Comercial · Operação ·
Financeiro), cada um com número principal, faixa de 3 métricas com explicação
no hover, lista curta ou o gráfico receita × despesa, e link de rodapé → linha
de detalhe (despesas por área, registros) → consulta recolhida (atrasos,
agenda). Pilar sem acesso some e a grade reparte a linha.

### Named Rules
**A Regra do Título Presente.** Nenhum destino do menu começa direto numa
lista. Onde estou é respondido pelo título grande, não pela migalha de 14px.

(Herdadas e ainda impostas por teste: Página que Rola, Grade Medida.)

## Elevation & Depth

Plano por padrão, profundidade por camada tonal, sombra só para estado. As
sombras agora usam `rgb(var(--sombra-cor) / α)`, que é grafite no claro e
preto no escuro:
- **Botão primário/perigo:** brilho interno de 1px + `0 1px 2px` a 20%.
- **Card interativo (hover):** `0 14px 28px -12px` a 22% + sobe 1px.
- **Modal:** `0 24px 48px -16px` a 35%, sobre véu `carcaca/60` com blur.
- **Drawer:** `shadow-2xl`, véu `carcaca/50`.

Véus usam `bg-carcaca/…`, nunca `bg-slate-900/…` — o `slate-900` fica claro no
escuro.

## Shapes

- **Fita** (3px): `<Trena>`.
- **Etiqueta** (6px, `rounded-md`): `<Chip>` — etiqueta impressa, não pílula;
  o ponto de status é um quadradinho de 2px de raio.
- **Controle** (8px, `rounded-lg`): botão, campo, alternador, item de menu.
- **Superfície** (16px, `rounded-2xl`): cartão, painel, modal. Aviso usa 12px.
- **Círculo**: avatar, pílula de filtro, alça de recolher o menu.
- Drawer continua sem raio (colado ao viewport).

## Components

### Trena (componente de assinatura, `ui/Trena.tsx`)
Fita graduada: trilho `slate-200`, preenchimento amarelo (ou tom de
`PREENCHIMENTO_HEX` quando o avanço carrega estado — atrasado = `negativo`,
finalizado = `positivo`), graduação a cada 10% e marca longa aos 50%
(`.trena-graduacao`), e o **gancho** de 3px em `trena-tinta` na ponta — é ele
que garante 3:1 contra qualquer fundo. `escala` mostra 0 · 50 · 100. Usada no
cartão de obra, na visão geral da obra, nas etapas em curso e na carteira de
Indicadores.

### AnelProgresso
Mesmo papel em espaço quadrado; agora graduado a cada 10% e com trilho e miolo
por tema.

### Menu lateral
Ilha escura de 240/64px. Marca no topo (`<Marca>`), busca de área, grupos com
rótulo maiúsculo. Item ativo: fundo `slate-100` da ilha + texto claro + **ícone
amarelo** + **lingueta** (`MENU_LINGUETA`: 3×16px amarelo, dentro do item, sem
ocupar caixa). Selo de pendência: `slate-200` inativo, amarelo no item ativo.
Pastas de Documentos reusam `MENU_ITEM`/lingueta em fundo claro.

### Barra superior
56px, fundo da página, borda inferior. Migalhas com a folha em `slate-900`
bold (ciano fica reservado à ação); busca global ao centro; **alternador de
tema** (lua/sol) e avatar à direita.

### CabecalhoPagina (`ui/CabecalhoPagina.tsx`)
h1 `.titulo-pagina` + descrição de uma linha (`max-w-prose`) + ações à
direita, alinhadas pela base.

### Buttons
Mesmas seis variantes; primário e perigo em cor fixa com brilho interno;
secundário com borda `slate-300` (legível sobre o fundo grafite claro). Rótulos
em caixa de frase ("Iniciar obra", "Nova proposta").

### Chip, Aviso, Card, Modal, Drawer, Tabela
Chip = etiqueta 6px, texto 600. Aviso = 12px de raio, tons do `CHIP`.
Card = superfície 16px, borda `slate-200`, sem sombra em repouso. Modal e
Drawer = cabeçalho na superfície (sem faixa cinza), título display 18px,
rodapé `slate-50`. Tabela = cabeçalho `slate-50` maiúsculo 12px, linhas de
10px de respiro vertical.

### Gráfico mensal (`dashboard/ReceitaDespesaMensal.tsx`)
Duas barras por mês em ordem fixa (receita, despesa), 2px de vão, topo de 4px,
cores `--serie-receita`/`--serie-despesa` (validadas; no escuro ficam na faixa
6–8 de ΔE para daltonismo, legal só com a legenda + ordem fixa + valor no hover
que o componente tem). Tabela `sr-only` com os mesmos números.

### Marca (`ui/Marca.tsx`, `public/favicon.svg`)
**Provisória.** "A" de esquadro com travessa graduada sobre o amarelo, e o
ponto ciano da marca. Trocar a logo = trocar esses dois arquivos.

## Do's and Don'ts

### Do:
- **Do** usar `<Trena>` para avanço físico/medido em lugar de destaque.
- **Do** abrir todo destino novo com `<CabecalhoPagina>`.
- **Do** usar `bg-superficie` (nunca `bg-white`) e `bg-carcaca/…` para véus.
- **Do** testar toda tela nova nos dois temas pelo alternador da barra.
- **Do** usar `data-ilha="clara"` em qualquer coisa que represente papel.

### Don't:
- **Don't** usar amarelo em botão, texto sobre claro ou decoração solta.
- **Don't** escrever `bg-blue-600`/`bg-rose-600` com `text-white` fora do
  `<Button>` — quebra o escuro (em `<button>`, barrado por teste).
- **Don't** pintar título ou migalha de ciano; ciano é ação.
- **Don't** usar `dark:` — o tema é variável, não variante.
- **Don't** voltar à moldura por assunto, `text-[Npx]`, `text-slate-400` em
  texto, `sticky` à mão em célula (regras herdadas, impostas por teste).
