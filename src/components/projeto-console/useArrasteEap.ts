import { useCallback, useEffect, useRef, useState } from 'react';
import type { EtapaCronograma, PatchOrdem } from '../../types';
import {
  motivoParaNaoAgrupar,
  resolverDestino,
  zonaDoPonteiro,
  type Posicao,
} from '../../lib/cronograma/arrasteEap';
import { mover } from '../../lib/cronograma/reordenar';

/**
 * Arrastar uma LINHA da grade para reordenar a EAP.
 *
 * ==================================================
 * POINTER EVENTS, PELO MESMO MOTIVO QUE O GANTT USA
 * ==================================================
 * O alvo aqui é discreto ("em que linha eu soltei"), que é justamente o caso em
 * que o HTML5 drag and drop do kanban serviria. Mesmo assim este arraste usa
 * pointer events, por dois motivos que valem mais que a semelhança:
 *
 * 1. O gráfico logo acima já arrasta com pointer events (`gantt/useArraste`), e
 *    duas técnicas de arraste na MESMA tela é o que o cabeçalho de lá evitou de
 *    propósito. Um `dragstart` do HTML5 iniciado sobre a grade convive mal com
 *    um `setPointerCapture` iniciado três pixels acima.
 * 2. HTML5 DnD não funciona com toque no iOS Safari, e a equipe de campo usa
 *    tablet. A alça de arraste seria decorativa lá.
 *
 * O equivalente por teclado NÃO é este gesto: é `Alt` com as setas, que já
 * existia antes dele e continua sendo o caminho principal (ver `teclasDaLinha`
 * em `AbaCronograma`). Arraste é o atalho de quem tem mouse.
 */

export interface EstadoArrasteEap {
  arrastadaId: string;
  /** A linha sob o ponteiro. `null` quando o gesto está fora de qualquer linha. */
  alvoId: string | null;
  posicao: Posicao;
  /** As linhas a gravar quando soltar. Vazio enquanto não há destino válido. */
  patches: PatchOrdem[];
  /** Por que não dá para soltar aqui. Vazio quando dá. */
  recusa: string;
  /** Por que o alvo não oferece a zona "dentro". Não impede soltar como irmão. */
  aviso: string;
  /** O que vai acontecer, em uma frase. */
  resumo: string;
}

interface Opcoes {
  etapas: EtapaCronograma[];
  /**
   * Quem tem vínculo de orçamento ou boletim — não pode virar grupo
   * (fn_etapa_pai_sem_execucao).
   */
  comExecucao: ReadonlySet<string>;
  habilitado: boolean;
  /** `arrastadaId` vem junto porque o patch sozinho não diz quem foi movido. */
  aoSoltar: (patches: PatchOrdem[], arrastadaId: string) => void;
}

/** Deslocamento mínimo para o gesto virar arraste, e não clique. */
const LIMIAR_PX = 4;

