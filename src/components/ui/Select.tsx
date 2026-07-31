import React from 'react';
import { ChevronDown } from 'lucide-react';
import { CAMPO_BASE, CAMPO_TAMANHO, Tamanho } from './tokens';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  tamanho?: Tamanho;
  children?: React.ReactNode;
  className?: string;
}

/**
 * `<select>` nativo com a seta do sistema substituída por uma consistente.
 *
 * Continua sendo um select nativo de propósito: no celular ele abre o seletor do
 * sistema operacional, que é o comportamento certo para os usuários de campo, e
 * nenhum dropdown customizado chega perto disso em acessibilidade de graça.
 */
export function Select({ tamanho = 'md', className = '', children, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={`${CAMPO_BASE} ${CAMPO_TAMANHO[tamanho]} appearance-none pr-8 cursor-pointer disabled:cursor-not-allowed ${className}`}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        aria-hidden="true"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
      />
    </div>
  );
}
