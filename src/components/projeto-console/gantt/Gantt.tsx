import { useMemo, useState } from 'react';
import { CalendarRange, Save, Zap } from 'lucide-react';
import type { NoArvore } from '../../../lib/cronograma/wbs';
import type { Dependencia, EtapaCronograma, MudancasCronograma } from '../../../types';
import type { Folga } from '../../../lib/cronograma/caminhoCritico';
import { Button, Card } from '../../ui';
import GradeWbs from './GradeWbs';
import LinhaDoTempo, { MarcaDeHoje } from './LinhaDoTempo';
import { ALTURA_CABECALHO, FOLGA_DIAS } from './constantes';
import { criarEscala, somarDias, type Zoom } from './escalaTempo';

interface Props {
  linhas: NoArvore[];
  dependencias: Dependencia[];
  folgas: Map<string, Folga>;
  recolhidos: ReadonlySet<string>;
  onAlternarRecolhido: (id: string) => void;
  percentualDaEtapa: (etapa: NoArvore['etapa']) => number;
  /** Abre o painel de predecessoras da etapa. */
  onAbrirDependencias: (etapa: NoArvore['etapa']) => void;
  /** Só folhas — a entrada do motor de agendamento. */
  folhas: EtapaCronograma[];
  /** Arrastar exige permissão de gestão, como toda escrita de cronograma. */
  onConcluirArraste: (mudancas: MudancasCronograma, reagendadas: number) => void;
  /** Só admin/gestão salvam linha de base. */
  podeGerenciar: boolean;
  onSalvarBaseline: () => void;
  temBaseline: boolean;
}

const ROTULO_ZOOM: Record<Zoom, string> = { dia: 'Dia', semana: 'Semana', mes: 'Mês' };

/**
 * O gráfico de Gantt: grade da EAP à esquerda, linha do tempo à direita.
 *
 * O layout é o ponto e é deliberadamente burro: UM scroller vertical envolvendo
 * os dois painéis (sincronia de graça) e um scroller horizontal só do lado
 * direito, com o cabeçalho dentro dele (sincronia de graça de novo). Toda a
 * complexidade que costuma existir aqui — espelhar `scrollTop`, medir alturas,
 * reposicionar cabeçalho — é o que este arranjo evita.
 */
export default function Gantt({
  linhas,
  dependencias,
  folgas,
  recolhidos,
  onAlternarRecolhido,
  percentualDaEtapa,
  onAbrirDependencias,
  folhas,
  onConcluirArraste,
  podeGerenciar,
  onSalvarBaseline,
  temBaseline,
}: Props) {
  const [zoom, setZoom] = useState<Zoom>('semana');
  const [mostrarCritico, setMostrarCritico] = useState(false);
  const [etapaEmFoco, setEtapaEmFoco] = useState<string | null>(null);

  /**
   * As etapas cuja folga é zero: atrasar um dia atrasa a obra em um dia.
   *
   * Vazio quando o realce está desligado, e não uma condição espalhada pelos
   * filhos — assim `SetasDependencia` e `GradeWbs` recebem sempre a mesma forma
   * de dado e não precisam saber do botão.
   */
  const criticas = useMemo(() => {
    if (!mostrarCritico) return new Set<string>();
    return new Set(
      [...folgas.entries()].filter(([, f]) => f.critica).map(([id]) => id)
    );
  }, [folgas, mostrarCritico]);

  /**
   * O intervalo desenhado: da primeira à última data EFETIVA da obra, com uma
   * folga proporcional ao zoom. Sem a folga, a primeira barra nasce colada na
   * borda esquerda e a linha de "hoje" some quando cai fora das etapas.
   */
  const escala = useMemo(() => {
    const datas = linhas
      .flatMap(({ etapa }) => [etapa.inicioEfetivo, etapa.fimEfetivo, etapa.baselineInicio, etapa.baselineFim])
      .filter((d) => !!d);
    if (datas.length === 0) return null;

    const folga = FOLGA_DIAS[zoom];
    const inicio = somarDias(datas.reduce((a, b) => (a < b ? a : b)), -folga);
    const fim = somarDias(datas.reduce((a, b) => (a > b ? a : b)), folga);
    return criarEscala(inicio, fim, zoom);
  }, [linhas, zoom]);

  if (!escala) {
    return (
      <Card semPadding className="text-xs text-slate-500 italic py-6 px-4 text-center">
        Nenhuma etapa com datas para desenhar o gráfico.
      </Card>
    );
  }

  return (
    <Card semPadding className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <CalendarRange size={13} className="text-blue-600 shrink-0" aria-hidden="true" />
          <span className="text-2xs font-bold uppercase tracking-wider text-slate-700">
            Gráfico de Gantt
          </span>
          <MarcaDeHoje escala={escala} />
        </div>

        <div className="flex items-center gap-2">
          {dependencias.length > 0 && (
            <Button
              variante={mostrarCritico ? 'secundario' : 'fantasma'}
              tamanho="sm"
              aria-pressed={mostrarCritico}
              onClick={() => setMostrarCritico((v) => !v)}
            >
              <Zap size={13} />
              <span>Caminho crítico</span>
            </Button>
          )}
          {podeGerenciar && (
            <Button variante="fantasma" tamanho="sm" onClick={onSalvarBaseline}>
              <Save size={13} />
              <span>{temBaseline ? 'Atualizar linha de base' : 'Salvar linha de base'}</span>
            </Button>
          )}
          <div
            role="group"
            aria-label="Escala do gráfico"
            className="flex rounded border border-slate-200 overflow-hidden"
          >
            {(['dia', 'semana', 'mes'] as const).map((z) => (
              <button
                key={z}
                type="button"
                aria-pressed={zoom === z}
                onClick={() => setZoom(z)}
                className={`px-2 py-1 text-2xs font-bold transition cursor-pointer ${
                  zoom === z
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                {ROTULO_ZOOM[z]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* O ÚNICO scroller vertical. Os dois painéis vivem dentro dele, e é só
          por isso que rolam juntos. */}
      <div className="overflow-y-auto max-h-[70vh]">
        <div className="grid grid-cols-[minmax(15rem,22rem)_1fr]">
          <div className="border-r border-slate-200 bg-white">
            <GradeWbs
              linhas={linhas}
              recolhidos={recolhidos}
              onAlternar={onAlternarRecolhido}
              percentualDaEtapa={percentualDaEtapa}
              criticas={criticas}
              folgas={folgas}
              onAbrirDependencias={onAbrirDependencias}
              onFocar={setEtapaEmFoco}
            />
          </div>
          <LinhaDoTempo
            linhas={linhas}
            escala={escala}
            percentualDaEtapa={percentualDaEtapa}
            dependencias={dependencias}
            criticas={criticas}
            etapaEmFoco={etapaEmFoco}
            onFocar={setEtapaEmFoco}
            folhas={folhas}
            podeArrastar={podeGerenciar}
            onConcluirArraste={onConcluirArraste}
          />
        </div>
      </div>

      <p
        className="px-3 py-1.5 text-2xs text-slate-500 border-t border-slate-200 bg-slate-50"
        style={{ minHeight: ALTURA_CABECALHO / 2 }}
      >
        Barra fina = grupo (soma das frentes). Losango = marco. Barra cinza abaixo = linha de base.
        Faixa clara = fim de semana ou feriado. Passe o cursor numa linha para destacar as
        ligações dela; arraste a barra para mover, as pontas para mudar a duração, e a bolinha
        azul até outra etapa para ligar.
      </p>
    </Card>
  );
}
