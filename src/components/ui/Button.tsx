import React from 'react';
import Spinner from '../Spinner';
import { FOCO, FOCO_PERIGO } from './tokens';

/**
 * Botão único da aplicação.
 *
 * O mesmo botão primário existia em ~30 grafias diferentes — `rounded` vs
 * `rounded-lg`, `font-bold` vs `font-extrabold`, `px-3 py-1.5` vs `px-4 py-2`,
 * metade com `active:scale-95` e metade sem. Nenhuma delas tinha estilo de foco.
 *
 * ## Por que existe `acao`, e por que só ela (§7, item 32)
 *
 * O botão SEM fundo parado era o bloco que sobrava da migração de 04/ago/2026:
 * 107 `<button>` crus, com **12 tons de hover diferentes** contra os 2 que os
 * primitivos ofereciam. Migrar antes de escolher os tons seria inventar API por
 * sítio — foi por isso que o item ficou aberto, e não por falta de trabalho
 * mecânico.
 *
 * Contados, os 12 tons são **três papéis**:
 *
 * | Papel | Onde já estava | Usos |
 * |---|---|---|
 * | neutro — fechar, alternar, baixar | `fantasma` / `IconButton tom="neutro"` | 60 |
 * | destrutivo — excluir, remover, cancelar | `IconButton tom="perigo"` | 42 |
 * | **ação — editar, abrir, ver detalhe, vincular** | **não existia** | **51** |
 *
 * Só `acao` foi acrescentada. É o azul do primário sem o fundo cheio: a ação
 * principal de uma linha de tabela ou de um cartão, onde quinze botões azuis
 * sólidos empilhados seriam ruído.
 *
 * **O que ficou de fora, de propósito**: emerald (6), amber (3) e indigo (4).
 * Esses não são papel de botão — são a cor de um ESTADO (aprovado, a vencer,
 * base SINAPI) vazando para o controle que age sobre ele. Um `tom` por cor de
 * status são três variantes para 13 sítios, e devolve ao primitivo a explosão
 * de paleta que ele existe para conter. Seguem `<button>` cru, e é a resposta
 * certa: nem todo botão precisa ser primitivo.
 */

type Variante = 'primario' | 'secundario' | 'fantasma' | 'acao' | 'perigo';
type TamanhoBotao = 'sm' | 'md';

const VARIANTES: Record<Variante, string> = {
  primario: `bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 ${FOCO}`,
  secundario: `bg-white text-slate-700 border border-slate-200 shadow-xs hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 ${FOCO}`,
  fantasma: `bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800 active:bg-slate-200 ${FOCO}`,
  acao: `bg-transparent text-slate-500 hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 ${FOCO}`,
  perigo: `bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:bg-rose-800 ${FOCO_PERIGO}`,
};

const TAMANHOS: Record<TamanhoBotao, string> = {
  sm: 'px-2.5 py-1.5 text-2xs gap-1',
  md: 'px-3.5 py-2 text-xs gap-1.5',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
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

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Obrigatório: um botão só de ícone não tem texto acessível nenhum sem isto. */
  rotulo: string;
  /**
   * Tooltip, quando ela precisa dizer MAIS que o nome acessível. Sem isto os dois
   * seriam sempre iguais, e a migração do item 32 achou uma dúzia de sítios em
   * que não são: `title={bloqueado ? motivoBloqueio : 'Editar cliente, escopo,
   * valor, BDI…'}` explica POR QUE o botão está desabilitado, que é justamente o
   * que o rótulo curto não pode dizer. Herdar `title` do `rotulo` teria apagado
   * essa explicação em silêncio.
   *
   * O nome acessível continua sendo `rotulo`: leitor de tela lê `aria-label`, que
   * vence `title`. A dica é reforço visual, nunca a única fonte da informação.
   */
  dica?: string;
  children: React.ReactNode;
  tom?: 'neutro' | 'acao' | 'perigo';
  tamanho?: TamanhoBotao;
  carregando?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

/** Os mesmos três papéis do `Variante`, no botão que não tem texto. */
const TONS_ICONE = {
  neutro: `text-slate-500 hover:text-slate-700 hover:bg-slate-100 ${FOCO}`,
  acao: `text-slate-500 hover:text-blue-600 hover:bg-blue-50 ${FOCO}`,
  perigo: `text-slate-500 hover:text-rose-600 hover:bg-rose-50 ${FOCO_PERIGO}`,
};

/** Botão só de ícone (lixeira, lápis, ✕). Exige rótulo acessível por contrato. */
export function IconButton({
  rotulo,
  dica,
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
      title={dica ?? rotulo}
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
