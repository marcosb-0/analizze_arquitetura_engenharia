import { useMemo } from 'react';
import type { Dependencia, EtapaCronograma } from '../../../types';
import type { NoArvore } from '../../../lib/cronograma/wbs';
import { ALTURA_LINHA } from './constantes';
import type { EscalaTempo } from './escalaTempo';

interface Props {
  linhas: NoArvore[];
  dependencias: Dependencia[];
  escala: EscalaTempo;
  altura: number;
  /** Realce das setas que tocam esta etapa. `null` = todas atenuadas. */
  etapaEmFoco: string | null;
  criticas: ReadonlySet<string>;
  onSelecionar?: (dep: Dependencia) => void;
}

/** Comprimento do "toco" que sai da barra antes de a seta virar. */
const TOCO = 8;

/**
 * As setas de dependência, num único `<svg>` sobre a área das barras.
 *
 * **As coordenadas são analíticas, nunca medidas.** `x` sai de
 * `escala.xDeData(data)` e `y` de `índice × ALTURA_LINHA` — as duas informações
 * já estão em memória. Chamar `getBoundingClientRect` por seta seria uma leitura
 * de layout por quadro durante o arraste, que é o caminho garantido para 12fps
 * num cronograma de quarenta ligações.
 *
 * `pointer-events: none` no `<svg>` e `stroke` nos caminhos de acerto: as setas
 * não podem roubar o clique das barras, mas ainda precisam ser selecionáveis.
 */
export default function SetasDependencia({
  linhas,
  dependencias,
  escala,
  altura,
  etapaEmFoco,
  criticas,
  onSelecionar,
}: Props) {
  /** Índice da linha por etapa — a coordenada Y. Só quem está visível conta. */
  const linhaDe = useMemo(() => {
    const mapa = new Map<string, { indice: number; etapa: EtapaCronograma }>();
    linhas.forEach((no, indice) => mapa.set(no.etapa.id, { indice, etapa: no.etapa }));
    return mapa;
  }, [linhas]);

  /**
   * Com muitas linhas em zoom afastado, um traçado de 4px entre barras de 6px
   * não é informação — é ruído que esconde as barras. Melhor dizer isso do que
   * desenhar um novelo.
   */
  const denso = escala.zoom === 'mes' && linhas.length > 60;

  const caminhos = useMemo(() => {
    if (denso) return [];

    return dependencias.flatMap((dep) => {
      const p = linhaDe.get(dep.predecessoraId);
      const s = linhaDe.get(dep.sucessoraId);
      // Uma das pontas está dentro de um grupo recolhido: sem linha para
      // ancorar, a seta não tem onde ser desenhada.
      if (!p || !s) return [];

      const yP = p.indice * ALTURA_LINHA + ALTURA_LINHA / 2;
      const yS = s.indice * ALTURA_LINHA + ALTURA_LINHA / 2;

      // A ponta de saída e a de chegada são o que o TIPO significa.
      const saiDoFim = dep.tipo === 'FS' || dep.tipo === 'FF';
      const chegaNoInicio = dep.tipo === 'FS' || dep.tipo === 'SS';

      const xP = saiDoFim
        ? escala.xDeData(p.etapa.fimEfetivo) + escala.pxPorDia
        : escala.xDeData(p.etapa.inicioEfetivo);
      const xS = chegaNoInicio
        ? escala.xDeData(s.etapa.inicioEfetivo)
        : escala.xDeData(s.etapa.fimEfetivo) + escala.pxPorDia;

      const saida = saiDoFim ? xP + TOCO : xP - TOCO;
      const entrada = chegaNoInicio ? xS - TOCO : xS + TOCO;

      let d: string;
      if (saiDoFim && chegaNoInicio && entrada >= saida) {
        // FS com folga: sai pela direita, desce, entra pela esquerda.
        d = `M ${xP} ${yP} H ${saida} V ${yS} H ${xS}`;
      } else {
        // Sem folga (a sucessora começa antes de a predecessora terminar) ou
        // qualquer tipo que volte para trás: rota por BAIXO da linha de origem,
        // em vez de atravessar as barras no meio do caminho.
        const yDesvio = yP + ALTURA_LINHA / 2 - 4;
        d = `M ${xP} ${yP} H ${saida} V ${yDesvio} H ${entrada} V ${yS} H ${xS}`;
      }

      const critica = criticas.has(dep.predecessoraId) && criticas.has(dep.sucessoraId);
      const emFoco =
        etapaEmFoco === dep.predecessoraId || etapaEmFoco === dep.sucessoraId;

      return [{ dep, d, critica, emFoco }];
    });
  }, [denso, dependencias, linhaDe, escala, criticas, etapaEmFoco]);

  if (denso) {
    return (
      <div className="absolute top-1 left-2 z-20 rounded bg-white/90 border border-slate-200 px-2 py-1">
        <span className="text-2xs text-slate-600">
          {dependencias.length} ligações ocultas — aumente o zoom para vê-las.
        </span>
      </div>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none overflow-visible"
      width={escala.largura}
      height={altura}
    >
      <defs>
        {/* Um marker por estado, compartilhado por todas as setas: N ligações
            custam N caminhos e três markers. */}
        {[
          ['seta-normal', 'rgb(100 116 139)'],
          ['seta-critica', 'rgb(225 29 72)'],
          ['seta-foco', 'rgb(37 99 235)'],
        ].map(([id, cor]) => (
          <marker
            key={id}
            id={id}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill={cor} />
          </marker>
        ))}
      </defs>

      {caminhos.map(({ dep, d, critica, emFoco }) => {
        const marcador = emFoco ? 'seta-foco' : critica ? 'seta-critica' : 'seta-normal';
        return (
          <g key={dep.id}>
            {/* Caminho de acerto: invisível, grosso, e o único que recebe
                ponteiro. Sem ele não há como clicar numa linha de 1,5px. */}
            {onSelecionar && (
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                // `stroke` (e não `auto`) para o acerto seguir o traçado em vez
                // de virar um retângulo que cobre as barras vizinhas. Não há
                // classe do Tailwind para este valor.
                style={{ pointerEvents: 'stroke' }}
                className="cursor-pointer"
                onClick={() => onSelecionar(dep)}
              />
            )}
            <path
              d={d}
              fill="none"
              strokeWidth={emFoco ? 2 : 1.5}
              markerEnd={`url(#${marcador})`}
              // Atenuadas por padrão: com quarenta ligações o novelo esconde as
              // barras. Realçar só as da linha sob o cursor resolve sem
              // esconder informação nenhuma.
              className={
                emFoco
                  ? 'stroke-blue-600'
                  : critica
                    ? 'stroke-rose-600 opacity-60'
                    : 'stroke-slate-500 opacity-25'
              }
            />
          </g>
        );
      })}
    </svg>
  );
}
