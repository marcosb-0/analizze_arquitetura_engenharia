import { memo, useEffect, useMemo, useState } from 'react';
import {
  ClausulaContrato, Cliente, Contrato, EmpresaConfig, ModeloTexto, NovoContrato, Projeto,
  StatusContrato,
} from '../types';
import { EMPRESA_FALLBACK } from '../constants/empresa';
import { useFeedback } from './FeedbackContext';
import ListaContratos from './contratos/ListaContratos';
import DetalheContrato from './contratos/DetalheContrato';
import ModalContrato from './contratos/ModalContrato';

interface ContratosTabProps {
  contratos: Contrato[];
  clausulas: ClausulaContrato[];
  modelos: ModeloTexto[];
  clientes: Cliente[];
  /** Só para nomear a obra que executa o contrato. */
  projetos: Projeto[];
  /** Papel timbrado do documento impresso. Null enquanto não carregou. */
  empresa: EmpresaConfig | null;
  loading: boolean;
  carregandoDetalhe: string | null;
  carregarClausulas: (contratoId: string) => void;
  onAddContrato: (novo: NovoContrato) => Promise<Contrato | null>;
  onUpdateContrato: (id: string, patch: Partial<NovoContrato>) => Promise<boolean>;
  onMudarStatus: (id: string, status: StatusContrato, dataAssinatura?: string) => Promise<boolean>;
  onDeleteContrato: (id: string) => Promise<boolean>;
  onAbrirObra: (projetoId: string) => void;
  /** Os handlers das cláusulas, agrupados — atravessam a aba sem serem lidos aqui. */
  clausulasProps: Parameters<typeof DetalheContrato>[0]['clausulasProps'];
}

/**
 * A aba Contratos. Mesma geometria da de Propostas: lista à esquerda, detalhe à
 * direita, uma seleção por vez.
 *
 * Aba própria, e não uma sub-seção da proposta, porque contrato avulso existe —
 * um contrato sem proposta não teria onde morar numa tela organizada por
 * proposta, e a lista de contratos (com seus quatro estados) é a pergunta
 * "o que está assinado?", que nenhuma tela respondia.
 */
function ContratosTab({
  contratos,
  clausulas,
  modelos,
  clientes,
  projetos,
  empresa,
  loading,
  carregandoDetalhe,
  carregarClausulas,
  onAddContrato,
  onUpdateContrato,
  onMudarStatus,
  onDeleteContrato,
  onAbrirObra,
  clausulasProps,
}: ContratosTabProps) {
  const { toast } = useFeedback();
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState(false);

  const selecionado = useMemo(
    () => contratos.find((c) => c.id === selecionadoId) ?? contratos[0],
    [contratos, selecionadoId]
  );

  // Mesma forma de PropostasTab: o efeito depende só do id, e nunca do array
  // nem da função do hook de dados — qualquer um dos dois faria a busca
  // disparar em loop. A idempotência mora na ref do próprio hook.
  const idAberto = selecionado?.id;
  useEffect(() => {
    if (idAberto) carregarClausulas(idAberto);
  }, [idAberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const clausulasDoContrato = useMemo(
    () => (selecionado ? clausulas.filter((c) => c.contratoId === selecionado.id) : []),
    [clausulas, selecionado]
  );

  const timbre = empresa ?? EMPRESA_FALLBACK;
  const detalheCarregando = !!selecionado && carregandoDetalhe === selecionado.id;

  const excluir = async () => {
    if (!selecionado) return;
    if (!confirm(`Excluir o contrato ${selecionado.numero}? Esta ação não pode ser desfeita.`)) {
      return;
    }
    const ok = await onDeleteContrato(selecionado.id);
    if (ok) {
      setSelecionadoId(null);
      toast.success('Contrato excluído.');
    }
  };

  return (
    <div id="contratos-tab" className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full min-h-0">
      <ListaContratos
        contratos={contratos}
        clientes={clientes}
        loading={loading}
        selecionadoId={selecionado?.id}
        onSelecionar={setSelecionadoId}
        onNovo={() => setNovo(true)}
      />

      <div
        id="contrato-detail-col"
        className="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden"
      >
        {selecionado ? (
          <DetalheContrato
            // Trocar de contrato remonta o painel: o documento impresso é
            // estado DAQUELE contrato, não da tela.
            key={selecionado.id}
            contrato={selecionado}
            clausulas={clausulasDoContrato}
            modelos={modelos}
            cliente={clientes.find((c) => c.id === selecionado.clienteId)}
            obra={projetos.find((p) => p.id === selecionado.projetoId)}
            timbre={timbre}
            carregando={detalheCarregando}
            onMudarStatus={onMudarStatus}
            onEditar={() => setEditando(true)}
            onExcluir={() => void excluir()}
            onAbrirObra={onAbrirObra}
            clausulasProps={clausulasProps}
          />
        ) : (
          !loading && (
            <div className="flex-1 flex items-center justify-center p-8 text-center">
              <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                Selecione um contrato à esquerda, ou gere um a partir de uma proposta aprovada no
                painel dela.
              </p>
            </div>
          )
        )}
      </div>

      <ModalContrato
        aberto={novo}
        onFechar={() => setNovo(false)}
        clientes={clientes}
        onSalvar={async (patch) => {
          const criado = await onAddContrato(patch);
          if (criado) {
            setSelecionadoId(criado.id);
            toast.success(`Contrato ${criado.numero} criado.`, 'Nasceu com as cláusulas padrão.');
          }
          return criado;
        }}
      />

      {selecionado && (
        <ModalContrato
          aberto={editando}
          onFechar={() => setEditando(false)}
          clientes={clientes}
          contrato={selecionado}
          onSalvar={async (patch) => {
            const ok = await onUpdateContrato(selecionado.id, patch);
            if (ok) toast.success('Contrato salvo.');
            return ok || null;
          }}
        />
      )}
    </div>
  );
}

export default memo(ContratosTab);
