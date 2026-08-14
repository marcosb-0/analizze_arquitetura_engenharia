import React from 'react';
import { PREENCHIMENTO_HEX } from './tokens';

/**
 * Anel de percentual — `conic-gradient` puro CSS, sem lib de gráfico.
 *
 * Novo em 14/ago/2026, a partir do mockup "Analizze - App": o app não tinha
 * nenhum componente circular (achado do reconhecimento: zero ocorrência de
 * `conic-gradient`/`donut`/`ring` em `src/` antes desta rodada). O mockup usa
 * este padrão em três lugares (execução financeira do dashboard, avanço da
 * obra no cartão, resumo de faturamento) — sempre com o miolo branco e o
 * valor centrado, nunca como decoração solta.
 *
 * Estático de propósito: é uma fatia de percentual, não anima nem precisa
 * respeitar `prefers-reduced-motion` (não há `@keyframes` aqui).
 *
 * A cor do arco vem de `PREENCHIMENTO_HEX` — mesmo motivo de sempre: é
 * `background` via CSS, não `className`, então tem que ser hex. A trilha usa
 * o `slate-200` novo (`#eef1f6`) escrito à mão pelo mesmo motivo do `stroke`
 * de `.campo-seta` em `index.css`: `conic-gradient` não lê `var()` de tema
 * dentro de um valor calculado em JS.
 *
 * `espessura` tem um padrão proporcional ao `tamanho` (⅛) porque foi o que o
 * mockup usa nos três anéis (112→14, 68→9, 64→8) — mas fica como prop porque
 * é geometria, não constante: cabe a quem chama decidir se o texto do miolo
 * precisa de mais respiro.
 */

interface AnelProgressoProps {
  /** 0–100. Fora da faixa é grampeado (não estoura o `conic-gradient`). */
  percentual: number;
  tom?: keyof typeof PREENCHIMENTO_HEX;
  /** Diâmetro externo em px. */
  tamanho?: number;
  espessura?: number;
  children?: React.ReactNode;
}

export function AnelProgresso({
  percentual,
  tom = 'acao',
  tamanho = 64,
  espessura,
  children,
}: AnelProgressoProps) {
  const pct = Math.min(100, Math.max(0, percentual));
  const traco = espessura ?? Math.round(tamanho * 0.125);
  const interno = tamanho - traco * 2;
  const cor = PREENCHIMENTO_HEX[tom];

  return (
    <div
      role="img"
      aria-label={`${pct}%`}
      className="relative shrink-0 rounded-full"
      style={{
        width: tamanho,
        height: tamanho,
        background: `conic-gradient(${cor} 0turn ${pct / 100}turn, #eef1f6 ${pct / 100}turn 1turn)`,
      }}
    >
      <div
        className="absolute rounded-full bg-white flex flex-col items-center justify-center"
        style={{ width: interno, height: interno, top: traco, left: traco }}
      >
        {children ?? (
          <span className="data-font text-xs font-bold text-slate-900">{pct}%</span>
        )}
      </div>
    </div>
  );
}
