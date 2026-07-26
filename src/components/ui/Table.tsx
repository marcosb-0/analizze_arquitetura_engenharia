import React from 'react';
import type { PropsNativas } from './tipos';

/**
 * Tabela de dados.
 *
 * Havia 13 tabelas e só 8 contêineres com `overflow-x-auto`: as restantes
 * estouravam horizontalmente e empurravam o layout da página inteira. Aqui o
 * scroll horizontal é do próprio contêiner, sempre.
 */

const ALINHAMENTO = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;
type Alinhamento = keyof typeof ALINHAMENTO;

export function TableWrap({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full text-left border-collapse text-xs">{children}</table>
    </div>
  );
}

interface CelulaProps extends PropsNativas {
  align?: Alinhamento;
  children?: React.ReactNode;
  className?: string;
}

export function Th({ children, align = 'left', className = '', ...rest }: CelulaProps) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-2xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap bg-slate-50 border-b border-slate-200 ${ALINHAMENTO[align]} ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  mono = false,
  className = '',
  ...rest
}: CelulaProps & { mono?: boolean }) {
  return (
    <td
      className={`px-3 py-2 text-slate-700 border-b border-slate-100 ${ALINHAMENTO[align]} ${mono ? 'font-mono' : ''} ${className}`}
      {...rest}
    >
      {children}
    </td>
  );
}
