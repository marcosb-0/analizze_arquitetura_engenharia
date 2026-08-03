import { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import {
  Proposta,
  NovaProposta,
  Cliente,
  Funcionario,
  Projeto,
  ConversaoObraPayload,
  ItemProposta,
  InsumoCatalogo,
  Fornecedor,
  AjustePreco,
  EmpresaConfig,
} from '../types';
import { NovoItemProposta } from '../services/itensPropostaService';
import { FiltroCatalogo } from '../services/catalogoService';
import { EMPRESA_FALLBACK } from '../constants/empresa';
import { useFeedback } from './FeedbackContext';
import ConverterObraWizard from './ConverterObraWizard';
import ListaPropostas from './propostas/ListaPropostas';
import DetalheProposta from './propostas/DetalheProposta';
import ModalNovaProposta from './propostas/ModalNovaProposta';
import ModalEditarProposta, { EdicaoProposta } from './propostas/ModalEditarProposta';
import ModalRejeicao from './propostas/ModalRejeicao';
import ModalAprovacao from './propostas/ModalAprovacao';

export type { EdicaoProposta };

interface PropostasTabProps {
  propostas: Proposta[];
  itensProposta: ItemProposta[];
  loading: boolean;
  /** Id da proposta cujo orçamento está sendo buscado, se houver. */
  carregandoDetalhe: string | null;
  carregarDetalheProposta: (propostaId: string) => void;
  clientes: Cliente[];
  funcionarios: Funcionario[];
  /** Só para saber quais propostas já viraram obra — essas ficam congeladas. */
  projetos: Projeto[];
  catalogo: InsumoCatalogo[];
  fornecedores: Fornecedor[];
  /** Papel timbrado do documento impresso. Null enquanto não carregou. */
  empresa: EmpresaConfig | null;
  aplicarFiltroCatalogo: (patch: Partial<FiltroCatalogo>) => void;
  onAddProposta: (prop: NovaProposta) => Promise<Proposta | null>;
  onUpdateProposta: (id: string, patch: EdicaoProposta) => Promise<boolean>;
  onDuplicarProposta: (id: string, descricao?: string) => Promise<Proposta | null>;
  onUpdateStatus: (id: string, status: Proposta['status'], motivoRejeicao?: string) => Promise<boolean>;
  /** Abre a obra gerada por esta proposta na aba de projetos. */
  onAbrirObra: (projetoId: string) => void;
  onUpdateBdi: (id: string, bdi: number) => Promise<void>;
  onUpdateBdiVisivelPdf: (id: string, visivel: boolean) => Promise<void>;
  onAddRevision: (id: string, alteracoes: string, valor?: number) => Promise<boolean>;
  onConvertToProject: (prop: Proposta, payload: ConversaoObraPayload) => Promise<string | null>;
  onDeleteProposta: (id: string) => Promise<boolean>;
  onAddItemProposta: (novo: NovoItemProposta) => Promise<ItemProposta | null>;
  onAjustarItemProposta: (id: string, ajuste: AjustePreco) => Promise<ItemProposta | null>;
  onAjustarQuantidadeItemProposta: (id: string, quantidade: number) => Promise<ItemProposta | null>;
  onRemoveItemProposta: (id: string) => Promise<void>;
}

/**
 * A aba comercial: carteira de propostas à esquerda, proposta selecionada à
 * direita, e os diálogos que atravessam as duas.
 *
 * Este arquivo era um componente único de 2.137 linhas com 31 `useState`
 * (§3.2 da auditoria). Hoje ele guarda só o que é mesmo compartilhado — qual
 * proposta está aberta e quais diálogos globais estão em cena. Filtros vivem na
 * lista, o documento impresso e a revisão vivem no detalhe, e cada formulário
 * de diálogo é um componente montado apenas enquanto o diálogo está aberto.
 */
export default function PropostasTab({
  propostas,
  itensProposta,
  loading,
  carregandoDetalhe,
  carregarDetalheProposta,
  clientes,
  funcionarios,
  projetos,
  catalogo,
  fornecedores,
  empresa,
  aplicarFiltroCatalogo,
  onAddProposta,
  onUpdateProposta,
  onDuplicarProposta,
  onUpdateStatus,
  onAbrirObra,
  onUpdateBdi,
  onUpdateBdiVisivelPdf,
  onAddRevision,
  onConvertToProject,
  onDeleteProposta,
  onAddItemProposta,
  onAjustarItemProposta,
  onAjustarQuantidadeItemProposta,
  onRemoveItemProposta,
}: PropostasTabProps) {
  const { toast, confirm } = useFeedback();
  // O documento precisa de um cabeçalho mesmo antes de a configuração chegar;
  // o fallback é neutro de propósito, para ninguém imprimir dados de outra
  // empresa por engano.
  const timbre = empresa ?? EMPRESA_FALLBACK;

  /**
   * A seleção é um ID, e a proposta sai dele a cada render.
   *
   * Guardar o objeto exigia um efeito para reapontá-lo toda vez que o servidor
   * recalculasse os totais — sem ele, o painel continuava mostrando a cópia
   * congelada no instante do clique. Derivar dispensa o efeito e mantém a
   * mesma regra: `null` enquanto nada foi escolhido cai na primeira da lista, e
   * um ID que não existe mais (proposta excluída aqui ou em outra sessão)
   * volta para a tela vazia.
   */
  const [idSelecionado, setIdSelecionado] = useState<string | null>(null);
  const selecionada =
    idSelecionado === null
      ? (propostas[0] ?? null)
      : (propostas.find((p) => p.id === idSelecionado) ?? null);

  const [novaProposta, setNovaProposta] = useState(false);
  const [propostaEmEdicao, setPropostaEmEdicao] = useState<Proposta | null>(null);
  const [rejeitando, setRejeitando] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const [propostaParaAprovar, setPropostaParaAprovar] = useState<Proposta | null>(null);
  const [propostaParaConverter, setPropostaParaConverter] = useState<Proposta | null>(null);

  /**
   * O orçamento e os snapshots das revisões chegam quando a proposta é aberta.
   *
   * A dependência é só o ID: `selecionada` é um objeto novo a cada recálculo de
   * total no servidor, e `carregarDetalheProposta` é recriada a cada render do
   * hook de dados — qualquer uma das duas no array faria a busca disparar em
   * loop. O próprio serviço já guarda os ids buscados numa ref.
   */
  const idAberto = selecionada?.id;
  useEffect(() => {
    if (idAberto) carregarDetalheProposta(idAberto);
  }, [idAberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const itensDaProposta = useMemo(
    () => (selecionada ? itensProposta.filter((i) => i.propostaId === selecionada.id) : []),
    [itensProposta, selecionada]
  );

  const obraDaProposta = useMemo(
    () => (selecionada ? projetos.find((p) => p.propostaId === selecionada.id) : undefined),
    [projetos, selecionada]
  );

  // Sem isto a proposta apareceria como "sem itens" durante a busca — e o
  // usuário poderia registrar uma revisão congelando um orçamento vazio.
  const detalheCarregando = !!selecionada && carregandoDetalhe === selecionada.id;

  const mudarStatus = async (status: Proposta['status']) => {
    if (!selecionada) return;
    if (obraDaProposta) {
      toast.error('Proposta já convertida em obra.', 'O status não pode mais ser alterado.');
      return;
    }
    if (status === 'Aprovada') {
      setPropostaParaAprovar(selecionada);
      return;
    }
    // Recusa sem motivo registrado é a informação mais cara do ciclo indo
    // embora — preço, prazo, escopo ou concorrente.
    if (status === 'Rejeitada') {
      setRejeitando(true);
      return;
    }
    const ok = await onUpdateStatus(selecionada.id, status);
    if (ok) toast.success(`Proposta atualizada para "${status}".`);
  };

  const duplicar = async () => {
    if (!selecionada) return;
    setDuplicando(true);
    const copia = await onDuplicarProposta(selecionada.id);
    setDuplicando(false);
    if (!copia) return;
    setIdSelecionado(copia.id);
    // A cópia herda escopo e orçamento da origem, mas nasce sem validade e
    // quase sempre precisa de outra descrição. Abrir a edição na sequência
    // poupa o passo de procurar onde mudar isso — antes não havia caminho
    // nenhum para editar a proposta duplicada. O diálogo recebe a CÓPIA por
    // valor, então não há corrida com a seleção que acabou de mudar.
    setPropostaEmEdicao(copia);
    toast.success(
      `Proposta ${copia.numero} criada a partir da ${selecionada.numero}.`,
      'O orçamento foi copiado. Ajuste os dados e defina a nova validade antes de enviar.'
    );
  };

  const excluir = () => {
    if (!selecionada) return;
    const alvo = selecionada;
    if (obraDaProposta) {
      toast.error(
        'Proposta já convertida em obra.',
        `A obra "${obraDaProposta.nome}" depende desta proposta e o banco recusa a exclusão.`
      );
      return;
    }
    confirm({
      title: 'Confirmar exclusão de proposta',
      message: `Tem certeza de que deseja remover a proposta ${alvo.numero}? Esta operação não pode ser desfeita e o histórico de revisões será apagado. Propostas já convertidas em obra não podem ser excluídas.`,
      onConfirm: async () => {
        const ok = await onDeleteProposta(alvo.id);
        if (!ok) return;
        setIdSelecionado(propostas.find((p) => p.id !== alvo.id)?.id ?? null);
        toast.success('Proposta removida.');
      },
    });
  };

  return (
    <div
      id="propostas-tab-container"
      className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:h-[calc(100vh-120px)]"
    >
      <ListaPropostas
        propostas={propostas}
        clientes={clientes}
        loading={loading}
        selecionadaId={selecionada?.id}
        onSelecionar={(p) => setIdSelecionado(p.id)}
        onNova={() => setNovaProposta(true)}
      />

      <div
        id="proposta-detail-col"
        className="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden"
      >
        {selecionada ? (
          <DetalheProposta
            // Trocar de proposta remonta o painel: o documento impresso e o
            // diálogo de revisão são estado DAQUELA proposta, não da tela.
            key={selecionada.id}
            proposta={selecionada}
            itens={itensDaProposta}
            cliente={clientes.find((c) => c.id === selecionada.clienteId)}
            catalogo={catalogo}
            fornecedores={fornecedores}
            timbre={timbre}
            obra={obraDaProposta}
            carregando={detalheCarregando}
            duplicando={duplicando}
            aplicarFiltroCatalogo={aplicarFiltroCatalogo}
            onMudarStatus={mudarStatus}
            onEditar={() => setPropostaEmEdicao(selecionada)}
            onDuplicar={duplicar}
            onExcluir={excluir}
            onAbrirObra={onAbrirObra}
            onIniciarConversao={() => setPropostaParaConverter(selecionada)}
            onAddRevision={onAddRevision}
            onUpdateBdi={onUpdateBdi}
            onUpdateBdiVisivelPdf={onUpdateBdiVisivelPdf}
            onAddItem={onAddItemProposta}
            onAjustarItem={onAjustarItemProposta}
            onAjustarQuantidade={onAjustarQuantidadeItemProposta}
            onRemoveItem={onRemoveItemProposta}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            <FileText size={48} className="stroke-1 mb-2 animate-pulse" />
            <p className="text-xs">Selecione uma proposta para visualizar as opções.</p>
          </div>
        )}
      </div>

      <ModalNovaProposta
        aberto={novaProposta}
        onFechar={() => setNovaProposta(false)}
        clientes={clientes}
        onCriar={onAddProposta}
        onCriada={(criada) => setIdSelecionado(criada.id)}
      />

      <ModalEditarProposta
        proposta={propostaEmEdicao}
        onFechar={() => setPropostaEmEdicao(null)}
        clientes={clientes}
        temItens={itensDaProposta.length > 0}
        onSalvar={onUpdateProposta}
      />

      {selecionada && (
        <ModalRejeicao
          aberto={rejeitando}
          onFechar={() => setRejeitando(false)}
          proposta={selecionada}
          onRejeitar={(id, motivo) => onUpdateStatus(id, 'Rejeitada', motivo)}
        />
      )}

      <ModalAprovacao
        proposta={propostaParaAprovar}
        onFechar={() => setPropostaParaAprovar(null)}
        onAprovar={onUpdateStatus}
        onConverter={setPropostaParaConverter}
      />

      {/* Assistente de conversão — revisa orçamento e cronograma antes de criar a obra */}
      {propostaParaConverter && (
        <ConverterObraWizard
          proposta={propostaParaConverter}
          itensProposta={itensProposta.filter((i) => i.propostaId === propostaParaConverter.id)}
          cliente={clientes.find((c) => c.id === propostaParaConverter.clienteId)}
          funcionarios={funcionarios.filter((f) => f.status === 'Ativo')}
          onCancel={() => setPropostaParaConverter(null)}
          onConfirm={async (payload) => {
            const novoId = await onConvertToProject(propostaParaConverter, payload);
            if (novoId) setPropostaParaConverter(null);
            return !!novoId;
          }}
        />
      )}
    </div>
  );
}
