import { useState } from 'react';
import { Camera, Check, Clock3, X } from 'lucide-react';
import { MedicaoObra, NovaMedicao, Projeto } from '../../types';
import { dataLocal } from '../../lib/data';
import { formatBRL } from '../../lib/preco';
import { formatarQuantidade } from '../../lib/medicaoQuantidade';
import { formatarPercentual } from '../../lib/percentual';
import { FotoBoletim } from '../FotoBoletim';
import { useFeedback } from '../FeedbackContext';
import EmptyState from '../EmptyState';
import Spinner from '../Spinner';
import ModalMedicao from './ModalMedicao';
import ModalRejeitarMedicao from './ModalRejeitarMedicao';
import type { DadosDaObra } from './useDadosDaObra';
import { Button } from '../ui';

interface Props {
  projeto: Projeto;
  dados: DadosDaObra;
  podeMedir: boolean;
  /** Quem pode aprovar/rejeitar boletins (o guard real está no banco). */
  podeAprovar: boolean;
  medicaoBloqueada: boolean;
  onAddMedicao: (med: NovaMedicao, fotos: File[]) => Promise<MedicaoObra | null>;
  onUpdateProjetoSituacao: (projId: string, situacao: Projeto['situacao']) => Promise<boolean>;
  onAprovarMedicao: (medicaoId: string, permitirOverrun?: boolean) => Promise<'ok' | 'overrun' | 'error'>;
  onRejeitarMedicao: (medicaoId: string, motivo: string) => Promise<boolean>;
  /** URL temporária da foto do boletim — o bucket de medição é privado. */
  onFotoUrl: (storagePath: string) => Promise<string | null>;
}

