import React from 'react';
import { ALVO, FOCO } from './tokens';

/**
 * Filtro em pílula — a fileira de opções mutuamente exclusivas que o mockup
 * "Analizze - App" usa no lugar do `<select>` de status.
 *
 * ## Por que é primitivo, e não mais uma fileira escrita à mão
 *
 * O padrão entrou em 14/ago/2026 por duas telas — a situação da obra e as
 * categorias do catálogo — e as duas escreveram a mesma receita de 6 linhas
 * separadamente (`ALVO.md` + `FOCO` + `rounded-full px-3.5 text-2xs` + o par
 * ativo/inativo). Ao levar o padrão para as outras nove telas isso seriam onze
 * cópias de uma regra de cor: exatamente a dívida que `Button` e `Chip` já
 * pagaram, chegando pela terceira vez. O DESIGN.md descrevia a pílula em
 * palavras e nenhum arquivo a implementava.
 *
 * ## A régua de quando usar
 *
 * Conjunto **fechado e curto** de opções que se excluem (situação da obra,
 * categoria do catálogo, status da proposta, tipo de contrato). O valor de
 * vê-las todas de uma vez é saber que existem: dentro de um `<select>`,
 * "Pausado" só aparece para quem abre o menu. Conjunto aberto ou infinito
 * (nome, código, cliente) continua sendo campo de busca; conjunto fechado que
 * troca o MODO da tela (tabela ⇄ cartões) é `CONTROLE_GRUPO`, o alternador.
 *
 * O ativo é `slate-900` sólido, e não o azul: o azul é a cor de AÇÃO, e uma
 * fileira de filtros ao lado de um `Button` primário punha dois azuis
 * disputando a mesma atenção — o mesmo argumento que tirou o azul do
 * `CONTROLE_GRUPO`.
 *
 * `aria-pressed` e não `role="tab"`: são botões que ligam e desligam um
 * recorte da mesma lista, não abas que trocam de painel.
 */

interface PilulaProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  ativo: boolean;
  /** Decorativo — o rótulo é quem nomeia. */
  icone?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Pilula({ ativo, icone, children, className = '', ...rest }: PilulaProps) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      className={`${ALVO.md} ${FOCO} inline-flex items-center gap-1.5 rounded-full px-3.5 text-2xs transition ${
        ativo
          ? 'bg-slate-900 font-bold text-white'
          : 'border border-slate-200 bg-white font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900'
      } ${className}`}
      {...rest}
    >
      {icone && (
        /* `slate-500` e não o `slate-400` do mockup: o guarda de contraste do
           `estilo.test.ts` barra o 400 mesmo em ícone decorativo, e a diferença
           entre os dois tons ao lado de um rótulo `slate-600` é imperceptível. */
        <span className={ativo ? '' : 'text-slate-500'} aria-hidden="true">
          {icone}
        </span>
      )}
      {children}
    </button>
  );
}

interface FileiraPilulasProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Rótulo do conjunto para quem navega por leitor de tela ("Situação", "Categoria"). */
  rotulo: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * O contêiner da fileira. Existe pelo `aria-label`: sem ele, um leitor de tela
 * anuncia sete botões soltos sem dizer de que eles são o filtro.
 *
 * `flex-wrap` e não rolagem horizontal: as fileiras do app têm de 3 a 8 opções
 * curtas, e uma barra de rolagem esconderia justamente a opção que a pílula
 * existe para mostrar.
 */
export function FileiraPilulas({ rotulo, children, className = '', ...rest }: FileiraPilulasProps) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className={`flex flex-wrap items-center gap-2 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
