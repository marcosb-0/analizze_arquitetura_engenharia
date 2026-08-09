import { EtapaCronograma } from '../../../types';
import { formatarDataBR } from '../../../lib/data';
import { getWorkingDays } from '../../../lib/diasUteis';
import { ALTURA_LINHA } from './constantes';
import type { EscalaTempo } from './escalaTempo';
import type { ModoArraste, PontaBarra } from './useArraste';

interface Props {
  etapa: EtapaCronograma;
  ehGrupo: boolean;
  percentual: number;
  escala: EscalaTempo;
  /** Datas a DESENHAR — durante um arraste são as da prévia, não as do banco. */
  datas: { inicio: string; fim: string };
  /** Handlers de ponteiro por gesto. Ausente = barra só de leitura. */
  alcas?: (modo: ModoArraste, ponta?: PontaBarra) => Record<string, unknown>;
  /** A barra que está sendo arrastada agora. */
  arrastando?: boolean;
  /** Sucessora que a prévia vai mover — desenhada tracejada na posição nova. */
  previsto?: boolean;
  critica?: boolean;
}

/**
 * Cores por status, iguais às da tabela abaixo do gráfico.
 *
 * A borda carrega o status e o preenchimento carrega o progresso — duas
 * variáveis visuais para duas informações. Sobrepor as duas na mesma (pintar a
 * barra inteira de vermelho quando atrasa) é o defeito clássico: some a
 * distinção entre "atrasada e parada" e "atrasada mas quase pronta".
 */
const TOM: Record<EtapaCronograma['status'], { borda: string; preenchimento: string }> = {
  'Concluído': { borda: 'border-emerald-500', preenchimento: 'bg-emerald-600' },
  'Em Andamento': { borda: 'border-blue-400', preenchimento: 'bg-blue-500' },
  'Atrasado': { borda: 'border-rose-500', preenchimento: 'bg-rose-600' },
  'Não Iniciado': { borda: 'border-slate-600', preenchimento: 'bg-slate-700' },
};

/**
 * Uma linha do gráfico: marco, barra de resumo ou barra de tarefa.
 *
 * A barra não tem texto, então o nome acessível é o `aria-label` — sem ele um
 * leitor de tela ouve a linha inteira como um vazio. O `title` cobre o mouse.
 */
