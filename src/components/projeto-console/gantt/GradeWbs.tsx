import { ChevronDown, ChevronRight, Link2 } from 'lucide-react';
import type { NoArvore } from '../../../lib/cronograma/wbs';
import type { Folga } from '../../../lib/cronograma/caminhoCritico';
import { getWorkingDays } from '../../../lib/diasUteis';
import { IconButton, Th } from '../../ui';
import { ALTURA_CABECALHO, ALTURA_LINHA } from './constantes';

interface Props {
  linhas: NoArvore[];
  recolhidos: ReadonlySet<string>;
  onAlternar: (id: string) => void;
  percentualDaEtapa: (etapa: NoArvore['etapa']) => number;
  criticas: ReadonlySet<string>;
  folgas: Map<string, Folga>;
  onAbrirDependencias: (etapa: NoArvore['etapa']) => void;
  /** Realça as setas da etapa sob o cursor. `null` ao sair. */
  onFocar: (id: string | null) => void;
}

/**
 * O painel esquerdo: a EAP em forma de árvore.
 *
 * É uma `<table>` de verdade, e não uma pilha de `<div>`, porque a estrutura É
 * tabular e porque isso entrega `role="treegrid"` com `aria-level`/`aria-expanded`
 * quase de graça — a navegação por teclado do plano depende dela.
 *
 * Cada `<tr>` tem altura FIXA (`ALTURA_LINHA`). É o que mantém este painel
 * alinhado com as barras do lado direito: os dois rolam no mesmo scroller
 * vertical, e a única forma de descolarem é uma linha aqui crescer com o
 * conteúdo. Daí o `truncate` no nome em vez de quebra de linha.
 */
export default function GradeWbs({
  linhas,
  recolhidos,
  onAlternar,
  percentualDaEtapa,
  criticas,
  folgas,
  onAbrirDependencias,
  onFocar,
}: Props) {
  return (
    <table
      role="treegrid"
      aria-label="Estrutura analítica da obra"
      className="w-full border-collapse text-xs"
    >
      <thead>
        <tr style={{ height: ALTURA_CABECALHO }}>
          <Th align="left">
            <span className="text-2xs uppercase tracking-wider">Etapa</span>
          </Th>
          <Th align="right">
            <span className="text-2xs uppercase tracking-wider">Dias</span>
          </Th>
          <Th align="right">
            <span className="text-2xs uppercase tracking-wider sr-only">Ligações</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {linhas.map(({ etapa, nivel, wbs, filhos }, i) => {
          const ehGrupo = filhos.length > 0;
          const recolhido = recolhidos.has(etapa.id);
          const uteis = getWorkingDays(etapa.inicioEfetivo, etapa.fimEfetivo);
          const critica = criticas.has(etapa.id);
          const folga = folgas.get(etapa.id);

          return (
            <tr
              key={etapa.id}
              aria-level={nivel + 1}
              aria-posinset={i + 1}
              aria-setsize={linhas.length}
              {...(ehGrupo ? { 'aria-expanded': !recolhido } : {})}
              onMouseEnter={() => onFocar(etapa.id)}
              onMouseLeave={() => onFocar(null)}
              className={`border-b border-slate-100 ${ehGrupo ? 'bg-slate-50/60' : ''} ${
                critica ? 'bg-rose-50/60' : ''
              }`}
              style={{ height: ALTURA_LINHA }}
            >
              <td className="px-2 max-w-0">
                <div
                  className="flex items-center gap-1"
                  style={{ paddingLeft: `${nivel * 14}px` }}
                >
                  {ehGrupo ? (
                    <IconButton
                      rotulo={recolhido ? `Expandir ${etapa.nome}` : `Recolher ${etapa.nome}`}
                      tamanho="sm"
                      onClick={() => onAlternar(etapa.id)}
                    >
                      {recolhido ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </IconButton>
                  ) : (
                    <span className="w-6 shrink-0" aria-hidden="true" />
                  )}
                  <span className="font-mono text-2xs text-slate-500 shrink-0">{wbs}</span>
                  <span
                    className={`truncate ${ehGrupo ? 'font-bold text-slate-900' : 'text-slate-700'}`}
                    title={
                      folga && !critica
                        ? `${etapa.nome} — ${folga.folgaTotal} ${folga.folgaTotal === 1 ? 'dia útil' : 'dias úteis'} de folga`
                        : etapa.nome
                    }
                  >
                    {etapa.nome}
                  </span>
                  {critica && (
                    // NÃO usa <Chip>: o padding do primitivo (py-1) não cabe
                    // dentro de `ALTURA_LINHA` (34px, o número mais medido do
                    // Gantt — índice × ALTURA_LINHA posiciona toda barra), e
                    // sobrescrever padding por className perde a disputa de
                    // utilitários contra o do componente (mesmo defeito que
                    // `CAMPO_LARGURA` documenta). Mantém o span apertado.
                    <span
                      className="shrink-0 text-2xs font-bold text-rose-700 bg-rose-100 rounded px-1"
                      title="No caminho crítico: atrasar esta frente atrasa a entrega da obra."
                    >
                      crítica
                    </span>
                  )}
                </div>
              </td>
              <td className="px-2 text-right whitespace-nowrap">
                <span className="font-mono text-2xs text-slate-500">
                  {etapa.ehMarco ? '—' : uteis}
                </span>
                <span className="font-mono text-2xs font-bold text-slate-700 ml-2 inline-block w-8">
                  {percentualDaEtapa(etapa)}%
                </span>
              </td>
              <td className="px-1 text-right">
                {/* Grupo não liga: as datas dele são a soma das frentes, e uma
                    restrição sobre valor derivado não tem onde ser aplicada. */}
                {!ehGrupo && (
                  <IconButton
                    rotulo={`Predecessoras de ${etapa.nome}`}
                    tamanho="sm"
                    onClick={() => onAbrirDependencias(etapa)}
                  >
                    <Link2 size={12} />
                  </IconButton>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
