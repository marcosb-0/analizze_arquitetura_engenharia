import { useMemo, useState } from 'react';
import { CalendarPlus, Layers, Pencil, Trash2 } from 'lucide-react';
import {
  EdicaoEtapa,
  EtapaCronograma,
  EtapaOrcamentoVinculo,
  Funcionario,
  Projeto,
} from '../../types';
import { dataLocal, formatarDataBR } from '../../lib/data';
import { getWorkingDays } from '../../lib/diasUteis';
import { useFeedback } from '../FeedbackContext';
import ModalEtapa, { AlvoEtapa } from './ModalEtapa';
import ModalMedicao, { NovaMedicao } from './ModalMedicao';
import ModalVinculo, { AlvoVinculo } from './ModalVinculo';
import type { DadosDaObra } from './useDadosDaObra';

interface Props {
  projeto: Projeto;
  dados: DadosDaObra;
  funcionarios: Funcionario[];
  podeGerenciar: boolean;
  podeMedir: boolean;
  /** Obra pausada ou finalizada não aceita boletim novo. */
  medicaoBloqueada: boolean;
  onAddEtapa: (etapa: EtapaCronograma) => Promise<boolean>;
  onUpdateEtapa: (id: string, patch: EdicaoEtapa) => Promise<boolean>;
  onRemoveEtapa: (id: string) => Promise<boolean>;
  onAddVinculo: (vinculo: EtapaOrcamentoVinculo) => Promise<boolean>;
  onRemoveVinculo: (id: string) => void;
  onAddMedicao: (med: NovaMedicao, fotos: File[]) => Promise<boolean>;
  onUpdateProjetoSituacao: (projId: string, situacao: Projeto['situacao']) => Promise<boolean>;
}

