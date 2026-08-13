/**
 * Tokens compartilhados pelos primitivos de UI.
 *
 * Exportados como string (e não só embutidos nos componentes) para que o código
 * ainda não migrado possa importar o mesmo foco/transição em vez de inventar o
 * seu. Antes havia 129 variações de `outline-none focus:border-blue-600` e mais
 * de 30 do mesmo botão primário.
 */

/**
 * Anel de foco padrão.
 *
 * `focus-visible` e não `focus`: o anel aparece para quem navega por teclado e
 * não pisca a cada clique de mouse — que era a razão original de alguém ter
 * escrito `outline-none` e removido o indicador do browser inteiro.
 *
 * Usa `ring` (box-shadow) e não `outline` de propósito: `outline-none` continua
 * espalhado pelo código e venceria uma regra de outline na cascata, mas não
 * interfere em box-shadow.
 */
export const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500';

/** Variante do anel para ações destrutivas, para o foco não contradizer o botão. */
export const FOCO_PERIGO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-rose-500';

/**
 * Campo de formulário: borda, fundo, foco e estado desabilitado.
 *
 * CORREÇÃO 04/ago/2026 — o token tinha o defeito que o `Input` diz ter corrigido.
 *
 * Ele carregava `outline-none focus:border-blue-500` e mais nada. `outline-none`
 * é utilitário, e em camadas do CSS a ORDEM vence a especificidade: ele anula a
 * regra `:focus-visible` global do `index.css`, que é `@layer base`. Como nada
 * repunha o indicador, `<Input>`, `<Select>` e `<Textarea>` ficavam sem foco
 * visível nenhum — só a troca de cor de borda de 1px que o cabeçalho do
 * `Input.tsx` cita como o problema que ele veio resolver.
 *
 * Ninguém viu o defeito porque os três primitivos tinham ZERO usos (§7, adoção
 * de 5%). Os 205 campos crus do app tinham o anel escrito à mão, então adotar os
 * primitivos teria REMOVIDO o indicador de 205 campos — o oposto do que a adoção
 * promete, e sem nada na tela indicando isso.
 *
 * Agora reusa `FOCO`, o mesmo anel do `Button`. É o que o design system deve
 * fazer: campo e botão focam igual, e há um lugar só para mudar isso. O
 * `outline-none` deixou de ser incondicional — `FOCO` só o aplica em
 * `focus-visible`, então a regra global do `index.css` volta a valer como rede
 * para qualquer estado que este token não previu.
 */
export const CAMPO_BASE =
  'rounded-lg border border-slate-200 text-slate-800 placeholder:text-slate-500 ' +
  `transition ${FOCO} focus-visible:border-blue-500 ` +
  'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ' +
  'aria-[invalid=true]:border-rose-400';

/**
 * Fundo do campo. Saiu de `CAMPO_BASE` para virar escolha explícita.
 *
 * `bg-slate-50` aparecia em 34 campos crus — é o campo dentro de um cartão, onde
 * o branco sobre branco some. Não dá para passá-lo por `className`: em Tailwind,
 * dois utilitários da MESMA propriedade não são decididos pela ordem no
 * atributo, e sim pela ordem em que saem no CSS. `bg-slate-50` depois de
 * `bg-white` na string pode perder, e o modo de falha é um campo com o fundo
 * errado que ninguém consegue explicar olhando o JSX.
 */
export const CAMPO_FUNDO = {
  branco: 'bg-white',
  suave: 'bg-slate-50',
} as const;

export type FundoCampo = keyof typeof CAMPO_FUNDO;

