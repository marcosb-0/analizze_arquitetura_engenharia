import { PREENCHIMENTO_HEX } from './tokens';

/**
 * Avanço desenhado como fita de trena graduada — a assinatura do redesenho
 * "Trena" (22/set/2026).
 *
 * Por que não uma barra lisa: o que o app mede é obra, e a leitura que o
 * canteiro faz de uma trena é instantânea — marca curta a cada 10%, marca
 * longa na metade, gancho na ponta. O gancho (`--color-trena-tinta` sobre o
 * amarelo) é o que garante o contraste de 3:1 do elemento não textual: o
 * amarelo da fita sozinho não passa sobre o fundo claro, a ponta escura passa
 * em qualquer fundo.
 *
 * `tom="trena"` é o padrão (avanço físico/medido). Outros tons vêm de
 * `PREENCHIMENTO_HEX` — os mesmos já medidos para barra — para quando o
 * avanço carrega um estado (financeiro executado acima do previsto, etc.).
 */
interface TrenaProps {
  percentual: number;
  tom?: 'trena' | keyof typeof PREENCHIMENTO_HEX;
  /** Altura da fita em px. */
  altura?: number;
  /** Rótulo acessível. Sem ele, lê-se só o percentual. */
  rotulo?: string;
  /** Mostra os números 0 · 50 · 100 sob a fita. */
  escala?: boolean;
  className?: string;
}

export function Trena({ percentual, tom = 'trena', altura = 10, rotulo, escala = false, className = '' }: TrenaProps) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(percentual) ? percentual : 0));
  const cor = tom === 'trena' ? 'var(--color-trena)' : PREENCHIMENTO_HEX[tom];
  return (
    <div className={className}>
      <div
        role="img"
        aria-label={`${rotulo ? `${rotulo}: ` : ''}${Math.round(pct)}%`}
        className="relative w-full overflow-hidden rounded-[3px] bg-slate-200"
        style={{ height: altura }}
      >
        <div className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, background: cor }} />
        {/* Graduação: marca curta a cada 10%, longa aos 50%. */}
        <div aria-hidden="true" className="trena-graduacao absolute inset-0" />
        {pct > 0 && (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 w-[3px] bg-trena-tinta"
            style={{ left: `calc(${pct}% - 3px)` }}
          />
        )}
      </div>
      {escala && (
        <div aria-hidden="true" className="mt-1 flex justify-between font-mono text-2xs font-semibold text-slate-500">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      )}
    </div>
  );
}
