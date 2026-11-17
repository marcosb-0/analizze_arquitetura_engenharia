import React from 'react';
import { ProgressCircle } from '@heroui/react';
import { PREENCHIMENTO_HEX } from './tokens';

/** Anel de percentual: o `ProgressCircle` do HeroUI, com o valor no centro e a cor do arco por `tom`. */
interface AnelProgressoProps {
  /** 0–100. Fora da faixa é grampeado. */
  percentual: number;
  tom?: keyof typeof PREENCHIMENTO_HEX;
  /** Diâmetro externo em px. */
  tamanho?: number;
  children?: React.ReactNode;
}

export function AnelProgresso({
  percentual,
  tom = 'acao',
  tamanho = 64,
  children,
}: AnelProgressoProps) {
  const pct = Math.min(100, Math.max(0, percentual));
  return (
    <ProgressCircle aria-label={`${pct}%`} value={pct} className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      <ProgressCircle.Track className="size-full">
        <ProgressCircle.TrackCircle style={{ stroke: 'var(--fill-trilha)' }} />
        <ProgressCircle.FillCircle style={{ stroke: PREENCHIMENTO_HEX[tom] }} />
      </ProgressCircle.Track>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children ?? <span className="font-mono text-xs font-semibold text-slate-900">{pct}%</span>}
      </div>
    </ProgressCircle>
  );
}
