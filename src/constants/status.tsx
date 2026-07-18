import React from 'react';

export const STATUS_CONFIG = {
  projeto: {
    'Planejamento':    { bg: 'bg-slate-100',   text: 'text-slate-700',   border: 'border-slate-200',   dot: 'bg-slate-400' },
    'Em Execução':     { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500' },
    'Pausado':         { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
    'Finalizado':      { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  },
  proposta: {
    'Elaboração':      { bg: 'bg-slate-100',   text: 'text-slate-700',   border: 'border-slate-200',   dot: 'bg-slate-400' },
    'Enviada':         { bg: 'bg-sky-50',      text: 'text-sky-700',     border: 'border-sky-200',      dot: 'bg-sky-500' },
    'Aprovada':        { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    'Rejeitada':       { bg: 'bg-rose-50',     text: 'text-rose-700',    border: 'border-rose-200',     dot: 'bg-rose-500' },
  },
  etapa: {
    'Não Iniciado':    { bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400' },
    'Em Andamento':    { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500' },
    'Concluído':       { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    'Atrasado':        { bg: 'bg-rose-50',     text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-500' },
  },
  funcionario: {
    'Ativo':           { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    'Inativo':         { bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400' },
  }
} as const;

export function StatusBadge({ 
  type, 
  status, 
  showDot = true 
}: { 
  type: keyof typeof STATUS_CONFIG;
  status: string;
  showDot?: boolean;
}) {
  const configType = STATUS_CONFIG[type];
  const config = (configType as any)[status] || (configType as any)[Object.keys(configType)[0]];
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border}`}>
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />}
      {status}
    </span>
  );
}
