import { useEffect, useMemo, useRef, useState } from 'react';
import type { NoArvore } from '../../../lib/cronograma/wbs';
import type { Dependencia, EtapaCronograma, MudancasCronograma } from '../../../types';
import { useArraste } from './useArraste';
import { agendar, patchesDe } from '../../../lib/cronograma/agendar';
import SetasDependencia from './SetasDependencia';
import { formatarDataBR, hojeISO } from '../../../lib/data';
import { ehDiaUtil } from '../../../lib/cronograma/calendario';
import Barra, { BarraBaseline } from './Barra';
import { ALTURA_CABECALHO, ALTURA_LINHA } from './constantes';
import { somarDias, type EscalaTempo } from './escalaTempo';

interface Props {
  linhas: NoArvore[];
  escala: EscalaTempo;
  percentualDaEtapa: (etapa: NoArvore['etapa']) => number;
  dependencias: Dependencia[];
  criticas: ReadonlySet<string>;
  etapaEmFoco: string | null;
  onFocar: (id: string | null) => void;
  /** Só folhas — a entrada do motor de agendamento. */
  folhas: EtapaCronograma[];
  podeArrastar: boolean;
  onConcluirArraste: (mudancas: MudancasCronograma, reagendadas: number) => void;
}

/**
 * O painel direito: cabeçalho de calendário + as barras.
 *
 * **A sincronia de rolagem é estrutural, não programada.** Na vertical, este
 * painel e a grade estão dentro do MESMO scroller (ver `Gantt.tsx`), então eles
 * rolam juntos por construção. Na horizontal, o cabeçalho está DENTRO do
 * elemento que rola, então acompanha as barras sozinho.
 *
 * Nenhum `onScroll`, nenhum `a.scrollTop = b.scrollTop`. Espelhar posição de
 * rolagem em JS produz tremor com o momentum do trackpad e, quando os dois lados
 * escrevem um no outro, um laço de realimentação que trava a aba.
 */