/**
 * Largura do campo. Saiu de `CAMPO_BASE` pelo MESMO motivo do fundo, e o defeito
 * já tinha aparecido duas vezes na tela (auditoria-360 §M).
 *
 * `CAMPO_BASE` carregava `w-full` incondicional. Quem precisava de um campo
 * estreito escrevia `className="w-auto"` — e perdia, porque dois utilitários da
 * mesma propriedade são decididos pela ordem em que saem no CSS, não pela ordem
 * no atributo. O select de situação em Contratos ficava com 354 px dentro de uma
 * coluna de 380 e vazava 155 px para fora do cartão; os quatro filtros do
 * Catálogo mediam 990 px cada e terminavam fora da viewport. Nos dois casos o
 * JSX dizia `w-auto` e a tela mostrava largura cheia — o modo de falha que o
 * comentário de `CAMPO_FUNDO` descreve, agora na largura.
 *
 * O padrão continua `cheia`, então nenhum dos campos existentes muda.
 *
 * COMPLEMENTO 11/ago/2026 — as entradas por TIPO DE CONTEÚDO, e o porquê de
 * `min-width` morar aqui e não na tela.
 *
 * O `w-full` incondicional não só vencia o `w-auto` de quem queria um campo
 * estreito: ele vencia QUALQUER largura escrita na `className`. Medido no
 * navegador, `w-full w-16` e `w-16 w-full` renderizam os dois a 100% — a ordem
 * no atributo não importa, e não existe ordem que faça o `w-16` ganhar. Os
 * cinco campos do app que declaravam largura (`w-16`, `w-24`, `w-40`, `w-64`)
 * eram, todos, código morto: o que mandava era a largura do pai.
 *
 * O sintoma caro estava na tabela de insumos da obra, onde o pai é uma coluna
 * de 80 px: o campo de quantidade ficava com 38 px úteis para um número que
 * pede 42 px, e "18.26" aparecia como "18," na tela. **Isso é risco de erro de
 * orçamento, não questão de gosto** — o campo escondia justamente o número que
 * multiplica o preço.
 *
 * Por isso o piso é do TIPO e mora no token: quem escreve a tela sabe o espaço
 * que tem, mas é o tipo do dado que decide o quanto é pouco demais. Os valores
 * saem de medição na fonte real do app (mono 14 px, padding 22 px): uma
 * quantidade de 9 dígitos ocupa 98 px, e um preço de 6 dígitos, 98 px.
 */
export const CAMPO_LARGURA = {
  cheia: 'w-full',
  /** Ajusta ao conteúdo. Para filtro ao lado de uma busca que deve crescer. */
  automatica: 'w-auto',
  /** Preenche a coluna, mas nunca abaixo do número que precisa mostrar. */
  quantidade: 'w-full min-w-[110px]',
  dinheiro: 'w-full min-w-[120px]',
  /** 0–100 é curto: largura fixa, e `shrink-0` porque em linha `flex` até uma
   *  largura declarada encolhe. */
  percentual: 'w-20 shrink-0',
  /** Cresce com o espaço — com piso, para não repetir os 2 px úteis a que a
   *  busca de Contratos chegou quando a coluna apertou. */
  busca: 'w-full min-w-[160px]',
} as const;

export type LarguraCampo = keyof typeof CAMPO_LARGURA;

