---
name: Analizze
description: Gestão de obras — "Prumo": simples, arredondado, azul #1585CD sobre neutros frios
colors:
  marca: "#1585cd"
  acao: "#1479bd"
  acao-hover: "#126ba7"
  acao-ativo: "#0f5d90"
  acao-texto: "#ffffff"
  link: "#1272b0"
  perigo: "#d92d20"
  fundo: "#f4f7fa"
  camada: "#ebf0f5"
  borda: "#dfe6ed"
  borda-forte: "#c9d3dd"
  texto-piso: "#56626f"
  corpo: "#222b35"
  titulo: "#131a22"
  superficie: "#ffffff"
  escuro-fundo: "#0e1318"
  escuro-superficie: "#151c25"
  escuro-borda: "#232d38"
  escuro-titulo: "#f1f4f7"
  escuro-link: "#5fb3ea"
typography:
  display:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: "2.25rem"
    letterSpacing: "-0.02em"
  numero:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\" 1"
  titulo:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
  corpo:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  rotulo:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
rounded:
  chip: "9999px"
  controle: "12px"
  bloco-interno: "16px"
  superficie: "20px"
  modal: "24px"
spacing:
  base: "4px"
  botao-x: "16px"
  cartao: "20px"
  pagina: "24px"
  secao: "24px"
components:
  button-primario:
    backgroundColor: "{colors.acao}"
    textColor: "{colors.acao-texto}"
    rounded: "{rounded.controle}"
    height: "40px"
    padding: "0 16px"
  button-secundario:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.corpo}"
    rounded: "{rounded.controle}"
    height: "40px"
  input:
    backgroundColor: "{colors.superficie}"
    rounded: "{rounded.controle}"
    height: "40px"
  card:
    backgroundColor: "{colors.superficie}"
    rounded: "{rounded.superficie}"
    padding: "{spacing.cartao}"
  chip:
    rounded: "{rounded.chip}"
    padding: "2px 10px"
  menu-item-ativo:
    backgroundColor: "#eef6fc"
    textColor: "#0f5d90"
    rounded: "{rounded.controle}"
    height: "40px"
---

# Design System: Analizze

## Overview

**Creative North Star: "Prumo"** — redesenho de 28/out/2026, que substituiu
por inteiro o mundo "Trena" (grafite + amarelo + ciano, Barlow condensada).
O pedido do usuário: o app estava feio e com informação demais; queria
tipografia nova, blocos arredondados, aspecto simples e intuitivo, e o azul
`#1585CD` como base.

Prumo é o instrumento que diz se a parede está reta: uma linha só, sem
enfeite. A interface segue a mesma ideia — **um número por pergunta, uma
ação em destaque por bloco, o detalhe na aba própria**.

**Key Characteristics:**
- Fundo frio e claro (`#F4F7FA`), cartões brancos de 20px de raio com borda
  quase invisível e sombra longa e suave.
- Uma família, Figtree (geométrica, aberta). Hierarquia por tamanho e peso.
- Azul só onde se age ou se mede: botão primário, link, item de menu ativo,
  barra de avanço, foco.
- Sem caixa alta espaçada: rótulos em caixa de frase, peso 500.
- Menu lateral claro, na mesma superfície da página.

## Colors

Estratégia **restrita**: neutros frios fazem quase tudo, o azul marca ação,
seleção e progresso.

- **Marca** `#1585CD` (`blue-500`): logo, anel de foco, preenchimento de barra
  (`--fill-acao`), `--color-trena` (avanço físico).
- **Ação** `#1479BD` (`acao`): fundo do botão primário com texto branco
  (4,7:1). O `#1585CD` puro dá 3,98:1 com branco e reprova texto de 14px.
- **Link / texto azul** `#1272B0` (`blue-600`, 5,2:1 no branco); no escuro
  `#5FB3EA`.
- **Neutros `slate`** levemente azulados. Papéis: 50 fundo, 100 camada,
  200 borda, 300 borda forte, 500 piso de texto (4,9:1 sobre o 200),
  800 corpo, 900 título. `text-slate-400/300` continuam proibidos por teste.
- **Estado**: escalas do Tailwind via `CHIP`/`PREENCHIMENTO`. `perigo`
  (`#D92D20`) é o único estado que vira botão.

### Tema escuro (tema.css)
Mesmo mecanismo de antes: cada utilitário do Tailwind 4 lê a variável, e o
escuro só redefine `--color-*`. `slate` e `blue` invertem mantendo o papel;
`acao` e `perigo` são sólidos fixos. `data-ilha="clara"` mantém a prévia de
proposta/contrato como folha branca. O menu deixou de ser ilha escura.

### Named Rules
**A Regra do Azul que Age.** Azul é ação, seleção ou avanço. Título azul,
ícone decorativo azul sem função, ou fundo azul de seção são o mesmo erro.
**A Regra do Sólido Fixo.** Fundo sólido com texto branco usa token fixo
(`acao`, `perigo`), nunca um degrau de escala — degraus invertem no escuro.

