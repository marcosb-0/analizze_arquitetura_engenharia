import React from 'react';
import Spinner from '../Spinner';
import { FOCO, FOCO_PERIGO } from './tokens';
import type { PropsNativas } from './tipos';

/**
 * Botão único da aplicação.
 *
 * O mesmo botão primário existia em ~30 grafias diferentes — `rounded` vs
 * `rounded-lg`, `font-bold` vs `font-extrabold`, `px-3 py-1.5` vs `px-4 py-2`,
 * metade com `active:scale-95` e metade sem. Nenhuma delas tinha estilo de foco.
 */

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo';
type TamanhoBotao = 'sm' | 'md';

const VARIANTES: Record<Variante, string> = {
  primario: `bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 ${FOCO}`,
  secundario: `bg-white text-slate-700 border border-slate-200 shadow-xs hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 ${FOCO}`,
  fantasma: `bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800 active:bg-slate-200 ${FOCO}`,
  perigo: `bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:bg-rose-800 ${FOCO_PERIGO}`,
};

const TAMANHOS: Record<TamanhoBotao, string> = {
  sm: 'px-2.5 py-1.5 text-2xs gap-1',
  md: 'px-3.5 py-2 text-xs gap-1.5',
};

interface ButtonProps extends PropsNativas {
  variante?: Variante;
  tamanho?: TamanhoBotao;
  /** Mostra spinner e bloqueia o clique. Mantém o rótulo: o botão não muda de largura no meio da ação. */
  carregando?: boolean;
  /** Ocupa toda a largura do contêiner (botão de rodapé de formulário). */
  bloco?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  children?: React.ReactNode;
  /** Escapatória para posicionamento — margens, `shrink-0`, `ml-auto`. Não use para recolorir. */
  className?: string;
}

export function Button({
  variante = 'primario',
  tamanho = 'md',
  carregando = false,
  bloco = false,
  disabled = false,
  type = 'button',
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      // Sem `type` explícito o browser assume `submit`: vários botões de
      // "cancelar" dentro de <form> enviavam o formulário ao serem clicados.
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={`inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap transition
        disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
        ${VARIANTES[variante]} ${TAMANHOS[tamanho]} ${bloco ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {carregando && <Spinner size={tamanho === 'sm' ? 12 : 14} />}
      {children}
    </button>
  );
}

interface IconButtonProps extends PropsNativas {
  /** Obrigatório: um botão só de ícone não tem texto acessível nenhum sem isto. */
  rotulo: string;
  children: React.ReactNode;
  tom?: 'neutro' | 'perigo';
  tamanho?: TamanhoBotao;
  carregando?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

const TONS_ICONE = {
  neutro: `text-slate-400 hover:text-slate-700 hover:bg-slate-100 ${FOCO}`,
  perigo: `text-slate-400 hover:text-rose-600 hover:bg-rose-50 ${FOCO_PERIGO}`,
};

/** Botão só de ícone (lixeira, lápis, ✕). Exige rótulo acessível por contrato. */
export function IconButton({
  rotulo,
  tom = 'neutro',
  tamanho = 'md',
  disabled = false,
  carregando = false,
  children,
  className = '',
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      title={rotulo}
      aria-label={rotulo}
      disabled={disabled || carregando}
      className={`inline-flex items-center justify-center rounded-lg transition shrink-0
        disabled:opacity-40 disabled:cursor-not-allowed
        ${TONS_ICONE[tom]} ${tamanho === 'sm' ? 'p-1' : 'p-1.5'} ${className}`}
      {...rest}
    >
      {carregando ? <Spinner size={tamanho === 'sm' ? 12 : 14} /> : children}
    </button>
  );
}