export default function AbaMedicoes({
  projeto,
  dados,
  podeMedir,
  podeAprovar,
  medicaoBloqueada,
  onAddMedicao,
  onUpdateProjetoSituacao,
  onAprovarMedicao,
  onRejeitarMedicao,
  onFotoUrl,
}: Props) {
  const { toast, confirm } = useFeedback();
  const { etapas, folhas, medicoes, progressoFisico, totalOrcado, totalExecutado } = dados;
  // Marco é uma data, não uma frente de trabalho: não há o que medir nele.
  const mensuraveis = folhas.filter((e) => !e.ehMarco);

  const [ocupadaId, setOcupadaId] = useState<string | null>(null);
  const [novaMedicao, setNovaMedicao] = useState<string | null>(null);
  const [paraRejeitar, setParaRejeitar] = useState<MedicaoObra | null>(null);

  const aprovar = async (medicaoId: string) => {
    setOcupadaId(medicaoId);
    const resultado = await onAprovarMedicao(medicaoId, false);
    if (resultado === 'overrun') {
      setOcupadaId(null);
      confirm({
        title: 'Acumulado acima de 100%',
        message:
          'Aprovar esta medição faz o avanço da etapa ultrapassar 100%. Deseja aprovar mesmo assim?',
        onConfirm: async () => {
          setOcupadaId(medicaoId);
          const forcada = await onAprovarMedicao(medicaoId, true);
          if (forcada === 'ok') toast.success('Medição aprovada (com override de 100%).');
          setOcupadaId(null);
        },
      });
      return;
    }
    if (resultado === 'ok') {
      toast.success('Medição aprovada.', 'O valor foi aplicado ao orçamento da obra.');
    }
    setOcupadaId(null);
  };

  const rejeitar = async (motivo: string) => {
    if (!paraRejeitar) return;
    setOcupadaId(paraRejeitar.id);
    const feito = await onRejeitarMedicao(paraRejeitar.id, motivo);
    setOcupadaId(null);
    if (!feito) return;
    setParaRejeitar(null);
    toast.success('Medição rejeitada.', 'O motivo ficou registrado no boletim.');
  };

  return (
    <div id="tab-pane-medicoes" className="space-y-4 text-left">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
            Histórico de Medições Periódicas
          </h4>
          <p className="text-xs text-slate-500 font-medium">
            Boletins técnicos de aferição física emitidos diretamente no canteiro de obras.
          </p>
        </div>
        {podeMedir && (
          <Button
            id="console-add-medicao-btn"
            disabled={medicaoBloqueada}
            title={
              medicaoBloqueada ? `Obra "${projeto.situacao}" — mude a situação para medir.` : undefined
            }
            onClick={() => setNovaMedicao('')} className="disabled:active:scale-100"
          >
            <Camera size={14} />
            <span>Medir Atividade</span>
          </Button>
        )}
      </div>

      {/* Custom Physical & Financial charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-left">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Curva Física de Medição
          </span>
          <div className="flex items-center gap-4 mt-3">
            <div className="h-14 w-14 rounded-full bg-blue-50 border-4 border-blue-600 flex flex-col items-center justify-center font-bold text-slate-800 text-xs shrink-0">
              {progressoFisico}%
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-slate-900">Avanço Físico Geral</p>
              <p className="text-xs text-slate-500 leading-normal">
                Média geral ponderada das etapas em andamento.
              </p>
            </div>
          </div>
        </div>

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-left">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Acumulado Financeiro Medido
          </span>
          <div className="flex items-center gap-4 mt-3">
            <div className="h-14 w-14 rounded-full bg-emerald-50 border-4 border-emerald-500 flex flex-col items-center justify-center font-bold text-emerald-800 text-xs shrink-0">
              {totalOrcado > 0 ? ((totalExecutado / totalOrcado) * 100).toFixed(0) : 0}%
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-slate-900">Faturamento Físico-Financeiro</p>
              <p className="text-xs text-slate-500 leading-normal font-mono font-semibold text-emerald-600">
                {formatBRL(totalExecutado)} medidos
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Log list of old measurements */}
      {medicoes.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="Sem medições lançadas"
          description="Registre as vistorias técnicas periódicas para acompanhar o progresso real."
          actionLabel={podeMedir && !medicaoBloqueada ? 'Registrar Vistoria' : undefined}
          onAction={podeMedir && !medicaoBloqueada ? () => setNovaMedicao('') : undefined}
        />
      ) : (
        <div className="space-y-2">
          {medicoes.map((med) => {
            const etapa = etapas.find((s) => s.id === med.etapaId);
            // `data_medicao` é uma coluna `date`: sem o parse local o
            // selo do boletim mostrava o dia anterior ao medido.
            const data = dataLocal(med.dataMedicao);
            const estilo =
              med.status === 'Aprovada'
                ? { wrap: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: Check }
                : med.status === 'Rejeitada'
                  ? { wrap: 'text-rose-700 bg-rose-50 border-rose-200', icon: X }
                  : { wrap: 'text-amber-700 bg-amber-50 border-amber-200', icon: Clock3 };
            const IconeStatus = estilo.icon;
            const ocupada = ocupadaId === med.id;
            return (
              <div
                key={med.id}
                className={`p-3 bg-white border shadow-sm rounded-lg flex gap-4 ${med.status === 'Rejeitada' ? 'border-slate-200 opacity-70' : 'border-slate-200'}`}
              >
                <div className="h-12 w-12 rounded-lg bg-blue-50 flex flex-col items-center justify-center border border-blue-200 shrink-0 font-bold">
                  <span className="text-xs text-blue-800 leading-none">
                    {data ? data.getDate() : '—'}
                  </span>
                  <span className="text-xs text-blue-700 font-mono uppercase">
                    {data ? data.toLocaleString('pt-BR', { month: 'short' }).slice(0, 3) : ''}
                  </span>
                </div>

                <div className="flex-1 min-w-0 text-left space-y-1.5">
                  <div className="flex justify-between items-start gap-2">
                    <h5 className="font-bold text-xs text-slate-900">
                      Boletim Medição:{' '}
                      <strong className="text-blue-600">{etapa ? etapa.nome : 'Geral'}</strong>
                    </h5>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 text-2xs font-bold px-1.5 py-0.5 rounded-full border ${estilo.wrap}`}
                      >
                        <IconeStatus size={10} /> {med.status}
                      </span>
                      {med.status === 'Aprovada' && (
                        <span className="text-xs font-bold font-mono text-emerald-600">
                          {formatBRL(med.valorMedido)}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Evolução física aferida:{' '}
                    {med.quantidadeMedida !== undefined ? (
                      <>
                        <strong className="text-slate-800">
                          +{formatarQuantidade(med.quantidadeMedida, etapa?.unidade)}
                        </strong>
                        <span> · +{formatarPercentual(med.percentualMedido)} da etapa</span>
                      </>
                    ) : (
                      <strong className="text-slate-800">+{formatarPercentual(med.percentualMedido)}</strong>
                    )}
                    {med.status === 'Pendente' && (
                      <span className="text-amber-600 font-semibold"> · aguardando aprovação</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-700 italic bg-slate-50 p-2 rounded-lg">
                    "{med.observacoes}"
                  </p>

                  {med.status === 'Rejeitada' && (
                    <p className="text-xs bg-rose-50 border border-rose-100 text-rose-800 p-2 rounded-lg leading-relaxed">
                      <strong className="font-bold">Motivo da recusa:</strong>{' '}
                      {med.motivoRejeicao ?? (
                        <span className="italic text-rose-700/80">
                          não registrado — esta rejeição é anterior ao campo de motivo.
                        </span>
                      )}
                    </p>
                  )}

                  {/* Registro fotográfico — miniaturas clicáveis */}
                  {med.fotos.length > 0 && (
                    <div className="flex gap-2 pt-1 flex-wrap">
                      {med.fotos.map((foto) => (
                        <FotoBoletim key={foto.storagePath} foto={foto} onUrl={onFotoUrl} />
                      ))}
                    </div>
                  )}

                  {/* Aprovação (admin/gestão) — só para medições pendentes */}
                  {podeAprovar && med.status === 'Pendente' && (
                    <div className="flex gap-2 pt-1.5">
                      <button
                        onClick={() => aprovar(med.id)}
                        disabled={ocupada}
                        className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-2xs font-bold px-2.5 py-1 rounded-lg transition disabled:opacity-50"
                      >
                        {ocupada ? <Spinner size={12} /> : <Check size={12} />} Aprovar
                      </button>
                      <button
                        onClick={() => setParaRejeitar(med)}
                        disabled={ocupada}
                        className="flex items-center gap-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-2xs font-bold px-2.5 py-1 rounded-lg transition disabled:opacity-50"
                      >
                        <X size={12} /> Rejeitar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* `mensuraveis` e não `etapas`: um grupo da EAP seria recusado por
          `trg_medicao_so_em_folha` só no submit — e, desde a medição por
          unidade, cairia no modo percentual pelo caminho errado, porque grupo
          nunca tem meta. `AbaCronograma` já passava só folhas; esta tela não. */}
      <ModalMedicao
        etapaInicial={novaMedicao}
        onFechar={() => setNovaMedicao(null)}
        projeto={projeto}
        etapas={mensuraveis}
        medicoes={medicoes}
        onAdicionar={onAddMedicao}
        onMudarSituacao={onUpdateProjetoSituacao}
      />

      <ModalRejeitarMedicao
        medicao={paraRejeitar}
        nomeEtapa={etapas.find((s) => s.id === paraRejeitar?.etapaId)?.nome}
        onFechar={() => setParaRejeitar(null)}
        ocupado={!!ocupadaId}
        onConfirmar={rejeitar}
      />
    </div>
  );
}
