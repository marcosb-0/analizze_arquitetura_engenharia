import React from 'react';
import { ArrowUpDown } from 'lucide-react';
import { Button } from './Button';
import { Select } from './Select';

/**
 * Barra de ordenação e rodapé de "carregar mais" das listas de cadastro.
 * Par visual do hook `useListaOrdenada`.
 */

interface SeletorOrdenacaoProps {
  opcoes: { id: string; label: string }[];
  valor: string;
  onChange: (id: string) => void;
  /** Mostrado à esquerda: "12 de 340". */
  mostrando?: number;
  total?: number;
  className?: string;
}

export function SeletorOrdenacao({
  opcoes,
  valor,
  onChange,
  mostrando,
  total,
  className = '',
}: SeletorOrdenacaoProps) {
  const id = React.useId();

  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      {typeof total === 'number' && (
        <span className="text-2xs text-slate-400 font-semibold whitespace-nowrap">
          {mostrando === total ? `${total}` : `${mostrando} de ${total}`}
        </span>
      )}
      <div className="flex items-center gap-1.5 min-w-0">
        <label htmlFor={id} className="sr-only">
          Ordenar por
        </label>
        <ArrowUpDown size={13} className="text-slate-400 shrink-0" aria-hidden="true" />
        <Select
          id={id}
          tamanho="sm"
          value={valor}
          onChange={(e: any) => onChange(e.target.value)}
          className="min-w-0"
        >
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

interface CarregarMaisProps {
  temMais: boolean;
  restantes: number;
  onCarregarMais: () => void;
  className?: string;
}

export function CarregarMais({ temMais, restantes, onCarregarMais, className = '' }: CarregarMaisProps) {
  if (!temMais) return null;
  return (
    <div className={`flex justify-center py-3 ${className}`}>
      <Button variante="secundario" tamanho="sm" onClick={onCarregarMais}>
        Carregar mais ({restantes} restantes)
      </Button>
    </div>
  );
}