/**
 * Área mínima de clique — o piso que o botão de ícone não tem como declarar
 * sozinho, porque ele só conhece o próprio `padding`.
 *
 * ## O que foi medido, e por que o número "49 alvos" precisa de nota de rodapé
 *
 * A auditoria visual contou **49 alvos abaixo de 24 px**. Medido de novo no
 * navegador, nas 12 abas, o número se confirma — mas aplicando a regra da WCAG
 * 2.5.8 **inteira**, com a exceção de espaçamento (um alvo pequeno passa se um
 * círculo de 24 px centrado nele não tocar o de outro alvo), só **4** reprovam
 * hoje: os dois botões de ação da lista de pendências da proposta (40×16, a
 * 20 px de distância) e o par editar/excluir do cartão de tarefa (21×21, a
 * 23 px). Os 21×21 do Catálogo passam **por 1 px** — 21 de largura mais os 4 do
 * `gap-1` dão exatamente 25 px entre centros.
 *
 * Passar por 1 px de folga não é passar: qualquer mudança de densidade, de
 * fonte ou de `gap` reprova a tela inteira de uma vez, e ninguém vai medir de
 * novo. Por isso o piso é do TAMANHO e mora no token, do mesmo jeito que
 * `CAMPO_LARGURA` — a tela sabe o espaço que tem, mas é o controle que decide
 * quanto é pouco demais para acertar com o dedo.
 *
 * `md` fica em 28 px e não em 24: 24 é o mínimo da norma, e mínimo de norma
 * usado como alvo devolve o problema do "passa por 1 px". `sm` fica em 24 —
 * é o botão de linha de tabela densa (Catálogo, 5 por linha), onde 28 custaria
 * largura de coluna sem que ninguém tivesse pedido.
 *
 * `pointer-coarse` é o dedo: a WCAG 2.5.5 (AAA) pede 44×44, e num app que roda
 * no canteiro, com luva e sol na tela, esse é o número que vale de fato. Sai em
 * media query, então não disputa com o `min-h` do desktop — é o mesmo motivo
 * pelo qual `sm:w-64` ficou de fora da regra de largura de campo.
 */
export const ALVO = {
  md: 'min-h-7 min-w-7 pointer-coarse:min-h-11 pointer-coarse:min-w-11',
  sm: 'min-h-6 min-w-6 pointer-coarse:min-h-11 pointer-coarse:min-w-11',
} as const;

/**
 * Separação extra do controle destrutivo em relação ao vizinho.
 *
 * O par editar/excluir do cartão de tarefa está a 4 px um do outro, e é o único
 * lugar do app onde errar o clique por 4 px apaga um registro. A separação não
 * pode morar na tela (são 18 contêineres com `gap-1`/`gap-0.5`, e corrigir à
 * mão foi exatamente o que deixou nove `w-auto` para trás no 2º lote): mora no
 * próprio botão, que é quem sabe que é destrutivo.
 *
 * `:not(:first-child)` porque um "excluir" sozinho no cartão não tem de quem se
 * afastar — e a margem ali só empurraria o botão para dentro do próprio card.
 */
export const ALVO_PERIGO_SEPARADO = '[&:not(:first-child)]:ml-1.5';

/**
 * Altura do controle de linha única — botão, `input`, `select`.
 *
 * ## A altura era EMERGENTE, e por isso um mesmo `tamanho` dava três valores
 *
 * Até aqui ninguém declarava altura em lugar nenhum: ela saía da soma de
 * `padding` vertical + `line-height` + borda, calculada em dois lugares
 * diferentes (`CAMPO_TAMANHO` para o campo, `TAMANHOS` para o botão) e sem que
 * nenhum dos dois contasse a borda. Medido no navegador, com o mesmo
 * `tamanho="md"`:
 *
 * | Controle | Conta | Altura |
 * |---|---|---|
 * | `Button` `primario` | 8+8 de padding + 20 de linha, sem borda | **36 px** |
 * | `Button` `secundario` | o mesmo + 1+1 de borda | **38 px** |
 * | `Input` / `Select` | 8+8 + 20 + borda | **38 px** |
 *
 * E em `sm`: botão 28 (primário) ou 30 (secundário), campo 26.
 *
 * O sintoma está na barra do Catálogo, onde "Buscar no SINAPI" (`secundario`,
 * 38 px) e "Novo Insumo" (`primario`, 36 px) são irmãos numa `flex items-center`
 * — dois botões do mesmo tamanho declarado, 2 px diferentes, e o topo de um
 * 1 px acima do outro. **É a variante decidindo a altura**, o que nada no JSX
 * insinua: quem escreve `tamanho="md"` acha que escolheu a altura.
 *
 * A correção não é acertar o padding de cada combinação — é tirar a altura das
 * mãos da soma. `h-*` vence padding e borda de uma vez (`box-sizing: border-box`
 * é o padrão do Tailwind), então a borda do `secundario` deixa de empurrar, e
 * acrescentar uma borda a qualquer variante no futuro não muda mais nada.
 *
 * Os números saem da base 4 (§M, "espaçamento de 2 em 2 px" era a queixa):
 * **40 px** para o controle de formulário — que é também o alvo de toque que a
 * §M propõe, e 2 px acima dos 38 de hoje — e **28 px** para a linha densa de
 * tabela, onde o campo estava em 26 e o botão em 28/30.
 *
 * `IconButton` fica de fora: a altura dele é a área mínima de clique (`ALVO`),
 * medida e travada no 5º lote por outra norma (WCAG 2.5.8). Botão de ícone é
 * menor de propósito.
 */
