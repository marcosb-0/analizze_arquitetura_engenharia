import { useEffect, useRef } from 'react';

/**
 * Prende o foco dentro de um overlay e o devolve ao fechar.
 *
 * Extraído do primitivo `components/ui/Modal` para atender também os overlays
 * que não cabem nele — a pré-visualização de impressão da proposta tem uma barra
 * de ferramentas no lugar do cabeçalho e uma altura fixa de que o CSS de
 * impressão depende, então reestruturá-la para caber no Modal arriscaria o
 * documento que vai ao cliente. O comportamento de teclado, porém, é o mesmo.
 *
 * Devolve a ref que deve ser pendurada no contêiner do diálogo.
 */

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useArmadilhaDeFoco(ativo: boolean) {
  const caixaRef = useRef<HTMLElement | null>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);

  // Guarda o foco de origem, move-o para dentro e devolve ao sair.
  useEffect(() => {
    if (!ativo) return;
    focoAnterior.current = document.activeElement as HTMLElement | null;

    const t = window.setTimeout(() => {
      const caixa: HTMLElement | null = caixaRef.current;
      if (!caixa) return;
      const alvo: HTMLElement =
        (caixa.querySelector('[data-autofocus]') as HTMLElement | null) ??
        (caixa.querySelector(FOCAVEIS) as HTMLElement | null) ??
        caixa;
      alvo.focus();
    }, 0);

    return () => {
      window.clearTimeout(t);
      const anterior: HTMLElement | null = focoAnterior.current;
      if (anterior && typeof anterior.focus === 'function') anterior.focus();
    };
  }, [ativo]);

  // Circula o Tab dentro do contêiner.
  useEffect(() => {
    if (!ativo) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const caixa: HTMLElement | null = caixaRef.current;
      if (!caixa) return;

      const alvos: HTMLElement[] = (Array.from(caixa.querySelectorAll(FOCAVEIS)) as HTMLElement[]).filter(
        // `offsetParent` nulo = elemento escondido; não entra na tabulação.
        (el) => el.offsetParent !== null
      );
      if (alvos.length === 0) {
        e.preventDefault();
        return;
      }

      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];
      const ativoAgora = document.activeElement;

      if (e.shiftKey && (ativoAgora === primeiro || !caixa.contains(ativoAgora))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (ativoAgora === ultimo || !caixa.contains(ativoAgora))) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [ativo]);

  // Impede a página atrás de rolar junto.
  useEffect(() => {
    if (!ativo) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [ativo]);

  return caixaRef;
}