export default function Barra({
  etapa,
  ehGrupo,
  percentual,
  escala,
  datas,
  alcas,
  arrastando = false,
  previsto = false,
  critica = false,
}: Props) {
  const temDatas = !!datas.inicio && !!datas.fim;
  if (!temDatas) return null;

  const x = escala.xDeData(datas.inicio);
  const fim = escala.xDeData(datas.fim);
  // +1 dia: a barra cobre o dia de fim inteiro, não para no começo dele. Uma
  // etapa de um dia só ficaria com largura zero sem isto.
  const largura = Math.max(escala.pxPorDia, fim - x + escala.pxPorDia);

  const periodo = `${formatarDataBR(datas.inicio)} a ${formatarDataBR(datas.fim)}`;
  const uteis = getWorkingDays(datas.inicio, datas.fim);

  if (etapa.ehMarco) {
    const rotulo = `${etapa.nome}, marco em ${formatarDataBR(datas.inicio)}`;
    return (
      <span
        data-etapa-id={etapa.id}
        role="img"
        aria-label={rotulo}
        title={rotulo}
        {...(alcas?.('mover') ?? {})}
        className={`absolute size-3 rotate-45 bg-amber-400 border border-amber-600 ${
          alcas ? 'cursor-grab touch-none' : ''
        } ${previsto ? 'opacity-50' : ''}`}
        style={{ left: x, top: (ALTURA_LINHA - 12) / 2 }}
      />
    );
  }

  if (ehGrupo) {
    // Barra de resumo não arrasta: as datas dela são rollup das frentes, e não
    // há onde gravar o movimento.
    const rotulo = `${etapa.nome}, grupo de ${periodo}, ${percentual}% concluído`;
    return (
      <span
        role="img"
        aria-label={rotulo}
        title={rotulo}
        className="absolute h-1.5 rounded-xs bg-slate-500"
        style={{ left: x, width: largura, top: (ALTURA_LINHA - 6) / 2 }}
      />
    );
  }

  const tom = TOM[etapa.status];
  const rotulo =
    `${etapa.nome}, ${periodo}, ${uteis} ${uteis === 1 ? 'dia útil' : 'dias úteis'}, ` +
    `${percentual}% concluído, ${etapa.status}`;

  return (
    <div
      data-etapa-id={etapa.id}
      role="img"
      aria-label={rotulo}
      title={rotulo}
      {...(alcas?.('mover') ?? {})}
      className={`absolute rounded border bg-slate-800/60 ${tom.borda} ${
        critica ? 'ring-2 ring-rose-500' : ''
      } ${alcas ? 'cursor-grab touch-none' : ''} ${
        arrastando ? 'opacity-80 shadow-lg' : ''
      } ${previsto ? 'opacity-60 border-dashed' : ''}`}
      style={{ left: x, width: largura, top: (ALTURA_LINHA - 20) / 2, height: 20 }}
    >
      <div className="h-full overflow-hidden rounded-[3px]">
        <div
          className={`h-full flex items-center justify-end px-1.5 select-none ${tom.preenchimento}`}
          style={{ width: `${percentual}%` }}
        >
          {percentual > 25 && largura > 44 && (
            <span className="text-2xs font-mono font-bold text-slate-950 leading-none">
              {percentual}%
            </span>
          )}
        </div>
      </div>

      {alcas && !previsto && (
        <>
          {/* Zonas de redimensionamento: 6px em cada ponta, visíveis só no
              hover. `touch-none` é obrigatório — sem ele o navegador trata o
              gesto como rolagem e engole os pointermove. */}
          <span
            {...alcas('redim-inicio')}
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize touch-none opacity-0 hover:opacity-100 bg-white/70"
          />
          <span
            {...alcas('redim-fim')}
            aria-hidden="true"
            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize touch-none opacity-0 hover:opacity-100 bg-white/70"
          />
          {/* Alças de ligação, uma em cada ponta. A ponta de saída é metade do
              tipo do vínculo (a de chegada é a outra metade). */}
          <span
            {...alcas('ligar', 'fim')}
            aria-hidden="true"
            title="Arraste até outra etapa para criar uma ligação"
            className="absolute -right-2.5 top-1/2 -translate-y-1/2 size-2.5 rounded-full border-2 border-blue-500 bg-white cursor-crosshair touch-none opacity-0 group-hover/linha:opacity-100"
          />
          <span
            {...alcas('ligar', 'inicio')}
            aria-hidden="true"
            title="Arraste até outra etapa para criar uma ligação"
            className="absolute -left-2.5 top-1/2 -translate-y-1/2 size-2.5 rounded-full border-2 border-blue-500 bg-white cursor-crosshair touch-none opacity-0 group-hover/linha:opacity-100"
          />
        </>
      )}
    </div>
  );
}

/**
 * A linha de base, desenhada abaixo da barra.
 *
 * `aria-hidden` porque é decorativa: o número que interessa (quantos dias a
 * etapa derrapou) vai em texto na grade, e anunciar uma segunda barra sem
 * contexto só atrapalha quem usa leitor de tela.
 */
export function BarraBaseline({ etapa, escala }: { etapa: EtapaCronograma; escala: EscalaTempo }) {
  if (!etapa.baselineInicio || !etapa.baselineFim) return null;
  const x = escala.xDeData(etapa.baselineInicio);
  const largura = Math.max(
    escala.pxPorDia,
    escala.xDeData(etapa.baselineFim) - x + escala.pxPorDia
  );
  return (
    <span
      aria-hidden="true"
      className="absolute h-[3px] rounded-xs bg-slate-300"
      style={{ left: x, width: largura, top: ALTURA_LINHA - 7 }}
    />
  );
}
