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
  'w-full rounded-lg border border-slate-200 text-slate-800 placeholder:text-slate-500 ' +
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

export const CAMPO_TAMANHO = {
  sm: 'px-2 py-1 text-2xs',
  md: 'px-2.5 py-2 text-xs',
} as const;

export type Tamanho = keyof typeof CAMPO_TAMANHO;
