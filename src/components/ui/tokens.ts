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

export const CAMPO_TAMANHO = {
  sm: 'px-2 py-1 text-2xs',
  md: 'px-2.5 py-2 text-xs',
} as const;

export type Tamanho = keyof typeof CAMPO_TAMANHO;
