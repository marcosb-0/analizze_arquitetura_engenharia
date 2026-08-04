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

/** Campo de formulário: borda, fundo e estado desabilitado. */
export const CAMPO_BASE =
  'w-full rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-500 ' +
  'transition outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ' +
  'aria-[invalid=true]:border-rose-400';

export const CAMPO_TAMANHO = {
  sm: 'px-2 py-1 text-2xs',
  md: 'px-2.5 py-2 text-xs',
} as const;

export type Tamanho = keyof typeof CAMPO_TAMANHO;
