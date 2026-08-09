import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dependencia, EtapaCronograma, MudancasCronograma } from '../../../types';
import { agendar, patchesDe, type ResultadoAgendamento } from '../../../lib/cronograma/agendar';
import { detectarCiclo } from '../../../lib/cronograma/grafo';
import { somarDias, type EscalaTempo } from './escalaTempo';

/**
 * Arrastar no Gantt: mover a barra, esticar as pontas e criar ligações.
 *
 * ============================================================
 * POR QUE POINTER EVENTS, E NÃO O HTML5 DRAG AND DROP DO KANBAN
 * ============================================================
 * O precedente do projeto (`tarefas/Quadro.tsx`, com `MIME_TAREFA`) resolve um
 * problema DIFERENTE: alvos discretos — "em qual coluna eu soltei". Aqui a
 * manipulação é contínua, e o HTML5 DnD não dá conta:
 *
 * 1. COORDENADAS. Esticar uma barra ao dia exige `clientX` a cada movimento. O
 *    evento `drag` é disparado em intervalo escolhido pelo navegador e, em
 *    várias plataformas, entrega `clientX`/`clientY` zerados. Só `dragover` no
 *    ALVO é confiável — e aqui o alvo é o próprio elemento arrastado.
 * 2. FEEDBACK AO VIVO. A imagem de arraste do HTML5 é um retrato congelado no
 *    `dragstart`. Uma barra que precisa CRESCER enquanto se arrasta é
 *    impossível; `setDragImage` não atualiza depois.
 * 3. CAPTURA. `setPointerCapture` mantém os eventos no elemento mesmo quando o
 *    ponteiro sai dele — indispensável ao arrastar além da borda do gráfico. E
 *    `pointercancel` dá um cancelamento limpo, que o HTML5 DnD não tem.
 * 4. TOQUE. HTML5 DnD não funciona com toque no iOS Safari, e a equipe de campo
 *    usa tablet.
 * 5. AUTO-ROLAGEM de borda precisa de um laço rAF alimentado pela posição do
 *    ponteiro — trivial aqui, sem fonte confiável lá.
 *
 * O custo assumido é ter duas técnicas de arraste no app. O Gantt usa SÓ
 * pointer events, para pelo menos não ter duas na mesma tela.
 */

export type ModoArraste = 'mover' | 'redim-inicio' | 'redim-fim' | 'ligar';

/** De onde a ligação sai / onde ela chega. É o que define o tipo do vínculo. */
export type PontaBarra = 'inicio' | 'fim';

export interface EstadoArraste {
  modo: ModoArraste;
  etapaId: string;
  /** Já arredondado ao dia — o "snap" sai daqui, não da grade de ticks. */
  deltaDias: number;
  /** Posição do ponteiro relativa ao container, para a linha elástica. */
  ponteiro: { x: number; y: number } | null;
  pontaOrigem: PontaBarra;
  alvo: { etapaId: string; ponta: PontaBarra } | null;
  /** Por que o alvo sob o cursor não serve. Vazio quando serve. */
  recusa: string;
  /** Onde as sucessoras vão parar, recalculado a cada movimento. */
  previsao: ResultadoAgendamento | null;
}

interface Opcoes {
  escala: EscalaTempo;
  /** Só folhas: grupo tem data rolada e não é arrastável. */
  folhas: EtapaCronograma[];
  dependencias: Dependencia[];
  habilitado: boolean;
  /** Recebe o diff pronto e quantas etapas além da arrastada mudaram de data. */
  aoConcluir: (mudancas: MudancasCronograma, reagendadas: number) => void;
}

/** Deslocamento mínimo para o gesto virar arraste, e não clique. */
const LIMIAR_PX = 4;

/** O tipo do vínculo sai das duas pontas — é a convenção de todo Gantt. */
function tipoDe(origem: PontaBarra, destino: PontaBarra) {
  if (origem === 'fim') return destino === 'inicio' ? ('FS' as const) : ('FF' as const);
  return destino === 'inicio' ? ('SS' as const) : ('SF' as const);
}

