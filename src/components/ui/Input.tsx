import React from 'react';
import { CAMPO_BASE, CAMPO_FUNDO, CAMPO_LARGURA, CAMPO_TAMANHO, FundoCampo, LarguraCampo, Tamanho } from './tokens';

/**
 * Campos de formulário. Havia ~25 combinações de padding/raio/fundo para o que
 * é o mesmo input — e nenhuma tinha anel de foco (só uma troca de cor de borda
 * de 1px, invisível para quem navega por teclado).
 */

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  tamanho?: Tamanho;
  /** `suave` para campo dentro de cartão, onde branco sobre branco some. */
  fundo?: FundoCampo;
  /** Ícone à esquerda (lupa, cifrão). O padding da esquerda se ajusta sozinho. */
  icone?: React.ReactNode;
  /** Texto fixo à direita — unidade, "%", "R$". */
  sufixo?: React.ReactNode;
  mono?: boolean;
  /** Ver `CAMPO_LARGURA`: largura passada por `className` perde para o token. */
  largura?: LarguraCampo;
  className?: string;
}

export function Input({ tamanho = 'md', fundo = 'branco', icone, sufixo, mono = false, largura = 'cheia', className = '', ...rest }: InputProps) {
  const campo = (
    <input
      className={`${CAMPO_BASE} ${CAMPO_LARGURA[largura]} ${CAMPO_FUNDO[fundo]} ${CAMPO_TAMANHO[tamanho]} ${mono ? 'font-mono' : ''} ${icone ? 'pl-8' : ''} ${sufixo ? 'pr-10' : ''} ${className}`}
      {...rest}
    />
  );

  if (!icone && !sufixo) return campo;

  return (
    <div className="relative">
      {icone && (
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none flex items-center">
          {icone}
        </span>
      )}
      {campo}
      {sufixo && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-2xs text-slate-500 pointer-events-none">
          {sufixo}
        </span>
      )}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  tamanho?: Tamanho;
  fundo?: FundoCampo;
  largura?: LarguraCampo;
  rows?: number;
  className?: string;
}

export function Textarea({ tamanho = 'md', fundo = 'branco', largura = 'cheia', rows = 3, className = '', ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={`${CAMPO_BASE} ${CAMPO_LARGURA[largura]} ${CAMPO_FUNDO[fundo]} ${CAMPO_TAMANHO[tamanho]} resize-y ${className}`}
      {...rest}
    />
  );
}