export function useArrasteEap({ etapas, comExecucao, habilitado, aoSoltar }: Opcoes) {
  const [estado, setEstado] = useState<EstadoArrasteEap | null>(null);

  /**
   * O estado vivo do gesto num ref; o `useState` existe só para PINTAR.
   *
   * Mesma razão detalhada em `gantt/useArraste`: `pointerup` precisa do último
   * valor calculado no `pointermove`, e lê-lo de um `useState` daria o valor do
   * render anterior sempre que os dois eventos caem no mesmo quadro — um
   * arraste rápido, ou qualquer toque.
   */
  const gesto = useRef<{
    etapa: EtapaCronograma;
    x0: number;
    y0: number;
    passouDoLimiar: boolean;
    ultimo: EstadoArrasteEap | null;
  } | null>(null);

  const encerrar = useCallback(() => {
    gesto.current = null;
    setEstado(null);
  }, []);

  // `Escape` cancela sem gravar. Em `window` porque durante um arraste com o
  // mouse o foco não está garantido em elemento nenhum.
  useEffect(() => {
    if (!estado) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') encerrar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [estado, encerrar]);

  const aoMover = useCallback(
    (e: React.PointerEvent) => {
      const g = gesto.current;
      if (!g) return;

      if (!g.passouDoLimiar) {
        const dx = Math.abs(e.clientX - g.x0);
        const dy = Math.abs(e.clientY - g.y0);
        if (dx < LIMIAR_PX && dy < LIMIAR_PX) return;
        g.passouDoLimiar = true;
      }

      // Quem está sob o cursor? `elementFromPoint` porque a captura de ponteiro
      // redireciona todos os eventos para a alça de origem — nenhum
      // `onPointerEnter` das outras linhas dispara durante o gesto. No jsdom a
      // função não existe, daí o `?.`: ausência significa "sem alvo", que é o
      // mesmo que arrastar para fora da tabela.
      const sob = document.elementFromPoint?.(e.clientX, e.clientY);
      const linhaAlvo = sob?.closest<HTMLElement>('[data-etapa-linha]');
      const alvoId = linhaAlvo?.dataset.etapaLinha ?? null;

      const vazio: EstadoArrasteEap = {
        arrastadaId: g.etapa.id,
        alvoId: null,
        posicao: 'depois',
        patches: [],
        recusa: '',
        aviso: '',
        resumo: '',
      };

      const alvo = alvoId ? etapas.find((x) => x.id === alvoId) : undefined;
      if (!linhaAlvo || !alvo) {
        g.ultimo = vazio;
        setEstado(vazio);
        return;
      }

      const caixa = linhaAlvo.getBoundingClientRect();
      const fracao = caixa.height > 0 ? (e.clientY - caixa.top) / caixa.height : 0.5;
      const aviso = motivoParaNaoAgrupar(etapas, g.etapa.id, alvo, comExecucao);
      const posicao = zonaDoPonteiro(fracao, aviso === '');
      const { destino, recusa, resumo } = resolverDestino(
        etapas,
        g.etapa.id,
        alvo.id,
        posicao,
        comExecucao
      );

      // `mover` devolve vazio quando a posição não muda — é essa mesma lista
      // vazia que impede o arraste desistido de virar escrita lá embaixo, e é
      // ela que distingue "vai para lá" de "já está lá" no rodapé.
      const patches = destino ? mover(etapas, g.etapa.id, destino) : [];

      g.ultimo = {
        arrastadaId: g.etapa.id,
        alvoId: alvo.id,
        posicao,
        patches,
        recusa,
        // O aviso só interessa quando a pessoa está mirando o alvo como grupo,
        // e não a cada linha que o ponteiro atravessa de passagem.
        aviso: alvo.id === g.etapa.id ? '' : aviso,
        resumo: destino && patches.length === 0 ? `"${g.etapa.nome}" já está aí.` : resumo,
      };
      setEstado(g.ultimo);
    },
    [etapas, comExecucao]
  );

  const aoSoltarPonteiro = useCallback(
    (e: React.PointerEvent) => {
      const g = gesto.current;
      const atual = g?.ultimo ?? null;
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      gesto.current = null;
      setEstado(null);
      if (!g || !g.passouDoLimiar || !atual) return;
      if (atual.recusa || atual.patches.length === 0) return;
      aoSoltar(atual.patches, atual.arrastadaId);
    },
    [aoSoltar]
  );

  /** Os handlers da alça de arraste. Espalhe no elemento que inicia o gesto. */
  const alcas = useCallback(
    (etapa: EtapaCronograma) => {
      if (!habilitado) return {};
      return {
        onPointerDown: (e: React.PointerEvent) => {
          // Só o botão primário: o secundário abre o menu do navegador, e
          // capturar o ponteiro nesse caso prende o gesto num estado sem saída.
          if (e.button !== 0) return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          gesto.current = {
            etapa,
            x0: e.clientX,
            y0: e.clientY,
            passouDoLimiar: false,
            ultimo: null,
          };
        },
        onPointerMove: aoMover,
        onPointerUp: aoSoltarPonteiro,
        onPointerCancel: encerrar,
      };
    },
    [habilitado, aoMover, aoSoltarPonteiro, encerrar]
  );

  return { estado, alcas };
}