export function useArraste({
  escala,
  folhas,
  dependencias,
  habilitado,
  aoConcluir,
}: Opcoes) {
  const [estado, setEstado] = useState<EstadoArraste | null>(null);

  /**
   * O estado vivo do gesto fica num ref, e o `useState` existe só para PINTAR.
   *
   * Não é otimização: é correção. `pointerup` precisa do último valor calculado
   * em `pointermove`, e ler isso de um `useState` daria o valor do render
   * ANTERIOR. Em produção o React normalmente recommita entre os dois eventos e
   * o defeito não aparece — mas quando o `pointerup` chega no mesmo quadro do
   * último `pointermove` (um arraste rápido, um toque), o handler ainda é o
   * antigo e o gesto inteiro é descartado sem erro nenhum. O ref não depende do
   * momento do commit.
   */
  const gesto = useRef<{
    modo: ModoArraste;
    etapa: EtapaCronograma;
    x0: number;
    passouDoLimiar: boolean;
    pontaOrigem: PontaBarra;
    /** O último `EstadoArraste` calculado — a fonte que o `pointerup` lê. */
    ultimo: EstadoArraste | null;
  } | null>(null);

  const encerrar = useCallback(() => {
    gesto.current = null;
    setEstado(null);
  }, []);

  // `Escape` cancela sem escrever nada. Fica em `window` porque o foco durante
  // um arraste com o mouse não está garantido em elemento nenhum.
  useEffect(() => {
    if (!estado) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') encerrar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [estado, encerrar]);

  /**
   * A obra com a etapa arrastada já na posição nova — a entrada do motor.
   *
   * Rodar `agendar` a cada pixel parece caro e não é: são dezenas de nós e uma
   * ordenação topológica, microssegundos. O que seria caro é medir o DOM, e
   * nada aqui mede.
   */
  const preverMovimento = useCallback(
    (etapa: EtapaCronograma, modo: ModoArraste, deltaDias: number) => {
      const nos = folhas.map((f) => {
        if (f.id !== etapa.id) return f;
        if (modo === 'mover') {
          return {
            ...f,
            dataInicio: somarDias(f.dataInicio, deltaDias),
            dataFim: somarDias(f.dataFim, deltaDias),
          };
        }
        if (modo === 'redim-inicio') {
          const novo = somarDias(f.dataInicio, deltaDias);
          // Uma barra não pode terminar antes de começar; o limite é 1 dia.
          return { ...f, dataInicio: novo > f.dataFim ? f.dataFim : novo };
        }
        const novo = somarDias(f.dataFim, deltaDias);
        return { ...f, dataFim: novo < f.dataInicio ? f.dataInicio : novo };
      });
      return { nos, resultado: agendar({ nos, dependencias }) };
    },
    [folhas, dependencias]
  );

  const aoMover = useCallback(
    (e: React.PointerEvent) => {
      const g = gesto.current;
      if (!g) return;

      const dx = e.clientX - g.x0;
      if (!g.passouDoLimiar) {
        if (Math.abs(dx) < LIMIAR_PX) return;
        g.passouDoLimiar = true;
      }

      // A caixa das trilhas já vem posicionada pela rolagem, então subtrair o
      // `left` dela devolve o ponteiro no MESMO sistema de coordenadas das
      // barras — o da escala. É a única medição de DOM do arraste.
      const caixa = e.currentTarget.closest('[data-gantt-trilhas]')?.getBoundingClientRect();
      const ponteiro = caixa ? { x: e.clientX - caixa.left, y: e.clientY - caixa.top } : null;

      if (g.modo === 'ligar') {
        // Quem está sob o cursor? `elementFromPoint` porque a captura de
        // ponteiro redireciona os eventos para a barra de origem — nenhum
        // `onPointerEnter` das outras barras dispara durante o gesto.
        // `elementFromPoint` não existe no jsdom — daí o `?.`. Em navegador
        // ele sempre existe; a ausência significa "sem alvo", que é o mesmo
        // que soltar no vazio.
        const sob = document.elementFromPoint?.(e.clientX, e.clientY);
        const barraAlvo = sob?.closest<HTMLElement>('[data-etapa-id]');
        const alvoId = barraAlvo?.dataset.etapaId ?? null;

        // Em que metade da barra o cursor está: é isso que decide se a ligação
        // chega no início ou no fim — e, com a ponta de saída, qual dos quatro
        // tipos ela é.
        let ponta: PontaBarra = 'inicio';
        if (barraAlvo) {
          const r = barraAlvo.getBoundingClientRect();
          ponta = e.clientX < r.left + r.width / 2 ? 'inicio' : 'fim';
        }

        let recusa = '';
        let alvo: EstadoArraste['alvo'] = null;

        if (alvoId && alvoId !== g.etapa.id) {
          const jaExiste = dependencias.some(
            (d) => d.predecessoraId === g.etapa.id && d.sucessoraId === alvoId
          );
          const ciclo = detectarCiclo(dependencias, {
            id: 'candidata',
            projetoId: g.etapa.projetoId,
            predecessoraId: g.etapa.id,
            sucessoraId: alvoId,
            tipo: 'FS',
            atrasoDias: 0,
          });
          if (jaExiste) recusa = 'Estas duas etapas já estão ligadas.';
          else if (ciclo) recusa = 'Criaria um ciclo entre as etapas.';
          else alvo = { etapaId: alvoId, ponta };
        }

        g.ultimo = {
          modo: 'ligar',
          etapaId: g.etapa.id,
          deltaDias: 0,
          ponteiro,
          pontaOrigem: g.pontaOrigem,
          alvo,
          recusa,
          previsao: null,
        };
        setEstado(g.ultimo);
        return;
      }

      // O arredondamento É o snap ao dia, e vale em todos os zooms — nunca se
      // prende ao tick. Cronograma é dia-exato mesmo quando exibido por mês.
      const deltaDias = Math.round(dx / escala.pxPorDia);
      const { resultado } = preverMovimento(g.etapa, g.modo, deltaDias);

      g.ultimo = {
        modo: g.modo,
        etapaId: g.etapa.id,
        deltaDias,
        ponteiro,
        pontaOrigem: g.pontaOrigem,
        alvo: null,
        recusa: '',
        previsao: resultado,
      };
      setEstado(g.ultimo);
    },
    [dependencias, escala.pxPorDia, preverMovimento]
  );

  const aoSoltar = useCallback(
    (e: React.PointerEvent) => {
      const g = gesto.current;
      const atual = g?.ultimo ?? null;
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      gesto.current = null;
      setEstado(null);
      if (!g || !g.passouDoLimiar || !atual) return;

      if (g.modo === 'ligar') {
        if (!atual.alvo) return;
        const nova: Dependencia = {
          id: crypto.randomUUID(),
          projetoId: g.etapa.projetoId,
          predecessoraId: g.etapa.id,
          sucessoraId: atual.alvo.etapaId,
          tipo: tipoDe(g.pontaOrigem, atual.alvo.ponta),
          atrasoDias: 0,
        };
        const resultado = agendar({ nos: folhas, dependencias: [...dependencias, nova] });
        if (resultado.ciclo) return;
        const reagendadas = patchesDe(resultado);
        aoConcluir({ depCriadas: [nova], etapas: reagendadas }, reagendadas.length);
        return;
      }

      // `deltaDias === 0` é clique, não operação. Sem esta guarda todo arraste
      // desistido no meio do caminho vira escrita — a mesma razão da guarda de
      // `Quadro.tsx` ao soltar o card na própria coluna.
      if (atual.deltaDias === 0) return;

      const { nos, resultado } = preverMovimento(g.etapa, g.modo, atual.deltaDias);
      if (resultado.ciclo) return;

      const arrastada = nos.find((n) => n.id === g.etapa.id)!;
      const outras = patchesDe(resultado).filter((p) => p.id !== g.etapa.id);

      aoConcluir(
        {
          etapas: [
            { id: arrastada.id, dataInicio: arrastada.dataInicio, dataFim: arrastada.dataFim },
            ...outras,
          ],
        },
        outras.length
      );
    },
    [folhas, dependencias, preverMovimento, aoConcluir]
  );

  /** Os handlers de uma barra. Espalhe no elemento que inicia o gesto. */
  const alcas = useCallback(
    (etapa: EtapaCronograma, modo: ModoArraste, pontaOrigem: PontaBarra = 'fim') => {
      if (!habilitado) return {};
      return {
        onPointerDown: (e: React.PointerEvent) => {
          // Só o botão primário: o secundário abre o menu do navegador, e
          // capturar o ponteiro nesse caso prende o gesto num estado sem saída.
          if (e.button !== 0) return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          gesto.current = {
            modo,
            etapa,
            x0: e.clientX,
            passouDoLimiar: false,
            pontaOrigem,
            ultimo: null,
          };
        },
        onPointerMove: aoMover,
        onPointerUp: aoSoltar,
        onPointerCancel: encerrar,
      };
    },
    [habilitado, aoMover, aoSoltar, encerrar]
  );

  return { estado, alcas };
}