export default function AbaCronograma({
  projeto,
  dados,
  funcionarios,
  podeGerenciar,
  podeMedir,
  medicaoBloqueada,
  onAddEtapa,
  onUpdateEtapa,
  onRemoveEtapa,
  onAddVinculo,
  onRemoveVinculo,
  onAddMedicao,
  onUpdateProjetoSituacao,
}: Props) {
  const { toast, confirm } = useFeedback();
  const { etapas, itens, vinculos, medicoes, pesoAlocadoPorItem } = dados;

  const [alvoEtapa, setAlvoEtapa] = useState<AlvoEtapa | null>(null);
  const [alvoVinculo, setAlvoVinculo] = useState<AlvoVinculo | null>(null);
  const [etapaParaMedir, setEtapaParaMedir] = useState<string | null>(null);

  const nomeDoEncarregado = (id: string) =>
    funcionarios.find((f) => f.id === id)?.nome || 'Profissional não cadastrado';

  // Gantt real: as barras são posicionadas e dimensionadas pelas datas de cada
  // etapa dentro do intervalo total da obra, em vez de um cabeçalho fixo
  // "Jan/Mar..Out/Dez" sem relação com as datas reais.
  const intervalo = useMemo(() => {
    const inicios = etapas
      .map((s) => dataLocal(s.dataInicio)?.getTime())
      .filter((t): t is number => t !== undefined);
    const fins = etapas
      .map((s) => dataLocal(s.dataFim)?.getTime())
      .filter((t): t is number => t !== undefined);
    if (inicios.length === 0 || fins.length === 0) return null;
    const inicio = Math.min(...inicios);
    const fim = Math.max(...fins);
    if (fim <= inicio) return null;
    return { inicio, fim };
  }, [etapas]);

  const marcadores = useMemo(() => {
    if (!intervalo) return [];
    const quantos = 5;
    return Array.from({ length: quantos }, (_, i) => {
      const t = intervalo.inicio + ((intervalo.fim - intervalo.inicio) * i) / (quantos - 1);
      return new Date(t).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    });
  }, [intervalo]);

  /**
   * Excluir etapa é destrutivo além do óbvio: `medicoes_obra.etapa_id` tem
   * `on delete cascade`, então os boletins vão embora e o valor executado das
   * linhas de orçamento cai (é derivado deles). O aviso diz o tamanho do buraco.
   */
  const removerEtapa = (etapa: EtapaCronograma) => {
    const medicoesDaEtapa = medicoes.filter((m) => m.etapaId === etapa.id);
    const vinculosDaEtapa = vinculos.filter((v) => v.etapaId === etapa.id);
    const aprovadas = medicoesDaEtapa.filter((m) => m.status === 'Aprovada').length;

    const partes = [
      `${vinculosDaEtapa.length} ${vinculosDaEtapa.length === 1 ? 'vínculo de orçamento' : 'vínculos de orçamento'}`,
      `${medicoesDaEtapa.length} ${medicoesDaEtapa.length === 1 ? 'boletim de medição' : 'boletins de medição'}`,
    ];
    const alertaFinanceiro =
      aprovadas > 0
        ? ` ${aprovadas} ${aprovadas === 1 ? 'medição aprovada' : 'medições aprovadas'} serão desfeitas, e o valor executado do orçamento vai diminuir.`
        : '';

    confirm({
      title: `Excluir a etapa "${etapa.nome}"?`,
      message: `Serão removidos também ${partes.join(' e ')}.${alertaFinanceiro} Esta ação é irreversível.`,
      onConfirm: async () => {
        const ok = await onRemoveEtapa(etapa.id);
        if (ok) toast.success('Etapa excluída.');
      },
    });
  };

  return (
    <div id="tab-pane-cronograma" className="space-y-6 text-left">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
            Cronograma Físico da Obra
          </h4>
          <p className="text-xs text-slate-500">
            Progresso calculado a partir das medições registradas. Vincule itens de orçamento a cada etapa
            para habilitar o cálculo.
          </p>
        </div>
        {podeGerenciar && (
          <button
            id="console-add-etapa-btn"
            type="button"
            onClick={() => setAlvoEtapa({ modo: 'nova' })}
            className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shrink-0 transition shadow-sm"
          >
            <CalendarPlus size={14} />
            <span>Nova Etapa</span>
          </button>
        )}
      </div>

      <div className="space-y-6">
        {/* Gantt Representation (bars positioned/sized by real dates) */}
        <div className="p-3.5 bg-slate-900 text-slate-100 rounded-lg space-y-3 shadow-md">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1.5">
              <Layers size={12} className="text-blue-400 shrink-0" />
              <span>Gráfico de Gantt Integrado</span>
            </span>
            <span className="text-xs font-mono text-slate-500">
              {intervalo
                ? `${new Date(intervalo.inicio).toLocaleDateString('pt-BR')} — ${new Date(intervalo.fim).toLocaleDateString('pt-BR')}`
                : 'Sem datas de cronograma'}
            </span>
          </div>

          {!intervalo ? (
            <p className="text-xs text-slate-500 italic py-4 text-center">
              Nenhuma etapa com datas válidas para exibir no gráfico.
            </p>
          ) : (
            <div className="space-y-4 text-xs">
              {/* Timeline header, ticks evenly spaced across the real date span */}
              <div className="grid grid-cols-12 gap-1 text-xs font-semibold text-slate-500 font-mono text-center border-b border-slate-800 pb-1 shrink-0">
                <span className="col-span-4 text-left">Etapa da Obra</span>
                <div className="col-span-8 flex justify-between">
                  {marcadores.map((label, i) => (
                    <span key={i}>{label}</span>
                  ))}
                </div>
              </div>

              {etapas.map((step) => {
                const inicioEtapa = dataLocal(step.dataInicio)?.getTime() ?? NaN;
                const fimEtapa = dataLocal(step.dataFim)?.getTime() ?? NaN;
                const total = intervalo.fim - intervalo.inicio;
                const datasValidas = !isNaN(inicioEtapa) && !isNaN(fimEtapa) && fimEtapa >= inicioEtapa;
                const esquerda = datasValidas
                  ? Math.max(0, ((inicioEtapa - intervalo.inicio) / total) * 100)
                  : 0;
                const largura = datasValidas
                  ? Math.min(100 - esquerda, Math.max(2, ((fimEtapa - inicioEtapa) / total) * 100))
                  : 100;
                return (
                  <div key={step.id} className="grid grid-cols-12 gap-1 items-center py-1">
                    <div className="col-span-4 text-left truncate font-medium text-slate-200 text-xs">
                      {step.nome}
                      <span className="block text-xs text-slate-500 font-mono">
                        ({step.percentualExecutado}% Concluído)
                      </span>
                    </div>

                    {/* Track: full-duration bar positioned along the real timeline */}
                    <div className="col-span-8 relative h-5">
                      <div
                        className={`absolute top-0 h-full rounded-lg border overflow-hidden ${
                          step.status === 'Concluído'
                            ? 'border-emerald-500 bg-slate-800/60'
                            : step.status === 'Atrasado'
                              ? 'border-rose-500 bg-slate-800/60'
                              : step.status === 'Em Andamento'
                                ? 'border-blue-400 bg-slate-800/60'
                                : 'border-slate-600 bg-slate-800/60'
                        }`}
                        style={{ left: `${esquerda}%`, width: `${largura}%` }}
                        title={`${formatarDataBR(step.dataInicio)} a ${formatarDataBR(step.dataFim)}`}
                      >
                        <div
                          className={`h-full flex items-center justify-end px-1.5 select-none transition-all duration-300 ${
                            step.status === 'Concluído'
                              ? 'bg-emerald-600'
                              : step.status === 'Em Andamento'
                                ? 'bg-blue-500'
                                : step.status === 'Atrasado'
                                  ? 'bg-rose-600'
                                  : 'bg-slate-700'
                          }`}
                          style={{ width: `${step.percentualExecutado}%` }}
                        >
                          {step.percentualExecutado > 25 && (
                            <span className="text-xs font-mono font-bold text-slate-950 leading-none">
                              {step.percentualExecutado}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Stages list — progresso físico e status são somente leitura,
            derivados das medições (fix #1). A única forma de avançar
            uma etapa é registrar uma medição. */}
        <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs bg-white">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase text-xs">
                <tr>
                  <th scope="col" className="p-3">Etapa</th>
                  <th scope="col" className="p-3">Período</th>
                  <th scope="col" className="p-3">Encarregado</th>
                  <th scope="col" className="p-3">Status</th>
                  <th scope="col" className="p-3 text-center">Progresso Físico (%)</th>
                  <th scope="col" className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {etapas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-xs text-slate-500 italic">
                      Nenhuma etapa cadastrada.
                      {podeGerenciar ? ' Use "Nova Etapa" para montar o cronograma.' : ''}
                    </td>
                  </tr>
                )}
                {etapas.map((step) => {
                  const semOrcamento = !vinculos.some((v) => v.etapaId === step.id);
                  return (
                    <tr key={step.id} className="hover:bg-slate-50/40 transition">
                      <td className="p-3 font-bold text-slate-900">
                        {step.nome}
                        {semOrcamento && (
                          <span className="block text-2xs text-amber-600 font-semibold normal-case mt-0.5">
                            Sem orçamento vinculado
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-slate-500">
                        <div>
                          {formatarDataBR(step.dataInicio)} a {formatarDataBR(step.dataFim)}
                        </div>
                        <div className="text-2xs text-blue-600 font-bold font-mono mt-0.5">
                          {getWorkingDays(step.dataInicio, step.dataFim)} dias úteis
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-slate-800">
                          {nomeDoEncarregado(step.responsavelId)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-1 rounded font-bold text-2xs ${
                            step.status === 'Concluído'
                              ? 'bg-emerald-50 text-emerald-700'
                              : step.status === 'Em Andamento'
                                ? 'bg-blue-50 text-blue-700'
                                : step.status === 'Atrasado'
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {step.status}
                        </span>
                      </td>
                      <td className="p-3 text-center min-w-[160px]">
                        <div className="flex items-center justify-end gap-3">
                          <div className="w-full h-1.5 bg-slate-200 rounded-lg overflow-hidden">
                            <div
                              className="h-full bg-blue-600"
                              style={{ width: `${step.percentualExecutado}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-slate-900 w-10 text-right">
                            {step.percentualExecutado}%
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {podeGerenciar && (
                            <>
                              <button
                                id={`vincular-orcamento-etapa-${step.id}`}
                                onClick={() => setAlvoVinculo({ modo: 'etapa', etapaId: step.id })}
                                className="bg-slate-50 text-slate-600 hover:bg-slate-800 hover:text-white px-2 py-1 rounded font-bold text-2xs transition active:scale-95 border border-slate-200 cursor-pointer"
                              >
                                Vincular Orçamento
                              </button>
                              <button
                                id={`editar-etapa-${step.id}`}
                                onClick={() => setAlvoEtapa({ modo: 'edicao', etapa: step })}
                                title="Editar nome, prazo e encarregado"
                                className="text-slate-500 hover:text-blue-600 p-1 rounded transition active:scale-95"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                id={`excluir-etapa-${step.id}`}
                                onClick={() => removerEtapa(step)}
                                title="Excluir etapa"
                                className="text-slate-500 hover:text-rose-600 p-1 rounded transition active:scale-95"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                          {podeMedir && (
                            <button
                              id={`medir-etapa-rapido-${step.id}`}
                              disabled={medicaoBloqueada}
                              title={
                                medicaoBloqueada
                                  ? `Obra "${projeto.situacao}" — mude a situação para medir.`
                                  : undefined
                              }
                              onClick={() => setEtapaParaMedir(step.id)}
                              className="bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-2 py-1 rounded font-bold text-2xs transition active:scale-95 border border-blue-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-50 disabled:hover:text-blue-600"
                            >
                              Medir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ModalEtapa
        alvo={alvoEtapa}
        onFechar={() => setAlvoEtapa(null)}
        projeto={projeto}
        funcionarios={funcionarios}
        onCriar={onAddEtapa}
        onAtualizar={onUpdateEtapa}
      />

      <ModalVinculo
        alvo={alvoVinculo}
        onFechar={() => setAlvoVinculo(null)}
        etapas={etapas}
        itens={itens}
        vinculos={vinculos}
        pesoAlocadoPorItem={pesoAlocadoPorItem}
        onAdicionar={onAddVinculo}
        onRemover={onRemoveVinculo}
      />

      <ModalMedicao
        etapaInicial={etapaParaMedir}
        onFechar={() => setEtapaParaMedir(null)}
        projeto={projeto}
        etapas={etapas}
        onAdicionar={onAddMedicao}
        onMudarSituacao={onUpdateProjetoSituacao}
      />
    </div>
  );
}
