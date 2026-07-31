import React from 'react';
import { CAMPO_BASE, CAMPO_TAMANHO, Tamanho } from './tokens';

/**
 * Campos de formulário. Havia ~25 combinações de padding/raio/fundo para o que
 * é o mesmo input — e nenhuma tinha anel de foco (só uma troca de cor de borda
 * de 1px, invisível para quem navega por teclado).
 */

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  tamanho?: Tamanho;
  /** Ícone à esquerda (lupa, cifrão). O padding da esquerda se ajusta sozinho. */
  icone?: React.ReactNode;
  /** Texto fixo à direita — unidade, "%", "R$". */
  sufixo?: React.ReactNode;
  mono?: boolean;
  className?: string;
}

export function Input({ tamanho = 'md', icone, sufixo, mono = false, className = '', ...rest }: InputProps) {
  const campo = (
    <input
      className={`${CAMPO_BASE} ${CAMPO_TAMANHO[tamanho]} ${mono ? 'font-mono' : ''} ${icone ? 'pl-8' : ''} ${sufixo ? 'pr-10' : ''} ${className}`}
      {...rest}
    />
  );

  if (!icone && !sufixo) return campo;

  return (
    <div className="relative">
      {icone && (
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex items-center">
          {icone}
        </span>
      )}
      {campo}
      {sufixo && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-2xs text-slate-400 pointer-events-none">
          {sufixo}
        </span>
      )}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  tamanho?: Tamanho;
  rows?: number;
  className?: string;
}

export function Textarea({ tamanho = 'md', rows = 3, className = '', ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={`${CAMPO_BASE} ${CAMPO_TAMANHO[tamanho]} resize-y ${className}`}
      {...rest}
    />
  );
}
