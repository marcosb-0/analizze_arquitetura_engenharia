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
 * Os mesmos tons de `PREENCHIMENTO` em hex, para quem não aceita classe.
 *
 * Recharts recebe a cor por prop (`fill`, `stroke`), então a série do gráfico
 * nunca passou pelo token — e escolheu sozinha `#10B981` (emerald-500) e
 * `#EF4444` (red-500), justamente os tons que a tabela do `PREENCHIMENTO`
 * reprova por contraste. O mesmo vale para a legenda de um gráfico em SVG.
 *
 * Manter os dois mapas em sincronia é o preço de a biblioteca não ler CSS; o
 * que não dá é deixar a cor da série ser decidida no arquivo da tela, que foi
 * como as duas divergiram.
 */
/**
 * CORREÇÃO 14/ago/2026 — os três hex abaixo seguem a paleta que `slate-*`
 * passou a apontar no refactor de design (`index.css`, bloco `@theme`).
 * Continuam hex fixo e não `var(--color-slate-*)` pelo mesmo motivo de
 * sempre: Recharts/SVG recebem cor por prop, não leem CSS. Mudou a escala de
 * novo? mude aqui também — é o mesmo aviso que já existia.
 */
export const GRAFICO_NEUTRO_HEX = {
  /** Texto de eixo e legenda — o mesmo `slate-500` do rótulo em CSS. */
  rotulo: '#667085',
  /** Linha de grade. `slate-100`: presente sem competir com a série. */
  grade: '#f2f4f7',
  /** Borda da dica — a mesma borda universal do app. */
  borda: '#eef1f6',
} as const;

export const PREENCHIMENTO_HEX = {
  /** CORREÇÃO 14/ago/2026 — segue o novo `blue-600` de `index.css`. */
  acao: '#2f5cf6',
  positivo: '#047857',
  informativo: '#0369a1',
  atencao: '#b45309',
  negativo: '#e11d48',
  /** CORREÇÃO 14/ago/2026 — segue o novo `slate-500` de `index.css`. */
  neutro: '#667085',
  destaque: '#8b5cf6',
  alternativo: '#6366f1',
} as const;

/**
 * Trincas fundo/texto/ponto para o pill de status — o padrão que o mockup
 * "Analizze - App" repete em toda tela (situação de obra, status de etapa,
 * prioridade de tarefa, procedência de insumo) e que o app não tinha:
 * 15+ telas reinventavam a pill à mão, cada uma com sua própria lógica de
 * cor (achado do reconhecimento pré-refactor).
 *
 * `texto` é OUTRO tom do que `PREENCHIMENTO` usa para preenchimento de barra:
 * ali o critério é contraste de ELEMENTO NÃO TEXTUAL (SC 1.4.11, piso 3:1);
 * aqui é contraste de TEXTO de verdade (piso 4,5:1), e por isso os hex não
 * podem ser os mesmos — `positivo`/`negativo`/`informativo` aqui são tons de
 * TEXTO amostrados do mockup e verificados a 4,5:1+ nas 3 superfícies do
 * app; `atencao` não é o tom do mockup (`#a86a00`, que reprova a 4,44:1) —
 * é o `amber-700` que `PREENCHIMENTO` já usa, já verificado. `ponto` reusa
 * `PREENCHIMENTO_HEX` (mesmo motivo do comentário acima: cor de bolinha é
 * elemento não textual, o piso de `PREENCHIMENTO` já resolve). `fundo` é o
 * tom pálido do mockup — pálido o bastante que quem precisa passar em
 * contraste é o `texto` sobre ele, não ele sobre a página.
 */
