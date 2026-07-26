import React from 'react';
import type { PropsNativas } from './tipos';

/**
 * Superfície branca padrão. O app usava `rounded-lg`, `rounded-xl` e
 * `rounded-2xl` para o mesmo tipo de bloco, com `shadow-sm`/`shadow-xs`/nenhuma
 * sombra, e boa parte das bordas apontava para `slate-150` — um tom que não
 * existe, o que fazia a borda sair na cor do texto.
 */

interface CardProps extends PropsNativas {
  /** Remove o padding interno — para cards que contêm uma tabela colada às bordas. */
  semPadding?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '', semPadding = false, ...rest }: CardProps) {
  return (
    <div
      className={`bg-white rounded-lg border border-slate-200 shadow-sm ${semPadding ? '' : 'p-4'} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Ações à direita — botões, filtros, badges. */
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, description, actions, icon, className = '' }: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="flex items-start gap-2 min-w-0">
        {icon && <div className="p-1.5 bg-blue-50 rounded text-blue-600 shrink-0">{icon}</div>}
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900 text-xs leading-tight">{title}</h3>
          {description && <p className="text-2xs text-slate-400 mt-0.5 leading-snug">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