## Typography

**Figtree 400–800**, variável, auto-hospedada (`public/fonts/Figtree-*.woff2`,
20 KB no caminho crítico). `font-mono`, `font-display` e `.data-font` apontam
para ela; "mono" no código significa "número tabular" (`tnum`).

- **Título de página** (`.titulo-pagina`): 28px/700, −0,02em (24px no celular).
- **Número de destaque**: `text-4xl` 700, −0,02em, `.data-font`.
- **Título de seção/cartão**: `text-lg`/`text-sm` 600.
- **Corpo**: 14px (`text-xs` — a escala do app é deslocada, ver `index.css`).
- **Rótulo**: 12–14px, peso 500, `slate-500`, caixa de frase.

**A Regra dos 14px** (herdada): corpo nunca abaixo de 0,875rem; `text-[Npx]`
proibido por teste.

## Layout

Estrutura herdada: `#tab-viewport` é o único scroller; `PaginaAba` declara
leitura/painel/cheia; `CabecalhoPagina` abre cada destino. O que mudou é a
**densidade**:

- **Indicadores**: data + saudação como título → cartão "Precisa de você"
  (fila única, máx. 3, linhas em bloco `slate-50` de 16px) → três cartões
  (Comercial, Obras, Financeiro), cada um com UM número, uma legenda, só os
  alertas que pedem ação (chips) e uma lista curta → "Atividade recente".
  Saíram: faixa de 3 métricas por pilar, despesas por área, atrasos
  recolhidos (repetiam a fila) e agenda.
- **Equipe**: 3 indicadores num cartão (quadro, custo, pendências); lista com
  no máximo UM selo por pessoa (o mais grave); a ficha em abas — Custo ·
  Contato e pagamento · Obras · Documentos — com a contagem no rótulo.

**A Regra do Detalhe na Aba.** O painel responde "preciso agir?"; o número
completo mora na aba da área. Se um número não leva a uma decisão na tela
inicial, ele não aparece nela.

## Elevation & Depth

Cartão: borda `slate-200/70` + `0 1px 2px` a 4% + `0 6px 20px -10px` a 12%
(cor `--sombra-cor`, azul-marinho no claro). Cartão interativo sobe 2px no
hover. Botão primário tem um halo azul (`0 4px 12px -4px` da marca a 45%).
Modal: 24px de raio, sem faixa de cabeçalho/rodapé cinza, véu `carcaca/40`
com blur. Drawer arredondado à esquerda (24px) a partir de `sm`.

## Shapes

- **Pílula** (`rounded-full`): chip, filtro, ponto de status, avatar, barra
  de progresso (`<Trena>`, agora lisa: trilho `--fill-trilha`, sem graduação
  nem gancho).
- **Controle** (12px, `rounded-xl`): botão, campo, item de menu, grupo
  segmentado.
- **Bloco interno** (16px, `rounded-2xl`): linha da fila, aviso.
- **Superfície** (20px, `rounded-superficie`): cartão, painel.
- **Modal** (24px, `rounded-3xl`).

## Components

- **Menu lateral**: superfície branca, borda direita; grupos com rótulo em
  caixa de frase; item ativo `blue-50`/`blue-700` com ícone `blue-600`.
- **Barra superior**: fundo da página, sem borda; migalhas com folha em 600.
- **Button**: primário `acao`; secundário branco com borda `slate-200`;
  suave `blue-50`/`blue-700`.
- **Field**: rótulo 14px/500 `slate-700`, caixa de frase.
- **Table**: cabeçalho `slate-50` 12px/600 em caixa de frase, linhas de 12px
  de respiro.
- **Abas**: sublinhado `blue-500`, rótulo ativo `blue-700`, contagem em
  pílula `blue-100`.
- **Marca** (`ui/Marca.tsx`, `public/favicon.svg`): **provisória** — "A"
  branco sobre quadrado `#1585CD` de 10px de raio.
- **Login**: painel azul sólido em bloco de 32px de raio, com cartões
  decorativos (sem texto) e a frase de posicionamento.

## Do's and Don'ts

### Do:
- Um número principal por cartão; o resto vai para a aba.
- Caixa de frase em todo rótulo, botão e cabeçalho.
- Usar os primitivos (`Card`, `Button`, `Chip`, `Abas`) — o raio e a sombra
  moram neles.

### Don't:
- Caixa alta espaçada (`uppercase tracking-*`) — saiu do app inteiro; só o
  documento impresso da proposta/contrato mantém a sua.
- Faixa de métricas secundárias sob um número principal.
- Mais de um selo por linha de lista.
- `bg-blue-600 text-white` em controle — quebra o escuro; use `<Button>`.