export const CHIP = {
  positivo: { fundo: '#e8f7f0', texto: '#0f7a56', ponto: PREENCHIMENTO_HEX.positivo },
  negativo: { fundo: '#fdecef', texto: '#c0344a', ponto: PREENCHIMENTO_HEX.negativo },
  atencao: { fundo: '#fff5e5', texto: PREENCHIMENTO_HEX.atencao, ponto: PREENCHIMENTO_HEX.atencao },
  informativo: { fundo: '#eef2ff', texto: PREENCHIMENTO_HEX.acao, ponto: PREENCHIMENTO_HEX.acao },
  neutro: { fundo: '#f2f4f7', texto: '#475467', ponto: PREENCHIMENTO_HEX.neutro },
  destaque: { fundo: '#f2f4ff', texto: '#4338ca', ponto: PREENCHIMENTO_HEX.destaque },
  alternativo: { fundo: '#eef2ff', texto: '#4338ca', ponto: PREENCHIMENTO_HEX.alternativo },
} as const;

export type TomChip = keyof typeof CHIP;

/**
 * O painel "destaque" do `Card` — o bloco azul-escuro sólido que o mockup usa
 * para CTA financeiro ("BM pendente", "Medições a faturar"): é o único lugar
 * do app com bloco de cor cheia por trás de texto, e por isso não reusa
 * `CHIP` (que é fundo pálido + texto escuro, não fundo saturado + texto
 * claro). Par próprio, mesma disciplina de hex-porque-é-tom-novo dos outros
 * tokens desta seção.
 */
export const DESTAQUE_PAINEL = { fundo: '#dfe6ff', texto: '#1b2a6b' } as const;

/**
 * Piso de tamanho de fonte dentro de gráfico.
 *
 * O eixo e a legenda do Recharts vinham em 10 px, e a dica em 11 px — abaixo
 * do piso de 12 px que `--text-2xs` fixou para o app inteiro. Escaparam da
 * subida da escala porque são prop de JavaScript, e o guarda de escala do
 * `estilo.test.ts` varre `className`. É o mesmo texto minúsculo que a nota de
 * `index.css` descreve, no único canto onde ela não alcançava.
 */
export const GRAFICO_FONTE = 12;

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
/**
 * REDESENHO 14/ago/2026 — o alternador virou o "trilho" do mockup.
 *
 * Era moldura branca com borda e segmento ativo AZUL SÓLIDO. O mockup
 * "Analizze - App" usa o outro desenho: uma calha cinza (`slate-200`) com o
 * segmento ativo em BRANCO elevado por uma sombra de 1 px — o ativo parece
 * uma tecla pressionada para fora, não um botão pintado.
 *
 * A troca é aqui e não nas telas porque os três donos do widget (Tarefas,
 * Documentos, Catálogo) montam a marcação à mão a partir destas strings —
 * mudar o token muda os três de uma vez, que é o motivo de ele existir.
 *
 * O azul saiu de propósito: com o segmento ativo azul sólido, um alternador
 * ao lado de um `Button` primário punha dois azuis cheios lado a lado
 * disputando a mesma atenção, e só um deles é a ação da tela.
 */
export const CONTROLE_GRUPO =
  'inline-flex items-stretch shrink-0 gap-0.5 rounded-[10px] bg-slate-200 p-[3px] min-h-10';

/**
 * Um segmento. A altura vem do grupo (`items-stretch`) — declarar altura aqui
 * devolveria a soma de padding que este arquivo acabou de tirar de circulação.
 */
