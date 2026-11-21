---
name: Analizze
description: Padrão único de interface — uma escala, três pesos, três raios, um jeito de fazer cada coisa
colors:
  marca: "#0e7bf4"
  acao: "#0a67d1"
  acao-hover: "#0958b3"
  acao-ativo: "#0a52a6"
  acao-texto: "#ffffff"
  link: "#0b66cc"
  perigo: "#d92d20"
  fundo: "#f5f5f6"
  camada: "#ececee"
  borda: "#dcdce0"
  divisor: "#ececee"
  texto-apoio: "#53535d"
  texto-corpo: "#27272a"
  texto-titulo: "#18181b"
  superficie: "#ffffff"
typography:
  titulo-pagina: { fontFamily: "Figtree", fontSize: "24px", fontWeight: 600, heroui: "Typography h3" }
  titulo-secao: { fontFamily: "Figtree", fontSize: "18px", fontWeight: 600, heroui: "Typography h5" }
  titulo-bloco: { fontFamily: "Figtree", fontSize: "16px", fontWeight: 600, heroui: "Typography h6" }
  corpo: { fontFamily: "Figtree", fontSize: "14px", lineHeight: "24px", fontWeight: 400, heroui: "Typography body-sm" }
  apoio: { fontFamily: "Figtree", fontSize: "12px", lineHeight: "20px", fontWeight: 400, heroui: "Typography body-xs" }
  numero-destaque: { fontFamily: "Figtree", fontSize: "24px", lineHeight: "24px", fontWeight: 700 }
rounded:
  interno: "8px"
  controle: "12px"
  superficie: "16px"
  pilula: "9999px"
spacing:
  "1": "4px"
  "1.5": "6px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
---

# Padrão de interface — Analizze

Escrito em 16/nov/2026 a partir de uma medição do código (164 arquivos de tela,
fora de `src/components/ui/`), sem considerar os documentos de design
anteriores. Substitui o DESIGN.md "Prumo" — que continua no histórico do git.

Marca: **Analizze**, fonte **Figtree**, tema claro e escuro. Desde 16/nov/2026
a identidade visual é a do **HeroUI v3**: neutros zinc, azul **#0E7BF4** (o
botão usa **#0A67D1**, um passo abaixo, para o texto branco passar 4,5:1) e os
componentes do HeroUI por baixo dos primitivos de `components/ui` (§7). O que
este documento fixa é que cada decisão tem **uma** resposta.

**Regra-mãe:** tela não escreve estilo de componente. Tela compõe primitivos de
`components/ui` e só escreve classes de *layout* (`flex`, `grid`, `gap`,
largura). Se o primitivo não cobre o caso, o caso entra no primitivo.

---

## 1. Diagnóstico — o que a medição mostrou

Os primitivos (`Button`, `Input`, `Modal`, `Card`…) são coerentes entre si. A
variação mora nas telas, que escrevem tipografia, raio e espaçamento à mão.

| Assunto | Medido hoje | Padrão |
|---|---|---|
| Peso da fonte | 4 pesos; `font-bold` é o mais usado (426×) e 252 deles estão em texto de 12–14 px. `font-extrabold` 50× | 3 pesos; negrito 700 só em título de página e número de destaque |
| Títulos (`h1`–`h4`) | 30 combinações de tag × tamanho × peso × cor para ~85 títulos | 3 estilos de título |
| Tamanho de fonte | 9 tamanhos; 14, 15 e 16 px convivem (1 px de diferença não é hierarquia) | 6 tamanhos |
| Cor de texto neutro | 5 tons (`slate-500/600/700/800/900`); 600 e 700 são quase o mesmo hex | 3 tons |
| Texto de estado | `-600` e `-700` misturados (rose 39/27, emerald 27/31, amber 19/31) | sempre `-700`, de preferência via `Chip`/`Aviso` |
| Raio | 9 valores (2, 3, 4, 6, 8, 12, 16, 20, 24 px); `rounded` de 4 px 90× e `rounded-lg` 104× nas telas, enquanto os primitivos usam 12 e 20 | 3 raios + pílula |
| Bloco com borda feito à mão | 30 combinações de raio × padding × sombra | `Card` ou "bloco interno" (uma receita) |
| Espaçamento | passos de 2 px: `p-2.5` 46×, `p-3.5` 15×, `gap-2.5` 28×, `space-y-2.5`, `p-7`, `p-10` | base 4 px, com papel definido para cada passo |
| Sombra | 7 sombras nomeadas do Tailwind (55×) + 6 arbitrárias | 3 níveis |
| Ícone | 18 tamanhos (8 a 40 px); 13/14/15 px dividem 322 usos | 4 tamanhos |
| Botão | 6 variantes, duas com 5 usos somados; 93 `<button>` crus (83 deles são linha/texto clicável, sem estilo de botão) | 4 variantes + padrões nomeados para o que não é botão |
| Modal | 5 larguras; `lg` (512) e `md` (448) diferem 64 px | 4 larguras com critério |
| Tabela | 84 `<th>` e 117 `<td>` crus contra 92 `<Th>` e 112 `<Td>` — metade das células fora do primitivo | 100% `TableWrap`/`Th`/`Td` |
| Número | `font-mono` (199×) e `data-font` (80×) fazem a mesma coisa | uma classe |
| Fundo translúcido | `bg-slate-50/40`, `/50`, `/60` (24×) para o mesmo "bloco suave" | `bg-slate-50` |

