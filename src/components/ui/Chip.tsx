import React from 'react';
import { CHIP, type TomChip } from './tokens';
import type { PropsNativas } from './tipos';

/**
 * Pill de status — fundo + texto + bolinha opcional, sempre por `tom`, nunca
 * por `className` de cor.
 *
 * ## Por que não existia, e por que os hex vêm de `style` e não de classe
 *
 * Novo em 14/ago/2026, a partir do mockup "Analizze - App": antes deste
 * primitivo, 15+ telas reinventavam a mesma pill à mão, cada uma com sua
 * lógica de cor (achado do reconhecimento pré-refactor). É a mesma dívida que
 * `Button`/`Input` já resolveram para botão e campo, agora para o status.
 *
 * O fundo pálido do chip (`#e8f7f0`, `#fdecef`, …) não é um degrau da escala
 * `slate`/`blue` do Tailwind — é um tom próprio, só deste componente. Por
 * isso vem de `tokens.ts` (`CHIP`) como hex e entra via `style`, não via
 * classe: inventar uma classe Tailwind por tom pálido devolveria a explosão
 * de combinações que os outros primitivos existem para conter.
 *
 * `ponto` é opcional porque nem toda pill do mockup tem a bolinha — o chip de
 * procedência do Catálogo, por exemplo, é só fundo + texto.
 */

interface ChipProps extends PropsNativas<HTMLSpanElement> {
  tom: TomChip;
  /** Bolinha de 6px à esquerda do texto. Some por padrão. */
  ponto?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Chip({ tom, ponto = false, children, className = '', style, ...rest }: ChipProps) {
  const cores = CHIP[tom];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-bold whitespace-nowrap ${className}`}
      style={{ background: cores.fundo, color: cores.texto, ...style }}
      {...rest}
    >
      {ponto && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: cores.ponto }}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