export const CONTROLE_GRUPO_ITEM = {
  base: `inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 text-2xs transition ${FOCO}`,
  ativo: 'bg-white text-slate-900 font-bold shadow-[0_1px_2px_rgba(16,24,40,0.06)]',
  inativo: 'text-slate-500 font-semibold hover:text-slate-900',
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
 * Grade fluida de cartões — colunas por MEDIDA do cartão, não por breakpoint.
 *
 * ## O defeito da escada de breakpoints, demonstrado pela própria tela
 *
 * A grade de obras declarava `md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4`, e
 * o comentário ao lado dela conta o remendo: com o teto de 1440 px da
 * `PaginaAba`, três colunas davam cartões de 460 px "para quatro linhas de
 * texto", e a solução foi acrescentar mais um degrau (`2xl:4`). É o modo de
 * falha da escada: o número de colunas é decidido pela LARGURA DA JANELA, que o
 * cartão não conhece, e cada monitor novo pede outro degrau — sempre depois de
 * alguém ver o cartão esticado.
 *
 * `auto-fill` inverte a pergunta: declara-se a largura MÍNIMA que o conteúdo do
 * cartão pede, e o navegador cabe quantas colunas couberem — em qualquer
 * largura, incluindo as que nenhum breakpoint previu (sidebar recolhida, janela
 * lado a lado, zoom). É `CAMPO_LARGURA` aplicado à grade: quem sabe o mínimo é
 * o conteúdo, não a tela.
 *
 * ## Os números
 *
 * **330 px** é o piso do cartão de entidade (obra): o degrau `2xl:4` que a tela
 * acertou à mão produz cartões de 348 px no teto de 1440, e o conteúdo real
 * (endereço truncável, chips de risco, rodapé com data e progresso) assenta
 * confortável ali; abaixo de ~330 os chips quebram em três linhas.
 *
 * O `min(330px, 100%)` não é decoração: num viewport de 360 px o contêiner útil
 * tem ~312 px, e `minmax(330px, …)` sozinho ESTOURA a página para o lado — o
 * único overflow horizontal que a grade antiga nunca teve. O `min()` faz o piso
 * ceder quando o próprio contêiner é menor que ele.
 *
 * ## `auto-fill` e não `auto-fit` — o knob que parece intercambiável
 *
 * `auto-fit` COLAPSA as trilhas vazias, então uma obra sozinha vira um cartão
 * de 1440 px com quatro linhas de texto dentro: exatamente o sintoma que a
 * escada de breakpoints produzia e que este token veio corrigir. `auto-fill`
 * mantém as trilhas, e o cartão único fica do tamanho de cartão. Trocar um
 * pelo outro não é ajuste de gosto — desfaz a correção.
 *
 * Cartão novo com outro conteúdo → medir o mínimo DELE no navegador e
 * acrescentar uma entrada aqui, com a medição no comentário. Adivinhar o número
 * devolve a escada com outra sintaxe.
 */
export const GRADE_CARTOES = {
  /** Cartão de entidade — obra, e o que tiver conteúdo equivalente. */
  entidade: 'grid grid-cols-[repeat(auto-fill,minmax(min(330px,100%),1fr))] gap-4',
} as const;

/**
 * Painéis irmãos numa linha — a `<Secao>` ao lado da `<Secao>`.
 *
 * ## Por que não é o mesmo token da grade de cartões
 *
 * `GRADE_CARTOES` usa `auto-fill` para que uma obra sozinha continue do tamanho
 * de um cartão. Aqui é o contrário: dois painéis numa linha de três lugares
 * devem DIVIDIR a linha, não deixar um buraco à direita — painel é a moldura do
 * assunto, e assunto não tem largura natural. Por isso `auto-fit`, que colapsa
 * a trilha vazia. Trocar um pelo outro estraga os dois casos, cada um do seu
 * jeito.
 *
 * ## O bug que a medição encontrou
 *
 * `lg:grid-cols-2` promete duas colunas a partir de 1024 px. Com a sidebar de
 * 240 px e o padding do viewport, sobram ~736 px, e cada painel fica com
 * ~352 px. Medido na fonte real: um valor de dinheiro em mono 20 px
 * ("R$ 1.284.900,00") ocupa **180 px**, e a `FaixaKpis colunas={3}` do painel
 * "Em aberto por vencimento" precisa de 3 × 180 + 2 × 32 de `gap` = **604 px**.
 *
 * Ou seja: entre 1024 e ~1300 px o layout põe lado a lado dois painéis que não
 * cabem, e o número — o dado que a tela existe para mostrar — quebra ou
 * transborda. Não aparece hoje só porque o banco está sem movimento; aparece no
 * dia em que houver dinheiro real. Pior: a `FaixaKpis` decide as colunas dela
 * pelo `md:` da VIEWPORT, que já passou, então ela mantém 3 colunas dentro de um
 * painel que tem espaço para uma.
 *
 * O `auto-fit` não tem esse buraco porque não existe número mágico: os painéis
 * ficam empilhados até caberem de verdade, em qualquer largura.
 *
 * Os pisos saem de medição na fonte real, não de arredondamento:
 */
export const GRADE_PAINEIS = {
  /** Painel com faixa de 3 KPIs de dinheiro. 3 × 180 + 2 × 32 de `gap`. */
  indicadores: 'grid grid-cols-[repeat(auto-fit,minmax(min(604px,100%),1fr))] gap-x-8 gap-y-6',
  /** Painel de lista "nome … valor". Nome de obra (199) + 12 + dinheiro (126). */
  lista: 'grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-x-8 gap-y-8',
} as const;

/**
 * Painel largo + painel estreito (gráfico e a lista ao lado dele).
 *
 * Aqui `auto-fit` seria a resposta errada: a proporção 2:1 é uma decisão de
 * projeto, e com trilhas implícitas o `col-span-2` que a sustentava passa a
 * depender de quantas trilhas couberam — o mesmo JSX renderiza proporções
 * diferentes conforme a largura, sem nada dizendo isso.
 *
 * As duas trilhas são explícitas, então o `col-span` some junto com a
 * ambiguidade. `minmax(0,2fr)` e não `2fr`: a trilha `fr` tem `min-width:auto`,
 * e um gráfico com rótulo comprido empurraria a coluna estreita para baixo do
 * piso dela sem que ninguém pedisse. O `minmax(340px,1fr)` é o mesmo piso
 * medido de `GRADE_PAINEIS.lista` — a coluna estreita nunca desce dele, e quem
 * cede é o gráfico, que sabe encolher.
 *
 * O `lg:` continua aqui, e é deliberado: "empilhar ou não" com proporção
 * assimétrica é a única decisão desta família que a largura da janela realmente
 * decide.
 */
export const GRADE_PAINEL_ASSIMETRICO =
  'grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)] gap-x-8 gap-y-8';

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

/**
 * A LINHA SELECIONADA da lista mestre — o outro dono do filete azul.
 *
 * O redesenho de 14/ago tirou o filete da NAVEGAÇÃO (que virou pílula) e o
 * deixou com este significado mais estreito, mas não deu a ele um dono: cinco
 * listas mestre continuaram escrevendo a receita à mão, e a quinta (Contratos)
 * escreveu diferente — só `bg-blue-50/60`, sem filete nenhum, o que num painel
 * de detalhe faz a linha selecionada sumir assim que o mouse passa pela linha
 * de baixo (o `hover` é do mesmo peso).
 *
 * ## E o filete voltou a empurrar o conteúdo 2 px
 *
 * É literalmente o defeito que `MENU_ITEM` acabou de documentar e corrigir:
 * com `box-sizing: border-box`, `border-l-2` vive DENTRO da caixa, então o
 * `p-3` da linha vira 10 px à esquerda no instante em que ela é selecionada, e
 * o nome do cliente pula 2 px. No menu a correção foi tirar a borda; aqui a
 * borda É o significado, então quem sai é a BORDA como técnica:
 * `box-shadow: inset` pinta os mesmos 2 px sem ocupar espaço na caixa. Zero
 * deslocamento, e um estado a menos para o padding compensar.
 */
export const LINHA_SELECIONADA = {
  ativa: 'bg-blue-50/40 shadow-[inset_2px_0_0_0_var(--color-blue-600)] font-medium',
  inativa: 'hover:bg-slate-50',
} as const;

/* ─────────────────────────── MENU LATERAL ────────────────────────────────
   A sidebar era o único pedaço da casca que não consumia token nenhum: largura,
   altura de item, padding e espaçamento de grupo estavam escritos em Tailwind
   cru dentro do JSX, e três donos diferentes de navegação vertical (o menu do
   app, as pastas de Documentos e as categorias do Catálogo) copiavam o realce
   de item ativo à mão. Os três tokens abaixo nomeiam o que já existia e travam
   a única coisa que estava de fato errada — o pulo de 2 px do item ativo. */

/**
 * Largura da coluna do menu.
 *
 * Duas larguras e três classes porque a sidebar é duas coisas: abaixo de `lg`
 * ela é gaveta sobreposta e **sempre** larga (recolher uma gaveta não faz
 * sentido — ela já ocupa a tela), e a partir de `lg` é coluna fixa que recolhe.
 * Daí `base` sem prefixo e as outras duas em `lg:`.
 */
export const MENU_LARGURA = {
  /** A gaveta, e o ponto de partida da coluna. 240 px. */
  base: 'w-60',
  /** Coluna com rótulo. */
  aberto: 'lg:w-60',
  /** Coluna só de ícone: 64 px = 40 do alvo + 12 de folga de cada lado. */
  recolhido: 'lg:w-16',
} as const;

/**
 * O item de navegação do menu.
 *
 * ## O filete saiu — redesenho de 14/ago/2026, mockup "Analizze - App"
 *
 * O ativo era `bg-blue-50/50` + `border-l-2 border-blue-600`. O mockup usa uma
 * PÍLULA azul inteira (fundo `blue-50`, texto `blue-600`, cantos arredondados
 * dos dois lados) e nenhum filete — e trocar resolve, de graça, o defeito que
 * o token existia para remendar:
 *
 * > Com `box-sizing: border-box` a borda vive DENTRO da caixa. Com `px-3.5`
 * > nos dois estados, o conteúdo do item ativo começava em 14 + 2 = 16 px e o
 * > do inativo em 14: ícone e rótulo pulavam 2 px para a direita no instante
 * > em que você selecionava o item, e voltavam ao sair. Pequeno o bastante
 * > para nunca ter sido relatado, grande o bastante para o olho registrar como
 * > instabilidade ao percorrer o menu.
 *
 * A correção era um `paddingAtivo` de `pl-3 pr-3.5` compensando os 2 px da
 * borda. Sem borda não há o que compensar, e o par `padding`/`paddingAtivo`
 * virou um `padding` só — um estado a menos para alguém errar.
 *
 * O filete continua existindo no app, com significado mais estreito: LINHA
 * SELECIONADA em lista mestre (Clientes, Fornecedores, Equipe, Propostas).
 * Navegação vertical usa a pílula; seleção de linha usa o filete. Ver o
 * DESIGN.md.
 *
 * ## A altura é declarada, não somada
 *
 * `h-10` em vez do `py-2.5` que estava lá, pelo mesmo motivo de
 * `CONTROLE_ALTURA`: 10 + 20 (altura de linha do `text-xs`) + 10 dá 40 px hoje,
 * mas passa a dar 42 no dia em que alguém puser uma borda, e ninguém confere o
 * que já está na tela. Os 40 px também são o alvo de toque do menu, que é
 * exatamente onde o campo — com luva e sol — mais precisa acertar o clique.
 */
export const MENU_ITEM = {
  base: 'w-full flex items-center h-10 rounded-lg text-xs font-semibold transition-colors duration-150',
  /** Padding do item, igual nos dois estados — ver acima. */
  padding: 'px-3.5',
  ativo: 'bg-blue-50 text-blue-600',
  inativo: 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
} as const;

/**
 * Espaço entre grupos do menu, e entre o cabeçalho do grupo e o primeiro item.
 *
 * Segue a mesma tese do `SECAO_ESPACO` da página — sem moldura, o espaço em
 * branco é o separador — só que na escala do menu: 16 px entre grupos (o
 * `space-y-4` que já estava lá) e 8 px sob o cabeçalho, que é o suficiente para
 * o rótulo maiúsculo de 12 px colar no grupo que ele nomeia em vez de flutuar
 * entre dois.
 */
export const MENU_GRUPO_ESPACO = {
  entreGrupos: 'space-y-4',
  entreItens: 'space-y-1',
  sobCabecalho: 'mb-2',
  /**
   * O que um grupo SEM cabeçalho ganha de volta — e por que virou LINHA.
   *
   * ## A primeira correção acertou a conta e errou o olho
   *
   * Um grupo titulado separa-se do anterior por 40 px: os 16 de `entreGrupos`
   * mais o bloco do cabeçalho, que mede 24 px no navegador (16 de altura de
   * linha do rótulo de 12 px + 8 de `sobCabecalho`). O grupo sem título recebia
   * só os 16, e "Obras" — o único destino do menu que não pertence a uma
   * família — encostava no grupo Comercial acima. A correção de então foi
   * `pt-6`, para igualar os 40 px de distância entre itens.
   *
   * Igualou a distância e abriu um buraco, que foi como o usuário relatou:
   * "tem uma distância grande entre Clientes e Obras". Medido no navegador
   * depois do relato, os dois vãos de 40 px que aquela correção produziu não
   * são a mesma coisa:
   *
   * | Vão | Mede | Contém |
   * |---|---|---|
   * | Clientes → Obras | 40 px | **nada** |
   * | Obras → Catálogo | 40 px | o rótulo "CUSTOS" |
   *
   * O que o olho mede não é a distância entre dois itens, é o **vazio
   * contínuo**. Antes de todo grupo titulado esse vazio é de 16 px — depois
   * dele já começa o rótulo, que é tinta. Acima de "Obras" o vazio eram os
   * 40 px inteiros: **2,5× o maior vão do resto do menu**, e o único lugar do
   * percurso onde o olho não tinha onde pousar.
   *
   * ## A correção
   *
   * Separar com uma LINHA, não com ausência. O vazio volta aos 16 px de todo o
   * resto (16 acima do filete, 16 abaixo), e quem diz "aqui começa outra
   * coisa" passa a ser o filete — o papel que o rótulo de grupo exerce nos
   * outros quatro casos.
   *
   * Não usar um cabeçalho "OBRAS" continua valendo: ele empilharia a palavra
   * duas vezes sobre um item chamado "Obras". A linha separa sem repetir.
   *
   * `pt-` e não `mt-`: `entreGrupos` é `space-y-*`, que já escreve margem nos
   * irmãos, e uma segunda margem no mesmo eixo disputa com ela. Padding não
   * disputa com nada — é o mesmo motivo pelo qual a altura do item é `h-10` e
   * não a soma de dois paddings.
   */
  semCabecalho: 'border-t border-slate-100 pt-4',
} as const;

/**
 * A rolagem do menu — e a calha reservada dos dois lados.
 *
 * O menu rola quando não cabe, e num notebook ele não cabe: medido numa janela
 * de 649 px, o conteúdo pede 684 e a viewport dá 511. A barra de rolagem
 * clássica do Chrome mede **15 px** e sai do lado de dentro, de um lado só — e é
 * daí que vêm dois defeitos que ninguém atribuiria a ela:
 *
 * - **O menu inteiro salta 15 px na horizontal** quando a barra aparece ou some.
 *   Ela aparece por qualquer motivo: abrir uma obra (o bloco acrescenta sete
 *   linhas), redimensionar a janela, trocar de papel.
 * - **Recolhido, os ícones ficam fora do eixo.** Aferido: centro do ícone em 26,
 *   centro da coluna em 31,5. Numa coluna de 64 px que só tem ícones, 5,5 px de
 *   desvio são visíveis — a fileira inteira encosta na borda esquerda.
 *
 * `stable both-edges` reserva a calha nos DOIS lados, sempre: a caixa de
 * conteúdo passa a ser simétrica e constante, com barra ou sem. Por isso o
 * `px-3` do `<nav>` some junto — a calha já é o recuo, e somar os dois deixaria
 * a coluna recolhida com 10 px úteis.
 *
 * É o mesmo modo de falha do `COLUNA_ANCORADA`, e a terceira vez que ele
 * aparece: geometria de rolagem deduzida no papel erra, e o erro fica na tela
 * sem ninguém associá-lo à barra.
 */
export const MENU_ROLAGEM = 'overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable_both-edges]';