export const CONTROLE_ALTURA = {
  sm: 'h-7',
  md: 'h-10',
} as const;

/**
 * Preenchimento de barra e marcador de legenda — o pedaço colorido que aparece
 * dentro de uma trilha `bg-slate-100`/`bg-slate-200` ou como quadradinho ao lado
 * de um rótulo.
 *
 * ## Por que isto é token e não escolha de tela
 *
 * São nove barras escritas à mão em nove arquivos, e o tom de cada uma foi
 * escolhido a olho. Medido (fórmula da WCAG 2.1, cor resolvida pelo navegador —
 * o Tailwind v4 devolve `oklch`, e a conta feita em cima do texto da cor dá
 * número errado):
 *
 * | Tom | sobre branco | sobre slate-100 | sobre slate-200 |
 * |---|---|---|---|
 * | `emerald-500` | 2,47 | 2,26 | 2,01 |
 * | `amber-500` | 2,13 | 1,95 | 1,73 |
 * | `sky-500` | 2,71 | 2,47 | 2,19 |
 * | `slate-400` | 2,63 | 2,40 | 2,13 |
 * | `slate-300` | 1,49 | **1,36** | 1,21 |
 *
 * O piso da SC 1.4.11 para elemento não textual é **3:1**, e os cinco reprovam
 * nos três fundos. O caso de 1,36 não é discussão de norma: a barra de "Sem
 * procedência" simplesmente não aparece na trilha.
 *
 * A auditoria visual tinha registrado "barras a 2,0–2,1:1". O número estava
 * certo para a metade das barras e **otimista para a pior delas**.
 *
 * ## Por que os números do tom não são todos iguais
 *
 * `emerald` precisa ir até 700 e `violet` passa em 500 porque a luminância de
 * cada matiz é diferente — o dígito do Tailwind não é uma escala de contraste. O
 * critério é o valor medido, e é justamente por isso que ele mora aqui: para
 * ninguém ter de refazer a conta ao acrescentar a décima barra.
 *
 * Todos os tons abaixo ficam **≥ 3:1 nos três fundos**.
 */
export const PREENCHIMENTO = {
  acao: 'bg-blue-600',
  positivo: 'bg-emerald-700',
  informativo: 'bg-sky-700',
  atencao: 'bg-amber-700',
  negativo: 'bg-rose-600',
  neutro: 'bg-slate-500',
  destaque: 'bg-violet-500',
  alternativo: 'bg-indigo-500',
} as const;

