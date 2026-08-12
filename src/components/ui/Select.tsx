import React from 'react';
import { CAMPO_BASE, CAMPO_FUNDO, CAMPO_LARGURA, CAMPO_TAMANHO, FundoCampo, LarguraCampo, Tamanho } from './tokens';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  tamanho?: Tamanho;
  fundo?: FundoCampo;
  /** `automatica` para filtro que não deve tomar a linha. Ver `CAMPO_LARGURA`. */
  largura?: LarguraCampo;
  children?: React.ReactNode;
  className?: string;
}

/**
 * `<select>` nativo com a seta do sistema substituída por uma consistente.
 *
 * Continua sendo um select nativo de propósito: no celular ele abre o seletor do
 * sistema operacional, que é o comportamento certo para os usuários de campo, e
 * nenhum dropdown customizado chega perto disso em acessibilidade de graça.
 *
 * A seta é `background-image` (`.campo-seta`, em `index.css`) e não um ícone
 * irmão. A versão anterior usava um `<ChevronDown>` posicionado em absoluto, o
 * que obrigava o componente a se embrulhar num `<div className="relative">` — e
 * o wrapper fazia toda classe de LAYOUT passada em `className` cair no
 * `<select>` interno, enquanto quem participava do layout do pai era o div.
 * `flex-1` não crescia, `max-w-[180px]` deixava a seta boiando longe do campo, e
 * nada no JSX explicava. Sem wrapper, `className` significa a mesma coisa aqui,
 * no `Input` e no `Textarea`.
 */
export function Select({ tamanho = 'md', fundo = 'branco', largura = 'cheia', className = '', children, ...rest }: SelectProps) {
  return (
    <select
      className={`${CAMPO_BASE} ${CAMPO_LARGURA[largura]} ${CAMPO_FUNDO[fundo]} ${CAMPO_TAMANHO[tamanho]} campo-seta appearance-none pr-8 cursor-pointer disabled:cursor-not-allowed ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