Onde a divergência se concentra (ocorrências fora do padrão por arquivo):
`propostas/DocumentoProposta` 65 · `DocumentosPanel` 61 · `InsumosObra` 52 ·
`PropostaItens` 38 · `financeiro/RazaoLancamentos` 37 ·
`financeiro/PainelFinanceiro` 35 · `contratos/DocumentoContrato` 32 ·
`FornecedoresTab` 31 · `projeto-console/AbaOrcamento` 28 ·
`ConverterObraWizard` 24 · `propostas/ComparadorRevisoes` 24. Total: 1.042
ocorrências em 164 arquivos.

---

## 2. Tipografia

Uma família (Figtree). Desde 21/nov/2026 a tipografia é a do **`Typography` do
HeroUI**, escolhida **por papel**: o `type` dá o visual e a prop `render` dá o
elemento semântico (a especificação do HeroUI permite "h3 visual, h1
semântico"). O primitivo é `Titulo` (`ui/Texto.tsx`); corpo é `Typography`
direto. A escala do Tailwind não é mais redefinida — é a mesma que o HeroUI usa
por dentro nos botões, campos e chips.

| Estilo | Visual (HeroUI) | Peso | Cor | Como escrever | Onde |
|---|---|---|---|---|---|
| Título de página | `h3` 24 px | 600 | default | `<Titulo papel="pagina" como="h1">` | um por tela, via `CabecalhoPagina` |
| Título de seção | `h5` 18 px | 600 | default | `<Titulo papel="cartao" como="h2">` | `Secao`, ficha, janela |
| Título de bloco | `h6` 16 px | 600 | default | `<Titulo papel="bloco" como="h3">` | grupo dentro de página ou formulário |
| Título de item | `body-sm` 14 px | 600 | default | `<Titulo papel="item" como="h3">` | nome de cartão pequeno, item de lista |
| Corpo | `body-sm` 14 / 24 | 400 | default | `<Typography type="body-sm">` | texto corrido |
| Apoio | `body-xs` 12 / 20 | 400 | `muted` | `<Typography type="body-xs" color="muted">` | descrição, ajuda, metadado |
| Número de destaque | 24 / 24 | 700 | `slate-900` | `text-2xl font-bold font-mono` | valor de `Kpi` e total de painel |

Fora de `<p>`/`<hN>` (célula, rótulo, chip, botão) o tamanho continua em
classe: `text-xs` = 12, `text-sm` = 14 (o corpo), `text-base` = 16, `text-lg` = 18.

A cor "default" do HeroUI foi ajustada para **herdar** (`index.css`): numa
superfície comum dá o mesmo `--foreground`; dentro de chip, aviso ou painel
colorido, mantém a cor do contexto.

**Pesos — três, com função:**

- **400** texto corrido e dado.
- **500** (`font-medium`) rótulo de campo, item de menu, ênfase dentro de frase.
- **600** (`font-semibold`) títulos, botão, cabeçalho de tabela, chip, aba ativa,
  nome principal de uma linha de lista, total de tabela.
- **700** só nos dois estilos da tabela acima. `font-extrabold` não existe.

Ênfase em texto pequeno se faz com **cor** (`slate-900` em vez de `slate-500`)
ou peso 600 — nunca com 700. Quando tudo é negrito, nada é.

**Regras:**

- Não existe `<h4>`: abaixo do título de bloco, o rótulo é `papel="item"`.
- `<hN>`/`<p>` com tamanho escrito à mão é barrado pelo `estilo.test.ts`.
- Sem caixa alta e sem `tracking-*` no app. Exceção única: a folha impressa de
  proposta e contrato (`data-ilha="clara"`), que é papel e tem regra própria.
- Número (dinheiro, quantidade, percentual, data em coluna) leva `font-mono`,
  que aqui significa "algarismo tabular". `data-font` deixa de ser usada.
- Coluna de número alinha à direita.
- Texto corrido tem no máximo `max-w-prose`.
- `text-2xs` não existe mais; `text-xl`, `text-3xl`, `text-4xl` e qualquer
  `text-[…]` não têm papel.

---

## 3. Cor

### Neutros (escala `slate`, já definida em `index.css`/`tema.css`)

| Papel | Token | Uso |
|---|---|---|
| Fundo da página | `bg-slate-50` | também o "bloco suave" dentro de cartão |
| Superfície | `bg-superficie` | cartão, modal, campo, menu |
| Camada | `bg-slate-100` | trilho de alternador, hover de linha e de botão fantasma, trilha de barra |
| Borda | `border-slate-200` | contorno de cartão, campo, bloco |
| Divisor | `border-slate-100` | linha *dentro* de uma superfície (linhas de tabela, rodapé de modal) |
| Texto de título e valor | `text-slate-900` | |
| Texto de corpo | herdado (`slate-800`) | não se declara |
| Texto de apoio | `text-slate-500` | piso de contraste; nada abaixo dele é texto |

`text-slate-600` e `text-slate-700` saem: viram corpo (sem classe) ou apoio.
`border-slate-300` só em `hover`. Fundo com opacidade (`/40`, `/50`, `/60`) sai.

### Azul — ação e seleção

| Papel | Token |
|---|---|
| Botão primário | `bg-acao` (hover `acao-hover`, ativo `acao-ativo`), texto branco |
| Link e ação em texto | `text-blue-600` |
| Selecionado (menu, linha, pílula, aba) | fundo `bg-blue-100` ou `bg-blue-50`, texto `text-blue-700` |
| Foco de teclado | anel `blue-500` (token `FOCO`) |
| Barra de progresso, marca | `blue-500` (`PREENCHIMENTO.acao`) |

Azul é **só** ação, seleção e progresso. Não decora título, ícone solto ou
cartão.

### Estado — quatro significados

| Significado | Matiz | Texto | Fundo | Borda |
|---|---|---|---|---|
| Positivo (pago, aprovado, no prazo) | emerald | `-700` | `-50` | `-200` |
| Atenção (pendente, vence logo) | amber | `-700` | `-50` | `-200` |
| Negativo (erro, atrasado, reprovado) | rose | `-700` | `-50` | `-200` |
| Informativo | blue | `-700` | `-50` | `-200` |

- Status é sempre `<Chip tom="…">`; mensagem é sempre `<Aviso tom="…">`. Tela
  não monta pílula nem faixa colorida à mão.
- Valor monetário negativo: `text-rose-700`. Positivo só ganha verde quando o
  sinal é a informação (resultado, saldo); senão fica `slate-900`.
- Violeta, índigo, céu, teal, roxo, rosa e laranja não comunicam estado. Só
  aparecem como **cor de categoria**, vinda de um mapa nomeado (categorias do
  catálogo em `catalogo/categorias.tsx`, cor de pasta em Documentos, violeta
  de "composição"), como `Chip tom="destaque" | "alternativo"` e como série
  de gráfico (`PREENCHIMENTO`). Nunca escolhidas na hora, numa tela.
- Botão destrutivo usa `perigo`, não `rose`.
- Nenhum hex em arquivo de tela.

Tema escuro: nada a fazer na tela. Ele redefine as mesmas variáveis; por isso
`dark:` e hex são proibidos.

---

## 4. Espaçamento

Base 4 px. Cada passo tem um papel — a pergunta é "que relação é esta?", não
"quanto fica bonito?".

| Valor | Classe | Papel |
|---|---|---|
| 4 | `1` | campo → texto de ajuda; itens de uma lista compacta |
| 6 | `1.5` | ícone ↔ texto; rótulo → campo |
| 8 | `2` | entre controles irmãos (botões, filtros, chips) |
| 12 | `3` | padding de bloco interno, de célula de tabela e de item de lista |
| 16 | `4` | entre campos de formulário; entre cartões; título de seção → conteúdo |
| 20 | `5` | padding de cartão |
| 24 | `6` | padding da página e lateral de modal/gaveta; entre grupos de um formulário |
| 32 | `8` | entre seções da página |

Saem de uso: `2.5`, `3.5`, `7`, `10` (arredonde para o vizinho) e `0.5` fora do
chip. Espaço vertical grande (`py-16`, `py-24`) só em estado vazio, e ele vem
do `EmptyState`.

Página: `PaginaAba` define largura (`leitura` 960 · `painel` 1440 · `cheia`) e
o ritmo entre seções. Grade de formulário: 1 coluna no modal `md`, 2 colunas no
`xl`, sempre `gap-4`.

---

## 5. Forma, borda e sombra

**Raio — três valores e a pílula:**

| Raio | Classe | Para |
|---|---|---|
| 8 | `rounded-lg` | o que mora *dentro* de um controle ou bloco: miniatura, realce de célula, item de menu suspenso |
| 12 | `rounded-xl` | controle: botão, campo, alternador, item de menu, bloco interno, `Aviso`, menu suspenso |
| 16 | `rounded-superficie` | superfície: cartão, modal, gaveta |
| pílula | `rounded-full` | chip, avatar, pílula de filtro, barra de progresso |

`rounded` (4), `rounded-md` (6), `rounded-2xl` (16), `rounded-3xl` (24) e
`rounded-[…]` saem. Elemento aninhado tem sempre raio menor que o pai.
Exceção: marca de gráfico (barra, quadradinho de legenda, barra do Gantt) tem
raio próprio de 2–4 px — é geometria do dado, não de superfície.

**Borda:** 1 px, `slate-200`. Não existe borda de 2 px nem borda lateral
colorida; a linha selecionada usa `LINHA_SELECIONADA`.

**Sombra — três níveis:**

| Nível | Para | Valor |
|---|---|---|
| 0 | bloco interno, linha, campo | nenhuma |
| 1 `shadow-cartao` | `Card`, botão | `0 1px 2px rgb(var(--sombra-cor)/.04), 0 6px 20px -10px rgb(var(--sombra-cor)/.12)` |
| 2 `shadow-flutuante` | menu suspenso, popover, toast, barra fixa | `0 8px 20px -8px rgb(var(--sombra-cor)/.30)` |
| 3 `shadow-dialogo` | modal e gaveta | `0 24px 64px -16px rgb(var(--sombra-cor)/.35)` |

`shadow`, `shadow-sm/md/lg/xl/2xl` e `shadow-[…]` não aparecem em tela.

**Duas superfícies, não trinta:**

- **Cartão** = `<Card>`: fundo branco, borda, raio 16, padding 20, sombra 1.
- **Bloco interno** (dentro de cartão ou modal) = `rounded-xl border
  border-slate-200 bg-slate-50 p-3`, sem sombra.

Cartão dentro de cartão não existe: dentro de cartão só bloco interno.

---

## 6. Ícones

Lucide, traço padrão. Quatro tamanhos:

| Tamanho | Para |
|---|---|
| 12 | dentro de chip e ao lado de texto de apoio |
| 14 | ao lado de corpo, botão `sm`, linha de tabela, `IconButton sm` |
| 16 | botão `md`, campo, menu, `IconButton md` |
| 20 | ícone de cabeçalho (`CardHeader`, gaveta) |

Estado vazio usa 32, pelo `EmptyState`. Ícone herda a cor do texto; ícone
decorativo solto é `slate-500`.

---

## 7. Componentes

**Todos os primitivos de `components/ui` são HeroUI v3 por dentro**, com a API
de sempre — a tela não importa de `@heroui/react`, importa de `./ui`:

| Primitivo | HeroUI por baixo |
|---|---|
| `Button` / `IconButton` | `Button` (`primario`→primary, `secundario`→outline, `fantasma`→ghost, `perigo`→danger) |
| `Input` / `Textarea` | `Input` / `TextArea` |
| `Select` | `Select` + `ListBox`, adaptado para ler `<option>`/`<optgroup>` e devolver `{ target: { value } }` |
| `Checkbox`, `GrupoRadio` / `Radio` | `Checkbox`, `RadioGroup` / `Radio` |
| `Modal` / `Drawer` | `Modal` / `Drawer` — foco preso, Esc, rolagem travada e saída animada vêm do React Aria |
| `Abas` | `Tabs` · `Pilula` → `ToggleButton` · `AnelProgresso` → `ProgressCircle` |
| `Card`, `Chip`, `Avatar`, `Aviso` | `Card`, `Chip`, `Avatar`, `Alert` |
| `TableWrap` / `Th` / `Td` | classes `table__*` do HeroUI sobre `<table>` nativo |
| toast e `confirm` (`useFeedback`) | fila `toast` + `Toast.Provider` e `AlertDialog` |

Três armadilhas que já custaram tempo:

- O React Aria **filtra `title`** das props. `Button`, `IconButton`, `Pilula` e
  o gatilho do `Select` o aplicam no nó por `ref`; componente novo sobre o
  HeroUI precisa fazer o mesmo.
- O `.card` do HeroUI é `flex flex-col gap-3 p-4`. O `Card` devolve bloco (ou
  linha, quando a tela escreve `flex`) e zera o gap; não passe a usar
  `HeroCard` direto em tela.
- Chip e Aviso usam a **estrutura** do HeroUI com as **cores** de `CHIP` em
  `tokens.ts`, cujo contraste o `estilo.test.ts` mede. As cores `soft` do
  HeroUI não passam esse guarda.

### Botão

| Variante | Para | Regra |
|---|---|---|
| `primario` | a ação da tela ou do diálogo | **um** por tela e um por modal |
| `secundario` | ação alternativa e "Cancelar" | |
| `fantasma` | ação de baixa ênfase, em barra de ferramenta ou linha | |
| `perigo` | excluir, cancelar contrato, estornar | substitui o primário no diálogo de confirmação |

`acao` e `suave` saíram (14 usos): viraram `fantasma` e `secundario`.

- Tamanhos: `md` 40 px (padrão — cabeçalho de página, formulário, rodapé de
  modal) e `sm` 28 px (só dentro de linha de tabela, cabeçalho de cartão e
  barra densa). Dois botões lado a lado têm o mesmo tamanho.
- Texto: verbo + objeto, sem caixa alta ("Salvar proposta", "Nova obra").
- Ícone à esquerda do texto; só ícone → `IconButton` com `rotulo`.
- Ordem: secundário à esquerda, primário à direita, grupo alinhado à direita.
- Carregando: `carregando` (spinner + desabilitado), nunca texto "Salvando…"
  trocado à mão.

**O que não é botão** tem nome próprio, e `<button>` cru só existe dentro deles:
linha clicável (`LINHA_SELECIONADA`), `Pilula`, `Abas`, alternador
(`Alternador`, o `ToggleButtonGroup` do HeroUI), `Kpi` clicável e link em texto (`text-blue-600
hover:underline`).

### Campo

- Sempre `<Field label>` + `<Input | Select | Textarea>`. Rótulo acima, 14/500;
  ajuda e erro abaixo, 12 px.
- Altura 40 px (`md`); `sm` 28 px só em linha de tabela.
- Fundo `branco` sobre a página e em modal; `suave` não é mais necessário
  dentro de cartão (o cartão é branco, o campo tem borda).
- Obrigatório: asterisco do `Field`. Erro: mensagem no campo, não em toast.
- Número: `mono` + largura do tipo (`quantidade`, `dinheiro`, `percentual`).

### Modal e gaveta

| Largura | Para |
|---|---|
| `sm` 384 | confirmação e aviso |
| `md` 448 (padrão) | formulário de uma coluna |
| `xl` 672 | formulário de duas colunas ou com tabela |
| `full` 1024 | documento, prévia, comparação |

`lg` saiu (6 usos → `xl`, todos formulários de duas colunas).

- Anatomia fixa, vinda do primitivo: título 18/600 + descrição opcional 14
  `slate-500`; corpo com 24 px laterais; rodapé com divisor, botões à direita.
- Tela não escreve cabeçalho, `X` de fechar nem rodapé dentro do corpo.
- Véu: o do `Modal.Backdrop` do HeroUI. A paleta de busca e as prévias de
  proposta/contrato (overlays próprios) seguem com `bg-carcaca/40
  backdrop-blur-sm`.
- **Modal** cria, edita e confirma. **Gaveta** mostra detalhe sem tirar a lista
  de vista. Modal sobre modal só para confirmação.

### Tabela

- Sempre `TableWrap` + `Th` + `Td`. Cabeçalho 12/600 `slate-500` sobre
  `slate-50`; célula 14 px, padding 12; divisor `slate-100`; sem zebra.
- Número à direita com `mono`; ações na última coluna com `IconButton sm`.
- Linha de total: peso 600, borda superior `slate-200`, sem fundo colorido.

### Demais

- **Chip**: todo status. 12/600, pílula, com `ponto` quando a cor é a única
  diferença.
- **Aviso**: toda faixa de mensagem dentro da página.
- **Kpi / FaixaKpis**: todo número de destaque; sem moldura.
- **Abas** para trocar de assunto na mesma tela; **Pilula** para filtrar;
  `Alternador` (`ToggleButtonGroup` do HeroUI) para trocar a visualização do mesmo dado.
- **Estado vazio**: `EstadoDaLista` (lista com filtro) ou `EmptyState`.
- **Avatar**: `sm` 32 em lista, `md` 40 em ficha.

---

## 8. Movimento

- Hover e foco: `transition` de 150 ms.
- Modal, gaveta, menu suspenso, toast e confirmação animam pelo HeroUI
  (React Aria). Os overlays próprios (paleta de busca, prévias de documento) e
  os cartões usam as classes `anim-*` de `index.css`. Nenhuma `duration-*` ou
  `ease-*` em tela.
- Nada se move para decorar; `prefers-reduced-motion` já é respeitado nas
  classes.

---

## 9. Faça / não faça

**Faça**
- Componha com `PaginaAba` → `CabecalhoPagina` → `Secao` → `Card`.
- Deixe o corpo herdar cor e tamanho; declare só o que foge (título, apoio).
- Use `gap` no contêiner em vez de margem no filho.

**Não faça**
- `font-bold`/`font-extrabold` em texto de 12–16 px.
- `rounded`, `rounded-md`, `rounded-2xl`, sombra nomeada, meio-passo de espaço.
- Cor de matiz, hex ou `dark:` em arquivo de tela.
- `className` em primitivo para mudar tamanho, raio, cor ou padding — só layout.
- Cartão dentro de cartão; `<h4>`; caixa alta.

---

## 10. Estado da migração (16/nov/2026)

**Aplicado** em 145 arquivos, com `npm run verify` verde:

- Tokens: `--text-sm` em 16 px; `shadow-cartao`, `shadow-flutuante` e
  `shadow-dialogo`; `Modal`/`Drawer` com raio 20 e `Aviso` com 12; `Kpi` fixo
  em 24 px; `Button` sem `acao`/`suave`; `Modal` sem `lg`.
- Varredura: peso, tamanho, tons neutros e de estado, raio, meio-passo de
  espaço, sombra, ícone, caixa alta, `<h4>`, `data-font`, fundo translúcido.
- Trava: bloco "padrão único de UI" em `src/estilo.test.ts` (8 regras, cada
  uma conferida com uma violação plantada).

**Fora de propósito:** a folha impressa (`DocumentoProposta.tsx`,
`DocumentoContrato.tsx`) e as marcas de gráfico.

**Segunda passada (mesmo dia, conferida no navegador logado):**

- 126 células `<th>`/`<td>` cruas → `Th`/`Td` em 9 arquivos. `Td` deixou de
  fixar `text-slate-800`: a classe vencia qualquer cor passada por `className`
  (medido no navegador), então verde, vermelho e cinza de apoio se perdiam.
- 7 cartões feitos à mão → `<Card>`; popovers em raio 12 + `shadow-flutuante`.
- Véu único (`bg-carcaca/40 backdrop-blur-sm`) nas prévias de
  proposta/contrato e na paleta de busca.
- `<button>` crus: só 1 tinha cara de botão (virou `Button`); os demais são
  linha, texto ou controle nomeado do §7.

**Fica como está, de propósito:** a grade do cronograma (`AbaCronograma`,
`gantt/GradeWbs`) mantém `<td>` cru — a altura da linha casa com as barras do
Gantt. Selos de contagem (menu, pastas, calendário) não são status e não
viram `Chip`.

**Troca para o HeroUI v3 (16/nov/2026, mesmo dia):** paleta Prumo → neutros
zinc + azul HeroUI; todos os primitivos do §7 reescritos sobre o HeroUI;
12 checkboxes e 3 rádios crus → `Checkbox`/`Radio`; 9 `<button>` com cara de
botão → `Button`; toast e confirmação no HeroUI. Ficam crus de propósito:
links de texto e linhas/cartões clicáveis (o `Link` do HeroUI sem `href` vira
`span role="link"`, semântica errada para ação), inputs de arquivo, a busca da
paleta, as células de preço da proposta e o campo de hora da chamada. O
`Select` perdeu o seletor nativo do celular — decisão tomada com o usuário.

**Falta:** conferir com dados reais as telas que o banco de teste não
preenche — obra (orçamento, insumos, consumo, medições), folha de salários e
resultado por obra.