/**
 * Alternador segmentado — os dois ou três botões dentro de uma moldura única
 * ("Minhas do dia | Quadro", "tabela | cartões", "grade | lista").
 *
 * Existiam em TRÊS grafias para o mesmo widget, e por isso em três alturas:
 *
 * | Onde | Moldura | Medido |
 * |---|---|---|
 * | Tarefas | `rounded-lg border-slate-200 bg-white p-0.5` | 34 px |
 * | Documentos | `rounded-lg border-slate-200/50 bg-slate-50 p-0.5` | 34 px |
 * | Catálogo | `rounded-md border-slate-200 overflow-hidden` | 32 px |
 *
 * Nenhuma das três batia com os 40 px do `Button` que fica ao lado nas três
 * telas — é o mesmo defeito do resto deste token, num controle que ninguém
 * tinha percebido que era um controle só.
 *
 * `min-h` e não `h` de propósito: o segmento continua carregando `ALVO`, que em
 * `pointer-coarse` pede 44 px (WCAG 2.5.5, travado no 5º lote). Com altura fixa
 * o dedo perderia o alvo que aquele lote garantiu; com piso, o grupo cresce e o
 * alvo sobrevive. No desktop o piso decide sozinho e o grupo mede exatamente os
 * 40 px do botão vizinho.
 *
 * Sem padding e com `overflow-hidden`: o segmento encosta na moldura, então a
 * altura do grupo é a do segmento mais a borda, e não sobra folga para as
 * três grafias divergirem de novo.
 */
export const CONTROLE_GRUPO =
  'inline-flex items-stretch shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white min-h-10';

/**
 * Um segmento. A altura vem do grupo (`items-stretch`) — declarar altura aqui
 * devolveria a soma de padding que este arquivo acabou de tirar de circulação.
 */
export const CONTROLE_GRUPO_ITEM = {
  base: `inline-flex items-center justify-center gap-1.5 px-2.5 text-2xs font-semibold transition ${FOCO}`,
  ativo: 'bg-blue-600 text-white',
  inativo: 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900',
} as const;

/**
 * Padding HORIZONTAL e escala de fonte. O eixo vertical saiu daqui de propósito:
 * quem manda na altura é `CONTROLE_ALTURA`, e um `py-2` que não decide mais nada
 * seria só a próxima declaração morta a enganar quem lê o JSX — o mesmo defeito
 * do `w-16` que nunca valeu.
 */
export const CAMPO_TAMANHO = {
  sm: 'px-2 text-2xs',
  md: 'px-2.5 text-xs',
} as const;

/**
 * A versão do `Textarea`. Multilinha não tem altura fixa — ela vem do conteúdo e
 * do `rows` — então ali o padding vertical é o que de fato afasta o texto da
 * borda, e continua sendo declarado.
 */
export const CAMPO_TAMANHO_MULTILINHA = {
  sm: 'px-2 py-1 text-2xs',
  md: 'px-2.5 py-2 text-xs',
} as const;

export type Tamanho = keyof typeof CAMPO_TAMANHO;

/* ============================================================
   LAYOUT DA PÁGINA — redesenho "seções abertas", 13/ago/2026
   ============================================================
   Os tokens acima governam o CONTROLE; daqui para baixo é a PÁGINA. Foram os
   três números que nunca tiveram dono e por isso cada tela inventou o seu.

   O relato que abriu o trabalho: "a tela dividida em blocos é ruim de
   visualizar, comprime muita coisa e cria barreiras". Contado no código, o
   diagnóstico se confirma — a tela inicial tinha ~13 blocos com moldura, o
   painel financeiro tinha card dentro de card em três dialetos de superfície
   (`rounded-lg`/`xl`/`2xl` × `shadow-sm`/`xs` × `slate-200`/`100`), e sete
   telas travavam a própria altura em `h-[calc(100vh-…)]`, o que multiplicava
   barra de rolagem aninhada: 53 `overflow-y-auto` em `src/`.

   A direção escolhida: a moldura sai, o TÍTULO e o espaço em branco assumem o
   papel de separar (ver `Secao.tsx`), e a página volta a rolar como página. */