export default function LinhaDoTempo({
  linhas,
  escala,
  percentualDaEtapa,
  dependencias,
  criticas,
  etapaEmFoco,
  onFocar,
  folhas,
  podeArrastar,
  onConcluirArraste,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  /**
   * O ajuste em curso pelo TECLADO, acumulado até o `Enter`.
   *
   * Gravar a cada tecla seriam cinco RPCs para empurrar uma etapa em cinco
   * dias — e cinco chances de o cronograma ficar num estado intermediário que
   * ninguém pediu. Aqui vale o mesmo contrato do arraste: uma operação, uma
   * escrita.
   */
  const [pendente, setPendente] = useState<{ id: string; dInicio: number; dFim: number } | null>(
    null
  );
  const [anuncio, setAnuncio] = useState('');

  const { estado, alcas } = useArraste({
    escala,
    folhas,
    dependencias,
    habilitado: podeArrastar,
    aoConcluir: onConcluirArraste,
  });
  const [janela, setJanela] = useState({ de: 0, ate: 1200 });

  /**
   * Só os rótulos da janela visível são montados. Uma obra de dois anos no zoom
   * `dia` tem 730 marcas — 730 nós redesenhados a cada quadro de rolagem. As
   * barras não precisam do mesmo cuidado: são dezenas, e virtualizá-las
   * quebraria as coordenadas analíticas que as setas vão usar na Fase 3.
   */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const medir = () => setJanela({ de: el.scrollLeft, ate: el.scrollLeft + el.clientWidth });
    medir();
    el.addEventListener('scroll', medir, { passive: true });
    return () => el.removeEventListener('scroll', medir);
  }, [escala]);

  const { bandas, marcas } = escala.ticks(janela.de, janela.ate);

  /**
   * As datas a DESENHAR. Durante um arraste vêm da prévia — inclusive as das
   * sucessoras, que aparecem tracejadas na posição para onde vão. É o que
   * transforma "arrastei e depois descobri" em "vi antes de soltar".
   */
  /** As folhas com o ajuste de teclado aplicado — a entrada do motor. */
  const previsaoTeclado = useMemo(() => {
    if (!pendente) return null;
    const nos = folhas.map((f) =>
      f.id === pendente.id
        ? {
            ...f,
            dataInicio: somarDias(f.dataInicio, pendente.dInicio),
            dataFim: somarDias(f.dataFim, pendente.dFim),
          }
        : f
    );
    return { nos, resultado: agendar({ nos, dependencias }) };
  }, [pendente, folhas, dependencias]);

  const datasDe = (etapa: EtapaCronograma) => {
    const prev =
      estado?.previsao?.porEtapa.get(etapa.id) ??
      previsaoTeclado?.resultado.porEtapa.get(etapa.id);
    if (prev) return { inicio: prev.inicio, fim: prev.fim };
    return { inicio: etapa.inicioEfetivo, fim: etapa.fimEfetivo };
  };

  /**
   * O equivalente por teclado do arraste, e não um consolo: sem ele o recurso
   * inteiro fica fora do alcance de quem não usa mouse — e o arraste do HTML5,
   * que o kanban usa, não tem equivalente NENHUM (é por isso que lá existe o
   * `MenuDoCard`).
   *
   * ←/→ movem a barra, Shift muda só o fim, Ctrl só o início. `Enter` grava,
   * `Esc` desfaz.
   */
  const teclasDaBarra = (etapa: EtapaCronograma) => (e: React.KeyboardEvent) => {
    if (!podeArrastar) return;

    if (e.key === 'Escape' && pendente) {
      e.preventDefault();
      setPendente(null);
      setAnuncio(`Ajuste em ${etapa.nome} cancelado.`);
      return;
    }

    if (e.key === 'Enter' && pendente?.id === etapa.id) {
      e.preventDefault();
      const nos = previsaoTeclado?.nos ?? [];
      const resultado = previsaoTeclado?.resultado;
      const movida = nos.find((n) => n.id === etapa.id);
      if (!movida || !resultado || resultado.ciclo) return;
      const outras = patchesDe(resultado).filter((p) => p.id !== etapa.id);
      onConcluirArraste(
        {
          etapas: [
            { id: movida.id, dataInicio: movida.dataInicio, dataFim: movida.dataFim },
            ...outras,
          ],
        },
        outras.length
      );
      setPendente(null);
      return;
    }

    const passo =
      e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'PageDown' ? 7 : e.key === 'PageUp' ? -7 : 0;
    if (passo === 0) return;
    e.preventDefault();

    setPendente((atual) => {
      const base = atual?.id === etapa.id ? atual : { id: etapa.id, dInicio: 0, dFim: 0 };
      // Shift estica o fim, Ctrl estica o início, nenhum dos dois move a barra
      // inteira — a mesma divisão do arraste, onde as pontas são zonas
      // separadas do corpo.
      if (e.shiftKey) return { ...base, dFim: base.dFim + passo };
      if (e.ctrlKey || e.metaKey) return { ...base, dInicio: base.dInicio + passo };
      return { ...base, dInicio: base.dInicio + passo, dFim: base.dFim + passo };
    });
  };

  // O anúncio sai do resultado JÁ calculado, e não do que se pretendia fazer —
  // é o que faz o leitor de tela dizer a mesma coisa que a tela mostra.
  useEffect(() => {
    if (!pendente || !previsaoTeclado) return;
    const alvo = previsaoTeclado.nos.find((n) => n.id === pendente.id);
    if (!alvo) return;
    const outras = previsaoTeclado.resultado.movidas.filter((id) => id !== pendente.id).length;
    setAnuncio(
      `${alvo.nome}: ${formatarDataBR(alvo.dataInicio)} a ${formatarDataBR(alvo.dataFim)}.` +
        (outras > 0 ? ` ${outras} ${outras === 1 ? 'etapa será reagendada' : 'etapas serão reagendadas'}.` : '') +
        ' Enter para confirmar, Esc para desfazer.'
    );
  }, [pendente, previsaoTeclado]);

  /**
   * Onde a linha elástica começa: a ponta da barra de origem, calculada pela
   * escala como todo o resto — nada é medido.
   */
  const origemDaLigacao = (() => {
    if (estado?.modo !== 'ligar') return null;
    const i = linhas.findIndex((l) => l.etapa.id === estado.etapaId);
    if (i < 0) return null;
    const e = linhas[i].etapa;
    const x =
      estado.pontaOrigem === 'fim'
        ? escala.xDeData(e.fimEfetivo) + escala.pxPorDia
        : escala.xDeData(e.inicioEfetivo);
    return { x, y: i * ALTURA_LINHA + ALTURA_LINHA / 2 };
  })();

  const hoje = hojeISO();
  const xHoje =
    hoje >= escala.origem && hoje <= escala.fim ? escala.xDeData(hoje) : null;

  return (
    <div ref={scroller} className="overflow-x-auto">
      <span role="status" aria-live="polite" className="sr-only">
        {anuncio}
      </span>
      <div style={{ width: escala.largura, position: 'relative' }}>
        {/* Cabeçalho: acompanha as barras na horizontal porque está dentro do
            mesmo elemento que rola.

            NA VERTICAL ELE NÃO GRUDA, e o `sticky top-0` abaixo é um pedido que
            não tem como ser atendido aqui — medido no navegador em 12/ago/2026,
            com o conteúdo alongado: o cabeçalho sobe junto com as barras. O
            `sticky` procura o scroller mais próximo, que é este `overflow-x-auto`
            (o eixo X em `auto` força o Y a `auto` também), e não o
            `overflow-y-auto max-h-[70vh]` do `Gantt`, que é quem de fato rola na
            vertical. `overflow-y: clip` aqui não resolve — testado, o elemento
            continua sendo scroller.

            Resolver de verdade significa tirar o cabeçalho deste scroller e
            espelhar `scrollLeft` à mão, ou descer a rolagem vertical para cá e
            espelhar `scrollTop` para a grade da EAP — exatamente a complexidade
            que o arranjo do `Gantt` foi desenhado para evitar. Fica registrado
            na auditoria (§M, item (f)) em vez de ser trocado por um efeito que
            também não funciona. O `sticky` continua porque no dia em que a
            rolagem vertical mudar de lugar ele passa a valer. */}
        <div
          className="sticky top-0 z-10 bg-white border-b border-slate-200"
          style={{ height: ALTURA_CABECALHO }}
        >
          <div className="relative h-1/2 border-b border-slate-100">
            {bandas.map((b) => (
              <span
                key={b.chave}
                className="absolute top-0 h-full flex items-center justify-center text-2xs font-bold text-slate-600 border-l border-slate-200 overflow-hidden"
                style={{ left: b.x, width: b.largura }}
              >
                {b.rotulo}
              </span>
            ))}
          </div>
          <div className="relative h-1/2">
            {marcas.map((m) => (
              <span
                key={m.chave}
                className="absolute top-0 h-full flex items-center justify-center text-2xs font-mono text-slate-500 border-l border-slate-100 overflow-hidden"
                style={{ left: m.x, width: m.largura }}
              >
                {m.rotulo}
              </span>
            ))}
          </div>
        </div>

        <div className="relative" data-gantt-trilhas>
          {/* Faixa de fim de semana e feriado, só no zoom em que um dia é
              distinguível. Serve de régua: explica visualmente por que uma
              barra de 10 dias corridos vale 6 dias úteis. */}
          {escala.zoom === 'dia' &&
            marcas
              .filter((m) => !ehDiaUtil(m.chave))
              .map((m) => (
                <span
                  key={`folga-${m.chave}`}
                  aria-hidden="true"
                  className="absolute top-0 bottom-0 bg-slate-50"
                  style={{ left: m.x, width: m.largura }}
                />
              ))}

          {xHoje !== null && (
            <span
              aria-hidden="true"
              className="absolute top-0 bottom-0 w-px bg-rose-500 z-10"
              style={{ left: xHoje }}
            />
          )}

          {linhas.map(({ etapa, filhos }) => {
            const ehGrupo = filhos.length > 0;
            const arrastando = estado?.etapaId === etapa.id && estado.modo !== 'ligar';
            const previsto =
              !!estado && estado.modo !== 'ligar' && !arrastando &&
              (estado.previsao?.movidas.includes(etapa.id) ?? false);
            const alvoDaLigacao = estado?.alvo?.etapaId === etapa.id;

            return (
              <div
                key={etapa.id}
                tabIndex={ehGrupo ? -1 : 0}
                role="gridcell"
                aria-label={`Barra de ${etapa.nome}`}
                onKeyDown={teclasDaBarra(etapa)}
                onMouseEnter={() => onFocar(etapa.id)}
                onMouseLeave={() => onFocar(null)}
                onFocus={() => onFocar(etapa.id)}
                onBlur={() => onFocar(null)}
                className={`group/linha relative border-b border-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                  criticas.has(etapa.id) ? 'bg-rose-50/60' : ''
                } ${alvoDaLigacao ? 'ring-2 ring-inset ring-blue-400' : ''}`}
                style={{ height: ALTURA_LINHA }}
              >
                <BarraBaseline etapa={etapa} escala={escala} />
                <Barra
                  etapa={etapa}
                  ehGrupo={ehGrupo}
                  percentual={percentualDaEtapa(etapa)}
                  escala={escala}
                  datas={datasDe(etapa)}
                  critica={criticas.has(etapa.id)}
                  arrastando={arrastando || pendente?.id === etapa.id}
                  previsto={previsto}
                  alcas={
                    podeArrastar && !ehGrupo
                      ? (modo, ponta) => alcas(etapa, modo, ponta)
                      : undefined
                  }
                />
              </div>
            );
          })}

          {/* A linha elástica do gesto de ligar, e o motivo da recusa quando o
              alvo sob o cursor não serve. */}
          {estado?.modo === 'ligar' && estado.ponteiro && origemDaLigacao && (
            <>
              <svg
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none z-20 overflow-visible"
                width={escala.largura}
                height={linhas.length * ALTURA_LINHA}
              >
                <line
                  x1={origemDaLigacao.x}
                  y1={origemDaLigacao.y}
                  x2={estado.ponteiro.x}
                  y2={estado.ponteiro.y}
                  className={estado.recusa ? 'stroke-rose-500' : 'stroke-blue-500'}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              </svg>
              {estado.recusa && (
                <span
                  role="status"
                  className="absolute z-30 rounded bg-rose-600 text-white text-2xs px-1.5 py-0.5 pointer-events-none"
                  style={{ left: estado.ponteiro.x + 12, top: estado.ponteiro.y + 12 }}
                >
                  {estado.recusa}
                </span>
              )}
            </>
          )}

          {/* As setas por cima de tudo, num SVG só. Coordenadas analíticas:
              x vem da escala, y vem do índice da linha — nada é medido. */}
          <SetasDependencia
            linhas={linhas}
            dependencias={dependencias}
            escala={escala}
            altura={linhas.length * ALTURA_LINHA}
            etapaEmFoco={etapaEmFoco}
            criticas={criticas}
          />
        </div>
      </div>
    </div>
  );
}

/** A legenda da linha vermelha, para o traço no gráfico não ficar sem nome. */
export function MarcaDeHoje({ escala }: { escala: EscalaTempo }) {
  const hoje = hojeISO();
  if (hoje < escala.origem || hoje > escala.fim) return null;
  return (
    <span className="text-2xs font-bold text-rose-600 flex items-center gap-1">
      <span aria-hidden="true" className="inline-block w-px h-3 bg-rose-500" />
      hoje, {formatarDataBR(hoje)}
    </span>
  );
}
