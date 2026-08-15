import { useState } from 'react';
import { AlertTriangle, Camera, Check, Clock3, X } from 'lucide-react';
import { MedicaoObra, NovaMedicao, Projeto } from '../../types';
import { dataLocal } from '../../lib/data';
import { formatBRL } from '../../lib/preco';
import { formatarQuantidade } from '../../lib/medicaoQuantidade';
import { formatarPercentual } from '../../lib/percentual';
import { avisoDoAvanco } from '../../lib/avanco';
import { FotoBoletim } from '../FotoBoletim';
import { useFeedback } from '../FeedbackContext';
import EmptyState from '../EmptyState';
import ModalMedicao from './ModalMedicao';
import ModalRejeitarMedicao from './ModalRejeitarMedicao';
import type { DadosDaObra } from './useDadosDaObra';
import { AnelProgresso, Aviso, Button, Card, Chip, GRADE_PAINEIS, SECAO_ESPACO, Secao, type TomChip } from '../ui';

/** O tom de cada estado do boletim — os mesmos três do resto do app. */
const TOM_MEDICAO: Record<MedicaoObra['status'], TomChip> = {
  Aprovada: 'positivo',
  Rejeitada: 'negativo',
  Pendente: 'atencao',
};

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
  const { etapas, folhas, medicoes, progressoFisico, avancoFisico, totalOrcado, totalExecutado } = dados;
  const avisoAvanco = avisoDoAvanco(avancoFisico);
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
        tone: 'normal',
        confirmLabel: 'Aprovar mesmo assim',
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
    /* O cabeçalho era um `<h4>` de 14px em CAIXA ALTA com o botão ao lado — a
       forma que o app reserva para RÓTULO (12px), aqui fazendo papel de título
       de seção. `<Secao>` é o primitivo que faz isso desde o redesenho de
       13/ago, e as quatro abas do console eram as últimas telas fora dele. */
    <div id="tab-pane-medicoes" className={`${SECAO_ESPACO} text-left`}>
      <Secao
        titulo="Histórico de medições periódicas"
        descricao="Boletins técnicos de aferição física emitidos diretamente no canteiro de obras."
        acoes={
          podeMedir && (
            <Button
              id="console-add-medicao-btn"
              disabled={medicaoBloqueada}
              title={
                medicaoBloqueada
                  ? `Obra "${projeto.situacao}" — mude a situação para medir.`
                  : undefined
              }
              onClick={() => setNovaMedicao('')}
            >
              <Camera size={14} />
              <span>Medir atividade</span>
            </Button>
          )
        }
      >
        <div className="space-y-4">

      {/* OS DOIS ANÉIS.
          Eram dois discos escritos à mão — `rounded-full border-4` com o
          percentual dentro —, e um deles com `border-emerald-500`, tom que a
          tabela de `PREENCHIMENTO` reprova (2,47:1). Um disco de borda cheia
          também não é um anel de progresso: mostra o número, não o QUANTO.
          `<AnelProgresso>` desenha a fatia, e é exatamente onde o DESIGN.md
          manda usá-lo — "percentual de execução financeira, avanço de obra". */}
      <div className={GRADE_PAINEIS.lista}>
        <Card>
          <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">
            Curva física de medição
          </span>
          <div className="flex items-center gap-4 mt-3">
            <AnelProgresso percentual={progressoFisico} tamanho={68} tom="acao" />
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs font-bold text-slate-900">Avanço físico geral</p>
              {/*
                A legenda era fixa em "média geral ponderada das etapas" e isso
                só é verdade quando existe vínculo etapa↔orçamento. Sem nenhum,
                a conta cai para média simples e o número passa a significar
                outra coisa com a mesma cara (§2.2, fricção 6).
              */}
              <p className="text-2xs text-slate-500 leading-normal">
                {avancoFisico.ponderado
                  ? 'Média das etapas ponderada pelo orçamento vinculado a cada uma.'
                  : 'Média simples das etapas: todas pesam igual.'}
              </p>
            </div>
          </div>
          {avisoAvanco && (
            <Aviso tom="atencao" icone={<AlertTriangle size={13} />} className="mt-3">
              <span className="text-2xs leading-relaxed">{avisoAvanco}</span>
            </Aviso>
          )}
        </Card>

        <Card>
          <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">
            Acumulado financeiro medido
          </span>
          <div className="flex items-center gap-4 mt-3">
            <AnelProgresso
              percentual={totalOrcado > 0 ? (totalExecutado / totalOrcado) * 100 : 0}
              tamanho={68}
              tom="positivo"
            />
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs font-bold text-slate-900">Faturamento físico-financeiro</p>
              <p className="data-font text-sm font-bold text-slate-900">
                {formatBRL(totalExecutado)}
              </p>
              <p className="text-2xs text-slate-500">medidos de {formatBRL(totalOrcado)} orçados</p>
            </div>
          </div>
        </Card>
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
            const IconeStatus =
              med.status === 'Aprovada' ? Check : med.status === 'Rejeitada' ? X : Clock3;
            const ocupada = ocupadaId === med.id;
            return (
              <Card
                key={med.id}
                className={`flex gap-4 ${med.status === 'Rejeitada' ? 'opacity-70' : ''}`}
              >
                {/* O bloco de data. Continua tingido — é a única âncora visual
                    de uma lista de boletins, e a data é o que se procura ao
                    varrê-la — mas troca o azul de AÇÃO pela camada tonal:
                    numa pilha de dez boletins eram dez blocos azuis que não
                    levam a lugar nenhum. */}
                <div className="h-12 w-12 rounded-xl bg-slate-100 flex flex-col items-center justify-center shrink-0">
                  <span className="data-font text-xs font-bold text-slate-900 leading-none">
                    {data ? data.getDate() : '—'}
                  </span>
                  <span className="text-2xs font-semibold text-slate-500 uppercase">
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
                      <Chip tom={TOM_MEDICAO[med.status]} className="px-2 py-0.5">
                        <IconeStatus size={10} /> {med.status}
                      </Chip>
                      {med.status === 'Aprovada' && (
                        <span className="data-font text-xs font-bold text-slate-900">
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
                      <span className="text-amber-700 font-semibold"> · aguardando aprovação</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-700 italic bg-slate-50 p-2 rounded-xl">
                    "{med.observacoes}"
                  </p>

                  {med.status === 'Rejeitada' && (
                    <Aviso tom="negativo">
                      <strong className="font-bold">Motivo da recusa:</strong>{' '}
                      {med.motivoRejeicao ?? (
                        <span className="italic">
                          não registrado — esta rejeição é anterior ao campo de motivo.
                        </span>
                      )}
                    </Aviso>
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
                    /* Aprovar era verde e rejeitar tinha borda rosa: a cor do
                       RESULTADO no controle que ainda vai produzi-lo. Aprovar
                       é a ação principal da linha (primário); rejeitar abre um
                       diálogo que pede motivo — não apaga nada, então também
                       não é `perigo`. */
                    <div className="flex gap-2 pt-1.5">
                      <Button tamanho="sm" carregando={ocupada} onClick={() => aprovar(med.id)}>
                        {!ocupada && <Check size={12} />} Aprovar
                      </Button>
                      <Button
                        variante="secundario"
                        tamanho="sm"
                        disabled={ocupada}
                        onClick={() => setParaRejeitar(med)}
                      >
                        <X size={12} /> Rejeitar
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
        </div>
      </Secao>

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
