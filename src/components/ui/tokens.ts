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

export const CAMPO_TAMANHO = {
  sm: 'px-2 py-1 text-2xs',
  md: 'px-2.5 py-2 text-xs',
} as const;

export type Tamanho = keyof typeof CAMPO_TAMANHO;