/**
 * Largura máxima da página de aba.
 *
 * O app não tinha nenhuma: `#tab-viewport` é `flex-1` e o conteúdo ocupava
 * 100% do que sobrava da sidebar. Num monitor de 1920 px isso são ~1630 px
 * úteis para um layout desenhado em `lg:` (1024) — os cards só esticavam,
 * nenhuma tela ganhava coluna, e uma linha de texto atravessava a tela inteira.
 *
 * A largura é declarada POR TELA, e não uma só no viewport, porque as três
 * respostas certas são diferentes e a tela é quem sabe qual é a sua: a planilha
 * orçamentária de 13 colunas e o Gantt querem tudo, o painel quer limite, e
 * formulário puro quer bem menos. Um teto global obrigaria a inventar um
 * mecanismo de opt-out por aba — mais peça para o mesmo resultado.
 */
export const PAGINA_LARGURA = {
  /** Formulário e leitura corrida. Acima disto a linha fica longa de acompanhar. */
  leitura: 'max-w-[960px]',
  /** Painel, dashboard, mestre/detalhe. Em 1366 não muda nada; em 1920 para de esticar. */
  painel: 'max-w-[1440px]',
  /** Tabela larga, Gantt, kanban, grade de arquivos: ocupa o que houver. */
  cheia: 'max-w-none',
} as const;

export type LarguraPagina = keyof typeof PAGINA_LARGURA;

/**
 * Ritmo vertical entre seções de uma página.
 *
 * 32 px, e não os 24 do `space-y-6` que as telas usavam: sem moldura, o espaço
 * em branco é o ÚNICO separador que sobra, e 24 px não separavam o suficiente
 * para o olho agrupar sozinho. Quem tinha 24 px tinha também uma borda ajudando.
 */
export const SECAO_ESPACO = 'space-y-8';

/**
 * Coluna mestre ancorada — a lista do layout mestre/detalhe.
 *
 * Quatro telas (Clientes, Fornecedores, Equipe, Propostas) travavam a raiz em
 * `lg:h-[calc(100vh-120px)]` para que lista e detalhe rolassem cada um por si.
 * O preço era a ficha nunca poder crescer: ela só encolhia e ganhava mais uma
 * barra de rolagem interna — a "barreira" do relato, em forma pura.
 *
 * A inversão: o DETALHE rola com a página, e só a LISTA fica presa. `sticky`
 * resolve contra o scroller mais próximo, que é `#tab-viewport` (o único
 * `overflow-y-auto` da casca), então isto funciona sem que `AppShell` ou
 * `Cabecalho` precisem saber que existe.
 *
 * ## O 104, e por que ele foi MEDIDO e não deduzido
 *
 * A dedução era: `top-0` ancora rente à topbar (56 px), porque a caixa de
 * restrição do `sticky` seria o *padding box* do scroller. Medido no navegador
 * (janela de 649 px, mesma árvore do shell), a lista para em **80 px** — 56 da
 * topbar MAIS os 24 do `p-6` do `#tab-viewport`. O padding do scroller conta.
 *
 * A conta certa, então, é 56 + 24 acima + 24 de respiro no pé = **104**. Com os
 * 80 px que a dedução dava, a lista media exatamente até a borda inferior da
 * janela: `bottom` 649 num `innerHeight` de 649, zero folga. Aferido de novo
 * depois da correção: topo em 80, base em 625, 24 px de folga.
 *
 * É o terceiro token deste arquivo cujo número saiu de medição e não de soma
 * (ver `CONTROLE_ALTURA` e `PREENCHIMENTO`), e pelo mesmo motivo: geometria
 * somada no papel erra em silêncio, e ninguém confere o que já está na tela.
 *
 * `self-start` é obrigatório e some fácil: item de grid estica para a altura da
 * linha por padrão (`stretch`), e um elemento que já tem a altura do irmão mais
 * alto não tem para onde grudar — o `sticky` viraria decoração silenciosa.
 *
 * Tudo prefixado `lg:`: abaixo disso o grid já colapsa em uma coluna, e ali a
 * lista tem de rolar com a página como qualquer outra coisa.
 */
export const COLUNA_ANCORADA = 'lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-104px)]';
